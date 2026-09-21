#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'require-delegation.js');

function run(cwd, event, env = {}) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd,
    env: { ...process.env, ...env },
    input: JSON.stringify(event),
    encoding: 'utf8',
  });
  return result;
}

function writeState(root, name, rows) {
  const dir = path.join(root, 'dbt/specs', name);
  fs.mkdirSync(dir, { recursive: true });
  const header = [
    '| Phase | Status | Sub-agent | Gate | Evidence |',
    '|-------|--------|-----------|------|----------|',
  ];
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), [...header, ...rows, ''].join('\n'));
  return dir;
}

function writeEvent({ tool = 'write', file_path, command, cwd }) {
  return {
    tool_name: tool,
    cwd,
    tool_input: file_path ? { file_path } : { command },
  };
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

check('allow model SQL after Discover is complete and delegated', () => {
  const cwd = fs.mkdtempSync(path.join(tmp, 'ok-'));
  writeState(cwd, '21-09-26-bug', [
    '| Discover | complete | discovery delegated | approved | sha:abc12345 |',
  ]);
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

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall tests passed');
