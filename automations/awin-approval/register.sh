#!/usr/bin/env bash
# Register the Awin order approval cloud automation.
#
# Prerequisites:
#   1. cortex CLI installed and authenticated
#   2. AWIN_API_TOKEN added to your workspace secrets file (_ci_secrets.env)
#   3. AWIN_ADVERTISER_ID set in automations/config.env
#
# Usage:
#   bash automations/awin-approval/register.sh
#   bash automations/awin-approval/register.sh -c my-connection

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUTO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONN_ARGS=("$@")

# Load config
CONFIG_FILE="${AUTO_DIR}/config.env"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "Missing ${CONFIG_FILE}"
  echo "Copy automations/config.env.example to automations/config.env and fill in your values."
  exit 1
fi
# shellcheck source=../config.env
source "$CONFIG_FILE"

if [ "${AWIN_ADVERTISER_ID}" = "<your-advertiser-id>" ] || [ -z "${AWIN_ADVERTISER_ID:-}" ]; then
  echo "Error: AWIN_ADVERTISER_ID is not set in ${CONFIG_FILE}"
  echo "Set it to your Awin advertiser ID before registering."
  exit 1
fi

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

echo ""
echo "Configuration:"
echo "  User:            $SF_USER"
echo "  Workspace:       USER\$${SF_USER}.PUBLIC.DEFAULT\$ (/_ci_secrets.env)"
echo "  Prompt:          ${SCRIPT_DIR}/awin-approval-prompt.md"
echo "  Advertiser ID:   $AWIN_ADVERTISER_ID"
echo "  Schedule:        every Monday at 9am Europe/London"
echo ""
read -p "Continue? [y/N] " -r
[[ $REPLY =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

echo "Dropping existing automation (if any)..."
cortex automation drop awin_order_approval "${CONN_ARGS[@]}" 2>/dev/null || true

# Substitute placeholders in the prompt template
PROMPT_TMP=$(mktemp)
trap 'rm -f "$PROMPT_TMP"' EXIT
sed \
  -e "s|<your-advertiser-id>|${AWIN_ADVERTISER_ID}|g" \
  -e "s|<your-voucher-param>|${AWIN_VOUCHER_PARAM}|g" \
  "${SCRIPT_DIR}/awin-approval-prompt.md" > "$PROMPT_TMP"

echo "Creating automation..."
cortex automation create \
  --name awin_order_approval \
  --prompt-file "$PROMPT_TMP" \
  --schedule "every Monday at 9am" \
  --timezone Europe/London \
  --pre-run-hook "source /workspace/_ci_secrets.env" \
  --eai AWIN_API_EAI \
  "${CONN_ARGS[@]}"

echo ""
echo "Done. Verify with: cortex automation describe awin_order_approval"
