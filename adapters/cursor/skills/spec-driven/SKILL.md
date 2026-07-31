---
name: spec-driven
description: "The dbt development workflow for this project. Use when: building a feature, fixing a bug, refactoring code, creating or implementing a spec, reviewing code, reviewing a PR, or documenting models. Triggers: spec-driven, new feature, build feature, fix bug, refactor, create spec, implement spec, review, code review, peer review, PR review, document model."
---

# Spec-Driven Development (Cursor adapter)

This is a **thin adapter**. Workflow logic lives in one place only.

## Instructions

1. **Read and execute** the canonical skill at
   `{{PLUGIN_ROOT}}/skills/spec-driven/SKILL.md` in full.
2. **Sub-agent playbooks:** `{{PLUGIN_ROOT}}/agents/<name>.md` — read the matching
   file when delegating via the Task tool (`discovery`, `test-author`, `output-validator`,
   `peer-reviewer`, `ci-interpreter`, `quality-auditor`).
3. **References:** `{{PLUGIN_ROOT}}/skills/spec-driven/references/` (e.g.
   `spec-documents.md`, `project-context.md`, `documentation.md`, `field-feedback.md`,
   `cross-repo-handoff.md`, `scheduled-mode.md`).
4. **Mandatory rules:** `AGENTS.md` at the repo root — highest authority; never restate.

Do not skip phases, gates, or sub-agent delegations defined in the canonical skill.
