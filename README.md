# dbt-spec-driven

A spec-driven dbt development workflow for agentic IDEs, shipped as a
[Cortex](https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code) plugin. It
runs: **discover → specify → implement → validate output → review → ship**, with process
that scales to the change (light or full route), mandatory engineering rules, and
sub-agents where independence helps (output validation, review, CI).

This plugin is **Cortex-only**. There is no adapter layer for other IDEs.

## What's in the box

| Component | Purpose |
|-----------|---------|
| `AGENTS.example.md` | The mandatory, blocking engineering rules + a **Project Profile** (the only team-specific block). Copy to your dbt repo root as `AGENTS.md` and edit the Profile. |
| `skills/spec-driven/` | The single workflow skill. Routes by intent (feature / bug / refactor / standalone review / standalone docs) and orchestrates the gated phases. |
| `agents/` | Sub-agents: `output-validator`, `peer-reviewer`, `ci-interpreter`, `spec-author` (full route only), plus `semantic-view-author` / `quality-auditor` / `dbt-cloud-parser`. |
| `skills/ci-failure-responder/` | Responds to dbt Cloud job failures: creates a Jira bug ticket and triggers the SDD bug-fix workflow in scheduled mode. |
| `skills/{spec-review,spec-debt,verify-this,ci-loop,quality-audit,pr-ergonomics,work-summary}/` | Optional side doors. Never injected into a one-line bug. |
| `automations/ci-failure/` | Cloud automation config, prompt, runner, and setup guide for the CI failure responder. See [`set_up.md`](./automations/ci-failure/set_up.md). |
| `hooks/hooks.json` | Context loading only: injects `AGENTS.md` and the context ledger at session start, and appends changed files to `.cortex/notes/session-log.md` at session end. Dual bash + PowerShell. |

### Design principle

Three layers, each owning its content exactly once:

- **Rules (always-on)** → `AGENTS.md`
- **Workflow (user-triggered)** → the `spec-driven` skill
- **Isolated steps (spawned)** → sub-agents in `agents/`

The skill never restates the rules — it points to `AGENTS.md`. Sub-agents return structured
reports so the main thread stays focused.

## Configuration — contribute, don't fork

Everything team-specific lives in **one place**: the **Project Profile** table at the top
of `AGENTS.md`. The skills, sub-agents, and numbered rules are fully generic — they
reference Profile values by name (layers, prefixes, naming pattern, surrogate macro,
materializations, incremental threshold, macros location, lint config, specs location,
**base branch**, **ticketing**, **CI system**, **data-diff tool**, validation baseline,
**context ledger**, **PR template**, **max file size**).

To adopt the plugin you edit **only** your Profile. The generic core stays untouched and
updates cleanly from upstream — so improvements flow back as contributions rather than
divergent forks. The values shipped in `AGENTS.example.md` are a worked example.

## Requirements

- Cortex Code / Cortex Desktop. Cortex-only — no Cursor/other-IDE adapter.
- `git` and the GitHub CLI (`gh`, authenticated) for the Ship phase.
- `jq` on PATH for the hooks **on macOS/Linux** (the POSIX hook variants use it; the
  Windows/PowerShell variants use built-in cmdlets and need no `jq`).
- A dbt project with the base branch and specs directory set in your Project Profile.
- A dbt data-diff package for `output-validator` — `audit_helper` (+ `dbt_utils`) by
  default; swap via the Profile's data-diff tool.
- Optional: an MCP tool for your ticketing system; a CI system whose results surface as
  GitHub checks for the `ci-interpreter` agent.

## Install

1. Copy `AGENTS.example.md` to the **root of your dbt repository** as `AGENTS.md`, then edit
   the **Project Profile** block to match your team. (This is the live, enforced copy the
   hooks and agents read.)
2. Install the plugin into Cortex (plugin manager, or place the `dbt-spec-driven/` directory
   where Cortex discovers plugins — `~/.snowflake/cortex/plugins/`).
3. Start a session in your dbt repo and invoke the workflow (e.g. "fix bug …",
   "build feature …", or `/dbt-spec-driven:spec-driven`).

> **Hooks run on macOS/Linux and Windows out of the box.** `hooks/hooks.json` registers
> two variants of each hook — a POSIX (bash) command and a PowerShell command. Cortex runs
> the shell appropriate to the OS; the non-matching variant fails silently (command not
> found → no output), so a mixed-OS team needs no per-user configuration.

## The workflow

1. **Discover** — read the code, lineage, ADRs and the nearest existing implementation of
   the same kind of change; confirm or disprove the ticket's assumptions with evidence.
   Then pick the **light** or **full** route.
2. **Specify / design** — `REQ-xxx` + tagged `VAL-xxx`. Light route: in the PR body and
   ticket, no spec files. Full route (new models, grain changes, cross-domain joins,
   semantic views, ADR territory, real design trade-offs): `spec-author` writes
   `requirements.md` and `design.md`.
3. **Implement** — code and tests that satisfy `AGENTS.md`.
4. **Validate output** — `output-validator` checks the data against the baseline and
   returns a report (not committed). Fingerprint/CLONE on refactors; Looker
   reconciliation when a VAL names it.
5. **Review** — `peer-reviewer` on two axes: Standards vs Spec.
6. **Ship** — commit, push, open PR, interpret CI via `ci-interpreter`, answer automated
   review comments.

### Why there's so little enforcement

Earlier versions had a hook-based lock (write-gate, ship-gate, a hash ledger of sub-agent
output), grill notes, a discovery sub-agent and a test-author sub-agent. They were built
for models that dropped steps on long tasks. Current models (Opus 5.5 and later) carry
long multi-step work without that, and the scaffolding was costing time and tokens
without catching the mistakes that actually happened — which were convention misses
(file layout, widened decisions, committed working files). The skill now targets those
directly: read the precedent first, carry decisions verbatim, check `git status` before
committing. Durable terms still go in the Profile **context ledger** in the dbt repo.

## CI Failure Auto-Fix (on-the-loop)

The plugin includes a **ci-failure-responder** skill that automatically responds to dbt
Cloud job failures. When a scheduled job (daily, 30-min, hourly) fails, it:

1. Parses the failure via the `dbt-cloud-parser` agent.
2. Classifies it: `code_test` (auto-fixable), `data`, or `infra` (human-required).
3. Creates a Jira bug ticket (project `DATA`, type `Bug`) with structured error details.
4. For `code_test` failures: invokes the `spec-driven` bug-fix workflow in **scheduled
   mode** (on-the-loop) — fully autonomous, stopping after three attempts on the same problem.

### Setup

1. **Install the runner:**

   ```bash
   pip install -r automations/requirements.txt
   ```

2. **Store the dbt Cloud token** (if not already done):

   ```bash
   cortex secret store dbt_cloud_token --from-file /path/to/token
   ```

3. **Start the webhook server:**

   ```bash
   DBT_PROJECT_DIR=/path/to/your/dbt-project \
     python automations/ci_failure_runner.py
   ```

   The server listens on port 8090 by default (`POST /webhook/ci-failure`).

   | Env var | Required | Description |
   |---------|----------|-------------|
   | `DBT_PROJECT_DIR` | Yes | Absolute path to the dbt project root (where `AGENTS.md` lives) |
   | `PLUGIN_DIR` | No | Path to the plugin directory (default: `~/.snowflake/cortex/plugins/dbt-spec-driven`) |
   | `SNOWFLAKE_CONNECTION` | No | Snowflake CLI connection name (default: CLI default) |
   | `DBT_CLOUD_WEBHOOK_SECRET` | No | HMAC secret for webhook signature verification |
   | `JOB_NAME_PATTERN` | No | Regex to filter job names (default: `dbt_(daily\|30min\|hourly).*`) |
   | `PORT` | No | HTTP port (default: 8090) |

4. **dbt Cloud webhook:** In dbt Cloud → Account Settings → Webhooks → Create Webhook.
   - Event: `Run errored`
   - Endpoint: `http://<your-host>:8090/webhook/ci-failure`
   - Optionally configure the HMAC secret and set `DBT_CLOUD_WEBHOOK_SECRET` to match.

   Only failures from the daily, 30-minute, and hourly jobs are processed (controlled by
   `JOB_NAME_PATTERN`). All other job failures are acknowledged but skipped.

5. **Jira:** Ensure the `DATA` project exists with issue type `Bug`, and that the Jira
   MCP tool is configured with permissions to create issues and transition them.

6. **Manual invocation:** You can also trigger the workflow manually:
   `/dbt-spec-driven:ci-failure-responder` and provide a dbt Cloud run URL.

### Outcomes

| Scenario | Result |
|----------|--------|
| `code_test` failure, fix succeeds | PR opened, Jira ticket updated with link, transitioned to "Peer Review" |
| `code_test` failure, fix blocked (3 attempts on the same problem) | Jira ticket updated with what was tried, transitioned to "Up Next" for human pickup |
| `data` or `infra` failure | Jira ticket created for triage, no auto-fix attempted |

### Requirements (additional)

- Cortex Code CLI installed and on PATH.
- dbt Cloud account with webhook support.
- Jira MCP tool configured (`mcp_jira_jira_create_issue`, `mcp_jira_jira_add_comment`,
  `mcp_jira_jira_transition_issue`).

---

## Roadmap

- **Machine-readable profile.** Optionally externalize the Project Profile into a
  `profile.yml` (validated/rendered), as an alternative to editing the Markdown table.
- **On-the-loop autonomy.** Use the `output-validator`'s `Self-validatable: YES` marker to
  let ground-truth tasks (bugs/refactors) run with reduced human gating; pair with git
  worktrees for parallel branches.
- **Notification integration** (e.g. Teams/Slack) as a Profile key.

## License

MIT — see [`LICENSE`](./LICENSE).
