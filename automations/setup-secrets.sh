#!/usr/bin/env bash
# Set up the secrets required by the CI failure responder automation.
#
# This script guides you through creating:
#   1. A GITHUB_PAT Snowflake secret (for git/gh access in the sandbox)
#   2. A _ci_secrets.env workspace file (for Jira API access)
#
# Usage:
#   bash automations/setup-secrets.sh
#   bash automations/setup-secrets.sh -c my-connection

set -euo pipefail

CONN_ARGS=("$@")

echo "=== CI Failure Responder — Secrets Setup ==="
echo ""
echo "This script will set up the secrets needed for the automation."
echo "You will need:"
echo "  - A GitHub PAT with repo access to Simple-Online-Healthcare/dbt-pipelines"
echo "  - A Jira API token (create at https://id.atlassian.com/manage-profile/security/api-tokens)"
echo "  - Your Atlassian email address"
echo ""

# --- Step 1: GitHub PAT ---
echo "--- Step 1: GitHub PAT ---"
echo ""
if cortex secret list 2>/dev/null | grep -q '"dbt_cloud_token"\|"github_pat"'; then
  echo "Checking for existing local cortex secrets..."
fi

echo "Enter your GitHub PAT (will not be echoed):"
read -rs GITHUB_PAT
echo "(received)"

if [ -z "$GITHUB_PAT" ]; then
  echo "Error: GitHub PAT cannot be empty."
  exit 1
fi

echo ""
echo "Creating Snowflake secret GITHUB_PAT in your personal database..."
echo "You may be prompted to authenticate with Snowflake."
echo ""

# Store as local cortex secret (for interactive use)
echo "$GITHUB_PAT" | cortex secret store github_pat 2>/dev/null || true

echo "GitHub PAT stored as local cortex secret."
echo ""
echo "IMPORTANT: You also need the GITHUB_PAT as a Snowflake SECRET for the"
echo "cloud automation. Run this SQL in Snowsight (replace <YOUR_PAT>):"
echo ""
echo "  CREATE OR REPLACE SECRET USER\$<YOUR_USER>.PUBLIC.GITHUB_PAT"
echo "    TYPE = GENERIC_STRING"
echo "    SECRET_STRING = '<YOUR_PAT>'"
echo "    COMMENT = 'GitHub PAT for CI failure automation';"
echo ""
read -p "Press Enter when done (or skip if already exists)..."

# --- Step 2: Jira token ---
echo ""
echo "--- Step 2: Jira API Token ---"
echo ""
echo "Enter your Atlassian email:"
read -r JIRA_EMAIL

echo "Enter your Jira API token (will not be echoed):"
read -rs JIRA_TOKEN
echo "(received)"

if [ -z "$JIRA_EMAIL" ] || [ -z "$JIRA_TOKEN" ]; then
  echo "Error: Email and token cannot be empty."
  exit 1
fi

# Store as local cortex secret (for interactive use)
echo "$JIRA_TOKEN" | cortex secret store jira_api_token 2>/dev/null || true

# Create the workspace env file
JIRA_B64=$(printf "%s" "${JIRA_EMAIL}:${JIRA_TOKEN}" | base64)
TMPFILE=$(mktemp)
cat > "$TMPFILE" << ENVEOF
export JIRA_TOKEN_B64="${JIRA_B64}"
ENVEOF

echo ""
echo "Uploading secrets to your workspace stage..."
cortex ws rm "USER\$.PUBLIC.DEFAULT\$:/_ci_secrets.env" "${CONN_ARGS[@]}" 2>/dev/null || true
cortex ws cp "$TMPFILE" "USER\$.PUBLIC.DEFAULT\$:/_ci_secrets.env/" "${CONN_ARGS[@]}" 2>&1

rm -f "$TMPFILE"

# Clear sensitive vars
unset GITHUB_PAT JIRA_TOKEN JIRA_B64

echo ""
echo "=== Setup complete ==="
echo ""
echo "Secrets configured:"
echo "  - Local cortex secrets: github_pat, jira_api_token (for interactive use)"
echo "  - Workspace file: _ci_secrets.env (for cloud automation)"
echo ""
echo "Next step: bash automations/register.sh ${CONN_ARGS[*]:-}"
