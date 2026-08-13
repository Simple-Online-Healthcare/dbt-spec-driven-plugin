# dbt-spec-driven

A spec-driven dbt development workflow for agentic IDEs, shipped as a
[Cortex](https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code) plugin. It
enforces: **discover & fact-check → specify → design → implement → validate output →
review → ship**, with mandatory engineering rules, a durable four-document spec set, and
context-isolated sub-agents.

Built for Cortex, with thin generated adapters for Cursor, VS Code/Copilot, and Codex.

## What's in the box

| Component | Purpose |
|-----------|---------|
| `AGENTS.example.md` | The mandatory, blocking engineering rules + a **Project Profile** (the only team-specific block). Copy to your dbt repo root as `AGENTS.md` and edit the Profile. |
| `skills/spec-driven/` | The canonical workflow skill. Routes by intent, orchestrates the gated phases, and tracks progress in `workflow-state.md`. Supports interactive and scheduled execution. |
| `skills/spec-review/`, `skills/spec-debt/` | Satellites: a fast entry point into the Review phase, and a read-only ledger of unresolved workflow debt. |
| `skills/verify-this/`, `skills/ci-loop/`, `skills/quality-audit/`, `skills/pr-ergonomics/`, `skills/work-summary/` | Capability skills covering surfaces the canonical sub-agents do not own — local verification, CI watch/fix loops, strict maintainability review, PR ergonomics, and status summaries. |
| `agents/` | Sub-agents for heavy, context-isolated steps: `discovery`, `test-author`, `output-validator`, `peer-reviewer`, `ci-interpreter`, `quality-auditor`. |
| `hooks/hooks.json` | Loads `AGENTS.md` and the context ledger at session start, enforces gates after each sub-agent, audits workflow state before compaction, warns on incomplete stops, and appends a session note on exit. Cross-platform (bash + PowerShell). |
| `adapters/` + `scripts/` | Thin per-host wiring templates and the install/drift-check scripts that render them. |
| `INTERNALS.md` | Maintainer guide: layer model, contracts, control flow, extension points. |

### Design principle

Four layers, each owning its content exactly once:

- **Rules (always-on)** → `AGENTS.md`
- **Activation (host wiring)** → `hooks/hooks.json` and generated `adapters/`
- **Workflow (user-triggered)** → the `spec-driven` skill plus satellites and capabilities
- **Isolated steps (spawned)** → sub-agents in `agents/`

The skill never restates the rules — it points to `AGENTS.md`. Adapters never restate the
workflow — they point to the canonical skill. Sub-agents return structured reports so the
main thread stays focused.

## Configuration — contribute, don't fork

Everything team-specific lives in **one place**: the **Project Profile** table at the top
of `AGENTS.md`. The skills, sub-agents, and numbered rules are fully generic — they
reference Profile values by name: layers, prefixes, naming pattern, surrogate macro,
materializations, incremental threshold, macros location, **models location**, lint config,
specs location, **base branch**, **ticketing**, **CI system**, **data-diff tool**,
validation baseline, **PR template**, **context ledger**, **local notes location**,
**downstream consumer repos**, **handoff location**, and **max file size**.

To adopt the plugin you edit **only** your Profile. The generic core stays untouched and
updates cleanly from upstream — so improvements flow back as contributions rather than
divergent forks. The values shipped in `AGENTS.example.md` are one team's example.

## Requirements

- Cortex Code / Cortex Desktop (or a supported host via `adapters/`).
- `git` and the GitHub CLI (`gh`, authenticated) for the Ship phase.
- `jq` on PATH for the hooks **on macOS/Linux** (the POSIX hook variants use it; the
  Windows/PowerShell variants use built-in cmdlets and need no `jq`).
- `node` on PATH for the **enforcement hook** (`scripts/hooks/require-delegation.js`), which
  blocks model writes and PR creation when a required delegation is missing. Without `node`
  the hook fails open — the workflow still runs, but nothing is mechanically enforced.
- `python3` if you use `scripts/install-agent-adapters.sh` /
  `scripts/check-adapter-drift.js`.
- A dbt project with the base branch and specs directory set in your Project Profile.
- A dbt data-diff package for `output-validator` — `audit_helper` (+ `dbt_utils`) by
  default; swap via the Profile's data-diff tool.
- Optional: an MCP tool for your ticketing system; a CI system whose results surface as
  GitHub checks for the `ci-interpreter` agent.
- Optional: the [`ponytail`](https://github.com/DietrichGebert/ponytail) plugin as a
  general over-engineering defence — see "Companion: ponytail" below.

## Install

1. Copy `AGENTS.example.md` to the **root of your dbt repository** as `AGENTS.md`, then edit
   the **Project Profile** block to match your team. (This is the live, enforced copy the
   hooks and agents read.)
2. Install the plugin into Cortex (plugin manager, or place the `dbt-spec-driven/` directory
   where Cortex discovers plugins — `~/.snowflake/cortex/plugins/`).
3. Start a session in your dbt repo and invoke the workflow (e.g. "fix bug …",
   "build feature …", or `/dbt-spec-driven:spec-driven`).

### Companion: ponytail (optional)

[`ponytail`](https://github.com/DietrichGebert/ponytail) enforces a general
anti-over-engineering ladder (YAGNI, reuse before rewrite, stdlib before custom). This
plugin already borrows its *portability pattern* (see
[`docs/agent-portability.md`](docs/agent-portability.md)); installing it adds the
*behaviour* plus `/ponytail-review` and `/ponytail-audit`.

```text
/github-plugin-installer DietrichGebert/ponytail
```

Three things to know if you run both:

- **`AGENTS.md` wins.** The ladder is advisory about *how much SQL to write*. It never
  licenses skipping a blocking rule — documentation (§4), primary keys and tests (§5),
  intent comments (§10), or the PR gate (§9). `AGENTS.md` §13 states this precedence
  explicitly, and §13 is the authority for dbt because ponytail knows nothing about dbt
  layers, `ref()`/`source()` direction, or `dbt_utils`.
- **§13 is the reliable path; ponytail is the supplement.** §13 ships in your repo's
  `AGENTS.md` and is injected by this plugin's `SessionStart` hook, so it holds with or
  without ponytail installed.
- **It injects into every sub-agent by default.** This workflow is sub-agent heavy, so that
  is extra tokens on each delegation. Scope it with `PONYTAIL_SUBAGENT_MATCHER` (a regex
  against `agent_type`) if you want it off read-only agents — e.g. `PONYTAIL_SUBAGENT_MATCHER='peer-reviewer|quality-auditor'`
  to keep it on the review agents only.

### Other hosts

Vendor or clone the plugin into your repo, then render the adapters from your repo root:

```bash
<plugin-path>/scripts/install-agent-adapters.sh cursor   # -> .cursor/
<plugin-path>/scripts/install-agent-adapters.sh vscode   # -> .github/copilot-instructions.md
<plugin-path>/scripts/install-agent-adapters.sh codex    # prints setup reminders
<plugin-path>/scripts/check-adapter-drift.js             # fails if generated copies drift
```

Adapter templates carry a `{{PLUGIN_ROOT}}` token that the install script replaces with the
plugin's path relative to your repo root, so they work wherever you put the plugin. See
`docs/agent-portability.md` and `adapters/README.md`.

> **Hooks run on macOS/Linux and Windows out of the box.** `hooks/hooks.json` registers
> two variants of each hook — a POSIX (bash) command and a PowerShell command. Cortex runs
> the shell appropriate to the OS; the non-matching variant fails silently (command not
> found → no output), so a mixed-OS team needs no per-user configuration.

## The workflow

1. **Discover & Fact-Check** (mandatory first gate) — `discovery` agent verifies/disproves
   assumptions, maps lineage, proves data coverage with `MIN`/`MAX` queries, and reports
   reusable macros. No solutioning until this passes.
2. **Specify** — `project-charter.md` + `prd.md`: EARS requirements (`REQ-xxx`) and tagged
   Validation Criteria (`VAL-xxx`, objective/subjective); posted to your ticketing system.
3. **Design** — `architecture-design.md` + `wbs.md`: technical approach, lineage impact,
   layer/reuse checks, and a downstream handoff when consumers are affected.
4. **Implement** — code that satisfies `AGENTS.md`; tests via `test-author`.
5. **Validate Output** — `output-validator` checks the data outcome vs the spec (schema +
   data-diff vs baseline). Self-validates objective/ground-truth criteria; hard-gates
   subjective ones for human sign-off.
6. **Review** — `peer-reviewer` (qualitative; reads the Validation Report), optionally
   followed by `quality-audit` for structural scrutiny.
7. **Ship** — commit, push, open PR, and interpret CI via `ci-interpreter`.

Every phase boundary has a **TRANSITION checklist** and a gate, and progress is externalized
to `workflow-state.md` so it survives context compaction. Bug fixes and refactors use
condensed paths; standalone "review my PR" and "document this model" jump straight to the
relevant phase.

See `skills/spec-driven/references/spec-documents.md` for the spec document templates.

## Scheduled (unattended) execution

Invoke the workflow with `mode: scheduled` to run it without a human at the gates. Nothing
is skipped — phases, sub-agent delegations, artifacts, and TRANSITION checklists all remain
mandatory. Gates become self-checkpoints that pass only when every checklist item is
satisfied, failures enter a 3-attempt Retry Protocol logged to `workflow-state.md`, and a
`Self-validatable: NO` result or an exhausted retry budget is a hard stop.

Details and worked examples: `skills/spec-driven/references/scheduled-mode.md`.

## Roadmap

- **Machine-readable profile.** Optionally externalize the Project Profile into a
  `profile.yml` (validated/rendered), as an alternative to editing the Markdown table.
- **On-the-loop autonomy.** Build on scheduled mode and the `output-validator`'s
  `Self-validatable: YES` marker; pair with git worktrees for parallel branches.
- **Notification integration** (e.g. Teams/Slack) as a Profile key.
- **Config-driven multi-repo reuse.** Render per-repo Profiles from one shared source so
  several repos can track the same generic core.

## License

MIT — see [`LICENSE`](./LICENSE).
