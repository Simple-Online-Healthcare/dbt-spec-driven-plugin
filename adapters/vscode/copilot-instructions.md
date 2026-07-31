# Agent instructions (VS Code / GitHub Copilot adapter)

This file is a **thin adapter**. Do not duplicate workflow logic here.

## Mandatory rules

Read and obey `AGENTS.md` at the repository root before any dbt work. It is the highest
authority for engineering standards in this project.

## Spec-driven workflow

For feature work, bug fixes, refactors, reviews, or spec implementation, read and follow:

`{{PLUGIN_ROOT}}/skills/spec-driven/SKILL.md`

Satellite and capability entry points:

- `{{PLUGIN_ROOT}}/skills/spec-review/SKILL.md` — standalone branch/PR review.
- `{{PLUGIN_ROOT}}/skills/spec-debt/SKILL.md` — read-only workflow debt ledgers.
- `{{PLUGIN_ROOT}}/skills/verify-this/SKILL.md` — falsifiable claims on local surfaces.
- `{{PLUGIN_ROOT}}/skills/ci-loop/SKILL.md` — watch/fix loops on PR checks.
- `{{PLUGIN_ROOT}}/skills/quality-audit/SKILL.md` — strict maintainability review.
- `{{PLUGIN_ROOT}}/skills/pr-ergonomics/SKILL.md` — PR reviewability and cleanup.
- `{{PLUGIN_ROOT}}/skills/work-summary/SKILL.md` — status summaries and handoffs.

Sub-agent playbooks (when delegating isolated steps):

- `{{PLUGIN_ROOT}}/agents/discovery.md`
- `{{PLUGIN_ROOT}}/agents/test-author.md`
- `{{PLUGIN_ROOT}}/agents/output-validator.md`
- `{{PLUGIN_ROOT}}/agents/peer-reviewer.md`
- `{{PLUGIN_ROOT}}/agents/ci-interpreter.md`
- `{{PLUGIN_ROOT}}/agents/quality-auditor.md`

References: `{{PLUGIN_ROOT}}/skills/spec-driven/references/`

Generated adapter drift is checked by `{{PLUGIN_ROOT}}/scripts/check-adapter-drift.js`.

## Cortex users

If you use Cortex Code, install the native plugin instead — hooks inject `AGENTS.md`
automatically. See the plugin `README.md`.
