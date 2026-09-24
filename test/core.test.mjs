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
import { breakerStep, goSelectDecision, watchEdge, watchShouldFire } from '../src/core/autoselect-core.js';
import {
  walkNextItem, walkAdvanceState, walkFinishVerdict,
  canRecordWalkMemory, hasWalkMemory, selectWalkPrefill,
} from '../src/core/modal-walk-core.js';

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

test('commandBarShouldCapture: synthetic is never captured, even if everything else says yes', () => {
  assert.equal(commandBarShouldCapture({ ...baseCapture, synthetic: true }), false);
});

test('commandBarShouldCapture: digitPassthrough refuses only a single digit', () => {
  assert.equal(commandBarShouldCapture({ ...baseCapture, key: '5', digitPassthrough: true }), false);
  assert.equal(commandBarShouldCapture({ ...baseCapture, key: 'r', digitPassthrough: true }), true);
  assert.equal(commandBarShouldCapture({ ...baseCapture, key: '5', digitPassthrough: false }), true);
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

test('spaceRepeatAction: neither armed nor remembered is a no-op (native\'s own plain behavior)', () => {
  assert.deepEqual(spaceRepeatAction({ query: '', lastTool: null, toolArmed: false }), { action: 'none' });
});

test('spaceRepeatAction: openMenuWhenIdle opens the tool menu instead of no-op', () => {
  assert.deepEqual(
    spaceRepeatAction({ query: '', lastTool: null, toolArmed: false, openMenuWhenIdle: true }),
    { action: 'open-tool-menu' },
  );
});

test('spaceRepeatAction: a forced-select mode wins even with a tool armed or a lastTool to repeat', () => {
  const opts = { forceSelectModes: ['label'], modeActive: 'label' };
  assert.deepEqual(spaceRepeatAction({ query: '', lastTool: 'route', toolArmed: true, ...opts }), { action: 'select' });
  assert.deepEqual(spaceRepeatAction({ query: '', lastTool: 'route', toolArmed: false, ...opts }), { action: 'select' });
});

test('spaceRepeatAction: a forced-select mode that does not match modeActive has no effect', () => {
  assert.deepEqual(
    spaceRepeatAction({ query: '', lastTool: 'route', toolArmed: false, forceSelectModes: ['label'], modeActive: 'crop' }),
    { action: 'repeat', toolId: 'route' },
  );
});

test('spaceRepeatAction: an open modal wins over armed/lastTool, but not over a forced-select mode', () => {
  assert.deepEqual(
    spaceRepeatAction({ query: '', lastTool: 'route', toolArmed: true, modalOpen: true }),
    { action: 'open-modal-menu' },
  );
  assert.deepEqual(
    spaceRepeatAction({ query: '', lastTool: null, toolArmed: false, modalOpen: true, forceSelectModes: ['label'], modeActive: 'label' }),
    { action: 'select' },
  );
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

// ---------- autoselect-core ----------

test('breakerStep: prunes entries older than the window, keeps the just-pushed one', () => {
  const result = breakerStep([1000, 4000], 5000, { max: 5, windowMs: 2000 });
  assert.deepEqual(result, { log: [4000, 5000], tripped: false }); // 1000 is 4000ms old, pruned
});

test('breakerStep: trips once the pruned+pushed count exceeds max', () => {
  const log = [0, 100, 200, 300, 400]; // 5 entries, all within the window
  const result = breakerStep(log, 500, { max: 5, windowMs: 10000 });
  assert.equal(result.log.length, 6);
  assert.equal(result.tripped, true);
});

test('breakerStep: exactly max entries does not trip (strictly greater-than)', () => {
  const result = breakerStep([0, 100, 200, 300], 400, { max: 5, windowMs: 10000 });
  assert.equal(result.log.length, 5);
  assert.equal(result.tripped, false);
});

test('goSelectDecision: a recent auto-trigger suppresses, a deliberate one (bypass) does not', () => {
  const base = { now: 1000, lastSelectAt: 900, suppressMs: 600, atRest: false };
  assert.equal(goSelectDecision({ ...base, bypassSuppression: false }), 'suppress');
  assert.equal(goSelectDecision({ ...base, bypassSuppression: true }), 'dispatch');
});

test('goSelectDecision: already at rest short-circuits to at-rest (once past suppression)', () => {
  assert.equal(
    goSelectDecision({ now: 1000, lastSelectAt: 0, suppressMs: 600, bypassSuppression: false, atRest: true }),
    'at-rest',
  );
});

test('goSelectDecision: otherwise dispatches', () => {
  assert.equal(
    goSelectDecision({ now: 1000, lastSelectAt: 0, suppressMs: 600, bypassSuppression: false, atRest: false }),
    'dispatch',
  );
});

test('watchEdge: undefined is unreadable, a real tool is cleared', () => {
  assert.equal(watchEdge({ cur: undefined, prev: 'route', nullPending: false }), 'unreadable');
  assert.equal(watchEdge({ cur: 'route', prev: null, nullPending: true }), 'cleared');
});

test('watchEdge: a fresh non-null->null transition arms; a repeat null stays pending', () => {
  assert.equal(watchEdge({ cur: null, prev: 'route', nullPending: false }), 'armed');
  assert.equal(watchEdge({ cur: null, prev: null, nullPending: false }), 'idle');
  assert.equal(watchEdge({ cur: null, prev: 'route', nullPending: true }), 'pending');
});

test('watchShouldFire: blocked by a recent user command, mid-typed text, a non-draw mode, or our own mode flag', () => {
  const base = { now: 10000, lastUserCmdAt: 0, userGraceMs: 1000, inputHasText: false, mode: null, drawMode: 'draw', modeActive: null };
  assert.equal(watchShouldFire(base), true);
  assert.equal(watchShouldFire({ ...base, lastUserCmdAt: 9500 }), false);
  assert.equal(watchShouldFire({ ...base, inputHasText: true }), false);
  assert.equal(watchShouldFire({ ...base, mode: 'pan' }), false);
  assert.equal(watchShouldFire({ ...base, mode: 'draw' }), true); // draw mode never blocks
  assert.equal(watchShouldFire({ ...base, modeActive: 'label' }), false);
});

// ---------- modal-walk-core ----------
// The graph host's modal field-walk (branch fitting, change size, GRD,
// riser — see CLAUDE.md's "Modal field-walk"/"Modal walk value memory").

test('walkNextItem: first item not yet in seen, on-screen order', () => {
  const items = [{ param: 'shape' }, { param: 'width' }, { param: 'height' }];
  assert.deepEqual(walkNextItem(items, []), { param: 'shape' });
  assert.deepEqual(walkNextItem(items, ['shape']), { param: 'width' });
  assert.deepEqual(walkNextItem(items, ['shape', 'width']), { param: 'height' });
});

test('walkNextItem: null once every current item has been visited, even with a shorter list than seen implies', () => {
  // A field that disappeared mid-walk (a shape switch hid the secondary size) must not
  // block the walk from finishing — items is always the CURRENT list, seen can be longer.
  assert.equal(walkNextItem([{ param: 'shape' }], ['shape', 'size2']), null);
  assert.equal(walkNextItem([], []), null);
});

test('walkAdvanceState: an applied field increments applied and appends to seen', () => {
  const state = { seen: ['shape'], applied: 1, skipped: 0 };
  assert.deepEqual(
    walkAdvanceState(state, { param: 'width', skip: false }),
    { seen: ['shape', 'width'], applied: 2, skipped: 0 },
  );
});

test('walkAdvanceState: a skipped field increments skipped, not applied, and never mutates the input', () => {
  const state = { seen: [], applied: 0, skipped: 0 };
  const next = walkAdvanceState(state, { param: 'airflow', skip: true });
  assert.deepEqual(next, { seen: ['airflow'], applied: 0, skipped: 1 });
  assert.deepEqual(state, { seen: [], applied: 0, skipped: 0 }); // untouched
});

test('walkFinishVerdict: auto-submit only for a listed tool whose submit button is usable', () => {
  const auto = ['transition', 'grd', 'vertical'];
  assert.equal(walkFinishVerdict('transition', auto, true), 'auto-submit');
  assert.equal(walkFinishVerdict('branch', auto, true), 'manual-prompt'); // branch is never in the list
  assert.equal(walkFinishVerdict('transition', auto, false), 'manual-prompt'); // button not usable right now
});

test('canRecordWalkMemory: off when the hatch is disabled or the tool is skip-listed', () => {
  const skipTools = ['transition', 'grd', 'vertical'];
  assert.equal(canRecordWalkMemory('branch', { enabled: true, skipTools }), true);
  assert.equal(canRecordWalkMemory('branch', { enabled: false, skipTools }), false);
  assert.equal(canRecordWalkMemory('grd', { enabled: true, skipTools }), false);
});

test('hasWalkMemory: only true for a non-skip-listed tool with at least one remembered field', () => {
  const skipTools = ['transition', 'grd', 'vertical'];
  assert.equal(hasWalkMemory({ width: 12 }, 'branch', { enabled: true, skipTools }), true);
  assert.equal(hasWalkMemory({}, 'branch', { enabled: true, skipTools }), false); // nothing remembered
  assert.equal(hasWalkMemory(undefined, 'branch', { enabled: true, skipTools }), false);
  assert.equal(hasWalkMemory({ airflow: 400 }, 'grd', { enabled: true, skipTools }), false); // skip-listed, even with stale memory
  assert.equal(hasWalkMemory({ width: 12 }, 'branch', { enabled: false, skipTools }), false); // hatch off
});

test('selectWalkPrefill: a remembered value that still matches an option highlights it and prefills its text', () => {
  const options = [
    { optionValue: 'round', optionText: 'Round' },
    { optionValue: 'rect', optionText: 'Rectangular' },
  ];
  assert.deepEqual(selectWalkPrefill(options, 'rect', 'round'), { index: 1, prefillText: 'Rectangular' });
});

test('selectWalkPrefill: a remembered value that no longer matches any option falls back to the current value', () => {
  const options = [
    { optionValue: 'round', optionText: 'Round' },
    { optionValue: 'rect', optionText: 'Rectangular' },
  ];
  assert.deepEqual(selectWalkPrefill(options, 'oval', 'round'), { index: 0, prefillText: '' });
});

test('selectWalkPrefill: nothing remembered highlights the current value; an unmatched current falls back to row 0', () => {
  const options = [
    { optionValue: 'round', optionText: 'Round' },
    { optionValue: 'rect', optionText: 'Rectangular' },
  ];
  assert.deepEqual(selectWalkPrefill(options, undefined, 'rect'), { index: 1, prefillText: '' });
  assert.deepEqual(selectWalkPrefill(options, undefined, 'unknown'), { index: 0, prefillText: '' });
  assert.deepEqual(selectWalkPrefill([], undefined, 'unknown'), { index: -1, prefillText: '' });
});
