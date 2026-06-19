# dbt-spec-driven

A spec-driven dbt development workflow packaged as a [Cortex](https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code)
plugin. It enforces: **discover & fact-check → specify → design → implement →
review → ship**, with mandatory engineering rules and context-isolated sub-agents.

## What's in the box

| Component | Purpose |
|-----------|---------|
| `AGENTS.md` (repo root) | The mandatory, blocking engineering rules. Lives at the **root** of the dbt project it governs. Highest authority. |
| `skills/spec-driven/` | The single workflow skill. Routes by intent (feature / bug / refactor / standalone review / standalone docs) and orchestrates the gated phases. |
| `agents/` | Sub-agents spawned for heavy, context-isolated steps: `discovery`, `test-author`, `output-validator`, `peer-reviewer`, `ci-interpreter`. |
| `hooks/hooks.json` | Auto-loads `AGENTS.md` at session start, warns before context compaction, and appends a session note on exit. |

### Design principle

Three layers, each owning its content exactly once:

- **Rules (always-on)** → `AGENTS.md`
- **Workflow (user-triggered)** → the `spec-driven` skill
- **Isolated steps (spawned)** → sub-agents in `agents/`

The skill never restates the rules — it points to `AGENTS.md`. Sub-agents return
structured reports so the main thread stays focused.

## Requirements

- Cortex Code / Cortex Desktop.
- `git` and the GitHub CLI (`gh`, authenticated) for the Ship phase.
- `jq` on PATH for the hooks **on macOS/Linux** (the POSIX hook variants use it; the
  Windows/PowerShell variants use built-in cmdlets and need no `jq`).
- A dbt project with a `master` branch and a specs directory (the location is set in the
  AGENTS.md Project Profile — `dbt/specs/` in this repo).
- The **`audit_helper`** and **`dbt_utils`** dbt packages (used by `output-validator` to
  diff model output against a prod/main baseline).
- Optional: a Jira MCP tool for ticket updates; CI surfaced as GitHub checks for the
  `ci-interpreter` agent.

## Install

1. Ensure `AGENTS.md` is at the **root** of your dbt repository (it is the live, enforced
   copy the hooks and agents read).
2. Install the plugin into Cortex (plugin manager, or place the `dbt-spec-driven/`
   directory where Cortex discovers plugins).
3. Start a session in the dbt repo and invoke the workflow (e.g. "fix bug …",
   "build feature …", or `/dbt-spec-driven:spec-driven`).

> **Hooks run on macOS/Linux and Windows out of the box.** `hooks/hooks.json` registers
> two variants of each hook — a POSIX (bash) command and a PowerShell command. Cortex runs
> the shell appropriate to the OS; the non-matching variant fails silently (command not
> found → no output), so a mixed-OS team needs no per-user configuration.

## The workflow

1. **Discover & Fact-Check** (mandatory first gate) — `discovery` agent verifies/disproves
   assumptions and maps lineage. No solutioning until this passes.
2. **Specify** — EARS requirements (`REQ-xxx`) + tagged Validation Criteria (`VAL-xxx`,
   objective/subjective); posted to Jira.
3. **Design** — technical approach + lineage impact (features/refactors).
4. **Implement** — code that satisfies `AGENTS.md`; tests via `test-author`.
5. **Validate Output** — `output-validator` agent checks the data outcome vs the spec
   (schema, `audit_helper` delta vs baseline). Self-validates objective/ground-truth
   criteria; hard-gates subjective ones for human sign-off.
6. **Review** — `peer-reviewer` agent (qualitative; reads the Validation Report).
7. **Ship** — commit, push, open PR, and interpret CI via `ci-interpreter`.

Bug fixes and refactors use condensed paths; standalone "review my PR" and
"document this model" jump straight to the relevant phase.

## Customizing for your team

The team-specific configuration is concentrated in the **Project Profile** block at the top
of `AGENTS.md` (layers + prefixes, model naming pattern, surrogate-key macro, materialization
defaults, incremental threshold, lint config, output-validation baseline). The numbered rules
reference those values rather than hardcoding them, so adapting the rules is a matter of
editing that one block.

Other team-specific touch-points live in the workflow/agents: the CI system the
`ci-interpreter` reads, and the ticketing/notification integrations.

## Roadmap

- **Config-driven, contribute-not-fork.** Make the plugin adaptable via a single config /
  seed file (e.g. Jinja-rendered) rather than requiring forks. Candidates to parameterize:
  the `AGENTS.md` Project Profile, the CI system (`ci-interpreter`), ticketing (Jira) and
  notification (Teams) integrations, and the branch/`specs` conventions. Goal: a new team
  supplies a config file; the generic core (skill logic, agent playbooks) stays untouched
  and upstream-contributable.
- **Separate generic core from per-team config** so external contributions land in the core
  without merge conflicts against local settings.
- **On-the-loop autonomy.** Use the `output-validator`'s `Self-validatable: YES` marker to
  let ground-truth tasks (bugs/refactors) run with reduced human gating; pair with git
  worktrees for parallel branches.
- **Naming (decided).** Public repo: `dbt-spec-driven-plugin`. Plugin/namespace name stays
  `dbt-spec-driven` (the `/dbt-spec-driven:spec-driven` invocation prefix) — kept short
  and free of "-plugin" so invocation isn't redundant. Repo ≠ namespace by design.
- **Pick a license** prior to publishing.
