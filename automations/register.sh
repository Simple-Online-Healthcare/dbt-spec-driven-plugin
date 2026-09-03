#!/usr/bin/env bash
# Register the CI failure responder cloud automation.
#
# Prerequisites:
#   - cortex CLI installed and authenticated
#   - GITHUB_PAT secret in USER$<you>.PUBLIC (for git/gh access)
#   - _ci_secrets.env uploaded to your workspace stage (contains JIRA_TOKEN_B64)
#
# This script is idempotent: drop the existing automation first if re-registering.
#
# Usage:
#   bash automations/register.sh
#   bash automations/register.sh --connection my-connection

set -euo pipefail

CONNECTION="${1:---connection XY96049}"

echo "Dropping existing automation (if any)..."
cortex automation drop ci_failure_responder $CONNECTION 2>/dev/null || true

echo "Creating automation..."
cortex automation create \
  --name ci_failure_responder \
  --prompt-file "$(dirname "$0")/ci-failure-prompt.md" \
  --schedule "daily at 8am" \
  --timezone Europe/London \
  --github 'USER$LIAMOWEN.PUBLIC.GITHUB_PAT' \
  --pre-run-hook 'source /workspace/_ci_secrets.env && cd /workspace && git clone https://github.com/Simple-Online-Healthcare/dbt-pipelines.git repo && cd repo' \
  $CONNECTION

echo "Done. Verify with: cortex automation describe ci_failure_responder"
