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
