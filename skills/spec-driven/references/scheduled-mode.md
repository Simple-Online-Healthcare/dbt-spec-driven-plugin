# Scheduled Mode Reference

How the spec-driven workflow behaves when it runs unattended — from an automation, cron
job, or CI trigger.

---

## Invoking

Include `mode: scheduled` in the opening prompt:

```
Run the spec-driven workflow in mode: scheduled.
Ticket: DATA-456
Intent: Fix the NULL order_ids appearing in the patient_orders mart.
```

Without it, interactive mode (human gates) is assumed.

---

## What changes

| Aspect | Interactive | Scheduled |
|--------|-------------|-----------|
| Gates | `ask_user_question` | None — keep working while the work can advance |
| Phases, sub-agents, `AGENTS.md` rules | As per route | Unchanged |
| Missing decision | Ask the user | Comment on the ticket, leave `TODO(<ticket>)` notes, push the branch, stop |
| Subjective validation criteria | Human sign-off | Report and stop before Ship |
| Repeated failure | Discuss with user | Stop after three attempts on the same problem |
| CI waiting | Human may check in | One blocking `--watch` call with a timeout — don't poll |
| PR merge | Never | Never |

---

## Keep going

An unattended run should not stop just to report. Don't end a turn with a summary that
announces the next step, an offer to continue, or a list of decisions that don't block
anything. Put status notes alongside the next action and carry on.

Stop only when nothing can move without a person:

- A decision the ticket doesn't settle would change what gets built.
- Validation has Subjective criteria.
- The same problem has survived three fix attempts.
- CI fails for data or infrastructure reasons (including failures also present on the
  base branch).

When stopping, say what was done, what's blocked, and what's needed — on the ticket and
in the final message.

---

## Repeated failures

"Same problem" means the same failing test, the same build error, or the same
peer-review issue after a fix. A different failure means the previous fix worked; it
gets its own three attempts. No retry log file is needed — report the attempts in the
final message (and on the ticket if stopping).

---

## Good candidates

| Work | Suitability | Why |
|------|-------------|-----|
| Bug fix with a known correct value | Good | Objective validation |
| Behaviour-preserving refactor | Good | Output must match the baseline |
| Light-route feature following an existing pattern | Good | Objective criteria are usually available |
| Feature with Subjective criteria | Poor | Will stop at validation |
| Full-route feature with open design choices | Poor | Will stop for a decision |

---

## Example: scheduled bug fix

```
Prompt: "Run the spec-driven workflow in mode: scheduled. Ticket: DATA-789.
Fix: stg_orders produces duplicate rows due to missing dedup on the refresh timestamp."

→ Discover: reads stg_orders and its source, writes the failing query (412 dup keys),
  finds the sibling stg_ model that already dedups the same way → light route
→ Plan: REQ-001 no duplicate order_id; VAL-001 dup count = 0 (Objective); added to ticket
→ Implement: adds QUALIFY dedup with comment; unique test on order_id; build + test pass
→ output-validator: Self-validatable YES, 412 rows removed, all were duplicates
→ peer-reviewer: no High/Medium; one Low logged to _issues.md
→ Ship: commit, push, PR with REQ/VAL + validation summary; ci-interpreter PASS;
  CodeRabbit replies posted; ticket moved to review
```

## Example: stopping for a decision

```
→ Discover finds the ticket's "new patients only" could mean first order after exposure,
  or account created after exposure — the two give different populations
→ Comments on the ticket with both definitions and their row counts
→ Leaves TODO(DATA-790) at the filter, pushes the branch, stops
```
