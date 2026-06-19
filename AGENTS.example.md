# AGENTS.md — Mandatory Rules

> **Authority:** This is the highest-authority file in the repository. Every agent,
> skill, and sub-agent MUST obey these rules. They are **blocking**: if a change
> violates a rule below, do not proceed — fix it or stop and surface it to the user.
>
> - **AGENTS.md (this file)** = mandatory, blocking rules.
> - **`spec-driven` skill** = the workflow that orchestrates *how* work happens.
> - **Sub-agents** (`/agents`) = isolated steps that run within that workflow.
>
> Subjective quality (clarity, naming taste, performance polish) is **not** enforced
> here — that is the `peer-reviewer` sub-agent's job. This file is only the
> objective, checkable rules that block a merge.
>
> **Adopting this plugin?** Copy this file to the **root of your dbt repository** as
> `AGENTS.md` and edit **only the Project Profile block below** to match your team. The
> numbered rules reference the Profile by name, so they need no changes. This is the
> contribute-not-fork boundary: you own your Profile; the rules + skills + agents stay
> generic and update from upstream. The values shown are the Simple Online Healthcare
> example.

---

## Project Profile (team-specific configuration)

> **⬇️ This block is the only part you edit.** Every numbered rule below references these
> values by name. Replace the example values with your team's.

| Parameter | Value (example) |
|-----------|-----------------|
| Layers (upstream → downstream) | `staging → intermediate → marts` |
| Layer prefixes | staging `stg_`, intermediate `int_`, marts (none) |
| Model naming pattern | `[brand]_[region]__[entity]` — brand/region/source codes in `dbt/README.md` |
| Surrogate-key macro | `dbt_utils.generate_surrogate_key` |
| Materialization defaults | staging `view`, intermediate `view`, marts `table` |
| Incremental runtime threshold | ~10 min |
| Reusable-logic location | `/macros` |
| Lint config | `dbt/.sqlfluff` (SQLFluff) |
| Specs location | `dbt/specs/` (spec dirs named `<dd-mm-yy>-<name>/`) |
| Base branch | `master` |
| Ticketing | Jira — update tickets via the `jira_update_issue` MCP tool |
| CI system | dbt Cloud + Deep Hub; results surface as GitHub checks, polled via `gh` |
| Data-diff tool | `audit_helper` (`compare_relations` / `compare_queries`) |
| Output-validation baseline | production/main relations (diffed with the data-diff tool) |

---

## 1. Layer architecture (blocking)

The layers and their order are defined in the Project Profile
(example: **staging → intermediate → marts**).

- Every model belongs to exactly one layer. Do not mix layer responsibilities.
- Dependency direction is fixed (generalize to your Profile's layer order):
  - **Staging** may reference **sources only** (`source()`).
  - **Intermediate** may reference **staging or intermediate** (`ref()`).
  - **Marts** may reference **intermediate** (and staging only if necessary).
- **Fail if:** a downstream layer is referenced by an upstream one, or any layer boundary
  is crossed in the wrong direction.

*Why: a one-directional graph keeps lineage predictable and prevents cycles.*

---

## 2. Naming (blocking)

- All identifiers use `snake_case`.
- Models follow the **model naming pattern** and **layer prefixes** in the Project Profile.
- Column conventions:
  - Booleans → `is_` / `has_` / `was_`
  - Timestamps → `*_at`
  - Dates → `*_date`
  - Surrogate keys → `*_sk`
  - Foreign keys → match the parent key name

**Fail if:** naming does not follow the Project Profile's pattern/prefixes, or the column
conventions above.

---

## 3. References (blocking)

- Use `ref()` for models and `source()` for raw data.
- **Fail if:** any database or schema name is hardcoded.

*Why: hardcoded references break environment promotion and lineage resolution.*

---

## 4. Documentation & YAML (blocking)

Every model MUST have:
- A corresponding `.yml` file.
- A model description that explains **why the model exists** (its business purpose),
  not just what columns it has.
- Column-level descriptions that add meaning beyond restating the column name.
- Tests defined in YAML (see §5).

**Fail if:** the YAML file is missing, the model or its columns lack descriptions, or
no tests are defined.

---

## 5. Primary keys & required tests (blocking)

- Every **intermediate** and **mart** model MUST define a primary key.
  - If no natural key exists, use the surrogate-key macro named in the Project Profile.
- The primary key MUST have both a `unique` and a `not_null` test.
- All **sources** MUST define freshness tests.

**Fail if:** an intermediate/mart model has no primary key, the primary key is not
tested with both `unique` and `not_null`, or a source lacks freshness configuration.

*Recommended (not blocking): relationships tests, accepted_values tests, business-logic
assertions, and `event_time` config where applicable.*

---

## 6. Staging rules (blocking)

Staging models are the clean interface to raw data. They MUST:
- Use `source()`.
- Be materialized as `view`.
- Maintain a 1:1 mapping to their source table.
- Select columns explicitly.

**Fail if:** a staging model contains business logic, joins across domains, or uses
`select *`.

Allowed in staging: renaming, type casting, deduplication, basic normalization.

---

## 7. Materializations (blocking)

Materialization defaults and the incremental runtime threshold are defined in the Project
Profile.

Incremental models are allowed **only** when:
- Data volume justifies it (beyond the Project Profile's runtime threshold), and
- The data is append-heavy or time-based, and
- A unique key is defined.

**Fail if:** an incremental model has no unique key, or incremental is used without
justification.

---

## 8. Reusable logic (blocking)

- Logic reused across models MUST be implemented as a macro in the reusable-logic location
  named in the Project Profile.
- Macros must be documented and perform a single responsibility.

**Fail if:** the same logic is duplicated across models instead of being a macro.

---

## 9. Pull request gate (blocking)

Before a PR can merge:
- All models build successfully.
- All tests pass.
- Documentation is complete (§4).
- SQL passes **SQLFluff** linting (config path in the Project Profile).
- Outputs are validated against the spec's Validation Criteria — objective criteria pass,
  and any subjective criteria have explicit human sign-off.

**Fail if:** any of the above is not met.

*CI (the Project Profile's CI system) is the safety net that confirms this, not the first
place outputs are checked.*

---

## 10. Inline comments for non-obvious logic (blocking)

SQL that is **intentional but not self-evident** MUST carry a brief inline comment
stating the intent — *why*, not a restatement of the syntax. At minimum, comment these
constructs whenever the choice is deliberate:

- **`UNION` vs `UNION ALL`** — why duplicates are (or are not) being removed.
- **`CASE` ordering / precedence** — when first-match-wins is load-bearing and reordering
  branches would change results.
- **Join type chosen to control rows** — `LEFT` / `INNER` / anti-join picked for a
  reason, and **NULL handling on join keys** (e.g. a key that can be NULL on one side).
- **Filters that encode a business rule** — a `WHERE`/`QUALIFY` clause that silently
  drops or includes rows for a non-obvious reason.
- **Window dedup** — e.g. `QUALIFY row_number() = 1`: the partition/order rationale.
- **`COALESCE` / NULL substitution** that changes downstream semantics.
- **Intentional fan-out** (one-to-many joins that deliberately multiply rows).

**Fail if:** any construct above is present with deliberate-but-implicit intent and no
explanatory comment. (The `peer-reviewer` judges whether the comment is *meaningful* —
this rule only requires that one exists.)

*Why: these are the constructs that silently produce wrong results when a later editor
misreads the original intent.*

---

## 11. Explicitly forbidden

- Business logic in staging.
- Untested intermediate or mart models.
- Hardcoded database/schema references.
- Duplicated logic across models.
- Violating layer dependency direction (§1).
