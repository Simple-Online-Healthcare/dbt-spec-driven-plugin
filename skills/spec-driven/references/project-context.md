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
- Spec-local implementation detail (SQL shape, one ticket's decisions). Those go in
  decision comments and the PR body.
- Unverified guesses stated as facts.

## Where Context Lives

| Kind | Where | Job |
|------|-------|-----|
| Durable glossary | the **context ledger** named in the AGENTS.md Project Profile (example: `docs/data-team-context.md` in the **dbt repo**) | Terms + verified constraints that outlive the ticket. |
| Ticket plan | Ticket while working, PR body at ship | Decisions, Done-when checks, schema change. |
| Decision rationale | `-- <ticket-id>:` comments next to the code; model YAML `description` for grain/purpose | Why the code is this way. Found where it's read. |
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
3. Plausible but unproven → raise it as an open question on the ticket. Do not put it in the glossary.
4. Scheduled mode does not invent glossary entries.
