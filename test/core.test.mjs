// Unit tests for the pure, DOM-free modules under src/core/ — run directly
// against those ES modules (`node --test`), not against the built
// dist/rw_cmdline.js the way verify_cmdline.js does. Complements, never
// replaces, verify_cmdline.js: that harness is still this project's only
// safety net for anything DOM/host-shaped (see CLAUDE.md's "Build / verify
// commands").
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchCommands,
  resolveCommand,
  commandDispatch,
  commandBarShouldCapture,
  spaceRepeatAction,
} from '../src/core/command-line-core.js';
import { labelWords, paramMatchesQuery, parseBoolish, matchOption, parseAndClampNumber } from '../src/core/settings-core.js';
import { isolationEscapes } from '../src/core/isolation-core.js';
import { matchTags } from '../src/core/search-core.js';
import { shadowedActions } from '../src/core/table-core.js';

// ---------- matchCommands ----------
// Pins the ranking documented in command-line-core.js's own header, which
// mirrors the host app's native module (read live via opencli): exact
// name/label=0, exact alias=1, name/label prefix=2, alias prefix=3,
// name/label substring=4, stable-sorted by rank.

test('matchCommands: empty query returns the whole table, unranked', () => {
  const table = [{ name: 'route' }, { name: 'select' }];
  assert.deepEqual(matchCommands(table, ''), table);
  assert.deepEqual(matchCommands(table, '   '), table);
});

test('matchCommands: ranks exact name above prefix above substring', () => {
  const exact = { name: 'cut' };
  const prefix = { name: 'cutaway' };
  const substring = { name: 'shortcut' };
  const ranked = matchCommands([substring, prefix, exact], 'cut');
  assert.deepEqual(ranked, [exact, prefix, substring]);
});

test('matchCommands: an exact alias outranks a name/label prefix', () => {
  const aliasExact = { name: 'transition', aliases: ['t'] };
  const namePrefix = { name: 'ttool' };
  assert.deepEqual(matchCommands([namePrefix, aliasExact], 't'), [aliasExact, namePrefix]);
});

test('matchCommands: label is checked alongside name at every rank', () => {
  const byLabel = { name: 'grd', label: 'Assign system' };
  assert.deepEqual(matchCommands([byLabel], 'assign system'), [byLabel]);
  assert.deepEqual(matchCommands([byLabel], 'assign'), [byLabel]);
});

test('matchCommands: missing label/aliases fall back to name/[] (null-tolerance)', () => {
  const bare = { name: 'select' };
  assert.deepEqual(matchCommands([bare], 'select'), [bare]);
  assert.deepEqual(matchCommands([bare], 'sel'), [bare]);
  assert.deepEqual(matchCommands([bare], 'zzz'), []);
});

test('matchCommands: no match returns an empty list', () => {
  assert.deepEqual(matchCommands([{ name: 'route' }], 'zzz'), []);
});

// ---------- resolveCommand ----------

test('resolveCommand: exact name, then exact label, then exact alias', () => {
  const byName = { name: 'route' };
  assert.equal(resolveCommand([byName], 'route'), byName);
  const byLabel = { name: 'grd', label: 'Assign system' };
  assert.equal(resolveCommand([byLabel], 'assign system'), byLabel);
  const byAlias = { name: 'route', aliases: ['duct'] };
  assert.equal(resolveCommand([byAlias], 'duct'), byAlias);
});

test('resolveCommand: a bare prefix does not resolve (Enter/Space require an exact match)', () => {
  assert.equal(resolveCommand([{ name: 'route' }], 'rou'), null);
});

test('resolveCommand: empty query or no match returns null', () => {
  assert.equal(resolveCommand([{ name: 'route' }], ''), null);
  assert.equal(resolveCommand([{ name: 'route' }], 'zzz'), null);
});

// ---------- commandDispatch ----------

test('commandDispatch: unknown command reports status, not activate', () => {
  const result = commandDispatch([], 'zzz', { toolDisabled: () => false, blocker: () => null });
  assert.deepEqual(result, { action: 'status', message: 'unknown command: zzz' });
});

test('commandDispatch: a disabled tool refuses before the blocker even runs', () => {
  let blockerCalled = false;
  const result = commandDispatch(
    [{ name: 'route', id: 'route', label: 'Route duct' }],
    'route',
    { toolDisabled: () => true, blocker: () => { blockerCalled = true; return null; } },
  );
  assert.equal(result.action, 'status');
  assert.match(result.message, /Route duct/);
  assert.equal(blockerCalled, false);
});

test('commandDispatch: a blocker message refuses activation', () => {
  const result = commandDispatch(
    [{ name: 'route', id: 'route' }],
    'route',
    { toolDisabled: () => false, blocker: () => 'pick a system first' },
  );
  assert.deepEqual(result, { action: 'status', message: 'pick a system first' });
});

test('commandDispatch: activates when nothing refuses it', () => {
  const result = commandDispatch(
    [{ name: 'route', id: 'route' }],
    'route',
    { toolDisabled: () => false, blocker: () => null },
  );
  assert.deepEqual(result, { action: 'activate', toolId: 'route' });
});

// ---------- commandBarShouldCapture ----------

const baseCapture = { key: 'r', ctrlKey: false, metaKey: false, altKey: false, typingInFormField: false, dialogOpen: false, enabled: true };

test('commandBarShouldCapture: captures a bare printable key when enabled', () => {
  assert.equal(commandBarShouldCapture(baseCapture), true);
});

test('commandBarShouldCapture: refuses when disabled, dialog-open, typing, or modified', () => {
  assert.equal(commandBarShouldCapture({ ...baseCapture, enabled: false }), false);
  assert.equal(commandBarShouldCapture({ ...baseCapture, dialogOpen: true }), false);
  assert.equal(commandBarShouldCapture({ ...baseCapture, typingInFormField: true }), false);
  assert.equal(commandBarShouldCapture({ ...baseCapture, ctrlKey: true }), false);
  assert.equal(commandBarShouldCapture({ ...baseCapture, metaKey: true }), false);
  assert.equal(commandBarShouldCapture({ ...baseCapture, altKey: true }), false);
});

test('commandBarShouldCapture: refuses a non-printable or multi-char key', () => {
  assert.equal(commandBarShouldCapture({ ...baseCapture, key: 'ArrowDown' }), false);
  assert.equal(commandBarShouldCapture({ ...baseCapture, key: '' }), false);
});

test('commandBarShouldCapture: keyReserved exempts exactly the one letter it names', () => {
  const keyReserved = (k) => k.toLowerCase() === 'm';
  assert.equal(commandBarShouldCapture({ ...baseCapture, key: 'm', keyReserved }), false);
  assert.equal(commandBarShouldCapture({ ...baseCapture, key: 'r', keyReserved }), true);
});

// ---------- spaceRepeatAction ----------

test('spaceRepeatAction: a non-empty query means Space is just a keystroke', () => {
  assert.deepEqual(spaceRepeatAction({ query: 'ro', lastTool: 'route', toolArmed: true }), { action: 'none' });
});

test('spaceRepeatAction: a tool armed on an empty bar closes to select', () => {
  assert.deepEqual(spaceRepeatAction({ query: '', lastTool: 'route', toolArmed: true }), { action: 'select' });
});

test('spaceRepeatAction: nothing armed but a remembered tool repeats it', () => {
  assert.deepEqual(spaceRepeatAction({ query: '', lastTool: 'route', toolArmed: false }), { action: 'repeat', toolId: 'route' });
});

test('spaceRepeatAction: neither armed nor remembered is a no-op', () => {
  assert.deepEqual(spaceRepeatAction({ query: '', lastTool: null, toolArmed: false }), { action: 'none' });
});

// ---------- settings-core ----------

test('labelWords: splits on non-alphanumerics, drops empties, lowercases', () => {
  assert.deepEqual(labelWords('Width (in)'), ['width', 'in']);
  assert.deepEqual(labelWords('System / network'), ['system', 'network']);
  assert.deepEqual(labelWords(''), []);
  assert.deepEqual(labelWords(null), []);
});

test('paramMatchesQuery: matches by param-name prefix or any label word prefix', () => {
  const item = { param: 'width-input', label: 'Diameter (in)' };
  assert.equal(paramMatchesQuery(item, 'width'), true);
  assert.equal(paramMatchesQuery(item, 'diameter'), true);
  assert.equal(paramMatchesQuery(item, 'in'), true); // second label word
  assert.equal(paramMatchesQuery(item, 'zzz'), false);
  assert.equal(paramMatchesQuery(item, ''), true);
});

test('parseBoolish: accepts on/off spellings case-insensitively, else null', () => {
  for (const v of ['on', 'TRUE', '1', 'Yes']) assert.equal(parseBoolish(v), true);
  for (const v of ['off', 'FALSE', '0', 'No']) assert.equal(parseBoolish(v), false);
  assert.equal(parseBoolish('maybe'), null);
});

test('matchOption: exact 1-based index wins over text/value', () => {
  const options = [{ index: 1, value: 'a', text: 'Alpha' }, { index: 2, value: 'b', text: 'Beta' }];
  assert.deepEqual(matchOption(options, '2'), options[1]);
});

test('matchOption: exact text/value beats a prefix match', () => {
  const options = [{ index: 1, value: 'b', text: 'Beta' }, { index: 2, value: 'be', text: 'Be' }];
  assert.deepEqual(matchOption(options, 'be'), options[1]); // exact text match, not the Beta prefix
});

test('matchOption: falls back to a text prefix match, else null', () => {
  const options = [{ index: 1, value: 'b', text: 'Beta' }];
  assert.deepEqual(matchOption(options, 'Bet'), options[0]);
  assert.equal(matchOption(options, 'zzz'), null);
});

test('parseAndClampNumber: clamps to min/max, rejects non-numeric', () => {
  assert.deepEqual(parseAndClampNumber('5', '0', '10'), { ok: true, value: 5 });
  assert.deepEqual(parseAndClampNumber('-3', '0', '10'), { ok: true, value: 0 });
  assert.deepEqual(parseAndClampNumber('99', '0', '10'), { ok: true, value: 10 });
  assert.deepEqual(parseAndClampNumber('abc', '0', '10'), { ok: false });
});

test('parseAndClampNumber: "" or null min/max means no bound', () => {
  assert.deepEqual(parseAndClampNumber('5', '', null), { ok: true, value: 5 });
});

// ---------- isolation-core ----------

const isNativeTool = (e) => e.kind === 'native';
const allowedNames = ['select', 'finish', 'cancel', 'dimension'];

test('isolationEscapes: a native tool escapes isolation when no modal is open', () => {
  assert.equal(isolationEscapes({ name: 'flex', kind: 'native' }, false, { isNativeTool, allowedNames }), true);
});

test('isolationEscapes: a native tool does NOT escape while a modal is open, unless it is in the allowed list', () => {
  assert.equal(isolationEscapes({ name: 'flex', kind: 'native' }, true, { isNativeTool, allowedNames }), false);
  assert.equal(isolationEscapes({ name: 'select', kind: 'native' }, true, { isNativeTool, allowedNames }), true);
});

test('isolationEscapes: a non-tool action escapes only via the allowed list', () => {
  assert.equal(isolationEscapes({ name: 'dimension', kind: 'action' }, false, { isNativeTool, allowedNames }), true);
  assert.equal(isolationEscapes({ name: 'undo', kind: 'action' }, false, { isNativeTool, allowedNames }), false);
});

// ---------- search-core ----------

test('matchTags: empty query keeps the original list order', () => {
  const list = [{ name: 'Zeta' }, { name: 'Alpha' }];
  assert.deepEqual(matchTags(list, ''), [{ tag: list[0], idx: 0 }, { tag: list[1], idx: 1 }]);
});

test('matchTags: exact name outranks a prefix, which outranks a substring', () => {
  const exact = { name: 'duct' };
  const prefix = { name: 'ductwork' };
  const substring = { name: 'air duct' };
  const ranked = matchTags([substring, prefix, exact], 'duct');
  assert.deepEqual(ranked.map((r) => r.tag), [exact, prefix, substring]);
});

test('matchTags: no match returns an empty list', () => {
  assert.deepEqual(matchTags([{ name: 'duct' }], 'zzz'), []);
});

// ---------- table-core ----------

test('shadowedActions: a tool name shadows a same-named action, which stays reachable by its other tokens', () => {
  const tools = [{ name: 'evidence' }];
  const actions = [{ name: 'evidence', aliases: ['attach'] }];
  assert.deepEqual(shadowedActions(tools, actions), [
    { action: 'evidence', shadowed: ['evidence'], reachableAs: ['attach'] },
  ]);
});

test('shadowedActions: no clash means no row', () => {
  const tools = [{ name: 'route' }];
  const actions = [{ name: 'undo', aliases: [] }];
  assert.deepEqual(shadowedActions(tools, actions), []);
});
