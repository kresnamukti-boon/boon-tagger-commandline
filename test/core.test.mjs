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
