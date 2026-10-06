// Pure logic for choosing a fitting label in native's "Place Fitting" panel. Takes a plain snapshot
// of that panel (read by src/pipe/pipe-host.js) and returns what the bar should show and what a
// typed word means. No DOM, no clicks: the host layer does those.
//
// Snapshot shape (all plain data):
//   { open, tool, hint, groups: [{ ports, usable, options: [{ id, label, usable }] }] }
import { matchCommands } from './command-line-core.js';

function lower(value) {
  return String(value ?? '').trim().toLowerCase();
}

// Which phase native's hint line says it is in. "Starts with", because native appends extra
// sentences (auto-matched diameter, per-port notes) to the same line.
export function panelPhase(hint, prefixes) {
  const text = String(hint ?? '').trim();
  for (const phase of Object.keys(prefixes ?? {})) {
    const options = Array.isArray(prefixes[phase]) ? prefixes[phase] : [prefixes[phase]];
    if (options.some((prefix) => text.startsWith(prefix))) return phase;
  }
  return 'unknown';
}

// Ids from `required` that are not in `present` (both plain arrays of ids).
export function missingIds(required, present) {
  const have = new Set(present ?? []);
  return (required ?? []).filter((id) => !have.has(id));
}

// What the bar should do about the placement panel's hint right now.
//   hint        the hint text (may be empty while native is still drawing the panel)
//   lastWarned  the hint we already warned about (so the warning is shown once, not every tick)
// Returns { action: 'ok' | 'warn' | 'quiet', hint }.
export function hintWatch({ open, hint, prefixes, lastWarned }) {
  if (!open) return { action: 'ok', hint: null };
  const text = String(hint ?? '').trim();
  if (!text) return { action: 'quiet', hint: lastWarned ?? null };
  if (panelPhase(text, prefixes) !== 'unknown') return { action: 'ok', hint: null };
  return text === lastWarned ? { action: 'quiet', hint: lastWarned } : { action: 'warn', hint: text };
}

// The auto-matched run diameter native mentions in the hint (e.g. `2"`), or null.
export function autoMatchedDiameter(hint, pattern) {
  const m = String(hint ?? '').match(pattern);
  return m ? m[1] + '"' : null;
}

// Extra names for one family in the menu that is open now. Fitting menu: the curated table.
// Fixture menu: the family id with its prefix removed (native's own short ids, wc, lav, ...).
export function aliasesFor({ id, tool, curated, fixtureTool, fixturePrefixes }) {
  const key = lower(id);
  if (tool === fixtureTool) {
    for (const prefix of fixturePrefixes ?? []) {
      if (key.startsWith(prefix) && key.length > prefix.length) return [key.slice(prefix.length)];
    }
    return [];
  }
  return (curated?.[id] ?? []).map(lower);
}

// Readable name for one family in the fixture menu, or null (then native's own text is shown).
export function displayNameFor({ id, tool, fixtureTool, fixturePrefixes, names }) {
  if (tool !== fixtureTool) return null;
  const short = aliasesFor({ id, tool, curated: {}, fixtureTool, fixturePrefixes })[0];
  return (short && names && Object.prototype.hasOwnProperty.call(names, short)) ? names[short] : null;
}

// Flat list of every fitting in the open menu as table entries (name = native's family id).
export function menuEntries({ groups, tool, curated, fixtureTool, fixturePrefixes, fixtureNames }) {
  const entries = [];
  for (const group of groups ?? []) {
    for (const option of group.options ?? []) {
      entries.push({
        id: option.id, name: lower(option.id), label: String(option.label ?? option.id),
        display: displayNameFor({ id: option.id, tool, fixtureTool, fixturePrefixes, names: fixtureNames }),
        aliases: aliasesFor({ id: option.id, tool, curated, fixtureTool, fixturePrefixes }),
        ports: group.ports, usable: option.usable === true && group.usable !== false,
      });
    }
  }
  return entries;
}

// Port-count categories with how many fittings in each can be picked right now.
export function categoriesOf(entries) {
  const byPorts = new Map();
  for (const e of entries) {
    const c = byPorts.get(e.ports) ?? { ports: e.ports, count: 0, usableCount: 0 };
    c.count += 1;
    if (e.usable) c.usableCount += 1;
    byPorts.set(e.ports, c);
  }
  return Array.from(byPorts.values()).sort((a, b) => a.ports - b.ports);
}

// Usable first, original order kept inside each half.
function usableFirst(entries) {
  return entries.filter((e) => e.usable).concat(entries.filter((e) => !e.usable));
}

// What the bar should list, given what has been typed so far.
//   category   null, or the port count already chosen
//   query      the text typed in the bar
// Returns { stage: 'none' | 'category' | 'label', category, items }.
// Item kinds: { kind: 'category', ports, count, usable } and { kind: 'fitting', entry }.
// Enter takes the first item, so ranking decides what "typing a fitting name picks it directly"
// means: an exact id/label/alias is always first.
export function labelStep({ entries, category = null, query = '' }) {
  const usableAny = entries.some((e) => e.usable);
  if (!usableAny) return { stage: 'none', category: null, items: [] };
  const q = lower(query);
  const cats = categoriesOf(entries);
  const usableCats = cats.filter((c) => c.usableCount > 0);

  if (category !== null) {
    const pool = entries.filter((e) => e.ports === category);
    const ranked = q ? matchCommands(pool, q) : pool;
    return { stage: 'label', category, items: usableFirst(ranked).map((entry) => ({ kind: 'fitting', entry })) };
  }

  if (q) {
    const matches = usableFirst(matchCommands(entries, q)).map((entry) => ({ kind: 'fitting', entry }));
    // A single digit that names a usable category (1-4 ports) is listed first, so "3" + Enter picks
    // the 3-port category while "45" (typed on past the 4) still reaches the 45-degree elbow.
    if (/^[0-9]$/.test(q)) {
      const hit = usableCats.find((c) => String(c.ports) === q);
      if (hit) return { stage: 'category', category: null, items: [{ kind: 'category', ports: hit.ports, count: hit.usableCount, usable: true }, ...matches] };
    }
    return { stage: 'label', category: null, items: matches };
  }

  // Nothing typed. One usable category: skip the category step.
  if (usableCats.length === 1) {
    const only = usableCats[0].ports;
    const pool = entries.filter((e) => e.ports === only);
    return { stage: 'label', category: only, items: usableFirst(pool).map((entry) => ({ kind: 'fitting', entry })) };
  }
  const items = usableCats.map((c) => ({ kind: 'category', ports: c.ports, count: c.usableCount, usable: true }))
    .concat(cats.filter((c) => c.usableCount === 0).map((c) => ({ kind: 'category', ports: c.ports, count: 0, usable: false })));
  return { stage: 'category', category: null, items };
}

// What Enter does with a chosen item.
export function planPick(item) {
  if (!item) return { action: 'status', message: 'nothing matches' };
  if (item.kind === 'category') {
    return item.usable
      ? { action: 'category', ports: item.ports }
      : { action: 'status', message: item.ports + '-port fittings: none available for this box' };
  }
  if (!item.entry.usable) return { action: 'status', message: item.entry.label + ': not available for this box' };
  return { action: 'choose', id: item.entry.id, label: item.entry.display ?? item.entry.label };
}

// Isolation while a placement panel is open: only the ways out and the view/undo actions run.
// `allowed` is PIPE_ISOLATION_ALLOWED. Fails closed: an unknown name is refused.
export function isolationVerdict({ panelOpen, name, allowed }) {
  if (!panelOpen) return { ok: true };
  if ((allowed ?? []).includes(lower(name))) return { ok: true };
  return { ok: false, message: lower(name) + ': finish or cancel the fitting first (Esc cancels it)' };
}

/* ---------- Step 3: port prompts and Enter-to-Finish ---------- */

// The role native is asking for in the ports phase ("Click the detected intersection for inlet."), or
// null. Display only: native's own hint is missingPorts()[0], so it already skips ports native
// detected; we deliberately show no "n of N" because that count would be a guess.
export function portRoleFromHint(hint, pattern) {
  const m = String(hint ?? '').match(pattern);
  return m ? m[1] : null;
}

// Is this element one we must never click, whatever else is true? By its text (the size-mismatch
// toast's "Resize anyway") or by living inside a forbidden container (the toast stack).
//   target { text, ancestorIds }
export function targetForbidden(target, { forbiddenTexts = [], forbiddenContainerIds = [] } = {}) {
  const text = lower(target?.text);
  if (text && forbiddenTexts.some((t) => text === lower(t))) return true;
  const ancestors = target?.ancestorIds ?? [];
  return forbiddenContainerIds.some((id) => ancestors.includes(id));
}

// May Enter in the bar click Finish right now? Every condition is re-read by the caller at the moment
// of the click and this runs again. Returns { ok: true } or { ok: false, reason, message } where
// `message` is null when the key should just do nothing (the bar says something only where the
// person could be confused).
//   f { key, repeat, barFocused, barEmpty, panelOpen, hint, tool, allowedTools, finishPrefix,
//       latched, button: { found, id, expectedId, visible, disabled, ariaDisabled, forbidden } }
export function finishVerdict(f) {
  const no = (reason, message = null) => ({ ok: false, reason, message });
  if (f?.key !== 'Enter') return no('not-enter');
  if (f.repeat) return no('repeat');
  if (!f.barFocused || !f.barEmpty) return no('bar');
  if (!f.panelOpen) return no('no-panel');
  if (!String(f.hint ?? '').trim().startsWith(f.finishPrefix ?? '\u0000')) return no('phase');
  if (!(f.allowedTools ?? []).includes(lower(f.tool))) {
    return no('tool', 'Finish from the bar is only for fitting and fixture: use the mouse for this one');
  }
  // Step 3b: a fitting with per-port sizes needs its sizes confirmed first (see pipe-size-core.js).
  if (f.sizesGate && f.sizesGate.ok === false) return { ...no(f.sizesGate.reason, f.sizesGate.message), reopen: !!f.sizesGate.reopen };
  if (f.latched) return no('latched');
  const b = f.button ?? {};
  if (!b.found || b.id !== b.expectedId || b.forbidden || !b.visible) return no('button', 'Finish is not available on this page right now');
  if (b.disabled || b.ariaDisabled === true || b.ariaDisabled === 'true') {
    return no('disabled', 'Finish is not available yet: the app has it disabled (is a port size missing?)');
  }
  return { ok: true };
}

// The latch that stops a second Enter from finishing twice. Set when we click Finish. It is released
// when native has shown something other than "ready" (saving) and then comes back to "ready" (a failed
// save: native restores the ready phase), when the panel closes (saved or cancelled), or after
// `expireMs` if native never left ready (the click was ignored).
export const FINISH_LATCH_OFF = { clicked: false, at: 0, leftReady: false };
export function finishLatchClick(now) {
  return { clicked: true, at: now, leftReady: false };
}
export function finishLatchStep({ latch, phase, panelOpen, now, expireMs }) {
  if (!latch?.clicked) return FINISH_LATCH_OFF;
  if (!panelOpen) return FINISH_LATCH_OFF;
  if (phase !== 'ready') return latch.leftReady ? latch : { ...latch, leftReady: true };
  if (latch.leftReady) return FINISH_LATCH_OFF;
  if (now - latch.at > expireMs) return FINISH_LATCH_OFF;
  return latch;
}

/* ---------- Step 3c: Adjust ports ---------- */

// "branch_a" -> "branch A", "inlet" -> "inlet". Display only: native's own role names are unchanged.
export function roleDisplayName(role) {
  const r = String(role ?? '');
  const m = r.match(/^(.*)_([a-z])$/);
  return m ? `${m[1].replace(/_/g, ' ')} ${m[2].toUpperCase()}` : r.replace(/_/g, ' ');
}

// Where `role` sits in the family's port list: { n, N, done } (n is 1-based; done = the roles before it),
// or null when the role is not in the list. Exact only while Adjust ports is on, because Adjust asks for
// every role from scratch, in catalog order.
export function portProgress(role, portContract) {
  const list = portContract ?? [];
  const i = list.indexOf(role);
  return i === -1 ? null : { n: i + 1, N: list.length, done: list.slice(0, i) };
}

// The line shown while native asks for a port. `adjustOn` is whether native's Adjust ports box is ticked.
// With Adjust on and the roles known: "click: outlet (2 of 4)  done: inlet  (click an assigned port again to undo)".
// Otherwise role only (native skips the ports it already detected, so a count there would be a guess).
export function portLine({ role, adjustOn, portContract }) {
  const name = roleDisplayName(role);
  const prog = adjustOn ? portProgress(role, portContract) : null;
  if (!prog) return 'click: ' + name;
  const done = prog.done.length ? '  done: ' + prog.done.map(roleDisplayName).join(', ') : '';
  return `click: ${name} (${prog.n} of ${prog.N})${done}  (click an assigned port again to undo)`;
}

// May the bar tick or untick Adjust ports right now? Only while a placement panel is open in the ready or
// ports phase and native's own checkbox is there, visible and enabled. It saves nothing (native keeps it as
// placement state), but it does reset which port is which, so it is never done by accident.
//   f { panelOpen, phase, found, visible, disabled }
export function adjustVerdict(f) {
  const no = (reason, message) => ({ ok: false, reason, message });
  if (!f?.panelOpen) return no('no-panel', 'adjust ports: no fitting is being placed');
  if (f.phase !== 'ready' && f.phase !== 'ports') return no('phase', 'adjust ports: choose the fitting label first');
  if (!f.found || !f.visible) return no('no-checkbox', 'adjust ports: the app shows no Adjust ports option here (it needs detected pipe intersections and a chosen fitting)');
  if (f.disabled) return no('disabled', 'adjust ports: the app has it disabled right now');
  return { ok: true };
}
