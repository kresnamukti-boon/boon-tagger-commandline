// Unit tests for src/core/pipe-setting-core.js (Step 5: diameter, dsource, material, msource).
import test from 'node:test';
import assert from 'node:assert/strict';
import { settingVerdict, optionMatch, diameterPlan, readbackVerdict, optionRowText } from '../src/core/pipe-setting-core.js';
import { listEntries, planQuery, buildTable } from '../src/core/pipe-table-core.js';
import { PIPE_SETTING_ENTRIES, PIPE_SETTING_IDS, PIPE_TOOL_ALIASES, PIPE_GRAPH_ACTIONS, PIPE_FALLBACK_KEYS, PIPE_ADJUST_ENTRY, PIPE_ISOLATION_ALLOWED } from '../src/pipe/pipe-tables.js';

const OK = { label: 'Material', found: true, visible: true, disabled: false, panelOpen: false, selectionReadable: true, selectedEntityId: null };

test('settingVerdict: only with the control usable, no fitting panel, and nothing selected', () => {
  assert.equal(settingVerdict(OK).ok, true);
  const no = (over, reason) => {
    const v = settingVerdict({ ...OK, ...over });
    assert.equal(v.ok, false, reason);
    assert.equal(v.reason, reason);
    assert.match(v.message, /^Material: /);
    return v;
  };
  no({ found: false }, 'missing');
  no({ visible: false }, 'hidden');
  no({ disabled: true }, 'disabled');
  no({ panelOpen: true }, 'placement');
  no({ selectionReadable: false }, 'selection-unreadable');
  const sel = no({ selectedEntityId: 'pipe-1' }, 'selected');
  assert.match(sel.message, /Esc to deselect/);
  assert.match(sel.message, /later step/);
  no({ sourceUnresolved: true }, 'unresolved');
  assert.equal(settingVerdict(undefined).ok, false, 'no facts at all: fail closed');
  assert.equal(settingVerdict({}).ok, false);
  assert.equal(settingVerdict({ ...OK, selectionReadable: undefined }).ok, false, 'an unknown readability is not readable');
});

const MAT = [{ value: '', text: 'Choose' }, { value: 'pvc', text: 'PVC' }, { value: 'copper', text: 'Copper' }, { value: 'cast_iron', text: 'Cast iron' }, { value: 'copper_l', text: 'Copper L' }];

test('optionMatch: row number, exact, unique prefix, unique substring; ambiguous and empty are refused', () => {
  assert.equal(optionMatch(MAT, '2').option.value, 'pvc');
  assert.equal(optionMatch(MAT, 'PVC').option.value, 'pvc');
  assert.equal(optionMatch(MAT, 'cast_iron').option.value, 'cast_iron');
  assert.equal(optionMatch(MAT, 'cast').option.value, 'cast_iron');
  assert.equal(optionMatch(MAT, 'iron').option.value, 'cast_iron', 'a unique substring');
  assert.equal(optionMatch(MAT, 'copper').option.value, 'copper', 'an exact text wins over a longer prefix match');
  const amb = optionMatch(MAT, 'cop L');
  assert.equal(amb.ok, false);
  assert.equal(optionMatch(MAT, 'co').ok, false, 'two prefix matches: ambiguous');
  assert.match(optionMatch(MAT, 'co').message, /several/);
  assert.match(optionMatch(MAT, 'zzz').message, /no option matches/);
  assert.equal(optionMatch(MAT, '').ok, false);
  assert.equal(optionMatch(MAT, '99').ok, false, 'a row number past the end is not a match');
  assert.equal(optionMatch(undefined, 'x').ok, false);
});

const DIA = ['', '0.5', '0.75', '1', '1.5', '2', '2.5', '3', '4', 'custom'];

test('diameterPlan: a standard size picks the option, anything else picks Custom, bad input is refused', () => {
  assert.deepEqual(diameterPlan('2-1/2', DIA), { ok: true, value: 2.5, mode: 'select', selectValue: '2.5' });
  assert.deepEqual(diameterPlan('3"', DIA), { ok: true, value: 3, mode: 'select', selectValue: '3' });
  assert.deepEqual(diameterPlan('1.75', DIA), { ok: true, value: 1.75, mode: 'custom', customText: '1-3/4' });
  assert.equal(diameterPlan('2.3', DIA).customText, '2.3');
  assert.equal(diameterPlan('abc', DIA).ok, false);
  assert.equal(diameterPlan('0.1', DIA).ok, false, 'below 3/8');
  assert.equal(diameterPlan('49', DIA).ok, false, 'above 48');
  assert.equal(diameterPlan('', DIA).ok, false);
});

test('readbackVerdict: compares what we wrote with what the controls hold', () => {
  assert.equal(readbackVerdict({ mode: 'select', selectValue: 'copper' }, { selectValue: 'copper' }).ok, true);
  assert.equal(readbackVerdict({ mode: 'select', selectValue: 'copper' }, { selectValue: 'pvc' }).ok, false);
  assert.equal(readbackVerdict({ mode: 'custom', customText: '1-3/4' }, { selectValue: 'custom', customValue: '1.75' }).ok, true, 'same size in another spelling');
  assert.equal(readbackVerdict({ mode: 'custom', customText: '1-3/4' }, { selectValue: '2', customValue: '1-3/4' }).ok, false, 'select no longer on Custom');
  assert.equal(readbackVerdict({ mode: 'custom', customText: '1-3/4' }, { selectValue: 'custom', customValue: '2' }).ok, false);
  assert.equal(readbackVerdict(undefined, {}).ok, false);
  assert.equal(readbackVerdict({ mode: 'select', selectValue: 'a' }, undefined).ok, false);
});

test('optionRowText: 1-based, falls back to the value', () => {
  assert.equal(optionRowText({ value: 'pvc', text: 'PVC' }, 1), '2. PVC');
  assert.equal(optionRowText({ value: 'x', text: '' }, 0), '1. x');
  assert.equal(optionRowText({ value: '', text: '' }, 0), '1. (blank)');
});

test('setting entries: only for the four commands, ids are native ids, no name or alias collides', () => {
  assert.deepEqual(PIPE_SETTING_ENTRIES.map((e) => e.name), ['diameter', 'dsource', 'material', 'msource']);
  for (const e of PIPE_SETTING_ENTRIES) assert.ok(PIPE_SETTING_IDS[e.control], e.name + ' points at a known control');
  assert.deepEqual(PIPE_SETTING_IDS, {
    diameter: 'graph-pipe-diameter', custom: 'graph-pipe-diameter-custom', dsource: 'graph-pipe-diameter-source',
    material: 'graph-pipe-material', msource: 'graph-pipe-material-source',
  });
  const words = (e) => [e.name, ...(e.aliases ?? [])].map((w) => w.toLowerCase());
  const mine = PIPE_SETTING_ENTRIES.flatMap(words);
  assert.equal(new Set(mine).size, mine.length, 'no duplicates among the four');
  const others = [
    ...PIPE_GRAPH_ACTIONS.flatMap(words), ...words(PIPE_ADJUST_ENTRY),
    ...Object.entries(PIPE_TOOL_ALIASES).flatMap(([tool, a]) => [tool, ...a]),
    ...Object.values(PIPE_FALLBACK_KEYS).map((k) => String(k).toLowerCase()),
  ].map((w) => String(w).toLowerCase());
  for (const w of mine) assert.ok(!others.includes(w), `"${w}" is already a tool, alias, key or action name`);
  for (const w of mine) assert.ok(!PIPE_ISOLATION_ALLOWED.includes(w), 'settings are not allowed while a placement is open');
});

test('listing and planning: a setting is listed only when usable; an unusable exact name is refused by name', () => {
  const table = buildTable([], []).concat(PIPE_SETTING_ENTRIES);
  const usable = new Set(['material']);
  const stateFor = (e) => ({ usable: usable.has(e.name), forbidden: false, reason: usable.has(e.name) ? null : 'hidden right now' });
  assert.deepEqual(listEntries(table, stateFor).map((r) => r.entry.name), ['material']);
  const refused = planQuery(table, 'diameter', stateFor);
  assert.equal(refused.action, 'status');
  assert.equal(refused.entry.name, 'diameter', 'the refused plan still names the entry');
  assert.match(refused.message, /Diameter: hidden right now/);
  assert.equal(planQuery(table, 'nope', stateFor).entry, undefined, 'an unknown command names no entry');
  assert.equal(planQuery(table, 'material', stateFor).action, 'click');
});
