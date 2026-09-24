// Graph host: whether a button-backed action-table entry (see shell.js's
// own GRAPH_ACTIONS) is actually usable right now. DOM-touching but host-
// agnostic — every DOM access is injected, not looked up directly — so
// this is a candidate for the graph host's own native command line's
// "actions" PR (see PORTING.md): native has no button-backed action
// vocabulary of its own at all today, only tool entries.

// Confirmed live against the graph host: it uses two different disabled
// idioms across its own buttons — visible-but-disabled (finish/cancel
// while a route is idle) and hidden-but-not-disabled (assign-network/
// toggle-damper with nothing selected) — both covered here the same way.
export function isElementVisible(el) {
  return !!(el.offsetParent || (el.getClientRects && el.getClientRects().length));
}

// Read-only mirror of the actual executor's own button-resolution steps
// (never clicks anything) — lets a dropdown hide an action that would just
// be refused if picked, instead of listing it and only reporting "not
// available right now" after the fact. Entries with no `.btn` at all
// (every native tool, and any compound command with its own isolation
// exemption) always return true — this only ever gates the button-backed
// action vocabulary, never a tool switch. `forbiddenIds` is checked here
// too (not just left out of the caller's own table), matching this
// project's own "enforce in code, not just by omission" doctrine.
export function isActionUsable(entry, { getButtonById, forbiddenIds, isVisible = isElementVisible }) {
  if (!entry.btn) return true;
  if (forbiddenIds.includes(entry.btn)) return false;
  const btn = getButtonById(entry.btn);
  if (!btn) return false;
  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
  if (!isVisible(btn)) return false;
  return true;
}
