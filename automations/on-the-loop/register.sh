#!/usr/bin/env bash
# Register the on-the-loop responder cloud automation.
#
# This script is user-agnostic: it detects the current Snowflake user and
# derives all user-specific paths (secrets, workspace) automatically.
#
# Prerequisites:
#   1. cortex CLI installed and authenticated
#   2. A GITHUB_PAT secret in your personal DB (USER$<you>.PUBLIC.GITHUB_PAT)
#   3. A _ci_secrets.env file uploaded to your workspace stage
#      (same prerequisites as the CI failure automation)
#
# For full setup instructions, see automations/on-the-loop/set_up.md
#
# Usage:
#   bash automations/on-the-loop/register.sh
#   bash automations/on-the-loop/register.sh -c my-connection

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
echo "  Prompt:        ${SCRIPT_DIR}/on-the-loop-prompt.md"
echo "  Schedule:      weekdays at 9am Europe/London"
echo ""
read -p "Continue? [y/N] " -r
[[ $REPLY =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

echo "Dropping existing automation (if any)..."
cortex automation drop on_the_loop_responder "${CONN_ARGS[@]}" 2>/dev/null || true

echo "Creating automation..."
cortex automation create \
  --name on_the_loop_responder \
  --prompt-file "${SCRIPT_DIR}/on-the-loop-prompt.md" \
  --schedule "weekdays at 9am" \
  --timezone Europe/London \
  --github "${GITHUB_SECRET}" \
  --pre-run-hook 'source /workspace/_ci_secrets.env && cd /workspace && git clone https://github.com/your-org/your-dbt-project.git repo && cd repo' \
  "${CONN_ARGS[@]}"

echo ""
echo "Done. Verify with: cortex automation describe on_the_loop_responder"
echo ""
echo "If you haven't set up secrets yet, see: automations/ci-failure/set_up.md"
echo "(The on-the-loop automation shares the same prerequisites.)"
