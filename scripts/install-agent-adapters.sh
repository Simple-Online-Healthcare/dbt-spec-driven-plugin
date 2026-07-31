#!/usr/bin/env bash
# Install thin host adapters for dbt-spec-driven (pointers only — canonical core unchanged).
#
# Adapter templates contain the token {{PLUGIN_ROOT}}. This script replaces it with the
# plugin's path relative to your repository root, so the generated adapters work no matter
# where you vendored or installed the plugin.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
ADAPTERS="$PLUGIN_DIR/adapters"

HOST=""
TARGET=""

usage() {
  cat <<'EOF'
Usage: install-agent-adapters.sh <cursor|vscode|codex|all> [--target <repo-root>]

Installs thin adapter files that point at the plugin (no workflow duplication).

  cursor  — render adapters/cursor/  -> <repo-root>/.cursor/
  vscode  — render adapters/vscode/  -> <repo-root>/.github/copilot-instructions.md
  codex   — print Codex setup reminders ( .codex/ is gitignored )
  all     — cursor + vscode + codex reminders

--target defaults to the git top-level of the current directory, else $PWD.

For cursor, the generated .cursor/{skills,agents,rules} directories are fully owned by
this script and are replaced on each run. Other .cursor/ contents are left untouched.

After syncing committed adapters, run scripts/check-adapter-drift.js.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    cursor|vscode|codex|all) HOST="$1"; shift ;;
    --target) TARGET="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument '$1'" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$HOST" ]]; then
  usage
  exit 1
fi

if [[ -z "$TARGET" ]]; then
  TARGET="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
fi

if [[ ! -d "$TARGET" ]]; then
  echo "error: target repo root not found: $TARGET" >&2
  exit 1
fi

TARGET="$(cd "$TARGET" && pwd -P)"
PLUGIN_REL="$(python3 -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$PLUGIN_DIR" "$TARGET")"

render() {
  # render <src-file> <dest-file>
  mkdir -p "$(dirname "$2")"
  sed "s|{{PLUGIN_ROOT}}|$PLUGIN_REL|g" "$1" > "$2"
}

render_tree() {
  # render_tree <src-dir> <dest-dir>
  local src="$1" dest="$2" rel
  while IFS= read -r file; do
    rel="${file#"$src/"}"
    render "$file" "$dest/$rel"
  done < <(find "$src" -type f)
}

install_cursor() {
  if [[ ! -d "$ADAPTERS/cursor" ]]; then
    echo "error: missing $ADAPTERS/cursor" >&2
    exit 1
  fi
  local dest="$TARGET/.cursor"
  rm -rf "$dest/skills" "$dest/agents" "$dest/rules"
  render_tree "$ADAPTERS/cursor" "$dest"
  printf 'PLUGIN_ROOT=%s\nSOURCE=adapters/cursor\n' "$PLUGIN_REL" > "$dest/.adapter-meta"
  echo "Installed Cursor adapters -> $dest/ (plugin root: $PLUGIN_REL)"
}

install_vscode() {
  render "$ADAPTERS/vscode/copilot-instructions.md" "$TARGET/.github/copilot-instructions.md"
  echo "Installed VS Code / Copilot adapter -> $TARGET/.github/copilot-instructions.md"
}

install_codex() {
  sed "s|{{PLUGIN_ROOT}}|$PLUGIN_REL|g" "$ADAPTERS/codex/README.md"
  echo ""
  echo "Codex: ensure AGENTS.md at repo root is loaded each session."
  echo "Workflow: $PLUGIN_REL/skills/spec-driven/SKILL.md"
}

case "$HOST" in
  cursor) install_cursor ;;
  vscode) install_vscode ;;
  codex)  install_codex ;;
  all)
    install_cursor
    install_vscode
    install_codex
    ;;
esac
