---
name: spec-driven
description: "The dbt development workflow for this project. Use when: building a feature, fixing a bug, refactoring code, planning a change, reviewing code, reviewing a PR, documenting models, or building or migrating a Lightdash dashboard. Triggers: spec-driven, new feature, build feature, fix bug, refactor, plan change, review, code review, peer review, PR review, document model, lightdash, lightdash dashboard, migrate looker dashboard."
tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "AskUserQuestion", "Task"]
---

# Spec-Driven Development

dbt work in this project goes: find the facts, settle the decisions with the user one at a
time, build to the standard in `AGENTS.md`, prove the data outcome, get an independent
review, ship through CI.

> **Authority:** `AGENTS.md` at the repo root holds the mandatory, blocking rules. This
> skill points to them rather than restating them.

No spec or design files are written to the repo. The agreed plan lives on the ticket while
you work and in the PR body at ship. Decisions that explain a specific piece of code live
next to that code.

| Intent | Validation default |
|--------|--------------------|
| Feature, semantic view | Mixed: expect some Needs-human checks. `semantic-view-author` writes semantic view DDL. |
| Bug fix | Objective: the correct value is known |
| Refactor | Objective: output must be identical |
| Standalone review | Go to **Review** on the current branch |
| Standalone docs | Go to **Documentation** |
| Dashboard (Lightdash) | Mixed: parity is Objective, layout is Needs-human. Follow `references/lightdash.md`; `dashboard-validator` replaces `output-validator`. Metric gaps go to `semantic-view-author` in the dbt repo. |

---

## Start

1. Get the ticket ID from the Profile's **ticketing** system. Check for an existing
   branch or open PR for it; a scheduled run may already be on it.
2. If the ticket is in "Backlog", move it to "Up Next". Add the `on-the-loop` label and
   move it to "AI Executing".
3. Branch from the Profile's **base branch**:
   `git checkout <base_branch> && git pull && git checkout -b <ticket-id>-<slug>`.
   If the working tree is dirty, stash first and say so.

Standalone review and docs skip this and work on the current branch.

---

## Discover

Do this yourself, in the main thread. What you find here is what the questions are built
from, so it has to be in your context.

- Read the context ledger named in the Profile, then the models, macros, sources and YAML
  the change touches, plus their upstream and downstream lineage.
- **Read the nearest existing implementation of the same kind of change** (a sibling
  metric, a similar fix) and follow its conventions: file layout, one YAML per model,
  existing macros, test style. Most rework comes from skipping this.
- Check the ADR index for the domain. Note whether a precedent exists: an ADR, or an
  in-repo implementation of the same approach.
- Test every assumption in the ticket against the code or the data. Record which held and
  which didn't, with the query or file that shows it.
- Bugs: write the failing query and check coverage (`MIN`/`MAX`, null counts) on the
  columns involved.
- Check whether a changed model is referenced by a semantic view (`ref('<model>')` in a
  `materialized = 'semantic_view'` model). If so, the semantic view is in scope.
- Note anything that shapes the design: coverage gaps, grain mismatches, a value living
  on a different entity than the ticket says.

If discovery surfaces undocumented models the change depends on, run **Documentation**
for them.

---

## Decide

Turn what discovery left open into decisions, **one question at a time**, each with a
recommendation.

**Which questions.** Only ones whose answer changes what gets built. Skip anything a
precedent or ADR already settles and say which one settled it. Ask the questions other
answers depend on first: grain before columns, population before metrics. A change that
copies an existing pattern may need none.

**What a question must contain.** The user hasn't seen your discovery. Each question has
to stand on its own:

- **Decision:** what is being chosen, in one line.
- **Why it matters:** what changes downstream depending on the answer.
- **Evidence:** the file, model or query you found, with the numbers.
- **Options:** two to four, each with its concrete consequence.
- **Recommendation:** one option, and why.

Ask with `ask_user_question`, recommended option first. Carry each answer forward **in the
user's words**. Don't widen it ("graph only for stableID" is not "graph only for every ID
type"). If an answer reopens an earlier one, say so and re-ask that one.

If a fact needed for a decision is owned by someone else and there's no evidence to base a
recommendation on, don't invent one. Ask who owns it.

**The agreed plan.** When nothing left would change what gets built, write the plan in
your reply and put it on the ticket:

- **Decisions:** each one with its answer.
- **Done when:** the checks that prove it, each marked **Objective** (checkable against
  ground truth) or **Needs-human** (a judgement).
- **Files:** what changes.
- **Schema:** columns added or changed with types, and the grain, even if unchanged.
- **Risks:** from discovery.

This plan is what `output-validator` and `peer-reviewer` check against.

**ADRs.** ADRs record approaches that other changes will repeat. If there's no precedent
for the approach and other models will copy it or depend on its semantics (a new identity
graph, key strategy, transformation technique), write a new ADR stated in general terms,
so the next change of the same kind finds it in discovery. If the plan departs from an
existing ADR, write a superseding one. A one-off structure nobody will copy needs no ADR.
In scheduled mode, draft the ADR as `Proposed` in the PR; a human accepts it.

---

## Build

The standard, not a checklist:

- The change reads like the precedent you found: same layout, macros, naming and test
  style.
- It passes `AGENTS.md`. Fix any blocking violation before moving on.
- **Decision comments.** Where a line is the way it is because of a decision from the
  Decide step, and the reason isn't obvious from the code, comment it per `AGENTS.md` §10
  with the ticket ID:

  ```sql
  -- DATA-123: first order after exposure, not account creation; account creation
  -- pulls in 2,678 pre-existing patients who never ordered in the window.
  ```

  Only decisions about a specific line or block go in code. Grain, scope and model
  purpose go in the model YAML `description`. Scope and out-of-scope go in the PR body.
- **Tests** follow `AGENTS.md` §5/§5a. Each names the seam it guards, its expectation
  comes from the agreed plan rather than from reading the SQL, and each new
  non-structural test has been seen to fail once against a broken input. Revert every
  mutation (`git diff` on models shows only intended changes).
- Changed models build and their tests pass.

---

## Validate

Delegate to `output-validator` with the changed models and the agreed plan. It builds,
checks the schema against the plan, diffs against the Profile's **output-validation
baseline**, and returns a report with **Self-validatable: YES / NO**.

- **YES** (every check Objective and passed): continue.
- **NO**: show the impact summary and samples for each Needs-human or failed check and
  resolve it with the user. Fix and re-validate failed Objective checks.

Objective outcomes that should hold permanently become dbt tests. The report is working
material. **Don't commit it.** Summarise the result in the PR body.

---

## Review

Delegate to `peer-reviewer` on the branch's changed models, passing the agreed plan and
the validation summary. It hasn't seen your reasoning, which is the point. It returns
High/Medium/Low issues, suggestions, and an advisory **Architecture** section (concerns
new in the diff only; pre-existing debt is Context).

- Interactive: walk High and Medium issues with the user, offering a specific fix for
  each. The user may decline. Architecture findings are advisory.
- Treat findings that don't affect correctness or the agreed plan as optional. Chasing
  every finding produces defensive code and tests for cases that can't happen.
- Log every item not implemented (including declined Highs with their severity, and
  Architecture "Introduced" items not acted on) to `dbt/models/<folder>/<model>_issues.md`,
  appending if it exists. For plugin-only changes, use the nearest changed-path
  `_issues.md`, or skip if there is no models tree. `_issues.md` is open debt only, not a
  changelog.

---

## Ship

1. Models build and tests pass locally. Semantic views referencing changed models have
   been reviewed or updated. Don't push a known-red branch.
2. Stage only this change. Check `git status` before committing: no validation reports,
   no unrelated files from a stash or another branch.
3. Commit with the ticket ID (`DATA-123: <summary>`), push, and open the PR from the
   repo's template. The body carries the summary, the agreed plan (decisions, Done when,
   schema), the validation result and, in scheduled mode, **Decided unattended**.
4. Delegate to `ci-interpreter` to watch checks to completion.
   - **PASS**: done.
   - **FAIL (code/test)**: fix, re-push, re-check.
   - **FAIL (data/infra)**, including failures that also fail on the base branch: say so
     plainly with evidence and the suggested next action. Don't retry blindly.
5. Address automated review comments (e.g. CodeRabbit): fix what's valid, and reply to
   each saying whether it was accepted and fixed, declined (with reason), or logged to
   `_issues.md`. If a fix changes code, rerun the affected tests (and output validation if
   the data could change), commit, push, and wait for CI again.
6. Move the ticket to the review status. Never merge.

---

## Interactive and scheduled

**Interactive (default).** The human touchpoints are the Decide questions, Needs-human
validation checks, High/Medium review issues, and the PR. Don't add approval gates
between phases.

**Scheduled** (`mode: scheduled` in the opening prompt). See `references/scheduled-mode.md`.
In short: accept every recommendation and list each under **Decided unattended** in the PR
body with its evidence. Stop only when:

- a decision needs a fact someone else owns and there's no evidence to recommend from:
  comment on the ticket with the question in the format above, leave `TODO(<ticket>)` at
  the spot, push the branch, stop;
- validation returns Needs-human checks: report them and stop before Ship;
- the same problem has survived three fix attempts: report what you tried and stop;
- CI fails for data/infra reasons: report and stop.

Fix High peer-review issues; fix Medium where reasonable; log Low and suggestions.

---

## What good looks like

**A question that works:**

> **Decision:** which patients count as "new" for `fct_exposure_conversion`.
> **Why it matters:** sets the denominator for every conversion rate on the dashboard.
> **Evidence:** `dim_patients.created_at` and `fct_orders.first_order_at` disagree for
> 2,678 of 41,090 exposed patients (query in thread); `fct_retention` uses first order.
> **Options:** (a) first order after exposure: 38,412 patients, matches `fct_retention`;
> (b) account created after exposure: 41,090, includes patients who never ordered.
> **Recommendation:** (a), so the two marts agree and the denominator is people who
> actually converted.

**A question that doesn't:** "Should new patients be based on first order or account
creation?" There's no evidence, no consequence and no recommendation, so the user has to
redo the discovery to answer it.

**A PR body:** summary; decisions with their answers; Done when with each check's
result; schema change; validation result; Decided unattended (scheduled only);
`_issues.md` entries added.

---

## Documentation

Triggered when discovery surfaces new or undocumented models, and available standalone.
Follow `references/documentation.md`.

- Describe **why** a model exists and what business question it answers, not a
  restatement of its columns (`AGENTS.md` §4).
- Column descriptions carry business meaning.

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

See also `references/scheduled-mode.md` and `references/project-context.md`.
