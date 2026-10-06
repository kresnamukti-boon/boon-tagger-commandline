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
    if (text.startsWith(prefixes[phase])) return phase;
  }
  return 'unknown';
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
