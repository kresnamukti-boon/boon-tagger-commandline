// Pure logic for the piping "setting" commands (Step 5): diameter, dsource, material, msource. These
// four are the next-draw facts in native's "Pipe properties" block. No DOM, no clicks.
//
// Why a safety decision exists at all: native's change handlers on the diameter and diameter-source
// controls do two different things (pipe-session-ui.js). With NOTHING selected they only set what the
// next pipe will use (no save). With a resizable pipe selected they send a real resize command to the
// autosave journal (the custom box commits on blur or Enter). Material is wired to the local read
// only, but all four follow one rule: write only when nothing is selected and no fitting is being
// placed, and fail closed when the selection can't be read.
import { planSizeInput, planSizeWrite, parseSizeInput } from './pipe-size-core.js';

const lower = (s) => String(s ?? '').trim().toLowerCase();

// May the bar write this control right now? Every fact arrives as an argument.
//   f { label, found, visible, disabled, panelOpen, selectionReadable, selectedEntityId, sourceUnresolved }
// Order matters only for which reason is shown; every failing fact refuses.
export function settingVerdict(f) {
  const label = f?.label ?? 'setting';
  const no = (reason, message) => ({ ok: false, reason, message: `${label}: ${message}` });
  if (!f || !f.found) return no('missing', 'not on this page');
  if (!f.visible) return no('hidden', 'hidden right now (the app shows it only while a pipe run can be drawn)');
  if (f.disabled) return no('disabled', 'the app has it disabled right now');
  if (f.panelOpen) return no('placement', 'a fitting is being placed: finish it or press Esc first');
  if (!f.selectionReadable) return no('selection-unreadable', 'could not tell whether something is selected, so nothing was changed');
  if (f.selectedEntityId) {
    return no('selected', 'something is selected on the drawing, and changing this would change it and save. Press Esc to deselect first (resizing an existing pipe is a later step)');
  }
  if (f.sourceUnresolved) return no('unresolved', 'the diameter source is "unresolved", so the app locks the size. Set dsource first');
  return { ok: true };
}

// Typed text or a row number -> one of the select's options. `options` [{ value, text }].
// Order: row number (1-based), exact value or text, then a unique prefix, then a unique substring.
// Ambiguous or empty -> { ok: false, message }.
export function optionMatch(options, query) {
  const list = (options ?? []).map((o) => ({ value: String(o.value ?? ''), text: String(o.text ?? '') }));
  const q = lower(query);
  if (!q) return { ok: false, message: 'type or pick one of the options' };
  if (/^\d+$/.test(q)) {
    const hit = list[Number(q) - 1];
    if (hit) return { ok: true, option: hit };
  }
  const exact = list.filter((o) => lower(o.value) === q || lower(o.text) === q);
  if (exact.length === 1) return { ok: true, option: exact[0] };
  const unique = (found) => (found.length === 1 ? { ok: true, option: found[0] } : null);
  const byPrefix = list.filter((o) => lower(o.text).startsWith(q) || lower(o.value).startsWith(q));
  if (byPrefix.length) return unique(byPrefix) ?? { ok: false, message: `"${query}" matches several options: be more specific` };
  const bySub = list.filter((o) => lower(o.text).includes(q) || lower(o.value).includes(q));
  if (bySub.length) return unique(bySub) ?? { ok: false, message: `"${query}" matches several options: be more specific` };
  return { ok: false, message: `no option matches "${query}"` };
}

// Typed diameter -> how to put it into native's select + custom pair. Same parser and range as the
// port sizes; a standard size picks the option, anything else picks "custom" and fills the box.
export function diameterPlan(raw, optionValues) {
  const size = planSizeInput(raw);
  if (!size.ok) return size;
  return { ok: true, value: size.value, ...planSizeWrite(size.value, optionValues) };
}

// Did the page take what we wrote? `wanted` is a diameterPlan result ({ mode, selectValue | customText })
// or { mode: 'select', selectValue } for the select-only settings; `read` is what the controls hold now.
export function readbackVerdict(wanted, read) {
  if (!wanted || !read) return { ok: false, message: 'could not read the value back' };
  if (wanted.mode === 'custom') {
    const want = parseSizeInput(wanted.customText);
    const got = read.selectValue === 'custom' ? parseSizeInput(read.customValue) : null;
    return want !== null && got === want ? { ok: true } : { ok: false, message: 'the app shows a different size' };
  }
  return String(read.selectValue ?? '') === String(wanted.selectValue ?? '') ? { ok: true } : { ok: false, message: 'the app shows a different value' };
}

// The select's own option row -> the text shown in the bar's list.
export function optionRowText(option, index) {
  return `${index + 1}. ${option.text || option.value || '(blank)'}`;
}
