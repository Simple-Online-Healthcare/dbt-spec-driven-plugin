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
