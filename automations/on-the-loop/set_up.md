# On-the-Loop Automation — Setup Guide

## Overview

The on-the-loop automation runs every weekday at 9am and picks up Jira bug
tickets labelled `on-the-loop` + `code_test`. It invokes the spec-driven
workflow in scheduled mode to autonomously fix the issue, open a PR, and
report back on the ticket.

This automation is designed to run **after** the CI failure automation (8am
daily), which creates the tickets that on-the-loop picks up.

## Prerequisites

The on-the-loop automation shares the same prerequisites as the CI failure
automation:

- **GitHub PAT** — stored as a Snowflake secret
- **Jira API token** — stored in workspace stage as an env file
- **dbt Cloud token** — stored in workspace stage as an env file

If you have already set up the CI failure automation, no additional secrets
are needed. See [`automations/ci-failure/set_up.md`](../ci-failure/set_up.md)
for detailed instructions on setting up these prerequisites.

## Registration

Once prerequisites are in place, register the automation:

```bash
bash automations/on-the-loop/register.sh
```

Or with a specific Snowflake connection:

```bash
bash automations/on-the-loop/register.sh -c my-connection
```

The script will:
1. Detect your Snowflake user
2. Show the configuration for confirmation
3. Drop any existing `on_the_loop_responder` automation
4. Register the new automation with a weekday 9am Europe/London schedule

## Management

```bash
# Check the automation status
cortex automation describe on_the_loop_responder

# View recent run logs
cortex automation logs on_the_loop_responder

# Temporarily suspend
cortex automation suspend on_the_loop_responder

# Resume
cortex automation resume on_the_loop_responder

# Remove entirely
cortex automation drop on_the_loop_responder
```

## How it works

```
CI Failure Check (8am daily)
  └─ Creates Jira bug tickets with labels: on-the-loop, code_test, ci-failure

On-the-Loop (9am weekdays)
  └─ Queries Jira for eligible tickets (on-the-loop + code_test, in "Up Next")
  └─ For each ticket:
      ├─ Transitions to "AI Executing"
      ├─ Runs spec-driven workflow (mode: scheduled)
      ├─ On success: comments PR link, transitions to "In Review"
      └─ On hard-stop: comments failure summary, removes on-the-loop label
```

## Ticket eligibility

A ticket is picked up by the on-the-loop automation when it has:

| Criterion | Value |
|-----------|-------|
| Label | `on-the-loop` |
| Label | `code_test` |
| Issue type | Bug |
| Status | "Up Next" or "AI Executing" |

Tickets classified as `data` or `infra` are not eligible — they require
human triage.

If a ticket hard-stops (3 failed retries on the same problem), the
`on-the-loop` label is removed so it won't be retried the next day.
