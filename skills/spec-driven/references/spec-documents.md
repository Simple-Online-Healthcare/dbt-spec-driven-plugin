# Spec Document Set

Use this reference whenever the workflow creates or updates a spec directory.

The **`spec-author`** sub-agent owns these documents. The main thread should not write them
inline — delegate, then review what comes back.

| File | Owns | Must include |
|------|------|--------------|
| `project-charter.md` | Why the work exists | problem statement, intended value, stakeholders, success metrics, constraints, risks, milestones, immediate next steps |
| `prd.md` | What the system must do | user/persona or consumer context, functional requirements, non-functional requirements, data requirements, interface requirements, assumptions, out of scope, `REQ-xxx`, acceptance criteria, `VAL-xxx` Validation Criteria |
| `architecture-design.md` | How the solution will work | affected files/models, architecture/data flow, lineage impact, interfaces, alternatives/trade-offs, security/compliance, performance, observability, rollback/operational notes, **the AGENTS.md §13 solution-ladder rung chosen** |
| `wbs.md` | How the work will be executed | WBS tasks, dependencies, sequencing, estimates or sizing, test plan, validation plan, CI/checks, risks/mitigations, progress tracking |

## Which documents each route requires

Document depth scales with the work. Producing four full documents for a one-line fix was
itself a driver of skipped steps — a route that demands less is a route that gets followed.

| Route | Required | `N/A` unless it earns its place |
|-------|----------|--------------------------------|
| `feature` | all four | — |
| `semantic-view` | all four | — |
| `refactor` | `architecture-design.md`, `wbs.md` | `project-charter.md`, `prd.md` (produce `prd.md` if a consumer-visible contract changes) |
| `bug` | `prd.md`, `wbs.md` | `project-charter.md`, `architecture-design.md` (produce them if the fix carries strategic weight or a non-trivial design decision) |

**`N/A` is not the same as skipped.** A document the route does not require is recorded in
`workflow-state.md` as `N/A (route: <route>)`. A blank cell means the step was missed, and
`spec-debt` reports it as debt. Never write `N/A` for a document the route *does* require.

## Document Rules

- Keep all documents inside the active spec directory, under the **specs location** named
  in the AGENTS.md Project Profile. Do not write spec documents to paths outside it.
- Preserve traceability: every testable behavior in `prd.md` gets a `REQ-xxx`; every
  validation criterion gets a `VAL-xxx` and maps to one or more `REQ-xxx`.
- Use EARS notation for requirements where it improves precision:
  `WHEN/WHILE/WHERE/IF <condition>, THE SYSTEM SHALL <behavior> SO THAT <rationale>`.
- Mark each `VAL-xxx` as `Objective` or `Subjective`. Objective criteria are
  self-validatable by agents; Subjective criteria require human sign-off.
- Capture important project facts, constraints, and decisions in the right document as
  soon as they are learned. These docs are durable context for future agents.
- Keep documents proportional to the change. Short sections on a small fix are correct, not
  lazy — length is not thoroughness.
- Alongside these, a spec directory also accumulates `workflow-state.md` (progress) and
  `validation-report.md` (written by `output-validator`). Neither is a planning document;
  both are records.

## `project-charter.md` Template

```markdown
# Project Charter - <TICKET-ID or PROJECT>

**Ticket:** <id or N/A>
**Branch:** `<branch>`
**Date:** <yyyy-mm-dd>

## Executive Summary

<One short paragraph describing the work and why it matters.>

## Problem / Opportunity

- <current pain, bug, gap, or opportunity>

## Objectives and Success Metrics

- <measurable business or technical outcome>

## Stakeholders / Consumers

- <team, analyst, downstream model/dashboard, user group>

## Constraints and Assumptions

- <technical, data, regulatory, timeline, resource, or access constraint>

## Risks and Mitigations

- <risk> -> <mitigation>

## Milestones

- <phase or date> -> <outcome>

## Immediate Next Steps

- <next action>
```

## `prd.md` Template

```markdown
# PRD - <TICKET-ID or PROJECT>

**Ticket:** <id or N/A>
**Branch:** `<branch>`

## Product / Data Outcome

<What should exist or change when the work is done.>

## Users / Consumers

- <consumer/persona> -> <goal or decision supported>

## Requirements

- **REQ-001:** WHEN <trigger>, THE SYSTEM SHALL <behavior> SO THAT <rationale>.

## Non-Functional Requirements

- <performance, reliability, compliance, usability, maintainability>

## Data Requirements

- <grain, keys, required fields, freshness, source coverage, retention, privacy>

## Interface Requirements

- <model contract, and any downstream consumer surface named in the Project Profile —
  e.g. a BI field/dashboard, CLI/API/UI behavior>

## Acceptance Criteria

- <testable assertion tied to REQ ids>

## Validation Criteria

- **VAL-001 (Objective, REQ-001):** <evidence the agent can collect>
- **VAL-002 (Subjective, REQ-002):** <evidence requiring human sign-off>

## Constraints and Assumptions

- <known constraint or assumption>

## Out of Scope

- <explicit non-goal>
```

## `architecture-design.md` Template

```markdown
# Architecture Design - <TICKET-ID or PROJECT>

## Files / Components

| File or component | Change | Requirement |
|-------------------|--------|-------------|
| `<path>` | <planned change> | REQ-xxx |

## Architecture / Data Flow

- <upstream -> transformation -> downstream>

## Lineage and Integration Impact

- <models, dashboards, APIs, jobs, or consumers affected>

## Decisions and Trade-Offs

- <decision> -> <alternatives considered and rationale>

## Security, Compliance, and Data Governance

- <privacy, regulatory, access, sensitive-data constraints>

## Performance and Operations

- <materialization/runtime, scale, observability, rollback>

## Validation Design

- <how VAL criteria will be measured>
```

## `wbs.md` Template

```markdown
# Work Breakdown Structure - <TICKET-ID or PROJECT>

## Work Items

| ID | Task | Depends on | Validation |
|----|------|------------|------------|
| WBS-001 | <task> | <none/WBS-id> | <test/check/VAL-id> |

## Sequencing

1. <first implementation step>
2. <next implementation step>

## Test and QA Plan

- <build/test commands, the Project Profile's lint config, unit/integration/smoke checks,
  manual sign-off>

## CI / Release Plan

- <local checks, PR checks, rollout, monitoring>

## Risks and Mitigations

- <implementation risk> -> <mitigation>

## Progress Log

- <date> - <progress note>
```
