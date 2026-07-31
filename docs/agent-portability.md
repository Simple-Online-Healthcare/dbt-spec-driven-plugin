# Agent portability

How each development environment loads the mandatory rules, the canonical workflow, and the
satellite/capability entry points. Canonical behavior lives once in this plugin; host
entries below are thin adapters only.

This design extracts the portability pattern from
[`DietrichGebert/ponytail`](https://github.com/DietrichGebert/ponytail): keep the core
behavior in canonical skill files, give each host only enough wiring to find that core,
and fail fast when generated host copies drift.

Throughout this document, `<plugin>` is the plugin location relative to your repository
root — whatever `scripts/install-agent-adapters.sh` resolves and records in
`.cursor/.adapter-meta` as `PLUGIN_ROOT`.

## Portability patterns applied

- **Canonical core first.** Ponytail keeps behavior in `skills/` and compact rules in
  `AGENTS.md`; this plugin keeps the canonical workflow in
  `skills/spec-driven/SKILL.md`, sub-agent briefs in `agents/`, and mandatory rules in
  the consuming repo's root `AGENTS.md`.
- **Adapters are pointers, not forks.** Cursor, VS Code/Copilot, and Codex files name the
  canonical paths. They do not restate the phase machine, dbt rules, or sub-agent briefs.
- **Adapters are rendered, not hardcoded.** Templates carry a `{{PLUGIN_ROOT}}` token that
  the install script substitutes, so the same templates work wherever the plugin is
  vendored or installed.
- **Generated copies get drift checks.** Ponytail's `scripts/check-rule-copies.js`
  verifies copied rule files. This plugin uses `scripts/check-adapter-drift.js` to
  re-render `adapters/cursor/` and compare it against the generated `.cursor/`, and the
  VS Code template against `.github/copilot-instructions.md`.
- **Satellite skills stay small.** Ponytail exposes focused entry points such as review
  and debt collection. This plugin mirrors that with `spec-review` and `spec-debt`, both of
  which point back to canonical workflow artifacts instead of creating new workflows.
- **Capability skills are core, not add-ons.** Verification, strict quality review, CI
  loops, PR ergonomics, and work summaries ship in the canonical plugin and route through
  canonical artifacts.
- **Host features are wiring, not truth.** Hooks, commands, status lines, MCP wiring, and
  generated adapters can improve activation, but they must not become new sources of
  workflow truth.

## Host matrix

| Host | Always-on rules | Workflow and satellites | Adapter/install |
|------|-----------------|-------------------------|-----------------|
| **Cortex Code** | `hooks/hooks.json` SessionStart injects `AGENTS.md` and the Profile's context ledger when present | `/dbt-spec-driven:spec-driven`, `:spec-review`, `:spec-debt`, and the capability skills when installed | Native plugin; sync to `~/.snowflake/cortex/plugins/dbt-spec-driven/` |
| **Cursor** | `.cursor/rules/agents-md.mdc` points to `AGENTS.md` | `.cursor/skills/*/SKILL.md` points to canonical skills | `scripts/install-agent-adapters.sh cursor` |
| **VS Code / Copilot** | `.github/copilot-instructions.md` points to `AGENTS.md` | Same file lists canonical skill paths | `scripts/install-agent-adapters.sh vscode` |
| **Codex** | `AGENTS.md` at repo root is loaded as project context | Read canonical skill paths directly; see the Codex adapter README | `scripts/install-agent-adapters.sh codex` for reminders |
| **Manual / any editor** | Read `AGENTS.md` | Read `<plugin>/skills/<name>/SKILL.md` | No generated adapter required |

## Capability map

Capability skills extend the canonical workflow only where they do not duplicate the
existing data-specific sub-agents:

| Workflow phase | Capability |
|----------------|------------|
| Validate Output | `verify-this` for falsifiable local evidence on non-dbt surfaces |
| Review | `quality-audit` / `quality-auditor` for strict maintainability review after canonical peer review |
| Ship / CI | `ci-loop` for PR check monitoring and fix iteration |
| Post-gate | `pr-ergonomics` for reviewability, merge conflicts, and review comments; `work-summary` for status and handoffs |

Do not duplicate `discovery`, `test-author`, `output-validator`, `peer-reviewer`, or
`ci-interpreter`. Those canonical sub-agents still produce the workflow artifacts consumed
by the next gate.

## Canonical paths

```
AGENTS.md                                          # Layer 1 - rules (repo-owned, consuming repo root)
<plugin>/
  hooks/hooks.json                                 # Layer 2 - Cortex hooks only
  skills/spec-driven/SKILL.md                      # Layer 3 - canonical workflow
  skills/spec-driven/references/spec-documents.md  # Required spec document set
  skills/spec-driven/references/project-context.md # Continuous context capture rules
  skills/spec-driven/references/cross-repo-handoff.md # Downstream consumer context handoff
  skills/spec-driven/references/scheduled-mode.md  # Unattended execution + retry protocol
  skills/spec-driven/references/documentation.md   # Documentation patterns
  skills/spec-driven/references/field-feedback.md  # Observed failures and the fixes they drove
  skills/verify-this/SKILL.md                      # Capability - falsifiable local evidence
  skills/ci-loop/SKILL.md                          # Capability - PR CI watch/fix loop
  skills/quality-audit/SKILL.md                    # Capability - strict maintainability audit
  skills/pr-ergonomics/SKILL.md                    # Capability - PR preparation/reviewability
  skills/work-summary/SKILL.md                     # Capability - source-backed status summaries
  skills/spec-review/SKILL.md                      # Satellite - standalone review entry
  skills/spec-debt/SKILL.md                        # Satellite - read-only debt ledger
  agents/*.md                                      # Layer 4 - sub-agent briefs
  adapters/                                        # Thin host wiring templates
  scripts/install-agent-adapters.sh                # Renders host adapters
  scripts/check-adapter-drift.js                   # Fails if generated adapters drift
```

## Maintainer workflow

1. Edit canonical workflow logic in `skills/` or `agents/`, not in `.cursor/` or `.github/`.
2. Edit adapter templates under `adapters/` only when host wiring changes. Keep the
   `{{PLUGIN_ROOT}}` token — never hardcode a path.
3. Run `scripts/install-agent-adapters.sh all` after adapter template changes.
4. Run `scripts/check-adapter-drift.js` before committing.
5. Bump `version` in `.cortex-plugin/plugin.json` for meaningful plugin changes.

## What not to copy

Do not copy these into host adapters:

- Phase details from `skills/spec-driven/SKILL.md`.
- dbt engineering rules from `AGENTS.md`.
- Sub-agent process/output contracts from `agents/*.md`.
- Field-feedback narratives from `references/field-feedback.md`.

Adapters may name paths, activation triggers, and host-specific setup. If a host needs more
than that, add a generated adapter template and cover it in `check-adapter-drift.js`.
