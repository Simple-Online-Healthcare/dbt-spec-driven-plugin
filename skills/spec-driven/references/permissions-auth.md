# Permissions & Auth Setup for AI Agent Execution

Reference document for establishing the service identity that enables autonomous "on the
loop" execution via CI/cron triggers.

---

## Service Identity Inventory

The autonomous agent requires credentials for four systems:

| System | Access Type | Purpose |
|--------|------------|---------|
| **Snowflake** | Service role + key-pair auth | Run `dbt build` / `dbt test` against dev/CI targets |
| **Git (GitHub)** | Deploy key or machine user | Create branches, push commits, open PRs |
| **Jira** | API token | Transition ticket statuses, add comments |
| **dbt Cloud** (if used) | API token | Trigger jobs, retrieve run artifacts |

---

## Snowflake Service Role

### Role: `SVC_DBT_AGENT`

A dedicated functional role following least privilege:

```sql
-- Create the service role
CREATE ROLE IF NOT EXISTS SVC_DBT_AGENT;

-- Grant access to the dev/CI database(s)
GRANT USAGE ON WAREHOUSE DBT_WH_XS TO ROLE SVC_DBT_AGENT;
GRANT USAGE ON DATABASE DBT_DEV TO ROLE SVC_DBT_AGENT;
GRANT USAGE ON ALL SCHEMAS IN DATABASE DBT_DEV TO ROLE SVC_DBT_AGENT;
GRANT CREATE TABLE ON ALL SCHEMAS IN DATABASE DBT_DEV TO ROLE SVC_DBT_AGENT;
GRANT CREATE VIEW ON ALL SCHEMAS IN DATABASE DBT_DEV TO ROLE SVC_DBT_AGENT;
GRANT SELECT ON ALL TABLES IN DATABASE DBT_DEV TO ROLE SVC_DBT_AGENT;
GRANT SELECT ON ALL VIEWS IN DATABASE DBT_DEV TO ROLE SVC_DBT_AGENT;

-- Read access to production (for audit_helper diffs / output-validation baseline)
GRANT USAGE ON DATABASE ANALYTICS TO ROLE SVC_DBT_AGENT;
GRANT USAGE ON ALL SCHEMAS IN DATABASE ANALYTICS TO ROLE SVC_DBT_AGENT;
GRANT SELECT ON ALL TABLES IN DATABASE ANALYTICS TO ROLE SVC_DBT_AGENT;
GRANT SELECT ON ALL VIEWS IN DATABASE ANALYTICS TO ROLE SVC_DBT_AGENT;

-- Read access to raw sources
GRANT USAGE ON DATABASE RAW TO ROLE SVC_DBT_AGENT;
GRANT USAGE ON ALL SCHEMAS IN DATABASE RAW TO ROLE SVC_DBT_AGENT;
GRANT SELECT ON ALL TABLES IN DATABASE RAW TO ROLE SVC_DBT_AGENT;

-- Create the service user (key-pair authentication, no password)
CREATE USER IF NOT EXISTS SVC_DBT_AGENT
  DEFAULT_ROLE = SVC_DBT_AGENT
  DEFAULT_WAREHOUSE = DBT_WH_XS
  MUST_CHANGE_PASSWORD = FALSE
  TYPE = SERVICE;

GRANT ROLE SVC_DBT_AGENT TO USER SVC_DBT_AGENT;
```

### What the role CANNOT do

- No access to `ACCOUNTADMIN`, `SECURITYADMIN`, or `SYSADMIN`.
- No `CREATE DATABASE`, `CREATE ROLE`, `CREATE USER`.
- No `GRANT` privileges to any role.
- No access to production write schemas (ANALYTICS is read-only).
- No `ALTER` or `DROP` on production objects.

### Authentication

Key-pair authentication (no password):

```bash
# Generate key pair
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out svc_dbt_agent_rsa_key.p8 -nocrypt
openssl rsa -in svc_dbt_agent_rsa_key.p8 -pubout -out svc_dbt_agent_rsa_key.pub

# Assign public key to the user
ALTER USER SVC_DBT_AGENT SET RSA_PUBLIC_KEY='<public key content>';
```

---

## Git Access (GitHub)

### Option: Machine user with deploy key

- Create a GitHub machine user (e.g., `soh-data-agent`) or use a fine-grained PAT.
- Scope: `contents: write` (push), `pull_requests: write` (open PRs), `metadata: read`.
- **No access to merge** — the machine user is not added as a CODEOWNER or given merge
  permission on `master`.

### Branch protection enforcement

The existing branch protection on `master` ensures:
- Require PR review (≥1 approval) before merge.
- Require status checks to pass (dbt build + tests).
- The agent's PRs cannot be merged without a human approver.

---

## Jira API Access

### Token scope

- **Project:** DATA only.
- **Permissions:** 
  - Transition issues (move between statuses).
  - Add comments.
  - Edit issue description (to add branch name, REQ summaries).
- **Cannot:** Delete issues, modify workflows, change project settings, access other projects.

### Setup

Use a Jira API token (Atlassian account) tied to the service identity, or a project-scoped
OAuth app. Store in the secrets vault under key `JIRA_API_TOKEN_SVC_AGENT`.

---

## dbt Cloud / CLI Credentials

If using dbt Cloud:
- Service token scoped to the project (read/trigger jobs, read artifacts).
- Cannot modify project settings, connections, or environments.

If using dbt CLI directly:
- `profiles.yml` configured with key-pair auth pointing at `SVC_DBT_AGENT` role.
- Profile name matches the CI target (e.g., `ci` or `dev_agent`).

---

## Secrets Management

| Secret | Vault Key | Rotation |
|--------|-----------|----------|
| Snowflake RSA private key | `SNOWFLAKE_PRIVATE_KEY_SVC_AGENT` | 90 days |
| GitHub PAT / deploy key | `GITHUB_TOKEN_SVC_AGENT` | 90 days |
| Jira API token | `JIRA_API_TOKEN_SVC_AGENT` | 90 days |
| dbt Cloud API token | `DBT_CLOUD_TOKEN_SVC_AGENT` | 90 days |

**Storage:** Team secrets vault (1Password / GitHub Secrets / Snowflake Secrets — per team
infrastructure). CI runner pulls secrets at runtime; they are never committed to the repo.

**Rotation process:**
1. Generate new credential.
2. Update the vault entry.
3. Verify the agent can authenticate with the new credential (test run).
4. Revoke the old credential.

---

## Explicit Deny List

The service identity **MUST NOT** be able to:

| Action | Enforcement |
|--------|-------------|
| Merge to `master`/`main` | GitHub branch protection (no merge permission) |
| Deploy to production | No production deploy role; dbt Cloud prod job not triggerable |
| Modify permissions | No `SECURITYADMIN` or `MANAGE GRANTS` |
| Access secrets vault directly | Secrets injected at runtime only; no vault admin access |
| Delete branches | Scoped PAT does not include `delete` on branches |
| Modify Jira workflow | API token has no project admin scope |
| Access other projects | Token scoped to DATA project only |
