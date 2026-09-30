#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'require-delegation.js');
const OBSERVER = path.join(__dirname, 'record-evidence.js');
const SESSION = 'test-session';

function run(cwd, event, env = {}) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd,
    env: { ...process.env, ...env },
    input: JSON.stringify({ session_id: SESSION, ...event }),
    encoding: 'utf8',
  });
  return result;
}

/** Drive the real observer hook, exactly as the harness would. */
function observe(cwd, event) {
  const r = spawnSync(process.execPath, [OBSERVER], {
    cwd,
    input: typeof event === 'string' ? event : JSON.stringify({ cwd, session_id: SESSION, ...event }),
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, `observer must never block: ${r.stderr}`);
  return r.stdout;
}

/** A sub-agent returns `text`; returns the sha the observer issued. */
function observeSubagent(cwd, agent, text = `${agent} findings`) {
  const out = observe(cwd, {
    hook_event_name: 'PostToolUse',
    tool_name: 'task',
    tool_input: { description: `${agent}: do the work`, prompt: 'brief', subagent_type: 'generalPurpose' },
    tool_response: { content: [{ type: 'text', text }], status: 'success' },
  });
  const m = out.match(/sha:([0-9a-f]{8})/);
  assert.ok(m, `observer issued no sha for ${agent}: ${out}`);
  return m[1];
}

function observeAnswer(cwd, answer = 'Approve and proceed') {
  observe(cwd, {
    hook_event_name: 'PostToolUse',
    tool_name: 'ask_user_question',
    tool_input: { questions: [] },
    tool_response: { content: [{ type: 'text', text: `User has answered your questions:\n"Discover complete. Proceed to Specify?" = "${answer}"` }] },
  });
}

/**
 * Build a workflow whose claims are REAL: every delegated row's sub-agent is run
 * through the observer, and every 'approved' gate gets a real approval answer.
 * Row spec: [phase, status, agent, gate]. agent '' → no sub-agent.
 */
function realWorkflow(cwd, name, spec) {
  writeState(cwd, name, []); // create the spec dir so the observer can key to it
  const rows = spec.map(([phase, status, agent, gate]) => {
    let cell = agent ? agent : '—';
    let evidence = '—';
    if (agent && status !== 'pending') {
      const names = agent.split(',').map((a) => a.trim());
      evidence = names.map((a) => `sha:${observeSubagent(cwd, a, `${a} output for ${phase}`)}`).join(' · ');
      cell = names.map((a) => `${a} delegated`).join(', ');
    }
    if (gate === 'approved') observeAnswer(cwd);
    return `| ${phase} | ${status} | ${cell} | ${gate} | ${evidence} |`;
  });
  return writeState(cwd, name, rows);
}

const AGENTS_MD = [
  '## Project Profile',
  '| Parameter | Value (example) |',
  '|-----------|-----------------|',
  '| Layers (upstream → downstream) | `staging → intermediate → marts` |',
  '| Layer prefixes | staging `stg_`, intermediate `int_`, marts (none) |',
  '',
].join('\n');

function dbtProject(cwd) {
  fs.writeFileSync(path.join(cwd, 'AGENTS.md'), AGENTS_MD);
  for (const f of ['staging/stg_orders.sql', 'intermediate/int_experiments__statsig_user_day.sql', 'marts/orders.sql']) {
    fs.mkdirSync(path.join(cwd, 'dbt/models', path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'dbt/models', f), 'select 1\n');
  }
}

const IMPLEMENTING = [
  ['Discover', 'complete', 'discovery', 'approved'],
  ['Specify', 'complete', 'spec-author', 'approved'],
  ['Design', 'complete', 'spec-author', 'approved'],
  ['Implement', 'in-progress', 'test-author', '—'],
  ['Validate Output', 'pending', '', '—'],
  ['Review', 'pending', '', '—'],
  ['Ship', 'pending', '', '—'],
];

function writeState(root, name, rows) {
  const dir = path.join(root, 'dbt/specs', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, 'dbt/dbt_project.yml'), 'name: test_project\n');
  const header = [
    '| Phase | Status | Sub-agent | Gate | Evidence |',
    '|-------|--------|-----------|------|----------|',
  ];
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), [...header, ...rows, ''].join('\n'));
  return dir;
}

function writeEvent({ tool = 'write', file_path, command, cwd, content }) {
  const tool_input = file_path ? { file_path } : { command };
  if (content !== undefined) tool_input.content = content;
  return { tool_name: tool, cwd, tool_input };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'require-delegation-'));
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok  ${name}`);
    console.error('   ', err.message);
  }
}

check('refuse model SQL before Discover is delegated', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'pre-'));
  writeState(cwd, '21-09-26-bug', [
    '| Discover | in-progress | discovery | — | — |',
  ]);
  const r = run(
    cwd,
    writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/staging/stg_orders.sql') }),
  );
  assert.strictEqual(r.status, 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
  assert.match(r.stderr, /Discover phase not delegated/);
});

check('allow model SQL after Discover really ran and was really approved', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'ok-'));
  realWorkflow(cwd, '21-09-26-bug', [['Discover', 'complete', 'discovery', 'approved']]);
  const r = run(
    cwd,
    writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/staging/stg_orders.sql') }),
  );
  assert.strictEqual(r.status, 0, r.stderr);
});

check('refuse push if test-author is named but not delegated', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'ship-'));
  writeState(cwd, '21-09-26-bug', [
    '| Discover | complete | discovery delegated | approved | sha:aaa |',
    '| Specify+Implement | complete | test-author | approved | — |',
    '| Ship | pending | ci-interpreter | — | — |',
  ]);
  const r = run(cwd, writeEvent({ cwd, tool: 'bash', command: 'git push -u origin HEAD' }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /test-author/);
});

check('fail-open when state table is unparseable', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'open-'));
  const dir = path.join(cwd, 'dbt/specs/21-09-26-x');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), 'not a table\n');
  const r = run(
    cwd,
    writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/stg.sql') }),
  );
  assert.strictEqual(r.status, 0, r.stderr);
});

check('do not gate macros/', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'macro-'));
  writeState(cwd, '21-09-26-bug', [
    '| Discover | in-progress | discovery | — | — |',
  ]);
  const r = run(
    cwd,
    writeEvent({ cwd, file_path: path.join(cwd, 'dbt/macros/union.sql') }),
  );
  assert.strictEqual(r.status, 0, r.stderr);
});

check('do not gate YAML', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'yml-'));
  writeState(cwd, '21-09-26-bug', [
    '| Discover | in-progress | discovery | — | — |',
  ]);
  const r = run(
    cwd,
    writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/staging/stg_orders.yml') }),
  );
  assert.strictEqual(r.status, 0, r.stderr);
});

check('ENFORCE=off disables both gates', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'off-'));
  writeState(cwd, '21-09-26-bug', [
    '| Discover | in-progress | discovery | — | — |',
  ]);
  const r = run(
    cwd,
    writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/stg.sql') }),
    { DBT_SPEC_DRIVEN_ENFORCE: 'off' },
  );
  assert.strictEqual(r.status, 0, r.stderr);
});

check('refuse model SQL when Discover row is missing', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'nodis-'));
  writeState(cwd, '21-09-26-bug', [
    '| Specify+Implement | complete | spec-author delegated, test-author delegated | approved | sha:aaa |',
  ]);
  const r = run(
    cwd,
    writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/stg.sql') }),
  );
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /\(missing\)/);
});

check('refuse model SQL when Discover is complete but not delegated', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'nodel-'));
  writeState(cwd, '21-09-26-bug', [
    '| Discover | complete | discovery | approved | — |',
  ]);
  const r = run(
    cwd,
    writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/stg.sql') }),
  );
  assert.strictEqual(r.status, 2, r.stderr);
});

check('refuse push if spec-author is missing from Specify+Implement', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'nospec-'));
  writeState(cwd, '21-09-26-bug', [
    '| Discover | complete | discovery delegated | approved | sha:aaa |',
    '| Specify+Implement | complete | test-author delegated | approved | sha:bbb |',
    '| Ship | pending | ci-interpreter | — | — |',
  ]);
  const r = run(cwd, writeEvent({ cwd, tool: 'bash', command: 'git push origin HEAD' }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /spec-author/);
});

check('refuse bash redirect that writes a model SQL file before Discover', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'redir-'));
  writeState(cwd, '21-09-26-bug', [
    '| Discover | in-progress | discovery | — | — |',
  ]);
  const r = run(
    cwd,
    writeEvent({
      cwd,
      tool: 'bash',
      command: 'cat > dbt/models/staging/stg_orders.sql <<\'EOF\'\nselect 1\nEOF',
    }),
  );
  assert.strictEqual(r.status, 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
});

check('allow unrelated bash commands', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'ls-'));
  writeState(cwd, '21-09-26-bug', [
    '| Discover | in-progress | discovery | — | — |',
  ]);
  const r = run(cwd, writeEvent({ cwd, tool: 'bash', command: 'ls dbt/models' }));
  assert.strictEqual(r.status, 0, r.stderr);
});

check('do not gate a non-dbt repository that happens to have specs/', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'not-dbt-'));
  fs.mkdirSync(path.join(cwd, 'specs/example'), { recursive: true });
  const r = run(cwd, writeEvent({ cwd, tool: 'bash', command: 'git push origin HEAD' }));
  assert.strictEqual(r.status, 0, r.stderr);
});

// --- Gaps found in the DATA-1820 incident -----------------------------------

check('refuse fabricated Discover row: no recorded run, no recorded approval', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'fake-'));
  writeState(cwd, '28-09-26-fake', [
    '| Discover | complete | discovery delegated | approved | sha:deadbeef |',
  ]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /no recorded run of 'discovery'/);
  assert.match(r.stderr, /has not chosen "Approve and proceed"/);
});

check('refuse evidence sha that is not the sub-agent\'s real output', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'badsha-'));
  writeState(cwd, '28-09-26-x', []);
  const real = observeSubagent(cwd, 'discovery', 'the full findings report');
  observeAnswer(cwd);
  const heading = require('./ledger').sha8('## Findings'); // hashed a short heading
  assert.notStrictEqual(heading, real);
  writeState(cwd, '28-09-26-x', [`| Discover | complete | discovery delegated | approved | sha:${heading} |`]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, new RegExp(`recorded: sha:${real}`));
});

check('refuse complete phase whose Gate was never approved', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'nogate-'));
  realWorkflow(cwd, '28-09-26-x', [['Discover', 'complete', 'discovery', '—']]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /Gate is '—'/);
});

check('refuse implementing while Design awaits approval', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'early-impl-'));
  realWorkflow(cwd, '28-09-26-x', [
    ['Discover', 'complete', 'discovery', 'approved'],
    ['Specify', 'complete', 'spec-author', 'approved'],
    ['Design', 'in-progress', 'spec-author', '—'],
    ['Implement', 'pending', '', '—'],
  ]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /Design must be complete and approved before implementing/);
});

check('refuse more approved gates than real approvals ("Needs changes" is not approval)', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'count-'));
  writeState(cwd, '28-09-26-x', []);
  const d = observeSubagent(cwd, 'discovery');
  const s = observeSubagent(cwd, 'spec-author');
  observeAnswer(cwd, 'Approve and proceed');
  observeAnswer(cwd, 'Needs changes');
  writeState(cwd, '28-09-26-x', [
    `| Discover | complete | discovery delegated | approved | sha:${d} |`,
    `| Specify | complete | spec-author delegated | approved | sha:${s} |`,
    '| Implement | in-progress | test-author | — | — |',
  ]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /Specify: Gate says 'approved' but the user has not chosen/);
});

check('refuse peer review that ran before Validate Output was approved', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'early-review-'));
  realWorkflow(cwd, '28-09-26-x', [
    ['Discover', 'complete', 'discovery', 'approved'],
    ['Implement', 'complete', 'test-author', 'approved'],
    ['Validate Output', 'in-progress', 'output-validator', '—'],
    ['Review', 'pending', 'peer-reviewer', '—'],
  ]);
  observeSubagent(cwd, 'peer-reviewer'); // ran early; the Review row was never updated
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /Review 'peer-reviewer' already ran but earlier phase 'Validate Output'/);
});

check('refuse shipping when a later phase started before an earlier gate', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'seq-ship-'));
  realWorkflow(cwd, '28-09-26-x', [
    ['Discover', 'complete', 'discovery', 'approved'],
    ['Validate Output', 'complete', 'output-validator', '—'],
    ['Review', 'complete', 'peer-reviewer', 'approved'],
    ['Ship', 'pending', '', '—'],
  ]);
  const r = run(cwd, writeEvent({ cwd, tool: 'bash', command: 'git push origin HEAD' }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /Review is 'complete' but earlier phase 'Validate Output'/);
});

check('refuse evidence that cites a file which does not exist', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'nofile-'));
  writeState(cwd, '28-09-26-x', []);
  const d = observeSubagent(cwd, 'discovery');
  observeAnswer(cwd);
  writeState(cwd, '28-09-26-x', [`| Discover | complete | discovery delegated | approved | validation-report.md (22 lines) · sha:${d} |`]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /cites 'validation-report\.md', which does not exist/);
});

check('refuse delegated row with no sha in Evidence', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'nosha-'));
  writeState(cwd, '28-09-26-x', []);
  observeSubagent(cwd, 'discovery');
  observeAnswer(cwd);
  writeState(cwd, '28-09-26-x', ['| Discover | complete | discovery delegated | approved | done |']);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /Evidence has no sha/);
});

check('refuse auto-approved (scheduled) in a session not started in scheduled mode', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'sched-no-'));
  writeState(cwd, '28-09-26-x', []);
  const d = observeSubagent(cwd, 'discovery');
  writeState(cwd, '28-09-26-x', [`| Discover | complete | discovery delegated | auto-approved (scheduled) | sha:${d} |`]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /not started with 'mode: scheduled'/);
});

check('allow auto-approved (scheduled) when the session prompt said mode: scheduled', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'sched-ok-'));
  observe(cwd, { hook_event_name: 'UserPromptSubmit', prompt: 'mode: scheduled. Fix bug DATA-1 ...' });
  writeState(cwd, '28-09-26-x', []);
  const d = observeSubagent(cwd, 'discovery');
  writeState(cwd, '28-09-26-x', [`| Discover | complete | discovery delegated | auto-approved (scheduled) | sha:${d} |`]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 0, r.stderr);
});

check('background sub-agent: sha is issued from the completed agent_output', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'bg-'));
  writeState(cwd, '28-09-26-x', []);
  const id = 'd56de305-2510-46c1-b8a2-ecf2a044b20c';
  observe(cwd, {
    hook_event_name: 'PostToolUse',
    tool_name: 'task',
    tool_input: { description: 'discovery: statsig metric', prompt: 'brief' },
    tool_response: { content: [{ type: 'text', text: `Background agent launched successfully.\n\nagentId: ${id}\n` }] },
  });
  const out = observe(cwd, {
    hook_event_name: 'PostToolUse',
    tool_name: 'agent_output',
    tool_input: { agent_id: id },
    tool_response: { content: [{ type: 'text', text: `Agent: ${id}\nType: generalPurpose\nStatus: completed\n=== Output\nfindings` }] },
  });
  const sha = out.match(/sha:([0-9a-f]{8})/)[1];
  observeAnswer(cwd);
  writeState(cwd, '28-09-26-x', [`| Discover | complete | discovery delegated | approved | sha:${sha} |`]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 0, r.stderr);
});

check('refuse the agent writing the evidence ledger (write tool and bash)', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'ledger-'));
  writeState(cwd, '28-09-26-ledger-guard', []);
  const w = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, '.cortex/spec-driven/ledger.jsonl') }));
  assert.strictEqual(w.status, 2, w.stderr);
  const b = run(cwd, writeEvent({ cwd, tool: 'bash', command: `echo '{}' >> .cortex/spec-driven/ledger.jsonl` }));
  assert.strictEqual(b.status, 2, b.stderr);
  const read = run(cwd, writeEvent({ cwd, tool: 'bash', command: 'cat .cortex/spec-driven/ledger.jsonl' }));
  assert.strictEqual(read.status, 0, read.stderr);
  const listing = run(cwd, writeEvent({ cwd, tool: 'bash', command: 'cd repo && ls .cortex/spec-driven 2>&1 | head' }));
  assert.strictEqual(listing.status, 0, `read-only listing was blocked: ${listing.stderr}`);
  const rm = run(cwd, writeEvent({ cwd, tool: 'bash', command: 'rm -f .cortex/spec-driven/ledger.jsonl' }));
  assert.strictEqual(rm.status, 2, rm.stderr);
  const tee = run(cwd, writeEvent({ cwd, tool: 'bash', command: 'echo x | tee -a .cortex/spec-driven/ledger.jsonl' }));
  assert.strictEqual(tee.status, 2, tee.stderr);
  const gitignore = run(cwd, writeEvent({
    cwd, tool: 'bash',
    command: `printf '.cortex/spec-driven/\\n' >> .gitignore && sed -i '' 's/a/b/' plugin.json`,
  }));
  assert.strictEqual(gitignore.status, 0, `gitignore edit was blocked: ${gitignore.stderr}`);
});

check('observer never blocks, even on garbage input', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'garbage-'));
  observe(cwd, 'not json');
});

// Response shape captured from a real Cortex Desktop session: tool_response is a
// STRING holding JSON '[{"kind":"text","value":"..."}]' — not an array, and not
// { content: [{ text }] }. Captured 30-09-26 via a probe on a live task call.
const desktopShape = (text) => JSON.stringify([{ kind: 'text', value: text }]);

check('desktop shape: the parsed-array variant is also handled', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'desk-array-'));
  const out = observe(cwd, {
    hook_event_name: 'PostToolUse',
    tool_name: 'task',
    tool_input: { description: 'discovery: x', prompt: 'brief' },
    tool_response: [{ kind: 'text', value: 'payload capture' }],
  });
  assert.match(out, new RegExp(`sha:${require('./ledger').sha8('payload capture')}`));
});

check('desktop shape: a real approval is recorded as the answer, not the JSON wrapper', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'desk-approve-'));
  writeState(cwd, '30-09-26-x', []);
  const d = observeSubagent(cwd, 'discovery');
  observe(cwd, {
    hook_event_name: 'PostToolUse',
    tool_name: 'ask_user_question',
    tool_input: { questions: [] },
    tool_response: desktopShape(`User has answered your questions:\n"${'Re-confirming the Discover gate '.repeat(8)}?" = "Approve and proceed"`),
  });
  writeState(cwd, '30-09-26-x', [`| Discover | complete | discovery delegated | approved | sha:${d} |`]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 0, r.stderr);
});

check('desktop shape: sub-agent sha is the hash of its text, not the wrapper', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'desk-sha-'));
  const out = observe(cwd, {
    hook_event_name: 'PostToolUse',
    tool_name: 'task',
    tool_input: { description: 'discovery: x', prompt: 'brief' },
    tool_response: desktopShape('hello from the e2e check'),
  });
  assert.match(out, new RegExp(`sha:${require('./ledger').sha8('hello from the e2e check')}`));
});

check('desktop shape: background sub-agent is recorded when agent_output completes', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'desk-bg-'));
  const id = 'd56de305-2510-46c1-b8a2-ecf2a044b20c';
  observe(cwd, {
    hook_event_name: 'PostToolUse',
    tool_name: 'task',
    tool_input: { description: 'discovery: bg', prompt: 'brief' },
    tool_response: desktopShape(`Background agent launched successfully.\n\nagentId: ${id}\n`),
  });
  const out = observe(cwd, {
    hook_event_name: 'PostToolUse',
    tool_name: 'agent_output',
    tool_input: { agent_id: id },
    tool_response: desktopShape(`Agent: ${id}\nType: Explore\nStatus: completed\n=== Output\nfindings`),
  });
  assert.match(out, /Evidence recorded by hook: discovery output → sha:[0-9a-f]{8}/);
});

check('allow ship when every claim verifies', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'ship-ok-'));
  realWorkflow(cwd, '28-09-26-x', [
    ['Discover', 'complete', 'discovery', 'approved'],
    ['Specify+Implement', 'complete', 'spec-author, test-author', 'approved'],
    ['Validate Output', 'complete', 'output-validator', 'approved'],
    ['Review', 'complete', 'peer-reviewer', 'approved'],
    ['Ship', 'pending', 'ci-interpreter', '—'],
  ]);
  const r = run(cwd, writeEvent({ cwd, tool: 'bash', command: 'git push -u origin HEAD' }));
  assert.strictEqual(r.status, 0, r.stderr);
});

// --- Rework cycles, legacy specs (found by replaying the live DATA-1802 table) --

check('rework: appending a phase row re-opens it; the old cycle stops counting', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'rework-'));
  writeState(cwd, '28-09-26-x', []);
  const d = observeSubagent(cwd, 'discovery'); observeAnswer(cwd);
  const s = observeSubagent(cwd, 'spec-author', 'design v1'); observeAnswer(cwd);
  const t = observeSubagent(cwd, 'test-author', 'impl v1'); observeAnswer(cwd);
  observeSubagent(cwd, 'output-validator', 'REFINE'); observeAnswer(cwd, 'Needs changes');
  const s2 = observeSubagent(cwd, 'spec-author', 'design v2'); observeAnswer(cwd);
  writeState(cwd, '28-09-26-x', [
    `| Discover | complete | discovery delegated | approved | sha:${d} |`,
    `| Design | complete | spec-author delegated | approved | sha:${s} |`,
    `| Implement | complete | test-author delegated | approved | sha:${t} |`,
    '| Validate Output | complete | output-validator delegated | — | REFINE |',
    `| Design | complete | spec-author delegated | approved | sha:${s2} |`,
    '| Implement | in-progress | test-author | — | — |',
    '| Validate Output | pending | output-validator | — | — |',
    '',
    '## Retry Log',
    '| Attempt | Phase | Problem | Action taken | Result |',
    '|---|---|---|---|---|',
    '| 1 | Implement | test failed | fixed | Pending rebuild |',
  ]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 0, r.stderr);
});

check('rework: evidence reused from the superseded cycle is refused', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'stale-'));
  writeState(cwd, '28-09-26-x', []);
  const d = observeSubagent(cwd, 'discovery'); observeAnswer(cwd);
  const s = observeSubagent(cwd, 'spec-author', 'design v1'); observeAnswer(cwd);
  observeAnswer(cwd); // approval that re-opened Design
  writeState(cwd, '28-09-26-x', [
    `| Discover | complete | discovery delegated | approved | sha:${d} |`,
    `| Design | complete | spec-author delegated | approved | sha:${s} |`,
    '| Implement | complete | test-author delegated | approved | sha:00000000 |',
    `| Design | complete | spec-author delegated | approved | sha:${s} |`,
    '| Implement | in-progress | test-author | — | — |',
  ]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /Design: its evidence is not newer than the phases above it/);
});

function legacyTable() {
  return [
    '| Discover | complete | discovery delegated | approved | findings · sha:fdc4b1b4 |',
    '| Specify | complete | spec-author delegated | approved | requirements.md · sha:2e16f05f |',
    '| Implement | in-progress | test-author | — | — |',
  ];
}

check('legacy: in-flight spec is blocked until the user grants it', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'legacy-no-'));
  const dir = writeState(cwd, '24-09-26-inflight', legacyTable());
  fs.writeFileSync(path.join(dir, 'requirements.md'), '# reqs\n');
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 2, r.stderr);
});

check('legacy: user grant covers rows complete+approved at grant time', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'legacy-ok-'));
  const dir = writeState(cwd, '24-09-26-inflight', legacyTable());
  fs.writeFileSync(path.join(dir, 'requirements.md'), '# reqs\n');
  const out = observe(cwd, { hook_event_name: 'UserPromptSubmit', prompt: 'spec-driven: accept legacy evidence for 24-09-26-inflight' });
  assert.match(out, /Discover, Specify/);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 0, r.stderr);
});

check('legacy: a row written or edited after the grant is not covered', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'legacy-edit-'));
  const dir = writeState(cwd, '24-09-26-inflight', legacyTable());
  fs.writeFileSync(path.join(dir, 'requirements.md'), '# reqs\n');
  observe(cwd, { hook_event_name: 'UserPromptSubmit', prompt: 'spec-driven: accept legacy evidence' });
  writeState(cwd, '24-09-26-inflight', [
    ...legacyTable().slice(0, 2),
    '| Implement | complete | test-author delegated | approved | sha:3f077ce8 |',
    '| Validate Output | in-progress | output-validator | — | — |',
  ]);
  const r = run(cwd, writeEvent({ cwd, file_path: path.join(cwd, 'dbt/models/foo.sql') }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /Implement: no recorded run of 'test-author'/);
  assert.doesNotMatch(r.stderr, /Discover:|Specify:/);
});

check('legacy: the agent cannot grant it (only a user prompt records a grant)', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'legacy-agent-'));
  writeState(cwd, '24-09-26-inflight', legacyTable());
  const b = run(cwd, writeEvent({ cwd, tool: 'bash', command: `node -e "require('fs').appendFileSync('.cortex/spec-driven/ledger.jsonl','{}')"` }));
  assert.strictEqual(b.status, 2, b.stderr);
});

// --- Layer direction (AGENTS.md §1) -------------------------------------------

check('refuse intermediate model that refs a mart (the int_experiments → orders case)', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'layer-bad-'));
  dbtProject(cwd);
  realWorkflow(cwd, '28-09-26-x', IMPLEMENTING);
  const r = run(cwd, writeEvent({
    cwd,
    file_path: path.join(cwd, 'dbt/models/intermediate/int_experiments__statsig_user_day.sql'),
    content: "select * from {{ ref('stg_orders') }} join {{ ref('orders') }} using (id)",
  }));
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /int_experiments__statsig_user_day \(intermediate\) refs orders \(marts\)/);
});

check('refuse a downstream ref introduced by an edit', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'layer-edit-'));
  dbtProject(cwd);
  realWorkflow(cwd, '28-09-26-x', IMPLEMENTING);
  const r = run(cwd, {
    tool_name: 'edit',
    cwd,
    tool_input: {
      file_path: path.join(cwd, 'dbt/models/staging/stg_orders.sql'),
      old_string: 'select 1',
      new_string: "select * from {{ ref('int_experiments__statsig_user_day') }}",
    },
  });
  assert.strictEqual(r.status, 2, r.stderr);
  assert.match(r.stderr, /\(staging\) refs int_experiments__statsig_user_day \(intermediate\)/);
});

check('allow a mart that refs intermediate and a seed', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'layer-ok-'));
  dbtProject(cwd);
  realWorkflow(cwd, '28-09-26-x', IMPLEMENTING);
  const r = run(cwd, writeEvent({
    cwd,
    file_path: path.join(cwd, 'dbt/models/marts/orders.sql'),
    content: "select * from {{ ref('int_experiments__statsig_user_day') }} join {{ ref('campaign_eval_labels') }}",
  }));
  assert.strictEqual(r.status, 0, r.stderr);
});

check('layer check fails open without an AGENTS.md profile', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'layer-open-'));
  realWorkflow(cwd, '28-09-26-x', IMPLEMENTING);
  const r = run(cwd, writeEvent({
    cwd,
    file_path: path.join(cwd, 'dbt/models/intermediate/int_x.sql'),
    content: "select * from {{ ref('orders') }}",
  }));
  assert.strictEqual(r.status, 0, r.stderr);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall tests passed');
