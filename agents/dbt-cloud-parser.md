# dbt Cloud Parser Agent — Extract & Classify CI Failures

Parse a dbt Cloud job failure (webhook payload or API response) into a structured
report the `ci-failure-responder` skill can act on.

## Inputs

One of:
- Raw webhook JSON body from a dbt Cloud `job.run.errored` event.
- A dbt Cloud run URL or numeric run ID (fetch details via the dbt Cloud API).

## Configuration

The agent requires these values (sourced from environment or the AGENTS.md Project Profile):

| Parameter | Source | Example |
|-----------|--------|---------|
| `DBT_CLOUD_TOKEN` | Cortex secret `dbt_cloud_token` (use `secret_env`) | `dbtc_...` |
| `DBT_CLOUD_BASE_URL` | AGENTS.md Profile or default | `https://cloud.getdbt.com` |
| `DBT_CLOUD_ACCOUNT_ID` | AGENTS.md Profile or extracted from run URL | `12345` |

**Regional endpoints:**

| Region | Base URL |
|--------|----------|
| US (default) | `https://cloud.getdbt.com` |
| EMEA | `https://emea.dbt.com` |
| AU | `https://au.dbt.com` |

The base URL MUST match the account's dbt Cloud region. If a run URL is provided,
infer the region from the URL host. If only a run ID is provided, use the configured
`DBT_CLOUD_BASE_URL`.

## Process

1. **Extract metadata** from the payload:
   - `job_name` — the dbt Cloud job name (e.g. "dbt_daily_run", "dbt_30min_build").
   - `job_schedule` — infer from job name or cron expression: `"daily"` | `"30min"` | `"hourly"`.
   - `run_id` — the unique run identifier.
   - `run_url` — direct link to the run in dbt Cloud.
   - `git_branch` — the branch/ref the job ran against.

2. **Extract failed steps.** For each step that errored:
   - `model_or_test` — the dbt node name (e.g. `stg_example_source__orders`, `not_null_orders_order_id`).
   - `error_type` — classify:
     - `compilation` — SQL compilation error, Jinja rendering failure, missing ref/source.
     - `runtime` — database error during execution (syntax accepted but execution failed).
     - `test_failure` — a dbt test that returned rows (assertion violated).
     - `freshness` — source freshness check exceeded threshold.
   - `error_message` — the raw error string (first meaningful line, max 500 chars).
   - `file_path` — the model/test file path if present in the error output.

3. **Classify the overall failure:**

   | Condition | Classification |
   |-----------|---------------|
   | All failures are `compilation`, `runtime` (non-permission), or `test_failure` | `code_test` |
   | Any failure is `freshness`, or error message references missing/stale source data | `data` |
   | Error message references permissions, connection timeout, warehouse suspended, or transient infra | `infra` |
   | Mixed: at least one `code_test` AND one `data`/`infra` | Use the majority; if tied, prefer `code_test` (attempt the fix for fixable parts) |

4. **Generate summary** — one-line plain-English description of the failure suitable for
   a Jira ticket title (max 80 chars). Example: `"stg_example_source__orders compilation error: missing source column"`.

## Webhook payload reference

dbt Cloud `job.run.errored` webhook body (key fields):

```json
{
  "accountId": 12345,
  "eventId": "...",
  "timestamp": "2026-08-28T10:15:00Z",
  "webhookName": "...",
  "data": {
    "jobId": "...",
    "jobName": "dbt_daily_run",
    "runId": "...",
    "runUrl": "https://cloud.getdbt.com/deploy/12345/projects/67890/runs/11111",
    "environmentId": "...",
    "runStatus": "Error",
    "runStatusMessage": "...",
    "runStartedAt": "...",
    "runFinishedAt": "...",
    "gitBranch": "master",
    "runSteps": [
      {
        "name": "dbt build",
        "status": "Error",
        "logs": "..."
      }
    ]
  }
}
```

If only a run URL/ID is provided (manual invocation):

1. **Resolve the base URL:** If a full URL is given (e.g.
   `https://cloud.getdbt.com/deploy/12345/projects/67890/runs/11111`), extract the
   host to determine the regional endpoint. If only a numeric run ID, use the
   configured `DBT_CLOUD_BASE_URL`.

2. **Fetch run metadata:**
   ```bash
   curl -s -H "Authorization: Token ${DBT_CLOUD_TOKEN}" \
     "${DBT_CLOUD_BASE_URL}/api/v2/accounts/${DBT_CLOUD_ACCOUNT_ID}/runs/${RUN_ID}/"
   ```
   Use `secret_env: {"DBT_CLOUD_TOKEN": "dbt_cloud_token"}` for the token.

3. **Fetch job details** (for job name and schedule):
   ```bash
   curl -s -H "Authorization: Token ${DBT_CLOUD_TOKEN}" \
     "${DBT_CLOUD_BASE_URL}/api/v2/accounts/${DBT_CLOUD_ACCOUNT_ID}/jobs/${JOB_ID}/"
   ```

4. **Fetch run_results.json** (for specific failures):
   ```bash
   curl -s -H "Authorization: Token ${DBT_CLOUD_TOKEN}" \
     "${DBT_CLOUD_BASE_URL}/api/v2/accounts/${DBT_CLOUD_ACCOUNT_ID}/runs/${RUN_ID}/artifacts/run_results.json"
   ```
   Filter results where `status` is `"error"` or `"fail"`. Extract `unique_id`,
   `message`, `failures` count, and `compiled_code` for each.

5. Fall back to parsing the GitHub check annotation if API access fails (401/403).

## Constraints

- Do NOT guess or infer errors that aren't explicitly present in the payload/logs.
- If the payload is malformed or missing required fields, return a structured error:
  ```
  parse_error: true
  raw_payload: <the input as-is>
  reason: "missing field: data.runSteps"
  ```
- Keep `error_message` to the most informative line — strip stack traces and repeated
  boilerplate. Include the specific column/table/test name if present.

## Output (return to caller)

```yaml
job_name: "dbt_daily_run"
job_schedule: "daily"
run_id: 11111
run_url: "https://cloud.getdbt.com/deploy/12345/projects/67890/runs/11111"
git_branch: "master"
failed_steps:
  - model_or_test: "stg_example_source__orders"
    error_type: "compilation"
    error_message: "Compilation Error in model stg_example_source__orders: column 'order_status' not found in source"
    file_path: "models/staging/example_source/stg_example_source__orders.sql"
  - model_or_test: "not_null_orders_order_sk"
    error_type: "test_failure"
    error_message: "Test not_null_orders_order_sk failed: 3 rows returned"
    file_path: "models/marts/orders/_orders__models.yml"
classification: "code_test"
summary: "stg_example_source__orders compilation error + downstream test failure"
```
