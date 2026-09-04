# CI Failure Responder — Setup Guide

This guide walks you through setting up the CI failure responder automation
under your own Snowflake account. By the end you'll have a cloud automation
that runs every morning at 8am, checks for failed dbt Cloud jobs, creates
Jira tickets, and attempts auto-fixes for code/test failures.

---

## Prerequisites

Before you start, make sure you have:

- [ ] Cortex Code Desktop installed with the `cortex` CLI on your PATH
- [ ] A Snowflake connection configured in `~/.snowflake/connections.toml`
- [ ] `git` and `gh` (GitHub CLI) installed and authenticated
- [ ] Access to your dbt audit database in Snowflake (e.g. `DBT_AUDIT`)

---

## Step 1 — Create a GitHub Personal Access Token

The automation needs a GitHub PAT to clone the dbt project repo and open
PRs from inside the Snowflake sandbox.

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Name it `cortex-ci-failure-automation`
4. Select scopes: `repo` (full repository access)
5. Click **Generate token** and copy the value

Now store it as a Snowflake secret in your personal database. Run this in
Snowsight, replacing `<YOUR_PAT>` with the token you just copied:

```sql
CREATE OR REPLACE SECRET USER$<YOUR_USER>.PUBLIC.GITHUB_PAT
  TYPE = GENERIC_STRING
  SECRET_STRING = '<YOUR_PAT>'
  COMMENT = 'GitHub PAT for CI failure automation. Scoped to dbt project repo.';
```

Replace `<YOUR_USER>` with your Snowflake username (uppercase).

To find your username:

```sql
SELECT CURRENT_USER();
```

Also store it as a local cortex secret (used for interactive invocation):

```bash
cortex secret store github_pat
# Paste the token when prompted
```

---

## Step 2 — Create a Jira API Token

The automation creates Jira tickets in the DATA project when it finds
failures.

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**
3. Label it `cortex-ci-failure-automation`
4. Click **Create** and copy the token

Store it as a local cortex secret:

```bash
cortex secret store jira_api_token
# Paste the token when prompted
```

---

## Step 3 — Upload the Jira credentials to your workspace

The cloud automation runs in a Snowflake sandbox that can't access your local
secrets. We store the Jira credentials in your personal workspace stage so the
automation can load them at runtime.

Generate the base64-encoded credential string:

```bash
echo -n "<your-email>@your-company.com:<your-jira-api-token>" | base64
```

Create a file called `_ci_secrets.env` with this content (replacing the
base64 value):

```bash
export JIRA_TOKEN_B64="<paste-base64-value-here>"
```

Upload it to your workspace:

```bash
cortex ws cp _ci_secrets.env "USER\$.PUBLIC.DEFAULT\$:/"
```

Delete the local file after uploading:

```bash
rm _ci_secrets.env
```

> **Security note:** This file is stored in your personal workspace stage,
> encrypted at rest, and only accessible by your user account. It is not
> a Snowflake SECRET object — see the README's Known Limitations section for
> context on why this workaround exists.

---

## Step 4 — Register the automation

Run the registration script from the repo root:

```bash
bash automations/ci-failure/register.sh
```

If you use a non-default Snowflake connection:

```bash
bash automations/ci-failure/register.sh -c my-connection
```

The script will:
1. Detect your Snowflake username
2. Show the configuration for confirmation
3. Drop any existing automation with the same name
4. Create the new automation scheduled at 8am UK time

---

## Step 5 — Verify

Check that the automation was created:

```bash
cortex automation describe ci_failure_responder
```

You should see:
- **State:** `started`
- **Schedule:** `USING CRON 0 8 * * * Europe/London`

After the first fire (next 8am), check what happened:

```bash
cortex automation doctor ci_failure_responder
```

---

## Rotating tokens

When you need to rotate tokens (recommended every 90 days):

### GitHub PAT

1. Create a new token at [github.com/settings/tokens](https://github.com/settings/tokens)
2. Update the Snowflake secret:

   ```sql
   CREATE OR REPLACE SECRET USER$<YOUR_USER>.PUBLIC.GITHUB_PAT
     TYPE = GENERIC_STRING
     SECRET_STRING = '<NEW_PAT>'
     COMMENT = 'GitHub PAT for CI failure automation. Rotated <date>.';
   ```

3. Update the local cortex secret:

   ```bash
   cortex secret store github_pat
   ```

### Jira API token

1. Create a new token at [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Generate the new base64 value:

   ```bash
   echo -n "your-email@your-company.com:<new-token>" | base64
   ```

3. Create a new `_ci_secrets.env` file and re-upload:

   ```bash
   echo 'export JIRA_TOKEN_B64="<new-base64>"' > _ci_secrets.env
   cortex ws rm "USER\$.PUBLIC.DEFAULT\$:/_ci_secrets.env"
   cortex ws cp _ci_secrets.env "USER\$.PUBLIC.DEFAULT\$:/"
   rm _ci_secrets.env
   ```

4. Update the local cortex secret:

   ```bash
   cortex secret store jira_api_token
   ```

No need to re-register the automation — it reads the workspace file on each
fire.

---

## Managing the automation

| Action | Command |
|--------|---------|
| Check status | `cortex automation describe ci_failure_responder` |
| View recent fires | `cortex automation doctor ci_failure_responder` |
| Pause | `cortex automation suspend ci_failure_responder` |
| Resume | `cortex automation resume ci_failure_responder` |
| Remove | `cortex automation drop ci_failure_responder` |
| Re-register | `bash automations/ci-failure/register.sh` |

---

## Manual invocation

You can trigger the CI failure check interactively from CoCo Desktop
without waiting for 8am:

```
/dbt-spec-driven:ci-failure-responder
```

Then provide a dbt Cloud run URL when prompted. This uses your local cortex
secrets (not the workspace file) and runs interactively with approval gates.
