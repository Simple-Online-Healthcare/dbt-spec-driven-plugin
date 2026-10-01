---
name: spec-driven
description: "The dbt development workflow for this project. Use when: building a feature, fixing a bug, refactoring code, creating or implementing a spec, reviewing code, reviewing a PR, or documenting models. Triggers: spec-driven, new feature, build feature, fix bug, refactor, create spec, implement spec, review, code review, peer review, PR review, document model."
tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "AskUserQuestion", "Task"]
---

# Spec-Driven Development

## Purpose

The workflow for dbt work in this project: understand the problem and check the
assumptions first, agree what "done" means (requirements + validation criteria), build
against the rules in `AGENTS.md`, prove the data outcome, get an independent review, and
ship through CI.

> **Authority:** `AGENTS.md` at the repo root holds the mandatory, blocking rules. This
> skill points to them rather than restating them.

The process scales with the work. A change that follows a pattern already in the repo
does not need the paperwork a new model does. Pick the route first.

---

## Routing

Two decisions: **what kind of work** (sets the validation default) and **how much
process** (light or full).

| Intent | Triggers | Validation default |
|--------|----------|--------------------|
| Feature | "build", "create", "add", "new feature" | Mixed — expect some Subjective criteria |
| Semantic view | "semantic view", "cortex view", "semantic layer" | Mixed; `semantic-view-author` writes the DDL |
| Bug fix | "fix", "bug", "broken", "incorrect" | Objective — the correct value is known |
| Refactor | "refactor", "restructure", "clean up" | Objective — output must be identical |
| Standalone review | "review", "code review", "review my PR" | Jump to **Review** on the current branch |
| Standalone docs | "document", "add docs", "describe this model" | Jump to **Documentation** |

### Light or full

Decide after Discover, from what you found — not from the ticket wording.

**Full** if any of these hold:
- A new model, or a change to an existing model's grain or primary key.
- A new join path across domains, or a change in layer dependencies.
- A semantic view.
- The design touches a domain with an ADR, or would warrant a new one.
- There are two or more reasonable designs with real trade-offs.

**Light** otherwise — typically a change that repeats an established in-repo pattern
(e.g. one more metric on a model that already has several), a bug with a clear repro, or
a behaviour-preserving refactor within one model.

| | Light | Full |
|---|---|---|
| Spec files committed | None. REQ/VAL go in the PR body and the ticket. | `requirements.md` + `design.md` in the spec directory |
| `spec-author` | Not used | Writes both documents |
| Interactive gates | One plan gate before Implement; validation gate if Subjective; ship | Discover, Spec, Design, validation if Subjective, ship |

If the work turns out bigger than it looked, move to full and say so. Don't move down
silently.

---

## Sub-agents

Use these where context isolation actually helps — independent review, and long-running
checks that would flood the main thread:

- **`output-validator`** — checks the data outcome against the `VAL-xxx` criteria and
  the production baseline. Returns a Validation Report in its reply.
- **`peer-reviewer`** — independent Standards-vs-Spec review of the changed models. It
  hasn't seen your reasoning, which is the point.
- **`ci-interpreter`** — watches PR checks to completion and classifies failures.
- **`spec-author`** — full route only: writes `requirements.md` and `design.md`.
- **`semantic-view-author`** — semantic view DDL during Implement.

Discovery and test writing happen in the main thread. Use an `explore` sub-agent for
discovery only if the search is genuinely broad (many domains, unfamiliar area).

---

## Starting a workflow

Every feature/bug/refactor starts from a ticket in the Profile's **ticketing** system.

1. Get the ticket ID. **Check for an existing branch or open PR for it** — a scheduled
   run may already be on it.
2. If the ticket is in "Backlog", move it to "Up Next" so it is on the board. Add the
   `on-the-loop` label and move it to "AI Executing".
3. Branch from the Profile's **base branch**:
   `git checkout <base_branch> && git pull && git checkout -b <ticket-id>-<slug>`.
   If the working tree is dirty, stash first and say so.

(Standalone review and docs skip this and work on the current branch.)

---

## Phase: Discover

Find the facts before proposing anything.

- Read the models, macros, sources and YAML the change touches, plus their upstream and
  downstream lineage.
- **Read the nearest existing implementation of the same kind of change** — a sibling
  metric, a similar fix, a prior spec in the specs location — and follow its conventions
  (file layout, one YAML per model, existing macros, test style). Most rework comes from
  not doing this.
- Check the ADR index for the domain. Note whether a precedent exists — an ADR or an
  existing implementation of the same approach. This decides the route and whether an
  ADR is needed.
- Test every assumption in the ticket against the code or the data. Say which were
  confirmed and which were wrong, with the query or file that shows it.
- Bug route: write the failing query and check data coverage (`MIN`/`MAX`) on the
  columns involved.
- Note anything that will shape the design — coverage gaps, grain mismatches, a value
  living on a different entity than the ticket says. Raise these now, not at validation.
- If a fact you need is owned by someone else, stop that thread and ask; don't invent it.

If discovery surfaces undocumented models the change depends on, run the
**Documentation** step for them.

Then choose **light** or **full** and state why in one line.

---

## Phase: Specify and design

Define "done" before writing code: EARS-style `REQ-xxx` requirements and `VAL-xxx`
validation criteria, each `VAL` mapped to a `REQ` and marked **Objective** (checkable
against ground truth) or **Subjective** (needs a human judgement).

When a user has made a decision, carry it forward **in their words**. Don't widen it
("graph only for stableID" is not "graph only for every ID type").

**Light route:** write the plan in your reply — the REQ/VAL list, the files you'll
change, the expected schema change (columns added or changed, their types, and the
grain, even if unchanged), and any risk from Discover. Pass that plan to
`output-validator` for its schema check. Put the same REQ/VAL list in the ticket
description and, later, the PR body. No spec files.

**Full route:** delegate to `spec-author` for `requirements.md`, then again for
`design.md`. The design covers files to change, lineage, trade-offs, the `AGENTS.md`
solution-ladder rung, and the ADR check (comply, or propose a superseding ADR). Specs
live in the Profile's **specs location** as `<dd-mm-yy>-<name>/`. Update the ticket with
the branch, requirement IDs and impacted models.

**When to write an ADR.** ADRs record approaches; `design.md` records one change.

| Situation | Route | Written |
|---|---|---|
| Follows an existing precedent (ADR or in-repo pattern) | Light | PR body only |
| New structure, but nothing others will copy or rely on (e.g. a one-off report mart) | Full | `requirements.md` + `design.md` |
| No precedent for the approach, and other models will copy it or depend on its semantics (e.g. a new identity graph, key strategy, transformation technique) | Full | Spec files + a new ADR stated in general terms |
| Departs from an existing ADR | Full | Spec files + a superseding ADR |

Write the ADR so it covers the general pattern, not this ticket: the next change of the
same kind should find it in Discover and take the light route. `design.md` links to the
ADR rather than restating it. In scheduled mode, draft the ADR as `Proposed` in the PR;
a human accepts it.

---

## Phase: Implement

1. Work through the plan or design.
2. Comment non-obvious logic with the requirement it implements (`AGENTS.md` §10).
3. Write tests as you go, against the requirement, not the implementation, following the
   test rules in `AGENTS.md` §5. Name the seam the test guards, don't write tests that
   can't fail, and see each new non-structural test fail once against a broken input.
4. Build and test the changed models.
5. Check the change against `AGENTS.md` and fix any blocking violation.

---

## Phase: Validate output

Delegate to `output-validator` with the changed models and the `VAL-xxx` criteria. It
builds, checks schema, diffs against the Profile's **output-validation baseline**, and
returns a report with **Self-validatable: YES / NO**.

- **YES** (every criterion Objective and passed) → continue.
- **NO** → present the impact summary and samples for each Subjective or failed
  criterion and resolve it with the user. Fix and re-validate failed Objective criteria.

Objective outcomes that should hold permanently become dbt tests.

The report is working material. **Do not commit it.** Summarise the result in the PR body.

---

## Phase: Review

Delegate to `peer-reviewer` on the branch's changed models, passing the Validation
Report summary. It returns High/Medium/Low issues and suggestions.

- Interactive: walk High and Medium issues with the user, offering a specific fix for
  each. The user may decline.
- Log every item not implemented — including declined Highs, with their severity — to
  `dbt/models/<folder>/<model>_issues.md` (append if it exists). `_issues.md` is open
  debt only, not a changelog.

---

## Phase: Ship

1. Confirm models build and tests pass locally. Don't push a known-red branch.
2. Stage only this change. Check `git status` before committing — no validation
   reports, no unrelated files from a stash or another branch.
3. Commit with the ticket ID (`DATA-123: <summary>`), push, and open the PR from the
   repo's template. The body carries the summary, the REQ/VAL list (light route) or
   spec link (full route), and the validation result.
4. Delegate to `ci-interpreter` to watch checks to completion.
   - **PASS** → done.
   - **FAIL (code/test)** → fix, re-push, re-check.
   - **FAIL (data/infra)**, including failures that also fail on the base branch → say
     so plainly with evidence and the suggested next action. Don't retry blindly.
5. Address automated review comments (e.g. CodeRabbit): fix what's valid, reply to each
   saying whether it was accepted and fixed, declined (with reason), or logged to
   `_issues.md`. If a fix changes code, rerun the affected tests (and output validation
   if the data could change), commit, push, and wait for CI to pass again.
6. Move the ticket to the review status. Never merge.

---

## Gates

**Interactive (default).** At each gate for the route, show the artifact itself — the
findings, the plan, the spec, the design — and ask with `ask_user_question`
("Approve and proceed" / "Needs changes"), naming the phase ending and the one starting.
Lead with risks and consequences, not with decisions restated as settled.

**Scheduled** (`mode: scheduled` in the opening prompt). No questions. Keep going while
the work can advance, and stop only when:

- a decision the ticket doesn't settle would change what gets built — comment on the
  ticket with the specific question, leave `TODO(<ticket>)` notes on the branch, push it,
  and stop;
- validation returns Subjective criteria — report them and stop before Ship;
- the same problem has survived three fix attempts — report what you tried and stop;
- CI fails for data/infra reasons — report and stop.

Fix High peer-review issues; fix Medium where reasonable; log Low and suggestions.

---

## Documentation

Triggered when discovery surfaces new or undocumented models, and available standalone.
Follow `references/documentation.md`.

- Describe **why** a model exists and what business question it answers, not a
  restatement of its columns (`AGENTS.md` §4).
- Add column descriptions that carry business meaning.

Keep it to the models in play.

---

## Capability skills (optional)

Use only when asked or genuinely needed:

| Skill | When |
|-------|------|
| `spec-review` | Standalone review request |
| `quality-audit` | Maintainability pass on scripts or large diffs |
| `spec-debt` | Open `_issues.md` items and blocked tickets |
| `verify-this` | Non-dbt local claim (CLI/UI/API) |
| `ci-loop` | Watch this PR's checks until green |
| `pr-ergonomics` | Make the PR easier to review |
| `work-summary` | Status or handoff from git history |

`ci-failure-responder` is the scheduled dbt Cloud → ticket path; `ci-loop` is this PR.

See also `references/scheduled-mode.md`, `references/field-feedback.md`,
`references/project-context.md`.
