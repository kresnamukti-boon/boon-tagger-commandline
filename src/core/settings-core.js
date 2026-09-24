// Pure helpers behind the settings drill-down (`tool.param = value`) — no
// DOM, no host globals. The DOM sweep that discovers live controls and
// writes to them stays in shell.js/src/features (a later restructure phase)
// since it genuinely needs `document`; only the label/query matching, the
// on/off parsing and the numeric clamp are pure enough to live here.

// Splits a live label into lowercase words a bare query can prefix-match
// against individually — e.g. "Width (in)" -> ['width','in'], "System /
// network" -> ['system','network'] — so typing "network" matches the
// system field by its second word, not just its first, and a query still
// matches a control whose label has changed since it was first swept.
export function labelWords(label) {
  return label ? label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) : [];
}

// Shared match predicate for both the "<tool>." drill-in list and the bare-
// param blend: a query matches a settings item if it prefixes the item's
// own id-derived param name, OR prefixes any word of its live on-screen
// label.
export function paramMatchesQuery(item, q) {
  if (!q) return true;
  if (item.param.toLowerCase().indexOf(q) === 0) return true;
  return labelWords(item.label).some((w) => w.indexOf(q) === 0);
}

// Accepts on/off/true/false/1/0/yes/no, case-insensitive. Returns null (not
// a boolean) for anything else, so a genuinely invalid value can be told
// apart from a real "off".
export function parseBoolish(value) {
  const q = String(value).trim().toLowerCase();
  if (['on', 'true', '1', 'yes'].includes(q)) return true;
  if (['off', 'false', '0', 'no'].includes(q)) return false;
  return null;
}

// Matches a typed value against a live <select>'s own options (each
// {index, value, text}, 1-based index matching the numbered list a user
// sees) — either an exact 1-based index, or the option's own text/value,
// exact match first, then a prefix match. Never hardcoded: the caller
// always builds `options` fresh from the real element.
export function matchOption(options, value) {
  const q = String(value).trim();
  const idx = parseInt(q, 10);
  if (!isNaN(idx) && String(idx) === q) {
    const byIndex = options.find((o) => o.index === idx);
    if (byIndex) return byIndex;
  }
  const ql = q.toLowerCase();
  return options.find((o) => o.text.toLowerCase() === ql || o.value.toLowerCase() === ql)
    || options.find((o) => o.text.toLowerCase().indexOf(ql) === 0)
    || null;
}

// Parses a typed numeric value and clamps it to a control's own live
// min/max (each `''`/null/undefined meaning "no bound", matching a real
// <input>'s own min/max attributes read as strings). Returns {ok:false}
// for a non-numeric value, else {ok:true, value}. Deliberately does NOT
// guard against a non-numeric min/max producing NaN (matching the exact
// original inline behavior this was extracted from, byte for byte, rather
// than silently fixing a latent edge case in the same change) — a min/max
// that doesn't parse propagates NaN through Math.max/min same as before.
export function parseAndClampNumber(value, min, max) {
  let v = parseFloat(value);
  if (isNaN(v)) return { ok: false };
  if (min !== '' && min != null) v = Math.max(parseFloat(min), v);
  if (max !== '' && max != null) v = Math.min(parseFloat(max), v);
  return { ok: true, value: v };
}
