'use strict';

/**
 * Shared helpers for the dbt-spec-driven hooks.
 *
 * The ledger is the "second observer". It is written ONLY by record-evidence.js,
 * from facts the harness hands to hooks (a sub-agent's real returned text, the
 * user's real answer, the real prompt). require-delegation.js blocks the agent
 * from writing to it, so workflow-state.md claims can be checked against events
 * the orchestrating agent could not fabricate.
 *
 * Location: <repo>/.cortex/spec-driven/ledger.jsonl (local runtime state, like
 * .cortex/notes/ — gitignore it). One JSON object per line:
 *   { type: 'subagent', agent, sha, spec, session, ts }
 *   { type: 'launch',   agent, agentId, spec, session, ts }   // background task
 *   { type: 'approval', answers, spec, session, ts }
 *   { type: 'mode',     mode: 'scheduled', session, ts }
 *   { type: 'legacy',   spec, rows: [{ phase, evidence }], ts }  // user-granted
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SPEC_ROOTS = ['dbt/specs', 'specs'];
const LEDGER_DIR = path.join('.cortex', 'spec-driven');
const LEDGER_FILE = 'ledger.jsonl';

/** Newest workflow-state.md by mtime across candidate spec roots. */
function findStateFile(cwd) {
  const found = [];
  for (const root of SPEC_ROOTS) {
    let dirs;
    try {
      dirs = fs.readdirSync(path.join(cwd, root), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const candidate = path.join(cwd, root, d.name, 'workflow-state.md');
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

/** Stable spec key: the spec directory's name (e.g. 28-09-26-statsig-metric). */
function specKey(stateFile) {
  return stateFile ? path.basename(path.dirname(stateFile)) : null;
}

function ledgerPath(cwd) {
  return path.join(cwd, LEDGER_DIR, LEDGER_FILE);
}

function readLedger(cwd) {
  let text;
  try {
    text = fs.readFileSync(ledgerPath(cwd), 'utf8');
  } catch {
    return [];
  }
  const entries = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      /* skip a corrupt line rather than discard the ledger */
    }
  }
  return entries;
}

function appendLedger(cwd, entry) {
  fs.mkdirSync(path.join(cwd, LEDGER_DIR), { recursive: true });
  fs.appendFileSync(ledgerPath(cwd), JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n');
}

/** First 8 hex chars of SHA-256 — the value recorded as `sha:xxxxxxxx`. */
function sha8(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex').slice(0, 8);
}

/** Sub-agent names = the plugin's agents/*.md brief filenames. */
function knownAgents() {
  try {
    return fs
      .readdirSync(path.join(__dirname, '..', '..', 'agents'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3));
  } catch {
    return [];
  }
}

/** Rows of the state table (the first table headed `Phase`), or [] if none.
 *  Later tables — e.g. the Retry Log — are never read as phases. */
function parseRows(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  let inTable = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (inTable) break;
      continue;
    }
    const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
    if (!inTable) {
      inTable = /^phase$/i.test(cells[0] || '');
      continue; // header (or an unrelated table before it)
    }
    if (cells.length < 5) continue;
    if (/^-+$/.test(cells[0].replace(/[\s:]/g, ''))) continue; // separator
    // Master schema: Phase | Status | Sub-agent | Gate | Evidence
    rows.push({ phase: cells[0], status: cells[1], agent: cells[2], gate: cells[3], evidence: cells[4] });
  }
  return rows;
}

const samePhase = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The current cycle. Re-entering a phase (retry, "Needs changes") is recorded by
 *  appending a new row for it; that re-opens the phase and everything after it,
 *  so earlier rows from the superseded cycle stop counting. */
function currentCycle(rows) {
  let kept = [];
  for (const row of rows) {
    const idx = kept.findIndex((k) => samePhase(k.phase, row.phase));
    if (idx >= 0) kept = kept.slice(0, idx);
    kept.push(row);
  }
  return kept;
}

module.exports = {
  SPEC_ROOTS,
  LEDGER_DIR,
  findStateFile,
  specKey,
  readLedger,
  appendLedger,
  sha8,
  knownAgents,
  parseRows,
  currentCycle,
  samePhase,
};
