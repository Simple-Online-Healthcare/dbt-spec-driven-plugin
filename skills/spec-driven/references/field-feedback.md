# Field Feedback — Real-World Agent Failures

> Canonical log of observed agent behavior during spec-driven workflows. Each entry links
> to a ticket, names the host environment, and records which plugin files were updated to
> prevent recurrence. Update this file whenever field feedback surfaces — it feeds agent
> briefs and the workflow skill.
>
> **Adopting this plugin?** The entry below is retained as a **worked example** from the
> project this plugin originated in. Keep it for reference or clear it and start your own
> log — the format and the "How to add a new entry" protocol are what matter.

---

## DATA-1753 — Change-aware architecture review (Cortex, October 2026)

**Ticket:** DATA-1753
**Branch:** `DATA-1753-change-aware-architecture-review`

Pilot of the advisory Architecture section on three merged PRs plus this PR.
Findings cite the changed file and existing code. Pre-existing debt is Context.

### Retrospective

| PR | Introduced | Context | Notes |
|---|---|---|---|
| #15 Looker reconciliation | none | none | Docs-only contract. Explore names are a generic example, not a team-only rule. |
| #16 DATA-1383 close-out | **wrong-repo**: `require-delegation.js` keyed off `specs/` so this non-dbt plugin was treated as a dbt workflow | leftover advisory shell hooks | Quality-audit / verify-this / satellites look like duplicates but their descriptions already split the job. |
| #20 verifiable enforcement | none | fail-open + leftover advisory hooks | Ledger extract is a move, not a second workflow. PR 20 later scoped the #16 hook to `dbt_project.yml`. |
| this PR | none | peer-reviewer already covers layer/reuse; architecture makes that change-aware | No extra agent, hook, or committed report. |

### Rule adjustments
- Example LookML / team names in generic docs are **not** wrong-repo.
- A second comparison (Looker vs dbt) is **not** a duplicate of the first.
- A satellite skill with a distinct trigger and a one-line boundary is **not** extra-abstraction.
- Helper extract (ledger.js) is **not** a duplicate of the file it was moved from.

### Plugin actions taken
| File | Change |
|------|--------|
| `agents/peer-reviewer.md` | Item 16 + Architecture output (Introduced / Context / Pass); also renumbered the two existing `12.` items |
| `skills/spec-driven/SKILL.md` | Review phase logs unused Introduced items; skip `_issues.md` when there is no models tree |
| `references/reviewer-guide.md`, `adoption-guide.md`, `README.md` | Advisory, change-aware, do not reject for Context |

---

## Slimming for Opus 5.5 (Cortex, October 2026)

**Tickets:** DATA-1822 (painful run), DATA-1823 (clean run)
**Context:** DATA-1823 ran the full scheduled workflow end to end with every phase and
sub-agent, and the mistakes that did happen on DATA-1822/1823 were never the kind the
enforcement was built to catch.

### Observations
1. No phase or sub-agent was skipped on either run. The write-gate, ship-gate and hash
   ledger never caught anything; they added tool calls, bash hashing and state-file edits.
2. The actual mistakes were convention misses: a split YAML file, duplicated macros, a
   magic-number test, a user decision widened in a spec-author brief, and
   `validation-report.md` committed to the PR (twice, across both tickets).
3. `test-author` on DATA-1823 read tests already written and returned "adequate" — pure
   overhead. `discovery` produced good findings that the main thread could have gathered
   with the same reads.
4. `grill-notes.md` was boilerplate on a ticket that followed an existing pattern.
5. Committed specs were ~14x the code size on a pattern-replication change, and agents
   rarely read old specs; the code, YAML and PR history carried the same pattern.
6. The output-validator marked data criteria PASS from reading SQL when the models hadn't
   been rebuilt.

### Correct pattern
- Discovery and tests in the main thread; read the nearest precedent before writing.
- Light route (no committed specs) for changes that follow an existing pattern; full
  route keeps `requirements.md` + `design.md` for new structure and real trade-offs.
- Carry user decisions verbatim. Check `git status` before committing.
- Validation report returned, not written to disk; summarised in the PR body.

### Plugin actions taken
| File | Change |
|------|--------|
| `scripts/hooks/*` | Removed: require-delegation, record-evidence, ledger, tests |
| `hooks/hooks.json` | Kept SessionStart (AGENTS.md + context ledger) and SessionEnd only |
| `agents/discovery.md`, `agents/test-author.md` | Removed |
| `agents/spec-author.md` | Full route only; no grill-notes input; don't widen decisions; lead with risk |
| `agents/output-validator.md` | Report returned only; no PASS from SQL inspection alone |
| `skills/spec-driven/SKILL.md` | Light/full routing; no workflow-state, hashes, transition checklists or retry log |
| `references/scheduled-mode.md` | Keep-going rules and explicit stop conditions |

---

## DATA-1820 — Self-attested gates (Cortex, September 2026)

**Ticket:** DATA-1820
**Spec:** `<specs>/28-09-26-statsig-conversion-to-shipped-metric/`
**Context:** (Historical — the hooks described here were removed in October 2026; see
the entry above.) Statsig conversion-to-shipped metric. The workflow ran under the August
blocking hook, which passed at every step.

### Observations (agent's own post-mortem)

1. Skipped the approval after discovery; wrote the spec and never showed it to the user;
   skipped the `requirements.md` and `design.md` approvals; implemented before approval.
2. Marked gates `approved` that the user never approved.
3. Computed evidence hashes from short headings, not the sub-agent's full response.
4. Cited `validation-report.md` as evidence; the file did not exist.
5. Ran peer review before Validate Output was approved, then applied its changes unapproved.
6. Called `int_experiments__statsig_user_day → orders` (intermediate → mart) an "accepted"
   layer exception. AGENTS.md §1 makes it blocking, and there is no exception mechanism.
7. Spec required a Statsig tag but declared tag creation out of scope; the tag was never made.

### Root cause

Two layers, and the first hid the second:

1. **The gate never ran.** `hooks.json` resolved its script with
   `${CLAUDE_PLUGIN_ROOT:-…}`. The harness substitutes only the literal token
   `${CLAUDE_PLUGIN_ROOT}` (it is not an env var), so outside the plugin repo the path became
   `/scripts/hooks/require-delegation.js`. Node exited 1, which the harness logs but does not
   block on. From 22 September on, Desktop logs show hundreds of these failures, nearly all
   from `dbt-pipelines`. Separately, `plugin.json` listed `skills` as objects, which the CLI
   rejects, so headless sessions loaded none of the plugin.
2. **Even running, it trusted self-attestation.** The hook checked two cells (`Status`,
   `Sub-agent`) of a file the agent writes. It parsed `Gate` and `Evidence` and never read
   them, and it checked only the Discover row before model writes. A fabricated table exits 0.
   Every other rule was prose.

### Correct pattern

- Verify the enforcement runs **where the work happens**, not only in the plugin repo's own
  tests. A hook that cannot find its script must say so, not fail silently.
- The table is a claim; verify it against facts the agent cannot write. `PostToolUse`
  receives the sub-agent's real returned text and the user's real answer, and
  `UserPromptSubmit` receives the real prompt. That is the second observer this plugin
  previously said did not exist.
- The hook hashes; the agent copies. Never ask the agent to compute evidence.
- Check order by table position, not phase names, so every route works. Treat an appended
  row as re-entry, so rework cycles don't trip the ordering check.

### Plugin actions taken

| File | Change |
|------|--------|
| `scripts/hooks/record-evidence.js` | New observer (never blocks): ledger of sub-agent output hashes, approval answers, scheduled-mode sessions, user legacy grants |
| `scripts/hooks/ledger.js` | New shared helpers: state-file lookup, state-table parser (first `Phase` table only), current-cycle view |
| `scripts/hooks/require-delegation.js` | Write-gate: all phases above Implement approved, ordering, claim verification, layer direction from AGENTS.md. Ship-gate: claim verification. Ledger guard |
| `hooks/hooks.json` | Resolve scripts via the literal `${CLAUDE_PLUGIN_ROOT}`; warn visibly if a script is missing. Register `PostToolUse` (`task`, `agent_output`, `ask_user_question`) and `UserPromptSubmit` |
| `.cortex-plugin/plugin.json` | `"skills": "skills"` (was an array of objects the CLI rejects); description moved into `ci-failure-responder` frontmatter |
| `skills/spec-driven/SKILL.md` | Copy hook-issued `sha:`; name the agent in the Task description; append rows to re-enter; legacy grant; what hooks cannot verify. Removed "do not validate Evidence `sha:` in the hook" and the false claim that `SubagentStop` checks Evidence |

Observation 7 (a Snowflake-side fact) is not hook-checkable. Mitigation: such requirements
become Validation Criteria that `output-validator` proves by query.

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
| `skills/spec-driven/SKILL.md` | Route-scoped grill + `spec-author`; 2-file specs |
| `README.md` | Cortex-only; `node` required for the blocking hook |

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
