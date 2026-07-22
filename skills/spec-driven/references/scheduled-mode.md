# Scheduled Mode Reference

This document provides detailed semantics for running the spec-driven workflow in
scheduled (autonomous) mode — invoked from cron jobs, CI pipelines, or other automation.

---

## Invoking Scheduled Mode

Include `mode: scheduled` in the prompt when invoking the skill:

```
Run the spec-driven workflow in mode: scheduled.
Ticket: DATA-456
Intent: Fix the NULL order_ids appearing in the patient_orders mart.
```

The skill detects the mode from the prompt text. If `mode: scheduled` is not present,
interactive mode (with human gates) is assumed.

---

## What Changes in Scheduled Mode

| Aspect | Interactive | Scheduled |
|--------|-------------|-----------|
| Gates | `ask_user_question` → human approves | Self-checkpoint → auto-approve if complete |
| Sub-agent delegation | Mandatory | Mandatory (unchanged) |
| Artifacts | Required | Required (unchanged) |
| workflow-state.md | Required | Required (unchanged) |
| Failure handling | Present to user | Retry Protocol (3× per problem) |
| Subjective validation | Human sign-off | HARD STOP (not attempted) |
| PR merge | Never auto-merge | Never auto-merge (unchanged) |

---

## Retry Protocol Detail

### What Counts as "Same Problem"

The retry counter tracks unique problems by their identifying signature:

| Problem Type | Identity Key | Example |
|---|---|---|
| Build error | Error message (first line) | `Compilation Error in model stg_orders` |
| Test failure | Test name | `not_null_orders__order_id` |
| Peer-reviewer issue | Issue ID or description hash | `[HIGH] Missing primary key test on order_sk` |
| CI failure | Check name + error type | `dbt_test / unique_test_order_sk` |

### Progress vs Stuck

- **Progress**: the original problem is fixed but a *new, different* error appears.
  This means the fix worked but revealed the next issue. The new error gets its own
  3 attempts.
- **Stuck**: the *same* error recurs after an attempted fix. The counter increments.
  After 3 stuck attempts → HARD STOP.

### Retry Log Format

Appended to `workflow-state.md`:

```markdown
## Retry Log

| Attempt | Phase | Problem | Action Taken | Result |
|---------|-------|---------|--------------|--------|
| 1 | Implement | `unique_test_order_sk` failed | Added dedup QUALIFY clause | Same error (attempt 2) |
| 2 | Implement | `unique_test_order_sk` failed | Changed partition key to include source_id | Same error (attempt 3) |
| 3 | Implement | `unique_test_order_sk` failed | Rewrote join to prevent fan-out | Same error — HARD STOP |
```

---

## Hard-Stop Behavior

When the agent hard-stops:

1. Sets the current phase status to `blocked` in `workflow-state.md`.
2. Writes the retry log showing all attempts.
3. Does NOT proceed to subsequent phases.
4. Does NOT open a PR or push code.
5. Terminates the workflow cleanly.

The resulting `workflow-state.md` serves as the diagnostic report for a human to pick up.

---

## Appropriate Workflow Types for Scheduling

| Workflow | Suitability | Reason |
|----------|-------------|--------|
| Bug Fix (with ground truth) | Good | Validation is Objective — agent can self-validate |
| Refactor (behavior-preserving) | Good | Before/after comparison is Objective |
| Feature (all-Objective VAL criteria) | Acceptable | Rare, but possible for data-pipeline features |
| Feature (mixed/Subjective criteria) | Not suitable | Will HARD STOP at output-validator |

---

## Hook Enforcement

Scheduled mode is reinforced by hooks that fire automatically:

| Hook | When | What it injects |
|------|------|-----------------|
| `SubagentStop` | After every sub-agent returns | Gate reminder: "verify transition checklist, auto-approve or retry" |
| `PreCompact` | Before context summarization | State audit: counts pending/in-progress phases, blocks if `blocked` |
| `Stop` | When agent is about to terminate | Warning if phases are incomplete |

These hooks inject system messages that the agent cannot skip. They provide structural
enforcement that persists even if the agent's context window is summarized mid-workflow.

---

## Example: Successful Scheduled Bug Fix

```
Prompt: "Run the spec-driven workflow in mode: scheduled. Ticket: DATA-789. Fix: stg_orders
is producing duplicate rows due to missing dedup on the source refresh timestamp."

→ discovery sub-agent runs, returns findings
→ SubagentStop hook injects gate reminder
→ Agent verifies checklist: findings presented ✓, workflow-state.md updated ✓
→ Logs: auto-approved (scheduled)
→ Specify+Implement phase: writes requirements.md, implements fix, delegates test-author
→ SubagentStop hook injects gate reminder
→ output-validator runs, returns Self-validatable: YES (all Objective, all pass)
→ Auto-proceeds to Review
→ peer-reviewer runs, returns 0 High issues, 1 Low suggestion
→ Logs suggestion to _issues.md
→ Ships: commits, pushes, opens PR
→ ci-interpreter returns PASS
→ Workflow complete. PR ready for human merge.
```

---

## Example: Hard-Stop After Retries

```
Prompt: "Run the spec-driven workflow in mode: scheduled. Ticket: DATA-790. Fix: int_orders
is missing rows where payment_method is NULL."

→ discovery + gate: auto-approved
→ Specify+Implement: fix applied, test-author delegated
→ output-validator: unique_test fails (same SK generated for different rows)
→ Retry 1: adjust SK columns → same test fails
→ Retry 2: add payment_method to SK → same test fails
→ Retry 3: rewrite SK logic entirely → same test fails
→ HARD STOP. workflow-state.md marked blocked.
→ Agent terminates. PR not opened.
```
