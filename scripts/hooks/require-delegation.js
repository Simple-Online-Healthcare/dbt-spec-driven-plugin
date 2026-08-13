#!/usr/bin/env node
'use strict';

/**
 * PreToolUse enforcement hook for the dbt-spec-driven workflow.
 *
 * Two gates, one script:
 *
 *   1. MODEL WRITE GATE  — blocks writing/editing a dbt model until the Discover
 *      phase shows `discovery` was delegated in workflow-state.md.
 *   2. SHIP GATE         — blocks `git push` / `gh pr create` while any phase is
 *      incomplete or any required sub-agent was never delegated. This is what
 *      closes the model-write gate's escape hatch: even if a change reached the
 *      working tree without a workflow, it cannot become a PR.
 *
 * Contract (Cortex Code hooks): stdin receives the event JSON; exit 0 allows the
 * call, exit 2 blocks it and stderr becomes the reason shown to the agent.
 *
 * FAIL OPEN. Any internal error, unreadable file, or unparseable table exits 0.
 * A broken enforcement hook must never make a repository unworkable. The only
 * deliberate blocks are the ones described above.
 *
 * Escape hatch: DBT_SPEC_DRIVEN_ENFORCE=off disables both gates.
 */

const fs = require('fs');
const path = require('path');

const SPEC_ROOTS = ['dbt/specs', 'specs'];
const WRITE_TOOLS = /^(write|edit|multi_edit|multiedit)$/i;
const BASH_TOOLS = /^(bash|shell|terminal)$/i;
const SHIP_COMMAND = /\bgit\s+push\b|\bgh\s+pr\s+create\b/;

function allow() {
  process.exit(0);
}

function block(reason) {
  process.stderr.write(reason);
  process.exit(2);
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** Newest workflow-state.md by mtime across candidate spec roots (matches the
 *  resolution the other hooks use — see INTERNALS.md "Spec-directory resolution"). */
function findStateFile(cwd) {
  const found = [];
  for (const root of SPEC_ROOTS) {
    const abs = path.join(cwd, root);
    let dirs;
    try {
      dirs = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const candidate = path.join(abs, d.name, 'workflow-state.md');
      try {
        found.push({ file: candidate, mtime: fs.statSync(candidate).mtimeMs });
      } catch {
        /* no state file in this spec dir */
      }
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0].file;
}

/** Parse the markdown state table into rows. Returns [] if it cannot be parsed. */
function parseRows(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    if (/^-+$/.test(cells[0].replace(/[\s:]/g, ''))) continue; // separator
    if (/^phase$/i.test(cells[0])) continue; // header
    rows.push({ phase: cells[0], status: cells[1], gate: cells[2], artifact: cells[3], agent: cells[4] });
  }
  return rows;
}

const isDelegated = (cell) => /delegated/i.test(cell);
/** An agent cell that names no agent — em dash, hyphen, N/A, or empty. */
const namesNoAgent = (cell) => cell === '' || /^(—|-|–|n\/a)$/i.test(cell);
const isIncomplete = (status) => /pending|in-progress/i.test(status);
const isBlocked = (status) => /blocked/i.test(status);

function relativize(cwd, filePath) {
  if (!filePath) return '';
  const normalized = filePath.replace(/\\/g, '/');
  const cwdNorm = cwd.replace(/\\/g, '/').replace(/\/$/, '');
  return normalized.startsWith(cwdNorm + '/') ? normalized.slice(cwdNorm.length + 1) : normalized;
}

/** A dbt model: a .sql file under a models/ directory. Deliberately narrow —
 *  macros, tests, analyses, and YAML are not gated. */
function isModelPath(rel) {
  return /(^|\/)models\//.test(rel) && /\.sql$/i.test(rel);
}

function main() {
  if (/^(off|0|false)$/i.test(process.env.DBT_SPEC_DRIVEN_ENFORCE || '')) allow();

  const raw = readStdin();
  if (!raw.trim()) allow();

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    allow();
  }

  const toolName = String(event.tool_name || '');
  const toolInput = event.tool_input || {};
  const cwd = event.cwd || process.cwd();

  const isWrite = WRITE_TOOLS.test(toolName);
  const isBash = BASH_TOOLS.test(toolName);
  if (!isWrite && !isBash) allow();

  // Only the two gated situations proceed past here.
  let gate = null;
  if (isWrite) {
    const rel = relativize(cwd, toolInput.file_path || toolInput.path || '');
    if (!isModelPath(rel)) allow();
    gate = { kind: 'model-write', target: rel };
  } else {
    const command = String(toolInput.command || '');
    if (!SHIP_COMMAND.test(command)) allow();
    gate = { kind: 'ship', target: command.trim().slice(0, 120) };
  }

  // A repo with no spec roots at all is not running this workflow.
  const hasSpecRoot = SPEC_ROOTS.some((r) => {
    try {
      return fs.statSync(path.join(cwd, r)).isDirectory();
    } catch {
      return false;
    }
  });
  if (!hasSpecRoot) allow();

  const stateFile = findStateFile(cwd);

  if (!stateFile) {
    if (gate.kind === 'model-write') {
      block(
        `BLOCKED: no active workflow.\n\n` +
          `You are about to write a dbt model (${gate.target}) with no workflow-state.md in ` +
          `any spec directory, so the Discover phase cannot have run.\n\n` +
          `Do one of these:\n` +
          `  1. Start the spec-driven workflow — delegate to the 'discovery' sub-agent, then ` +
          `create <specs>/<dd-mm-yy>-<name>/workflow-state.md from the template in SKILL.md.\n` +
          `  2. If this is a deliberate out-of-workflow edit, ask the user to confirm and ` +
          `re-run with DBT_SPEC_DRIVEN_ENFORCE=off.\n\n` +
          `Do not work around this by editing a non-model file instead.`
      );
    }
    block(
      `BLOCKED: cannot ship without a workflow.\n\n` +
        `'${gate.target}' would publish changes with no workflow-state.md in any spec ` +
        `directory — there is no record that discovery, validation, or review ever ran.\n\n` +
        `Run the spec-driven workflow for this change before opening a PR.`
    );
  }

  const rows = parseRows(stateFile);
  if (!rows.length) allow(); // unparseable table — fail open

  const blockedRow = rows.find((r) => isBlocked(r.status));
  if (blockedRow) {
    block(
      `HARD STOP: ${stateFile} shows phase '${blockedRow.phase}' as blocked.\n` +
        `The workflow failed after max retries. Do not continue — terminate and report.`
    );
  }

  if (gate.kind === 'model-write') {
    const discover = rows.find((r) => /discover/i.test(r.phase));
    if (discover && !isDelegated(discover.agent) && !/complete/i.test(discover.status)) {
      block(
        `BLOCKED: Discover phase not delegated.\n\n` +
          `${stateFile} shows Discover as status='${discover.status}', ` +
          `sub-agent='${discover.agent}'. Writing ${gate.target} now would implement ` +
          `against unverified assumptions — the documented failure mode this gate exists ` +
          `to prevent (see references/field-feedback.md).\n\n` +
          `Delegate to the 'discovery' sub-agent via the Task tool, record its findings, ` +
          `mark the Discover row 'complete' with the sub-agent 'delegated', then retry.`
      );
    }
    allow();
  }

  // Ship gate: every phase before Ship must be complete, and every row that
  // names a sub-agent must show it delegated.
  const shipIndex = rows.findIndex((r) => /^ship/i.test(r.phase));
  const priorRows = shipIndex === -1 ? rows : rows.slice(0, shipIndex);

  const incomplete = priorRows.filter((r) => isIncomplete(r.status));
  const undelegated = priorRows.filter((r) => !namesNoAgent(r.agent) && !isDelegated(r.agent));

  if (incomplete.length || undelegated.length) {
    const lines = [`BLOCKED: workflow incomplete — cannot ship.`, ``, `State file: ${stateFile}`, ``];
    if (incomplete.length) {
      lines.push(`Phases not complete:`);
      for (const r of incomplete) lines.push(`  - ${r.phase} (status: ${r.status})`);
      lines.push(``);
    }
    if (undelegated.length) {
      lines.push(`Sub-agents named but never delegated:`);
      for (const r of undelegated) lines.push(`  - ${r.phase} → expected '${r.agent}' to show 'delegated'`);
      lines.push(``);
    }
    lines.push(
      `Complete the outstanding phases and delegations, or tell the user which gate you ` +
        `intend to skip and why. Partial delegation is a workflow violation, not a shortcut.`
    );
    block(lines.join('\n'));
  }

  allow();
}

try {
  main();
} catch {
  allow(); // never brick the repo on an internal error
}
