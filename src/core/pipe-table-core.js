// Pure logic for the piping command line: turning a plain snapshot of the page's tool rail into a
// command table, deciding whether an entry may run right now, and deciding whether the loader may
// start at all. No DOM, no host globals; every fact arrives as an argument and every decision comes
// back as plain data, so the host layer (src/pipe/pipe-host.js) has nothing to decide.
//
// Doctrines carried over from the duct side: the live page is authoritative (the key badge, never a
// hardcoded key), a hard boundary is enforced in code and not only by leaving something out of a
// table (forbidden controls are checked again here), and when live state can't be read the answer
// is "don't".
import { resolveCommand } from './command-line-core.js';
import { shadowedActions } from './table-core.js';
import { targetForbidden } from './pipe-placement-core.js';

const KEY_RE = /^[a-z0-9]$/;

function lower(value) {
  return String(value ?? '').trim().toLowerCase();
}

// Builds the tool half of the table from the rail's own buttons.
//   railTools    [{ id, key, label }] in on-screen order (id = data-tool, key = badge text)
//   fallbackKeys { toolId: 'x' } used only when a button has no readable badge
//   curatedAliases { toolId: ['a', ...] }
//   actions      the action table; its names/aliases are reserved so a tool alias can't shadow one
// Never drops a tool for a key problem: dispatch is a click on the tool's own button, so the key is
// only an extra alias. A duplicate data-tool is the one thing skipped (it can't be told apart).
export function deriveTools({ railTools, fallbackKeys = {}, curatedAliases = {}, actions = [] }) {
  const info = { source: 'none', skipped: [], aliasDropped: [], shadowedActions: [] };
  const tools = [];
  const seenName = new Set();
  const seenKey = new Set();
  for (const raw of railTools ?? []) {
    const name = lower(raw?.id);
    if (!name) continue;
    if (seenName.has(name)) { info.skipped.push(`${name}: duplicate data-tool`); continue; }
    let key = lower(raw.key);
    if (!KEY_RE.test(key)) {
      const fallback = lower(fallbackKeys[name]);
      if (KEY_RE.test(fallback)) {
        info.skipped.push(`${name}: no key badge, used built-in "${fallback}"`);
        key = fallback;
      } else {
        info.skipped.push(`${name}: no key badge and no built-in key (reachable by name only)`);
        key = '';
      }
    }
    if (key && seenKey.has(key)) {
      info.skipped.push(`${name}: key "${key}" already taken (reachable by name only)`);
      key = '';
    }
    seenName.add(name);
    if (key) seenKey.add(key);
    tools.push({
      id: name, name, kind: 'tool',
      label: String(raw.label ?? '').trim() || name,
      key: key || null,
      aliases: [],
    });
  }
  if (!tools.length) return { tools, info };
  info.source = 'toolbar';

  const reserved = new Set();
  for (const action of actions) {
    reserved.add(lower(action.name));
    for (const alias of action.aliases ?? []) reserved.add(lower(alias));
  }
  const taken = new Set();
  const accept = (tool, alias, why) => {
    const a = lower(alias);
    if (!a) return;
    if (seenName.has(a) && a !== tool.name) { info.aliasDropped.push(`${tool.name}: "${a}" (${why}: another tool's name)`); return; }
    if (reserved.has(a)) { info.aliasDropped.push(`${tool.name}: "${a}" (${why}: an action's name or alias)`); return; }
    if (taken.has(a)) { info.aliasDropped.push(`${tool.name}: "${a}" (${why}: already another alias)`); return; }
    taken.add(a);
    tool.aliases.push(a);
  };
  // Keys first, so a curated alias can never take a key letter away from the tool that owns it.
  for (const tool of tools) if (tool.key) accept(tool, tool.key, 'key');
  for (const tool of tools) for (const alias of curatedAliases[tool.name] ?? []) accept(tool, alias, 'alias');

  info.shadowedActions = shadowedActions(tools, actions);
  return { tools, info };
}

// Tools first, then actions: table order is the resolution rule (a tool wins its own name).
export function buildTable(tools, actions) {
  return tools.concat(actions.map((action) => ({ ...action, kind: 'action' })));
}

// Can this entry run right now? `target` is a plain description of the page element the entry would
// click (or null when there is none): { exists, disabled, ariaDisabled, visible, title, id, captureId }.
// Entries whose control is a forbidden one are refused even when the element is perfectly clickable.
export function entryState(entry, target, { forbiddenIds = [], forbiddenCaptureIds = [], forbiddenTexts = [], forbiddenContainerIds = [] } = {}) {
  if (target && targetForbidden(target, { forbiddenTexts, forbiddenContainerIds })) return { usable: false, forbidden: true, reason: null };
  if (entry?.btn && forbiddenIds.includes(entry.btn)) return { usable: false, forbidden: true, reason: null };
  if (!target || !target.exists) return { usable: false, forbidden: false, reason: 'not on this page' };
  if (forbiddenIds.includes(target.id) || forbiddenCaptureIds.includes(target.captureId)) {
    return { usable: false, forbidden: true, reason: null };
  }
  if (target.disabled || target.ariaDisabled === true || target.ariaDisabled === 'true') {
    // A disabled tool's own title carries native's reason ("Enter a positive diameter before ...");
    // a title equal to the label is just the normal tooltip, not a reason.
    const title = String(target.title ?? '').trim();
    const reason = entry.kind === 'tool' && title && lower(title) !== lower(entry.label) ? title : 'disabled right now';
    return { usable: false, forbidden: false, reason };
  }
  if (!target.visible) return { usable: false, forbidden: false, reason: 'hidden right now' };
  return { usable: true, forbidden: false, reason: null };
}

// What to do with an entry the user picked. `state` is entryState's result for it.
export function planEntry(entry, state) {
  if (state.forbidden) {
    return { action: 'refuse', message: `refused: "${entry.name}" is a protected control` };
  }
  if (!state.usable) {
    const label = entry.label ?? entry.name;
    return { action: 'status', message: state.reason ? `${label}: ${state.reason}` : `${label} isn't available right now` };
  }
  return { action: 'click', entry };
}

// Typed text -> plan. Exact name/label, then exact alias (resolveCommand's own rule); a bare prefix
// is never run, only listed. `stateFor(entry)` supplies entryState for the resolved entry.
export function planQuery(table, query, stateFor) {
  const entry = resolveCommand(table, query);
  if (!entry) return { action: 'status', message: `unknown command: ${String(query ?? '').trim()}` };
  // A refused plan still names the entry, so the caller can say why instead of running something else.
  return { ...planEntry(entry, stateFor(entry)), entry };
}

// Which entries the dropdown lists: every tool (a disabled one stays visible so its reason can be
// shown), but an action that couldn't do anything right now is left out, as on the duct side.
// `stateFor(entry)` supplies entryState; the result keeps each entry with its state attached.
export function listEntries(table, stateFor) {
  const rows = [];
  for (const entry of table) {
    const state = stateFor(entry);
    if ((entry.kind === 'action' || entry.kind === 'adjust' || entry.kind === 'setting') && !state.usable) continue;
    rows.push({ entry, state });
  }
  return rows;
}

// Which tool the command line should consider armed. Our own record wins right after one of our own
// commands (the page's state may not have settled); after the grace window, a readable live tool
// string corrects drift caused by the user arming tools some other way (rail click, native hotkey).
//   own  { armed, tool }   live  string | null | undefined   (the page's current tool)
export function reconcileArmed({ own, live, sinceLastCmdMs, graceMs = 1000 }) {
  if (typeof live !== 'string') return { armed: !!own?.armed, tool: own?.tool ?? null };
  if (Number.isFinite(sinceLastCmdMs) && sinceLastCmdMs < graceMs) return { armed: !!own?.armed, tool: own?.tool ?? null };
  const tool = lower(live);
  if (!tool || tool === 'select') return { armed: false, tool: null };
  return { armed: true, tool };
}

// May the piping loader start? Everything arrives as plain facts.
//   facts { hasRoot, trade, hasStage, railToolCount, nativeBarOn, ductLoaderInstalled, pipeTrade }
// Returns { ok, message } where message tells a non-programmer exactly what to do.
export function loaderGuard(facts) {
  const pipeTrade = facts.pipeTrade ?? 'piping';
  if (!facts.hasRoot) return { ok: false, message: 'This is not a graph session page. Open a piping session and paste again.' };
  if (facts.trade !== pipeTrade) {
    return { ok: false, message: `This page is a "${facts.trade ?? 'unknown'}" page, not a piping page. Use the duct command line loader here.` };
  }
  if (facts.ductLoaderInstalled) {
    return { ok: false, message: 'The duct command line is already loaded on this page. Reload the page, then paste the piping loader.' };
  }
  if (!facts.hasStage || !(facts.railToolCount > 0)) {
    return { ok: false, message: 'The page is not ready yet (no tool rail found). Wait for the drawing to load and paste again.' };
  }
  if (facts.nativeBarOn) {
    return { ok: false, message: 'Native\'s own "⌨ Command line" is switched ON. Switch it off (click it once), then paste again: both would grab the same keys.' };
  }
  return { ok: true, message: '' };
}
