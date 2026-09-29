#!/usr/bin/env node
'use strict';

/**
 * PreToolUse enforcement hook for the dbt-spec-driven workflow.
 *
 * Two gates plus a guard, one script:
 *
 *   1. MODEL WRITE GATE  — blocks writing/editing a dbt model until:
 *        - Discover is complete and `discovery` delegated;
 *        - every phase above the Implement row is complete AND approved;
 *        - the state table is in order (no phase started before an earlier one
 *          was approved — including sub-agents the ledger saw run early);
 *        - every claim in the table checks out against the ledger (below);
 *        - no new ref() points to a downstream layer (AGENTS.md §1).
 *   2. SHIP GATE         — blocks `git push` / `gh pr create` while any phase is
 *      incomplete, any required sub-agent was never delegated, or any claim fails
 *      the same verification. The backstop: a change can reach the working tree
 *      without a workflow; it must not become a PR without one.
 *   3. LEDGER GUARD      — blocks the agent from writing to the hook ledger.
 *
 * Verification is against the LEDGER written by record-evidence.js from facts
 * the harness supplies (a sub-agent's real output, the user's real answer, the
 * real prompt). workflow-state.md is the agent's claim; the ledger is the check.
 *
 * Contract (Cortex Code hooks): stdin receives the event JSON; exit 0 allows the
 * call, exit 2 blocks it and stderr becomes the reason shown to the agent.
 *
 * FAIL OPEN on every error path: internal error, malformed event, no spec root,
 * unparseable table, missing/unparseable AGENTS.md profile → exit 0. A broken
 * enforcement hook must never make a repository unworkable. Missing EVIDENCE is
 * not an error path — an unverifiable claim blocks.
 *
 * Escape hatch: DBT_SPEC_DRIVEN_ENFORCE=off disables every gate.
 */

const fs = require('fs');
const path = require('path');
const { SPEC_ROOTS, LEDGER_DIR, findStateFile, specKey, readLedger, knownAgents, parseRows, currentCycle, samePhase } = require('./ledger');

const WRITE_TOOLS = /^(write|edit|multi_edit|multiedit)$/i;
const BASH_TOOLS = /^(bash|shell|terminal)$/i;
const SHIP_COMMAND = /\bgit\s+push\b|\bgh\s+pr\s+create\b/;
const MODEL_REDIRECT = /(?:^|[;&|]\s*|>>?)\s*(?:['"]?)((?:[\w./-]+\/)?models\/[\w./-]+\.sql)\b/i;
const LEDGER_PATH = /\.cortex[\\/]spec-driven\b/;
// A write whose TARGET is the ledger: redirected/tee'd into it, or a mutating
// command whose argument is the ledger path. Mentioning the path (in a read, a
// pipe, or as text written to another file like .gitignore) is fine. A determined
// agent can still obfuscate a write; that is circumvention, not a slip.
const LEDGER = String.raw`['"]?[^\s'";&|]*\.cortex[\\/]spec-driven`;
const LEDGER_WRITE = new RegExp(
  String.raw`(>>?|\btee\s+(-a\s+)?)\s*${LEDGER}` +
    String.raw`|\b(rm|mv|cp|truncate|dd|touch|ln|install|chmod)\b[^;&|]*\s${LEDGER}` +
    String.raw`|\bsed\s+-i\b[^;&|]*\s${LEDGER}` +
    String.raw`|\b(perl|python3?|node|ruby)\b[^;&|]*\.cortex[\\/]spec-driven`
);
const REF_CALL = /\bref\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/g;
const SHA_TOKEN = /\bsha:([0-9a-f]{8})\b/gi;
const FILE_TOKEN = /[\w./-]+\.(?:md|sql|ya?ml|csv|json|txt)\b/gi;
const REQUIRED_BY_PHASE = [
  { match: /specify\+implement|design\+implement/i, agents: ['spec-author', 'test-author'] },
  { match: /discover/i, agents: ['discovery'] },
  { match: /specify|design/i, agents: ['spec-author'] },
  { match: /implement/i, agents: ['test-author'] },
  { match: /validate/i, agents: ['output-validator'] },
  { match: /review/i, agents: ['peer-reviewer'] },
];

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

const isDelegated = (cell) => /delegated/i.test(cell);
/** An agent cell that names no agent — em dash, hyphen, N/A, or empty. */
const namesNoAgent = (cell) => cell === '' || /^(—|-|–|n\/a)$/i.test(cell);
const isIncomplete = (status) => /pending|in-progress/i.test(status);
const isBlocked = (status) => /blocked/i.test(status);
const isComplete = (status) => /^complete$/i.test(status);
const isProgressing = (status) => /^(in-progress|complete)$/i.test(status);
const isHumanApproval = (gate) => /^approved$/i.test(gate);
const isScheduledApproval = (gate) => /^auto-approved\b/i.test(gate);
const isApproved = (gate) => isHumanApproval(gate) || isScheduledApproval(gate);
const isApprovalAnswer = (answer) => /^approve/i.test(String(answer).trim());

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

function extractModelWrite(command) {
  const match = String(command || '').match(MODEL_REDIRECT);
  return match ? match[1].replace(/\\/g, '/') : null;
}

function cellNames(cell) {
  return String(cell || '')
    .toLowerCase()
    .split(/[,;/]|and/)
    .map((part) => part.replace(/\bdelegated\b/g, '').trim())
    .filter((part) => part && !namesNoAgent(part));
}

function requiredAgents(phase) {
  const rule = REQUIRED_BY_PHASE.find((r) => r.match.test(phase));
  return rule ? rule.agents : [];
}

function missingRequired(rows) {
  const missing = [];
  for (const row of rows) {
    const needed = requiredAgents(row.phase);
    if (!needed.length) continue;
    const named = cellNames(row.agent);
    for (const agent of needed) {
      const present = named.some((name) => name.includes(agent));
      if (!present || !isDelegated(row.agent)) {
        missing.push({ phase: row.phase, agent, cell: row.agent });
      }
    }
  }
  return missing;
}

/** Plugin sub-agents named in an agent cell. Falls back to the loose split if the
 *  agents/ directory cannot be read. */
function agentsIn(cell, agents) {
  const text = String(cell || '').toLowerCase();
  if (!agents.length) return cellNames(cell);
  return agents.filter((a) => new RegExp(`(^|[^\\w-])${a}([^\\w-]|$)`).test(text));
}

// ---------------------------------------------------------------------------
// Claim verification: the table is the agent's claim, the ledger is the check.
// ---------------------------------------------------------------------------

function ledgerFor(ledger, spec, type) {
  return ledger.filter((e) => e.type === type && e.spec === spec);
}

const shasIn = (evidence) => [...String(evidence).matchAll(SHA_TOKEN)].map((m) => m[1].toLowerCase());

/** When the evidence cited by `row` was observed: the latest ledger run whose sha
 *  the row cites. null if the row cites no recorded run. */
function evidenceTime(row, ctx) {
  const shas = shasIn(row.evidence);
  const times = ledgerFor(ctx.ledger, ctx.spec, 'subagent').filter((r) => shas.includes(r.sha)).map((r) => r.ts);
  return times.length ? times.sort().pop() : null;
}

/** Rows the user explicitly accepted on pre-ledger evidence (typed in the prompt,
 *  the one channel the agent cannot write). Matched on phase AND the exact
 *  evidence cell, so an edited or new row is never covered. */
function isLegacy(row, ctx) {
  return ledgerFor(ctx.ledger, ctx.spec, 'legacy').some((g) =>
    (g.rows || []).some((r) => samePhase(r.phase, row.phase) && r.evidence === row.evidence)
  );
}

/** Every problem with the claims in `rows`, checked against the ledger. */
function verifyClaims(rows, ctx) {
  const problems = [];
  const runs = ledgerFor(ctx.ledger, ctx.spec, 'subagent');
  const approvals = ledgerFor(ctx.ledger, ctx.spec, 'approval')
    .filter((e) => (e.answers || []).some(isApprovalAnswer))
    .map((e) => e.ts)
    .sort();
  let cursor = ''; // time of the previous phase's approval

  for (const row of rows) {
    if (isComplete(row.status) && !isApproved(row.gate)) {
      problems.push(`${row.phase}: status is 'complete' but Gate is '${row.gate || '(empty)'}' — ` +
        `a phase is not done until its gate is approved.`);
    }
    if (isLegacy(row, ctx)) continue;

    let evidenceAt = null;
    if (isDelegated(row.agent)) {
      const shas = shasIn(row.evidence);
      if (!shas.length) {
        problems.push(`${row.phase}: Sub-agent is 'delegated' but Evidence has no sha:xxxxxxxx.`);
      }
      for (const file of String(row.evidence).match(FILE_TOKEN) || []) {
        const candidates = [path.join(ctx.specDir, file), path.join(ctx.cwd, file)];
        if (!candidates.some((c) => fs.existsSync(c))) {
          problems.push(`${row.phase}: Evidence cites '${file}', which does not exist.`);
        }
      }
      for (const agent of agentsIn(row.agent, ctx.agents)) {
        const recorded = runs.filter((r) => r.agent === agent);
        if (!recorded.length) {
          problems.push(`${row.phase}: no recorded run of '${agent}' for this spec. The hook ledger ` +
            `records every sub-agent result; this delegation never happened.`);
        } else if (shas.length && !recorded.some((r) => shas.includes(r.sha))) {
          problems.push(`${row.phase}: Evidence sha does not match any recorded '${agent}' output ` +
            `(recorded: ${recorded.map((r) => 'sha:' + r.sha).join(', ')}).`);
        }
      }
      evidenceAt = evidenceTime(row, ctx);
      const floor = ctx.floor ? ctx.floor.get(row) : '';
      if (evidenceAt && ((cursor && evidenceAt < cursor) || (floor && evidenceAt <= floor))) {
        problems.push(`${row.phase}: its evidence is not newer than the phases above it — ` +
          `reused from an earlier cycle. Re-run the sub-agent for this cycle.`);
      }
    }

    if (isComplete(row.status) && isHumanApproval(row.gate)) {
      const after = evidenceAt && evidenceAt > cursor ? evidenceAt : cursor;
      const next = approvals.find((ts) => ts > after);
      if (!next) {
        problems.push(`${row.phase}: Gate says 'approved' but the user has not chosen "Approve and ` +
          `proceed" since this phase's ${evidenceAt ? 'evidence was produced' : 'previous gate'}. ` +
          `Present the artifact and ask with ask_user_question.`);
      } else {
        cursor = next;
      }
    } else if (isComplete(row.status) && isScheduledApproval(row.gate)) {
      if (evidenceAt && evidenceAt > cursor) cursor = evidenceAt;
    }
  }

  const claimedScheduled = rows.filter((r) => isComplete(r.status) && isScheduledApproval(r.gate) && !isLegacy(r, ctx));
  if (claimedScheduled.length && ctx.session) {
    const scheduled = ctx.ledger.some((e) => e.type === 'mode' && e.mode === 'scheduled' && e.session === ctx.session);
    if (!scheduled) {
      problems.push(`${claimedScheduled.map((r) => r.phase).join(', ')}: Gate says 'auto-approved ` +
        `(scheduled)' but this session was not started with 'mode: scheduled'. Interactive ` +
        `sessions need the user's approval.`);
    }
  }
  return problems;
}

/** Route-agnostic ordering: a phase may not start until every phase above it in
 *  the current cycle is complete and approved. A phase counts as started if its
 *  status says so, its sub-agent is marked delegated, or the ledger saw its
 *  sub-agent run since the phases above it produced their evidence (only for
 *  agents named in exactly one row, so the run is attributable). */
function sequencingProblems(rows, ctx) {
  const runs = ledgerFor(ctx.ledger, ctx.spec, 'subagent').concat(ledgerFor(ctx.ledger, ctx.spec, 'launch'));
  const rowsNaming = (agent) => rows.filter((r) => agentsIn(r.agent, ctx.agents).includes(agent)).length;

  const problems = [];
  rows.forEach((row, i) => {
    const anchor = rows.slice(0, i).map((r) => evidenceTime(r, ctx)).filter(Boolean).sort().pop() || '';
    const early = agentsIn(row.agent, ctx.agents).find(
      (a) => rowsNaming(a) === 1 && runs.some((r) => r.agent === a && r.ts > anchor)
    );
    const started = isProgressing(row.status) || isDelegated(row.agent) || early;
    if (!started) return;
    const lagging = rows.slice(0, i).find((prev) => !(isComplete(prev.status) && isApproved(prev.gate)));
    if (!lagging) return;
    const how = isProgressing(row.status) || isDelegated(row.agent) ? `is '${row.status}'` : `'${early}' already ran`;
    problems.push(`${row.phase} ${how} but earlier phase '${lagging.phase}' is status='${lagging.status}', ` +
      `gate='${lagging.gate}'. Phases run in order; each gate is approved before the next starts.`);
  });
  return problems;
}

/** Every phase above the Implement row must be complete and approved before any
 *  model is written. Routes without an Implement row (Standalone Review/Docs)
 *  rely on sequencing alone. */
function implementPrereqProblems(rows) {
  const idx = rows.findIndex((r) => /implement/i.test(r.phase));
  if (idx <= 0) return [];
  return rows
    .slice(0, idx)
    .filter((r) => !(isComplete(r.status) && isApproved(r.gate)))
    .map((r) => `${r.phase} must be complete and approved before implementing ` +
      `(status='${r.status}', gate='${r.gate}').`);
}

// ---------------------------------------------------------------------------
// Layer direction (AGENTS.md §1): an upstream layer never refs a downstream one.
// ---------------------------------------------------------------------------

/** Layer order and prefixes from the AGENTS.md Project Profile, or null. */
function readProfile(cwd) {
  let text;
  try {
    text = fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8');
  } catch {
    return null;
  }
  const row = (label) => {
    const m = text.match(new RegExp(`^\\|\\s*${label}[^|]*\\|\\s*(.+?)\\s*\\|\\s*$`, 'im'));
    return m ? m[1].replace(/`/g, '') : null;
  };
  const order = row('Layers');
  const prefixes = row('Layer prefixes');
  if (!order || !prefixes) return null;
  const names = order.split(/→|->/).map((s) => s.trim()).filter(Boolean);
  if (names.length < 2) return null;
  const layers = names.map((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = prefixes.match(new RegExp(`${escaped}\\s+([\\w-]+)`, 'i'));
    const prefix = m && !/^none$/i.test(m[1]) ? m[1] : null;
    return { name, prefix };
  });
  return layers.some((l) => l.prefix) ? layers : null;
}

function listModelNames(modelsRoot) {
  const names = new Set();
  const walk = (dir, depth) => {
    if (depth > 12) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
      else if (e.name.endsWith('.sql')) names.add(e.name.slice(0, -4));
    }
  };
  walk(modelsRoot, 0);
  return names;
}

/** Layer index by prefix; an unprefixed name is the unprefixed layer only if it is
 *  a real model (so seeds and snapshots are never misread as marts). */
function layerIndex(name, layers, isModel) {
  const byPrefix = layers
    .map((l, i) => ({ ...l, i }))
    .filter((l) => l.prefix && name.startsWith(l.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  if (byPrefix.length) return byPrefix[0].i;
  const unprefixed = layers.map((l, i) => ({ ...l, i })).filter((l) => !l.prefix);
  return unprefixed.length === 1 && isModel(name) ? unprefixed[0].i : null;
}

function newContent(toolInput) {
  if (typeof toolInput.content === 'string') return toolInput.content;
  if (typeof toolInput.file_text === 'string') return toolInput.file_text;
  if (typeof toolInput.new_string === 'string') return toolInput.new_string;
  if (Array.isArray(toolInput.edits)) return toolInput.edits.map((e) => (e && e.new_string) || '').join('\n');
  return String(toolInput.command || '');
}

function layerProblems(cwd, targetRel, content) {
  const layers = readProfile(cwd);
  if (!layers) return [];
  const modelsRoot = path.join(cwd, targetRel.slice(0, targetRel.search(/(^|\/)models\//) + 1), 'models');
  let models = null;
  const isModel = (name) => (models || (models = listModelNames(modelsRoot))).has(name);

  const self = path.basename(targetRel, '.sql');
  const selfIdx = layerIndex(self, layers, () => true);
  if (selfIdx === null) return [];

  const problems = [];
  for (const m of content.matchAll(REF_CALL)) {
    const ref = m[2] || m[1];
    const refIdx = layerIndex(ref, layers, isModel);
    if (refIdx !== null && refIdx > selfIdx) {
      problems.push(`${self} (${layers[selfIdx].name}) refs ${ref} (${layers[refIdx].name}). ` +
        `Dependencies flow ${layers.map((l) => l.name).join(' → ')}; an upstream layer must never ` +
        `reference a downstream one. There is no exception mechanism — restructure the model.`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------

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

  // Ledger guard: the ledger is only trustworthy if the agent cannot write it.
  const writePath = isWrite ? String(toolInput.file_path || toolInput.path || '') : '';
  const command = isBash ? String(toolInput.command || '') : '';
  if ((isWrite && LEDGER_PATH.test(writePath)) || (isBash && LEDGER_PATH.test(command) && LEDGER_WRITE.test(command))) {
    block(
      `BLOCKED: ${LEDGER_DIR}/ is the hook evidence ledger. Only the record-evidence hook ` +
        `writes it — editing it would forge the evidence the gates check. Reading it is fine.`
    );
  }

  // Only the two gated situations proceed past here.
  let gate = null;
  if (isWrite) {
    const rel = relativize(cwd, writePath);
    if (!isModelPath(rel)) allow();
    gate = { kind: 'model-write', target: rel };
  } else {
    const redirected = extractModelWrite(command);
    if (redirected) {
      gate = { kind: 'model-write', target: relativize(cwd, redirected) };
    } else if (SHIP_COMMAND.test(command)) {
      gate = { kind: 'ship', target: command.trim().slice(0, 120) };
    } else {
      allow();
    }
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

  if (gate.kind === 'model-write') {
    const layer = layerProblems(cwd, gate.target, newContent(toolInput));
    if (layer.length) {
      block([`BLOCKED: layer dependency violation (AGENTS.md §1, blocking).`, ``, ...layer.map((p) => `  - ${p}`)].join('\n'));
    }
  }

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

  const allRows = parseRows(stateFile);
  const rows = currentCycle(allRows);
  if (!rows.length) allow(); // unparseable table — fail open

  const blockedRow = rows.find((r) => isBlocked(r.status));
  if (blockedRow) {
    block(
      `HARD STOP: ${stateFile} shows phase '${blockedRow.phase}' as blocked.\n` +
        `The workflow failed after max retries. Do not continue — terminate and report.`
    );
  }

  const ctx = {
    cwd,
    specDir: path.dirname(stateFile),
    spec: specKey(stateFile),
    session: event.session_id || null,
    ledger: readLedger(cwd),
    agents: knownAgents(),
  };
  // The table is append-only, so each row's evidence must be newer than every
  // piece of evidence above it (including superseded cycles).
  ctx.floor = new Map();
  let newest = '';
  for (const row of allRows) {
    ctx.floor.set(row, newest);
    const t = evidenceTime(row, ctx);
    if (t && t > newest) newest = t;
  }

  if (gate.kind === 'model-write') {
    const discover = rows.find((r) => /discover/i.test(r.phase));
    const discoverOk = discover && isDelegated(discover.agent) && isComplete(discover.status);
    if (!discoverOk) {
      const status = discover ? discover.status : '(missing)';
      const agent = discover ? discover.agent : '(missing)';
      block(
        `BLOCKED: Discover phase not delegated.\n\n` +
          `${stateFile} shows Discover as status='${status}', ` +
          `sub-agent='${agent}'. Writing ${gate.target} now would implement ` +
          `against unverified assumptions — the documented failure mode this gate exists ` +
          `to prevent (see references/field-feedback.md).\n\n` +
          `Delegate to the 'discovery' sub-agent via the Task tool, record its findings, ` +
          `mark the Discover row 'complete' with the sub-agent 'delegated', then retry.`
      );
    }
    const problems = [...implementPrereqProblems(rows), ...sequencingProblems(rows, ctx), ...verifyClaims(rows, ctx)];
    if (problems.length) {
      block(
        [`BLOCKED: cannot write ${gate.target} — the workflow state does not check out.`, ``,
          `State file: ${stateFile}`, ``, ...problems.map((p) => `  - ${p}`), ``,
          `Fix the workflow, not the table: run the missing step, present the artifact, and ` +
            `get the approval. To rework a phase, append a new row for it (e.g. ` +
            `'| Implement | in-progress | test-author | — | — |') — that re-opens it and every ` +
            `phase after it. Rewriting cells to pass this check is a workflow violation.`].join('\n')
      );
    }
    allow();
  }

  // Ship gate: every phase before Ship must be complete, every row that names a
  // sub-agent must show it delegated, and every claim must verify.
  const shipIndex = rows.findIndex((r) => /^ship/i.test(r.phase));
  const priorRows = shipIndex === -1 ? rows : rows.slice(0, shipIndex);

  const incomplete = priorRows.filter((r) => isIncomplete(r.status));
  const undelegated = priorRows.filter((r) => !namesNoAgent(r.agent) && !isDelegated(r.agent));
  const missing = missingRequired(priorRows);
  const unverified = [...sequencingProblems(priorRows, ctx), ...verifyClaims(priorRows, ctx)];

  if (incomplete.length || undelegated.length || missing.length || unverified.length) {
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
    if (missing.length) {
      lines.push(`Required sub-agents missing or not delegated:`);
      for (const m of missing) {
        lines.push(`  - ${m.phase} → expected '${m.agent}' (found '${m.cell}')`);
      }
      lines.push(``);
    }
    if (unverified.length) {
      lines.push(`Claims that do not check out against the hook ledger:`);
      for (const p of unverified) lines.push(`  - ${p}`);
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
