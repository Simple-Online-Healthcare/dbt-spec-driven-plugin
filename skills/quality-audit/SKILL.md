---
name: quality-audit
description: "Run a strict maintainability and structure audit on current changes. Use for deep code quality review, structural audit, AI slop cleanup, large diff review, abstraction quality, file-size/spaghetti checks, or non-dbt code review. For dbt model review, run the canonical peer-reviewer first."
tools: ["Read", "Glob", "Grep", "Bash", "Task"]
---

# Quality Audit

Use this skill for a demanding review of implementation quality, maintainability,
abstraction boundaries, file size, and accidental complexity.

## Boundaries

- For dbt model changes in the canonical workflow, run `peer-reviewer` first. Use this as
  an additional strict pass, especially when non-model code, tooling, hooks, scripts, or
  large workflow edits are involved.
- Do not relitigate objective `AGENTS.md` rule failures; surface those as blockers and
  route them back to the canonical workflow.
- Do not treat style nits as equivalent to structural regressions.

## Workflow

1. Gather the current branch diff, changed file list, and relevant full file contents.
2. Invoke or follow the brief at `agents/quality-auditor.md` (relative to this plugin's
   root) with the diff and file contents.
3. Prioritize findings that would make the codebase harder to reason about:
   - avoidable complexity
   - file-size sprawl
   - ad hoc branches and special cases
   - weak type or data boundaries
   - unnecessary wrappers or pass-through abstractions
   - duplicated helpers instead of canonical utilities
   - feature logic leaking into the wrong module/layer
4. For AI-generated slop, prefer behavior-preserving cleanup: remove gratuitous comments,
   abnormal defensive code, unnecessary casts, and nested flow that can be direct.
5. Return actionable findings ordered by severity. If no meaningful issues exist, say so.

## Output

```markdown
## Quality Audit

### High
- <structural issue> -> <recommended fix>

### Medium
- <maintainability issue> -> <recommended fix>

### Low
- <minor cleanup, grouped>

### No-Issue Notes
- <what was checked and why it is acceptable>
```
