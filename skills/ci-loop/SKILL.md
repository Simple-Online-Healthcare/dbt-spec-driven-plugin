---
name: ci-loop
description: "Monitor PR checks and iterate on fixable CI failures until green or blocked. Use when a PR has failing or pending checks, when asked to fix CI, loop on CI, watch checks, or make the branch green. In the canonical workflow, ci-interpreter remains the final CI status authority."
tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Task"]
---

# CI Loop

Use this skill to watch PR checks, diagnose actionable failures, apply focused fixes, and
repeat until checks are green or clearly blocked.

The commands below assume the default CI surface — GitHub checks polled via the `gh` CLI.
If the Project Profile names a different **CI system**, use its equivalent commands and keep
the same loop structure.

## Boundaries

- Use the Profile's CI check listing (default: `gh pr checks`) as the source of truth for
  PR-attached checks.
- Do not replace `ci-interpreter`; after a loop in the canonical Ship phase, run or
  delegate `ci-interpreter` for the final CI classification.
- Do not merge, approve, retry endlessly, bypass hooks, or use `--no-verify`.
- Do not fix unrelated failures by broad refactor unless the user approves the scope.

## Workflow

1. Resolve the active PR from the current branch:
   `gh pr view --json number,url,headRefName,baseRefName`.
2. Inspect all attached checks:
   `gh pr checks --json name,bucket,state,workflow,link`.
3. If checks are pending, watch with `gh pr checks --watch --fail-fast`.
4. If checks fail, diagnose one actionable failure at a time:
   - For GitHub Actions, inspect failed logs with `gh run view <run-id> --log-failed`.
   - For external checks, open/report the check link and extract the failing command,
     model, test, assertion, or service if visible.
5. Classify each failure as `code/test`, `data`, `infra/transient`, or `unknown`.
6. Apply the smallest safe fix for `code/test` failures and rerun the local focused check
   before pushing when practical.
7. Push the fix, re-list the checks, and repeat.
8. Stop when checks are green, blocked by non-code/data/infra failure, or require user
   decision.

## Guardrails

- Keep each fix scoped to a single failure cause when possible.
- If the failure is flaky, retry once and record evidence that it was flaky.
- If the failure is unrelated to the PR and fixed on base, merge/rebase base only with
  user approval when it changes branch scope.
- If checks remain pending after a reasonable watch window, return `PENDING` with the
  check links.

## Output

```text
## CI loop status: GREEN | BLOCKED | PENDING
PR: <url>

## Iterations
- <check> -> <classification> -> <root error> -> <fix or action>

## Current check set
- <check name>: <state/bucket> <link>

## Next action
- <run ci-interpreter / wait / user decision / investigate data or infra>
```
