---
name: verify-this
description: "Verify a falsifiable claim with fresh local evidence. Use when asked to prove behavior, compare before/after output, confirm a bug fix, measure a CLI/UI/API/performance claim, or gather evidence for a non-dbt surface. For dbt model output validation, keep using the canonical output-validator first."
tools: ["Read", "Write", "Glob", "Grep", "Bash", "Task"]
---

# Verify This

Use this skill to prove or disprove a specific claim with repeatable evidence.
Verification is not a recap, and it is not a substitute for `output-validator` on dbt data
outcomes.

## Boundaries

- For dbt model output and `VAL-xxx` data criteria, delegate to `output-validator`.
- Use this skill for local surfaces that `output-validator` does not own: CLI, UI, API,
  compiler/typecheck, smoke test, performance, memory, and user-visible behavior.
- If this skill produces evidence relevant to a spec criterion, link the evidence from
  the Validation Report or active `wbs.md`.

## Workflow

1. Restate the claim in falsifiable form: condition, metric, threshold, and expected
   direction.
2. Pick the smallest local surface that could disprove it.
3. Capture baseline and treatment with the same command, data, environment, warmup, and
   measurement window.
4. Compare raw artifacts: terminal output, query result, screenshot, accessibility
   snapshot, HTTP response, trace, profile, heap snapshot, or test output.
5. Return exactly one verdict: `VERIFIED`, `NOT VERIFIED`, or `INCONCLUSIVE`.

Read `references/local-surfaces.md` when the claim needs CLI/TUI, UI/browser, smoke test,
or compile/typecheck harness guidance.

## Artifact Rules

Use `/tmp/verify-this/<claim-slug>/` for disposable artifacts when it is safe:

```text
/tmp/verify-this/<claim-slug>/
  claim.md
  baseline/
  treatment/
  diff/
  verdict.md
```

Do not persist sensitive screenshots, prompts, HTTP bodies, heap dumps, credentials,
customer data, or direct personal identifiers unless the user explicitly approves.

## Verdict Rules

- `VERIFIED`: baseline and treatment differ in the predicted direction by the claimed
  threshold with no obvious confound.
- `NOT VERIFIED`: behavior is unchanged, moves the wrong way, misses the threshold, or
  the evidence contradicts the claim.
- `INCONCLUSIVE`: no valid baseline, noisy signal, failed measurement, or environment
  mismatch prevents a fair comparison.

## Output

```text
VERIFIED | NOT VERIFIED | INCONCLUSIVE
Claim: <falsifiable claim>

Evidence:
- <metric/artifact>: baseline=<...>, treatment=<...>, delta=<...>, threshold=<...>

Reasoning:
<one tight paragraph naming the evidence and any confounds>
```

Do not soften negative results. A clear `NOT VERIFIED` is useful.
