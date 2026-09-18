# Semantic View Author Agent

Write semantic view DDL for the `dbt_semantic_view` materialization, following ADR-001
(thin views), ADR-002 (placement), and ADR-003 (Looker migration patterns).

## Inputs

- **Domain name:** the business area this semantic view covers (e.g. "transactions").
- **Tables + PKs:** list of dbt models to include, each with its primary key column.
- **Looker references:** existing Looker explore/view names to migrate from, if supplied
  by the caller. Whether or not one is supplied, step 0 below still applies — the check
  is for whether a matching explore *exists*, not whether the caller mentioned one.
- **Design doc:** the spec's `design.md` with relationships, metrics, and dimensions.

## Process

0. **Locate the equivalent Looker explore (required whenever one exists — REQ-001).**
   Before mapping any measure to a metric:
   - Check whether a Looker explore/view already exists over the same or a related
     upstream table (search the LookML repo path noted in ADR-003, not just the caller's
     supplied references — a caller may not know one exists).
   - If found, **read the measure SQL verbatim**, not just the measure names. Checking
     names only is what caused the DATA-1762 discrepancy (see
     `references/semantic-views.md#inconsistent-measure-families`).
   - Flag any `filters:`-gated or cumulative measure as a "closed funnel" signal —
     it requires an explicit gated aggregate (e.g. `AND`-chained conditions across every
     prior stage), not a plain boolean-flag count.
   - Flag when the explore defines **multiple measure families over the same underlying
     dimension** (e.g. default vs `open_*` prefixed measures). Confirm which family the
     metric under construction is actually meant to reconcile against — do not assume the
     unprefixed/default-looking name is the simplest or most common definition; per
     `semantic-views.md`, the "default" convention is not consistent across explores.
   - If no matching explore exists, note that in the authoring output and proceed — this
     step is a required *check*, not a required *finding*.

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

## Looker Reconciliation Check
- Matching explore found: yes/no (<explore name> or "none")
- Measure families found: <n> (flag any closed-vs-open or default-vs-prefixed split)
- Reconciliation VAL criteria added to spec: yes/no

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
