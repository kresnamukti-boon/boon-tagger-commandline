// Pure logic for port sizes on reducing fittings (Step 3b): parsing what a person types, formatting,
// deciding how to put a size into native's select + custom pair, the max-size rule, the choice/edit
// steps, and the guard that keeps us from ever editing an EXISTING fitting. No DOM, no clicks.
//
// parseSizeInput / formatSize are copies of native's parsePipeDiameter / formatPipeDiameter
// (pipe-diameter.js); test/native-ids.test.mjs runs both against native's own file on a set of inputs
// whenever the saved copy is present, so a change in native shows up as a failing test.

export const SIZE_MIN_IN = 0.375; // native's own "Range 3/8 to 48 inches"
export const SIZE_MAX_IN = 48;
export const NOMINAL_SIZES_IN = [
  0.375, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24, 30, 36, 42, 48,
];

const FRACTION_PATTERN = /^(?:(\d+(?:\.\d+)?)[ -])?(\d+)\/(\d+)$/;

// Typed text -> positive number or null: "2", "2.5", "3/4", "1 1/2", "1-1/2", optional " or ″ suffix.
export function parseSizeInput(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/["″]\s*$/, '').trim();
  if (trimmed === '' || trimmed.startsWith('-')) return null;
  const m = FRACTION_PATTERN.exec(trimmed);
  if (m) {
    const whole = m[1] ? Number(m[1]) : 0;
    const denominator = Number(m[3]);
    if (denominator === 0) return null;
    const value = whole + Number(m[2]) / denominator;
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '.') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function formatSize(value) {
  if (!Number.isFinite(value) || value <= 0) return '';
  const whole = Math.trunc(value);
  const fraction = value - whole;
  if (fraction === 0) return String(whole);
  for (const denominator of [2, 4, 8, 16, 32]) {
    const numerator = fraction * denominator;
    if (Number.isInteger(numerator)) {
      return whole === 0 ? `${numerator}/${denominator}` : `${whole}-${numerator}/${denominator}`;
    }
  }
  return String(value);
}

// What a person typed in the bar -> { ok, value } or { ok: false, message }.
export function planSizeInput(raw) {
  const value = parseSizeInput(raw);
  if (value === null) return { ok: false, message: 'not a size (try 2, 1-1/2, 3/4 or 1.75)' };
  if (value < SIZE_MIN_IN || value > SIZE_MAX_IN) return { ok: false, message: 'sizes run from 3/8" to 48"' };
  return { ok: true, value };
}

// How to put `value` into native's pair: a standard option on the select, or "custom" + text.
// `optionValues` are the select's own option values ("", "0.375", ..., "custom").
export function planSizeWrite(value, optionValues) {
  const hit = (optionValues ?? []).find((o) => o !== '' && o !== 'custom' && Number(o) === value);
  return hit !== undefined ? { mode: 'select', selectValue: hit } : { mode: 'custom', customText: formatSize(value) };
}

// The size a select + custom pair currently holds (null when blank or unreadable).
export function effectiveSize({ selectValue, customValue }) {
  return parseSizeInput(selectValue === 'custom' ? customValue : selectValue);
}

// "Inlet / Outlet diameter (in)" -> ['inlet', 'outlet']
export function rolesFromLabel(label) {
  return String(label ?? '').replace(/diameter.*$/i, '').split('/').map((r) => r.trim().toLowerCase()).filter(Boolean);
}

// Per-role sizes from the fields (each field covers one or more roles).
//   fields [{ label, selectValue, customValue }]  ->  { role: number | null }
export function roleSizes(fields) {
  const out = {};
  for (const f of fields ?? []) {
    const size = effectiveSize(f);
    for (const role of rolesFromLabel(f.label)) out[role] = size;
  }
  return out;
}

// The max-size rule from the catalog ({ outlet: 'inlet', branch: 'inlet' } = outlet and branch may not be
// larger than inlet). Returns messages for every broken pair; unknown sizes are skipped.
export function maxViolations(sizes, maximumProfileByPort) {
  const out = [];
  for (const [role, limitRole] of Object.entries(maximumProfileByPort ?? {})) {
    const size = sizes?.[role], limit = sizes?.[limitRole];
    if (size == null || limit == null) continue;
    if (size > limit) out.push(`${role} ${formatSize(size)}" is larger than ${limitRole} ${formatSize(limit)}": the server will reject it`);
  }
  return out;
}

// May the bar write sizes right now? Only while a NEW placement is open and ready. Native's per-port
// fields also edit an EXISTING selected fitting (a change there is a saved command), so anything
// selected on the drawing, or a selection we cannot read, means no.
//   f { panelOpen, ready, selectionReadable, selectedEntityId, fieldDisabled }
export function sizeWriteVerdict(f) {
  const no = (reason, message) => ({ ok: false, reason, message });
  if (!f?.panelOpen) return no('no-panel', 'port sizes: no fitting is being placed');
  if (!f.ready) return no('not-ready', 'port sizes: wait until the app says "Finish inserts this fitting."');
  if (!f.selectionReadable) return no('selection-unreadable', 'port sizes: could not tell whether something is selected, so nothing was changed');
  if (f.selectedEntityId) {
    return no('selected', 'port sizes: something is selected on the drawing, and changing its sizes would save. Deselect it first (or use the mouse)');
  }
  if (f.fieldDisabled) return no('locked', 'port sizes: that port is locked to the pipe it attaches to');
  return { ok: true };
}

// The two rows shown at ready for a per-port fitting.
export const SIZE_CHOICES = [
  { id: 'asis', text: 'Use port sizes as is' },
  { id: 'edit', text: 'Edit port sizes' },
];

// Which fields the edit step asks about, in order: the ones that are not locked.
export function editableFields(fields) {
  return (fields ?? []).filter((f) => !f.disabled);
}

// The state of the sizes step for the current placement.
//   stage: 'idle' | 'choice' | 'edit' | 'confirmed' | 'dismissed'
export const SIZES_IDLE = { stage: 'idle', key: null, index: 0, drafts: {} };

// A key that changes when the placement (or its family / set of fields) changes, so a stale
// confirmation never carries over.
export function sizesKey({ placement, familyId, roles }) {
  return `${placement}|${familyId ?? ''}|${(roles ?? []).join(',')}`;
}

// What the sizes step needs from the page this tick. Returns { action }:
//   'none'    nothing to do (no per-port fitting, or not at ready)
//   'open'    show the two rows
//   'blocked' per-port fitting at ready, but something is selected (say so once)
export function sizesTickPlan({ state, key, perPort, ready, selectedEntityId, selectionReadable }) {
  if (!perPort || !ready) return { action: 'none' };
  if (!selectionReadable || selectedEntityId) return { action: 'blocked' };
  if (state?.key === key && state.stage !== 'idle') return { action: 'none' };
  return { action: 'open' };
}

// The recheck right before Finish: have the sizes changed since the person confirmed them?
export function sizesChanged(confirmed, current) {
  const a = confirmed ?? {}, b = current ?? {};
  const roles = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const r of roles) if ((a[r] ?? null) !== (b[r] ?? null)) return true;
  return false;
}

// Extra conditions on Enter-to-Finish for a fitting with per-port sizes. Returns { ok } or
// { ok: false, reason, message, reopen }. `rulesReadable` false = catalog unreadable: warn, never block.
export function sizesFinishGate({ perPort, stage, confirmed, current, violations, selectedEntityId, selectionReadable }) {
  if (!perPort) return { ok: true };
  if (!selectionReadable || selectedEntityId) {
    return { ok: false, reason: 'sizes-selected', message: 'port sizes: something is selected on the drawing; deselect it before finishing', reopen: false };
  }
  if (stage !== 'confirmed') {
    return { ok: false, reason: 'sizes-unconfirmed', message: 'port sizes: choose "Use port sizes as is" or edit them first', reopen: true };
  }
  if (sizesChanged(confirmed, current)) {
    return { ok: false, reason: 'sizes-changed', message: 'port sizes changed since you confirmed them: confirm them again', reopen: true };
  }
  if ((violations ?? []).length) {
    return { ok: false, reason: 'sizes-max', message: violations[0], reopen: true };
  }
  return { ok: true };
}
