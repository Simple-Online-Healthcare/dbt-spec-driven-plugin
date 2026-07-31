# Codex adapter — dbt-spec-driven

Codex project config lives in `.codex/` (typically gitignored per developer machine).
This adapter does **not** duplicate the plugin — it tells you how to wire Codex to the
canonical paths in the installed plugin directory.

Below, `{{PLUGIN_ROOT}}` is the plugin location relative to your repository root, as
resolved by `scripts/install-agent-adapters.sh`.

## Always-on rules

Ensure sessions load `AGENTS.md` from the **repository root**. Codex and compatible
tools should treat it as mandatory project context (same as the Cortex SessionStart hook).

If your Codex setup supports an explicit instructions file, add a one-line pointer:

```
Mandatory rules: AGENTS.md (repo root). Workflow: {{PLUGIN_ROOT}}/skills/spec-driven/SKILL.md
```

## Workflow skill

When doing dbt feature/bug/refactor/review work, read and execute:

`{{PLUGIN_ROOT}}/skills/spec-driven/SKILL.md`

Satellite and capability entry points:

- `{{PLUGIN_ROOT}}/skills/spec-review/SKILL.md` — standalone review.
- `{{PLUGIN_ROOT}}/skills/spec-debt/SKILL.md` — read-only workflow debt reports.
- `{{PLUGIN_ROOT}}/skills/verify-this/SKILL.md` — falsifiable local verification.
- `{{PLUGIN_ROOT}}/skills/ci-loop/SKILL.md` — CI watch/fix loops.
- `{{PLUGIN_ROOT}}/skills/quality-audit/SKILL.md` — strict maintainability review.
- `{{PLUGIN_ROOT}}/skills/pr-ergonomics/SKILL.md` — PR preparation and cleanup.
- `{{PLUGIN_ROOT}}/skills/work-summary/SKILL.md` — status summaries.

Sub-agents: `{{PLUGIN_ROOT}}/agents/<name>.md`

## MCP

Your repo's `.codex/config.toml` may configure MCP servers (e.g. dbt, or the ticketing
system named in the Project Profile). That is separate from this plugin — keep MCP config
local; keep workflow logic in the plugin.

## Install

From your repository root:

```bash
<plugin-path>/scripts/install-agent-adapters.sh codex
<plugin-path>/scripts/check-adapter-drift.js
```

This prints setup reminders. Codex config is not committed (`.codex/` is gitignored).
