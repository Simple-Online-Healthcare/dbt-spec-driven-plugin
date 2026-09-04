# CI Failure Responder

## Purpose

Automatically respond to dbt Cloud job failures by creating a Jira bug ticket and
invoking the SDD bug-fix workflow in scheduled (on-the-loop) mode. Designed to run
headlessly via Cortex Code Automations, triggered by a dbt Cloud webhook.

> **Authority:** This skill delegates to `spec-driven` for the actual fix. It handles
> only the trigger-to-handoff pipeline: parse failure → classify → create ticket → invoke.
> All engineering rules remain in `AGENTS.md`; all workflow phases remain in `spec-driven`.

---

## Trigger

| Method | Detail |
|--------|--------|
| **Primary** | Cortex Code Automation — webhook endpoint receiving dbt Cloud `job.run.errored` events |
| **Manual** | Invoke directly: `/dbt-spec-driven:ci-failure-responder` with a dbt Cloud run URL or run ID |

Target jobs: the dbt Cloud cron-scheduled jobs (daily, every-30-minutes, hourly).

---

## Inputs

The skill expects one of:
- **Webhook payload**: the JSON body from a dbt Cloud `job.run.errored` webhook event
  (available as automation context).
- **Run URL or ID**: a dbt Cloud run URL (e.g. `https://cloud.getdbt.com/...`) or numeric
  run ID, passed in the user prompt for manual invocation.

---

## Process

### 1. Parse failure context

Delegate to the **`dbt-cloud-parser`** sub-agent with the webhook payload or run URL/ID.
It returns:

```
job_name: string        — e.g. "dbt_daily", "dbt_30min", "dbt_hourly"
job_schedule: string    — "daily" | "30min" | "hourly"
run_id: number
run_url: string
git_branch: string      — branch the job ran against (typically the base branch)
failed_steps: [
  {
    model_or_test: string   — e.g. "stg_example_source__orders" or "not_null_orders_order_id"
    error_type: string      — "compilation" | "runtime" | "test_failure" | "freshness"
    error_message: string   — the raw error message
    file_path: string       — path to the failing model/test if resolvable
  }
]
classification: "code_test" | "data" | "infra"
summary: string         — one-line human-readable summary
```

### 2. Classify and gate

| Classification | Action |
|---------------|--------|
| `code_test` | Proceed — create ticket AND invoke SDD |
| `data` | Create ticket only — flag for human investigation (source/upstream issue) |
| `infra` | Create ticket only — flag for human investigation (transient/permissions) |

### 3. Create Jira bug ticket

Use `mcp_jira_jira_create_issue` with:

| Field | Value |
|-------|-------|
| Project | `DATA` |
| Issue type | `Bug` |
| Summary | `[CI-Auto] {job_schedule} job failure: {summary}` |
| Description | See template below |
| Labels | `on-the-loop`, `ci-failure`, `{job_schedule}` |

**Description template:**

```markdown
h2. dbt Cloud Job Failure (auto-detected)

*Job:* {job_name}
*Schedule:* {job_schedule}
*Run:* [{run_id}|{run_url}]
*Branch:* {git_branch}
*Classification:* {classification}

h2. Failed Steps

{for each failed_step:}
* *{model_or_test}* — {error_type}
{code}{error_message}{code}
{end for}

h2. Auto-fix status

{if classification == code_test:}
SDD bug-fix workflow invoked in scheduled mode. Updates will follow on this ticket.
{else:}
Auto-fix NOT attempted — classified as {classification}. Requires human investigation.
{end}

---
_Created automatically by ci-failure-responder_
```

### 4. Invoke spec-driven (code_test only)

If classification is `code_test`:

1. The ticket is now created (e.g. `DATA-456`).
2. Invoke the `spec-driven` skill with:
   - **Mode:** `scheduled`
   - **Intent:** bug fix
   - **Context prompt:**
     ```
     mode: scheduled. Fix bug {TICKET_ID}: dbt {job_schedule} job failure.

     Error context:
     {for each failed_step:}
     - {model_or_test}: {error_type} — {error_message}
     {end for}

     Run URL: {run_url}

     This is a CI failure on the {git_branch} branch. The fix should target the
     base branch and open a PR.
     ```

The `spec-driven` skill then runs its full bug-fix path autonomously:
Discover → Specify+Implement → Validate Output → Review → Ship

### 5. Report outcome

After the `spec-driven` workflow completes (or hard-stops):

| Outcome | Action |
|---------|--------|
| **PR opened, CI green** | Update Jira ticket: add comment with PR link, transition to "Peer Review" |
| **Hard stop (blocked)** | Update Jira ticket: add comment with `workflow-state.md` retry log, transition to "Up Next" for human pickup |
| **Ticket only (data/infra)** | No further action — ticket is in backlog for triage |

Use `mcp_jira_jira_add_comment` for the outcome comment and `mcp_jira_jira_transition_issue`
for status changes.

---

## Error handling

- If the dbt-cloud-parser agent cannot parse the payload (malformed, missing fields),
  log the raw payload to the Jira ticket description with a note that parsing failed,
  and do NOT invoke SDD.
- If Jira ticket creation fails (permissions, project not found), log the error and
  terminate — do not proceed without a ticket.
- If the spec-driven workflow is already running for the same failure (duplicate webhook),
  check for an existing open ticket with matching labels + summary before creating a
  duplicate. If found, skip and log.

---

## Manual invocation

When invoked interactively (not from an automation):

1. Ask for the dbt Cloud run URL or ID.
2. Run the same flow but in **interactive mode** — the spec-driven skill will use
   interactive gates (ask_user_question) instead of self-checkpoints.
3. Still create the Jira ticket — the user can opt out if one already exists.

---

## Sub-agents used

| Agent | Role |
|-------|------|
| `dbt-cloud-parser` | Parse and classify the dbt Cloud failure |
| (then delegates to `spec-driven` which uses its own sub-agents) | |

---

## Constraints

- This skill runs in the **dbt project directory** (where `AGENTS.md` lives), not in the
  plugin repository.
- It never modifies the spec-driven workflow logic — it only invokes it.
- Jira project key (`DATA`) and issue type (`Bug`) are fixed. If these need to be
  configurable, they should move to the AGENTS.md Project Profile in a future update.
