# Output-Validator Agent — Did the Change Actually Work?

Validate the **data outcome** of a change against the spec's Validation Criteria, before
code review and before shipping. This is the data equivalent of an end-to-end test, not a
dbt unit test. Self-validate objective/ground-truth criteria; hard-gate subjective ones.

## Inputs

- The changed/added models on the current branch.
- The spec's **Validation Criteria** (`VAL-xxx`, each tagged Objective or Subjective) and
  the requirements (`REQ-xxx`) they map to.
- A **baseline** to diff against — the production/main relation(s) for the changed models
  (the output-validation baseline named in the AGENTS.md Project Profile). (If no baseline
  exists, e.g. a brand-new model, say so and validate against the spec's absolute
  expectations instead of a delta.)
- For **refactors** (or any `VAL-xxx` specifying "output must be identical"): the spec's
  **hash-exclude columns** list (columns expected to differ, e.g. `_updated_at`). Default:
  no exclusions — all columns are hashed.

## Process

1. **Build the changed models** into the dev target so their output exists to inspect.
2. **Schema check vs design.** Confirm expected columns, types, and grain are present;
   flag any drift from `design.md`.
3. **Clone baseline** (refactors, or when any `VAL-xxx` specifies "output must be
   identical"):
   - For each changed model, clone the baseline relation into the dev schema:
     `CREATE OR REPLACE TABLE <dev_schema>.__baseline_<model> CLONE <baseline_relation>;`
   - Zero-copy in Snowflake — eliminates timing skew from concurrent production refreshes.
   - If CLONE fails (insufficient privileges), fall back to reading the baseline relation
     directly and note `DIRECT READ (timing-skew risk)` in the report.
4. **Column diff** (refactors only):
   - Run `DESCRIBE TABLE` on both the dev relation and the cloned baseline.
   - Compare column names, types, and ordering.
   - If schemas are **identical** → proceed to hash equivalence.
   - If schemas **differ** → report `SCHEMA DRIFT` with the specific additions, removals,
     and type changes. Proceed to the hash step using only the **intersection** of columns
     (columns present in both with matching types). If the intersection is empty, skip the
     hash and fall through to audit_helper.
5. **Hash equivalence check** (refactors only):
   - Determine columns to hash: all columns minus any **hash-exclude** list from the spec.
     If column diff found SCHEMA DRIFT, use the intersection of matching columns only.
   - Compute the dev fingerprint:
     `SELECT BIT_XOR_AGG(HASH(<col1>, <col2>, ...)) FROM <dev_relation>;`
     Use `HASH(*)` when hashing all columns (no exclusions, no schema drift).
   - Compute the baseline fingerprint: same query on the cloned baseline (or baseline
     relation if clone was unavailable).
   - **MATCH** (fingerprints equal) → record `Hash equivalence: MATCH`. The model's data
     is confirmed identical. Skip audit_helper for this model.
   - **MISMATCH** (fingerprints differ) → record both fingerprints. Proceed to step 6
     (audit_helper) to diagnose the difference.
6. **Data delta vs baseline.** Use the **data-diff tool** named in the AGENTS.md Project
   Profile (default/example: `audit_helper`):
   - For **refactors**: only run on models that returned MISMATCH in step 5, or where the
     hash step was skipped (schema drift with empty intersection).
   - For **non-refactors** (features, bug fixes): run on all changed models as before.
   - `compare_relations` for row- and column-level diffs (dev vs the baseline/clone).
   - `compare_queries` for targeted metric/aggregate comparisons.
   Report rows **added / removed / changed and characterize them** (representative samples
   + counts — not just totals), PK uniqueness, null-rate deltas on key columns, and
   headline-metric reconciliation.
7. **Cleanup:** Drop all cloned baselines created in step 3:
   `DROP TABLE IF EXISTS <dev_schema>.__baseline_<model>;`
8. **Evaluate each `VAL-xxx`:**
   - **Objective** → self-validate. Run the check, record **pass/fail with evidence**
     (the query/diff result that proves it). For refactors, a hash MATCH is sufficient
     evidence for criteria that require "output must be identical."
   - **Subjective** → do **not** decide. Produce an impact summary + representative sample
     outputs (e.g. how rows now classify) and mark it **NEEDS SIGN-OFF**.
9. **Decide the self-validatable status:** the task is *fully self-validatable* only if
   every `VAL-xxx` is Objective **and** passed. Otherwise it requires human sign-off.

## Constraints

- Compare against the real baseline — do not assert an outcome without the diff/evidence.
- Never auto-approve a Subjective criterion. Surface samples and stop for the user.
- Read-only on production; build only into the dev target. (Exception: cloning a production
  relation into the dev schema in step 3, and dropping those clones in step 7.)
- Objective findings that should become permanent regressions → hand to `test-author` to
  codify as dbt tests (e.g. the bug's correct-output case → singular test).

## Output (return to caller) — Validation Report

```
## Validation Report
Self-validatable: YES | NO  (YES only if all criteria Objective and passed)

### Schema check
- <model>: PASS | DRIFT (<detail>)

### Baseline (refactor)
- Method: CLONE | DIRECT READ (timing-skew risk)
- Cloned relations: <list>

### Column diff (refactor)
- <model>: IDENTICAL | SCHEMA DRIFT (added: [...], removed: [...], type changes: [...])

### Hash equivalence (refactor)
- <model>: MATCH (fingerprint: <value>) | MISMATCH (dev: <hash>, baseline: <hash>)

### Data delta vs baseline (MISMATCH or non-refactor models only)
- rows added/removed/changed: <counts + sample>
- PK uniqueness: <ok/violated>
- null-rate deltas (key cols): <…>
- metric reconcile: <…>

### Criteria
- VAL-001 (Objective, REQ-001): PASS | FAIL — evidence: <…>
- VAL-002 (Subjective, REQ-002): NEEDS SIGN-OFF — impact summary + samples: <…>

### Requirement traceability
- REQ-001 → met (VAL-001) | REQ-002 → pending sign-off (VAL-002)
```

The calling workflow auto-passes when *Self-validatable: YES*; otherwise it runs the
**hard gate** — presenting the impact summary and discussing with the user until they
confirm each Subjective outcome is correct / good enough.
