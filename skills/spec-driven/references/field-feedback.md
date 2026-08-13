# Field Feedback — Real-World Agent Failures

> Canonical log of observed agent behavior during spec-driven workflows. Each entry links
> to a ticket, names the host environment, and records which plugin files were updated to
> prevent recurrence. Update this file whenever field feedback surfaces — it feeds agent
> briefs and workflow enforcement (see `INTERNALS.md`).
>
> **Adopting this plugin?** The entry below is retained as a **worked example** from the
> project this plugin originated in. Keep it for reference or clear it and start your own
> log — the format and the "How to add a new entry" protocol are what matter.

---

## DATA-1378 — Source schema relocation (Cortex, June 2026)

**Ticket:** DATA-1378
**Branch:** `DATA-1378-fix-snowplow-source-schema`
**Spec:** `<specs>/22-06-26-fix-snowplow-source-schema/`
**Context:** An event loader moved from `SNOWPLOW.ATOMIC.EVENTS` to
`SNOWPLOW.SNOWPLOW_SCHEMA.EVENTS`; downstream models stopped receiving new data.

### Observations (reviewer feedback)

1. **Partial workflow compliance.** Despite spec-driven workflow changes, the agent skipped
   several steps and only partially delegated work to sub-agents. More enforcement needed.
2. **Unverified data-coverage claim.** The agent initially stated the new schema included
   historic data; verification showed it did not at first pass — driving an incorrect union
   strategy until re-checked.
3. **Hand-rolled union instead of package macro.** When unioning was needed, the agent
   wrote ~150 lines of custom SQL instead of using `dbt_utils.union_relations`.
4. **Layer violation in design.** The agent proposed unioning from `source()` in three
   models (including intermediate models) rather than consolidating once in the first layer.

### Correct pattern

- Verify date coverage on **each** candidate table with `MIN`/`MAX` on the event timestamp
  before claiming historic data is present or absent.
- Union legacy + current sources **once** in a single first-layer (staging) model via
  `dbt_utils.union_relations`.
- Downstream layers only `ref()` that model — never `source()` for the same domain union
  logic.

### Plugin actions taken

| File | Change |
|------|--------|
| `agents/discovery.md` | Require MIN/MAX date queries; search macros/packages before proposing SQL patterns |
| `agents/peer-reviewer.md` | Flag source reads outside the first layer, hand-rolled unions, duplicated union logic |
| `skills/spec-driven/SKILL.md` | Link field feedback; strengthen partial-delegation warning; Design gate layer checks |
| `skills/spec-driven/references/field-feedback.md` | This entry |
| `<specs>/22-06-26-fix-snowplow-source-schema/` | Workflow friction retrospective in the spec set |

---

## Coverage audit — why enforcement became mechanical (Cortex, August 2026)

**Ticket:** none (plugin maintenance)
**Branch:** `feature/port-data-team-kit-capabilities`
**Context:** A follow-up audit of DATA-1378 below, checking whether the four observations
were actually prevented or merely documented.

### Findings

1. **Three of four were genuinely fixed.** Observations 2, 3, and 4 had concrete rules at
   the agent-brief level (`discovery` MIN/MAX and macro search; `peer-reviewer` layer and
   union flags).
2. **Observation 1 was not fixed.** Every hook returned advisory text only — there was no
   `PreToolUse` hook at all, so nothing could refuse a tool call. Worse, `SubagentStop` can
   only fire *after* a sub-agent runs, so **a sub-agent that was never invoked produced zero
   hook events.** The exact observed failure was invisible to the enforcement machinery. The
   recorded remedy for observation 1 had been "strengthen partial-delegation warning" — more
   prose to fix a problem prose had already failed to fix.
3. **Spec authoring was the only undelegated phase.** Specify and Design were written inline
   by the main thread (`—` in the delegation column), making the phases that ground every
   downstream artifact the easiest to skimp, and forcing the 190-line template file into
   main-thread context.
4. **Document load was itself a driver of skipping.** All four documents were mandatory on
   every route, including one-line bug fixes.
5. **The reuse rules were detective, not preventive.** Nothing stopped a hand-rolled union
   being *written*; `peer-reviewer` only flagged it afterwards.

### Correct pattern

- Enforcement that matters must be mechanical. Advisory context is a reminder, not a gate.
- Gate at two points, because one is evadable: a write gate stops implementation running
  ahead of discovery, and a Ship gate catches a workflow that was never started at all.
  Check the sub-agent column independently of the status column — rows claiming `complete`
  with a blank agent cell are the signature of partial delegation.
- Prevent over-building at design time (the `AGENTS.md` §13 ladder), not only at review.
- Scale document depth to the work, and distinguish `N/A` (route does not require it) from
  blank (step was skipped).

### Plugin actions taken

| File | Change |
|------|--------|
| `scripts/hooks/require-delegation.js` | New. The only blocking hook: model-write gate + Ship gate, fails open on every error path |
| `hooks/hooks.json` | Register `PreToolUse` (matches both lowercase and PascalCase tool IDs) |
| `AGENTS.example.md` | New §13 solution ladder (blocking) with dbt-specific rungs and an explicit precedence clause; §11 forbids reimplementing an available macro |
| `agents/spec-author.md` | New. Owns the spec document set, route-aware, allocates `REQ`/`VAL`, records the §13 rung |
| `agents/peer-reviewer.md` | Flag unverified data claims; extend reuse checks to the §13 ladder |
| `agents/output-validator.md` | Persist `validation-report.md` instead of returning it only |
| `skills/spec-driven/SKILL.md` | Delegate Specify/Design to `spec-author`; new "Enforcement Hooks" section; route-specific document sets |
| `skills/spec-driven/references/spec-documents.md` | Per-route required/`N/A` document table |
| `README.md` | `node` required for enforcement; optional ponytail companion and its precedence |

---

## How to add a new entry

1. Copy the template below into this file (newest entries at top, below this section).
2. Update the relevant agent/skill briefs — do not restate the full story in each file;
   point here and add only the enforceable rule.
3. Bump `version` in `.cortex-plugin/plugin.json` and propagate to the installed copy.
4. Optionally add a "Workflow friction" section to the ticket's spec directory.

### Template

```markdown
## <TICKET-ID> — <short title> (<host>, <month year>)

**Ticket:** <TICKET-ID>
**Branch:** `<branch-name>`
**Spec:** `<specs>/<dir>/`

### Observations
1. ...

### Correct pattern
- ...

### Plugin actions taken
| File | Change |
|------|--------|
| ... | ... |
```
