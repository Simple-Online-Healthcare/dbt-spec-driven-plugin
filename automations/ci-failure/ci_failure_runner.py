"""
CI Failure Automation Runner

Lightweight webhook server that receives dbt Cloud 'job.run.errored' events
and invokes the ci-failure-responder skill via the Cortex Code Agent SDK.

Usage:
    DBT_PROJECT_DIR=/path/to/dbt-project python automations/ci_failure_runner.py

Environment variables:
    DBT_PROJECT_DIR         (required) Absolute path to the dbt project root
    PLUGIN_DIR              Path to the dbt-spec-driven plugin directory
                            (default: ~/.snowflake/cortex/plugins/dbt-spec-driven)
    SNOWFLAKE_CONNECTION    Snowflake CLI connection name (default: CLI default)
    DBT_CLOUD_WEBHOOK_SECRET  HMAC secret for webhook signature verification
    JOB_NAME_PATTERN        Regex to filter job names
                            (default: dbt_(daily|30min|hourly).*)
    PORT                    HTTP port (default: 8090)
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import re
import sys
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("ci-failure-runner")

# ---------------------------------------------------------------------------
# Configuration from environment
# ---------------------------------------------------------------------------

DBT_PROJECT_DIR = os.environ.get("DBT_PROJECT_DIR", "")
PLUGIN_DIR = os.environ.get(
    "PLUGIN_DIR",
    str(Path.home() / ".snowflake" / "cortex" / "plugins" / "dbt-spec-driven"),
)
SNOWFLAKE_CONNECTION = os.environ.get("SNOWFLAKE_CONNECTION")
WEBHOOK_SECRET = os.environ.get("DBT_CLOUD_WEBHOOK_SECRET")
JOB_NAME_PATTERN = re.compile(
    os.environ.get("JOB_NAME_PATTERN", r"dbt_(daily|30min|hourly).*")
)
PORT = int(os.environ.get("PORT", "8090"))


def verify_signature(payload_body: bytes, signature_header: str) -> bool:
    """Verify dbt Cloud HMAC-SHA256 webhook signature."""
    if not WEBHOOK_SECRET:
        return True  # skip verification when no secret configured
    expected = hmac.new(
        WEBHOOK_SECRET.encode(), payload_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def invoke_skill(payload_json: str) -> None:
    """Run the ci-failure-responder skill in a background thread via the SDK."""
    try:
        asyncio.run(_invoke_skill_async(payload_json))
    except Exception:
        log.exception("CoCo session failed")


async def _invoke_skill_async(payload_json: str) -> None:
    from cortex_code_agent_sdk import (
        query,
        CortexCodeAgentOptions,
        AssistantMessage,
        ResultMessage,
    )

    prompt = (
        "/dbt-spec-driven:ci-failure-responder\n\n"
        "Webhook payload (job.run.errored):\n"
        f"```json\n{payload_json}\n```"
    )

    opts = CortexCodeAgentOptions(
        cwd=DBT_PROJECT_DIR,
        permission_mode="bypassPermissions",
        allow_dangerously_skip_permissions=True,
        plugins=[{"type": "local", "path": PLUGIN_DIR}],
    )
    if SNOWFLAKE_CONNECTION:
        opts.connection = SNOWFLAKE_CONNECTION

    log.info("Starting CoCo session for ci-failure-responder")

    async for message in query(prompt=prompt, options=opts):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if hasattr(block, "text"):
                    log.info("Agent: %s", block.text[:200])
        elif isinstance(message, ResultMessage):
            status = "error" if message.is_error else "success"
            log.info(
                "Session %s finished (%s) in %.1fs",
                message.session_id,
                status,
                message.duration_ms / 1000,
            )
            if message.is_error:
                log.error("Session error: %s", message.result)


class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/webhook/ci-failure":
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        # Signature verification
        sig_header = self.headers.get("Authorization", "")
        if WEBHOOK_SECRET and not verify_signature(body, sig_header):
            log.warning("Webhook signature verification failed")
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b"Invalid signature")
            return

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            log.warning("Malformed JSON in webhook body")
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Invalid JSON")
            return

        # Extract job name and filter
        job_name = payload.get("data", {}).get("jobName", "")
        if not JOB_NAME_PATTERN.fullmatch(job_name):
            log.info("Ignoring job '%s' (does not match pattern)", job_name)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Skipped: job name does not match filter")
            return

        run_id = payload.get("data", {}).get("runId", "unknown")
        log.info("Accepted webhook for job '%s', run %s", job_name, run_id)

        # Return 200 immediately, process in background
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Accepted")

        thread = threading.Thread(
            target=invoke_skill,
            args=(json.dumps(payload, indent=2),),
            daemon=True,
        )
        thread.start()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        log.debug("HTTP %s", format % args)


def main():
    if not DBT_PROJECT_DIR:
        log.error("DBT_PROJECT_DIR environment variable is required")
        sys.exit(1)

    if not Path(DBT_PROJECT_DIR).is_dir():
        log.error("DBT_PROJECT_DIR does not exist: %s", DBT_PROJECT_DIR)
        sys.exit(1)

    if not Path(PLUGIN_DIR).is_dir():
        log.warning("Plugin directory not found: %s", PLUGIN_DIR)

    if not WEBHOOK_SECRET:
        log.warning(
            "DBT_CLOUD_WEBHOOK_SECRET not set — webhook signature verification disabled"
        )

    server = HTTPServer(("0.0.0.0", PORT), WebhookHandler)
    log.info("Listening on port %d (POST /webhook/ci-failure)", PORT)
    log.info("dbt project: %s", DBT_PROJECT_DIR)
    log.info("Plugin dir: %s", PLUGIN_DIR)
    log.info("Job filter: %s", JOB_NAME_PATTERN.pattern)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down")
        server.server_close()


if __name__ == "__main__":
    main()
