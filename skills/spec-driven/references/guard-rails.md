# Guard Rails & Approval Gates

Reference document for the "on the loop" autonomous execution mode. Defines which tasks
are eligible, how approvals work, and what happens on rejection or failure.

> **Config:** Tuneable values (retry limits, eligible task types, SLAs, Jira statuses) are
> defined in `config/scheduled-mode.yml`. This document describes the *policy*; the config
> file holds the *parameters*.

---

## Eligibility Criteria

A task qualifies for autonomous ("on the loop") execution when **all four** conditions
are met:

| # | Criterion | Rationale |
|---|-----------|-----------|
| 1 | **Objective validation** — the expected outcome has ground truth (row counts, column existence, test pass/fail, before/after identical) | If there's no way to mechanically verify correctness, the agent can't self-validate and will hard-stop. |
| 2 | **Bounded scope** — the change touches a known, finite set of models/files with no cascading design decisions | Unbounded scope means the agent may make architectural choices that need human judgment. |
| 3 | **Clear requirements** — the ticket specifies what should happen (EARS or equivalent), not just a problem statement | Vague tickets produce vague solutions. The agent needs unambiguous acceptance criteria. |
| 4 | **No design authority needed** — the task doesn't require choosing between trade-offs, creating new patterns, or making schema decisions the team hasn't agreed on | Design decisions are inherently subjective; the agent should execute, not architect. |

### Eligible task types (with examples)

| Task Type | Example | Why Eligible |
|-----------|---------|--------------|
| Bug fix with repro steps | "stg_orders produces duplicates when source has multiple refresh timestamps" | Ground truth: duplicates should be zero. Clear fix boundary. |
| Source/staging model addition | "Add Zendesk `ticket_metrics` as a new source and staging model" | Established pattern (1:1 source→staging). Verifiable: model builds, schema matches. |
| Column rename / schema alignment | "Rename `user_id` to `patient_id` across the marketing intermediate models" | Before/after outputs identical except column name. Fully mechanical. |
| Test additions | "Add not_null and unique tests to all marts missing primary key coverage" | Verifiable: tests exist and pass. No logic decisions. |
| Documentation gaps | "Add descriptions to all undocumented columns in int_patient_orders" | Verifiable: YAML descriptions exist. (Quality is subjective but existence is objective.) |

### Ineligible task types

| Task Type | Example | Why Ineligible |
|-----------|---------|----------------|
| New mart with business logic | "Create a patient LTV model combining orders, refunds, and engagement" | Requires design decisions: what constitutes LTV? Which sources? How to handle edge cases? |
| Ambiguous requirements | "The marketing dashboard numbers look wrong" | No clear expected outcome; needs investigation and stakeholder alignment. |
| Architecture/pattern changes | "Migrate from star schema to wide tables in the reporting layer" | Team-wide decision with trade-offs; not suitable for autonomous execution. |
| Stakeholder-dependent | "Build a scorecard — check with Finance what metrics they need" | Requires human communication and judgment calls. |

### Decision flowchart

```
Is the expected outcome mechanically verifiable?
  NO  → INELIGIBLE (interactive mode)
  YES ↓

Are the requirements specific and unambiguous?
  NO  → INELIGIBLE (needs clarification first)
  YES ↓

Is the scope bounded to known models/files?
  NO  → INELIGIBLE (may cascade unpredictably)
  YES ↓

Does the task require choosing between trade-offs or creating new patterns?
  YES → INELIGIBLE (needs human design authority)
  NO  ↓

→ ELIGIBLE for autonomous execution
```

---

## Approval Gates

### The Peer Review gate (human approval)

After the agent completes work and opens a PR, the ticket transitions to **Peer Review**
(the existing review status). A team member reviews the output.

**What the reviewer checks:**

1. Does the PR satisfy the spec's requirements (`REQ-xxx`)? 
2. Do all tests pass (local + CI)?
3. Does the Validation Report confirm data correctness?
4. Does the code comply with `AGENTS.md`?
5. Is the change safe to merge (no unintended side effects)?

**SLA:** 24 hours from PR opened to review complete. If no review within 24h, escalate
(Slack ping to the team channel).

**Outcomes:**

| Decision | What happens |
|----------|--------------|
| **Approve** | Reviewer merges the PR. Ticket → Done. |
| **Reject** | Reviewer adds comments explaining what's wrong. Ticket → AI Executing. Agent re-attempts with the feedback. |

---

## Rejection & Re-attempt Protocol

> This covers human **reviewer rejections** (PR feedback cycles). It is separate from the
> **Retry Protocol** (build/test failures during implementation), which allows 3 attempts
> at the same error before hard-stopping. Here, the count is for reviewer rejection cycles.

1. On rejection, the ticket returns to **AI Executing** with the reviewer's comments
   attached.
2. The agent reads the rejection comments and attempts a fix (same spec, adjusted
   implementation).
3. **Maximum 2 AI re-attempts** after the initial submission (3 total attempts including
   the first).
4. If still rejected after 2 re-attempts → ticket transitions to **In Progress** (manual
   human execution). The agent's work remains on the branch for the human to build on or
   discard.

### What counts as a re-attempt

A re-attempt is a full cycle: agent reads feedback → fixes → pushes → moves to Human
Review. Partial fixes that don't reach PR-ready state don't count.

---

## Rollback Policy

AI-generated code, once merged, is treated identically to human-written code:

- **Standard revert process applies.** If a merged change causes issues, revert the PR
  (via `git revert` or a revert PR).
- **No special rollback mechanism.** The same CI checks, the same merge process.
- **Incident response unchanged.** AI-merged code that breaks production is handled the
  same as any other incident — revert first, investigate second.

The agent cannot merge to main, so every AI change has a human reviewer who takes
ownership at the point of merge.

---

## Failure Modes & Hard-Stops

| Failure | Agent behavior | Human action needed |
|---------|---------------|---------------------|
| Same problem after 3 fix attempts | Hard-stop, logs retry report to `workflow-state.md` | Pick up from the retry log; may need a different approach |
| Subjective validation criteria found | Hard-stop immediately | Review the output and provide sign-off or redirect |
| CI failure (data/infra, not code) | Hard-stop, surfaces classified failure | Investigate infra issue; re-trigger when resolved |
| CI failure (code/test) | Retry (up to 3 attempts) | Only intervenes if retries exhaust |
| Reviewer rejects 2× after initial | Escalate to manual | Human takes over the branch |
