// Tests for scripts/check-native-drift.js (the read-only drift check).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PIPE_FALLBACK_KEYS, PIPE_HINT_PREFIXES } from '../src/pipe/pipe-tables.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const require = createRequire(import.meta.url);
const drift = require('../scripts/check-native-drift.js');
const ids = JSON.parse(fs.readFileSync(path.join(here, 'native-ids.json'), 'utf8'));

test('the drift script is read-only: no write, delete, copy, spawn or POST anywhere in its source', () => {
  const src = drift.stripComments(fs.readFileSync(path.join(ROOT, 'scripts', 'check-native-drift.js'), 'utf8'));
  for (const bad of [/writeFile/, /appendFile/, /createWriteStream/, /mkdir/, /\brm\(/, /rmSync/, /unlink/, /rename(Sync)?\(/, /copyFile/, /truncate/, /child_process/, /spawn/, /exec\(/, /method:\s*['"](?!GET)/i, /\bPOST\b/, /\bPUT\b/, /\bDELETE\b/]) {
    assert.ok(!bad.test(src), 'must not contain ' + bad);
  }
  assert.match(src, /method: 'GET'/);
});

test('parseToolKeys / parseSupportedTools read native\'s own literals', () => {
  const src = `// c\nexport const PIPE_TOOL_KEYS = { select: 's', route: 'R', 'split-run': 'k' };\nconst SUPPORTED_TOOLS = new Set(['select', 'route', 'split-run']);`;
  assert.deepEqual(drift.parseToolKeys(src), { select: 's', route: 'r', 'split-run': 'k' });
  assert.deepEqual(drift.parseSupportedTools(src), ['select', 'route', 'split-run']);
  assert.equal(drift.parseToolKeys('nothing here'), null);
  assert.equal(drift.parseSupportedTools('nothing here'), null);
});

test('compareTools: added, removed, key changed, and a rename is recognised by its key', () => {
  const ours = { select: 's', route: 'r', extend: 'x' };
  const live = { select: 's', route: 'q', pipe: 'x', fresh: 'f' };
  const t = drift.compareTools({ ourKeys: ours, liveKeys: live, liveSupported: ['select', 'route', 'pipe'] });
  assert.deepEqual(t.added.map((a) => a.id).sort(), ['fresh', 'pipe']);
  assert.deepEqual(t.removed.map((a) => a.id), ['extend']);
  assert.deepEqual(t.keyChanged, [{ id: 'route', was: 'r', now: 'q' }]);
  assert.deepEqual(t.renamed, [{ from: 'extend', to: 'pipe', key: 'x' }]);
  assert.deepEqual(t.notInKeys, []);
  assert.equal(drift.compareTools({ ourKeys: ours, liveKeys: null }).unreadable, true);
  assert.deepEqual(drift.compareTools({ ourKeys: ours, liveKeys: ours, liveSupported: ['select'] }).unsupported, ['route', 'extend']);
});

test('compareHints: a reworded opening is "gone", a brand-new sentence is "added", appended suffixes are ignored', () => {
  const base = (hint) => `const readyHint = 'Finish inserts this fitting.';\nbboxHint.textContent = phase === 'box' ? 'Click two opposite corners around it.' : phase === 'label' ? '${hint}' : phase === 'ports' ? \`Click the detected intersection for \${x}.\` : phase === 'ready' ? readyHint : 'Saving pipe and fitting…';\nbboxHint.textContent += ' Diameter 2" auto-matched.';\n`;
  const known = { ...PIPE_HINT_PREFIXES, ready: ['Finish inserts this fitting.'] };
  assert.deepEqual(drift.compareHints(base('Choose the fitting subtype.'), known), { gone: [], added: [] });
  const changed = drift.compareHints(base('Pick the subtype now.'), known);
  assert.deepEqual(changed.gone, ['Choose the fitting subtype.']);
  assert.deepEqual(changed.added, ['Pick the subtype now.']);
});

test('missingStrings / similarNames: find what disappeared and suggest what it may be called now', () => {
  assert.deepEqual(drift.missingStrings(['aa', 'bb', 'cc'], 'xx aa cc'), ['bb']);
  const html = '<div id="graph-pipe-fitting-menu"></div><div id="graph-other-thing"></div>';
  assert.deepEqual(drift.similarNames('graph-pipe-fitting-select-menu', html), ['graph-pipe-fitting-menu']);
  assert.deepEqual(drift.similarNames('graph-zzz-qqq', html), []);
});

test('lineDiff: lines added and removed, ignoring blank lines and indentation', () => {
  const d = drift.lineDiff('a\n  b\n\nc\n', 'a\nb2\nc\nd\n');
  assert.deepEqual(d.removed, ['b']);
  assert.deepEqual(d.added.sort(), ['b2', 'd']);
  assert.deepEqual(drift.lineDiff('x\nx\n', 'x\n').removed, ['x']);
});

test('compareFamilies: added, removed, and a tool missing from the dump', () => {
  const f = drift.compareFamilies({ fitting: ['a', 'b'], fixture: ['w'] }, { fitting: ['b', 'c'] });
  assert.deepEqual(f.fitting, { added: ['c'], removed: ['a'], missingTool: false });
  assert.deepEqual(f.fixture, { added: [], removed: ['w'], missingTool: true });
});

test('native-ids.json records the families we observed (39 fitting, the 9 fixtures)', () => {
  assert.equal(ids.families.fitting.length, 39);
  assert.deepEqual(ids.families.fixture, ['pipe-wc', 'pipe-lav', 'pipe-sh', 'pipe-ur', 'pipe-ks', 'pipe-ms', 'pipe-hb', 'pipe-fd', 'pipe-rd']);
});

// A synthetic copy of native's files that contains everything we rely on, built only from our own records.
function syntheticDir({ drop = [], rename = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-'));
  const keys = Object.entries(PIPE_FALLBACK_KEYS).map(([k, v]) => `'${k}': '${v}'`).join(', ');
  const tools = Object.keys(PIPE_FALLBACK_KEYS).map((k) => `'${k}'`).join(', ');
  const hints = `const readyHint = 'Finish inserts this fitting.';\nconst more = ['Pick a different diameter — a transition must change size.', 'Enter the new diameter above, then Finish.', \`From \${a} → to \${b}.\`];\nbboxHint.textContent = a ? 'Click two opposite corners around it.' : b ? 'Choose the fitting subtype.' : c ? \`Click the detected intersection for \${x}.\` : d ? readyHint : 'Saving pipe and fitting…';\n`;
  const strip = (arr) => arr.filter((s) => !drop.includes(s)).map((s) => rename[s] ?? s);
  const ui = `${ids.pipeSessionUi.strings.join('\n')}\n${hints}\nexport const PIPE_TOOL_KEYS = { ${keys} };\nconst SUPPORTED_TOOLS = new Set([${tools}]);\n`;
  const uiOut = strip(ids.pipeSessionUi.strings).join('\n') + `\n${hints}\nexport const PIPE_TOOL_KEYS = { ${keys} };\nconst SUPPORTED_TOOLS = new Set([${tools}]);\n`;
  void ui;
  fs.writeFileSync(path.join(dir, 'pipe-session-ui.js'), uiOut);
  for (const f of ['pipe-bbox-connect.js', 'pipe-diameter.js', 'pipe-command-line.js']) fs.writeFileSync(path.join(dir, f), '// x\n');
  fs.writeFileSync(path.join(dir, 'graph-session-entry.js'), ids.entryBundle.strings.join('\n'));
  return dir;
}

test('buildReport on a synthetic native that matches our records: no tool, string or hint drift', async () => {
  const dir = syntheticDir();
  const { text } = await drift.buildReport({ base: 'x', fromDir: dir, savedDir: null });
  assert.match(text, /tools[\s\S]*no change/);
  assert.match(text, /pipe-session-ui.js: all \d+ strings found/);
  assert.match(text, /all known hints present, no new ones/);
  assert.ok(!/new tool|is gone|not found/.test(text), text);
});

test('buildReport names a missing string and what it may have been renamed to; and a removed tool', async () => {
  const gone = "subtypeMenu.id = 'graph-pipe-fitting-select-menu'";
  const dir = syntheticDir({ rename: { [gone]: "subtypeMenu.id = 'graph-pipe-fitting-choice-menu'" } });
  const src = fs.readFileSync(path.join(dir, 'pipe-session-ui.js'), 'utf8').replace(/'route': 'r', /, '');
  fs.writeFileSync(path.join(dir, 'pipe-session-ui.js'), src);
  const { text, drift: n } = await drift.buildReport({ base: 'x', fromDir: dir, savedDir: null });
  assert.ok(n >= 2);
  assert.ok(text.includes(`"${gone}" not found`), text);
  assert.match(text, /similar now: graph-pipe-fitting-choice-menu/);
  assert.match(text, /tool "route" \(key r\) is gone/);
});

test('buildReport reports an unreadable folder as errors, not as "no drift"', async () => {
  const { errors, text } = await drift.buildReport({ base: 'x', fromDir: path.join(os.tmpdir(), 'does-not-exist-drift'), savedDir: null });
  assert.ok(errors.length >= 5);
  assert.match(text, /could not read/);
});
