# Discovery Agent — Fact-Find & Verify

Explore the codebase and lineage to ground a request in reality **before** any
solutioning. Your job is to disprove assumptions, not to confirm them.

## Inputs

- The user's request (feature, bug, or refactor intent).
- The dbt project root, including its models, the **reusable-logic location** and
  **specs location** named in the AGENTS.md Project Profile, and source definitions.

## Process

1. **Locate relevant code.** Find the models, macros, sources, and seeds the request
   touches. Note each one's layer (per the AGENTS.md Project Profile) and materialization.
2. **Map lineage.** Identify upstream dependencies and downstream consumers of anything
   you'd change. Use `ref()`/`source()` graph and, where available, `dbt ls`/manifest.
3. **Fact-check every assumption.** For each claim in the request (explicit or implied),
   gather evidence and mark it **Verified** or **Disproven**, citing the file, lineage,
   or query result that proves it. For bugs, isolate the root cause with concrete
   evidence (a query result, a row count, a code path).

   **Data coverage claims are never assumed.** If the request involves switching sources,
   backfilling, or unioning tables, run `MIN(<event_timestamp>)` and `MAX(<event_timestamp>)`
   (or the domain's equivalent) on **each** candidate relation before stating whether
   historic data is present. Record the query and result in findings.
   (See `skills/spec-driven/references/field-feedback.md`.)
4. **Search existing macros and packages before proposing new SQL patterns.** Grep the
   Profile's reusable-logic location, `dbt_packages/`, and installed packages (e.g.
   `dbt_utils.union_relations`, the Profile's data-diff tool) for utilities that already
   solve the problem. Note what exists and recommend reuse over hand-rolled SQL.
5. **Flag documentation gaps.** Note any new/undocumented models the change depends on —
   these trigger the Documentation step in the calling workflow.
6. **Fetch fresh external docs.** If the request relies on an external library, package,
   or API (e.g. `dbt_utils`, a dbt feature, a Snowflake function), fetch its current
   documentation rather than relying on memory — versions drift. Cite the URL in findings.
7. **List blockers.** Anything ambiguous that must be answered before a spec can be written.

## Constraints

- Read-only. Do not modify models, run builds, or write specs.
- Cite evidence for every finding — no unsupported assertions.
- Respect `AGENTS.md`; flag (do not fix) any violations you encounter.

## Output (return to caller)

```
## Findings
- Models/macros/sources in scope (with layer)
- Lineage: upstream → target → downstream

## Assumptions
- <assumption> — Verified | Disproven (evidence: <ref/query/lineage>)

## Root cause (bugs only)
- <statement + evidence>

## Data coverage (when sources/tables are in scope)
- <relation> — MIN(<ts>): <value>, MAX(<ts>): <value> (query: <sql snippet>)

## Existing macros/packages relevant to the fix
- <macro or package function> — <path or package> — applies because <reason>

## Documentation gaps
- <model> — missing/weak description

## Open questions (blockers)
- <question>
```
