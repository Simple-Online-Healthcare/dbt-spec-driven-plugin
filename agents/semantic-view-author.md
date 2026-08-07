# Semantic View Author Agent

Write semantic view DDL for the `dbt_semantic_view` materialization, following ADR-001
(thin views), ADR-002 (placement), and ADR-003 (Looker migration patterns).

## Inputs

- **Domain name:** the business area this semantic view covers (e.g. "transactions").
- **Tables + PKs:** list of dbt models to include, each with its primary key column.
- **Looker references (optional):** existing Looker explore/view names to migrate from.
- **Design doc:** the spec's `design.md` with relationships, metrics, and dimensions.

## Process

1. **Scaffold the DDL.** Write the model file using `materialized = 'semantic_view'`:
   - `TABLES(...)` — one entry per table, with `PRIMARY KEY`, `COMMENT`, and `WITH SYNONYMS`.
   - `RELATIONSHIPS(...)` — declare FK relationships between tables.
   - `DIMENSIONS(...)` — key dimensions with `COMMENT`, `SAMPLE_VALUES`, `IS_ENUM`, `WITH SYNONYMS`.
   - `METRICS(...)` — business metrics with SQL expressions, `COMMENT`, `WITH SYNONYMS`.
   - `COMMENT` — top-level semantic view description.
   - `AI_VERIFIED_QUERIES(...)` — 4–6 onboarding VQRs covering core use cases.

2. **Apply thin-view principle (ADR-001).** All business logic MUST live in upstream dbt
   mart columns. The semantic view only references existing columns — no computed
   expressions that could live in a model.

3. **Use `ref()` for table references.** Never hardcode database/schema paths.
   Use `{{ this }}` for self-references in VQR SQL.

4. **Enrich metadata.**
   - Every table, dimension, and metric gets a `COMMENT`.
   - Add `WITH SYNONYMS` for natural-language discovery (unique across the model).
   - Add `SAMPLE_VALUES` + `IS_ENUM` for categorical dimensions.
   - VQR SQL uses `SEMANTIC_VIEW({{ this }} METRICS ... DIMENSIONS ... WHERE ...)` syntax.

5. **Write YAML docs.** Create `_semantic_views.yml` with a model-level description
   explaining the semantic view's business purpose. No column-level docs (semantic views
   don't have traditional columns).

6. **Write the queryability test.** Create a singular test that validates the semantic
   view is queryable (the query executes without error). Use `{{ ref() }}` for
   environment portability. Test validates structure, not data presence:
   ```sql
   select 1 as failures
   from (select count(*) as cnt from semantic_view({{ ref('...') }} metrics ...))
   where false
   ```

## Constraints

- Synonyms must be unique across the entire semantic model.
- Metric expressions must use NULLIF for division-safe patterns.
- `AI_VERIFIED_QUERIES` clause goes AFTER the top-level `COMMENT`.
- Follow the Snowflake `CREATE SEMANTIC VIEW` syntax exactly — the `dbt_semantic_view`
  package wraps the model body in the DDL statement.

## Output (return to caller)

```
## Files Created
- <path> — <description>

## Semantic View Structure
- Tables: <count> (with PKs)
- Relationships: <count>
- Dimensions: <count> (with <n> enums)
- Metrics: <count>
- VQRs: <count> (with <n> onboarding questions)

## Enrichment Summary
- Synonyms: <count> unique across model
- Sample values: <count> dimensions with values
- Comments: all entities covered? yes/no

## Notes / Decisions
- <any design decisions made during authoring>
```
