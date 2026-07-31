# Project Context Capture

Use this reference when a workflow uncovers durable context that future agents should not
have to rediscover.

## What To Capture

Capture facts that are reusable across tickets or repos:

- Data-access constraints, such as which environments or tables are valid evidence.
- Regulatory, compliance, privacy, or market-specific constraints.
- Source-system quirks, lineage caveats, and attribution rules.
- Cross-repo handoff notes, such as model context needed by a downstream consumer repo.
- Repeated reviewer/user preferences that change how work should be done.
- Decisions that explain why an apparently obvious path is not allowed.

Do not capture:

- Secrets, credentials, payment details, raw customer data, or direct personal identifiers.
- Spec-local implementation detail that belongs only in the active spec documents.
- Unverified guesses stated as facts.

## Where Context Lives

- Team-shared durable context: the **context ledger** named in the AGENTS.md Project
  Profile (example: `docs/data-team-context.md`).
- Ticket-specific context: the active spec set (`project-charter.md`, `prd.md`,
  `architecture-design.md`, `wbs.md`).
- Local session telemetry: the Profile's **local notes location** (example:
  `.cortex/notes/`) — gitignored; useful for handoff, not a team source of truth.

## Capture Format

Append concise context atoms:

```markdown
| ID | Scope | Status | Context | Applies When | Source / Last Reviewed |
|----|-------|--------|---------|--------------|------------------------|
| CTX-YYYY-MM-DD-001 | <domain> | User-supplied/Verified/Needs verification | <fact or constraint> | <trigger/use case> | <source/date> |
```

## Capture Protocol

1. If the user states a reusable constraint explicitly, capture it without waiting for a
   separate prompt unless it is sensitive or ambiguous.
2. If a fact is inferred from code, query output, or docs, mark it `Verified` and cite the
   source.
3. If a fact is plausible but not proven, mark it `Needs verification` and state what would
   verify it.
4. Before context compaction, update the active spec docs and context ledger with any new
   durable facts learned during the session.
5. At session start, read context injected by hooks before planning or querying.
