# Adoption Guide — "On the Loop" Spec-Driven Development

## What is "on the loop"?

"On the loop" means AI executes the implementation work — branching, coding, testing,
opening the PR — while a human stays in the loop as the approver. You write a good ticket,
the agent does the work, and you review and merge (or reject) the result.

It is **not** "off the loop" (fully autonomous, no oversight). A human always:
- Writes or approves the ticket requirements.
- Reviews the PR.
- Makes the merge decision.

---

## How it works, end-to-end

```
┌─────────────┐     ┌───────────────┐     ┌─────────────┐     ┌────────────┐
│  Write      │     │  AI Executing │     │ Peer Review │     │   Done     │
│  Ticket     │ ──→ │  (agent runs  │ ──→ │ (you review │ ──→ │  (merged)  │
│  (you)      │     │   workflow)   │     │  the PR)    │     │            │
└─────────────┘     └───────────────┘     └─────────────┘     └────────────┘
                           │                      │
                           │ hard-stop?           │ reject?
                           ▼                      ▼
                    ┌──────────────┐     ┌───────────────┐
                    │  Blocked     │     │  AI re-tries  │
                    │  (human      │     │  (max 2×)     │
                    │   picks up)  │     └───────────────┘
                    └──────────────┘
```

### Step by step

1. **You write a ticket** following the [ticket-writing standards](ticket-writing-standards.md).
   Label it `on-the-loop`.

2. **Ticket enters "AI Executing"** — the agent transitions it when starting the
   workflow. The `on-the-loop` label is added at the same time.

3. **The agent runs the spec-driven workflow:**
   - Discovers & fact-checks assumptions against the codebase.
   - Writes a requirements spec (`requirements.md`).
   - Implements the change (code + tests + docs).
   - Validates the output against objective criteria.
   - Runs a peer review (sub-agent).
   - Pushes a branch and opens a PR.

4. **Ticket moves to "Peer Review"** — you receive a PR notification.

5. **You review the PR:**
   - Does it match what you asked for?
   - Do CI checks pass?
   - Is the Validation Report clean?
   - See the [reviewer guide](reviewer-guide.md) for details.

6. **You decide:**
   - **Approve & merge** → Done. The change is live.
   - **Reject with comments** → Ticket returns to AI Executing. Agent re-attempts
     (up to 2 times). If still wrong after that, it escalates to manual.

---

## Your role

| Responsibility | When |
|----------------|------|
| Write clear, AI-executable tickets | Before AI Executing |
| Review PRs promptly (24h SLA) | During Peer Review |
| Merge or reject | At the PR |
| Pick up hard-stopped tasks | When the agent gets stuck |
| Provide feedback to improve the process | Ongoing |

**You do NOT need to:**
- Write code for eligible tasks.
- Run dbt locally for these tasks.
- Manage branches or PRs (the agent handles git mechanics).

---

## What qualifies as "on the loop"

See the [guard rails](guard-rails.md) for the full decision flowchart. In short:

**Eligible:**
- Bug fixes with clear repro steps and expected outcome.
- Source/staging model additions (proven 1:1 pattern).
- Column renames, schema alignment.
- Test additions, documentation gaps.

**Not eligible:**
- New business logic without a proven pattern.
- Ambiguous "investigate and fix" tickets.
- Architectural decisions or new patterns.
- Anything requiring stakeholder sign-off on the output.

---

## Worked Examples

### Example 1: DATA-1569 — Join Simple marketing models

**Ticket:** "Union the Join Simple brand's marketing models (Facebook, TikTok) into the
existing multi-brand intermediate layer."

**Why eligible:** Proven pattern (other brands already exist), objective validation
(model builds, tests pass, row counts match source), bounded scope (known files).

**What happened:**
- Discovery corrected 5 assumptions from the ticket (wrong column names, missing sources).
- Agent wrote the spec, implemented 4 staging + 2 intermediate models.
- Output-validator confirmed before/after data integrity.
- Peer-reviewer found 0 High issues.
- PR merged on first review.

### Example 2: DATA-1613 — TikTok revisions by platform

**Ticket:** "Restructure TikTok ad performance models to report by platform (TikTok,
Pangle, Global App Bundle) instead of aggregated."

**Why eligible:** Ground truth exists (raw data has platform breakdown), requirements
specify the exact grain change, scope bounded to known TikTok models.

**What happened:**
- Discovery **disproved 3 premises** from the ticket (columns didn't exist where expected,
  one model was already platform-level).
- 21 requirements written, 8 validation criteria.
- During implementation, a team member (Martin) hand-edited some files — agent caught 3
  defects introduced by the manual edits.
- Self-validated (all criteria Objective).
- Peer-reviewer found 1 High + 6 Medium — all fixed.
- PR merged after one review cycle.

**Key takeaway:** Even with a human co-editing, the workflow maintained integrity.

---

## FAQ

**Q: How do I see AI-driven tickets on the board?**  
A: Filter by the `on-the-loop` label. You can set up a Jira quick filter
(`labels = "on-the-loop"`) or a swimlane to separate AI work from manual work visually.

**Q: What if the agent produces wrong code?**  
A: That's what the Human Review gate is for. The agent cannot merge; you always review.
If it's wrong, reject with comments — or take over the branch manually.

**Q: What if it gets stuck?**  
A: After 3 attempts at the same error, it hard-stops and logs what went wrong in
`workflow-state.md`. You pick up from there with full context of what was tried.

**Q: Is AI-generated code held to a different standard?**  
A: No. It must pass the same AGENTS.md rules, the same CI checks, the same review process.
Once merged, there's no distinction between AI and human code.

**Q: Can I opt out of reviewing AI PRs?**  
A: Any team member can review. If you'd prefer not to review a specific PR, another team
member can pick it up (same as any PR).

**Q: What about sensitive code (security, PII handling)?**  
A: Tasks involving security-sensitive logic or PII handling patterns are excluded via the
eligibility criteria (they require design authority / subjective judgment). These stay
manual.

**Q: Will this replace my job?**  
A: No. It handles the mechanical, well-defined work so you can focus on design, analysis,
stakeholder collaboration, and the tasks that actually need human judgment.
