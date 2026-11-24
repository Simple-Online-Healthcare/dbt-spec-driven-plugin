---
name: ci-loop
description: "Monitor PR checks, iterate on fixable CI failures, and resolve every CodeRabbit review comment until green or blocked. Use when a PR has failing or pending checks or open CodeRabbit comments, when asked to fix CI, auto-fix, loop on CI, watch checks, address CodeRabbit, or make the branch green. In the canonical workflow, ci-interpreter remains the final CI status authority."
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
3. If checks are pending, poll with a bound, not an unbounded watch:
   `gh pr checks --watch --fail-fast --interval 10` for at most **10 minutes**.
   If they are still pending when that deadline is hit, stop and return `PENDING`
   with the current check links. Do not leave `gh pr checks --watch` running.
4. If checks fail, diagnose one actionable failure at a time:
   - For GitHub Actions, inspect failed logs with `gh run view <run-id> --log-failed`.
   - For external checks, open/report the check link and extract the failing command,
     model, test, assertion, or service if visible.
5. Classify each failure as `code/test`, `data`, `infra/transient`, or `unknown`.
6. Apply the smallest safe fix for `code/test` failures and rerun the local focused check
   before pushing when practical.
7. Commit the focused fix (or tell the user to commit it) and confirm
   `git status --short` is clean for those files. Then push, re-list the checks,
   and repeat. Do not push uncommitted work.
8. Once checks are green (or only non-code failures remain), resolve CodeRabbit comments
   as below. If that produces a code change, commit, push, and go back to step 2.
9. Stop when checks are green and every CodeRabbit comment is resolved, or when blocked
   by a non-code/data/infra failure, or when a user decision is needed.

## CodeRabbit resolution

Every CodeRabbit comment gets exactly one outcome. None is skipped or left open.

1. Collect all of them, including inline review threads and the summary review's
   "actionable" and "nitpick" items:
   - `gh api repos/{owner}/{repo}/pulls/<n>/comments --paginate` (inline)
   - `gh api repos/{owner}/{repo}/pulls/<n>/reviews --paginate` (review bodies)
   - `gh api repos/{owner}/{repo}/issues/<n>/comments --paginate` (top-level)
   Filter to the CodeRabbit author (`coderabbitai[bot]`). Ignore threads already resolved
   and comments on outdated diffs that the current code no longer contains.
2. Decide each one on its merits. Read the code it points at; don't trust the summary.
   - **Fixed**: the issue is real and affects correctness, the agreed plan, tests, or
     clear maintainability. Make the smallest fix. Group fixes into one commit where
     possible.
   - **Logged**: real but minor (style, naming, a nice-to-have, an edge case that can't
     occur with current data). Append it to the relevant `_issues.md` (same location rules
     as the Review phase) with the comment link and a one-line description.
   - **Rejected**: wrong, already handled, contradicts an agreed decision or the Project
     Profile, or adds defensive code for a case that can't happen. Write down the specific
     reason, citing the code, decision, or evidence. "Not needed" is not a reason.
3. Reply on each thread with the outcome and, for Logged/Rejected, the reason or the
   `_issues.md` path. Then resolve every thread, Rejected included: an open thread blocks
   merge when the branch requires conversation resolution. The operator reviews
   rejections from the session report, not from open threads. Resolve via GraphQL
   (replies alone don't resolve anything):
   `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -F id=<thread node id>`
   Get thread node IDs from `pullRequest.reviewThreads` (query in step 6).
4. Fixes that change code: rerun the affected local tests before pushing. After the push,
   collect any new CodeRabbit comments and repeat. Apply the three-attempt rule: if the
   same comment keeps coming back after three fixes, stop and report it.
5. Report every rejection in the session (see Output). The operator reviews these; don't
   bury them in the PR thread only. In scheduled mode, also list them in the PR body.
6. Confirm GitHub agrees the comments no longer block merge. Don't report done on the
   strength of your own replies. Query:
   ```
   gh api graphql -F owner=<owner> -F repo=<repo> -F n=<pr> -f query='
   query($owner:String!,$repo:String!,$n:Int!){repository(owner:$owner,name:$repo){
     pullRequest(number:$n){
       reviewDecision mergeStateStatus mergeable
       reviewThreads(first:100){totalCount nodes{id isResolved isOutdated
         comments(first:1){nodes{author{login} url}}}}
       latestReviews(first:20){nodes{author{login} state}}}}}'
   ```
   Paginate `reviewThreads` if `totalCount` > 100. All of the following must hold:
   - every CodeRabbit thread has `isResolved: true`;
   - no CodeRabbit entry in `latestReviews` is `CHANGES_REQUESTED`. If there is one, post
     `@coderabbitai review` (or `@coderabbitai resolve`) and recheck after it responds.
     Don't dismiss the review yourself;
   - `mergeStateStatus` is not `BLOCKED` for a review or conversation reason. If it is
     `BLOCKED`, check branch protection (`gh api repos/{owner}/{repo}/branches/<base>/protection`)
     to see which rule is still unmet. Report a missing human approval as expected, not as
     a failure.
   If any check fails, report the exact field and value and the thread or review behind
   it. Don't claim resolution.

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

## CodeRabbit comments: <n fixed> fixed, <n logged> logged, <n rejected> rejected
GitHub state: threads resolved <x>/<total>; CodeRabbit review <state>; mergeStateStatus <value>
Remaining blocker (if any): <rule or field, e.g. 1 required human approval>
- Fixed: <file:line> - <issue> - <commit>
- Logged: <file:line> - <issue> - <_issues.md path>

## Rejected CodeRabbit suggestions (operator review)
- <comment link> - <file:line> - <what it suggested>
  Reason: <specific reason, with evidence>

## Current check set
- <check name>: <state/bucket> <link>

## Next action
- <run ci-interpreter / wait / user decision / investigate data or infra>
```
