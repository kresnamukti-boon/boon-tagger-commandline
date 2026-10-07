// Unit tests for src/core/pipe-size-core.js (port sizes on reducing fittings).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  parseSizeInput, formatSize, planSizeInput, planSizeWrite, effectiveSize, rolesFromLabel, roleSizes, maxViolations,
  sizeWriteVerdict, SIZE_CHOICES, editableFields, sizesKey, sizesTickPlan, sizesChanged, sizesFinishGate, NOMINAL_SIZES_IN, sizeChoiceRows, SIZE_CHOICE_ADJUST, SIZE_CHOICE_CONTINUE, SIZE_CHOICE_READJUST, escStepPlan,
} from '../src/core/pipe-size-core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const NATIVE = path.join(here, 'fixtures', 'native', 'pipe-diameter.js');
const HAVE_NATIVE = fs.existsSync(NATIVE);

test('parseSizeInput: decimals, fractions, mixed numbers, inch marks; everything else is null', () => {
  const cases = [['2', 2], ['2.5', 2.5], ['3/4', 0.75], ['1 1/2', 1.5], ['1-1/2', 1.5], ['2-3/8', 2.375], ['2"', 2], ['2″', 2], [' 1.75 ', 1.75], ['.5', 0.5], ['2.', 2], [1.5, 1.5]];
  for (const [input, expected] of cases) assert.equal(parseSizeInput(input), expected, String(input));
  for (const bad of ['', ' ', 'abc', '-2', '0', '1e3', 'Infinity', 'NaN', '1/0', '11 1/2 1', '1--1/2', '1  1/2', '/', '.', undefined, null, NaN, 0, -1, {}]) {
    assert.equal(parseSizeInput(bad), null, JSON.stringify(bad));
  }
});

test('parseSizeInput and formatSize agree with native\'s own pipe-diameter.js on a set of inputs', { skip: HAVE_NATIVE ? false : 'native fixture pipe-diameter.js not present (kept out of git)' }, () => {
  const src = fs.readFileSync(NATIVE, 'utf8').replace(/^export /gm, '');
  const ctx = vm.createContext({});
  vm.runInContext(src + '\nthis.native = { parsePipeDiameter, formatPipeDiameter };', ctx);
  const inputs = ['2', '2.5', '3/4', '1 1/2', '1-1/2', '2-3/8', '2"', '2″', ' 1.75 ', '.5', '2.', '', 'abc', '-2', '0', '1e3', '1/0', '11/2', '123/4', '1--1/2', '1  1/2', '0.375', '48', '49', '3/8', '1-1/2"', '7/16', '0.3', '12.125', 'Infinity', 5, 0, -3];
  for (const input of inputs) assert.equal(parseSizeInput(input), ctx.native.parsePipeDiameter(input), 'parse ' + JSON.stringify(input));
  for (const v of [0.375, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.375, 2.5, 3.7, 12, 48, 0, -1, NaN, 0.3125, 1.03125]) {
    assert.equal(formatSize(v), ctx.native.formatPipeDiameter(v), 'format ' + v);
  }
});

test('formatSize: the hyphenated fraction form, the inverse of parse for standard sizes', () => {
  for (const v of NOMINAL_SIZES_IN) assert.equal(parseSizeInput(formatSize(v)), v, String(v));
  assert.equal(formatSize(1.5), '1-1/2');
  assert.equal(formatSize(0.375), '3/8');
  assert.equal(formatSize(2), '2');
  assert.equal(formatSize(0), '');
  assert.equal(formatSize(3.7), '3.7');
});

test('planSizeInput: range 3/8 to 48 and a plain reason otherwise', () => {
  assert.deepEqual(planSizeInput('2-1/2'), { ok: true, value: 2.5 });
  assert.deepEqual(planSizeInput('3/8'), { ok: true, value: 0.375 });
  assert.deepEqual(planSizeInput('48'), { ok: true, value: 48 });
  assert.equal(planSizeInput('1/4').ok, false);
  assert.equal(planSizeInput('49').ok, false);
  assert.match(planSizeInput('49').message, /3\/8" to 48"/);
  assert.match(planSizeInput('abc').message, /not a size/);
});

test('planSizeWrite: a standard option goes on the select, anything else is Custom + text', () => {
  const opts = ['', '0.375', '0.5', '1.5', '2', 'custom'];
  assert.deepEqual(planSizeWrite(1.5, opts), { mode: 'select', selectValue: '1.5' });
  assert.deepEqual(planSizeWrite(1.75, opts), { mode: 'custom', customText: '1-3/4' });
  assert.deepEqual(planSizeWrite(2, opts), { mode: 'select', selectValue: '2' });
  assert.deepEqual(planSizeWrite(3, opts), { mode: 'custom', customText: '3' }, 'a size the select does not list');
  assert.deepEqual(planSizeWrite(2, undefined), { mode: 'custom', customText: '2' });
  assert.equal(planSizeWrite(2, ['', 'custom']).mode, 'custom', 'blank and custom are never "a size"');
});

test('effectiveSize / rolesFromLabel / roleSizes: what the fields hold, per role', () => {
  assert.equal(effectiveSize({ selectValue: '2', customValue: '' }), 2);
  assert.equal(effectiveSize({ selectValue: 'custom', customValue: '1-3/4' }), 1.75);
  assert.equal(effectiveSize({ selectValue: 'custom', customValue: '' }), null);
  assert.equal(effectiveSize({ selectValue: '', customValue: '' }), null);
  assert.deepEqual(rolesFromLabel('Inlet / Outlet diameter (in)'), ['inlet', 'outlet']);
  assert.deepEqual(rolesFromLabel('Branch diameter (in)'), ['branch']);
  assert.deepEqual(roleSizes([
    { label: 'Inlet diameter (in)', selectValue: '2', customValue: '' },
    { label: 'Outlet / Branch diameter (in)', selectValue: 'custom', customValue: '1-1/2' },
  ]), { inlet: 2, outlet: 1.5, branch: 1.5 });
});

test('maxViolations: outlet/branch larger than inlet, from the catalog\'s own rule; unknown sizes are skipped', () => {
  const rule = { branch: 'inlet', outlet: 'inlet' };
  assert.deepEqual(maxViolations({ inlet: 2, outlet: 2, branch: 1.5 }, rule), []);
  assert.deepEqual(maxViolations({ inlet: 2, outlet: 3, branch: 1 }, rule), ['outlet 3" is larger than inlet 2": the server will reject it']);
  assert.equal(maxViolations({ inlet: 2, outlet: 4, branch: 3 }, rule).length, 2);
  assert.deepEqual(maxViolations({ inlet: null, outlet: 3, branch: 3 }, rule), [], 'unknown inlet: nothing to compare');
  assert.deepEqual(maxViolations({ inlet: 2, outlet: 3 }, {}), [], 'a family with no rule');
  assert.deepEqual(maxViolations({ inlet: 2, outlet: 3 }, undefined), []);
  assert.deepEqual(maxViolations({ inlet: 2, outlet: 2 }, { outlet: 'inlet' }), [], 'equal is allowed');
});

test('sizeWriteVerdict: only a new placement at ready with nothing selected and an unlocked field', () => {
  const ok = { panelOpen: true, ready: true, selectionReadable: true, selectedEntityId: null, fieldDisabled: false };
  assert.deepEqual(sizeWriteVerdict(ok), { ok: true });
  assert.equal(sizeWriteVerdict({ ...ok, panelOpen: false }).reason, 'no-panel');
  assert.equal(sizeWriteVerdict({ ...ok, ready: false }).reason, 'not-ready');
  assert.equal(sizeWriteVerdict({ ...ok, selectionReadable: false }).reason, 'selection-unreadable');
  const sel = sizeWriteVerdict({ ...ok, selectedEntityId: 'pipe-1' });
  assert.equal(sel.reason, 'selected');
  assert.match(sel.message, /would save/);
  assert.equal(sizeWriteVerdict({ ...ok, fieldDisabled: true }).reason, 'locked');
  assert.equal(sizeWriteVerdict(undefined).ok, false, 'no facts: fail closed');
  assert.equal(sizeWriteVerdict({}).ok, false);
});

test('SIZE_CHOICES / editableFields / sizesKey', () => {
  assert.deepEqual(SIZE_CHOICES.map((c) => c.text), ['Use port sizes as is', 'Edit port sizes']);
  assert.deepEqual(editableFields([{ cap: 'a', disabled: true }, { cap: 'b', disabled: false }]).map((f) => f.cap), ['b']);
  assert.notEqual(sizesKey({ placement: 1, familyId: 'x', roles: ['a'] }), sizesKey({ placement: 2, familyId: 'x', roles: ['a'] }));
  assert.notEqual(sizesKey({ placement: 1, familyId: 'x', roles: ['a'] }), sizesKey({ placement: 1, familyId: 'y', roles: ['a'] }));
});

test('sizesTickPlan: open once per placement; blocked when something is selected or unreadable', () => {
  const base = { state: { stage: 'idle', key: null }, key: 'k', perPort: true, ready: true, selectedEntityId: null, selectionReadable: true };
  assert.equal(sizesTickPlan(base).action, 'open');
  assert.equal(sizesTickPlan({ ...base, perPort: false }).action, 'none');
  assert.equal(sizesTickPlan({ ...base, ready: false }).action, 'none');
  assert.equal(sizesTickPlan({ ...base, selectedEntityId: 'p' }).action, 'blocked');
  assert.equal(sizesTickPlan({ ...base, selectionReadable: false }).action, 'blocked');
  for (const stage of ['choice', 'edit', 'confirmed', 'dismissed']) assert.equal(sizesTickPlan({ ...base, state: { stage, key: 'k' } }).action, 'none', stage);
  assert.equal(sizesTickPlan({ ...base, state: { stage: 'confirmed', key: 'other' } }).action, 'open', 'a different placement/family asks again');
});

test('sizesChanged: any difference since confirmation', () => {
  assert.equal(sizesChanged({ inlet: 2, outlet: 2 }, { inlet: 2, outlet: 2 }), false);
  assert.equal(sizesChanged({ inlet: 2, outlet: 2 }, { inlet: 2, outlet: 1 }), true);
  assert.equal(sizesChanged({ inlet: 2 }, { inlet: 2, outlet: 2 }), true);
  assert.equal(sizesChanged(null, {}), false);
  assert.equal(sizesChanged(null, { inlet: 2 }), true);
});

test('sizesFinishGate: single-size fittings pass; per-port ones need confirmed, unchanged, within the rule', () => {
  const g = (o) => sizesFinishGate({ perPort: true, stage: 'confirmed', confirmed: { inlet: 2 }, current: { inlet: 2 }, violations: [], selectedEntityId: null, selectionReadable: true, ...o });
  assert.deepEqual(sizesFinishGate({ perPort: false }), { ok: true });
  assert.deepEqual(g({}), { ok: true });
  assert.equal(g({ stage: 'idle' }).reason, 'sizes-unconfirmed');
  assert.equal(g({ stage: 'dismissed' }).reopen, true);
  assert.equal(g({ stage: 'choice' }).ok, false);
  assert.equal(g({ current: { inlet: 1 } }).reason, 'sizes-changed');
  const v = g({ violations: ['outlet 3" is larger than inlet 2"'] });
  assert.equal(v.reason, 'sizes-max');
  assert.equal(g({ selectedEntityId: 'p' }).reason, 'sizes-selected');
  assert.equal(g({ selectionReadable: false }).reason, 'sizes-selected');
  assert.equal(g({ selectedEntityId: 'p' }).reopen, false, 'selected: re-opening the rows would not help');
});

test('sizeChoiceRows: the third row appears only when Adjust ports can be used', () => {
  assert.deepEqual(sizeChoiceRows({ adjustUsable: false }).map((c) => c.id), ['asis', 'edit']);
  assert.deepEqual(sizeChoiceRows({ adjustUsable: true }).map((c) => c.id), ['asis', 'edit', 'adjust']);
  assert.equal(SIZE_CHOICE_ADJUST.text, 'Adjust ports (click each port)');
  assert.equal(SIZE_CHOICES.length, 2, 'the base list is not mutated');
  // a placement with one size has nothing to edit: just continue or adjust
  assert.deepEqual(sizeChoiceRows({ adjustUsable: true, singleSize: true }).map((c) => c.id), ['asis', 'adjust']);
  assert.deepEqual(sizeChoiceRows({ adjustUsable: true, singleSize: true }).map((c) => c.text), ['Continue as is', 'Adjust ports (click each port)']);
  assert.equal(SIZE_CHOICE_CONTINUE.text, 'Continue as is');
  // once the box is ticked the adjust row offers to start over
  assert.equal(SIZE_CHOICE_READJUST.text, 'Adjust ports again (click each port)');
  assert.equal(SIZE_CHOICE_READJUST.id, 'adjust', 'same action id, different wording');
  assert.deepEqual(sizeChoiceRows({ adjustUsable: true, singleSize: true, adjustOn: true }).map((c) => c.text), ['Continue as is', 'Adjust ports again (click each port)']);
  assert.deepEqual(sizeChoiceRows({ adjustUsable: true, adjustOn: true }).map((c) => c.text), ['Use port sizes as is', 'Edit port sizes', 'Adjust ports again (click each port)']);
  assert.equal(sizeChoiceRows({ adjustUsable: false, adjustOn: true }).length, 2, 'no adjust row when it cannot be used');
  assert.deepEqual(sizeChoiceRows({ adjustUsable: false }).map((c) => c.id), ['asis', 'edit'], 'per-port rows unchanged');
});

test('escStepPlan: one step back at ready, then native cancels', () => {
  const a = (o) => escStepPlan({ ready: true, mode: 'sizes', stage: 'confirmed', lastCall: false, ...o }).action;
  assert.equal(a({}), 'reopen', 'per-port, confirmed: the rows come back');
  for (const stage of ['idle', 'choice', 'edit', 'dismissed']) assert.equal(a({ stage }), 'pass', 'per-port ' + stage);
  assert.equal(a({ mode: 'ports' }), 'lastcall', 'one size, confirmed: warn first');
  for (const stage of ['idle', 'choice', 'dismissed']) assert.equal(a({ mode: 'ports', stage }), 'pass', 'one size ' + stage);
  assert.equal(a({ mode: null, stage: 'idle' }), 'lastcall', 'no step at all: warn first');
  assert.equal(a({ mode: null, lastCall: true }), 'leave', 'second Esc: native cancels');
  assert.equal(a({ lastCall: true }), 'leave');
  assert.equal(a({ ready: false }), 'pass', 'not at ready');
  assert.equal(a({ ready: false, lastCall: true }), 'pass', 'not at ready, even with a stale flag');
});
