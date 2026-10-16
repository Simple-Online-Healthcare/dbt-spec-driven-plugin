# Scheduled Mode Reference

How the spec-driven workflow behaves when it runs unattended: from an automation, cron
job, or CI trigger.

---

## Invoking

Include `mode: scheduled` in the opening prompt:

```
Run the spec-driven workflow in mode: scheduled.
Ticket: DATA-456
Intent: Fix the NULL order_ids appearing in the patient_orders mart.
```

Without it, interactive mode is assumed.

---

## What changes

| Aspect | Interactive | Scheduled |
|--------|-------------|-----------|
| Decide questions | Asked one at a time with `ask_user_question` | Not asked. The recommendation is accepted and listed under **Decided unattended** |
| Phases, sub-agents, `AGENTS.md` rules | As in the skill | Unchanged |
| Decision needing a fact someone else owns, with no evidence to recommend from | Ask who owns it | Comment on the ticket with the question, leave `TODO(<ticket>)` at the spot, push the branch, stop |
| Needs-human validation checks | Human sign-off | Report and stop before Ship |
| Repeated failure | Discuss with user | Stop after three attempts on the same problem |
| CI waiting | Human may check in | One blocking `--watch` call with a timeout; don't poll |
| PR merge | Never | Never |

---

## Accepting recommendations

The questions are written exactly as they would be interactively (decision, why it
matters, evidence, options, recommendation). Each one is then accepted and goes into the
PR body:

```
## Decided unattended
- **Which patients count as "new":** first order after exposure (38,412), not account
  creation (41,090). Matches fct_retention. Evidence: dim_patients vs fct_orders
  comparison, 2,678 mismatches.
```

The reviewer reads this section first. A recommendation that could only be a guess
(nothing in the code or data supports any option) is not a recommendation. That's the
owner-fact stop above.

---

## Keep going

An unattended run should not stop just to report. Don't end a turn with a summary that
announces the next step, an offer to continue, or a list of decisions that don't block
anything. Put status notes alongside the next action and carry on.

Stop only when nothing can move without a person:

- A decision needs a fact someone else owns and there's no evidence to recommend from.
- Validation has Needs-human checks.
- The same problem has survived three fix attempts.
- CI fails for data or infrastructure reasons (including failures also present on the
  base branch).

When stopping, say what was done, what's blocked, and what's needed, on the ticket and
in the final message.

---

## Repeated failures

"Same problem" means the same failing test, the same build error, or the same
peer-review issue after a fix. A different failure means the previous fix worked; it
gets its own three attempts. No retry log file is needed. Report the attempts in the
final message (and on the ticket if stopping).

---

## Good candidates

| Work | Suitability | Why |
|------|-------------|-----|
| Bug fix with a known correct value | Good | Objective checks |
| Behaviour-preserving refactor | Good | Output must match the baseline |
| Feature following an existing pattern | Good | Few decisions, and the precedent settles most |
| Feature with Needs-human checks | Poor | Will stop at validation |
| New approach with no precedent | Poor | Every decision is accepted unattended; expect heavy PR review |

---

## Example: scheduled bug fix

```
Prompt: "Run the spec-driven workflow in mode: scheduled. Ticket: DATA-789.
Fix: stg_orders produces duplicate rows due to missing dedup on the refresh timestamp."

→ Discover: reads stg_orders and its source, writes the failing query (412 dup keys),
  finds the sibling stg_ model that already dedups the same way
→ Decide: the precedent settles the dedup key; no questions. Plan: Done when dup count
  on order_id = 0 (Objective); added to ticket
→ Build: QUALIFY dedup with a DATA-789 comment; unique test on order_id, seen to fail
  before the fix; build + test pass
→ output-validator: Self-validatable YES, 412 rows removed, all were duplicates
→ peer-reviewer: no High/Medium; one Low logged to _issues.md
→ Ship: PR with plan + validation summary; ci-interpreter PASS; CodeRabbit replies
  posted; ticket moved to review
```

## Example: stopping for an owner fact

```
→ Discover: the ticket asks for revenue "net of partner fees"; no model or source
  carries partner fee rates, and Finance owns the contract terms
→ Comments on the ticket: the question, what was searched, who likely owns it
→ Leaves TODO(DATA-790) at the revenue calculation, pushes the branch, stops
```
