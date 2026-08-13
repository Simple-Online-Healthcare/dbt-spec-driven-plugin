---
name: spec-driven
description: "The dbt development workflow for this project. Use when: building a feature, fixing a bug, refactoring code, creating or implementing a spec, reviewing code, reviewing a PR, or documenting models. Triggers: spec-driven, new feature, build feature, fix bug, refactor, create spec, implement spec, review, code review, peer review, PR review, document model."
tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "AskUserQuestion", "Task"]
---

# Spec-Driven Development

## Purpose

This is the single workflow skill for dbt work in this project. It enforces a gated
flow where the problem is **discovered and fact-checked first**, work is captured in a
durable four-document spec set, code is implemented against the mandatory rules in
`AGENTS.md`, and changes are **reviewed and shipped through CI**.

Specs live in the **specs location** named in the AGENTS.md Project Profile
(example: `dbt/specs/`), in `<dd-mm-yy>-<name>/` directories.

> **Authority:** `AGENTS.md` at the repo root holds the mandatory, blocking rules.
> This skill never restates those rules — it points to them. Heavy, context-isolated
> steps are delegated to sub-agents (see "Sub-agent Delegation" below).
>
> **Field feedback:** Real-world agent failures and the plugin fixes they drove live in
> `references/field-feedback.md` (inside this plugin). Read it when strengthening
> enforcement or when a ticket matches a known failure pattern.
>
> **Project context:** Durable team facts, constraints, and decisions live in the
> **context ledger** named in the Project Profile. Read `references/project-context.md`
> before adding or revising that context.

---

## Routing

Detect intent from the request and route to the matching entry point:

| Intent | Triggers | Route |
|--------|----------|-------|
| New Feature | "build", "create", "add", "new feature" | Full workflow (Discover → Specify → Design → Implement → Validate Output → Review → Ship) |
| Semantic View | "create semantic view", "add cortex view", "semantic layer" | Full workflow with **`semantic-view-author`** delegation during Implement → Validate Output → Review → Ship |
| Bug Fix | "fix", "bug", "broken", "incorrect" | Bug workflow (Discover → Specify+Implement → Validate Output → Review → Ship) |
| Refactor | "refactor", "restructure", "clean up", "reorganize" | Refactor workflow (Discover → Design+Implement → Validate Output → Review → Ship) |
| Standalone Review | "review", "code review", "peer review", "review my PR" | Jump straight to **Review** on the current branch |
| Standalone Docs | "document", "add docs", "describe this model" | Jump straight to the **Documentation** step |

**Validate Output is never optional.** It runs on every route, after Implement and before
Review. See the Flight Checklist below for the authoritative phase order.

If intent is ambiguous, ask the user which applies before starting.

---

## Flight Checklist (mandatory — check before every transition)

> **READ THIS FIRST.** Every sub-agent and gate listed below is MANDATORY, not advisory.
> Skipping a delegation or gate is a workflow violation. Check this table at every phase
> boundary.

| Workflow | Phases (in order) |
|----------|-------------------|
| **Bug Fix** | `discovery` → GATE → Specify+Implement + `spec-author` + `test-author` → `output-validator` → GATE-if-subjective → `peer-reviewer` → `_issues.md` → GATE → Ship + `ci-interpreter` |
| **Feature** | `discovery` → GATE → Specify + `spec-author` → ticket-update → GATE → Design + `spec-author` → GATE → Implement + `test-author` → `output-validator` → GATE-if-subjective → `peer-reviewer` → `_issues.md` → GATE → Ship + `ci-interpreter` |
| **Semantic View** | `discovery` → GATE → Specify + `spec-author` → ticket-update → GATE → Design + `spec-author` → GATE → Implement + `semantic-view-author` + `test-author` → `output-validator` → GATE-if-subjective → `peer-reviewer` → `_issues.md` → GATE → Ship + `ci-interpreter` |
| **Refactor** | `discovery` → GATE → Design+Implement + `spec-author` + `test-author` → `output-validator` → GATE-if-subjective → `peer-reviewer` → `_issues.md` → GATE → Ship + `ci-interpreter` |

**Legend:**
- `` `sub-agent` `` = MUST delegate via Task tool (never do the work inline)
- **GATE** = a hard checkpoint. In interactive mode this MUST use `ask_user_question`; in
  scheduled mode it is a self-checkpoint (see "Gate Protocol")
- **GATE-if-subjective** = hard gate only when output-validator returns Self-validatable: NO; auto-proceed when YES
- `_issues.md` = MUST create file if peer-reviewer returned any issues (even if all were fixed)
- **ticket-update** = MUST update the ticket in the Profile's **ticketing** system with
  REQ-IDs + branch + impacted models

---

## Sub-agent Delegation (MANDATORY — never substitute inline work)

The agent MUST delegate to these sub-agents when the trigger condition is met.
Performing the work inline (manually running queries, writing tests yourself, doing
your own review) is a **workflow violation** — sub-agents produce structured, auditable
artifacts that downstream phases depend on and that survive context compaction.

| Sub-agent | Trigger | Produces | Consumed by |
|-----------|---------|----------|-------------|
| `discovery` | Start of any workflow | Findings report | Specify phase (grounds the spec) |
| `spec-author` | Specify and Design phases | The route's spec documents + `REQ-xxx`/`VAL-xxx` | Design, Implement, `output-validator` |
| `semantic-view-author` | Intent is "Semantic View" | Semantic view DDL + metadata | Implement phase; see `references/semantic-views.md` |
| `test-author` | Any model created or modified | Tests + run result | Implement (regression coverage) |
| `output-validator` | After Implement, before Review | `validation-report.md` (Self-validatable: YES/NO) | Review phase + gate decision |
| `peer-reviewer` | Before Ship, on changed models | Structured Issues (H/M/L) | Review phase + `_issues.md` |
| `ci-interpreter` | After PR is opened | CI status (PASS/FAIL/PENDING) | Ship phase (next action) |

**If the sub-agent's work seems trivial** (e.g. no new tests needed), delegate anyway —
the sub-agent will confirm "no action required" in its structured output, which is still
an auditable artifact. The point is the structured contract, not the volume of work.

**Partial delegation is a workflow violation.** Delegating only some steps (e.g. running
discovery but writing tests or review inline, or skipping `output-validator`) has been
observed in production (see `references/field-feedback.md`). Before every phase
transition, read `workflow-state.md` and the Flight Checklist: every sub-agent row for
phases already passed must show `delegated`, not blank or skipped.

### Capability skills (extend the canonical workflow — never replace it)

These skills cover surfaces the canonical sub-agents do not own. Each must route through
a canonical artifact, and none may duplicate behavior already owned by a sub-agent above.

| Skill | Use for | Relationship to canonical workflow |
|-------|---------|-----------------------------------|
| `verify-this` | Falsifiable claims on non-dbt/local surfaces (CLI, UI, API, performance) | `output-validator` stays the authority on dbt data outcomes and `VAL-xxx` |
| `quality-audit` | Strict maintainability/structure review, large diffs, non-dbt code | Runs **after** `peer-reviewer` for dbt models |
| `ci-loop` | Watch/fix iterations on failing PR checks | `ci-interpreter` remains the final CI status authority |
| `pr-ergonomics` | Branch/PR preparation, reviewability, merge conflicts, review comments | Runs **after** gates are satisfied; never replaces the Ship phase |
| `work-summary` | Completed-work summaries, weekly reviews, demo notes, handoffs | Reads spec artifacts; read-only by default |
| `spec-review` | Fast entry point for a review request | Thin router into **Phase: Review** |
| `spec-debt` | Report unresolved workflow debt (skipped gates, stale ledgers) | Read-only audit of workflow artifacts |

---

## Starting a Workflow

Every feature/bug/refactor begins with a ticket in the Project Profile's **ticketing**
system (example: Jira):

1. Ask the user for the ticket ID (e.g., `DATA-123`).
2. Create a branch from the Profile's **base branch** (example: `master`):
   `git checkout <base_branch> && git pull && git checkout -b <ticket-id>-<slug>`
   - Slug: kebab-case, concise, derived from the ticket/intent. Example: `DATA-123-new-patient-orders`.
3. Spec directory: `<specs>/<dd-mm-yy>-<feature-name>/`, where `<specs>` is the specs
   location in the Project Profile (example: `dbt/specs/`).
   - Example: branch created 28/05/26 → `dbt/specs/28-05-26-new-patient-orders/`.
4. Read `references/spec-documents.md` and create the required spec document set:
   `project-charter.md`, `prd.md`, `architecture-design.md`, and `wbs.md`.
5. Record the ticket ID and branch name at the top of `project-charter.md` and `prd.md`.
6. Create `workflow-state.md` (see below).
7. Proceed to the **Discover** phase.

(Standalone Review and Standalone Docs skip ticket/branch creation and operate on the
current branch.)

---

## Workflow State Tracker

At workflow start, create `<specs>/<dir>/workflow-state.md` to externalize progress.
Update this file after completing each phase. This file:
- Survives context compaction (it's a file, not conversation text)
- Is auditable by the user at any point
- Forces explicit acknowledgment of each transition

### Template (Bug Fix):
```markdown
# Workflow State — <TICKET-ID>

| Phase | Status | Gate | Artifact | Sub-agent delegated |
|-------|--------|------|----------|---------------------|
| Discover | pending | — | — | discovery |
| Specify+Implement | pending | — | prd.md + wbs.md (charter, architecture-design: N/A) | spec-author, test-author |
| Validate Output | pending | — | validation-report.md | output-validator |
| Review | pending | — | _issues.md | peer-reviewer |
| Ship | pending | — | PR | ci-interpreter |
```

### Template (Feature):
```markdown
# Workflow State — <TICKET-ID>

| Phase | Status | Gate | Artifact | Sub-agent delegated |
|-------|--------|------|----------|---------------------|
| Discover | pending | — | — | discovery |
| Specify | pending | — | project-charter.md + prd.md | spec-author |
| Design | pending | — | architecture-design.md + wbs.md | spec-author |
| Implement | pending | — | code + tests | test-author |
| Validate Output | pending | — | validation-report.md | output-validator |
| Review | pending | — | _issues.md | peer-reviewer |
| Ship | pending | — | PR | ci-interpreter |
```

### Usage:
- Update each row as work proceeds: `pending` → `in-progress` → `complete`
- Gate column: `approved` (interactive), `auto-approved (scheduled)`, or `self-validated`
  (Objective-only output validation)
- Sub-agent column: `delegated` once the Task tool has been called for that agent
- **Before transitioning to the next phase**, read this file and confirm the current
  row is fully populated. If any cell is empty, the transition is blocked.
- A phase marked `blocked` is a HARD STOP — see "Scheduled Mode Rules".
- `N/A` in an Artifact cell means a document the **route** does not require (see
  `references/spec-documents.md`). It is a deliberate omission and must never be used to
  record a document that was simply not written — `spec-debt` treats a blank cell as
  skipped work and `N/A` as by-design.

> **Enforcement:** this file is not only a record. A `PreToolUse` hook reads it before any
> model write and before `git push` / PR creation, and **blocks** the call when a required
> phase is not `delegated`. See "Enforcement Hooks" below. Keeping it accurate is what
> keeps you unblocked.

---

## Enforcement Hooks (mechanical, not advisory)

Most of this plugin's hooks inject reminders. Two gates actually **block**, implemented in
`scripts/hooks/require-delegation.js` and registered on `PreToolUse`:

| Gate | Fires on | Blocks when |
|------|----------|-------------|
| **Model write** | `write`/`edit`/`multi_edit` on `models/**/*.sql` | No `workflow-state.md` exists, or the Discover row is neither `complete` nor `delegated` |
| **Ship** | `bash` matching `git push` or `gh pr create` | No `workflow-state.md` exists, or any pre-Ship phase is `pending`/`in-progress`, or any row naming a sub-agent does not show `delegated` |

Both gates also hard-stop on any row with status `blocked`.

Why two gates rather than one: the model-write gate stops implementation running ahead of
discovery, but a hook cannot block a workflow that was never started — so the Ship gate is
the backstop. **A change can reach the working tree without a workflow; it cannot become a
PR without one.** Partial delegation, the documented failure mode in
`references/field-feedback.md`, is caught at Ship even when every phase row claims
`complete`, because the gate checks the sub-agent column independently of the status column.

Scope and limits, stated plainly:

- **Narrow by design.** Only `.sql` files under `models/` are gated. Macros, tests,
  analyses, seeds, and YAML are not — `test-author` must stay unobstructed.
- **Fails open.** Any unreadable file, unparseable table, malformed event, or internal error
  allows the call. A repo with no spec root is not running this workflow and is never gated.
- **`N/A` is honoured.** An artifact cell of `N/A` (a document the route does not require)
  does not block. An agent cell of `—`/`N/A` means no agent is expected for that row. A
  **blank** agent cell where an agent is named in the template is treated as skipped work.
- **The escape hatch is explicit and auditable.** `DBT_SPEC_DRIVEN_ENFORCE=off` disables
  both gates. Use it for a deliberate out-of-workflow edit, and only after telling the user.
  Silently working around a gate — editing a non-model file to dodge the write gate, or
  marking a row `delegated` for an agent that was never invoked — is a workflow violation
  and falsifies the audit trail `spec-debt` depends on.

---

## Continuous Project Context Capture

Hooks load the Project Profile's **context ledger** and the local notes file at session
start when those files exist. They also remind the agent before compaction to persist new
facts. The workflow must treat this as a continuous capture obligation, not a manual
afterthought.

1. Read `references/project-context.md` when the user states a reusable constraint,
   compliance rule, source-system caveat, project preference, or cross-repo handoff fact.
2. Capture ticket-specific context in the active spec docs.
3. Capture reusable team context in the **context ledger** using context atoms.
4. Mark facts as `User-supplied`, `Verified`, or `Needs verification`; do not present
   user-supplied context as independently verified.
5. Do not store secrets, credentials, direct personal identifiers, or raw customer data.

Before every phase transition, ask: did this phase uncover a fact future agents should
know? If yes, update the appropriate spec document or context ledger before moving on.

---

## Phase: Discover & Fact-Check (mandatory first gate)

**No solutioning until discovery is done.** This phase exists to kill assumptions before
they become specs.

1. Delegate to the **`discovery`** sub-agent with the user's request. It must return:
   - Relevant existing models, macros, sources, and their layers.
   - Lineage/dependencies that the change touches (upstream and downstream).
   - Assumptions in the request that were **verified** vs **disproven** (with evidence:
     query results, file references, lineage).
   - Data-coverage evidence when sources or tables are in scope.
   - Existing macros/packages that already solve the problem.
   - Open questions that block specification.
2. If discovery surfaces **new or undocumented** models that the change depends on,
   trigger the **Documentation** step for those models before continuing.
3. Present the findings summary and any open questions to the user.

**Output:** Findings report + resolved/open questions.

**GATE — Stop. Get explicit approval (and answers to open questions) before specifying.**

### TRANSITION: Discover → next phase
Before proceeding, confirm ALL:
- [ ] `discovery` sub-agent was delegated via Task tool (not done inline)
- [ ] Findings presented as a structured summary
- [ ] `workflow-state.md` updated (Discover row: complete, delegated)
- [ ] GATE satisfied (see "Gate Protocol")

---

## New Feature Workflow

### Phase: Specify

**Delegate to the `spec-author` sub-agent** (route: `feature`). Pass it the ticket, the
request, and discovery's findings report. It reads `references/spec-documents.md` and writes
the documents — do not write them inline, and do not load the templates into this thread.

The sub-agent is responsible for:

1. `<specs>/<feature-name>/project-charter.md` — project vision, business/data outcome,
   stakeholders/consumers, success metrics, constraints, risks, milestones, next steps.
2. `<specs>/<feature-name>/prd.md` — functional, non-functional, data, and interface
   requirements; acceptance criteria as testable assertions; assumptions; constraints; an
   explicit Out of Scope list.
3. Requirements in EARS notation, numbered `REQ-001`, `REQ-002`, … for traceability:
   - `WHEN <trigger>, THE SYSTEM SHALL <behavior> SO THAT <rationale>`
   - `WHILE <state>, THE SYSTEM SHALL <behavior>`
   - `WHERE <condition>, THE SYSTEM SHALL <behavior>`
   - `IF <condition>, THEN THE SYSTEM SHALL <behavior>`
4. **Validation Criteria** (the expected *data outcome*, checked later in Validate Output).
   Each `VAL-xxx` tagged **Objective** (ground truth — agent self-validates) or
   **Subjective** (no ground truth — human sign-off), mapped to a `REQ-id`. Task-type
   default: bug fixes/refactors usually have ground truth (mostly Objective); features are
   mixed. This is the TDD "define the tests, work backwards" step — the criteria are the
   contract the change must satisfy.
5. Discovery's data-coverage evidence carried into the data requirements, quoted with the
   query that produced it.

On return, review the sub-agent's output and raise its Blockers at the gate. If it reports
blockers, resolve them before approving — do not implement around an unanswered question.

**Post to the ticketing system** (Project Profile; example: Jira via the `jira_update_issue`
MCP tool): update the ticket description with the branch name, requirement IDs + one-line
summaries, and models impacted.

**Output:** `<specs>/<feature-name>/project-charter.md` and `<specs>/<feature-name>/prd.md`

**GATE — Stop and get explicit approval of the charter and PRD before designing.**

### TRANSITION: Specify → Design
Before proceeding, confirm ALL:
- [ ] `spec-author` was delegated via the Task tool (not written inline)
- [ ] `project-charter.md` created with purpose, stakeholders/consumers, success metrics,
      constraints, risks, and next steps
- [ ] `prd.md` created with EARS requirements, VAL criteria, acceptance criteria,
      assumptions/constraints, and Out of Scope
- [ ] Ticket updated with branch, REQ-IDs, and impacted models
- [ ] `workflow-state.md` updated (Specify row: complete, gate recorded, `spec-author`
      marked `delegated`)
- [ ] GATE satisfied (see "Gate Protocol")

### Phase: Design

**Delegate to the `spec-author` sub-agent** (route: `feature`, documents:
`architecture-design.md` + `wbs.md`). Pass it the approved `prd.md`, discovery's findings,
and the checks below. It is responsible for:

1. `<specs>/<feature-name>/architecture-design.md` documenting:
   - Files to create or modify (with rationale).
   - Key decisions and trade-offs considered.
   - Data flow / transformation logic and the lineage impact.
   - Dependencies and integration points.
   - **The solution-ladder rung chosen (AGENTS.md §13)** and why the rungs above it did not
     apply.
2. `<specs>/<feature-name>/wbs.md` documenting work items, dependencies, sequencing,
   test/QA plan, validation plan, CI/release plan, risks, and progress log.
3. Referencing requirement IDs from `prd.md`.
4. **Layer and reuse checks (mandatory when sources or unions are involved):**
   - `source()` reads and union/dedup logic belong in the **first layer only** (example:
     staging) — downstream layers must `ref()` that layer, not re-read sources.
     (AGENTS.md §1, §6.)
   - Prefer existing package macros (e.g. `dbt_utils.union_relations`) and repo macros
     over hand-rolled SQL, per the §13 ladder. Discovery's "Existing macros/packages"
     section must be addressed in the architecture rationale, naming the specific macro.
   - If multiple models would share the same source union, consolidate into one
     first-layer model. (See `references/field-feedback.md`.)

After the sub-agent returns:

5. **Cross-repo handoff check:** if changed models affect downstream consumer surfaces
   named in the Project Profile (BI exposures, downstream pipelines, dashboard metrics,
   model grain, or downstream field semantics), read `references/cross-repo-handoff.md`
   and create/update a source-side handoff in the Profile's **handoff location**. Link it
   from `architecture-design.md` and add follow-up tasks to `wbs.md`.

**Output:** `<specs>/<feature-name>/architecture-design.md` and `<specs>/<feature-name>/wbs.md`

**GATE — Stop and get explicit approval of the architecture and WBS before implementing.**

### TRANSITION: Design → Implement
Before proceeding, confirm ALL:
- [ ] `spec-author` was delegated via the Task tool (not written inline)
- [ ] `architecture-design.md` created with files, decisions, data flow, dependencies,
      lineage/integration impact, and validation design
- [ ] `wbs.md` created with implementation tasks, dependencies, sequencing, test/QA plan,
      CI/release plan, risks, and progress log
- [ ] Architecture states the §13 solution-ladder rung and rules out the rungs above it
- [ ] If sources/unions involved: architecture confirms first-layer-only `source()` and macro reuse
- [ ] If downstream consumer impact exists: handoff created or updated and linked
- [ ] `workflow-state.md` updated (Design row: complete, gate recorded, `spec-author`
      marked `delegated`)
- [ ] GATE satisfied (see "Gate Protocol")

### Phase: Implement

1. Work through `wbs.md` task by task.
2. Reference requirement IDs in comments where non-obvious logic implements a requirement.
3. Author or update tests via the **`test-author`** sub-agent.
4. Build and run tests as you go.
5. Validate every change against **`AGENTS.md`** — fix any blocking violation before
   proceeding. (AGENTS.md is the rule source; there is no separate standards skill.)

**Output:** Working code that builds, passes tests, and satisfies `AGENTS.md`.

Proceed to **Validate Output**.

### TRANSITION: Implement → Validate Output
Before proceeding, confirm ALL:
- [ ] `test-author` sub-agent was delegated via Task tool
- [ ] Models build successfully and tests pass
- [ ] `workflow-state.md` updated (Implement row: complete, test-author delegated)

---

## Phase: Validate Output

Runs **after Implement, before Review** — for every path (feature / bug / refactor). This
is the data equivalent of an end-to-end test: *did the change produce the intended data
outcome?* dbt tests (from `test-author`) are unit-level; this validates the actual output.

1. Delegate to the **`output-validator`** sub-agent with the changed models and the spec's
   Validation Criteria (`VAL-xxx`). It builds the models, checks schema/grain vs
   `architecture-design.md`, diffs the data against the baseline (the Profile's
   **output-validation baseline**, diffed with the Profile's **data-diff tool** — example:
   `audit_helper`), evaluates each criterion, writes **`validation-report.md`** into the
   active spec directory, and returns the same report including requirement traceability and
   a **Self-validatable: YES/NO** marker.
2. **Branch on the report:**
   - **Self-validatable: YES** (all criteria Objective and passed) → the agent
     self-validates; no human gate. These ground-truth tasks (typically bugs/refactors)
     are the candidates to run **on-the-loop**. Proceed to Review.
   - **Self-validatable: NO** → **hard gate.** Present the impact summary + representative
     samples for each Subjective (or failed) criterion and discuss with the user until
     they confirm each outcome is correct / "good enough". Fix and re-validate any failed
     Objective criterion. In scheduled mode this is a HARD STOP, not a retry.
3. Hand any Objective outcome that should be a permanent regression to **`test-author`** to
   codify as a dbt test.

**Output:** `<specs>/<dir>/validation-report.md` (per-criterion pass / fail / signed-off +
data delta + `REQ-id` traceability).

Proceed to **Review**.

### TRANSITION: Validate Output → Review
Before proceeding, confirm ALL:
- [ ] `output-validator` sub-agent was delegated via Task tool
- [ ] `validation-report.md` written to the spec directory, with a Self-validatable marker
- [ ] If Self-validatable: NO → GATE with user (present impact + samples)
- [ ] `workflow-state.md` updated (Validate Output row: complete, output-validator delegated)

---

## Bug Fix Workflow

### Phase: Specify + Implement

(Discovery has already produced the root cause with evidence.)

1. **Delegate to the `spec-author` sub-agent** (route: `bug`). Do not write the spec
   documents inline. On the bug route it produces **two** documents and marks the other two
   `N/A`:
   - `prd.md` with root cause statement (from discovery), fix requirements (EARS),
     **Regression guard** behaviors that MUST remain unchanged, **Data-coverage evidence**
     (from discovery, quoted with the query), and Validation Criteria (`VAL-xxx`) mapped to
     `REQ-xxx`.
   - `wbs.md` with implementation tasks, test/QA plan, validation plan, risks, and
     progress log.
   - `project-charter.md` and `architecture-design.md` are **`N/A` for this route** unless
     the fix carries strategic weight or a non-trivial design decision — the sub-agent
     produces them and says why when it judges that to be the case.
2. Before implementing source or union changes, confirm in `prd.md` and `wbs.md` (or
   `architecture-design.md` when the sub-agent produced one):
   - Union/dedup happens in the **first layer only**; downstream models `ref()` it.
   - Package/repo macros considered (e.g. `dbt_utils.union_relations`) with rationale if
     not used, per the AGENTS.md §13 ladder.
3. Implement the fix; add/adjust tests via **`test-author`**.
4. Verify the regression guard holds and the change satisfies `AGENTS.md`.

**Output:** Fix + spec documenting what changed and why.

Proceed to **Validate Output** (bug fixes usually have ground truth — the failing case's
correct value + regression guard — so this is typically self-validatable).

### TRANSITION: Specify+Implement → Validate Output (Bug Fix)
Before proceeding, confirm ALL:
- [ ] `spec-author` sub-agent was delegated via Task tool
- [ ] `prd.md` and `wbs.md` created or updated with root cause, EARS requirements,
      regression guard, data-coverage evidence, tasks, and validation criteria
- [ ] `project-charter.md` / `architecture-design.md` either written or explicitly recorded
      as `N/A (route: bug)` in `workflow-state.md` — never left blank
- [ ] `test-author` sub-agent was delegated via Task tool
- [ ] `output-validator` will run next (do not skip to Review)
- [ ] Models build and tests pass
- [ ] `workflow-state.md` updated (Specify+Implement row: complete, `spec-author` and
      `test-author` marked `delegated`)

---

## Refactor Workflow

### Phase: Design + Implement

(Discovery has already documented current behavior.)

1. **Delegate to the `spec-author` sub-agent** (route: `refactor`). On this route it
   produces **two** documents and marks the other two `N/A`:
   - `architecture-design.md` with the refactored structure, trade-offs, data flow,
     lineage/integration impact, and the AGENTS.md §13 ladder rung chosen.
   - `wbs.md` with implementation tasks, dependency order, test/QA plan, and validation
     plan — including preserved behaviors (MUST remain identical), allowed changes
     (structural, naming, performance), the metrics to compare before/after (row counts,
     outputs, test results), and Validation Criteria (`VAL-xxx`) mapped to `REQ-xxx`.
   - `project-charter.md` and `prd.md` are **`N/A` for this route** unless the refactor
     changes a consumer-visible contract, in which case the sub-agent produces `prd.md`
     and says why.
2. Implement the refactored structure.
3. Run before/after comparisons on the defined metrics; confirm `AGENTS.md` compliance.

**Output:** Refactored code + comparison results.

Proceed to **Validate Output** (refactors have ground truth — outputs must be identical
before/after — so this is typically self-validatable).

### TRANSITION: Design+Implement → Validate Output (Refactor)
Before proceeding, confirm ALL:
- [ ] `spec-author` sub-agent was delegated via Task tool
- [ ] `architecture-design.md` and `wbs.md` created or updated with preserved behaviors,
      allowed changes, architecture, tasks, and comparison metrics
- [ ] `project-charter.md` / `prd.md` either written or explicitly recorded as
      `N/A (route: refactor)` in `workflow-state.md` — never left blank
- [ ] `test-author` sub-agent was delegated via Task tool
- [ ] Before/after metrics compared; outputs identical
- [ ] `workflow-state.md` updated (Design+Implement row: complete, `spec-author` and
      `test-author` marked `delegated`)

---

## Phase: Review (folded-in peer review)

Runs before shipping. Also the entry point for a **standalone review** request.

1. Delegate to the **`peer-reviewer`** sub-agent on the changed models in the current
   branch. It returns structured Issues (High/Medium/Low) + Suggestions. It reads the
   `output-validator`'s Validation Report for data-delta context rather than recomputing it.
2. Walk High/Medium issues with the user one at a time, offering a specific fix for each
   and implementing on approval. The user may decline any of them (not recommended for
   High, but allowed). In scheduled mode, see "Scheduled Mode Rules" §4.
3. Log **every unimplemented item regardless of severity** — including any High/Medium
   issues the user chose to skip — plus unimplemented Suggestions, to
   `<models>/<folder>/<model_name>_issues.md` (append if it exists), where `<models>` is
   the **models location** in the Project Profile. Record each item's severity so a
   skipped High is visible as such.
4. For large diffs, non-dbt code, or structural concerns, run `quality-audit` after this
   phase — it is additive to `peer-reviewer`, not a replacement.

**Output:** Review summary + outstanding-issues file.

Proceed to **Ship**.

### TRANSITION: Review → Ship
Before proceeding, confirm ALL:
- [ ] `peer-reviewer` sub-agent was delegated via Task tool
- [ ] Each High/Medium issue walked individually (interactive) or handled per §4 (scheduled)
- [ ] `_issues.md` file created (even if all issues were fixed — log skipped items)
- [ ] `workflow-state.md` updated (Review row: complete, peer-reviewer delegated)
- [ ] GATE satisfied (see "Gate Protocol")

---

## Phase: Ship

Commit the work, push the branch, open the PR, and interpret CI to completion.

1. **Confirm local health first.** Models build and tests pass locally, and the change
   satisfies `AGENTS.md` (§9 PR gate). Do not push a known-red branch.
2. **Commit & push.** Stage the change plus any `_issues.md` from Review. Use a concise
   message referencing the ticket (e.g. `DATA-123: <summary>`). Push with
   `git push -u origin <branch>`.
3. **Open the PR** with `gh pr create`. **Read the Profile's PR template in the repo being
   worked on** (example: `.github/pull_request_template.md`) and structure the PR body to
   match it — fill description & motivation (include the ticket ID and link to the spec),
   complete the checklist, and mark type of change. Title carries the ticket ID. If the
   template file is missing, mirror its usual sections anyway. (Ask before opening if the
   user has not already approved shipping.)
4. **Interpret CI.** Delegate to the **`ci-interpreter`** sub-agent to watch the PR's
   checks (the Profile's **CI system** — example: dbt build/test plus data-quality
   null/uniqueness and AI data-output checks) to completion and return a PASS/FAIL/PENDING
   summary.
5. **Act on the result:**
   - **PASS** → report the green PR and stop.
   - **FAIL (code/test)** → fix here, then re-push and re-interpret. Use `ci-loop` for
     watch/fix iterations; `ci-interpreter` still reports final status.
   - **FAIL (data/infra)** → surface the classified failure to the user with the
     recommended next action; do not blindly retry.

Never merge automatically — leave the merge decision to the user.

### TRANSITION: Ship → Done
Before declaring done, confirm ALL:
- [ ] PR body follows the Profile's PR template (all sections filled)
- [ ] `ci-interpreter` sub-agent was delegated via Task tool after PR opened
- [ ] CI result (PASS/FAIL/PENDING) reported to user
- [ ] If FAIL: fixed and re-pushed; if PENDING: communicated status
- [ ] `workflow-state.md` updated (Ship row: complete, ci-interpreter delegated)

---

## Documentation step

Triggered when discovery surfaces new/undocumented models, and available standalone.
Follow the patterns and templates in `references/documentation.md`.

- Write **contextual** descriptions: explain *why* a model exists and what business
  question it answers — not a restatement of its columns. (`AGENTS.md` §4 makes
  descriptions mandatory; this step is about making them good.)
- Add/repair column descriptions that carry business meaning.
- Where helpful, capture repo/database/schema-level "why" notes.

Keep edits scoped to the models in play — do not bulk-document unrelated areas.

---

## Spec File Conventions

- All specs under the specs location named in the AGENTS.md Project Profile
  (example: `dbt/specs/`).
- Directory names: kebab-case, prefixed with creation date `dd-mm-yy`
  (e.g. `dbt/specs/28-05-26-user-export-feature/`).
- Each spec directory has `project-charter.md`, `prd.md`, `architecture-design.md`, and
  `wbs.md`. See `references/spec-documents.md` for required sections and templates.
- `workflow-state.md` lives alongside them once a workflow starts.
- Put `REQ-001`, `REQ-002`, … and `VAL-001`, `VAL-002`, … in `prd.md` for traceability.
- Specs are living documents — update them (with user approval) if scope changes.

---

## Gate Protocol (MANDATORY)

A gate is a hard phase-boundary checkpoint where the agent confirms an artifact is
complete before continuing. Its behavior depends on the execution mode.

### Rules (both modes):
1. The gate enforces *completeness*, not just *permission*. Every item in the phase's
   TRANSITION checklist must be satisfied.
2. Sub-agent delegations are NEVER skipped regardless of mode.
3. Artifacts (the four spec documents, `workflow-state.md`, `_issues.md`) are NEVER skipped.
4. Record the outcome in the Gate column of `workflow-state.md`.

### Interactive mode (default):
1. Every GATE uses `ask_user_question` with `type: "options"`.
2. Options MUST include: `"Approve and proceed"` and `"Needs changes"`.
3. The question MUST name: (a) what phase is completing, (b) what phase starts next.
4. A tangential question (e.g. "which approach?") does NOT satisfy a gate — even if the
   user's answer implies they want to continue. The gate is a separate, explicit checkpoint.
5. The agent MUST NOT proceed past a gate without the user selecting "Approve and proceed".

**Standard gate format:**
```
ask_user_question:
  question: "<Phase> is complete. Approve and proceed to <Next Phase>?"
  options: ["Approve and proceed", "Needs changes"]
```

**Review gate — walk issues individually.** During Review, present each High/Medium issue
**one at a time**:
```
ask_user_question:
  question: "[HIGH] <issue description>. Suggested fix: <fix>. Implement this fix?"
  options: ["Yes, fix it", "Skip (will log to _issues.md)"]
```
Do NOT batch-fix issues without per-issue approval.

**Pre-Ship gate.** Before committing:
```
ask_user_question:
  question: "All phases complete. Ready to commit, push, and open PR?"
  options: ["Ship it", "Wait — I want to review first"]
```

### Scheduled mode:
- Do NOT call `ask_user_question`.
- Verify the TRANSITION checklist for the completing phase (every item satisfied).
- If all satisfied → log `auto-approved (scheduled)` in the Gate column of
  `workflow-state.md` and proceed.
- If any item unsatisfied → treat as a failure and enter the Retry Protocol.
- This is NOT "skip the gate" — it is "the gate checks itself instead of asking a human."

---

## Execution Mode

This skill supports two execution modes. The mode is determined by how the workflow is
invoked:

| Mode | Trigger | Gate Behavior | Failure Behavior |
|------|---------|---------------|------------------|
| **interactive** (default) | User invokes skill directly | `ask_user_question` — hard stop until human approves | Present to user |
| **scheduled** | Invoked with `mode: scheduled` in the prompt, or from an automation/cron context | Self-checkpoint — auto-approve when artifacts are complete | Retry up to 3× then hard-stop |

### Scheduled Mode Rules

When running in scheduled mode, the following rules OVERRIDE the interactive gate behavior
but **nothing else changes** — all phases, sub-agent delegations, artifacts, and TRANSITION
checklists remain mandatory.

#### 1. Gates become self-checkpoints

Instead of calling `ask_user_question`, the agent:
1. Verifies ALL items in the phase's TRANSITION checklist are satisfied (artifact exists,
   sub-agent was delegated, `workflow-state.md` is updated).
2. If all satisfied → logs `auto-approved (scheduled)` in the Gate column of
   `workflow-state.md` and proceeds.
3. If any item is NOT satisfied → treat as a failure (see Retry Protocol below).

#### 2. Retry Protocol (max 3 attempts per problem)

When the agent encounters a failure — build error, test failure, peer-reviewer blocking
issue, output-validator failure, or incomplete TRANSITION checklist:

1. **Identify the problem** — log a one-line description in `workflow-state.md` under a
   `## Retry Log` section.
2. **Attempt a fix** — apply the most targeted fix available (rewrite the failing SQL,
   adjust the test, address the peer-review issue).
3. **Re-run the failing check** — rebuild, re-test, re-delegate to the sub-agent.
4. **Evaluate the result:**
   - If the **same problem recurs** (same error message, same failing test, same blocking
     issue) → increment the retry counter for that problem.
   - If a **different failure** appears → this is progress. Reset the counter — it's a new
     problem with its own 3 attempts.
5. **After 3 failed attempts at the same problem** → HARD STOP. Write a summary to
   `workflow-state.md` with status `blocked` and the retry log, then terminate the
   workflow. Do NOT attempt a 4th fix or skip the failing phase.

"Same problem" means: the same test name fails, the same build error occurs, or the same
peer-reviewer issue is raised after the attempted fix. A *different* failure — even if it
appears in the same phase — is treated as a new problem with fresh attempts.

#### 3. Workflow type restrictions

Scheduled mode is designed for tasks where all Validation Criteria are **Objective**
(ground truth exists). If the `output-validator` returns `Self-validatable: NO`:
- The workflow HARD STOPS immediately (this is not retryable — it requires human judgment).
- Log the subjective criteria that need sign-off to `workflow-state.md`.

#### 4. Review phase in scheduled mode

The `peer-reviewer` sub-agent still runs. In scheduled mode:
- **High severity issues** → the agent MUST attempt to fix them (counts toward retry
  protocol if the fix fails).
- **Medium severity issues** → the agent SHOULD attempt to fix them.
- **Low severity / Suggestions** → log to `_issues.md`, do not fix.
- If a High issue persists after 3 fix attempts → HARD STOP.

#### 5. Ship phase in scheduled mode

- Never merge automatically (same as interactive).
- Open the PR and interpret CI.
- On CI PASS → report success and stop (PR is ready for human merge).
- On CI FAIL (code/test) → retry (same 3-attempt protocol).
- On CI FAIL (data/infra) → HARD STOP (not retryable by the agent).

#### 6. Workflow-state.md in scheduled mode

The Retry Log section is appended to `workflow-state.md`:

```markdown
## Retry Log

| Attempt | Phase | Problem | Action Taken | Result |
|---------|-------|---------|--------------|--------|
| 1 | Implement | `not_null_test_order_id` failed | Added COALESCE for NULL order_ids | Different error (progress) |
| 2 | Implement | `unique_test_order_sk` failed | Fixed surrogate key logic | Same error |
| 3 | Implement | `unique_test_order_sk` failed | Rewrote dedup logic | Same error |
| — | — | HARD STOP | 3 attempts exhausted on same problem | blocked |
```
