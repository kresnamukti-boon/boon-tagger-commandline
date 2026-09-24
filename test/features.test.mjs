// Unit tests for src/features/*.js — DOM-touching but host-agnostic
// modules, one layer up from src/core/'s pure functions (see test/
// core.test.mjs). Every DOM access here is a plain injected function, so
// these tests use simple in-memory stand-ins rather than the full DOM stub
// verify_cmdline.js builds — that harness remains the safety net for
// anything that actually needs a real document.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isElementVisible, isActionUsable } from '../src/features/actions.js';

// ---------- isElementVisible ----------

test('isElementVisible: true when offsetParent is set', () => {
  assert.equal(isElementVisible({ offsetParent: {} }), true);
});

test('isElementVisible: true when getClientRects reports at least one rect (offsetParent null, e.g. position:fixed)', () => {
  assert.equal(isElementVisible({ offsetParent: null, getClientRects: () => [{}] }), true);
});

test('isElementVisible: false when neither signal is present', () => {
  assert.equal(isElementVisible({ offsetParent: null, getClientRects: () => [] }), false);
  assert.equal(isElementVisible({ offsetParent: null }), false);
});

// ---------- isActionUsable ----------

function button(props) {
  return { getAttribute: () => null, ...props };
}
function deps({ buttons = {}, forbiddenIds = [] } = {}) {
  return {
    getButtonById: (id) => buttons[id] ?? null,
    forbiddenIds,
    isVisible: (el) => el.visible !== false,
  };
}

test('isActionUsable: an entry with no .btn is always usable (a tool switch, or a compound command)', () => {
  assert.equal(isActionUsable({ name: 'route' }, deps()), true);
  assert.equal(isActionUsable({ name: 'dimension' }, deps()), true);
});

test('isActionUsable: a forbidden button id refuses even if the button itself would look fine', () => {
  const d = deps({ buttons: { save: button({ disabled: false, visible: true }) }, forbiddenIds: ['save'] });
  assert.equal(isActionUsable({ btn: 'save' }, d), false);
});

test('isActionUsable: a missing button (never on this page) refuses', () => {
  assert.equal(isActionUsable({ btn: 'zzz' }, deps()), false);
});

test('isActionUsable: visible-but-disabled refuses (finish/cancel idle idiom)', () => {
  const d = deps({ buttons: { finish: button({ disabled: true, visible: true }) } });
  assert.equal(isActionUsable({ btn: 'finish' }, d), false);
});

test('isActionUsable: aria-disabled="true" refuses the same as the disabled property', () => {
  const d = deps({ buttons: { finish: button({ disabled: false, visible: true, getAttribute: () => 'true' }) } });
  assert.equal(isActionUsable({ btn: 'finish' }, d), false);
});

test('isActionUsable: hidden-but-not-disabled refuses (assign-network/toggle-damper idiom)', () => {
  const d = deps({ buttons: { damper: button({ disabled: false, visible: false }) } });
  assert.equal(isActionUsable({ btn: 'damper' }, d), false);
});

test('isActionUsable: visible and enabled is usable', () => {
  const d = deps({ buttons: { undo: button({ disabled: false, visible: true }) } });
  assert.equal(isActionUsable({ btn: 'undo' }, d), true);
});
