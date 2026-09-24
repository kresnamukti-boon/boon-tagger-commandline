// Guards the one property that makes src/core/ and src/features/ portable
// to the graph host's own native command line at all (see PORTING.md and
// CLAUDE.md's "Restructure in progress"): every fact a module needs from a
// live page — a DOM node, a global, a stored value — must arrive as an
// injected argument, never be reached for directly. A module that fails
// this can't go upstream as a drop-in file replacement, because native has
// none of this project's own globals (`RW`, `window.__RWhost`, ...) and a
// different DOM shape entirely.
//
// Checked two ways: no import out of src/hosts, src/console or src/ui (the
// injection/host-wiring layers), and no direct reference to document/window/
// RW/localStorage in the module's own source. The second check is a plain
// substring/regex scan, not a parser — deliberately conservative, so it
// can't be fooled by a module merely mentioning one of these words in a
// comment without ever touching the live page (checked against a real
// module below).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PURE_DIRS = ['src/core', 'src/features'];
const FORBIDDEN_IMPORT_DIRS = ['src/hosts', 'src/console', 'src/ui'];
// Matched as whole identifiers (word boundaries), not substrings — so a
// param named e.g. `windowMs` (autoselect-core.js's own suppression window)
// or a comment mentioning "the RW namespace" doesn't false-positive.
const FORBIDDEN_IDENTIFIERS = [/\bdocument\b/, /\bwindow\b/, /\bRW\./, /\blocalStorage\b/];

function listPureFiles() {
  const files = [];
  for (const dir of PURE_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).sort()) {
      if (name.endsWith('.js')) files.push(path.join(dir, name));
    }
  }
  return files;
}

// Strips // and /* */ comments before scanning for forbidden identifiers,
// so a module's own doc comments (which frequently explain what native's
// DOM/globals look like, by name) don't trip the guard — only real code
// touching document/window/RW/localStorage should.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

test('every src/core and src/features module avoids DOM/host globals in its own code', () => {
  const offenders = [];
  for (const rel of listPureFiles()) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const code = stripComments(src);
    for (const pattern of FORBIDDEN_IDENTIFIERS) {
      if (pattern.test(code)) offenders.push(`${rel} matches ${pattern}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('every src/core and src/features module imports only from its own dirs, never from a host/wiring layer', () => {
  const offenders = [];
  for (const rel of listPureFiles()) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const importPaths = [...src.matchAll(/^import\s+.*?from\s+['"](.+?)['"]/gm)].map((m) => m[1]);
    for (const imp of importPaths) {
      const resolved = path.normalize(path.join(path.dirname(rel), imp));
      if (FORBIDDEN_IMPORT_DIRS.some((dir) => resolved.startsWith(dir + path.sep) || resolved === dir)) {
        offenders.push(`${rel} imports ${imp}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('sanity: listPureFiles actually found every module under src/core and src/features', () => {
  const files = listPureFiles();
  assert.ok(files.length >= 8, `expected at least 8 pure modules, found ${files.length}`);
  assert.ok(files.includes('src/core/modal-walk-core.js'));
  assert.ok(files.includes('src/features/actions.js'));
});
