// Tests for scripts/dist-fresh.js: freshness of a built file is decided by content, never by file times.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { builtFileFresh, ductFresh, pipeFresh, norm } = require('../scripts/dist-fresh.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-'));

test('the committed duct and piping builds are fresh (a rebuild is byte-identical)', () => {
  assert.deepEqual(ductFresh(), { fresh: true, reason: '' });
  assert.deepEqual(pipeFresh(), { fresh: true, reason: '' });
});

test('file times do not matter: a built file with a very old or very new mtime is still fresh (the fresh-clone case)', () => {
  const file = path.join(tmp(), 'out.js');
  fs.writeFileSync(file, 'built text\n');
  for (const when of [new Date('2001-01-01'), new Date(Date.now() + 86400000)]) {
    fs.utimesSync(file, when, when);
    assert.equal(builtFileFresh({ file, build: () => 'built text\n', hint: 'x' }).fresh, true, String(when));
  }
});

test('content does matter: one changed character, a missing file, or a build that cannot run is not fresh', () => {
  const file = path.join(tmp(), 'out.js');
  fs.writeFileSync(file, 'built text\n');
  const changed = builtFileFresh({ file, build: () => 'built text!\n', hint: 'rebuild it' });
  assert.equal(changed.fresh, false);
  assert.match(changed.reason, /does not match what its sources build to: rebuild it/);
  const missing = builtFileFresh({ file: path.join(path.dirname(file), 'nope.js'), build: () => '', hint: 'rebuild it' });
  assert.equal(missing.fresh, false);
  assert.match(missing.reason, /is missing: rebuild it/);
  const broken = builtFileFresh({ file, build: () => { throw new Error('boom'); }, hint: 'x' });
  assert.equal(broken.fresh, false);
  assert.match(broken.reason, /could not rebuild .* boom/);
});

test('line endings: a CRLF checkout of the same content is fresh', () => {
  const file = path.join(tmp(), 'out.js');
  fs.writeFileSync(file, 'a\r\nb\r\n');
  assert.equal(builtFileFresh({ file, build: () => 'a\nb\n', hint: 'x' }).fresh, true);
  assert.equal(norm('a\r\nb'), 'a\nb');
});

test('the check writes nothing: it reads the file and rebuilds in memory', () => {
  const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'dist-fresh.js'), 'utf8')
    .replace(/\/\/.*$/gm, '');
  for (const bad of [/writeFile/, /appendFile/, /mkdir/, /unlink/, /rmSync/, /rename/, /copyFile/, /child_process/]) {
    assert.ok(!bad.test(src), String(bad));
  }
});
