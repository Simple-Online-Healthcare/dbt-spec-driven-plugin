# Ticket-Writing Standards for AI Execution

How to write tickets that qualify for "on the loop" autonomous execution. A well-written
ticket is the single biggest factor in whether the agent succeeds or fails.

---

## The 4 Qualifying Signals

Your ticket must have **all four** to be AI-executable:

| # | Signal | Test |
|---|--------|------|
| 1 | **Objective outcome** | Can you describe what "done" looks like without saying "it looks right"? Numbers, existence checks, test pass/fail, before/after identical. |
| 2 | **Bounded scope** | Can you name the specific models/files affected? If the answer is "figure it out", it's not bounded. |
| 3 | **Clear requirements** | Could someone implement this without asking you follow-up questions? |
| 4 | **No design decisions** | Is there an established pattern to follow, or does the implementer need to choose an approach? |

---

## Ticket Template

```markdown
## Summary
[One sentence: what needs to happen and why]

## Requirements
- WHEN [trigger], THE SYSTEM SHALL [behavior] SO THAT [rationale]
- WHERE [condition], THE SYSTEM SHALL [behavior]
(Use EARS notation or clear bullet points. Be specific about column names, table names,
expected values.)

## Validation Criteria
- [ ] [Model/test] builds without error
- [ ] [Specific test] passes (e.g., not_null on order_id)
- [ ] Row count of [model] equals [expected / matches source]
- [ ] Column [X] exists with type [Y]
- [ ] Before/after diff shows [expected change only]

## Scope
**In scope:** [list specific models/files]
**Out of scope:** [what this ticket does NOT cover]

## Context (optional)
- Relevant Slack thread / doc link
- Source system details
- Known edge cases
```

---

## Good vs Bad Examples

### Good: Bug fix

> **Summary:** `stg_orders` produces duplicate rows when the source table has multiple
> refresh timestamps for the same order.
>
> **Requirements:**
> - WHEN multiple source rows exist for the same `order_id`, THE SYSTEM SHALL keep only
>   the most recent row (by `_fivetran_synced`) SO THAT downstream models have exactly one
>   row per order.
>
> **Validation Criteria:**
> - `unique_stg_orders__order_id` test passes.
> - Row count of `stg_orders` equals distinct `order_id` count in source.
>
> **Scope:** `stg_orders.sql` only. Downstream models are unaffected (they already assume
> one row per order).

**Why this works:** Clear root cause, specific dedup logic, objective validation, single
file scope.

### Bad: Bug fix

> **Summary:** Orders are wrong.
>
> **Requirements:** Fix the order numbers. They don't match what Finance sees.
>
> **Validation:** Check with Finance.

**Why this fails:** No repro steps, no specific expected outcome, validation requires
human judgment ("check with Finance"), scope undefined.

---

### Good: Source addition

> **Summary:** Add the Zendesk `ticket_metrics` table as a new source and staging model.
>
> **Requirements:**
> - THE SYSTEM SHALL add `ticket_metrics` to `_zendesk__sources.yml` with freshness
>   checks (`warn_after: 24 hours`, `error_after: 48 hours`).
> - THE SYSTEM SHALL create `stg_zendesk__ticket_metrics` selecting columns: `ticket_id`,
>   `reply_time_in_minutes_business`, `first_resolution_time_in_minutes_business`,
>   `full_resolution_time_in_minutes_business`, `created_at`, `updated_at`.
> - Column names SHALL use `snake_case` and match the conventions in existing Zendesk
>   staging models.
>
> **Validation Criteria:**
> - Model builds without error.
> - Source freshness test passes.
> - `not_null_stg_zendesk__ticket_metrics__ticket_id` passes.
> - Row count matches `RAW.ZENDESK.TICKET_METRICS`.
>
> **Scope:** `_zendesk__sources.yml`, new `stg_zendesk__ticket_metrics.sql` and `.yml`.

**Why this works:** Lists exact columns, names the source, specifies freshness config,
objective validation, bounded scope.

### Bad: Source addition

> **Summary:** We need Zendesk metrics.
>
> **Requirements:** Add whatever Zendesk tables we're missing.

**Why this fails:** "Whatever we're missing" is unbounded. No specific tables, no columns,
no validation criteria.

---

## Tips for Writing AI-Executable Tickets

1. **Name names.** Column names, table names, source names. Don't say "the relevant
   columns" — list them.

2. **State the pattern.** If you want the agent to follow an existing model's structure,
   reference it: "Follow the same pattern as `stg_zendesk__tickets`."

3. **Define "done" mechanically.** Tests pass, row counts match, column exists. Avoid
   "looks correct" or "makes sense".

4. **Separate what you know from what needs investigation.** If you're unsure about
   something, put it in the ticket as a known unknown. The agent's discovery phase will
   investigate — but it's better to flag it upfront.

5. **Keep scope to one responsibility.** A ticket that says "add source, build
   intermediate, and create a mart" is three tickets. Split them.

---

## When NOT to Write for AI

- "Investigate why X is wrong" (no clear outcome).
- "Improve the performance of the dashboard" (requires judgment on what to optimize).
- "Design a new schema for the payments domain" (architecture).
- "Check with [person] whether we should include [thing]" (needs human comms).
- "Do whatever makes sense" (no requirements = no spec = agent can't proceed).

These are valid tasks — they just need a human to execute or to convert them into
AI-executable sub-tasks first.
