# Host adapters — thin wiring, canonical core unchanged

The **canonical** workflow lives in the plugin root (`skills/`, `agents/`, `hooks/`,
`.cortex-plugin/`). Host adapters here are **pointers only** — they tell each agent
environment where to load rules, the workflow skill, and sub-agent playbooks. They must
not duplicate workflow prose (drift risk).

Adapter templates contain the token `{{PLUGIN_ROOT}}`.
`scripts/install-agent-adapters.sh` replaces it with the plugin's path relative to your
repository root, so the same templates work wherever you vendor or install the plugin.
Never hardcode a path into a template.

## Layout

| Host | Adapter path | Generated into consuming repo | Always-on rules |
|------|--------------|-------------------------------|-----------------|
| **Cortex** | Native — `.cortex-plugin/` + `hooks/hooks.json` | Install plugin to `~/.snowflake/cortex/plugins/` | SessionStart hook reads `AGENTS.md` and the Profile's context ledger |
| **Cursor** | `adapters/cursor/` | `.cursor/` | `.cursor/rules/agents-md.mdc` |
| **VS Code (Copilot)** | `adapters/vscode/copilot-instructions.md` | `.github/copilot-instructions.md` | Pointer to `AGENTS.md` |
| **Codex** | `adapters/codex/README.md` | Local `.codex/` (gitignored) — see Codex README | `AGENTS.md` at repo root |

## Capability skills

The capability skills (`verify-this`, `ci-loop`, `quality-audit`, `pr-ergonomics`,
`work-summary`) and satellites (`spec-review`, `spec-debt`) belong in canonical
`skills/`, not in generated adapters. Keep their phase mapping in
`skills/spec-driven/SKILL.md` and avoid copying workflow prose into `.cursor/`,
`.github/`, or Codex reminder files.

## Canonical paths (relative to the plugin root)

| Content | Path |
|---------|------|
| Mandatory rules | `AGENTS.md` (in the **consuming repo root**, not the plugin) |
| Workflow skill | `skills/spec-driven/SKILL.md` |
| Satellite skills | `skills/spec-review/`, `skills/spec-debt/` |
| Capability skills | `skills/verify-this/`, `skills/ci-loop/`, `skills/quality-audit/`, `skills/pr-ergonomics/`, `skills/work-summary/` |
| Sub-agents | `agents/<name>.md` (including `quality-auditor` for strict maintainability review) |
| References | `skills/spec-driven/references/` (`spec-documents.md`, `project-context.md`, `cross-repo-handoff.md`, `documentation.md`, `field-feedback.md`, `scheduled-mode.md`) |

## Install

From the repository that consumes the plugin:

```bash
<plugin-path>/scripts/install-agent-adapters.sh cursor   # Cursor only
<plugin-path>/scripts/install-agent-adapters.sh vscode   # GitHub Copilot instructions
<plugin-path>/scripts/install-agent-adapters.sh codex    # Codex setup reminders
<plugin-path>/scripts/install-agent-adapters.sh all      # All non-Cortex hosts
<plugin-path>/scripts/check-adapter-drift.js             # Fail if committed adapters drift
```

Cortex users: sync the plugin per `README.md` (no adapter install needed).

`install-agent-adapters.sh cursor` fully owns `.cursor/skills`, `.cursor/agents`, and
`.cursor/rules` — those are replaced on every run. Anything else in `.cursor/` is left
alone. The generated `.cursor/.adapter-meta` records the resolved `PLUGIN_ROOT` so the
drift checker can re-render templates identically.

Full portability matrix: `docs/agent-portability.md`.
