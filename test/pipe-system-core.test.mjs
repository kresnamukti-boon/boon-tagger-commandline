// Unit tests for src/core/pipe-system-core.js (`#` system search on the piping page).
import test from 'node:test';
import assert from 'node:assert/strict';
import { systemsFromOptions, matchSystems, systemPickVerdict, systemQuery } from '../src/core/pipe-system-core.js';

const OPTIONS = [
  { value: '', text: 'Choose a system' }, { value: 's1', text: '1 - Cold Water (domestic)' },
  { value: 's2', text: '2 - Sanitary (waste)' }, { value: 's3', text: '3 - Cold Water Riser (domestic)' },
];

test('systemsFromOptions: skips the blank placeholder, keeps the page order', () => {
  assert.deepEqual(systemsFromOptions(OPTIONS).map((s) => s.id), ['s1', 's2', 's3']);
  assert.deepEqual(systemsFromOptions(undefined), []);
  assert.deepEqual(systemsFromOptions([{ value: 'x', text: '  ' }]), [{ id: 'x', name: 'x' }]);
});

test('matchSystems: empty keeps every system, otherwise ranked (exact, prefix, substring)', () => {
  const systems = systemsFromOptions(OPTIONS);
  assert.equal(matchSystems(systems, '').length, 3);
  assert.deepEqual(matchSystems(systems, 'san').map((s) => s.id), ['s2']);
  assert.deepEqual(matchSystems(systems, 'cold').map((s) => s.id), ['s1', 's3']);
  assert.deepEqual(matchSystems(systems, '2 - san').map((s) => s.id), ['s2']);
  assert.deepEqual(matchSystems(systems, 'zzz'), []);
});

test('systemPickVerdict: only when found, enabled, the selection is readable and nothing is selected', () => {
  const ok = { found: true, disabled: false, selectionReadable: true, selectedEntityId: null };
  assert.equal(systemPickVerdict(ok).ok, true);
  assert.equal(systemPickVerdict({ ...ok, found: false }).ok, false);
  assert.equal(systemPickVerdict({ ...ok, disabled: true }).ok, false);
  const unreadable = systemPickVerdict({ ...ok, selectionReadable: false });
  assert.equal(unreadable.ok, false);
  assert.match(unreadable.message, /could not tell/);
  const selected = systemPickVerdict({ ...ok, selectedEntityId: 'pipe-1' });
  assert.equal(selected.ok, false);
  assert.match(selected.message, /reassign it/);
  assert.equal(systemPickVerdict(undefined).ok, false, 'no facts at all: fail closed');
  assert.equal(systemPickVerdict({}).ok, false);
});

test('systemQuery: only text that starts with # is a system query', () => {
  assert.equal(systemQuery('#'), '');
  assert.equal(systemQuery('#cold'), 'cold');
  assert.equal(systemQuery('cold'), null);
  assert.equal(systemQuery(' #x'), null);
  assert.equal(systemQuery(undefined), null);
});
