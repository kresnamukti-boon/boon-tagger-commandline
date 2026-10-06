// Pure logic for `#` system search on the piping page: turn the page's system dropdown into a list,
// and decide whether choosing one is safe right now. No DOM, no clicks.
//
// Why a safety decision exists at all: native's change handler on #graph-system-select
// (graph-session-entry.js) does two different things. With NOTHING selected on the drawing it only
// sets the system the next route will use (no save). With a pipe selected it REASSIGNS that pipe
// to the chosen system, which submits a real command to the autosave journal. So choosing a system
// is only allowed when nothing is selected, and fails closed when that can't be read.
import { matchTags } from './search-core.js';

// [{ value, text }] from the dropdown's options -> [{ id, name }], skipping the blank placeholder.
export function systemsFromOptions(options) {
  const list = [];
  for (const o of options ?? []) {
    const id = String(o?.value ?? '');
    if (!id) continue;
    list.push({ id, name: String(o?.text ?? '').trim() || id });
  }
  return list;
}

// Ranked list for what was typed after the `#` (empty = every system, in the page's own order).
export function matchSystems(systems, query) {
  return matchTags(systems, query).map((r) => r.tag);
}

// May this system be chosen right now?
//   facts { found, disabled, selectionReadable, selectedEntityId }
// Returns { ok } or { ok: false, message }.
export function systemPickVerdict(facts) {
  if (!facts?.found) return { ok: false, message: 'system: the system dropdown was not found on this page' };
  if (facts.disabled) return { ok: false, message: 'system: the system dropdown is disabled right now (view only?)' };
  if (!facts.selectionReadable) {
    return { ok: false, message: 'system: could not tell whether something is selected on the drawing, so nothing was changed' };
  }
  if (facts.selectedEntityId) {
    return {
      ok: false,
      message: 'system: something is selected on the drawing, and choosing a system now would reassign it (that saves). Deselect it first, then try again',
    };
  }
  return { ok: true };
}

// Typed text -> is this a system query? Returns the part after `#`, or null.
export function systemQuery(text) {
  const t = String(text ?? '');
  return t.startsWith('#') ? t.slice(1) : null;
}
