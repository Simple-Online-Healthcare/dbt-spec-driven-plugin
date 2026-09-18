# Requirements — Mandatory Looker Reconciliation for Semantic Views

Ticket: DATA-1797
Branch: feature/looker-reconciliation-gate

## Background

`agents/semantic-view-author.md` currently lists "Looker references" as an optional
input. On DATA-1762 this let a semantic view's boolean-flag metric silently match the
wrong Looker measure family (`open_*`, single-flag, no gating) instead of the explore's
default family (closed-funnel, cumulative AND-gate on every prior stage) — up to a 16%
discrepancy on `added_to_cart`, caught only by manual spot-check. The same explore repo
also has `acquisition_master`, whose *default* measures are actually open-funnel — the
opposite convention to `clickstream_session_funnel`'s defaults. Same-looking names,
opposite semantics, in different explores.

## Requirements (EARS)

- **REQ-001**: WHEN a semantic view is authored over a table that has a corresponding
  Looker explore/view, THE SYSTEM SHALL require `semantic-view-author` to locate that
  LookML and read the measure SQL verbatim (not just check whether Looker references
  were supplied by the caller) SO THAT metric definitions are checked against ground
  truth Looker already has, not assumed from measure names.
- **REQ-002**: WHEN reading Looker measure SQL for concept-mapping, THE SYSTEM SHALL
  flag any `filters:`-gated or cumulative measure as a "closed funnel" signal requiring
  explicit handling, and flag when multiple measure families exist over the same
  dimension (e.g. default vs `open_*`) SO THAT the wrong family isn't matched by name
  alone.
- **REQ-003**: WHERE a corresponding Looker explore exists for a semantic view under
  construction, THE SYSTEM SHALL require the spec's Validation Criteria to include a
  criterion reconciling fixed-period metric totals against the equivalent Looker
  measure(s), in addition to reconciling against the upstream dbt model SO THAT a view
  that matches its own dbt model but silently diverges from Looker is caught before
  shipping.
- **REQ-004**: WHEN `output-validator` validates a semantic view's `VAL-xxx` criteria and
  a Looker-reconciliation criterion is present, THE SYSTEM SHALL execute that
  reconciliation (query the Looker-equivalent measure for a fixed period and compare) as
  part of its normal data-delta step, not treat it as a criterion with no defined check
  SO THAT the requirement in REQ-003 is actually enforced, not just documented.

## Acceptance Criteria

1. `agents/semantic-view-author.md` no longer describes Looker references as optional
   when a matching explore exists; it names the required lookup step, ADR-003's LookML
   repo path, and the "read SQL verbatim" instruction.
2. `skills/spec-driven/references/semantic-views.md` has a named failure-mode section
   ("inconsistent measure families") documenting the open-vs-closed-funnel trap, with the
   `clickstream_session_funnel` / `acquisition_master` example from the ticket.
3. `skills/spec-driven/references/semantic-views.md` has a Validation Criteria template
   showing a `VAL-xxx` line for Looker reconciliation (Objective, tagged to a `REQ-id`).
4. `agents/output-validator.md`'s process explicitly handles a Looker-reconciliation
   criterion when one is present in the spec (query + compare + pass/fail evidence),
   alongside the existing dbt-model baseline diff — not as a silent no-op.

## Out of Scope

- Building any live Looker API integration — reconciliation is a manual/documented query
  step (Looker Explore -> run query for the period -> compare), same trust level as the
  existing `audit_helper` dbt-model diff.
- Retroactively re-validating already-shipped semantic views (e.g. `clickstream_funnel`
  from DATA-1762).
- Changes to `semantic-view-author.md`'s DDL-authoring mechanics (TABLES/METRICS/etc.) —
  only the input-handling and concept-mapping steps change.

## Validation Criteria

- **VAL-001** (Objective, REQ-001/002): `agents/semantic-view-author.md` diff contains a
  required (non-optional) Looker-lookup step naming ADR-003's LookML path and "read
  verbatim" instruction. Self-checked by re-reading the file post-edit.
- **VAL-002** (Objective, REQ-002): `semantic-views.md` diff contains the named failure
  mode section with the two-explore example. Self-checked by re-reading the file.
- **VAL-003** (Objective, REQ-003/004): `semantic-views.md` diff contains a Looker VAL
  template line, and `output-validator.md` diff adds a corresponding process step that
  consumes it. Self-checked by re-reading both files and confirming the template's
  `VAL-xxx` shape matches what `output-validator.md` expects as input.

All three criteria are Objective (text presence/consistency, no data involved) —
self-validatable: YES.
