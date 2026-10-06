// Unit tests for src/core/pipe-table-core.js, run directly against the ES module (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveTools, buildTable, entryState, planEntry, planQuery, listEntries, reconcileArmed, loaderGuard,
} from '../src/core/pipe-table-core.js';
import {
  PIPE_FALLBACK_KEYS, PIPE_TOOL_ALIASES, PIPE_GRAPH_ACTIONS,
  PIPE_FORBIDDEN_BUTTON_IDS, PIPE_FORBIDDEN_CAPTURE_IDS,
} from '../src/pipe/pipe-tables.js';

// The rail as read live on 2026-10-06 (single-line, 1D).
const RAIL = [
  ['select', 'S', 'Select'], ['route', 'R', 'Route pipe'], ['extend', 'X', 'Extend pipe'],
  ['terminate', 'P', 'Terminate end'], ['transition', 'N', 'Change size'], ['cut', 'U', 'Split run'],
  ['split-run', 'K', 'Split run (no fitting)'], ['valve', 'V', 'Valve'], ['fixture', 'F', 'Fixture'],
  ['equipment', 'Q', 'Equipment'], ['fitting', 'G', 'Place fitting'], ['vertical', 'Z', 'Riser'],
  ['service', 'A', 'Assign system'], ['evidence', 'D', 'Evidence'],
].map(([id, key, label]) => ({ id, key, label }));

const derive = (railTools = RAIL, extra = {}) => deriveTools({
  railTools, fallbackKeys: PIPE_FALLBACK_KEYS, curatedAliases: PIPE_TOOL_ALIASES, actions: PIPE_GRAPH_ACTIONS, ...extra,
});

test('deriveTools: every rail tool becomes an entry, in rail order, named by its id', () => {
  const { tools, info } = derive();
  assert.deepEqual(tools.map((t) => t.name), RAIL.map((r) => r.id));
  assert.equal(info.source, 'toolbar');
  assert.deepEqual(info.skipped, []);
  assert.deepEqual(info.aliasDropped, []);
  assert.equal(tools.find((t) => t.name === 'fitting').label, 'Place fitting');
});

test('deriveTools: the key badge is the first alias, curated aliases follow', () => {
  const { tools } = derive();
  assert.deepEqual(tools.find((t) => t.name === 'transition').aliases, ['n', 'size', 'changesize']);
  assert.deepEqual(tools.find((t) => t.name === 'fitting').aliases, ['g']);
});

test('deriveTools: the badge wins over the built-in key (piping reuses duct ids under other keys)', () => {
  const rail = [{ id: 'cut', key: 'C', label: 'Cut' }, { id: 'select', key: 'S', label: 'Select' }];
  const { tools } = derive(rail);
  assert.equal(tools.find((t) => t.name === 'cut').key, 'c');
});

test('deriveTools: a button with no badge falls back to the built-in key and says so', () => {
  const { tools, info } = derive([{ id: 'fitting', key: '', label: 'Place fitting' }]);
  assert.equal(tools[0].key, 'g');
  assert.ok(info.skipped.some((s) => s.startsWith('fitting: no key badge, used built-in "g"')));
});

test('deriveTools: no badge and no built-in key keeps the tool, reachable by name', () => {
  const { tools, info } = derive([{ id: 'mystery', key: null, label: 'Mystery' }]);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].key, null);
  assert.deepEqual(tools[0].aliases, []);
  assert.ok(info.skipped.some((s) => s.includes('mystery') && s.includes('name only')));
});

test('deriveTools: a duplicate key keeps both tools but only the first owns the key', () => {
  const rail = [{ id: 'route', key: 'r', label: 'Route pipe' }, { id: 'riser2', key: 'R', label: 'Riser 2' }];
  const { tools, info } = derive(rail);
  assert.equal(tools[0].key, 'r');
  assert.equal(tools[1].key, null);
  assert.equal(tools.length, 2);
  assert.ok(info.skipped.some((s) => s.includes('riser2') && s.includes('already taken')));
});

test('deriveTools: a duplicate data-tool is skipped and reported', () => {
  const { tools, info } = derive([{ id: 'route', key: 'r', label: 'a' }, { id: 'ROUTE', key: 'x', label: 'b' }]);
  assert.equal(tools.length, 1);
  assert.ok(info.skipped.some((s) => s.includes('duplicate data-tool')));
});

test('deriveTools: an alias that clashes with an action token is dropped (fit stays zoomfit\'s)', () => {
  const { tools, info } = derive(RAIL, { curatedAliases: { fitting: ['fit', 'fitting2'] } });
  assert.deepEqual(tools.find((t) => t.name === 'fitting').aliases, ['g', 'fitting2']);
  assert.ok(info.aliasDropped.some((s) => s.includes('"fit"') && s.includes('action')));
});

test('deriveTools: an alias that equals another tool\'s name is dropped', () => {
  const { tools, info } = derive(RAIL, { curatedAliases: { route: ['valve'] } });
  assert.ok(!tools.find((t) => t.name === 'route').aliases.includes('valve'));
  assert.ok(info.aliasDropped.some((s) => s.includes('route: "valve"')));
});

test('deriveTools: a curated alias can never take another tool\'s key letter', () => {
  const { tools, info } = derive(RAIL, { curatedAliases: { route: ['g'] } });
  assert.ok(!tools.find((t) => t.name === 'route').aliases.slice(1).includes('g'));
  assert.deepEqual(tools.find((t) => t.name === 'fitting').aliases, ['g']);
  assert.ok(info.aliasDropped.some((s) => s.includes('route: "g"')));
});

test('deriveTools: an action named like a new tool is reported as shadowed (the tool wins)', () => {
  const { info } = derive([{ id: 'ruler', key: 'm', label: 'Ruler' }]);
  assert.ok(info.shadowedActions.some((r) => r.action === 'ruler'));
});

test('deriveTools: an empty or missing rail yields no tools and source "none"', () => {
  assert.equal(derive([]).info.source, 'none');
  assert.equal(deriveTools({}).tools.length, 0);
  assert.equal(deriveTools({}).info.source, 'none');
});

test('the real tables produce no dropped aliases and no collisions on the live rail', () => {
  const { tools, info } = derive();
  assert.deepEqual(info.aliasDropped, []);
  assert.deepEqual(info.shadowedActions, []);
  const tokens = tools.flatMap((t) => [t.name, ...t.aliases]).concat(PIPE_GRAPH_ACTIONS.flatMap((a) => [a.name, ...a.aliases]));
  assert.equal(new Set(tokens).size, tokens.length, 'every command token is unique');
});

test('buildTable: tools first, then actions marked kind:"action"', () => {
  const { tools } = derive();
  const table = buildTable(tools, PIPE_GRAPH_ACTIONS);
  assert.equal(table.length, tools.length + PIPE_GRAPH_ACTIONS.length);
  assert.equal(table[0].name, 'select');
  assert.ok(table.slice(tools.length).every((e) => e.kind === 'action'));
});

const okTarget = { exists: true, disabled: false, ariaDisabled: 'false', visible: true, title: 'Place fitting', id: '', captureId: 'tool-fitting' };
const guards = { forbiddenIds: PIPE_FORBIDDEN_BUTTON_IDS, forbiddenCaptureIds: PIPE_FORBIDDEN_CAPTURE_IDS };
const toolEntry = { id: 'fitting', name: 'fitting', kind: 'tool', label: 'Place fitting', aliases: ['g'] };
const undo = { ...PIPE_GRAPH_ACTIONS[0], kind: 'action' };

test('entryState: an enabled, visible control is usable', () => {
  assert.deepEqual(entryState(toolEntry, okTarget, guards), { usable: true, forbidden: false, reason: null });
});

test('entryState: a disabled tool reports native\'s own title as the reason', () => {
  const s = entryState(toolEntry, { ...okTarget, disabled: true, title: 'Enter a positive diameter before placing piping.' }, guards);
  assert.equal(s.usable, false);
  assert.equal(s.reason, 'Enter a positive diameter before placing piping.');
});

test('entryState: a disabled tool whose title is just its label gets the generic reason', () => {
  const s = entryState(toolEntry, { ...okTarget, disabled: true }, guards);
  assert.equal(s.reason, 'disabled right now');
});

test('entryState: aria-disabled counts as disabled', () => {
  assert.equal(entryState(toolEntry, { ...okTarget, ariaDisabled: 'true' }, guards).usable, false);
  assert.equal(entryState(toolEntry, { ...okTarget, ariaDisabled: true }, guards).usable, false);
});

test('entryState: a disabled action never borrows its tooltip as a reason', () => {
  const s = entryState(undo, { ...okTarget, disabled: true, title: 'Undo graph command' }, guards);
  assert.equal(s.reason, 'disabled right now');
});

test('entryState: a hidden or missing control is not usable', () => {
  assert.equal(entryState(toolEntry, { ...okTarget, visible: false }, guards).reason, 'hidden right now');
  assert.equal(entryState(toolEntry, null, guards).reason, 'not on this page');
  assert.equal(entryState(toolEntry, { exists: false }, guards).usable, false);
});

test('entryState: forbidden by the entry\'s own button id, even with a perfectly clickable target', () => {
  const save = { id: 'save', name: 'save', kind: 'action', label: 'Save', aliases: [], btn: 'graph-save-commands' };
  const s = entryState(save, { ...okTarget, id: 'graph-save-commands' }, guards);
  assert.equal(s.forbidden, true);
  assert.equal(s.usable, false);
});

test('entryState: forbidden by the entry\'s own btn alone, whatever element id the page reports', () => {
  // Independent of the element-identity check: the table entry itself names a forbidden control.
  const save = { id: 'save', name: 'save', kind: 'action', label: 'Save', aliases: [], btn: 'graph-save-commands' };
  const s = entryState(save, { ...okTarget, id: 'some-other-id', captureId: '' }, guards);
  assert.equal(s.forbidden, true);
  assert.equal(s.usable, false);
  // and even when nothing at all was found for it
  assert.equal(entryState(save, null, guards).forbidden, true);
});

test('entryState: forbidden by the element actually found, not only by what the table says', () => {
  const sneaky = { id: 'x', name: 'x', kind: 'action', label: 'X', aliases: [], btn: 'graph-zoom-fit' };
  assert.equal(entryState(sneaky, { ...okTarget, id: 'graph-recording-stop' }, guards).forbidden, true);
  assert.equal(entryState(sneaky, { ...okTarget, id: '', captureId: 'submit-graph' }, guards).forbidden, true);
});

test('entryState: every forbidden id and the submit capture id is refused', () => {
  for (const id of PIPE_FORBIDDEN_BUTTON_IDS) {
    const entry = { id: 'a', name: 'a', kind: 'action', label: 'A', aliases: [], btn: id };
    assert.equal(entryState(entry, { ...okTarget, id }, guards).forbidden, true, id);
  }
  const entry = { id: 'a', name: 'a', kind: 'action', label: 'A', aliases: [], btn: 'something' };
  assert.equal(entryState(entry, { ...okTarget, id: '', captureId: 'submit-graph' }, guards).forbidden, true);
});

test('planEntry: usable -> click; unusable -> a status naming the reason; forbidden -> refuse', () => {
  assert.equal(planEntry(toolEntry, { usable: true, forbidden: false, reason: null }).action, 'click');
  const status = planEntry(toolEntry, { usable: false, forbidden: false, reason: 'disabled right now' });
  assert.deepEqual(status, { action: 'status', message: 'Place fitting: disabled right now' });
  assert.equal(planEntry(toolEntry, { usable: false, forbidden: false, reason: null }).message, "Place fitting isn't available right now");
  assert.equal(planEntry(toolEntry, { usable: false, forbidden: true, reason: null }).action, 'refuse');
});

test('planQuery: resolves by name, label and alias; never by prefix; unknown is a status', () => {
  const { tools } = derive();
  const table = buildTable(tools, PIPE_GRAPH_ACTIONS);
  const yes = () => ({ usable: true, forbidden: false, reason: null });
  assert.equal(planQuery(table, 'fitting', yes).entry.name, 'fitting');
  assert.equal(planQuery(table, 'Place fitting', yes).entry.name, 'fitting');
  assert.equal(planQuery(table, 'g', yes).entry.name, 'fitting');
  assert.equal(planQuery(table, 'fit', yes).entry.name, 'zoomfit');
  assert.equal(planQuery(table, 'fitt', yes).action, 'status');
  assert.equal(planQuery(table, '   ', yes).action, 'status');
  assert.match(planQuery(table, 'bogus', yes).message, /unknown command: bogus/);
});

test('listEntries: a disabled tool stays listed, an unusable action is omitted', () => {
  const { tools } = derive();
  const table = buildTable(tools, PIPE_GRAPH_ACTIONS);
  const stateFor = (e) => (e.name === 'fitting' || e.name === 'redo'
    ? { usable: false, forbidden: false, reason: 'x' } : { usable: true, forbidden: false, reason: null });
  const names = listEntries(table, stateFor).map((r) => r.entry.name);
  assert.ok(names.includes('fitting'));
  assert.ok(!names.includes('redo'));
  assert.ok(names.includes('undo'));
});

test('reconcileArmed: own record wins inside the grace window, live read corrects drift after it', () => {
  const own = { armed: true, tool: 'route' };
  assert.deepEqual(reconcileArmed({ own, live: 'select', sinceLastCmdMs: 200 }), own);
  assert.deepEqual(reconcileArmed({ own, live: 'select', sinceLastCmdMs: 5000 }), { armed: false, tool: null });
  assert.deepEqual(reconcileArmed({ own, live: 'fitting', sinceLastCmdMs: 5000 }), { armed: true, tool: 'fitting' });
  assert.deepEqual(reconcileArmed({ own: { armed: false, tool: null }, live: 'Valve', sinceLastCmdMs: 5000 }), { armed: true, tool: 'valve' });
});

test('reconcileArmed: an unreadable live tool fails toward our own record', () => {
  const own = { armed: true, tool: 'route' };
  assert.deepEqual(reconcileArmed({ own, live: undefined, sinceLastCmdMs: 9999 }), own);
  assert.deepEqual(reconcileArmed({ own, live: null, sinceLastCmdMs: 9999 }), own);
  assert.deepEqual(reconcileArmed({ own: undefined, live: undefined, sinceLastCmdMs: 9999 }), { armed: false, tool: null });
});

const goodFacts = { hasRoot: true, trade: 'piping', hasStage: true, railToolCount: 14, nativeBarOn: false, ductLoaderInstalled: false };

test('loaderGuard: starts on a ready piping page with native\'s bar off', () => {
  assert.deepEqual(loaderGuard(goodFacts), { ok: true, message: '' });
});

test('loaderGuard: refuses a duct page, naming the right loader', () => {
  const g = loaderGuard({ ...goodFacts, trade: 'ductwork' });
  assert.equal(g.ok, false);
  assert.match(g.message, /ductwork/);
  assert.match(g.message, /duct command line loader/);
});

test('loaderGuard: refuses when it is not a graph page at all', () => {
  assert.equal(loaderGuard({ ...goodFacts, hasRoot: false, trade: undefined }).ok, false);
});

test('loaderGuard: refuses while native\'s own command line is on, and says how to turn it off', () => {
  const g = loaderGuard({ ...goodFacts, nativeBarOn: true });
  assert.equal(g.ok, false);
  assert.match(g.message, /switched ON/);
});

test('loaderGuard: refuses when the duct command line already loaded here', () => {
  const g = loaderGuard({ ...goodFacts, ductLoaderInstalled: true });
  assert.equal(g.ok, false);
  assert.match(g.message, /Reload the page/);
});

test('loaderGuard: refuses when the page is not ready (no stage or no tool rail)', () => {
  assert.equal(loaderGuard({ ...goodFacts, hasStage: false }).ok, false);
  assert.equal(loaderGuard({ ...goodFacts, railToolCount: 0 }).ok, false);
});

test('entryState: anything with a forbidden text or inside a forbidden container is refused, even if it is clickable', () => {
  const cfg = { forbiddenTexts: ['resize anyway'], forbiddenContainerIds: ['graph-toast-stack'] };
  const target = { exists: true, disabled: false, visible: true, id: '', captureId: '', text: 'Resize anyway', ancestorIds: [] };
  assert.equal(entryState({ kind: 'action', name: 'x', btn: 'b' }, target, cfg).forbidden, true);
  assert.equal(entryState({ kind: 'action', name: 'x', btn: 'b' }, { ...target, text: 'Zoom', ancestorIds: ['graph-toast-stack'] }, cfg).forbidden, true);
  assert.equal(entryState({ kind: 'action', name: 'x', btn: 'b' }, { ...target, text: 'Zoom' }, cfg).usable, true);
});

test('listEntries: the adjust command is listed only while it can be used (like an action)', () => {
  const table = buildTable(derive().tools, PIPE_GRAPH_ACTIONS).concat([{ id: 'adjust', name: 'adjust', label: 'Adjust ports', aliases: ['ports', 'adj'], kind: 'adjust' }]);
  const rows = (usable) => listEntries(table, (e) => (e.kind === 'adjust' ? { usable, forbidden: false, reason: 'no' } : { usable: true, forbidden: false, reason: null })).map((r) => r.entry.name);
  assert.ok(!rows(false).includes('adjust'));
  assert.ok(rows(true).includes('adjust'));
});
