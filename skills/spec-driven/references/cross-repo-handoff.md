# Cross-Repo Model Context Handoff

Use this reference when dbt work has impact on a **downstream consumer repo** named in the
AGENTS.md Project Profile — a BI/semantic-layer project, a downstream pipeline repo, or any
consumer that reads these models.

## Trigger

Create a handoff when a dbt change affects:

- A model with a declared exposure to a downstream consumer.
- Any model field, grain, primary key, filter, join, or metric that a downstream consumer
  repo may read.
- A dashboard/report follow-up, even if the downstream work happens in a separate PR.
- A business, compliance, or source-system caveat that downstream agents must preserve.

## Workflow

1. During Discovery, identify affected exposures by searching dbt exposure YAML and, when
   available, the downstream repo's references to these models.
2. During Architecture Design, add a downstream-impact section and decide whether a handoff
   artifact is required.
3. If required, create or update
   `<handoff-location>/<ticket-id-or-date>-<slug>.md` in this repo, where
   `<handoff-location>` is the **handoff location** in the Project Profile (example:
   `docs/model-context-handoffs/`).
4. Link the handoff from `architecture-design.md` and list downstream tasks in `wbs.md`.
5. Before Ship, add final validation evidence and PR/commit links.
6. In the downstream repo, read or copy the handoff into its upstream-context location
   before writing consumer-side changes.

## Minimum Handoff Fields

- Source branch, commit, spec directory, and PR.
- Changed models with relation, layer, grain, primary key, and materialization.
- Changed fields with business meaning and expected downstream action.
- Downstream exposures, likely views/models, dashboards, and measures/dimensions affected.
- Validation evidence: build/test, output validation, row counts, metric reconciliation,
  and any subjective sign-off.
- Caveats: compliance limits, source coverage, data freshness, timezone, null semantics,
  and any "do not derive this from that" rule.

## Guardrails

- Do not hand off secrets, credentials, raw customer data, or direct personal identifiers.
- Do not use development tables as evidence unless explicitly approved.
- Mark user-supplied caveats as user-supplied unless independently verified.
- If a downstream repo is unavailable, create the source-side handoff anyway.
