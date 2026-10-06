// Checks that every native id, class, attribute and string the piping command line depends on really
// exists in native's own files. The list of what we depend on is test/native-ids.json (committed);
// native's files themselves are saved copies in test/fixtures/native/, which is kept OUT of git on
// purpose (not ours to publish). When those copies are absent the file-dependent tests are skipped
// with a clear message; the coverage tests below still run, because they only need the json.
//
// Where a saved copy and the live page disagree, the live page wins: refetch the fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  PIPE_PAGE_IDS, PIPE_FALLBACK_KEYS, PIPE_TOOL_ALIASES, PIPE_GRAPH_ACTIONS,
  PIPE_FORBIDDEN_BUTTON_IDS, PIPE_FORBIDDEN_CAPTURE_IDS, PIPE_TRADE, DUCT_TRADE,
} from '../src/pipe/pipe-tables.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ids = JSON.parse(fs.readFileSync(path.join(here, 'native-ids.json'), 'utf8'));
const FIXTURE_DIR = path.join(here, 'fixtures', 'native');
const FILES = Object.keys(ids.fixtures);
const missing = FILES.filter((f) => !fs.existsSync(path.join(FIXTURE_DIR, f)));
const SKIP = missing.length
  ? `native fixtures not found (${missing.join(', ')}) in test/fixtures/native/ (kept out of git); `
    + 'refetch them from the live page, see native-ids.json'
  : false;
if (SKIP) console.log(`# native-ids: ${SKIP}`);
const read = (name) => fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ---------- always run: native-ids.json covers everything our tables depend on ---------- */

test('native-ids.json records its source commit and the live check date', () => {
  assert.equal(ids.source, 'constructions-tagger bb2935ac');
  assert.match(ids.checkedLive, /^\d{4}-\d{2}-\d{2}$/);
});

test('every element id the tables and host depend on is listed in native-ids.json', () => {
  const needed = [
    PIPE_PAGE_IDS.root, PIPE_PAGE_IDS.stage, PIPE_PAGE_IDS.nativeBarToggle, PIPE_PAGE_IDS.nativeBarWindow,
    ...PIPE_GRAPH_ACTIONS.map((a) => a.btn),
    ...PIPE_FORBIDDEN_BUTTON_IDS,
  ];
  const listed = new Set(ids.html.ids);
  assert.deepEqual(needed.filter((id) => !listed.has(id)), [], 'missing from native-ids.json html.ids');
});

test('the forbidden capture ids, trade values and rail class names are listed too', () => {
  for (const capture of PIPE_FORBIDDEN_CAPTURE_IDS) {
    assert.ok(ids.html.strings.includes(`data-capture-control-id="${capture}"`), capture);
  }
  assert.ok(ids.html.strings.includes(`data-trade="${PIPE_TRADE}"`));
  assert.ok(Object.keys(ids.tradePackValues).sort().join() === [DUCT_TRADE, PIPE_TRADE].sort().join());
  for (const cls of [PIPE_PAGE_IDS.toolKeyClass, PIPE_PAGE_IDS.toolLabelClass]) {
    assert.ok(ids.entryBundle.strings.includes(cls), cls);
  }
  assert.ok(ids.entryBundle.strings.includes('activeTool'), 'the activeTool read');
});

/* ---------- against native's own files (skipped when the saved copies are absent) ---------- */

test('every listed element id exists in the rendered page', { skip: SKIP }, () => {
  const html = read('graph_session.html');
  assert.deepEqual(ids.html.ids.filter((id) => !html.includes(`id="${id}"`)), []);
});

test('every listed html string exists in the rendered page', { skip: SKIP }, () => {
  const html = read('graph_session.html');
  assert.deepEqual(ids.html.strings.filter((s) => !html.includes(s)), []);
});

test('every listed string exists in native\'s entry bundle (tool rail markup, __graphDebug.activeTool)', { skip: SKIP }, () => {
  const bundle = read('graph-session-entry.js');
  assert.deepEqual(ids.entryBundle.strings.filter((s) => !bundle.includes(s)), []);
});

test('every listed string exists in pipe-session-ui.js', { skip: SKIP }, () => {
  const src = read('pipe-session-ui.js');
  assert.deepEqual(ids.pipeSessionUi.strings.filter((s) => !src.includes(s)), []);
});

test('the saved native files match the commit recorded in native-ids.json (a difference is a note, not a failure: live wins)', { skip: SKIP }, (t) => {
  const differing = [];
  for (const [file, expected] of Object.entries(ids.sha256First16)) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(FIXTURE_DIR, file))).digest('hex').slice(0, 16);
    if (actual !== expected) differing.push(`${file}: saved ${actual}, recorded ${expected}`);
  }
  if (differing.length) t.diagnostic(`fixtures differ from ${ids.source}: ${differing.join('; ')}`);
  assert.ok(true);
});

test('our fallback keys are exactly native\'s PIPE_TOOL_KEYS', { skip: SKIP }, () => {
  const src = stripComments(read('pipe-session-ui.js'));
  const m = src.match(/export const PIPE_TOOL_KEYS = (\{[\s\S]*?\});/);
  assert.ok(m, 'PIPE_TOOL_KEYS literal found');
  const native = vm.runInNewContext('(' + m[1] + ')'); // a plain object literal, evaluated in an empty context
  const normalized = Object.fromEntries(Object.entries(native).map(([k, v]) => [k, String(v).toLowerCase()]));
  assert.deepEqual(PIPE_FALLBACK_KEYS, normalized);
});

test('every tool native supports has a built-in key, and every alias we curate belongs to a real tool', { skip: SKIP }, () => {
  const src = stripComments(read('pipe-session-ui.js'));
  const m = src.match(/const SUPPORTED_TOOLS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(m, 'SUPPORTED_TOOLS literal found');
  const supported = [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
  assert.ok(supported.length >= 14, 'found the supported tool list');
  assert.deepEqual(supported.filter((tool) => !(tool in PIPE_FALLBACK_KEYS)), [], 'supported tool with no built-in key');
  assert.deepEqual(Object.keys(PIPE_TOOL_ALIASES).filter((tool) => !supported.includes(tool)), [], 'alias for a tool native does not support');
});
