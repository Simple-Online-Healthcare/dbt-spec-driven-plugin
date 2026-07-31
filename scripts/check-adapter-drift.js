#!/usr/bin/env node
// Fail if generated host adapters have drifted from the canonical templates.
//
// Adapter templates contain the {{PLUGIN_ROOT}} token. The install script renders that
// token into the generated copies, so this checker re-renders the templates using the
// PLUGIN_ROOT recorded in .cursor/.adapter-meta before comparing.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pluginDir = fs.realpathSync(path.resolve(__dirname, '..'));

function resolveTarget() {
  const fromArg = process.argv[2];
  if (fromArg) return fs.realpathSync(path.resolve(fromArg));
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    return fs.realpathSync(top);
  } catch {
    return fs.realpathSync(process.cwd());
  }
}

const targetRoot = resolveTarget();
const metaPath = path.join(targetRoot, '.cursor', '.adapter-meta');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function listFiles(dir) {
  const results = [];
  (function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) results.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  })(dir);
  return results.sort();
}

function render(templateFile, pluginRoot) {
  return read(templateFile).split('{{PLUGIN_ROOT}}').join(pluginRoot);
}

const failures = [];

function compareFile(templateRel, generatedAbs, pluginRoot, label) {
  const templateAbs = path.join(pluginDir, templateRel);
  if (!fs.existsSync(templateAbs)) {
    failures.push(`missing template: ${templateRel}`);
    return;
  }
  if (!fs.existsSync(generatedAbs)) {
    failures.push(`missing generated adapter: ${label}`);
    return;
  }
  if (render(templateAbs, pluginRoot) !== read(generatedAbs)) {
    failures.push(`${label} drifted from ${templateRel}`);
  }
}

function checkCursor() {
  const generatedDir = path.join(targetRoot, '.cursor');
  if (!fs.existsSync(generatedDir)) {
    console.log('No .cursor/ adapters installed — skipping Cursor drift check.');
    return;
  }
  if (!fs.existsSync(metaPath)) {
    failures.push('.cursor/ exists but .cursor/.adapter-meta is missing — run install-agent-adapters.sh cursor');
    return;
  }
  const meta = read(metaPath);
  const match = meta.match(/^PLUGIN_ROOT=(.*)$/m);
  if (!match) {
    failures.push('.cursor/.adapter-meta has no PLUGIN_ROOT entry — run install-agent-adapters.sh cursor');
    return;
  }
  const pluginRoot = match[1].trim();

  const templateDir = path.join(pluginDir, 'adapters', 'cursor');
  const templates = listFiles(templateDir);
  const generated = listFiles(generatedDir).filter((f) => f !== '.adapter-meta');
  const templateSet = new Set(templates);

  for (const rel of templates) {
    compareFile(path.join('adapters', 'cursor', rel), path.join(generatedDir, rel), pluginRoot, `.cursor/${rel}`);
  }
  for (const rel of generated) {
    if (!templateSet.has(rel)) {
      failures.push(`.cursor/${rel} has no template in adapters/cursor`);
    }
  }
}

function checkVscode() {
  const generated = path.join(targetRoot, '.github', 'copilot-instructions.md');
  if (!fs.existsSync(generated)) {
    console.log('No .github/copilot-instructions.md installed — skipping VS Code drift check.');
    return;
  }
  // The VS Code adapter is a single file, so derive PLUGIN_ROOT from the cursor meta when
  // present; otherwise fall back to the plugin's own relative path.
  let pluginRoot = path.relative(targetRoot, pluginDir);
  if (fs.existsSync(metaPath)) {
    const match = read(metaPath).match(/^PLUGIN_ROOT=(.*)$/m);
    if (match) pluginRoot = match[1].trim();
  }
  compareFile(
    path.join('adapters', 'vscode', 'copilot-instructions.md'),
    generated,
    pluginRoot,
    '.github/copilot-instructions.md',
  );
}

checkCursor();
checkVscode();

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error('Run scripts/install-agent-adapters.sh all and commit the synced adapter files.');
  process.exit(1);
}

console.log('Adapter copies match canonical templates.');
