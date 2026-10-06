// Pure helpers for the bar's action log: a short, in-memory record of what the bar itself clicked or
// wrote, so that after a live test it is possible to tell the bar's actions from the person's own
// (mouse, native's Enter, native's undo). Nothing here stores, sends or writes anything.

// Append `entry` and keep only the newest `max` entries. Returns a new array (never mutates).
export function appendLog(log, entry, max) {
  const next = (log ?? []).concat([entry]);
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : 1;
  return next.length > cap ? next.slice(next.length - cap) : next;
}

// A log entry. `rev*` are revision numbers (or null when unreadable); `revAfter` is filled in later.
export function makeLogEntry({ at, what, kind, hint, tool, revBefore }) {
  return {
    at, time: new Date(at).toISOString(), kind: String(kind ?? ''), what: String(what ?? ''),
    hint: String(hint ?? ''), tool: tool ?? null,
    revBefore: Number.isFinite(revBefore) ? revBefore : null, revAfter: null,
  };
}

// Revision number from native's status text ("R14") or a plain number; null if unreadable.
export function parseRevision(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const m = String(value ?? '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// One short line per entry, for printing in the console.
export function formatLog(log) {
  return (log ?? []).map((e) => {
    const rev = e.revAfter === null ? `R${e.revBefore ?? '?'} -> ?` : `R${e.revBefore ?? '?'} -> R${e.revAfter}`;
    return `${e.time}  ${e.kind}  ${e.what}  [${rev}]  tool=${e.tool ?? '-'}  hint="${e.hint.slice(0, 60)}"`;
  });
}
