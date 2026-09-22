# Local Verification Surfaces

Load this reference only when `verify-this` needs a non-dbt local surface.

## CLI / TUI

- Prefer the repo's own test or demo harness.
- If none exists, use a temporary PTY or `tmux` harness with deterministic input.
- Capture the screen/output before and after each action.
- Wait for concrete prompts or output markers instead of sleeping.
- Clean up sessions, temp files, and inspector processes.

Evidence examples: terminal transcript, exit code, startup timing, CPU profile, memory
sample, before/after command output.

## UI / Browser / Electron

- Prefer existing Playwright, Cypress, Storybook, browser, or Electron harnesses.
- Use stable roles, labels, and `data-*` selectors instead of coordinates.
- Capture a screenshot or accessibility snapshot before and after the action.
- For Chromium/Electron, use CDP only when normal browser automation is insufficient.

Evidence examples: screenshots, accessibility snapshots, console/network logs, traces,
performance profile, heap snapshot.

## Smoke Tests

- Build prerequisites first.
- Run the smallest smoke suite or focused test that can disprove the claim.
- Inspect traces/logs before changing code.
- Re-run passing fixes once to reduce flake risk.

Evidence examples: smoke test command, pass/fail output, trace link/path, root cause.

## Compile / Typecheck

- Run the repo's documented compile/typecheck command.
- Summarize failures by file and category.
- Fix the highest-confidence issue first and re-run.
- Stop and report if errors require product or API decisions.

Evidence examples: command, status, grouped errors, fixes applied, remaining blockers.

## Guardrails

- Do not add new project dependencies only for an ad hoc verification unless the user asks.
- Keep temporary harnesses in `/tmp` unless the repo already has a checked-in harness.
- Do not use credentials or destructive commands in a local harness.
- Keep baseline and treatment comparable; otherwise return `INCONCLUSIVE`.
