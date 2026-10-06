// Unit tests for src/core/pipe-placement-core.js and the Step 2 data in src/pipe/pipe-tables.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  panelPhase, autoMatchedDiameter, aliasesFor, displayNameFor, missingIds, hintWatch, portRoleFromHint, roleDisplayName, portProgress, portLine, adjustVerdict, targetForbidden, finishVerdict, finishLatchClick, finishLatchStep, FINISH_LATCH_OFF, menuEntries, categoriesOf, labelStep, planPick, isolationVerdict,
} from '../src/core/pipe-placement-core.js';
import {
  PIPE_HINT_PREFIXES, PIPE_AUTOMATCH_PATTERN, PIPE_FITTING_ALIASES, PIPE_FIXTURE_ID_PREFIXES,
  PIPE_FIXTURE_TOOL, PIPE_FIXTURE_DISPLAY_NAMES, PIPE_PORT_ROLE_PATTERN, PIPE_FINISH_HINT_PREFIX, PIPE_FINISH_TOOLS, PIPE_FINISH_BUTTON_ID,
  PIPE_FORBIDDEN_BUTTON_TEXTS, PIPE_FORBIDDEN_CONTAINER_IDS, PIPE_FINISH_LATCH_MS, PIPE_ISOLATION_ALLOWED, PIPE_GRAPH_ACTIONS,
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

test('fixture display names: the nine approved names, fixture menu only, unknown ids fall back', () => {
  assert.deepEqual(PIPE_FIXTURE_DISPLAY_NAMES, {
    wc: 'Water Closet', lav: 'Lavatory', sh: 'Shower', ur: 'Urinal', ks: 'Kitchen Sink', ms: 'Mop Sink', hb: 'Hose Bibb', fd: 'Floor Drain', rd: 'Roof Drain',
  });
  const base = { fixtureTool: PIPE_FIXTURE_TOOL, fixturePrefixes: PIPE_FIXTURE_ID_PREFIXES, names: PIPE_FIXTURE_DISPLAY_NAMES };
  assert.equal(displayNameFor({ ...base, id: 'pipe-wc', tool: 'fixture' }), 'Water Closet');
  assert.equal(displayNameFor({ ...base, id: 'pipe-rd', tool: 'fixture' }), 'Roof Drain');
  assert.equal(displayNameFor({ ...base, id: 'pipe-zz', tool: 'fixture' }), null);
  assert.equal(displayNameFor({ ...base, id: 'pipe-toString', tool: 'fixture' }), null, 'no prototype leakage');
  assert.equal(displayNameFor({ ...base, id: 'pipe-fd', tool: 'fitting' }), null, 'never in the fitting menu');
  assert.equal(displayNameFor({ ...base, id: 'pipe-fd', tool: 'fixture', names: undefined }), null);
});

test('panelPhase: a phase can have several openings (the transition tool\'s ready hints)', () => {
  const phase = (h) => panelPhase(h, PIPE_HINT_PREFIXES);
  assert.equal(phase('Pick a different diameter — a transition must change size.'), 'ready');
  assert.equal(phase('Enter the new diameter above, then Finish.'), 'ready');
  assert.equal(phase('From 2" → to 3". Finish inserts this fitting.'), 'ready');
  assert.equal(phase('From nowhere'), 'ready', 'prefix only: that is how native words it');
  assert.equal(panelPhase('x', { a: ['y', 'x'] }), 'a');
  assert.equal(panelPhase('x', undefined), 'unknown');
});

test('missingIds: required ids that are not present', () => {
  assert.deepEqual(missingIds(['a', 'b', 'c'], ['a', 'c']), ['b']);
  assert.deepEqual(missingIds(['a'], ['a']), []);
  assert.deepEqual(missingIds(['a'], undefined), ['a'], 'nothing readable: everything is missing (fail closed)');
  assert.deepEqual(missingIds(undefined, ['a']), []);
});

test('hintWatch: warns once per unknown hint, stays quiet for known, empty and closed', () => {
  const w = (o) => hintWatch({ prefixes: PIPE_HINT_PREFIXES, open: true, ...o });
  assert.deepEqual(w({ hint: 'Choose the fitting subtype.' }), { action: 'ok', hint: null });
  assert.deepEqual(w({ hint: 'Brand new text' }), { action: 'warn', hint: 'Brand new text' });
});

test('hintWatch: repeats and resets', () => {
  const w = (o) => hintWatch({ prefixes: PIPE_HINT_PREFIXES, open: true, ...o });
  assert.deepEqual(w({ hint: 'Brand new text', lastWarned: 'Brand new text' }), { action: 'quiet', hint: 'Brand new text' });
  assert.equal(w({ hint: 'Different new text', lastWarned: 'Brand new text' }).action, 'warn');
  assert.deepEqual(w({ hint: '   ', lastWarned: 'Brand new text' }), { action: 'quiet', hint: 'Brand new text' });
  assert.deepEqual(w({ hint: 'Choose the fitting subtype.', lastWarned: 'Brand new text' }), { action: 'ok', hint: null }, 'known again resets');
  assert.deepEqual(w({ open: false, hint: 'Brand new text', lastWarned: 'Brand new text' }), { action: 'ok', hint: null }, 'panel closed resets');
});

test('portRoleFromHint: only the role, from native\'s own sentence', () => {
  assert.equal(portRoleFromHint('Click the detected intersection for inlet.', PIPE_PORT_ROLE_PATTERN), 'inlet');
  assert.equal(portRoleFromHint('Click the detected intersection for branch.', PIPE_PORT_ROLE_PATTERN), 'branch');
  assert.equal(portRoleFromHint('Choose the fitting subtype.', PIPE_PORT_ROLE_PATTERN), null);
  assert.equal(portRoleFromHint(undefined, PIPE_PORT_ROLE_PATTERN), null);
});

test('targetForbidden: the "Resize anyway" toast button, by text and by container', () => {
  const cfg = { forbiddenTexts: PIPE_FORBIDDEN_BUTTON_TEXTS, forbiddenContainerIds: PIPE_FORBIDDEN_CONTAINER_IDS };
  assert.equal(targetForbidden({ text: 'Resize anyway', ancestorIds: [] }, cfg), true, 'by text, anywhere');
  assert.equal(targetForbidden({ text: '  RESIZE ANYWAY ', ancestorIds: [] }, cfg), true, 'case and spaces do not matter');
  assert.equal(targetForbidden({ text: 'Something else', ancestorIds: ['x', 'graph-toast-stack'] }, cfg), true, 'by container: anything in the toast stack');
  assert.equal(targetForbidden({ text: 'Finish', ancestorIds: ['graph-session-root'] }, cfg), false);
  assert.equal(targetForbidden(undefined, cfg), false);
  assert.deepEqual(PIPE_FORBIDDEN_BUTTON_TEXTS, ['resize anyway']);
});

const FACTS = () => ({
  key: 'Enter', repeat: false, barFocused: true, barEmpty: true, panelOpen: true,
  hint: 'Finish inserts this fitting. The connected pipe resumes from its outlet.', tool: 'fixture',
  allowedTools: PIPE_FINISH_TOOLS, finishPrefix: PIPE_FINISH_HINT_PREFIX, latched: false,
  button: { found: true, id: PIPE_FINISH_BUTTON_ID, expectedId: PIPE_FINISH_BUTTON_ID, visible: true, disabled: false, ariaDisabled: 'false', forbidden: false },
});

test('finishVerdict: ok only when every condition holds', () => {
  assert.deepEqual(finishVerdict(FACTS()), { ok: true });
  assert.equal(finishVerdict({ ...FACTS(), tool: 'fitting' }).ok, true);
});

test('finishVerdict: each condition on its own blocks it (and says nothing unless the person could be confused)', () => {
  const cases = [
    ['key', { key: ' ' }, 'not-enter', false], ['key Tab', { key: 'Tab' }, 'not-enter', false],
    ['repeat', { repeat: true }, 'repeat', false], ['bar not focused', { barFocused: false }, 'bar', false],
    ['bar has text', { barEmpty: false }, 'bar', false], ['panel closed', { panelOpen: false }, 'no-panel', false],
    ['hint box', { hint: 'Click two opposite corners around the fitting on the drawing.' }, 'phase', false],
    ['hint ports', { hint: 'Click the detected intersection for outlet.' }, 'phase', false],
    ['hint saving', { hint: 'Saving pipe and fitting…' }, 'phase', false],
    ['hint unknown', { hint: 'New thing' }, 'phase', false], ['hint empty', { hint: '' }, 'phase', false],
    ['transition-style ready', { hint: 'From 2" → to 3". Finish inserts this fitting.' }, 'phase', false],
    ['latched', { latched: true }, 'latched', false],
  ];
  for (const [name, over, reason, hasMessage] of cases) {
    const v = finishVerdict({ ...FACTS(), ...over });
    assert.equal(v.ok, false, name);
    assert.equal(v.reason, reason, name);
    assert.equal(v.message !== null, hasMessage, name);
  }
  for (const tool of ['valve', 'equipment', 'transition', 'cut', 'terminal', '', undefined, 'route']) {
    const v = finishVerdict({ ...FACTS(), tool });
    assert.equal(v.ok, false, 'tool ' + tool);
    assert.equal(v.reason, 'tool');
    assert.ok(v.message);
  }
  const b = (over) => finishVerdict({ ...FACTS(), button: { ...FACTS().button, ...over } });
  assert.equal(b({ found: false }).reason, 'button');
  assert.equal(b({ id: 'something-else' }).reason, 'button', 'must be exactly native\'s Finish id');
  assert.equal(b({ forbidden: true }).reason, 'button', 'inside the toast stack / Resize anyway');
  assert.equal(b({ visible: false }).reason, 'button');
  assert.equal(b({ disabled: true }).reason, 'disabled');
  assert.equal(b({ ariaDisabled: 'true' }).reason, 'disabled');
  assert.equal(b({ ariaDisabled: true }).reason, 'disabled');
  assert.ok(b({ disabled: true }).message);
  assert.equal(finishVerdict(undefined).ok, false, 'no facts: fail closed');
  assert.equal(finishVerdict({ ...FACTS(), allowedTools: undefined }).ok, false, 'no allowed tools: fail closed');
});

test('finishLatch: held until native has been through "saving" and is back, closed, or the timeout passes', () => {
  const step = (latch, phase, panelOpen, now) => finishLatchStep({ latch, phase, panelOpen, now, expireMs: PIPE_FINISH_LATCH_MS });
  assert.equal(step(FINISH_LATCH_OFF, 'ready', true, 0), FINISH_LATCH_OFF, 'nothing clicked: stays off');
  let l = finishLatchClick(1000);
  assert.equal(step(l, 'ready', true, 1100).clicked, true, 'still ready right after the click: held');
  l = step(l, 'submitting', true, 1200);
  assert.deepEqual([l.clicked, l.leftReady], [true, true], 'saving: held, and remembered that it left ready');
  assert.equal(step(l, 'submitting', true, 9000).clicked, true, 'saving can take a while: no timeout while saving');
  assert.equal(step(l, 'ready', true, 1500).clicked, false, 'back at ready (failed save): released');
  assert.equal(step(l, 'closed', false, 1500).clicked, false, 'panel closed (saved or cancelled): released');
  const stuck = finishLatchClick(1000);
  assert.equal(step(stuck, 'ready', true, 1000 + PIPE_FINISH_LATCH_MS).clicked, true, 'exactly at the timeout: still held');
  assert.equal(step(stuck, 'ready', true, 1001 + PIPE_FINISH_LATCH_MS).clicked, false, 'ignored click: released after the timeout');
  assert.equal(step(finishLatchClick(0), 'unknown', true, 10).leftReady, true, 'an unknown hint also counts as having left ready');
});

test('finishVerdict: a sizes gate that is not ok blocks Finish and passes its reason/message/reopen through', () => {
  const gate = { ok: false, reason: 'sizes-unconfirmed', message: 'port sizes: choose first', reopen: true };
  const v = finishVerdict({ ...FACTS(), sizesGate: gate });
  assert.deepEqual([v.ok, v.reason, v.message, v.reopen], [false, 'sizes-unconfirmed', 'port sizes: choose first', true]);
  assert.equal(finishVerdict({ ...FACTS(), sizesGate: { ok: true } }).ok, true);
  assert.equal(finishVerdict({ ...FACTS(), sizesGate: { ok: false, reason: 'sizes-max', message: 'm' } }).reopen, false);
  assert.equal(finishVerdict({ ...FACTS(), sizesGate: gate, key: ' ' }).reason, 'not-enter', 'the key checks still come first');
});

test('roleDisplayName: display only; branch_a -> "branch A"', () => {
  assert.equal(roleDisplayName('branch_a'), 'branch A');
  assert.equal(roleDisplayName('branch_b'), 'branch B');
  assert.equal(roleDisplayName('inlet'), 'inlet');
  assert.equal(roleDisplayName('outlet'), 'outlet');
  assert.equal(roleDisplayName('side_port'), 'side port');
  assert.equal(roleDisplayName(undefined), '');
});

test('portProgress: where a role sits in the family\'s port list (exact in Adjust mode)', () => {
  const cross = ['inlet', 'outlet', 'branch_a', 'branch_b'];
  assert.deepEqual(portProgress('inlet', cross), { n: 1, N: 4, done: [] });
  assert.deepEqual(portProgress('branch_a', cross), { n: 3, N: 4, done: ['inlet', 'outlet'] });
  assert.deepEqual(portProgress('branch_b', cross), { n: 4, N: 4, done: ['inlet', 'outlet', 'branch_a'] });
  assert.equal(portProgress('nope', cross), null);
  assert.equal(portProgress('inlet', null), null);
  assert.deepEqual(portProgress('inlet', ['inlet']), { n: 1, N: 1, done: [] });
});

test('portLine: count and done-list only with Adjust on and the roles known; role only otherwise', () => {
  const cross = ['inlet', 'outlet', 'branch_a', 'branch_b'];
  assert.equal(portLine({ role: 'inlet', adjustOn: true, portContract: cross }), 'click: inlet (1 of 4)  (click an assigned port again to undo)');
  assert.equal(portLine({ role: 'branch_b', adjustOn: true, portContract: cross }), 'click: branch B (4 of 4)  done: inlet, outlet, branch A  (click an assigned port again to undo)');
  assert.equal(portLine({ role: 'branch_b', adjustOn: false, portContract: cross }), 'click: branch B', 'not adjusting: no count');
  assert.equal(portLine({ role: 'outlet', adjustOn: true, portContract: null }), 'click: outlet', 'catalog unreadable: role only');
  assert.equal(portLine({ role: 'zzz', adjustOn: true, portContract: cross }), 'click: zzz', 'role not in the list: role only');
});

test('adjustVerdict: only a placement panel in the ready or ports phase with native\'s box visible and enabled', () => {
  const ok = { panelOpen: true, phase: 'ready', found: true, visible: true, disabled: false };
  assert.deepEqual(adjustVerdict(ok), { ok: true });
  assert.equal(adjustVerdict({ ...ok, phase: 'ports' }).ok, true);
  assert.equal(adjustVerdict({ ...ok, panelOpen: false }).reason, 'no-panel');
  for (const phase of ['box', 'label', 'submitting', 'unknown', 'closed']) assert.equal(adjustVerdict({ ...ok, phase }).reason, 'phase', phase);
  assert.equal(adjustVerdict({ ...ok, found: false }).reason, 'no-checkbox');
  assert.equal(adjustVerdict({ ...ok, visible: false }).reason, 'no-checkbox');
  assert.equal(adjustVerdict({ ...ok, disabled: true }).reason, 'disabled');
  assert.equal(adjustVerdict(undefined).ok, false, 'no facts: fail closed');
  assert.equal(adjustVerdict({}).ok, false);
  assert.ok(adjustVerdict({ ...ok, found: false }).message);
});
