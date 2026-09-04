#!/usr/bin/env bash
# Register the CI failure responder cloud automation.
#
# This script is user-agnostic: it detects the current Snowflake user and
# derives all user-specific paths (secrets, workspace) automatically.
#
# Prerequisites:
#   1. cortex CLI installed and authenticated
#   2. A GITHUB_PAT secret in your personal DB (USER$<you>.PUBLIC.GITHUB_PAT)
#   3. A _ci_secrets.env file uploaded to your workspace stage
#
# To set up prerequisites 2 and 3, run:
#   bash automations/setup-secrets.sh
#
# Usage:
#   bash automations/register.sh
#   bash automations/register.sh -c my-connection

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONN_ARGS=("$@")

# Detect current Snowflake user
echo "Detecting Snowflake user..."
SF_USER=$(cortex exec --max-turns 1 --no-history --format json "${CONN_ARGS[@]}" \
  "Run this SQL and return ONLY the result value, nothing else: SELECT CURRENT_USER()" 2>/dev/null \
  | python3 -c "import sys,json
for line in sys.stdin:
  try:
    d=json.loads(line)
    if d.get('type')=='result' and d.get('result'):
      print(d['result'].strip()); break
  except: pass" 2>/dev/null || true)

if [ -z "$SF_USER" ]; then
  echo "Could not detect Snowflake user. Falling back to \$USER."
  echo "Enter your Snowflake username (uppercase):"
  read -r SF_USER
  SF_USER=$(echo "$SF_USER" | tr '[:lower:]' '[:upper:]')
fi

echo "Snowflake user: $SF_USER"

GITHUB_SECRET="USER\$${SF_USER}.PUBLIC.GITHUB_PAT"

echo ""
echo "Configuration:"
echo "  User:          $SF_USER"
echo "  GitHub secret: $GITHUB_SECRET"
echo "  Workspace:     USER\$${SF_USER}.PUBLIC.DEFAULT\$ (/_ci_secrets.env)"
echo "  Prompt:        ${SCRIPT_DIR}/ci-failure-prompt.md"
echo "  Schedule:      daily at 8am Europe/London"
echo ""
read -p "Continue? [y/N] " -r
[[ $REPLY =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

echo "Dropping existing automation (if any)..."
cortex automation drop ci_failure_responder "${CONN_ARGS[@]}" 2>/dev/null || true

echo "Creating automation..."
cortex automation create \
  --name ci_failure_responder \
  --prompt-file "${SCRIPT_DIR}/ci-failure-prompt.md" \
  --schedule "daily at 8am" \
  --timezone Europe/London \
  --github "${GITHUB_SECRET}" \
  --pre-run-hook 'source /workspace/_ci_secrets.env && cd /workspace && git clone https://github.com/Simple-Online-Healthcare/dbt-pipelines.git repo && cd repo' \
  "${CONN_ARGS[@]}"

echo ""
echo "Done. Verify with: cortex automation describe ci_failure_responder"
echo ""
echo "If you haven't set up secrets yet, run: bash automations/setup-secrets.sh"
