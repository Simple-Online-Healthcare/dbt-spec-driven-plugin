---
name: spec-driven
description: "The dbt development workflow for this project. Use when: building a feature, fixing a bug, refactoring code, creating or implementing a spec, reviewing code, reviewing a PR, or documenting models. Triggers: spec-driven, new feature, build feature, fix bug, refactor, create spec, implement spec, review, code review, peer review, PR review, document model."
tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "AskUserQuestion", "Task"]
---

# Spec-Driven Development

## Purpose

This is the single workflow skill for dbt work in this project. It enforces a gated
flow where the problem is **discovered and fact-checked first**, requirements are
**formally specified and approved**, code is implemented against the mandatory rules in
`AGENTS.md`, and changes are **reviewed and shipped through CI**.

Specs live in the **specs location** named in the AGENTS.md Project Profile
(`dbt/specs/` in this repo), in `<dd-mm-yy>-<name>/` directories.

> **Authority:** `AGENTS.md` at the repo root holds the mandatory, blocking rules.
> This skill never restates those rules — it points to them. Heavy, context-isolated
> steps are delegated to sub-agents (see "Sub-agents" below).

---

## Routing

Detect intent from the request and route to the matching entry point:

| Intent | Triggers | Route |
|--------|----------|-------|
| New Feature | "build", "create", "add", "new feature" | Full workflow (Discover → Specify → Design → Implement → Review → Ship) |
| Semantic View | "create semantic view", "add cortex view", "semantic layer" | Full workflow with **`semantic-view-author`** delegation during Implement |
| Bug Fix | "fix", "bug", "broken", "incorrect" | Bug workflow (Discover → Specify+Implement → Review → Ship) |
| Refactor | "refactor", "restructure", "clean up", "reorganize" | Refactor workflow (Discover → Design+Implement → Review → Ship) |
| Standalone Review | "review", "code review", "peer review", "review my PR" | Jump straight to **Review** on the current branch |
| Standalone Docs | "document", "add docs", "describe this model" | Jump straight to the **Documentation** step |

If intent is ambiguous, ask the user which applies before starting.

---

## Sub-agents

Delegate context-heavy steps to these sub-agents (via the Task tool). Each runs in
isolation and returns a structured result, keeping the main thread focused:

- **`discovery`** — explores the codebase/lineage and fact-checks assumptions; returns a
  findings report. Used by the Discover phase.
- **`semantic-view-author`** — writes semantic view DDL (tables, relationships, metrics,
  dimensions, VQRs). Used during Implement when intent is "Semantic View". See
  `references/semantic-views.md` for conventions.
- **`test-author`** — writes dbt tests/assertions for the change. Used during Implement.
- **`output-validator`** — validates the *data outcome* against the spec's Validation
  Criteria (schema, data delta vs baseline, self-validate vs sign-off). Used by Validate Output.
- **`peer-reviewer`** — qualitative review of changed models; returns structured issues.
  Used by the Review phase (and standalone review).
- **`ci-interpreter`** — polls and interprets CI results. Used by the Ship phase.

---

## Starting a Workflow

Every feature/bug/refactor begins with a ticket in the Project Profile's **ticketing**
system (example: Jira):

1. Ask the user for the ticket ID (e.g., `DATA-123`).
2. **Move the ticket onto the board.** If the ticket is in "Backlog", transition it to
   "Up Next" first so it is visible on the board before the workflow begins.
3. **Label the ticket** `on-the-loop` and **transition it to "AI Executing"** in the
   ticketing system (Jira: add label via `jira_update_issue`, transition via
   `jira_transition_issue`). This marks the ticket as entering the spec-driven workflow
   and enables board filtering.
4. Create a branch from the Profile's **base branch** (example: `master`):
   `git checkout <base_branch> && git pull && git checkout -b <ticket-id>-<slug>`
   - Slug: kebab-case, concise, derived from the ticket/intent. Example: `DATA-123-new-patient-orders`.
4. Spec directory: `<specs>/<dd-mm-yy>-<feature-name>/`, where `<specs>` is the specs
   location in the Project Profile (example: `dbt/specs/`).
   - Example: branch created 28/05/26 → `dbt/specs/28-05-26-new-patient-orders/`.
5. Record the ticket ID and branch name at the top of `requirements.md`.
6. Proceed to the **Discover** phase.

(Standalone Review and Standalone Docs skip ticket/branch creation and operate on the
current branch.)

---

## Phase: Discover & Fact-Check (mandatory first gate)

**No solutioning until discovery is done.** This phase exists to kill assumptions before
they become specs.

1. Delegate to the **`discovery`** sub-agent with the user's request. It must return:
   - Relevant existing models, macros, sources, and their layers.
   - Lineage/dependencies that the change touches (upstream and downstream).
   - Assumptions in the request that were **verified** vs **disproven** (with evidence:
     query results, file references, lineage).
   - Open questions that block specification.
2. If discovery surfaces **new or undocumented** models that the change depends on,
   trigger the **Documentation** step for those models before continuing.
3. Present the findings summary and any open questions to the user.

**Output:** Findings report + resolved/open questions.

**GATE — Stop. Get explicit user approval (and answers to open questions) before specifying.**

---

## New Feature Workflow

### Phase: Specify

1. Create `specs/<feature-name>/requirements.md`.
2. Write requirements in EARS notation:
   - `WHEN <trigger>, THE SYSTEM SHALL <behavior> SO THAT <rationale>`
   - `WHILE <state>, THE SYSTEM SHALL <behavior>`
   - `WHERE <condition>, THE SYSTEM SHALL <behavior>`
   - `IF <condition>, THEN THE SYSTEM SHALL <behavior>`
3. Number requirements (`REQ-001`, `REQ-002`, …) for traceability.
4. Include acceptance criteria as testable assertions, and an explicit Out of Scope list.
5. **Draft Validation Criteria** (the expected *data outcome*, checked later in Validate
   Output). Tag each `VAL-xxx` as **Objective** (ground truth — agent self-validates) or
   **Subjective** (no ground truth — human sign-off), and map it to a `REQ-id`. Apply the
   task-type default: bug fixes/refactors usually have ground truth (mostly Objective);
   features are mixed. This is the TDD "define the tests, work backwards" step — the
   criteria are the contract the change must satisfy.

**Post to the ticketing system** (Project Profile; example: Jira via the `jira_update_issue`
MCP tool): update the ticket description with the branch name, requirement IDs + one-line
summaries, and models impacted.

**Output:** `specs/<feature-name>/requirements.md`

**GATE — Stop and get explicit approval of the spec before designing.**

### Phase: Design

1. Create `specs/<feature-name>/design.md` documenting:
   - Files to create or modify (with rationale).
   - Key decisions and trade-offs considered.
   - Data flow / transformation logic and the lineage impact.
   - Dependencies and integration points.
2. Reference requirement IDs from Specify.

**Output:** `specs/<feature-name>/design.md`

**GATE — Stop and get explicit approval of the design before implementing.**

### Phase: Implement

1. Work through the design task by task.
2. Reference requirement IDs in comments where non-obvious logic implements a requirement.
3. Author or update tests via the **`test-author`** sub-agent.
4. Build and run tests as you go.
5. Validate every change against **`AGENTS.md`** — fix any blocking violation before
   proceeding. (AGENTS.md is the rule source; there is no separate standards skill.)

**Output:** Working code that builds, passes tests, and satisfies `AGENTS.md`.

Proceed to **Validate Output**.

---

## Phase: Validate Output

Runs **after Implement, before Review** — for every path (feature / bug / refactor). This
is the data equivalent of an end-to-end test: *did the change produce the intended data
outcome?* dbt tests (from `test-author`) are unit-level; this validates the actual output.

1. Delegate to the **`output-validator`** sub-agent with the changed models and the spec's
   Validation Criteria (`VAL-xxx`). It builds the models, checks schema vs design, diffs
   the data against the baseline (the Profile's **output-validation baseline**, diffed with
   the Profile's **data-diff tool** — example: `audit_helper`), evaluates each criterion, and
   returns a **Validation Report** including requirement traceability and a
   **Self-validatable: YES/NO** marker.
2. **Branch on the report:**
   - **Self-validatable: YES** (all criteria Objective and passed) → the agent
     self-validates; no human gate. These ground-truth tasks (typically bugs/refactors)
     are the candidates to run **on-the-loop**. Proceed to Review.
   - **Self-validatable: NO** → **hard gate.** Present the impact summary + representative
     samples for each Subjective (or failed) criterion and discuss with the user until
     they confirm each outcome is correct / "good enough". Fix and re-validate any failed
     Objective criterion.
3. Hand any Objective outcome that should be a permanent regression to **`test-author`** to
   codify as a dbt test.

**Output:** Validation Report (per-criterion pass / fail / signed-off + data delta +
`REQ-id` traceability).

Proceed to **Review**.

---

## Bug Fix Workflow

### Phase: Specify + Implement

(Discovery has already produced the root cause with evidence.)

1. Create `specs/<dd-mm-yy>-bugfix-<name>/requirements.md` with:
   - Root cause statement (from discovery).
   - Fix requirements (EARS).
   - **Regression guard:** behaviors that MUST remain unchanged.
2. Implement the fix; add/adjust tests via **`test-author`**.
3. Verify the regression guard holds and the change satisfies `AGENTS.md`.

**Output:** Fix + spec documenting what changed and why.

Proceed to **Validate Output** (bug fixes usually have ground truth — the failing case's
correct value + regression guard — so this is typically self-validatable).

---

## Refactor Workflow

### Phase: Design + Implement

(Discovery has already documented current behavior.)

1. Create `specs/<dd-mm-yy>-refactor-<name>/requirements.md` listing:
   - Preserved behaviors (MUST remain identical).
   - Allowed changes (structural, naming, performance).
   - Metrics to compare before/after (row counts, outputs, test results).
2. Design the refactored structure, then implement.
3. Run before/after comparisons on the defined metrics; confirm `AGENTS.md` compliance.

**Output:** Refactored code + comparison results.

Proceed to **Validate Output** (refactors have ground truth — outputs must be identical
before/after — so this is typically self-validatable).

---

## Phase: Review (folded-in peer review)

Runs before shipping. Also the entry point for a **standalone review** request.

1. Delegate to the **`peer-reviewer`** sub-agent on the changed models in the current
   branch. It returns structured Issues (High/Medium/Low) + Suggestions. It reads the
   `output-validator`'s Validation Report for data-delta context rather than recomputing it.
2. Walk High/Medium issues with the user one at a time, offering a specific fix for each
   and implementing on approval. The user may decline any of them (not recommended for
   High, but allowed).
3. Log **every unimplemented item regardless of severity** — including any High/Medium
   issues the user chose to skip — plus unimplemented Suggestions, to
   `dbt/models/<folder>/<model_name>_issues.md` (append if it exists). Record each item's
   severity so a skipped High is visible as such.

**Output:** Review summary + outstanding-issues file.

Proceed to **Ship**.

---

## Phase: Ship

Commit the work, push the branch, open the PR, and interpret CI to completion.

1. **Confirm local health first.** Models build and tests pass locally, and the change
   satisfies `AGENTS.md` (§9 PR gate). Do not push a known-red branch.
2. **Commit & push.** Stage the change plus any `_issues.md` from Review. Use a concise
   message referencing the ticket (e.g. `DATA-123: <summary>`). Push with
   `git push -u origin <branch>`.
3. **Open the PR** with `gh pr create`, using the repo's PR template. Title carries the
   ticket ID; body summarizes the change and links the spec. (Ask before opening if the
   user has not already approved shipping.)
4. **Interpret CI.** Delegate to the **`ci-interpreter`** sub-agent to watch the PR's
   checks (the Profile's **CI system** — example: dbt build/test + Deep Hub null/uniqueness
   and AI data-output checks) to completion and return a PASS/FAIL/PENDING summary.
5. **Act on the result:**
   - **PASS** → report the green PR and stop.
   - **FAIL (code/test)** → fix here, then re-push and re-interpret.
   - **FAIL (data/infra)** → surface the classified failure to the user with the
     recommended next action; do not blindly retry.

Never merge automatically — leave the merge decision to the user.

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

- All specs under the specs location named in the AGENTS.md Project Profile (`dbt/specs/`).
- Directory names: kebab-case, prefixed with creation date `dd-mm-yy`
  (e.g. `dbt/specs/28-05-26-user-export-feature/`).
- Each spec directory has `requirements.md` (always) and `design.md` (features/refactors).
- Number requirements `REQ-001`, `REQ-002`, … for traceability.
- Specs are living documents — update them (with user approval) if scope changes.

---

## Gate Protocol

A gate is a phase-boundary checkpoint. Its behavior depends on the execution mode.

### Interactive mode (default):
- Present the artifact (findings, spec, or design) clearly.
- Use `ask_user_question` with options: `"Approve and proceed"` / `"Needs changes"`.
- The question MUST name what phase is completing and what phase starts next.
- Do NOT proceed past a gate without the user selecting "Approve and proceed".

### Scheduled mode:
- Do NOT call `ask_user_question`.
- Verify the transition checklist for the completing phase (every item satisfied).
- If all satisfied → log `auto-approved (scheduled)` in the Gate column of
  `workflow-state.md` and proceed.
- If any item unsatisfied → treat as a failure and enter the Retry Protocol.
- This is NOT "skip the gate" — it is "the gate checks itself instead of asking a human."

### Both modes:
- Sub-agent delegations are NEVER skipped regardless of mode.
- Artifacts (requirements.md, design.md, workflow-state.md) are NEVER skipped.
- The gate enforces *completeness*, not just *permission*.

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
but **nothing else changes** — all phases, sub-agent delegations, artifacts, and transition
checklists remain mandatory.

#### 1. Gates become self-checkpoints

Instead of calling `ask_user_question`, the agent:
1. Verifies ALL items in the phase's transition checklist are satisfied (artifact exists,
   sub-agent was delegated, workflow-state.md is updated).
2. If all satisfied → logs `auto-approved (scheduled)` in the Gate column of
   `workflow-state.md` and proceeds.
3. If any item is NOT satisfied → treat as a failure (see Retry Protocol below).

#### 2. Retry Protocol (max 3 attempts per problem)

When the agent encounters a failure — build error, test failure, peer-reviewer blocking
issue, output-validator failure, or incomplete transition checklist:

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
