---
name: pr-ergonomics
description: "Prepare, inspect, or clean up pull requests after the canonical workflow gates are satisfied. Use for make this PR easy to review, collect PR comments, resolve merge conflicts, prepare PR notes, or branch/PR ergonomics. Do not bypass the canonical Ship phase."
tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "AskUserQuestion"]
---

# PR Ergonomics

Use this skill to make a PR easier to review and operate on without changing the canonical
workflow gates.

## Boundaries

- Run this only after the required canonical workflow gates are satisfied, or for
  standalone PR review/comment collection.
- Do not replace the Ship phase. PR creation still follows the Project Profile's **PR
  template** (example: `.github/pull_request_template.md`), local health checks, and
  `ci-interpreter`.
- Do not rewrite history, force-push, merge, or broaden scope without explicit user
  approval.
- Keep unrelated local changes out of commits.

## Workflows

### Make A PR Easy To Review

1. Resolve the PR from the current branch or user-provided URL.
2. Inspect commits, diff size, changed paths, generated files, and current PR body.
3. Add or update reviewer guidance:
   - TL;DR matching the actual diff.
   - Core files vs generated/mechanical files.
   - Risk areas, validation evidence, rollout notes, and spec links.
4. Recommend splitting only when the PR is too large to make reviewable with notes.

### Collect PR Comments

1. Fetch review and discussion comments.
2. Group by severity and actionability.
3. Return a concise action list and open questions.
4. Do not mark threads resolved unless the user asks.

### Resolve Merge Conflicts

1. Detect conflicting files and conflict markers.
2. Resolve minimally, preserving both sides when safe.
3. Regenerate lockfiles with package manager tools instead of hand-editing.
4. Run focused build/lint/tests.
5. Stage resolved files only after summarizing resolution choices.

### Branch / PR Preparation

1. Ensure the working tree is clean or explicitly handled.
2. Confirm local health checks and spec artifacts.
3. Fill the Profile's PR template — typically description, motivation, checklist, change
   type, the ticket ID from the Profile's **ticketing** system, validation, and spec links.

## Output

```markdown
## PR Ergonomics

### Actions
- <action taken or recommended>

### Review Notes
- <reviewer guidance, comments, conflict choices, or PR body changes>

### Validation
- <checks run and result>

### Remaining Decisions
- <user decision needed, if any>
```
