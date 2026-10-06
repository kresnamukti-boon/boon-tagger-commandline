#!/usr/bin/env node
// Builds dist/rw_pipe_cmdline.js, the piping command line, the same way build-dist.js builds the
// duct one: ES modules wrapped as `const __m_<name> = (function(){...})()` in dependency order,
// then the plain-script shell appended verbatim. Starts from the piping entry modules and pulls in
// only what they (transitively) import, so nothing duct-only ends up in the piping bundle, and
// build-dist.js (which skips pipe-*.js) never sees any of this.
//
// Reuses build-dist.js's own parser and sorter (read-only); changes nothing about the duct build.
'use strict';
const fs = require('fs');
const path = require('path');
const { parseModule, topoSort } = require('./build-dist.js');

const ROOT = path.join(__dirname, '..');
const ENTRY_MODULES = [
  'src/pipe/pipe-tables.js',
  'src/pipe/pipe-host.js',
  'src/core/pipe-table-core.js',
  'src/core/pipe-placement-core.js',
  'src/core/pipe-system-core.js',
];
const SEARCH_DIRS = ['src/core', 'src/features', 'src/pipe'];
const SHELL_PATH = 'src/pipe/pipe-shell.js';
const OUT_PATH = 'dist/rw_pipe_cmdline.js';

function findModule(base) {
  for (const dir of SEARCH_DIRS) {
    const rel = path.join(dir, base + '.js');
    if (fs.existsSync(path.join(ROOT, rel))) return rel;
  }
  throw new Error(`piping build: cannot find module "${base}" in ${SEARCH_DIRS.join(', ')}`);
}

function modVarFor(basename) {
  return '__m_' + basename.replace(/[^A-Za-z0-9]/g, '_');
}

function collect() {
  const byBase = new Map();
  const queue = ENTRY_MODULES.slice();
  while (queue.length) {
    const rel = queue.shift();
    const base = path.basename(rel, '.js');
    if (byBase.has(base)) continue;
    const mod = parseModule(rel);
    byBase.set(base, mod);
    for (const dep of mod.deps) if (!byBase.has(dep)) queue.push(findModule(dep));
  }
  return Array.from(byBase.values());
}

function buildPipeDist() {
  const ordered = topoSort(collect());
  const blocks = ordered.map((m) => (
    `// ===== ${m.relPath} =====\nconst ${modVarFor(m.base)} = (function(){\n${m.body}\nreturn {${m.exportNames.join(', ')}};\n})();`
  ));
  const shell = fs.readFileSync(path.join(ROOT, SHELL_PATH), 'utf8');
  blocks.push(`// ===== ${SHELL_PATH} =====\n${shell}`);
  return { source: blocks.join('\n\n'), moduleCount: ordered.length, modules: ordered.map((m) => m.relPath) };
}

if (require.main === module) {
  const { source, moduleCount, modules } = buildPipeDist();
  const outAbs = path.join(ROOT, OUT_PATH);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, source);
  console.log(`built ${OUT_PATH} (${source.length} bytes, ${moduleCount} modules + shell: ${modules.map((m) => path.basename(m, '.js')).join(', ')})`);
}

module.exports = { buildPipeDist, ENTRY_MODULES, OUT_PATH };
