// Unit tests for src/core/pipe-placement-core.js and the Step 2 data in src/pipe/pipe-tables.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  panelPhase, autoMatchedDiameter, aliasesFor, menuEntries, categoriesOf, labelStep, planPick, isolationVerdict,
} from '../src/core/pipe-placement-core.js';
import {
  PIPE_HINT_PREFIXES, PIPE_AUTOMATCH_PATTERN, PIPE_FITTING_ALIASES, PIPE_FIXTURE_ID_PREFIXES,
  PIPE_FIXTURE_TOOL, PIPE_ISOLATION_ALLOWED, PIPE_GRAPH_ACTIONS,
} from '../src/pipe/pipe-tables.js';

// The fitting menu as read live on 2026-10-06 (ports, then ids).
const LIVE = {
  3: ['pipe-tee-eq', 'pipe-tee-reducing', 'pipe-wye', 'pipe-sanitary-tee', 'pipe-wye-reducer'],
  4: ['pipe-cross'],
  1: ['pipe-elbow-90-vertical', 'pipe-cap', 'pipe-plug', 'pipe-cleanout', 'pipe-floor-drain', 'pipe-hose-bibb', 'pipe-hydrant', 'pipe-nozzle'],
  2: ['pipe-elbow-45', 'pipe-elbow-90', 'pipe-elbow-lr-45', 'pipe-elbow-lr-90', 'pipe-elbow-sr-45', 'pipe-elbow-sr-90', 'pipe-elbow-90-reducing',
    'pipe-tee-eq-vertical', 'pipe-tee-reducing-vertical', 'pipe-wye-vertical', 'pipe-wye-reducer-vertical', 'pipe-reducer-concentric',
    'pipe-reducer-eccentric', 'pipe-union', 'pipe-coupling', 'pipe-strainer-y', 'pipe-strainer-t', 'pipe-trap-p', 'pipe-trap-s',
    'pipe-trap-steam-ft', 'pipe-trap-steam-tt', 'pipe-trap-steam-st', 'pipe-trap-steam-td', 'pipe-expansion-joint-bellows', 'pipe-expansion-joint-slip'],
};
const labelOf = (id) => id.replace(/^pipe-/, '').split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const groups = (usablePorts) => Object.entries(LIVE).map(([ports, ids]) => ({
  ports: Number(ports), usable: usablePorts.includes(Number(ports)),
  options: ids.map((id) => ({ id, label: labelOf(id), usable: usablePorts.includes(Number(ports)) })),
}));
const entriesFor = (usablePorts, tool = 'fitting') => menuEntries({
  groups: groups(usablePorts), tool, curated: PIPE_FITTING_ALIASES, fixtureTool: PIPE_FIXTURE_TOOL, fixturePrefixes: PIPE_FIXTURE_ID_PREFIXES,
});
const first = (step) => step.items[0];

test('aliases: every key is a real family id from the live menu, and no alias repeats or equals an id', () => {
  const allIds = Object.values(LIVE).flat();
  assert.deepEqual(Object.keys(PIPE_FITTING_ALIASES).filter((id) => !allIds.includes(id)), []);
  const seen = new Map();
  for (const [id, list] of Object.entries(PIPE_FITTING_ALIASES)) {
    for (const alias of list) {
      assert.ok(!seen.has(alias), `alias "${alias}" used by both ${seen.get(alias)} and ${id}`);
      seen.set(alias, id);
      assert.ok(!allIds.includes(alias), alias);
    }
  }
});

test('aliases: the approved changes are in (and the dropped ones are out)', () => {
  const all = Object.values(PIPE_FITTING_ALIASES).flat();
  for (const a of ['trapft', 'traptt', 'trapst', 'traptd', '90', '45', 'lr90', 'el90', 'el45', 'el90r', '90r', 'tee', 'wye', 'cross']) assert.ok(all.includes(a), a);
  for (const a of ['ft', 'tt', 'st', 'td', 'rtee', 'rwye']) assert.ok(!all.includes(a), a + ' must stay out');
  assert.equal(PIPE_FITTING_ALIASES['pipe-trap-steam-ft'].join(), 'trapft');
});

test('aliases: no fitting alias collides with a command, so typing it can never mean two things', () => {
  const actionWords = PIPE_GRAPH_ACTIONS.flatMap((a) => [a.name, ...a.aliases]);
  assert.deepEqual(Object.values(PIPE_FITTING_ALIASES).flat().filter((a) => actionWords.includes(a)), []);
});

test('aliasesFor: fitting menu uses the curated table, fixture menu uses the id without its prefix', () => {
  const base = { curated: PIPE_FITTING_ALIASES, fixtureTool: PIPE_FIXTURE_TOOL, fixturePrefixes: PIPE_FIXTURE_ID_PREFIXES };
  assert.deepEqual(aliasesFor({ ...base, id: 'pipe-floor-drain', tool: 'fitting' }), ['fd', 'drain']);
  assert.deepEqual(aliasesFor({ ...base, id: 'pipe-fd', tool: 'fixture' }), ['fd']);
  assert.deepEqual(aliasesFor({ ...base, id: 'fixture-wc', tool: 'fixture' }), ['wc']);
  assert.deepEqual(aliasesFor({ ...base, id: 'pipe-floor-drain', tool: 'fixture' }), ['floor-drain'], 'fixture menu never uses the fitting table');
  assert.deepEqual(aliasesFor({ ...base, id: 'pipe-cap', tool: 'valve' }), ['cap'], 'other tools: curated table only matters by id, empty here');
});

test('panelPhase: "starts with", so native\'s appended sentences do not matter', () => {
  const phase = (h) => panelPhase(h, PIPE_HINT_PREFIXES);
  assert.equal(phase('Click two opposite corners around the fitting on the drawing.'), 'box');
  assert.equal(phase('Choose the fitting subtype.'), 'label');
  assert.equal(phase('Choose the fitting subtype. Diameter 2" auto-matched from the crossed run.'), 'label');
  assert.equal(phase('Click the detected intersection for outlet.'), 'ports');
  assert.equal(phase('Finish inserts this fitting. The connected pipe resumes from its outlet. Diameter 3" auto-matched from the crossed run.'), 'ready');
  assert.equal(phase('Saving pipe and fitting…'), 'submitting');
  assert.equal(phase('Something new native added'), 'unknown');
  assert.equal(phase(''), 'unknown');
  assert.equal(phase('  Choose the fitting subtype.'), 'label');
  assert.equal(phase('Please Choose the fitting subtype.'), 'unknown', 'not "contains"');
});

test('autoMatchedDiameter: reads native\'s own sentence', () => {
  assert.equal(autoMatchedDiameter('Choose the fitting subtype. Diameter 2" auto-matched from the crossed run.', PIPE_AUTOMATCH_PATTERN), '2"');
  assert.equal(autoMatchedDiameter('Diameter 1.5" auto-matched from the crossed run.', PIPE_AUTOMATCH_PATTERN), '1.5"');
  assert.equal(autoMatchedDiameter('Box crosses multiple runs — diameter not auto-matched.', PIPE_AUTOMATCH_PATTERN), null);
  assert.equal(autoMatchedDiameter(undefined, PIPE_AUTOMATCH_PATTERN), null);
});

test('categoriesOf: counts what can be picked per port count', () => {
  assert.deepEqual(categoriesOf(entriesFor([3, 4])).map((c) => [c.ports, c.count, c.usableCount]), [[1, 8, 0], [2, 25, 0], [3, 5, 5], [4, 1, 1]]);
});

test('labelStep: several usable categories -> category step, usable first', () => {
  const step = labelStep({ entries: entriesFor([3, 4]) });
  assert.equal(step.stage, 'category');
  assert.deepEqual(step.items.map((i) => [i.ports, i.usable]), [[3, true], [4, true], [1, false], [2, false]]);
});

test('labelStep: exactly one usable category -> category step skipped', () => {
  const step = labelStep({ entries: entriesFor([2]) });
  assert.equal(step.stage, 'label');
  assert.equal(step.category, 2);
  assert.equal(step.items.length, 25);
  assert.ok(step.items.every((i) => i.entry.usable));
});

test('labelStep: nothing usable', () => {
  assert.equal(labelStep({ entries: entriesFor([]) }).stage, 'none');
  assert.equal(labelStep({ entries: [] }).stage, 'none');
});

test('labelStep: a chosen category lists that category only, usable first', () => {
  const step = labelStep({ entries: entriesFor([3, 4]), category: 3 });
  assert.deepEqual(step.items.map((i) => i.entry.id), LIVE[3]);
  const none = labelStep({ entries: entriesFor([3, 4]), category: 1 });
  assert.equal(none.items.length, 8);
  assert.ok(none.items.every((i) => !i.entry.usable));
});

test('labelStep: a typed name is ranked, exact first, and works from the category step', () => {
  const e = entriesFor([1, 2, 3, 4]);
  assert.equal(first(labelStep({ entries: e, query: 'tee' })).entry.id, 'pipe-tee-eq');
  assert.equal(first(labelStep({ entries: e, query: 'cross' })).entry.id, 'pipe-cross');
  assert.equal(first(labelStep({ entries: e, query: 'Sanitary Tee' })).entry.id, 'pipe-sanitary-tee', 'native\'s own label works');
  assert.equal(first(labelStep({ entries: e, query: 'pipe-wye-reducer' })).entry.id, 'pipe-wye-reducer', 'and so does the id');
  assert.equal(first(labelStep({ entries: e, query: 'wyer' })).entry.id, 'pipe-wye-reducer');
  assert.equal(first(labelStep({ entries: e, query: 'el90' })).entry.id, 'pipe-elbow-90');
  assert.equal(first(labelStep({ entries: e, query: 'el90r' })).entry.id, 'pipe-elbow-90-reducing');
  assert.equal(first(labelStep({ entries: e, query: '90' })).entry.id, 'pipe-elbow-90', 'exact alias beats the prefix match 90r');
  assert.equal(first(labelStep({ entries: e, query: 'trapft' })).entry.id, 'pipe-trap-steam-ft');
  assert.equal(first(labelStep({ entries: e, query: 'reducer' })).entry.id, 'pipe-reducer-concentric');
});

test('labelStep: a single digit 1-4 offers the category first, and "45"/"90" still reach the elbows', () => {
  const e = entriesFor([2, 3, 4]);
  const four = labelStep({ entries: e, query: '4' });
  assert.equal(four.stage, 'category');
  assert.deepEqual([first(four).kind, first(four).ports], ['category', 4]);
  assert.equal(first(labelStep({ entries: e, query: '45' })).entry.id, 'pipe-elbow-45');
  assert.equal(first(labelStep({ entries: e, query: '3' })).ports, 3);
  // "1" with no usable 1-port category is just a text search
  assert.notEqual(first(labelStep({ entries: e, query: '1' }))?.kind, 'category');
});

test('labelStep: an unusable fitting is listed after the usable ones and never first when something usable matches', () => {
  const e = entriesFor([3]);
  const step = labelStep({ entries: e, query: 'wye' });
  assert.ok(step.items[0].entry.usable);
  const only = labelStep({ entries: e, query: 'cap' });
  assert.ok(only.items.every((i) => !i.entry.usable));
});

test('planPick: category, fitting, and refusals', () => {
  assert.deepEqual(planPick({ kind: 'category', ports: 3, usable: true, count: 5 }), { action: 'category', ports: 3 });
  assert.equal(planPick({ kind: 'category', ports: 1, usable: false, count: 0 }).action, 'status');
  const e = entriesFor([3]).find((x) => x.id === 'pipe-tee-eq');
  assert.deepEqual(planPick({ kind: 'fitting', entry: e }), { action: 'choose', id: 'pipe-tee-eq', label: 'Tee Eq' });
  assert.equal(planPick({ kind: 'fitting', entry: { ...e, usable: false } }).action, 'status');
  assert.equal(planPick(undefined).action, 'status');
});

test('isolationVerdict: with a panel open only the allowed names run; closed, everything', () => {
  const v = (name, panelOpen = true) => isolationVerdict({ panelOpen, name, allowed: PIPE_ISOLATION_ALLOWED }).ok;
  for (const name of PIPE_ISOLATION_ALLOWED) assert.equal(v(name), true, name);
  for (const name of ['route', 'fitting', 'valve', 'ruler', 'components', 'finish', 'save', 'whatever']) assert.equal(v(name), false, name);
  assert.equal(v('route', false), true);
  assert.equal(isolationVerdict({ panelOpen: true, name: 'route', allowed: undefined }).ok, false, 'no list: fail closed');
  assert.match(isolationVerdict({ panelOpen: true, name: 'route', allowed: [] }).message, /cancel/);
});

test('labelStep: usable fittings come first even when native lists an unavailable one earlier', () => {
  const e = menuEntries({
    groups: [{ ports: 2, usable: true, options: [{ id: 'pipe-union', label: 'Union', usable: false }, { id: 'pipe-coupling', label: 'Coupling', usable: true }] }],
    tool: 'fitting', curated: PIPE_FITTING_ALIASES, fixtureTool: PIPE_FIXTURE_TOOL, fixturePrefixes: PIPE_FIXTURE_ID_PREFIXES,
  });
  assert.deepEqual(labelStep({ entries: e }).items.map((i) => i.entry.id), ['pipe-coupling', 'pipe-union']);
});
