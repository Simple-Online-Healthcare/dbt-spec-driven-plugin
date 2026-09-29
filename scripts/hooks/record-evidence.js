#!/usr/bin/env node
'use strict';

/**
 * Observer hook for the dbt-spec-driven workflow. NEVER blocks (always exit 0).
 *
 * Records facts the orchestrating agent cannot fabricate into the ledger
 * (see ledger.js), so require-delegation.js can verify workflow-state.md claims:
 *
 *   PostToolUse  task / agent_output  → hash of the sub-agent's REAL returned text
 *   PostToolUse  ask_user_question     → the user's REAL answer
 *   UserPromptSubmit                   → whether the session was started 'mode: scheduled'
 *
 * After recording a sub-agent result it tells the agent the exact `sha:` value to
 * put in the Evidence column — the agent never computes a hash itself.
 */

const fs = require('fs');
const path = require('path');
const {
  SPEC_ROOTS, findStateFile, specKey, appendLedger, readLedger, sha8, knownAgents, parseRows, currentCycle,
} = require('./ledger');

const SCHEDULED_PROMPT = /\bmode:\s*scheduled\b/i;
const LEGACY_PROMPT = /\bspec-driven:\s*accept legacy evidence(?:\s+for\s+([\w.-]+))?/i;
const LAUNCHED = /Background agent launched successfully[\s\S]*?agentId:\s*([0-9a-f-]{8,})/i;
const AGENT_BLOCK = /(?=^Agent:\s*[0-9a-f-]{8,})/im;

function done(context) {
  if (context) process.stdout.write(JSON.stringify({ additionalContext: context }));
  process.exit(0);
}

/** Tool responses arrive as a string or { content: [{ type: 'text', text }] }. */
function responseText(response) {
  if (typeof response === 'string') return response;
  if (response && Array.isArray(response.content)) {
    return response.content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join('\n');
  }
  return response == null ? '' : JSON.stringify(response);
}

/** Which plugin sub-agent a task call launched. Convention (SKILL.md): the task
 *  description starts with the agent name, e.g. "discovery: statsig metric". */
function identifyAgent(input) {
  const agents = knownAgents().sort((a, b) => b.length - a.length);
  const desc = String(input.description || '').trim().toLowerCase();
  const leading = agents.find((a) => desc.startsWith(a));
  if (leading) return leading;
  for (const text of [desc, String(input.prompt || '').toLowerCase()]) {
    const hits = agents.filter((a) => new RegExp(`\\b${a}\\b`).test(text));
    if (hits.length === 1) return hits[0];
  }
  return null;
}

function recorded(agent, sha) {
  return (
    `Evidence recorded by hook: ${agent} output → sha:${sha}. ` +
    `Put exactly 'sha:${sha}' in the Evidence cell for this phase. Do not compute ` +
    `hashes yourself — the ship gate only accepts values this hook observed.`
  );
}

/** The user (never the agent) grants pre-ledger rows of a named spec. Only rows
 *  already complete AND approved right now are covered, pinned to their exact
 *  evidence text, so nothing written afterwards can ride on the grant. */
function grantLegacy(cwd, name) {
  let stateFile = null;
  if (name) {
    stateFile = SPEC_ROOTS.map((r) => path.join(cwd, r, name, 'workflow-state.md')).find((f) => fs.existsSync(f));
  } else {
    stateFile = findStateFile(cwd);
  }
  if (!stateFile) return;
  const rows = currentCycle(parseRows(stateFile))
    .filter((r) => /^complete$/i.test(r.status) && /^(approved|auto-approved\b)/i.test(r.gate))
    .map((r) => ({ phase: r.phase, evidence: r.evidence }));
  appendLedger(cwd, { type: 'legacy', spec: specKey(stateFile), rows });
  return `Legacy evidence accepted by the user for ${specKey(stateFile)}: ${rows.map((r) => r.phase).join(', ') || '(no complete+approved rows)'}. ` +
    `Every later phase must be delegated and approved normally.`;
}

function main() {
  let event;
  try {
    event = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    done();
  }
  const cwd = event.cwd || process.cwd();
  const session = event.session_id || null;
  const hookEvent = String(event.hook_event_name || '');

  if (/userpromptsubmit/i.test(hookEvent) || (event.prompt !== undefined && !event.tool_name)) {
    const prompt = String(event.prompt || '');
    if (SCHEDULED_PROMPT.test(prompt)) {
      appendLedger(cwd, { type: 'mode', mode: 'scheduled', session });
    }
    const legacy = prompt.match(LEGACY_PROMPT);
    if (legacy) done(grantLegacy(cwd, legacy[1]));
    done();
  }

  const tool = String(event.tool_name || '').toLowerCase().replace(/_/g, '');
  const input = event.tool_input || {};
  const text = responseText(event.tool_response);
  const spec = specKey(findStateFile(cwd));

  if (tool === 'askuserquestion') {
    const answers = [...text.matchAll(/"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[2]);
    appendLedger(cwd, { type: 'approval', answers: answers.length ? answers : [text.slice(0, 200)], spec, session });
    done();
  }

  if (tool === 'task') {
    const agent = identifyAgent(input);
    if (!agent) done();
    const launched = text.match(LAUNCHED);
    if (launched) {
      appendLedger(cwd, { type: 'launch', agent, agentId: launched[1], spec, session });
      done(`Launch of '${agent}' recorded. Its evidence sha is issued when agent_output returns it completed.`);
    }
    const sha = sha8(text);
    appendLedger(cwd, { type: 'subagent', agent, sha, spec, session });
    done(recorded(agent, sha));
  }

  if (tool === 'agentoutput') {
    const launches = readLedger(cwd).filter((e) => e.type === 'launch');
    const notes = [];
    for (const block of text.split(AGENT_BLOCK)) {
      if (!/^Status:\s*completed\b/im.test(block)) continue;
      const launch = launches.find((l) => block.includes(l.agentId));
      if (!launch) continue;
      const sha = sha8(block);
      appendLedger(cwd, { type: 'subagent', agent: launch.agent, sha, spec: launch.spec || spec, session });
      notes.push(recorded(launch.agent, sha));
    }
    done(notes.join('\n') || undefined);
  }

  done();
}

try {
  main();
} catch {
  process.exit(0); // an observer must never break the session
}
