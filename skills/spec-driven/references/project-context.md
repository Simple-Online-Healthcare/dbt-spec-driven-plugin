# Project Context Capture

Use this when a workflow uncovers durable context that future agents should not rediscover.

## What To Capture

Reusable across tickets:

- Data-access constraints (which environments or tables are valid evidence).
- Regulatory, privacy, or market-specific constraints.
- Source-system quirks, lineage caveats, attribution rules.
- Repeated reviewer/user preferences that change how work is done.
- Decisions that explain why an apparently obvious path is not allowed.

Do not capture:

- Secrets, credentials, payment details, raw customer data, or personal identifiers.
- Spec-local implementation detail (`REQ-xxx`, SQL shape). That stays in the active spec.
- Unverified guesses stated as facts.

## Where Context Lives

| Kind | Where | Job |
|------|-------|-----|
| Ticket scratchpad | `<spec-dir>/grill-notes.md` | Interview notes, rejected options, open questions. Not the spec. |
| Durable glossary | the **context ledger** named in the AGENTS.md Project Profile (example: `docs/data-team-context.md` in the **dbt repo**) | Terms + verified constraints that outlive the ticket. |
| Ticket spec | `<spec-dir>/requirements.md` and, when the route needs it, `design.md` | Testable behaviour. Written by `spec-author` from notes + discovery. |
| Session telemetry | the Profile's **local notes location** (example: `.cortex/notes/`) | Gitignored handoff. Not a team source of truth. |
| ADR | `docs/adr/` in the **dbt repo**, rare | Only if hard to reverse AND surprising AND a real trade-off. |

`CONTEXT.md` does **not** live in this plugin. The plugin has no business domain.

## Glossary format

Append only when a term is resolved. One or two sentences. No implementation.

```markdown
**Order**:
A fulfilled customer purchase, not a checkout attempt.
_Avoid_: purchase, transaction
```

## Capture Protocol

1. User states a reusable constraint → capture it (unless sensitive or ambiguous).
2. Fact inferred from code, query, or docs → mark `Verified` and cite the source.
3. Plausible but unproven → leave it in `grill-notes.md` as `Needs verification`. Do not put it in the glossary.
4. Before context compaction, update `grill-notes.md` and any new glossary terms.
5. Scheduled mode does not grill and does not invent glossary entries.
