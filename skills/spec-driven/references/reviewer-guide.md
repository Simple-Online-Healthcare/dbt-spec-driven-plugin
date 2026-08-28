# Reviewer Guide — AI-Generated PRs

How to review PRs produced by the "on the loop" autonomous workflow. The process is the
same as reviewing any PR, with a few additional artifacts to help you.

---

## What You'll See in an AI PR

AI-generated PRs include artifacts that human PRs typically don't:

| Artifact | Location | Purpose |
|----------|----------|---------|
| **Spec** (`requirements.md`) | `dbt/specs/<date>-<name>/` | The requirements the agent worked against |
| **Design** (`design.md`) | Same directory | Technical approach (features/refactors) |
| **Validation Report** | `dbt/specs/<date>-<name>/workflow-state.md` or linked | Data correctness evidence |
| **Issues log** (`_issues.md`) | `dbt/models/<folder>/` | Unimplemented peer-review suggestions |
| **Verbose commit messages** | Git log | Reference ticket ID and REQ numbers |

---

## What to Check

### 1. Does it match the spec?

Read the `requirements.md`. Every `REQ-xxx` should be addressed. If a requirement is
missing from the implementation, reject.

### 2. Do tests pass?

- CI checks should be green.
- The Validation Report in `workflow-state.md` confirms data correctness.
- If CI is red, do not approve — even if the code looks fine.

### 3. AGENTS.md compliance?

Spot-check against the blocking rules:
- Layer architecture respected (§1)?
- Naming conventions followed (§2)?
- No hardcoded references (§3)?
- Documentation present (§4)?
- Primary key tests exist (§5)?
- Non-obvious logic commented (§10)?

You don't need to verify every rule — the agent and peer-reviewer sub-agent already
checked. But confirm the high-signal ones.

### 4. Is the logic correct?

- Does the SQL do what the requirements say?
- Are joins correct (type, keys, NULL handling)?
- Are filters dropping the right rows?
- Is the grain correct (no unintended fan-out or dedup)?

### 5. Is it safe to merge?

- No unintended changes to existing models.
- No accidental breaking changes to downstream consumers.
- No sensitive data exposed.

---

## When to Approve

All of these must be true:

- [ ] CI checks pass (green).
- [ ] Requirements are satisfied.
- [ ] Data validation is clean.
- [ ] Code is correct and safe.
- [ ] No AGENTS.md violations visible.

If all true → **Approve and merge.**

---

## When to Reject

Reject if **any** of these apply:

| Reason | How to communicate |
|--------|-------------------|
| Logic error (wrong join, bad filter, incorrect grain) | Comment on the specific line with what's wrong and what's expected |
| Missing requirement (REQ not implemented) | Reference the REQ ID: "REQ-003 is not addressed" |
| AGENTS.md violation | Reference the section: "Violates §2 naming — should be `is_active` not `active_flag`" |
| Test failure | "CI is red: [test name] fails. Fix before re-review." |
| Safety concern | Explain the risk: "This LEFT JOIN could expose NULL patient_ids downstream" |
| Unclear intent | "I can't tell why this CASE ordering matters. Needs a comment (§10)." |

### How rejection works

1. You add review comments explaining what's wrong.
2. Transition the ticket back to "AI Executing" (or let automation do it).
3. The agent reads your comments and attempts a fix (up to 2 re-attempts).
4. If still wrong after 2 re-attempts → ticket moves to "In Progress" for manual human
   execution. You or a teammate takes over.

**Be specific in rejection comments.** "This is wrong" doesn't help the agent. "The join
on `order_id` should be `patient_id` because the grain of this model is per-patient" does.

---

## How AI PRs Differ from Human PRs

| Aspect | Human PR | AI PR |
|--------|----------|-------|
| Commit messages | Varies | Always references ticket + REQ IDs |
| Spec artifacts | Sometimes present | Always present in `dbt/specs/` |
| Validation report | Rarely | Always — includes data diff results |
| Issues log | No | Yes — documents things the peer-reviewer flagged but didn't fix |
| Code style | Personal style | Consistent with AGENTS.md + SQLFluff |
| PR body | Varies | Structured: summary, requirements map, validation status |

---

## Review SLA

**Target: 24 hours from PR opened.**

If no review within 24h, the PR is at risk of blocking other work. If you can't review in
time, flag it in the team channel so someone else picks it up.

---

## Tips

- **Read the Validation Report first.** If the data is provably correct (objective
  criteria all pass), your review can focus on code quality and safety rather than
  correctness.
- **Check `_issues.md`** — this contains things the peer-reviewer flagged as suggestions
  or low-priority items. If any concern you, raise them in your review.
- **Don't over-review.** The agent already ran through AGENTS.md compliance, SQLFluff, and
  a peer-review sub-agent. Your job is the human judgment layer: "Is this actually right
  and safe?" — not re-running every mechanical check.
- **Feedback loops matter.** If you notice a pattern in agent mistakes, raise it so we can
  adjust the workflow or rules. This process improves with feedback.
