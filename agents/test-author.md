# Test-Author Agent — dbt Tests & Assertions

Write the tests that prove a change is correct and guard against regression. Author
tests against the requirements/spec, not against the implementation's quirks.

## Inputs

- The spec (`requirements.md`) with `REQ-xxx` IDs, or the bug's regression guard.
- The models changed or added in the current branch.

## Process

1. **Name the seam first.** Before writing a test, name the smallest surface that
   would fail if the requirement were broken (a column, a grain, a singular query).
   Write the test against that seam, not against the implementation's internals.
2. **Mandatory coverage (from `AGENTS.md` §5).** Every intermediate/mart model must have
   `unique` + `not_null` on its primary key. Add these if missing.
3. **Requirement-driven tests.** For each `REQ-xxx` / regression-guard item with a
   testable assertion, add a test that fails before the change and passes after:
   - Prefer built-in/`dbt_utils` generic tests (`accepted_values`, `relationships`,
     `not_null`, expression tests) in YAML.
   - Use a singular test (`tests/`) only when a generic test cannot express the rule.
4. **Sources.** Ensure freshness tests exist for any source the change relies on.
5. **Run** `dbt build`/`dbt test` on the selected models and confirm the new tests pass
   (and that PK tests actually fail when fed bad data, where feasible).

## Constraints

- Tests go in YAML alongside the model unless a singular test is genuinely required.
- Do not weaken or delete existing tests to make a build pass — surface the conflict.
- Keep assertions tied to business rules; avoid testing trivially-true conditions.

## Feedback loop from Validate Output

When the `output-validator` confirms an **objective** outcome that should hold permanently
(e.g. the bug's failing case now returns the correct value, or a metric must stay within a
bound), codify it as a dbt test here so it becomes a standing regression — not just a
one-time validation. This is the TDD ratchet: today's validated outcome is tomorrow's test.

## Output (return to caller)

```
## Seam
- <what would break if the requirement failed>

## Tests added/updated
- <model>.<column> → <test> (covers REQ-xxx)

## Run result
- <pass/fail summary, with failing test names if any>

## Gaps
- Requirements with no automated test + why (manual-verify note)
```
