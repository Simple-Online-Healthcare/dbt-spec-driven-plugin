# Dashboard (Lightdash)

Intent for building or migrating a Lightdash dashboard. It slots into the normal phases
(Start, Discover, Decide, Build, Validate, Review, Ship). This file only covers what
differs. Blocking rules live in the **dashboards repo's** `AGENTS.md` (Profile:
**dashboards repo**, e.g. `Simple-Online-Healthcare/lightdash-dashboards`).

## The one rule that shapes everything

Snowflake semantic views are the only semantic layer. Lightdash models are
**generated** from them (`generator/sv_to_lightdash.py`, ADR-010 in the dbt repo) and
never hand-edited. A metric the dashboard needs that doesn't exist yet is a
**semantic-view change in the dbt repo**, delegated to `semantic-view-author`. So a
dashboard ticket often produces **two linked PRs**: dbt repo first, dashboards repo second.

## Start

Branch both repos with the same `<ticket-id>-<slug>`, but only once Discover shows the
dbt repo needs a change.

## Discover

- **Source of truth for the numbers.** For a Looker migration, recover the tile SQL from
  Snowflake query history with `scripts/recover_looker_dashboard.sql` (Looker's
  query comment has no dashboard id, so anchor on one tile of a scheduled run). Save the
  SQL under `reference/<dashboard>/`. For a new dashboard, the ground truth is
  agreed SQL from the requester.
- **Coverage.** For each tile, list its metrics and dimensions and look each one up in
  the semantic views (`DESCRIBE SEMANTIC VIEW`, or `lightdash/models/generated/`).
  Classify every field:
  - **Covered:** exists in a semantic view.
  - **Gap:** business metric or dimension missing from the view (goes to the dbt repo).
  - **Presentation:** Looker liquid, date switchers, formatting (ADR-003, done in Lightdash).
- **Grain hazards.** Look for an order-grain metric grouped by an item-grain dimension.
  Looker hid the fanout with symmetric aggregates. Lightdash `number` metrics don't, so
  this is a Decide question.
- **PII.** Will any new base table be exposed? Check its columns against ADR-008.
  The Lightdash SQL runner can read every column of a granted table.
- Read the nearest existing dashboard in `lightdash/dashboards/` and its mapping doc,
  and copy their conventions.

## Decide

Typical questions, each in the standard format with evidence:

- **Which semantic view owns each gap metric** (extend an existing view or create a new one).
- **The fanout cases:** move the dimension to the parent grain, or use the child-grain
  metric (a different number, so say which).
- **Which tile variants to keep** (Looker dashboards often have one tile per filter
  combination; Lightdash can use one chart plus dashboard filters).
- **Audience and space** (Git-managed, view-only).

The agreed plan lists, per tile: chart slug, semantic view metrics, parity reference,
and whether its Done-when check is Objective or Needs-human.

## Build

1. **dbt repo (if gaps):** delegate each gap to `semantic-view-author`, with the
   recovered Looker SQL as the measure definition. Ship that PR through the normal flow.
2. **Dashboards repo:**
   - Regenerate the models: `python generator/sv_to_lightdash.py --connection <conn>`.
   - New base table? Add it to `infra/snowflake/lightdash_access.sql`, or to
     `exclude_tables` in `generator/views.yml` if it holds PII.
   - Write or edit the chart and dashboard YAML. Prefer building in a preview
     (`lightdash start-preview`) and then `lightdash download`. Hand-written YAML is fine
     if `lightdash lint` passes.
   - Add one `tests/parity/<chart>.sql` per chart that returns 0 rows.
   - Update `docs/<dashboard>-mapping.md`.

Until the dbt PR is merged and deployed, the dashboards PR can only cover the tiles that
are already Covered. Say so in the PR and leave the rest listed as blocked.

## Validate

Delegate to `dashboard-validator` (not `output-validator`, which is for dbt models). It
returns **Self-validatable: YES / NO**. Layout and timezone bucketing on the running
instance are always Needs-human.

## Review

`peer-reviewer` with the dashboards diff. Its **Lightdash** review area applies.

## Ship

Dbt PR first. The dashboards PR links to it and states which tiles depend on it.
CI on the dashboards repo runs the drift check, grants, lint, compile, parity and preview.
Never merge.
