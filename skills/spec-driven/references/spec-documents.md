# Spec Document Set

Use this reference whenever the workflow creates or updates a spec directory.

Each spec directory must contain these four planning documents. Keep them compact for
small bug fixes, but create all four so future agents know where each kind of context
lives.

| File | Owns | Must include |
|------|------|--------------|
| `project-charter.md` | Why the work exists | problem statement, intended value, stakeholders, success metrics, constraints, risks, milestones, immediate next steps |
| `prd.md` | What the system must do | user/persona or consumer context, functional requirements, non-functional requirements, data requirements, interface requirements, assumptions, out of scope, `REQ-xxx`, acceptance criteria, `VAL-xxx` Validation Criteria |
| `architecture-design.md` | How the solution will work | affected files/models, architecture/data flow, lineage impact, interfaces, alternatives/trade-offs, security/compliance, performance, observability, rollback/operational notes |
| `wbs.md` | How the work will be executed | WBS tasks, dependencies, sequencing, estimates or sizing, test plan, validation plan, CI/checks, risks/mitigations, progress tracking |

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
- Bug fixes and refactors may use shorter sections, but they still need all four files.

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
