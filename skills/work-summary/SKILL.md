---
name: work-summary
description: "Summarize completed work, weekly progress, ticket status, branch changes, validation evidence, or handoff notes from local git history and spec artifacts. Use for what did I get done, weekly review, status update, demo notes, or concise stakeholder summaries."
tools: ["Read", "Glob", "Grep", "Bash"]
---

# Work Summary

Use this skill to produce concise, source-backed status summaries from local repository
evidence and the workflow's spec artifacts.

## Boundaries

- Default to read-only inspection. Do not post to any external system — the Project
  Profile's **ticketing** system, chat, wiki, or code host — unless the user explicitly asks.
- Do not claim uncommitted local changes as completed work unless they are clearly part of
  the requested summary and are labeled as uncommitted.
- Do not include secrets, credentials, direct contact/payment identifiers, or private local
  config contents.
- Prefer source evidence over memory: commits, `git status`, changed paths, spec docs,
  validation reports, PR descriptions, and ticket IDs.
- Separate completed work from in-progress work and open decisions.

## Inputs To Inspect

Use only the inputs that fit the request:

1. Current branch and status: `git status --short`, `git branch --show-current`.
2. Commit history: `git log --oneline --decorate --max-count <n>` or a user-provided
   range.
3. Diff/stat evidence: `git diff --stat`, `git diff --cached --stat`, or a commit range.
4. Workflow artifacts: `project-charter.md`, `prd.md`, `architecture-design.md`,
   `wbs.md`, `workflow-state.md`, the Validation Report, `_issues.md`, and the Project
   Profile's **context ledger**.
5. PR metadata or review comments only when available through an approved connector or CLI.

## Workflow

1. Identify the requested time/range/scope. If absent, use the current branch since its
   upstream divergence or the last 10 commits, whichever is clearer.
2. Gather evidence with local commands and cite commit hashes, paths, or spec artifact
   names.
3. Group the work by user-relevant outcomes, not by commit mechanics.
4. Call out validation evidence separately from implementation claims.
5. List pending work, blocked items, and explicit follow-ups only when they are supported
   by the repo state or spec docs.
6. If the user asks for demo notes, keep them brief and audience-facing; avoid making
   reviewers read contracts or internal process details.

## Output

For short status updates:

```markdown
<1-3 concise paragraphs, source-backed, audience appropriate>
```

For structured weekly/status summaries:

```markdown
## Summary
- <completed outcome with source evidence>

## Validation
- <check, report, or evidence>

## Still Open
- <pending work or decision>
```

For handoffs:

```markdown
## Completed
- <done item>

## Evidence
- <commit/spec/check>

## Next
- <next actionable step>
```
