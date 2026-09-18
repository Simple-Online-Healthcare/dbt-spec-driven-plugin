# Semantic Views — Reference

Canonical reference for semantic view conventions in this project. All sub-agents
should reference this document when working with `materialization: semantic_view` models.

---

## Architecture (ADRs)

- **ADR-001 — Thin views:** All business logic lives in dbt mart columns. The semantic
  view only references existing columns — no computed expressions.
- **ADR-002 — Placement:** Semantic views deploy to `DWH.SEMANTIC_VIEWS` via `+database: dwh`,
  `+schema: semantic_views` in `dbt_project.yml`. Models live in `models/semantic_views/`.
- **ADR-003 — Looker migration:** Maps Looker measures → metrics, Looker dimensions →
  dimensions, Looker explores → semantic views.

---

## DDL Structure

The `dbt_semantic_view` package (v1.0.3) provides a `semantic_view` materialization.
The model body starts directly with the clauses — no `CREATE OR REPLACE` prefix.

```sql
{{
  config(
    materialized = 'semantic_view'
  )
}}

TABLES (
    <alias> AS {{ ref('<model>') }}
      PRIMARY KEY (<col>)
      WITH SYNONYMS = ('synonym1', 'synonym2')
      COMMENT = '<description>'
)

RELATIONSHIPS (
    <name> AS <table>(<fk_col>) REFERENCES <ref_table>
)

DIMENSIONS (
    <table>.<col> AS <DISPLAY_NAME>
      WITH SYNONYMS = ('synonym')
      COMMENT = '<description>'
      SAMPLE_VALUES ('val1', 'val2')
      IS_ENUM
)

METRICS (
    <table>.<metric_name> AS <SQL_EXPRESSION>
      WITH SYNONYMS = ('synonym')
      COMMENT = '<business definition>'
)

COMMENT = '<top-level description>'

AI_VERIFIED_QUERIES (
    <vqr_name> AS (
      QUESTION '<natural language question>'
      SQL $$
        SELECT * FROM SEMANTIC_VIEW({{ this }} METRICS ... WHERE ...)
      $$
      VERIFIED_BY '(STEWARD = data_team)'
      ONBOARDING_QUESTION TRUE
    )
)
```

---

## Metric Patterns

### Simple aggregation
```sql
orders.gross_revenue AS SUM(GROSS_ORDER_VALUE)
  COMMENT = 'Item Price + Consultation Fee + Delivery - Discount'
```

### Derived ratio (division-safe)
```sql
orders.refund_rate AS
  COUNT(DISTINCT CASE WHEN CURRENT_ORDER_STATUS = 'Refunded' THEN ORDER_ID END)
  / NULLIF(COUNT(DISTINCT ORDER_ID), 0)
  COMMENT = 'Proportion of orders that were refunded'
```

### Conditional count
```sql
orders.new_orders AS COUNT(DISTINCT CASE WHEN IS_NEW_ORDER THEN ORDER_ID END)
  COMMENT = 'Orders where the patient is a first-time buyer'
```

---

## Relationship Patterns

```sql
-- One-to-many (child references parent)
order_items_to_orders AS order_items(ORDER_ID) REFERENCES orders

-- Dimension lookup
orders_to_patients AS orders(PATIENT_ID) REFERENCES patients
```

---

## VQR Syntax

```sql
AI_VERIFIED_QUERIES (
    <name> AS (
      QUESTION '<natural language question>'
      SQL $$
        SELECT *
        FROM SEMANTIC_VIEW(
            {{ this }}
            METRICS <metric1>, <metric2>
            DIMENSIONS <dim1>
            WHERE <filter>
        )
      $$
      VERIFIED_BY '(STEWARD = data_team)'
      ONBOARDING_QUESTION TRUE  -- shows in suggested prompts
    )
)
```

- Use `{{ this }}` for self-reference (resolves per environment).
- Mark 3–5 queries as `ONBOARDING_QUESTION TRUE` for Cortex Analyst suggested prompts.
- VQR clause goes AFTER the top-level `COMMENT`.

---

## Inconsistent Measure Families

**Failure mode:** a semantic view can reconcile perfectly against its own upstream dbt
model — via `output-validator`'s standard baseline diff — and still be **wrong**, if the
metric was mapped to the wrong measure family in the equivalent Looker explore. This is
a silent failure — no test catches it, because the mismatch is in *meaning*, not schema
or row counts. It's the reason Looker reconciliation is a separate, mandatory check (see
the Validation Criteria template below), not something the dbt-model diff subsumes.

**The trap:** the same underlying dimension can have multiple measure families in the
same explore, or the same-sounding default name can mean opposite things across
explores.

**Worked example (found on DATA-1762):**

- Looker's `clickstream_session_funnel` explore defines two parallel families per funnel
  stage:
  - Default/unprefixed measures — **closed-funnel**: a session only counts at stage N if
    it also satisfied every prior stage (cumulative `AND`-gate).
  - `open_*`-prefixed measures — **open-funnel**: a session counts at stage N if that
    single flag is true, with no gating on prior stages.
  - A semantic view metric written as a naive `COUNT(CASE WHEN <flag> THEN ...)` matches
    the `open_*` family, not the default one — on `added_to_cart` this produced a 16%
    silent discrepancy against the dashboard stakeholders trusted.
- `acquisition_master`'s explore inverts the convention: its *default* measures are
  **open**-funnel (inherited from `acquisition_master.sql`'s `count_if(single_flag)`
  logic), the opposite of `clickstream_session_funnel`'s defaults. Same-looking
  "default" measure names, opposite semantics, in different explores in the same LookML
  repo.

**How to check for it (mandatory per `semantic-view-author.md` step 0):**

1. Read the measure SQL verbatim — never infer behavior from the measure name alone.
2. If a measure has a sibling `filters:` parameter (gating which rows count, not embedded
   in the `sql:` value) or its `sql:` references other measures/stage flags cumulatively,
   it's a closed-funnel (or otherwise gated) definition — flag it.
3. If the explore defines more than one measure over the same dimension (e.g. a default
   and a prefixed variant), confirm explicitly which one the metric is meant to match —
   do not assume the unprefixed one is the "plain"/simplest definition.
4. Do not assume a naming convention holds across explores. Check each explore's
   convention independently, even if you've seen the pattern before in a sibling explore.

---

## Validation Criteria Template (Looker Reconciliation)

WHERE a corresponding Looker explore exists for the semantic view under construction,
the spec's Validation Criteria (Specify phase) MUST include a criterion reconciling
against it — in addition to (not instead of) the standard dbt-model reconciliation:

```
VAL-xxx (Objective, REQ-<id>): For a fixed period <date range>, the semantic view metric
  <table>.<metric> reconciles to the equivalent Looker measure <explore>.<measure> within
  <tolerance, default 0>. Evidence: metric query result vs Looker measure query result,
  same period and filters, both values shown.
```

`output-validator` executes this criterion as part of its normal data-delta step: run
the semantic view's metric for the period, run (or ask the user to run, if Looker access
is not agent-available) the equivalent Looker measure for the same period, and compare.
A tolerance above 0 must be justified in the spec (e.g. known timezone rounding) — default
to exact match.

---

## Synonym & Sample Value Rules

- Synonyms must be **unique across the entire semantic model** (no duplicates between
  tables, dimensions, and metrics).
- Add `SAMPLE_VALUES` for categorical dimensions where Cortex Analyst needs to know
  valid filter values.
- Add `IS_ENUM` alongside `SAMPLE_VALUES` for low-cardinality dimensions.
- Synonyms should cover natural-language variations users might ask (e.g. "AOV",
  "basket size", "average order value").

---

## Testing Pattern

Semantic views cannot use standard `unique`/`not_null` tests. Use a singular
queryability test that validates structure:

```sql
-- tests/semantic_view_<name>_queryable.sql
select 1 as failures
from (
    select count(*) as cnt
    from semantic_view(
        {{ ref('<semantic_view_model>') }}
        metrics <table>.<metric>
    )
)
where false
```

If the semantic view is broken, the inner query errors → dbt reports failure.
The `where false` ensures 0 rows on success.

---

## YAML Documentation

Minimal — model description only (no column-level docs):

```yaml
version: 2

models:
  - name: transactions
    description: >
      Core transactions semantic view for Cortex Analyst. Defines relationships
      between orders, order_items, patients, and payments with metrics for
      revenue, volume, and fulfilment analysis.
    config:
      materialized: semantic_view
```

---

## File Locations

| Artifact | Path |
|----------|------|
| Semantic view models | `dbt/models/semantic_views/` |
| YAML docs | `dbt/models/semantic_views/_semantic_views.yml` |
| Singular tests | `dbt/tests/semantic_view_<name>_queryable.sql` |
| Project config | `dbt/dbt_project.yml` → `semantic_views:` block |
| Package | `dbt/packages.yml` → `Snowflake-Labs/dbt_semantic_view: 1.0.3` |
