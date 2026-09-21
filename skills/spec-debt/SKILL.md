---
name: spec-debt
description: "Report unresolved spec-driven workflow debt: skipped gates, stale issue ledgers, field-feedback follow-ups, and explicit spec-debt markers. Use when: spec debt, workflow debt, list unresolved spec-driven follow-ups, spec-driven ledger."
tools: ["Read", "Glob", "Grep", "Bash"]
---

# Spec Debt

This is a read-only satellite skill for finding unresolved spec-driven follow-ups. It does
not replace the canonical workflow in `skills/spec-driven/SKILL.md` (plugin-relative path).

## Scan

Look for debt in these places. `<specs>` and `<models>` are the **specs location** and
**models location** named in the AGENTS.md Project Profile (examples: `dbt/specs/`,
`dbt/models/`).

- `<specs>/**/workflow-state.md` rows that are incomplete, skipped, missing gates, or
  marked `blocked`.
- `<models>/**/*_issues.md` review items that remain unimplemented.
- This plugin's `skills/spec-driven/references/field-feedback.md` entries whose plugin
  actions imply future hardening. This file lives in the plugin, not the dbt repo — skip
  this source silently if the plugin directory is not reachable from the working tree.
- Explicit `spec-debt:` comments or Markdown notes anywhere outside `.git`, build output,
  and dependency directories.

## Output

Return a ledger grouped by source:

`<file>:<line> - <debt>. trigger: <what should make the team fix it>.`

Tag rows with:

- `gate` - workflow state shows a missing approval, delegation, or transition artifact.
- `review` - an `_issues.md` item is still open.
- `feedback` - field feedback has a follow-up not yet encoded.
- `marker` - explicit `spec-debt:` marker found in code or docs.
- `no-trigger` - the item has no clear revisit trigger.

End with `<N> debt items, <M> with no trigger.` If nothing is found, return:
`No spec-driven debt found.`

## Boundaries

Read and report only. Do not edit files, update the ticketing system, or create a ledger
file unless the user explicitly asks to persist the report.
