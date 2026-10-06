// Shape and safety checks on the piping data tables (src/pipe/pipe-tables.js). Whether the ids in
// them exist in native is checked separately, against native's own files, in native-ids.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIPE_TRADE, DUCT_TRADE, PIPE_PAGE_IDS, PIPE_FALLBACK_KEYS, PIPE_TOOL_ALIASES, PIPE_GRAPH_ACTIONS,
  PIPE_FORBIDDEN_BUTTON_IDS, PIPE_FORBIDDEN_CAPTURE_IDS, PIPE_ISOLATION_ALLOWED,
} from '../src/pipe/pipe-tables.js';

test('trade values: piping and ductwork (the two TradePack values)', () => {
  assert.equal(PIPE_TRADE, 'piping');
  assert.equal(DUCT_TRADE, 'ductwork');
});

test('every action has the native entry shape: id === name, label, aliases array, btn', () => {
  for (const a of PIPE_GRAPH_ACTIONS) {
    assert.equal(a.id, a.name);
    assert.equal(typeof a.label, 'string');
    assert.ok(Array.isArray(a.aliases), `${a.name} has an aliases array`);
    assert.match(a.btn, /^graph-[a-z-]+$/);
  }
});

test('the Step 1 action set is exactly undo, redo, zoomfit, zoomin, zoomout, ruler, components', () => {
  assert.deepEqual(PIPE_GRAPH_ACTIONS.map((a) => a.name), ['undo', 'redo', 'zoomfit', 'zoomin', 'zoomout', 'ruler', 'components']);
});

test('action names and aliases are unique across the whole table', () => {
  const tokens = PIPE_GRAPH_ACTIONS.flatMap((a) => [a.name, ...a.aliases]);
  assert.equal(new Set(tokens).size, tokens.length);
  const btns = PIPE_GRAPH_ACTIONS.map((a) => a.btn);
  assert.equal(new Set(btns).size, btns.length);
});

test('zoomfit keeps the "fit" alias', () => {
  assert.ok(PIPE_GRAPH_ACTIONS.find((a) => a.name === 'zoomfit').aliases.includes('fit'));
});

test('no action points at a forbidden control', () => {
  for (const a of PIPE_GRAPH_ACTIONS) assert.ok(!PIPE_FORBIDDEN_BUTTON_IDS.includes(a.btn), a.name);
});

test('the forbidden set covers save, recording, submit, system management, and Finish/Cancel', () => {
  for (const id of [
    'graph-save-commands', 'graph-recording-configure', 'graph-recording-pause', 'graph-recording-resume',
    'graph-recording-stop', 'graph-recording-start', 'graph-submission-blocked-force', 'graph-import-systems',
    'graph-create-system', 'graph-rename-system', 'graph-assign-network', 'graph-finish-route', 'graph-cancel-route',
  ]) assert.ok(PIPE_FORBIDDEN_BUTTON_IDS.includes(id), id);
  assert.deepEqual(PIPE_FORBIDDEN_CAPTURE_IDS, ['submit-graph']);
});

test('tool aliases only name tools that have a built-in key, and never a key letter or an action token', () => {
  const actionTokens = new Set(PIPE_GRAPH_ACTIONS.flatMap((a) => [a.name, ...a.aliases]));
  const keys = new Set(Object.values(PIPE_FALLBACK_KEYS));
  for (const [tool, aliases] of Object.entries(PIPE_TOOL_ALIASES)) {
    assert.ok(tool in PIPE_FALLBACK_KEYS, `${tool} is a known piping tool`);
    for (const alias of aliases) {
      assert.ok(!actionTokens.has(alias), `${alias} clashes with an action`);
      assert.ok(!keys.has(alias), `${alias} clashes with a key letter`);
      assert.ok(!(alias in PIPE_FALLBACK_KEYS), `${alias} clashes with a tool name`);
    }
  }
  const allAliases = Object.values(PIPE_TOOL_ALIASES).flat();
  assert.equal(new Set(allAliases).size, allAliases.length, 'tool aliases are unique');
});

test('fallback keys are single unique lowercase characters', () => {
  const keys = Object.values(PIPE_FALLBACK_KEYS);
  assert.ok(keys.every((k) => /^[a-z]$/.test(k)));
  assert.equal(new Set(keys).size, keys.length);
});

test('isolation-allowed names are real commands or select', () => {
  const names = new Set(['select', ...PIPE_GRAPH_ACTIONS.map((a) => a.name)]);
  for (const n of PIPE_ISOLATION_ALLOWED) assert.ok(names.has(n), n);
});

test('page ids look like what the host layer expects', () => {
  assert.equal(PIPE_PAGE_IDS.root, 'graph-session-root');
  assert.equal(PIPE_PAGE_IDS.stage, 'graph-canvas-stage');
  assert.equal(PIPE_PAGE_IDS.toolSelector, '[data-tool]');
});
