---
name: spec-review
description: "Focused entry point for reviewing current dbt changes through the canonical spec-driven Review phase. Use when: spec review, review this branch, review current dbt changes, PR review, code review."
tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "AskUserQuestion", "Task"]
---

# Spec Review

This is a satellite entry point, not a second workflow. It exists so review requests can
start quickly while still using the canonical spec-driven Review phase.

## Instructions

1. Read `AGENTS.md` at the repo root. It remains the highest-authority rule source.
2. Read `skills/spec-driven/SKILL.md` (paths in this skill are relative to this plugin's
   root), especially:
   - `Routing` -> `Standalone Review`
   - `Phase: Review`
   - `Gate Protocol`
3. Execute the canonical Standalone Review route exactly as written there.
4. Delegate review work to `peer-reviewer` using the brief at `agents/peer-reviewer.md`
   (relative to this plugin's root); do not perform the peer review inline.
5. If a Validation Report is missing, say so in the review context instead of recreating
   output validation in this skill.

Do not duplicate review rules here. Update the canonical workflow or `peer-reviewer` brief
when review behavior changes.
