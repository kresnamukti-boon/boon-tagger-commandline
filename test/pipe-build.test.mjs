// Guards the separation between the duct build and the piping build: the duct bundle must never
// pick up a pipe-*.js module (that would change duct's shipped bytes), and the piping bundle must
// contain only what it needs (nothing duct-only).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const duct = require('../scripts/build-dist.js');
const pipe = require('../scripts/build-pipe-dist.js');

test('the duct build lists no pipe-* module, even though pipe-*.js files exist in src/', () => {
  const onDisk = fs.readdirSync(path.join(ROOT, 'src', 'core')).filter((n) => n.startsWith('pipe-'));
  assert.ok(onDisk.length > 0, 'sanity: src/core has a pipe-* module for this test to guard against');
  const listed = duct.listModuleFiles();
  assert.deepEqual(listed.filter((f) => path.basename(f).startsWith('pipe-')), []);
});

test('the duct bundle contains nothing from the piping build', () => {
  const { source } = duct.buildDist();
  assert.ok(!source.includes('__m_pipe_'), 'no piping module block');
  assert.ok(!source.includes('rw-pipe-'), 'no piping DOM ids');
});

test('the piping bundle is exactly the piping modules plus their shared pure helpers', () => {
  const { modules } = pipe.buildPipeDist();
  assert.deepEqual(modules.map((m) => path.basename(m, '.js')).sort(),
    ['actions', 'command-line-core', 'pipe-host', 'pipe-log-core', 'pipe-placement-core', 'pipe-system-core', 'pipe-table-core', 'pipe-tables', 'search-core', 'table-core']);
});

test('the piping bundle pulls in nothing duct-only (walk, settings, isolation, auto-select)', () => {
  const { source } = pipe.buildPipeDist();
  for (const name of ['modal_walk_core', 'settings_core', 'isolation_core', 'autoselect_core']) {
    assert.ok(!source.includes('__m_' + name), name);
  }
  assert.ok(!source.includes('rw-cmd-input'), 'does not contain the duct bar');
});

test('the piping shell does not import from or refer to the duct shell', () => {
  const shell = fs.readFileSync(path.join(ROOT, 'src', 'pipe', 'pipe-shell.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // code only; comments may name the duct shell
  assert.ok(!/console\/shell/.test(shell));
  assert.ok(!/__m_(modal_walk|settings|isolation|autoselect|search)_core/.test(shell));
});
