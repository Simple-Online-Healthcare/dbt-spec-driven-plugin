# dbt-spec-driven

A spec-driven dbt development workflow for agentic IDEs, shipped as a
[Cortex](https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code) plugin. It
enforces: **discover & fact-check → specify → design → implement → validate output →
review → ship**, with mandatory engineering rules and context-isolated sub-agents.

Built for Cortex; the content (skills, rules, agents) is portable to other agent tools via
a thin manifest/hooks adapter.

## What's in the box

| Component | Purpose |
|-----------|---------|
| `AGENTS.example.md` | The mandatory, blocking engineering rules + a **Project Profile** (the only team-specific block). Copy to your dbt repo root as `AGENTS.md` and edit the Profile. |
| `skills/spec-driven/` | The single workflow skill. Routes by intent (feature / bug / refactor / standalone review / standalone docs) and orchestrates the gated phases. |
| `agents/` | Sub-agents for heavy, context-isolated steps: `discovery`, `test-author`, `output-validator`, `peer-reviewer`, `ci-interpreter`. |
| `skills/ci-failure-responder/` | Responds to dbt Cloud job failures: creates a Jira bug ticket and triggers the SDD bug-fix workflow in scheduled mode. |
| `automations/ci-failure/` | Cloud automation config, prompt, runner, and setup guide for the CI failure responder. See [`set_up.md`](./automations/ci-failure/set_up.md). |
| `hooks/hooks.json` | Auto-loads `AGENTS.md` at session start, warns before context compaction, and appends a session note on exit. Cross-platform (bash + PowerShell). |

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
**base branch**, **ticketing**, **CI system**, **data-diff tool**, validation baseline).

To adopt the plugin you edit **only** your Profile. The generic core stays untouched and
updates cleanly from upstream — so improvements flow back as contributions rather than
divergent forks. The values shipped in `AGENTS.example.md` are a worked example.

## Requirements

- Cortex Code / Cortex Desktop.
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

1. **Discover & Fact-Check** (mandatory first gate) — `discovery` agent verifies/disproves
   assumptions and maps lineage. No solutioning until this passes.
2. **Specify** — EARS requirements (`REQ-xxx`) + tagged Validation Criteria (`VAL-xxx`,
   objective/subjective); posted to your ticketing system.
3. **Design** — technical approach + lineage impact (features/refactors).
4. **Implement** — code that satisfies `AGENTS.md`; tests via `test-author`.
5. **Validate Output** — `output-validator` checks the data outcome vs the spec (schema +
   data-diff vs baseline). Self-validates objective/ground-truth criteria; hard-gates
   subjective ones for human sign-off.
6. **Review** — `peer-reviewer` (qualitative; reads the Validation Report).
7. **Ship** — commit, push, open PR, and interpret CI via `ci-interpreter`.

Bug fixes and refactors use condensed paths; standalone "review my PR" and
"document this model" jump straight to the relevant phase.

## CI Failure Auto-Fix (on-the-loop)

The plugin includes a **ci-failure-responder** skill that automatically responds to dbt
Cloud job failures. When a scheduled job (daily, 30-min, hourly) fails, it:

1. Parses the failure via the `dbt-cloud-parser` agent.
2. Classifies it: `code_test` (auto-fixable), `data`, or `infra` (human-required).
3. Creates a Jira bug ticket (project `DATA`, type `Bug`) with structured error details.
4. For `code_test` failures: invokes the `spec-driven` bug-fix workflow in **scheduled
   mode** (on-the-loop) — fully autonomous with retry protocol and hard-stop safety.

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
| `code_test` failure, fix blocked (3 retries exhausted) | Jira ticket updated with retry log, transitioned to "Up Next" for human pickup |
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
- **Cross-tool adapter.** Package the manifest/hooks variants needed to run the same core
  under other agent IDEs.
- **Notification integration** (e.g. Teams/Slack) as a Profile key.

## License

MIT — see [`LICENSE`](./LICENSE).
