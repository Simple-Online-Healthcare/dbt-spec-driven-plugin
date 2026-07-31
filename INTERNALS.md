# dbt-spec-driven — Internals & Maintainer's Guide

## 1. Audience — read this when

You are changing the plugin itself, not using it. Read this before you:

- add or edit a skill, sub-agent brief, hook, or reference;
- add a Project Profile key, or move a hardcoded value into the Profile;
- change phase order, gate behavior, or a sub-agent's output contract;
- touch anything under `adapters/` or `scripts/`;
- debug "the agent skipped a phase / did the work inline / lost its place after compaction";
- cut a release and propagate it to installed copies.

If you only want to *use* the workflow, read `README.md` and the Project Profile block in
`AGENTS.example.md` instead.

**Orientation facts, up front:**

| Fact | Value |
|------|-------|
| Plugin name / namespace | `dbt-spec-driven` |
| Skill invocation | `/dbt-spec-driven:spec-driven`, `/dbt-spec-driven:spec-review`, … |
| Plugin root | **the repository root** — canonical paths are `skills/…`, `agents/…`, `hooks/hooks.json` |
| Manifest | `.cortex-plugin/plugin.json` |
| License | MIT (`LICENSE`) — this is a public, standalone plugin |
| Rules file | `AGENTS.md`, owned by the **consuming** dbt repo. This repo ships the template as `AGENTS.example.md` |

The plugin ships **no** team-specific values. Everything a team must set lives in one
table: the **Project Profile** at the top of `AGENTS.md`. Skills, agents, and rules
reference Profile entries *by name* (the **specs location**, the **base branch**, the
**data-diff tool**, …), never by literal. Preserving that boundary is the single most
important maintenance rule in this repo.

---

## 2. The four-layer model

Each layer owns its content exactly once. Cross-layer duplication is the primary defect
class in a repo like this, because duplicated prose drifts silently.

| # | Layer | Lives in | Loaded / invoked by | Owns |
|---|-------|----------|---------------------|------|
| 1 | **Rules** (always-on) | `AGENTS.md` in the consuming repo (template: `AGENTS.example.md`) | `SessionStart` hook; adapter rule files | Objective, blocking engineering rules + the Project Profile |
| 2 | **Activation** (host wiring) | `hooks/hooks.json`, `adapters/`, `scripts/` | The host at session lifecycle events | Getting layers 1/3/4 in front of the model; structural enforcement |
| 3 | **Workflow** (user-triggered) | `skills/` | User intent or an explicit `/dbt-spec-driven:<skill>` invocation | Phase machine, gates, routing, artifact templates |
| 4 | **Isolated steps** (spawned) | `agents/` | The `Task` tool, from within layer 3 | Heavy, context-isolated work + a structured return contract |

### The ownership rules

1. **Layer 3 never restates layer 1.** `skills/spec-driven/SKILL.md` says "satisfies
   `AGENTS.md`" and "§9 PR gate" — it does not reproduce the rules. If you find yourself
   copying a rule into a skill, either point at `AGENTS.md` or the rule belongs in
   `AGENTS.md` and does not yet exist there.
2. **Layer 1 never describes process.** `AGENTS.md` is objectively checkable, blocking
   facts. Subjective quality judgement belongs to `agents/peer-reviewer.md`; structural
   judgement to `agents/quality-auditor.md`.
3. **Layer 2 never becomes a source of truth.** Hooks inject reminders and load files.
   Adapters name paths. Neither encodes workflow logic. `docs/agent-portability.md`
   ("What not to copy") is the normative list.
4. **Layer 4 returns a contract, not prose.** Every file in `agents/` ends with a fenced
   output block. Downstream phases parse those shapes; changing one is a breaking change.

The design pattern is credited in `docs/agent-portability.md` to
[`DietrichGebert/ponytail`](https://github.com/DietrichGebert/ponytail) — canonical core,
thin host adapters, drift checks on generated copies.

---

## 3. Source copy vs installed copy

There are two copies of this plugin on a maintainer's machine, and they drift.

| | Path | Role |
|---|---|---|
| **Source** | this repo (e.g. `~/…/dbt-spec-driven-plugin/`) | What you edit and commit. Git is the source of truth. |
| **Installed** | `~/.snowflake/cortex/plugins/dbt-spec-driven/` | What Cortex actually loads at runtime. |

Cortex reads the installed copy. An edit in the source tree has **zero runtime effect**
until it is propagated. This produces the two classic confusions:

- *"I fixed the skill but the agent still does the old thing."* → you edited source; the
  installed copy is stale.
- *"The behavior does not match any file I can find."* → you are reading source; the agent
  is reading an older installed tree.

`~/.snowflake/cortex/plugins/registry.json` records each installed plugin's `source`,
`installedAt`/`updatedAt`, `active`, and `pendingUpgrade`. Two things to know:

- The recorded `source` is whatever the plugin was originally installed from. If a plugin
  was installed from a different location than the repo you are now editing, an
  update pulls from that recorded source and will silently overwrite your work. Check the
  registry entry before running an update.
- `pendingUpgrade: true` means the installed tree is not what the registry expects.
  Resolve it (re-install or update) rather than editing the installed copy in place.

**Never edit the installed copy.** It is a build output. Propagation procedure: §13.

A concrete drift signature to look for: an installed tree that contains only
`.cortex-plugin/`, `agents/`, `hooks/`, `skills/`, `README.md` and is missing
`adapters/`, `scripts/`, `docs/`, `AGENTS.example.md`, and `LICENSE` predates the
multi-host and capability-skill work and cannot possibly honor the current contracts.

---

## 4. File map

```
.cortex-plugin/plugin.json                            # Manifest: name, version, description
AGENTS.example.md                                     # Layer 1 template — rules + Project Profile
LICENSE                                               # MIT
README.md                                             # User-facing overview and install
INTERNALS.md                                          # This file
.gitignore                                            # .DS_Store, .cortex/notes/

hooks/hooks.json                                      # Layer 2 — Cortex lifecycle hooks (bash + PowerShell)

skills/spec-driven/SKILL.md                           # Layer 3 CANONICAL — routing, phases, gates, modes
skills/spec-driven/references/spec-documents.md        #   the four spec docs: ownership table + templates
skills/spec-driven/references/project-context.md       #   what durable context to capture, and where
skills/spec-driven/references/cross-repo-handoff.md    #   downstream-consumer handoff trigger + fields
skills/spec-driven/references/documentation.md         #   contextual dbt docs + inline-comment patterns
skills/spec-driven/references/field-feedback.md        #   observed failures → the enforcement they drove
skills/spec-driven/references/scheduled-mode.md        #   unattended execution + Retry Protocol detail

skills/spec-review/SKILL.md                           # Satellite — fast entry into Phase: Review
skills/spec-debt/SKILL.md                             # Satellite — read-only unresolved-debt ledger
skills/verify-this/SKILL.md                           # Capability — falsifiable claims, non-dbt surfaces
skills/verify-this/references/local-surfaces.md        #   CLI/TUI, UI/browser, smoke, compile harnesses
skills/ci-loop/SKILL.md                               # Capability — watch/fix loop on PR checks
skills/quality-audit/SKILL.md                         # Capability — strict maintainability audit
skills/pr-ergonomics/SKILL.md                         # Capability — PR reviewability, conflicts, comments
skills/work-summary/SKILL.md                          # Capability — source-backed status summaries

agents/discovery.md                                   # Layer 4 — fact-find, disprove assumptions
agents/test-author.md                                 # Layer 4 — dbt tests and assertions
agents/output-validator.md                            # Layer 4 — data-outcome validation vs VAL criteria
agents/peer-reviewer.md                               # Layer 4 — qualitative model review
agents/ci-interpreter.md                              # Layer 4 — poll and classify CI
agents/quality-auditor.md                             # Layer 4 — structural maintainability review

adapters/README.md                                    # Adapter contract + layout + install commands
adapters/cursor/rules/agents-md.mdc                   # Cursor: always-on pointer to AGENTS.md
adapters/cursor/rules/spec-driven-trigger.mdc         # Cursor: always-on workflow trigger
adapters/cursor/skills/<8 skills>/SKILL.md            # Cursor: one thin pointer per canonical skill
adapters/cursor/agents/<6 agents>.md                  # Cursor: one thin pointer per sub-agent
adapters/vscode/copilot-instructions.md               # VS Code/Copilot: single-file pointer sheet
adapters/codex/README.md                              # Codex: wiring reminders (printed, not written)

scripts/install-agent-adapters.sh                     # Renders {{PLUGIN_ROOT}} → generated adapters
scripts/check-adapter-drift.js                        # Re-renders templates; fails on drift

docs/agent-portability.md                             # Host matrix, capability map, what-not-to-copy
```

Not in this repo, but part of the running system:

```
<consuming repo>/AGENTS.md                    # live rules + Project Profile (copy of AGENTS.example.md)
<specs location>/<dd-mm-yy>-<name>/           # per-ticket spec set + workflow-state.md
<models location>/**/<model>_issues.md         # unimplemented review items
<context ledger>                              # durable team context (CTX atoms)
<handoff location>/<ticket>-<slug>.md          # cross-repo model context handoff
<local notes location>/session-log.md          # appended by the SessionEnd hook
```

---

## 5. Manifest and versioning

`.cortex-plugin/plugin.json` is deliberately minimal:

```json
{
  "name": "dbt-spec-driven",
  "version": "0.3.0",
  "description": "…"
}
```

| Field | Meaning |
|-------|---------|
| `name` | Plugin identity **and** the skill namespace. `dbt-spec-driven` is why skills are invoked as `/dbt-spec-driven:spec-driven`. Renaming it breaks every documented invocation, every adapter, and the installed directory name. |
| `version` | Semver-ish. Bumped for meaningful behavior changes; used to reason about what an installed copy actually contains. |
| `description` | Discovery text. Should stay an accurate inventory — it currently enumerates the canonical skill, the four-document spec set, both execution modes, all satellite/capability skills, and all six sub-agents. Update it when that inventory changes. |

There is **no** `skills` or `agents` array. Discovery is by convention: any
`skills/<name>/SKILL.md` becomes a skill (its frontmatter `name` and `description` drive
routing), and any `agents/<name>.md` is available as a sub-agent brief. Adding a skill is
therefore "create the directory"; there is no manifest to register it in.

Versioning guidance:

- **Patch** — wording, typo, clarification that cannot change agent behavior.
- **Minor** — new skill/agent/reference/hook, new Profile key, changed phase or gate
  semantics, changed sub-agent output contract.
- Bump in the same commit as the change, so an installed copy's version is diagnostic.
  `references/field-feedback.md` makes the bump step 3 of its "add a new entry" protocol.

---

## 6. Hook reference

`hooks/hooks.json` is a single JSON object: `hooks` → event name → array of groups → each
group's `hooks` array of command entries. Fields per entry: `type` (always `"command"`),
`command`, `timeout`, optional `statusMessage`, `enabled`.

### The dual-variant pattern

Every logical hook is registered **twice**: once as a POSIX/bash command, once as a
PowerShell command. Cortex runs the shell appropriate to the OS; the non-matching variant
fails silently (command not found → no output → nothing injected). A mixed-OS team needs no
per-user configuration.

Consequences for maintainers:

- **Edit both variants or neither.** A change applied to only one variant produces a bug
  that is invisible on your OS. This is the most common hook defect.
- The bash variants use `jq` for JSON construction (hence the `jq` requirement in
  `README.md`); the PowerShell variants use `ConvertTo-Json` or hand-built strings and need
  no extra tooling.
- Hooks communicate by printing JSON on stdout. Two keys are used:
  `additionalContext` (injected as context the model sees) and `systemMessage`.
- Bash variants end with `|| true` or are otherwise failure-tolerant, so a missing file
  never aborts a session.

### Spec-directory resolution

Three hooks need "the active spec directory". Both variants implement the same logic:

1. Try each candidate root in order — the Profile's **specs location** candidates, shipped
   as `dbt/specs` then `specs`.
2. Collect every `<root>/<spec-dir>/workflow-state.md` that exists.
3. Take the **most recently modified** one, and derive the spec directory from it.
4. If none exists, fall back to a generic reminder.

Selection is by modification time, not by name. Spec directories are named `dd-mm-yy-<name>`,
so a lexicographic sort would let day-of-month dominate (`28-05-26` would sort after
`03-06-26`) and pick a stale state file. Resolving on the state file's mtime also means the
hooks track the workflow the agent is actually touching.

This is the only place in the plugin where the specs location is a literal rather than a
Profile lookup — hooks are plain shell and cannot read the Profile table. A team whose
specs live elsewhere gets the generic fallback message, not an error. If you add a
candidate root, add it to **all six** occurrences (three hooks × two variants).

### `| blocked` is a hard stop

`workflow-state.md` rows use `blocked` as a status. `SubagentStop`, `PreCompact`, and `Stop`
all
grep for the literal `| blocked`; when found, they replace the normal message with a
HARD STOP directive instructing the agent to terminate and report rather than continue.
This is the structural backstop for the Retry Protocol (§11) — it survives context
compaction because it is re-derived from a file on every event.

### The hooks

| Event | Variants | What it does | Why it exists |
|-------|----------|--------------|---------------|
| `SessionStart` | 2 (bash + PS) | If `AGENTS.md` exists, inject its full contents prefixed with "Mandatory project rules … (highest authority)". `statusMessage`: "Loading AGENTS.md rules". | Layer 1 must be in context before any dbt work, without the user asking. This is what makes the rules "always-on". |
| `SessionStart` | 2 (bash + PS) | Concatenate the context-ledger path and the local-notes project-context file when present, and inject them labelled as planning context to "verify before high-risk action". `statusMessage`: "Loading durable project context". | Durable team facts (§9) are useless if nobody reads them. The "verify before high-risk action" framing prevents user-supplied context from being treated as verified. |
| `SubagentStop` | 2 (bash + PS) | Resolve the spec dir. If `blocked` → HARD STOP. Otherwise inject a GATE directive: (1) update `workflow-state.md` marking the phase complete and the sub-agent `delegated`, (2) verify **all** TRANSITION checklist items, (3) interactive → `ask_user_question`; scheduled → auto-approve only if every item passes, else Retry Protocol. If no spec dir/state file → a softer "ensure `workflow-state.md` exists" note. `timeout` 10. | The highest-value hook. A sub-agent returning is exactly the moment an agent is tempted to skip the gate and race ahead. Firing on the event rather than trusting the skill text makes the gate structural. |
| `PreCompact` | 2 (bash + PS) | If `blocked` → HARD STOP. Otherwise count `\| pending` and `\| in-progress` rows and emit a `systemMessage` state audit naming the counts and the state-file path, with post-compaction instructions (read the file, finish the current TRANSITION checklist, honor gates). No state file → remind the agent to persist the four spec docs, the context ledger, and any `_issues.md` before summarization. `timeout` 10. | Compaction is where workflow position is lost. The externalized state file plus this audit is the recovery mechanism. |
| `Stop` | 2 (bash + PS) | If the state file records `blocked`, report that the workflow terminated without completing and point at the Retry Log. Otherwise, if any `pending`/`in-progress` rows remain, warn that the agent is stopping with N incomplete phases. Silent when complete. `timeout` 10. | Catches the silent-abandonment failure, and is the primary signal that an unattended (scheduled) run did not finish. |
| `SessionEnd` | 2 (bash + PS) | If `git diff --name-only` is non-empty, append a dated `## <timestamp> — <branch>` section listing changed files to `.cortex/notes/session-log.md` (creating the directory). `timeout` 15. | Cheap session telemetry for handoff. `.cortex/notes/` is gitignored; this is never a team source of truth. |

Total: 5 events, 6 logical hooks, 12 command entries.

---

## 7. Sub-agent contracts

Sub-agents exist for two reasons: **context isolation** (heavy exploration does not pollute
the main thread) and **auditability** (a structured artifact that outlives the
conversation). Every brief follows the same shape: `## Inputs`, `## Process`,
`## Constraints`, `## Output`.

The fenced output block at the bottom of each brief is a **contract**. Downstream phases,
gate logic, and other agents key off specific markers in it. Changing a marker is a
breaking change that must be traced to every consumer.

| Agent | Trigger | Key inputs | Output shape | Consumed by |
|-------|---------|-----------|--------------|-------------|
| `discovery` | Start of **every** workflow (feature / bug / refactor). Mandatory first gate. | User request; models, macros (**reusable-logic location**), sources, **specs location** | `## Findings` / `## Assumptions` (Verified \| Disproven + evidence) / `## Root cause` (bugs) / `## Data coverage` / `## Existing macros/packages` / `## Documentation gaps` / `## Open questions (blockers)` | Specify phase (grounds the spec); Design phase must address the macros section; Documentation step is triggered by the gaps section |
| `test-author` | Any model created or modified | `prd.md` `REQ-xxx` + Validation Criteria, or the bug's regression guard; changed models | `## Tests added/updated` (→ `REQ-xxx`) / `## Run result` / `## Gaps` | Implement phase; re-invoked from Validate Output to codify objective outcomes as standing tests |
| `output-validator` | After Implement, **before** Review, on every path | Changed models; `VAL-xxx` (Objective/Subjective) from `prd.md`; `architecture-design.md` for schema/grain; the **output-validation baseline** | **Validation Report**: `Self-validatable: YES \| NO` / `### Schema check` / `### Data delta vs baseline` / `### Criteria` (PASS \| FAIL \| NEEDS SIGN-OFF) / `### Requirement traceability` | The gate decision (see below); `peer-reviewer` reads the data delta rather than recomputing it |
| `peer-reviewer` | Before Ship, on changed models. Also the standalone-review entry. | Diff vs the **base branch**; spec set; the Validation Report *if available* | `## Issues` → `### High` / `### Medium` / `### Low`, then `## Suggestions` | Review phase walks High/Medium individually; every unimplemented item lands in `<model>_issues.md` |
| `ci-interpreter` | After the PR is opened | Branch + PR; the Profile's **CI system** (default surface: GitHub checks via `gh`) | `## CI status: PASS \| FAIL \| PENDING` / `## Failed checks` with `classification: code/test \| data \| infra` / `## Recommended next action` | Ship phase branches on status; the classification decides fix-here vs escalate vs hard-stop |
| `quality-auditor` | Invoked via the `quality-audit` capability skill — **not** part of the mandatory chain | Diff vs the **base branch**; full contents of changed files; intent/spec if available | `## Quality Audit` → `### High` / `### Medium` / `### Low` / `### No-Issue Notes` | Read by the user; additive to `peer-reviewer`, never a substitute |

### The two load-bearing markers

**`Self-validatable: YES | NO`** (from `output-validator`) is the plugin's autonomy switch:

- `YES` — every `VAL-xxx` was Objective and passed. No human gate; proceed to Review. These
  are the tasks that can legitimately run unattended.
- `NO` — at least one criterion is Subjective or failed. Interactive: a hard gate presenting
  impact summary plus representative samples until the user signs off each outcome.
  Scheduled: a **hard stop**, explicitly *not* retryable, because it needs human judgement.

**Issue severity** (from `peer-reviewer`) drives both the interactive per-issue gate and
scheduled-mode behavior (High must be fixed, Medium should be, Low is logged only).

### Explicit anti-duplication rule

`agents/quality-auditor.md` defers dbt semantics and qualitative model review to
`peer-reviewer`. `agents/peer-reviewer.md` defers data deltas to `output-validator` and
objective rules to `AGENTS.md`. `docs/agent-portability.md` states the boundary at the
capability level: do not duplicate `discovery`, `test-author`, `output-validator`,
`peer-reviewer`, or `ci-interpreter`. When adding review-like behavior, first prove no
existing agent owns it.

---

## 8. Skill inventory

Three classes, three different obligations.

| Class | Skills | Obligation |
|-------|--------|-----------|
| **Canonical** | `spec-driven` | Owns the phase machine, routing, gates, artifacts, and both execution modes. The single source of workflow truth. |
| **Satellite** | `spec-review`, `spec-debt` | Thin entry points into, or read-only audits of, canonical artifacts. Must not contain workflow logic. |
| **Capability** | `verify-this`, `ci-loop`, `quality-audit`, `pr-ergonomics`, `work-summary` | Cover surfaces the canonical sub-agents do **not** own. Must route through a canonical artifact. |

Frontmatter is uniform: `name`, `description` (the routing text — trigger phrases matter,
this is what the host matches on), and `tools` (least privilege; e.g. `spec-debt` and
`work-summary` are read-only — no `Write`/`Edit`).

### Canonical

`skills/spec-driven/SKILL.md` — routing table, Flight Checklist, sub-agent delegation
contract, Starting a Workflow, Workflow State Tracker, continuous context capture, the
phase definitions with TRANSITION checklists, spec file conventions, Gate Protocol, and
Execution Mode + Scheduled Mode Rules. Detail is pushed into
`skills/spec-driven/references/` so the skill body stays navigable; the skill names the
reference and the phase that must read it.

### Satellite

| Skill | Behavior |
|-------|----------|
| `spec-review` | Reads `AGENTS.md`, then the canonical skill's `Routing → Standalone Review`, `Phase: Review`, and `Gate Protocol`, and executes that route verbatim. Delegates to `peer-reviewer`; never reviews inline. If no Validation Report exists it says so rather than recreating output validation. Ends with an explicit instruction: change review behavior in the canonical skill or the agent brief, not here. |
| `spec-debt` | Read-only. Scans `workflow-state.md` files for incomplete/skipped/`blocked` rows, `_issues.md` files for open items, `field-feedback.md` for unencoded follow-ups, and explicit `spec-debt:` markers. Emits `<file>:<line> - <debt>. trigger: <…>` tagged `gate` / `review` / `feedback` / `marker` / `no-trigger`, then a count line, or `No spec-driven debt found.` Persists nothing unless asked. |

### Capability

Every capability skill has a `## Boundaries` section naming the canonical authority it
must not usurp. That section is the contract.

| Skill | Surface it adds | Boundary |
|-------|-----------------|----------|
| `verify-this` | Falsifiable claims on non-dbt/local surfaces: CLI/TUI, UI/browser, API, compile/typecheck, smoke, performance, memory. Returns exactly one verdict: `VERIFIED` / `NOT VERIFIED` / `INCONCLUSIVE`. Disposable artifacts under `/tmp/verify-this/<claim-slug>/`. Loads `references/local-surfaces.md` only when a harness is needed. | `output-validator` remains the authority on dbt data outcomes and `VAL-xxx`. Evidence relevant to a spec criterion must be linked from the Validation Report or `wbs.md`. |
| `quality-audit` | Strict maintainability/structure pass — complexity, file-size sprawl, weak boundaries, pass-through abstractions, misplaced logic, AI slop. Drives `agents/quality-auditor.md`. | Runs **after** `peer-reviewer` for dbt models. Does not relitigate objective `AGENTS.md` failures — routes them back as blockers. |
| `ci-loop` | Iterative watch/diagnose/fix on PR checks. Classifies each failure `code/test` / `data` / `infra/transient` / `unknown`; returns `GREEN` / `BLOCKED` / `PENDING`. Defaults to `gh pr checks`, with a note to substitute the Profile's **CI system** equivalents. | `ci-interpreter` remains the final CI status authority. No merging, no endless retry, no `--no-verify`. |
| `pr-ergonomics` | Four sub-workflows: make a PR reviewable, collect PR comments, resolve merge conflicts, branch/PR preparation. | Runs only after canonical gates are satisfied. Never replaces the Ship phase; PR creation still follows the Profile's **PR template** and `ci-interpreter`. No history rewriting or force-push without approval. |
| `work-summary` | Source-backed status summaries, weekly reviews, demo notes, handoffs, from git evidence plus spec artifacts. | Read-only by default; posts nowhere (including the Profile's **ticketing** system) unless asked. Uncommitted work must be labelled as such. Evidence over memory. |

The phase↔capability mapping is also tabulated in `docs/agent-portability.md`
("Capability map") and in the canonical skill's "Capability skills" table. Those three
tables must agree.

---

## 9. Artifact lifecycle

| Artifact | Location | Written by | Read by | Lifetime |
|----------|----------|-----------|---------|----------|
| `project-charter.md` | `<specs>/<dd-mm-yy>-<name>/` | Specify (feature) / Specify+Implement (bug) / Design+Implement (refactor) | Humans; `work-summary`; future agents | Durable, committed |
| `prd.md` | same | same | `test-author` (REQ), `output-validator` (VAL), `peer-reviewer` (intent) | Durable, committed |
| `architecture-design.md` | same | Design (feature) / condensed phase (bug, refactor) | `output-validator` (expected schema/grain), `peer-reviewer` (planned structure) | Durable, committed |
| `wbs.md` | same | same | Implement phase (task by task); `verify-this` links evidence here | Durable, committed |
| `workflow-state.md` | same | The main thread, after every phase | Every gate; all three state-aware hooks; `spec-debt` | Per-workflow, committed |
| **Validation Report** | Returned by `output-validator` (conversational) | `output-validator` | The gate decision; `peer-reviewer`; `work-summary` | **In-context only** — see gotchas |
| `<model>_issues.md` | `<models location>/<folder>/` | Review phase, after `peer-reviewer` | Future reviewers; `spec-debt` | Durable, append-only, committed with the PR |
| Cross-repo handoff | `<handoff location>/<ticket-or-date>-<slug>.md` | Design phase, when downstream consumers are affected | Downstream repo's agents | Durable, committed |
| Context atoms (`CTX-…`) | The Profile's **context ledger** | Any phase that learns a reusable fact | `SessionStart` hook, every future session | Durable, team-shared |
| `session-log.md` | The Profile's **local notes location** | `SessionEnd` hook | Humans, handoff | Local, gitignored |

### The four-document model

`skills/spec-driven/references/spec-documents.md` is the authority. Each document owns one
question, and **all four are created even for small bug fixes** (compact, but present) so
future agents know where each kind of context lives:

| File | Owns |
|------|------|
| `project-charter.md` | *Why* the work exists — problem, value, stakeholders, success metrics, constraints, risks, milestones, next steps |
| `prd.md` | *What* the system must do — consumers, functional/non-functional/data/interface requirements, assumptions, out of scope, `REQ-xxx`, acceptance criteria, `VAL-xxx` |
| `architecture-design.md` | *How* it will work — affected files, data flow, lineage impact, alternatives, security/compliance, performance, validation design |
| `wbs.md` | *How the work runs* — tasks, dependencies, sequencing, test plan, validation plan, CI/release plan, risks, progress log |

Traceability is the spine: every testable behavior gets a `REQ-xxx`; every validation
criterion gets a `VAL-xxx`, is tagged `Objective` or `Subjective`, and maps to one or more
`REQ-xxx`. `Objective` is what makes a task self-validatable; `Subjective` is what forces a
human gate. Requirements use EARS notation
(`WHEN/WHILE/WHERE/IF <condition>, THE SYSTEM SHALL <behavior> SO THAT <rationale>`).

### `workflow-state.md`

The externalized progress record — a file, not conversation text, so it survives
compaction. Columns: `Phase | Status | Gate | Artifact | Sub-agent delegated`.

- Status: `pending` → `in-progress` → `complete`, or `blocked`.
- Gate: `approved` (interactive), `auto-approved (scheduled)`, or `self-validated`
  (objective-only output validation).
- Sub-agent: `delegated` once the `Task` tool has actually been called.
- Any empty cell in the current row **blocks** the transition.
- In scheduled mode a `## Retry Log` table is appended.

The canonical skill ships two templates (Bug Fix — 5 rows; Feature — 7 rows, splitting
Specify and Design). Refactor reuses the bug-fix shape with `Design+Implement`.

---

## 10. Control flow

### Routing

Intent detection happens first; ambiguity must be resolved with the user before starting.

| Intent | Route |
|--------|-------|
| New Feature | Full workflow |
| Bug Fix | Condensed: Specify and Implement fused |
| Refactor | Condensed: Design and Implement fused |
| Standalone Review | Jump to **Phase: Review** on the current branch (no ticket/branch creation) |
| Standalone Docs | Jump to the **Documentation** step (no ticket/branch creation) |

### Starting a workflow

1. Ask for the ticket ID.
2. Branch from the Profile's **base branch**: `git checkout <base> && git pull &&
   git checkout -b <ticket-id>-<slug>`.
3. Create `<specs>/<dd-mm-yy>-<feature-name>/`.
4. Read `references/spec-documents.md`; create all four documents.
5. Record ticket + branch at the top of `project-charter.md` and `prd.md`.
6. Create `workflow-state.md`.
7. Enter Discover.

### The three paths

Discovery is universal and non-negotiable; Validate Output runs on every path; Review and
Ship are shared.

```
FEATURE
  discovery ─GATE→ Specify ─ticket-update─GATE→ Design ─GATE→ Implement(+test-author)
    → output-validator ─GATE-if-subjective→ peer-reviewer → _issues.md ─GATE→ Ship(+ci-interpreter)

BUG FIX
  discovery ─GATE→ Specify+Implement(+test-author)
    → output-validator ─GATE-if-subjective→ peer-reviewer → _issues.md ─GATE→ Ship(+ci-interpreter)

REFACTOR
  discovery ─GATE→ Design+Implement(+test-author)
    → output-validator ─GATE-if-subjective→ peer-reviewer → _issues.md ─GATE→ Ship(+ci-interpreter)
```

`GATE-if-subjective` is the only conditional gate: hard gate when the Validation Report
says `Self-validatable: NO`; auto-proceed on `YES`.

The Flight Checklist at the top of the canonical skill is this same table, placed early and
marked mandatory, with a legend defining `sub-agent`, `GATE`, `GATE-if-subjective`,
`_issues.md`, and `ticket-update`. It exists so the agent can re-derive its obligations at
any phase boundary without re-reading the whole skill.

### TRANSITION checklists

Every phase boundary carries a `### TRANSITION: X → Y` block of checkbox items. They are
uniform in structure and always assert the same four things:

1. The required sub-agent was delegated **via the Task tool**, not done inline.
2. The phase's artifact exists and contains the required sections.
3. `workflow-state.md` was updated (row complete, sub-agent `delegated`, gate recorded).
4. The GATE is satisfied per the Gate Protocol.

The checklist is what a gate actually checks. In scheduled mode it *is* the gate. This is
why the `SubagentStop` hook enumerates the same three steps — belt and braces on the
transition that agents most often shortcut.

### Phase-specific obligations worth knowing

- **Discover** — no solutioning permitted. If discovery surfaces new/undocumented models
  the change depends on, the Documentation step runs *before* continuing.
- **Specify** — Validation Criteria are drafted here, tagged Objective/Subjective, and the
  ticket is updated with branch + REQ-IDs + impacted models. Task-type default: bugs and
  refactors usually have ground truth; features are mixed.
- **Design** — mandatory layer/reuse checks when sources or unions are involved
  (`source()` and union/dedup in the first layer only; prefer existing package/repo macros;
  consolidate shared source unions), and a cross-repo handoff check against the Profile's
  **downstream consumer repos**.
- **Implement** — work `wbs.md` task by task; validate every change against `AGENTS.md`;
  there is no separate standards skill.
- **Validate Output** — the data equivalent of an end-to-end test. Objective outcomes worth
  keeping go back to `test-author` as standing regressions (the TDD ratchet).
- **Review** — High/Medium issues walked **one at a time** with a specific proposed fix;
  every unimplemented item is logged with its severity, so a skipped High is visible as
  skipped.
- **Ship** — confirm local health first (never push a known-red branch); commit with the
  ticket ID; stage `_issues.md` too; fill the Profile's **PR template** (mirror its usual
  sections if the file is absent); delegate `ci-interpreter`; branch on PASS / FAIL(code) /
  FAIL(data-infra). **Never merge automatically.**

### Gate Protocol

Shared rules: a gate enforces *completeness*, not merely permission; delegations and
artifacts are never skipped regardless of mode; the outcome is recorded in
`workflow-state.md`.

Interactive: every gate uses `ask_user_question` with options including
`"Approve and proceed"` and `"Needs changes"`; the question must name the completing phase
and the next one; **a tangential question does not satisfy a gate** even if the answer
implies consent. Three standard formats are specified — the phase gate, the per-issue
Review gate, and the pre-Ship gate.

---

## 11. Interactive vs scheduled mode

Mode is detected from the invocation: `mode: scheduled` in the prompt (or an
automation/cron context) selects scheduled; otherwise interactive.

| Aspect | Interactive | Scheduled |
|--------|-------------|-----------|
| Gates | `ask_user_question`, hard stop until a human approves | Self-checkpoint: auto-approve only when every TRANSITION item passes |
| Sub-agent delegation | Mandatory | Mandatory — unchanged |
| Artifacts | Required | Required — unchanged |
| `workflow-state.md` | Required | Required, plus `## Retry Log` |
| Failure handling | Present to the user | Retry Protocol, 3 attempts per problem |
| Subjective validation | Human sign-off | **Hard stop** — not attempted |
| PR merge | Never automatic | Never automatic — unchanged |

Scheduled mode is **not** a reduced workflow. The only thing that changes is who answers
the gate. Framing from the skill: "the gate checks itself instead of asking a human."

### Retry Protocol

Applies to build errors, test failures, blocking peer-review issues, output-validation
failures, and incomplete TRANSITION checklists.

1. Log a one-line problem description under `## Retry Log` in `workflow-state.md`.
2. Apply the most targeted fix available.
3. Re-run the failing check (rebuild, re-test, re-delegate).
4. Evaluate: **same problem recurs** → increment that problem's counter. **Different
   failure** → progress; reset the counter, the new problem gets its own 3 attempts.
5. After 3 failed attempts at the same problem → **hard stop**: write the summary, set the
   phase status `blocked`, terminate. No 4th attempt, no skipping the phase.

"Same problem" is defined by an identity key, tabulated in
`references/scheduled-mode.md`: build error → first line of the message; test failure →
test name; peer-review issue → issue ID or description; CI failure → check name plus error
type.

Hard-stop behavior is precise: set the phase `blocked`, write the full retry log, do not
proceed, do not push or open a PR, terminate cleanly. `workflow-state.md` becomes the
diagnostic handoff. The `blocked` status is then re-detected by `SubagentStop` and
`PreCompact` on every subsequent event, so a resumed session cannot walk past it.

Non-retryable hard stops: `Self-validatable: NO` (needs human judgement) and CI failures
classified `data` or `infra`.

Suitability, per `references/scheduled-mode.md`: bug fixes with ground truth and
behavior-preserving refactors are good candidates; all-Objective features are acceptable
but rare; features with Subjective criteria are unsuitable and will hard-stop at
`output-validator`.

---

## 12. Adapters

Cortex loads the plugin natively. Other hosts get **generated, thin** adapter files. The
rule, stated in `adapters/README.md` and `docs/agent-portability.md`: adapters are
**pointers only**. They may name canonical paths, activation triggers, and host-specific
setup. They may not restate the phase machine, the dbt rules, sub-agent contracts, or
field-feedback narratives.

### The `{{PLUGIN_ROOT}}` token

Templates never hardcode a path. They contain the literal token `{{PLUGIN_ROOT}}`, which
`scripts/install-agent-adapters.sh` replaces with the plugin's path **relative to the
consuming repository root**. The same templates therefore work whether the plugin is
vendored inside the repo, cloned as a sibling, or installed under
`~/.snowflake/cortex/plugins/`.

### `scripts/install-agent-adapters.sh`

```bash
install-agent-adapters.sh <cursor|vscode|codex|all> [--target <repo-root>]
```

- `PLUGIN_DIR` is derived from the script's own location; `TARGET` defaults to
  `git rev-parse --show-toplevel`, else `$PWD`.
- `PLUGIN_REL` is computed with `python3 -c 'os.path.relpath(...)'` — hence the `python3`
  requirement.
- `render()` is `sed "s|{{PLUGIN_ROOT}}|$PLUGIN_REL|g"`; `render_tree()` walks a template
  directory with `find -type f`.
- `cursor` — `rm -rf` on `.cursor/{skills,agents,rules}`, re-render `adapters/cursor/` into
  `.cursor/`, then write `.cursor/.adapter-meta` containing `PLUGIN_ROOT=<rel>` and
  `SOURCE=adapters/cursor`. Those three directories are **fully owned** by the script;
  everything else under `.cursor/` is untouched.
- `vscode` — render the single template to `.github/copilot-instructions.md`.
- `codex` — render `adapters/codex/README.md` **to stdout** plus two reminder lines. Nothing
  is written, because Codex config lives in a gitignored `.codex/`.
- `all` — cursor + vscode + codex reminders.

### `scripts/check-adapter-drift.js`

Verifies generated copies still match the templates. It does not diff raw files — it
**re-renders** the templates first, so the `{{PLUGIN_ROOT}}` token never registers as
drift.

- Target root: `argv[2]`, else git top-level, else `cwd`.
- Cursor: skip if `.cursor/` is absent. Otherwise require `.cursor/.adapter-meta` with a
  `PLUGIN_ROOT=` line (missing file or missing key is itself a failure), then compare every
  template file against its generated counterpart **and** flag any file under `.cursor/`
  (other than `.adapter-meta`) that has no template — catching orphans left by a renamed or
  deleted template.
- VS Code: skip if `.github/copilot-instructions.md` is absent. Reuse the cursor meta's
  `PLUGIN_ROOT` when available, else fall back to `path.relative(targetRoot, pluginDir)`.
- Normalizes CRLF to LF before comparing, so Windows checkouts do not produce false drift.
- Exits 1 with per-failure lines and the remediation command; otherwise prints
  "Adapter copies match canonical templates."
- Codex is **not** checked, correctly — nothing is generated.

### Current adapter inventory

| Host | Templates | Generated into |
|------|-----------|----------------|
| Cortex | native (`.cortex-plugin/` + `hooks/hooks.json`) | n/a — install the plugin |
| Cursor | 2 rules (`agents-md.mdc`, `spec-driven-trigger.mdc`, both `alwaysApply: true`), 8 skill pointers, 6 agent pointers | `.cursor/` |
| VS Code / Copilot | 1 file listing `AGENTS.md`, the canonical skill, all satellite/capability skills, all six agent briefs, the references directory, and the drift checker | `.github/copilot-instructions.md` |
| Codex | 1 README of wiring reminders | nothing (printed) |

Each Cursor skill pointer is a few lines: frontmatter (`name`, `description`) plus "read
and execute the canonical skill at `{{PLUGIN_ROOT}}/skills/<name>/SKILL.md`". Each agent
pointer is the same against `{{PLUGIN_ROOT}}/agents/<name>.md`. The Cursor adapters
intentionally omit the canonical `tools:` frontmatter — tool policy stays with the
canonical skill.

**Adding a skill or agent therefore requires adding its Cursor pointer and its
`adapters/vscode/copilot-instructions.md` line.** Otherwise the drift checker passes (it
only compares what exists) while non-Cortex hosts silently lack the entry point.

---

## 13. Update and propagate procedure

1. **Locate the layer.** Rule → `AGENTS.example.md`. Activation → `hooks/hooks.json` or
   `adapters/`. Workflow → `skills/`. Isolated step → `agents/`. If a change seems to need
   two layers, one of them is probably duplication.
2. **Edit the canonical file only.** Never `.cursor/`, never `.github/`, never the
   installed copy.
3. **Genericize as you go.** Any new team-specific value becomes a Profile key
   (§14), referenced by name.
4. **Propagate to adapters** when you added or renamed a skill or agent: add the Cursor
   pointer template and the VS Code line, then run
   `scripts/install-agent-adapters.sh all` from the consuming repo root.
5. **Check drift:** `scripts/check-adapter-drift.js`. It must print
   "Adapter copies match canonical templates."
6. **Bump `version`** in `.cortex-plugin/plugin.json`, and update its `description` if the
   inventory changed.
7. **Reconcile the cross-referencing docs.** Several files enumerate the same inventory and
   must be updated together:
   - `README.md` "What's in the box" table
   - `docs/agent-portability.md` "Canonical paths" tree, host matrix, and capability map
   - `adapters/README.md` "Canonical paths" table
   - the canonical skill's "Capability skills" table
   - this file (§4 file map, §7 contracts, §8 inventory)
8. **Propagate to the installed copy** so Cortex actually runs it — reinstall/update via the
   plugin manager, or sync the tree into
   `~/.snowflake/cortex/plugins/dbt-spec-driven/`. Verify the registry `source` first (§3).
9. **Test in a real dbt repo** with an `AGENTS.md` present: start a session and confirm the
   `SessionStart` hooks inject rules and context; run a small bug-fix workflow and confirm
   each gate fires, `workflow-state.md` is written, and every sub-agent row reads
   `delegated`.
10. **Record field feedback.** If the change was driven by an observed agent failure, add an
    entry to `skills/spec-driven/references/field-feedback.md` per its own protocol — the
    ticket, the observations, the correct pattern, and a table of which plugin files changed.

---

## 14. Extension points

### Add a capability or satellite skill

1. Create `skills/<name>/SKILL.md` with frontmatter `name`, `description` (routing text —
   include the trigger phrases users will actually say), and a least-privilege `tools` list.
2. Add a `## Boundaries` section naming the canonical authority it must not usurp. **A
   capability that duplicates a sub-agent is rejected by design** — check the six briefs in
   `agents/` and the anti-duplication list in `docs/agent-portability.md` first.
3. Route it through a canonical artifact: read the spec set, or link evidence into the
   Validation Report or `wbs.md`.
4. Register it in the canonical skill's "Capability skills" table with its phase
   relationship.
5. Add `adapters/cursor/skills/<name>/SKILL.md` and a line in
   `adapters/vscode/copilot-instructions.md`.
6. Update `README.md`, `docs/agent-portability.md`, `adapters/README.md`, and §4/§8 here.
7. Long-form detail goes in `skills/<name>/references/*.md`, loaded on demand — see
   `skills/verify-this/references/local-surfaces.md` for the pattern.

There is nothing to add to `plugin.json`; discovery is by directory convention.

### Add a sub-agent

1. Create `agents/<name>.md` with the four standard sections: `## Inputs`, `## Process`,
   `## Constraints`, `## Output` — the last being a fenced contract block.
2. Decide whether it is **mandatory** (add a row to the Sub-agent Delegation table *and* the
   Flight Checklist, and add a TRANSITION checkbox asserting delegation) or
   **capability-invoked** like `quality-auditor` (referenced only from its skill).
3. State its deference explicitly — which agent owns the areas it must not re-litigate.
4. Add `adapters/cursor/agents/<name>.md` and a VS Code line.
5. If it produces an artifact consumed by a later phase, add it to §9's lifecycle table.

### Add a hook

1. Add **both** variants — bash and PowerShell — to the same group in `hooks/hooks.json`.
2. Emit JSON on stdout: `additionalContext` for model-visible context, `systemMessage` for
   system-level notices.
3. Fail soft: guard every file access, and terminate bash variants tolerantly.
4. Set a `timeout`; add a `statusMessage` for hooks whose latency the user will notice.
5. If it resolves the spec directory, copy the existing candidate-root logic verbatim so
   all occurrences stay identical.
6. Document it in §6 and, if it enforces scheduled-mode behavior, in
   `references/scheduled-mode.md`'s "Hook Enforcement" table.

### Add a reference

Create `skills/<skill>/references/<topic>.md` and name it from the phase or step that must
read it, with the trigger condition ("read this when …"). References exist to keep the
skill body navigable; do not inline their content back into the skill.

### Add a Project Profile key

This is the mechanism that keeps the plugin generic. To move a hardcoded value out:

1. Add a row to the Profile table in `AGENTS.example.md` with a descriptive key name and a
   plausible example value.
2. Replace **every** literal occurrence with a bold reference to the key name — "the
   Profile's **<key>**" — optionally with a parenthetical `(example: …)` where the
   abstraction alone would be unclear.
3. Sweep for stragglers across `skills/`, `agents/`, `README.md`, and `docs/`. Hooks are
   the known exception: they are plain shell and cannot read the Profile, so they use
   ordered candidate paths plus a generic fallback.
4. Add the key to `README.md`'s "Configuration — contribute, don't fork" list.
5. Do **not** add a Profile key for something a rule can state generically. The Profile is
   for values that genuinely differ per team.

The current 21 keys: Layers, Layer prefixes, Model naming pattern, Surrogate-key macro,
Materialization defaults, Incremental runtime threshold, Reusable-logic location, Models
location, Lint config, Specs location, Base branch, Ticketing, CI system, Data-diff tool,
Output-validation baseline, PR template, Context ledger, Local notes location, Downstream
consumer repos, Handoff location, Max file size.

---

## 15. Gotchas

**Editing the installed copy.** It is a build output; the next update overwrites it and your
change is lost with no trace. Edit source, then propagate (§13).

**Updating one hook variant.** Bash-only or PowerShell-only edits produce a defect invisible
on your own OS. Both variants, every time.

**The Validation Report is not a file.** It is a structured return value from
`output-validator`. Unlike the four spec documents and `workflow-state.md`, it does **not**
survive context compaction. If its content matters after a gate, persist the relevant
findings into `wbs.md` or `architecture-design.md`. `peer-reviewer` explicitly handles the
absent case ("note that the data delta was not independently validated") — that path is
reached both in standalone review *and* after a compaction that dropped the report.

**Two specs-location candidates only.** Hooks try `dbt/specs` then `specs`. A team whose
specs live elsewhere gets the generic fallback message — no error, just weaker enforcement.

**Partial delegation is the documented failure mode.** Running `discovery` but reviewing
inline, or skipping `output-validator`, has been observed in production and is what most of
the enforcement machinery exists to prevent. Before any transition, verify every passed
phase's sub-agent cell reads `delegated`.

**"Delegate anyway" is intentional.** When a sub-agent's work looks trivial, delegate
regardless: the value is the structured, auditable artifact, not the volume of work.

**A tangential question does not satisfy a gate.** Even if the user's answer implies they
want to continue, the gate is a separate, explicit `ask_user_question`.

**Skill-relative paths do not resolve from the consuming repo.** Several skills reference
plugin-internal paths as if they were repo-relative — `spec-review` says to read
`skills/spec-driven/SKILL.md` and `agents/peer-reviewer.md`; `quality-audit` says
`agents/quality-auditor.md`; `spec-debt` scans
`skills/spec-driven/references/field-feedback.md`. When the plugin is installed under
`~/.snowflake/cortex/plugins/dbt-spec-driven/` rather than vendored into the repo, those
paths are relative to the wrong root. Resolve them against the plugin root.

**`.cursor/{skills,agents,rules}` are destroyed on install.** `install-agent-adapters.sh
cursor` `rm -rf`s those three directories before rendering. Hand-written Cursor skills there
will be lost; put them elsewhere under `.cursor/`.

**The drift checker only compares what exists.** Adding a canonical skill without its
adapter pointers passes the drift check while leaving non-Cortex hosts without the entry
point. Adapter parity is a manual step in §13.

**`AGENTS.md` lives in the consuming repo, not here.** `AGENTS.example.md` is a template
that is never read at runtime. A change to the numbered rules only reaches teams that
re-copy it — which is exactly why rules must reference Profile keys rather than values, so
the numbered sections rarely need to change.

**Tooling prerequisites are split by OS.** `jq` for the POSIX hook variants (macOS/Linux
only); `python3` for `install-agent-adapters.sh`; `node` for `check-adapter-drift.js`;
`git` and an authenticated `gh` for Ship, `ci-interpreter`, and `ci-loop`.

**The context ledger is resolved by candidate path, not by Profile lookup.** The
`SessionStart` context hook tries `docs/data-team-context.md`, `docs/project-context.md`,
then `.cortex/notes/project-context.md`. Same constraint as the specs location: hooks are
plain shell. If your Profile names a ledger outside that list, the hook loads nothing —
silently. Either use one of the default paths or add yours to both variants.

---

## 16. Glossary

| Term | Meaning |
|------|---------|
| **Project Profile** | The table at the top of `AGENTS.md` holding every team-specific value. The only block an adopting team edits. |
| **Profile key** | A named Profile entry (e.g. **specs location**, **base branch**, **data-diff tool**) referenced by name from generic skills, agents, and rules. |
| **Canonical skill** | `skills/spec-driven/SKILL.md` — the single source of workflow truth. |
| **Satellite skill** | A thin entry point into, or read-only audit of, canonical artifacts (`spec-review`, `spec-debt`). |
| **Capability skill** | A skill covering a surface no canonical sub-agent owns; must route through a canonical artifact. |
| **Sub-agent** | A brief in `agents/`, spawned via the `Task` tool for context isolation, returning a fixed output contract. |
| **Adapter** | A generated, pointer-only host wiring file under `.cursor/` or `.github/`, rendered from `adapters/`. |
| **`{{PLUGIN_ROOT}}`** | The token in adapter templates replaced at install time with the plugin path relative to the consuming repo root. |
| **Gate** | A hard phase-boundary checkpoint enforcing completeness. `ask_user_question` in interactive mode; a self-checkpoint in scheduled mode. |
| **TRANSITION checklist** | The per-boundary checkbox list a gate verifies. |
| **Flight Checklist** | The phase/sub-agent/gate table near the top of the canonical skill, re-readable at any boundary. |
| **`REQ-xxx`** | A numbered requirement in `prd.md`, written in EARS notation. |
| **`VAL-xxx`** | A numbered Validation Criterion in `prd.md`, tagged Objective or Subjective and mapped to `REQ-xxx`. |
| **Objective / Subjective** | Whether ground truth exists. Objective criteria are agent-self-validatable; Subjective require human sign-off. |
| **`Self-validatable: YES/NO`** | The `output-validator` marker that decides whether the post-validation gate is skipped or hard. |
| **Validation Report** | `output-validator`'s structured return: schema check, data delta vs baseline, per-criterion result, requirement traceability. Conversational, not a file. |
| **`workflow-state.md`** | The externalized per-workflow progress record; survives compaction and is what the hooks inspect. |
| **`blocked`** | A `workflow-state.md` status meaning the Retry Protocol was exhausted. Detected by `SubagentStop`, `PreCompact`, and `Stop` as a hard stop. |
| **Retry Protocol** | Scheduled-mode failure handling: 3 attempts per distinct problem, counter reset on a *different* failure, then hard stop. |
| **Scheduled mode** | Unattended execution (`mode: scheduled`). Gates self-check; nothing else is relaxed. |
| **`_issues.md`** | `<model>_issues.md` under the **models location** — the append-only ledger of unimplemented review items, with severities. |
| **Context atom** | A `CTX-YYYY-MM-DD-nnn` row in the **context ledger** recording a durable, reusable fact, marked User-supplied / Verified / Needs verification. |
| **Handoff** | A source-side document in the **handoff location** carrying model context to a downstream consumer repo. |
| **Field feedback** | An entry in `references/field-feedback.md`: an observed agent failure and the plugin changes it drove. |
| **Drift** | Divergence between source and installed copy, or between an adapter template and its generated file. |
