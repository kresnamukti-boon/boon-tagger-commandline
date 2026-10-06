// ===== src/pipe/pipe-tables.js =====
const __m_pipe_tables = (function(){
// Piping-specific command tables: data only, no DOM, no logic. Shaped like the
// native app's own duct-command-line.js (DUCT_GRAPH_ACTIONS / DUCT_FORBIDDEN_BUTTON_IDS /
// DUCT_ISOLATION_ALLOWED) so each export can go upstream as a one-for-one
// sibling. Every id below is checked against saved copies of native's own files by
// test/native-ids.test.mjs (see test/fixtures/native/ and test/native-ids.json).
//
// Native facts these rest on (read from constructions-tagger at bb2935ac and
// re-checked on the live page, 2026-10-06):
// - A piping page is #graph-session-root[data-trade="piping"]; a duct page is "ductwork".
// - Tool buttons are [data-tool="<id>"], each with a .graph-tool-key badge (the real hotkey).
// - Native's own piping command line only switches tools and is OFF by default.
//   This one must run with it off (both would grab the same keys).

const PIPE_TRADE = 'piping';
const DUCT_TRADE = 'ductwork';

// Page elements the loader and host layer look up.
const PIPE_PAGE_IDS = {
  root: 'graph-session-root',
  stage: 'graph-canvas-stage',
  toolSelector: '[data-tool]',
  toolKeyClass: 'graph-tool-key',
  toolLabelClass: 'graph-tool-label',
  nativeBarToggle: 'graph-command-line-toggle',
  nativeBarWindow: 'graph-command-window',
};

// Native's own PIPE_TOOL_KEYS (pipe-session-ui.js). Used only as a fallback when a rail button
// has no readable key badge; the badge on the page is authoritative.
const PIPE_FALLBACK_KEYS = {
  select: 's', route: 'r', extend: 'x', terminate: 'p', transition: 'n', cut: 'u',
  'split-run': 'k', valve: 'v', equipment: 'q', vertical: 'z', service: 'a',
  evidence: 'd', fixture: 'f', terminal: 't', fitting: 'g', occlusion: 'o',
};

// Extra names for each tool id, on top of its id, its on-screen label and its key letter
// (native already matches all three). Curated; an alias that collides with another tool's
// name/key or with an action's name/alias is dropped and reported, never silently kept.
const PIPE_TOOL_ALIASES = {
  route: ['pipe'],
  extend: ['ext'],
  terminate: ['end'],
  transition: ['size', 'changesize'],
  cut: ['split'],
  'split-run': ['splitplain'],
  fixture: ['fix'],
  equipment: ['equip'],
  vertical: ['riser'],
  service: ['assign'],
  occlusion: ['occ'],
};

// Button-backed one-shot actions. `id` mirrors `name` (native's own tool-row convention) and
// every entry carries both `label` and `aliases` (never omitted).
// Deliberately NOT here: finish/cancel (Finish saves a fitting: arrives with Enter-at-ready in
// the placement step), anything that changes page state (region, calibrate, scale), the 1D/2D
// mode toggle, and duct-only buttons.
const PIPE_GRAPH_ACTIONS = [
  { id: 'undo', name: 'undo', label: 'Undo', aliases: [], btn: 'graph-undo-command' },
  { id: 'redo', name: 'redo', label: 'Redo', aliases: ['re'], btn: 'graph-redo-command' },
  { id: 'zoomfit', name: 'zoomfit', label: 'Zoom to fit', aliases: ['zf', 'fit'], btn: 'graph-zoom-fit' },
  { id: 'zoomin', name: 'zoomin', label: 'Zoom in', aliases: ['zi'], btn: 'graph-zoom-in' },
  { id: 'zoomout', name: 'zoomout', label: 'Zoom out', aliases: ['zo'], btn: 'graph-zoom-out' },
  // No "measure" alias: native reserves the bare `m` key for its own ruler toggle, so a command
  // starting with m could never be the first thing typed.
  { id: 'ruler', name: 'ruler', label: 'Ruler', aliases: [], btn: 'graph-ruler' },
  { id: 'components', name: 'components', label: 'Components', aliases: ['comp'], btn: 'graph-components-button' },
];

// Refused in code (not just left out of the table), by DOM id and by data-capture-control-id.
// Save/recording/submit controls, the system-management buttons, and Finish/Cancel until the
// placement step handles them deliberately.
const PIPE_FORBIDDEN_BUTTON_IDS = [
  'graph-save-commands',
  'graph-recording-configure',
  'graph-recording-pause',
  'graph-recording-resume',
  'graph-recording-stop',
  'graph-recording-start',
  'graph-submission-blocked-force',
  'graph-import-systems',
  'graph-create-system',
  'graph-rename-system',
  'graph-assign-network',
  'graph-finish-route',
  'graph-cancel-route',
];
// The top-bar "Submit this page for review" button has no DOM id, only this capture id.
const PIPE_FORBIDDEN_CAPTURE_IDS = ['submit-graph'];

// Command names that stay reachable while a placement panel is open. Shipped now as data;
// enforced from the placement step onward (Step 1 has no panel state to isolate).
const PIPE_ISOLATION_ALLOWED = [
  'select', 'undo', 'redo', 'zoomfit', 'zoomin', 'zoomout',
];

return {PIPE_TRADE, DUCT_TRADE, PIPE_PAGE_IDS, PIPE_FALLBACK_KEYS, PIPE_TOOL_ALIASES, PIPE_GRAPH_ACTIONS, PIPE_FORBIDDEN_BUTTON_IDS, PIPE_FORBIDDEN_CAPTURE_IDS, PIPE_ISOLATION_ALLOWED};
})();

// ===== src/features/actions.js =====
const __m_actions = (function(){
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
function isElementVisible(el) {
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
function isActionUsable(entry, { getButtonById, forbiddenIds, isVisible = isElementVisible }) {
  if (!entry.btn) return true;
  if (forbiddenIds.includes(entry.btn)) return false;
  const btn = getButtonById(entry.btn);
  if (!btn) return false;
  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
  if (!isVisible(btn)) return false;
  return true;
}

return {isElementVisible, isActionUsable};
})();

// ===== src/pipe/pipe-host.js =====
const __m_pipe_host = (function(){
// Thin DOM layer for the piping command line: reads the page into plain snapshots and clicks native's
// own controls. No decisions live here; every decision is made by src/core/pipe-table-core.js from
// what this returns. The document and window are injected, so the same module runs against the real
// page and against the Node test harness.
const { isElementVisible } = __m_actions;

function createPipeHost({ doc, win, ids }) {
  function railButtons() {
    return Array.from(doc.querySelectorAll(ids.toolSelector));
  }

  function childWithClass(el, className) {
    for (const child of el.children || []) {
      if (String(child.className || '').split(/\s+/).indexOf(className) !== -1) return child;
    }
    return null;
  }

  function text(el) {
    return el ? String(el.textContent || '').trim() : '';
  }

  // The element an entry would click: a tool's own rail button, or an action's button by id.
  function resolve(entry) {
    if (entry.kind === 'tool') {
      return railButtons().find((el) => String(el.getAttribute('data-tool') || '').trim().toLowerCase() === entry.name) || null;
    }
    return entry.btn ? doc.getElementById(entry.btn) : null;
  }

  return {
    // Plain facts for loaderGuard.
    readPageFacts() {
      const root = doc.getElementById(ids.root);
      const toggle = doc.getElementById(ids.nativeBarToggle);
      const nativeWindow = doc.getElementById(ids.nativeBarWindow);
      return {
        hasRoot: !!root,
        trade: root ? root.getAttribute('data-trade') : undefined,
        hasStage: !!doc.getElementById(ids.stage),
        railToolCount: railButtons().length,
        nativeBarOn: (!!toggle && toggle.getAttribute('aria-pressed') === 'true') || (!!nativeWindow && !nativeWindow.hidden),
        ductLoaderInstalled: !!(win.__RW && win.__RW.vcmd),
      };
    },

    // [{ id, key, label }] in on-screen order, for deriveTools.
    readRail() {
      return railButtons().map((el) => ({
        id: el.getAttribute('data-tool') || '',
        key: text(childWithClass(el, ids.toolKeyClass)),
        label: text(childWithClass(el, ids.toolLabelClass)),
      }));
    },

    // Plain description of what an entry would click, for entryState. Null when there is nothing.
    describeTarget(entry) {
      const el = resolve(entry);
      if (!el) return null;
      return {
        exists: true,
        disabled: !!el.disabled,
        ariaDisabled: el.getAttribute('aria-disabled'),
        visible: isElementVisible(el),
        title: el.getAttribute('title') || '',
        id: el.id || '',
        captureId: el.getAttribute('data-capture-control-id') || '',
      };
    },

    // Click the entry's own control. Returns whether there was something to click.
    clickEntry(entry) {
      const el = resolve(entry);
      if (!el) return false;
      el.click();
      return true;
    },

    readActiveTool() {
      const debug = win.__graphDebug;
      return debug && typeof debug.activeTool === 'string' ? debug.activeTool : null;
    },

    anyDialogOpen() {
      return !!doc.querySelector('dialog[open]');
    },

    stageRect() {
      const stage = doc.getElementById(ids.stage);
      return stage ? stage.getBoundingClientRect() : null;
    },
  };
}

return {createPipeHost};
})();

// ===== src/core/command-line-core.js =====
const __m_command_line_core = (function(){
// Trade-agnostic core of the typed command-line input — ranked matching,
// exact resolution, dispatch verdicts, the capture-phase keydown gate, and
// the bare-Space repeat/close convention. No DOM, no host globals.
//
// This is a SUPERSET of the host app's own native module of the same name
// (constructions-tagger-web.onrender.com's project_graph/js/command-line-
// core.js, read live via opencli — see CLAUDE.md and the restructure plan's
// "Aligning our API with native's" section): every function signature and
// ranking rule below matches native's when this project's own extra fields
// are absent, specifically so this file can go upstream as a drop-in
// replacement with the extra fields simply unused there. The one
// intentional behavioral widening from native, kept everywhere below and
// called out at each site: every `entry.label`/`entry.aliases` read is
// null-tolerant (`?? entry.name` / `?? []`), because this project's own
// existing tables (ANNOTATE_TABLE, the graph host's derived table) predate
// having a separate `label` field at all — native's own version assumes
// `label` and `aliases` always exist and would throw on an entry that
// doesn't carry them.
//
// Native's own header credits this as itself ported from the legacy
// tagger's command line (annotation_jobs/static/js/boon_tagger_
// commandline.js) — ranked prefix/substring matching, exact-match
// resolution, and the AutoCAD bare-Space repeat/close convention.

function entryLabel(entry) {
  return (entry.label ?? entry.name ?? '').toLowerCase();
}
function entryAliases(entry) {
  return (entry.aliases ?? []).map((alias) => alias.toLowerCase());
}

// Ranked matching: exact name/label=0, exact alias=1, name/label prefix=2,
// alias prefix=3, name/label substring=4, stable-sorted by rank. Not fuzzy.
//
// entry.label is checked alongside entry.name at every rank (native's own
// reasoning, unchanged): name is the internal tool id, but a person types
// what they SEE on the tool rail/dropdown — the label — not an id they've
// never been shown. Many id/label pairs share no characters at all, so
// id-only matching leaves a tool unreachable by its own visible name. On
// this project's tables today, label is never set (every entry falls back
// to matching its own name against itself, a no-op widening), which keeps
// this a pure behavior-preserving swap-in for the old RW._cmdMatch.
function matchCommands(table, query) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return table.slice();
  const ranked = [];
  for (const entry of table) {
    const name = (entry.name ?? '').toLowerCase();
    const label = entryLabel(entry);
    const aliases = entryAliases(entry);
    let rank = -1;
    if (name === q || label === q) rank = 0;
    else if (aliases.includes(q)) rank = 1;
    else if (name.startsWith(q) || label.startsWith(q)) rank = 2;
    else if (aliases.some((alias) => alias.startsWith(q))) rank = 3;
    else if (name.includes(q) || label.includes(q)) rank = 4;
    if (rank !== -1) ranked.push({ entry, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.map((r) => r.entry);
}

// resolveCommand semantics (native's naming; this project's old name was
// findEntry): exact name/label, then exact alias, else null. Deliberately
// NOT prefix-based — Enter/Space only runs an unambiguous match; a bare
// prefix is surfaced through matchCommands' completion list instead.
function resolveCommand(table, query) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return null;
  for (const entry of table) {
    if ((entry.name ?? '').toLowerCase() === q || entryLabel(entry) === q) return entry;
  }
  for (const entry of table) {
    if (entryAliases(entry).includes(q)) return entry;
  }
  return null;
}

// Native's own dispatch verdict shape: {action:'status', message} or
// {action:'activate', toolId}. This project's own executor (RW.runCommand)
// has more verdict kinds than native's app does (a button click, a
// compound multi-step command, isolation refusals, ...) — those are layered
// on by src/features/ in a later restructure phase, not added here, so this
// stays a faithful copy of what native actually ships today.
function commandDispatch(table, query, { toolDisabled, blocker }) {
  const entry = resolveCommand(table, query);
  if (!entry) return { action: 'status', message: `unknown command: ${query}` };
  if (toolDisabled(entry.id ?? entry.name)) return { action: 'status', message: `${entry.label ?? entry.name} isn't available right now` };
  const message = blocker(entry.id ?? entry.name);
  if (message) return { action: 'status', message };
  return { action: 'activate', toolId: entry.id ?? entry.name };
}

// Extracted so the modifier/field/dialog gates are unit-testable without a
// DOM. `keyReserved` is an optional per-key callback (default: nothing is
// reserved) for a single-key shortcut the command line has no table entry
// for (native's own example: project_graph's ruler toggle, "m").
//
// Two extra optional gates, both defaulting to native's own behavior when
// omitted (a false positive here would mean an event this project's own
// dispatch just sent gets eaten by its own capture listener, or a real
// tool-selection prompt's digit gets swallowed instead of reaching it):
// - `synthetic`: true for this project's own dispatched keydown
//   (RW._cmdDispatchAppKey's evt.__rwSynthetic) — never captured, so the
//   capture listener can never eat its own dispatch to the host app.
// - `digitPassthrough`: true when the caller has already decided (from ITS
//   OWN context — host, hatch, and whether the bar is genuinely empty/
//   undrafted, none of which this pure function has any business knowing)
//   that a bare digit right now should reach the host app untouched (e.g.
//   this project's graph-host numbered "pick the next tool" prompt) rather
//   than seed the command bar.
function commandBarShouldCapture({
  key, ctrlKey, metaKey, altKey, typingInFormField, dialogOpen, enabled,
  keyReserved = () => false,
  synthetic = false,
  digitPassthrough = false,
}) {
  if (synthetic) return false;
  if (!enabled) return false;
  if (dialogOpen) return false;
  if (typingInFormField) return false;
  if (ctrlKey || metaKey || altKey) return false;
  if (typeof key !== 'string' || key.length !== 1) return false;
  if (keyReserved(key)) return false;
  if (digitPassthrough && /^[0-9]$/.test(key)) return false;
  return true;
}

// Bare Space on an empty bar: AutoCAD's convention. With a tool armed,
// Space closes to select; with none armed, it repeats the last tool; with
// neither, it's a no-op. A non-empty query means Space is just a normal
// keystroke mid-typing.
//
// Four extra optional parameters, all defaulting to native's own plain
// 3-branch behavior when omitted:
// - `modeActive`/`forceSelectModes`: leaving one of this project's own
//   MODE switches (default: none, i.e. `forceSelectModes = []`) forces
//   select regardless of armed/lastTool state — checked first, since the
//   project's own toolArmed flag is already false the instant a mode
//   switch runs (every mode switch clears it), so without this override
//   Space would repeat the PRIOR tool instead of resting in select.
// - `modalOpen`: while one of the graph host's own config-dialog modals is
//   open, Space neither repeats nor closes (dispatching a raw key at an
//   open dialog is untested) — it opens a menu scoped to that modal
//   instead (`'open-modal-menu'`), checked ahead of the ordinary
//   armed/lastTool branches for the same reason as `forceSelectModes`.
// - `openMenuWhenIdle`: when nothing is armed and there's no lastTool to
//   repeat, native's own plain behavior is `{action:'none'}` (a literal
//   space character, since the app has no dropdown concept of its own tool
//   vocabulary to open at rest). Set this true to get `'open-tool-menu'`
//   instead — "initialize the console," this project's own round-19
//   addition — a starting menu of what can be armed.
function spaceRepeatAction({
  query, lastTool, toolArmed,
  modeActive = null,
  forceSelectModes = [],
  modalOpen = false,
  openMenuWhenIdle = false,
}) {
  if (query) return { action: 'none' };
  if (forceSelectModes.includes(modeActive)) return { action: 'select' };
  if (modalOpen) return { action: 'open-modal-menu' };
  if (toolArmed) return { action: 'select' };
  if (lastTool) return { action: 'repeat', toolId: lastTool };
  if (openMenuWhenIdle) return { action: 'open-tool-menu' };
  return { action: 'none' };
}

return {matchCommands, resolveCommand, commandDispatch, commandBarShouldCapture, spaceRepeatAction};
})();

// ===== src/core/table-core.js =====
const __m_table_core = (function(){
// Pure helpers over a command table's own shape — no DOM, no host globals.

// Which action entries a given tool table shadows, and what each is still
// reachable by. Table order IS the resolution rule (the caller's own
// RW._cmdTable is tools-then-actions, and both findEntry/RW._cmdMatch scan
// it in that order — exact name before exact alias) — so a collision is
// deterministic, never ambiguous: the TOOL wins its own name, and the
// action keeps every other token (name/alias) it has that the tool table
// doesn't also use.
function shadowedActions(tools, actions) {
  const names = tools.map((t) => t.name);
  const rows = [];
  actions.forEach((a) => {
    const tokens = [a.name].concat(a.aliases || []);
    const clashed = tokens.filter((t) => names.includes(t));
    if (clashed.length) {
      rows.push({
        action: a.name,
        shadowed: clashed,
        reachableAs: tokens.filter((t) => !names.includes(t)),
      });
    }
  });
  return rows;
}

return {shadowedActions};
})();

// ===== src/core/pipe-table-core.js =====
const __m_pipe_table_core = (function(){
// Pure logic for the piping command line: turning a plain snapshot of the page's tool rail into a
// command table, deciding whether an entry may run right now, and deciding whether the loader may
// start at all. No DOM, no host globals; every fact arrives as an argument and every decision comes
// back as plain data, so the host layer (src/pipe/pipe-host.js) has nothing to decide.
//
// Doctrines carried over from the duct side: the live page is authoritative (the key badge, never a
// hardcoded key), a hard boundary is enforced in code and not only by leaving something out of a
// table (forbidden controls are checked again here), and when live state can't be read the answer
// is "don't".
const { resolveCommand } = __m_command_line_core;
const { shadowedActions } = __m_table_core;

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
function deriveTools({ railTools, fallbackKeys = {}, curatedAliases = {}, actions = [] }) {
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
function buildTable(tools, actions) {
  return tools.concat(actions.map((action) => ({ ...action, kind: 'action' })));
}

// Can this entry run right now? `target` is a plain description of the page element the entry would
// click (or null when there is none): { exists, disabled, ariaDisabled, visible, title, id, captureId }.
// Entries whose control is a forbidden one are refused even when the element is perfectly clickable.
function entryState(entry, target, { forbiddenIds = [], forbiddenCaptureIds = [] } = {}) {
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
function planEntry(entry, state) {
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
function planQuery(table, query, stateFor) {
  const entry = resolveCommand(table, query);
  if (!entry) return { action: 'status', message: `unknown command: ${String(query ?? '').trim()}` };
  return planEntry(entry, stateFor(entry));
}

// Which entries the dropdown lists: every tool (a disabled one stays visible so its reason can be
// shown), but an action that couldn't do anything right now is left out, as on the duct side.
// `stateFor(entry)` supplies entryState; the result keeps each entry with its state attached.
function listEntries(table, stateFor) {
  const rows = [];
  for (const entry of table) {
    const state = stateFor(entry);
    if (entry.kind === 'action' && !state.usable) continue;
    rows.push({ entry, state });
  }
  return rows;
}

// Which tool the command line should consider armed. Our own record wins right after one of our own
// commands (the page's state may not have settled); after the grace window, a readable live tool
// string corrects drift caused by the user arming tools some other way (rail click, native hotkey).
//   own  { armed, tool }   live  string | null | undefined   (the page's current tool)
function reconcileArmed({ own, live, sinceLastCmdMs, graceMs = 1000 }) {
  if (typeof live !== 'string') return { armed: !!own?.armed, tool: own?.tool ?? null };
  if (Number.isFinite(sinceLastCmdMs) && sinceLastCmdMs < graceMs) return { armed: !!own?.armed, tool: own?.tool ?? null };
  const tool = lower(live);
  if (!tool || tool === 'select') return { armed: false, tool: null };
  return { armed: true, tool };
}

// May the piping loader start? Everything arrives as plain facts.
//   facts { hasRoot, trade, hasStage, railToolCount, nativeBarOn, ductLoaderInstalled, pipeTrade }
// Returns { ok, message } where message tells a non-programmer exactly what to do.
function loaderGuard(facts) {
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

return {deriveTools, buildTable, entryState, planEntry, planQuery, listEntries, reconcileArmed, loaderGuard};
})();

// ===== src/pipe/pipe-shell.js =====
// RW vpipe: AutoCAD-style command line for the PIPING graph page. Type a tool name (or its key
// letter, or an alias) from anywhere on the page and the real tool-rail button is clicked; type an
// action (undo, redo, zoomfit, ...) and that real button is clicked.
//
// Step 1 scope: tool switching and a short list of view/undo actions. Nothing here draws, saves or
// submits anything by itself, and the forbidden controls (save, recording, submit, Finish, ...) are
// refused in code. Native's own piping command line must be OFF while this runs (the loader refuses
// to start otherwise).
//
// A plain script, appended last by scripts/build-pipe-dist.js after the modules it uses
// (__m_* consts). All decisions live in src/core/pipe-table-core.js; all DOM access in
// src/pipe/pipe-host.js. This file only wires them to a bar, a dropdown and the keyboard. It does
// not import from, or share state with, src/console/shell.js (the duct bar).
(function(){
  const RW = window.__RW;
  if (!RW || !RW.vcore) return 'need rw_core.js first';
  if (RW.vpipe) return 'piping command line already installed';
  if (RW.vcmd) return 'the duct command line is already loaded on this page; reload the page first';

  const {
    PIPE_PAGE_IDS, PIPE_FALLBACK_KEYS, PIPE_TOOL_ALIASES, PIPE_GRAPH_ACTIONS,
    PIPE_FORBIDDEN_BUTTON_IDS, PIPE_FORBIDDEN_CAPTURE_IDS,
  } = __m_pipe_tables;
  const {
    deriveTools, buildTable, entryState, planEntry, planQuery, listEntries, reconcileArmed, loaderGuard,
  } = __m_pipe_table_core;
  const { matchCommands, commandBarShouldCapture, spaceRepeatAction } = __m_command_line_core;
  const { createPipeHost } = __m_pipe_host;

  const host = createPipeHost({ doc: document, win: window, ids: PIPE_PAGE_IDS });

  // Second line of defence behind the loader's own check (a direct paste of dist/ skips the loader).
  const guard = loaderGuard(host.readPageFacts());
  if (!guard.ok) { console.warn('[RW] ' + guard.message); return guard.message; }
  RW.vpipe = true;

  const FORBIDDEN = { forbiddenIds: PIPE_FORBIDDEN_BUTTON_IDS, forbiddenCaptureIds: PIPE_FORBIDDEN_CAPTURE_IDS };
  const RESERVED_KEYS = ['m']; // native's own ruler hotkey: never captured into the bar

  /* ---------- table (re-derived from the live rail every time, never cached) ---------- */
  function derive() {
    return deriveTools({
      railTools: host.readRail(), fallbackKeys: PIPE_FALLBACK_KEYS,
      curatedAliases: PIPE_TOOL_ALIASES, actions: PIPE_GRAPH_ACTIONS,
    });
  }
  function currentTable() { return buildTable(derive().tools, PIPE_GRAPH_ACTIONS); }
  function stateFor(entry) { return entryState(entry, host.describeTarget(entry), FORBIDDEN); }

  /* ---------- our own record of what is armed (see reconcileArmed) ---------- */
  const own = { armed: false, tool: null, lastTool: null, lastCmdAt: 0 };
  function currentArmed() {
    const r = reconcileArmed({
      own: { armed: own.armed, tool: own.tool }, live: host.readActiveTool(),
      sinceLastCmdMs: Date.now() - own.lastCmdAt,
    });
    own.armed = r.armed; own.tool = r.tool;
    return r;
  }

  function status(msg) { if (RW._commitStatus) RW._commitStatus(msg); }

  /* ---------- running an entry ---------- */
  let inputEl = null;
  function runEntry(entry) {
    // Blur first: native ignores a tool key while a form field has focus, and the bar's input is one.
    if (inputEl && inputEl.blur) inputEl.blur();
    const plan = planEntry(entry, stateFor(entry));
    if (plan.action !== 'click') { status(plan.message); return false; }
    const before = host.readActiveTool();
    if (!host.clickEntry(entry)) { status(entry.name + ': nothing to click on this page'); return false; }
    own.lastCmdAt = Date.now();
    if (entry.kind === 'tool') {
      if (entry.name === 'select') { own.armed = false; own.tool = null; }
      else { own.armed = true; own.tool = entry.name; own.lastTool = entry.name; }
      // Report what the page itself says afterwards; a click that changed nothing is worth seeing.
      setTimeout(function(){
        const after = host.readActiveTool();
        status(after === entry.name
          ? entry.name + ' armed'
          : entry.name + ' clicked, but the page still reports tool: ' + after + ' (was ' + before + ')');
      }, 120);
    } else {
      status(entry.name + ' clicked');
    }
    return true;
  }

  RW.runCommand = function(query){
    const plan = planQuery(currentTable(), query, stateFor);
    if (plan.action !== 'click') { status(plan.message); return false; }
    return runEntry(plan.entry);
  };

  /* ---------- dropdown ---------- */
  let menuEl = null, menuItems = [], menuHighlight = -1;
  const MENU_GAP = 6, MENU_MAX_H = 220, MENU_MIN_H = 60;
  const COLORS = { tool: '#a8e6a3', action: '#8ecae6', disabled: '#888' };

  function ensureMenu() {
    if (menuEl) return;
    menuEl = document.createElement('div');
    menuEl.id = 'rw-pipe-menu';
    menuEl.style.cssText = 'position:fixed;display:none;z-index:2147483647;background:#222;color:#eee;'
      + 'border:1px solid #666;border-radius:4px;max-height:' + MENU_MAX_H + 'px;overflow-y:auto;';
    document.body.appendChild(menuEl);
  }
  function positionMenu() {
    const r = inputEl.getBoundingClientRect();
    const panel = document.getElementById('rw-panel');
    const pr = (panel && panel.getBoundingClientRect) ? panel.getBoundingClientRect() : r;
    menuEl.style.left = r.left + 'px';
    menuEl.style.width = r.width + 'px';
    const above = pr.top - MENU_GAP;
    const below = window.innerHeight - pr.bottom - MENU_GAP;
    if (above >= MENU_MAX_H || above >= below) {
      menuEl.style.bottom = (window.innerHeight - pr.top + MENU_GAP) + 'px';
      menuEl.style.top = 'auto';
      menuEl.style.maxHeight = Math.max(MENU_MIN_H, Math.min(MENU_MAX_H, above)) + 'px';
    } else {
      menuEl.style.top = (pr.bottom + MENU_GAP) + 'px';
      menuEl.style.bottom = 'auto';
      menuEl.style.maxHeight = Math.max(MENU_MIN_H, Math.min(MENU_MAX_H, below)) + 'px';
    }
  }
  function hideMenu() { if (menuEl) menuEl.style.display = 'none'; menuItems = []; menuHighlight = -1; }
  function scrollRowIntoView(row) {
    if (!row || !menuEl) return;
    const top = row.offsetTop, h = row.offsetHeight, view = menuEl.clientHeight;
    if (typeof top !== 'number' || typeof h !== 'number' || !view) return;
    if (top < menuEl.scrollTop) menuEl.scrollTop = top;
    else if (top + h > menuEl.scrollTop + view) menuEl.scrollTop = top + h - view;
  }
  function renderMenu() {
    if (!menuItems.length) { hideMenu(); return; }
    ensureMenu();
    menuEl.innerHTML = '';
    let highlighted = null;
    menuItems.forEach(function(row, i){
      const el = document.createElement('div');
      el.className = 'rw-pipe-item';
      const e = row.entry;
      const usable = row.state.usable;
      let label = e.name + (e.aliases.length ? ' (' + e.aliases.join(',') + ')' : '');
      if (!usable) label += ' — ' + (row.state.reason || 'not available');
      el.style.cssText = 'padding:3px 6px;font-size:11px;cursor:pointer;color:' + (usable ? COLORS[e.kind] : COLORS.disabled) + ';'
        + (i === menuHighlight ? 'background:rgba(255,140,0,0.3);' : '');
      el.textContent = label;
      if (i === menuHighlight) highlighted = el;
      el.addEventListener('mousedown', function(ev){ ev.preventDefault(); }); // keep focus through the click
      el.addEventListener('click', function(){ runAndClear(row.entry); });
      menuEl.appendChild(el);
    });
    positionMenu();
    menuEl.style.display = 'block';
    scrollRowIntoView(highlighted);
  }
  // Everything the dropdown may list for `query` (all tools, usable actions), ranked.
  function rowsFor(query) {
    const table = currentTable();
    const rows = listEntries(table, stateFor);
    const byName = new Map(rows.map(function(r){ return [r.entry.name, r]; }));
    return matchCommands(rows.map(function(r){ return r.entry; }), query).map(function(e){ return byName.get(e.name); });
  }
  function openMenu(query) {
    menuItems = rowsFor(query);
    menuHighlight = menuItems.length ? 0 : -1;
    renderMenu();
  }

  function clearBar() { if (inputEl) inputEl.value = ''; hideMenu(); }
  function runAndClear(entry) { if (runEntry(entry)) clearBar(); else hideMenu(); }

  /* ---------- the bar ---------- */
  function mountBar() {
    if (document.getElementById('rw-pipe-row')) return;
    const list = document.getElementById('rw-list');
    const hostEl = list && list.parentNode;
    if (!hostEl) return;
    const row = document.createElement('div');
    row.id = 'rw-pipe-row';
    row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:6px;';
    const prompt = document.createElement('span');
    prompt.textContent = '>';
    prompt.style.cssText = 'opacity:0.5;font-family:monospace;';
    row.appendChild(prompt);
    inputEl = document.createElement('input');
    inputEl.id = 'rw-pipe-input';
    inputEl.type = 'text';
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;
    inputEl.placeholder = 'piping tool (route, fitting, valve…) or action (undo, zoomfit…) — just start typing';
    inputEl.style.cssText = 'flex:1;font-size:11px;padding:2px 4px;background:#111;color:#eee;'
      + 'border:1px solid #555;border-radius:3px;color-scheme:dark;';
    row.appendChild(inputEl);
    hostEl.insertBefore(row, list);
    inputEl.addEventListener('input', function(){ openMenu(inputEl.value); });
    inputEl.addEventListener('keydown', onInputKeydown);
    inputEl.addEventListener('blur', function(){
      setTimeout(function(){ if (document.activeElement !== inputEl) hideMenu(); }, 150);
    });
  }

  function cycle(delta) {
    if (!menuItems.length) return;
    menuHighlight = (menuHighlight + delta + menuItems.length) % menuItems.length;
    renderMenu();
  }

  function onInputKeydown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); cycle(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); cycle(-1); return; }
    if (e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation();
      if (!menuItems.length) openMenu(inputEl.value);
      else cycle(e.shiftKey ? -1 : 1);
      // Fill the bar with the highlighted name so Enter and Tab agree on what will run. Setting
      // .value fires no input event, so the list stays put and keeps cycling over the same rows.
      if (menuHighlight >= 0 && menuItems[menuHighlight]) inputEl.value = menuItems[menuHighlight].entry.name;
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      const typed = inputEl.value.trim();
      // An exact name/label/alias always wins; otherwise run the highlighted completion.
      const plan = planQuery(currentTable(), typed, stateFor);
      if (typed && plan.action !== 'status') { if (runEntry(plan.entry)) clearBar(); return; }
      if (menuHighlight >= 0 && menuItems[menuHighlight]) { runAndClear(menuItems[menuHighlight].entry); return; }
      if (typed) status(plan.message);
      return;
    }
    if (e.key === 'Escape') {
      // Only swallow Escape while it has something of ours to close; otherwise native's own Escape
      // (cancel the current placement) must still get it.
      if (inputEl.value || (menuEl && menuEl.style.display !== 'none')) {
        e.stopPropagation();
        clearBar();
        inputEl.blur();
      } else {
        inputEl.blur();
      }
    }
  }

  /* ---------- overlay positioning (bottom-centre over the drawing stage) ---------- */
  RW._pipeBarOffset = 16;
  RW._pipeBarWidth = 480;
  RW._pipeReposition = function(){
    if (!RW._cmdOwnsPanelPosition) return;
    const panel = document.getElementById('rw-panel');
    const rect = host.stageRect();
    if (!panel || !rect) return;
    const width = Math.min(RW._pipeBarWidth, rect.width);
    panel.style.width = width + 'px';
    panel.style.left = (rect.left + (rect.width - width) / 2) + 'px';
    panel.style.top = 'auto';
    panel.style.bottom = Math.max(RW._pipeBarOffset, (window.innerHeight - rect.bottom) + RW._pipeBarOffset) + 'px';
    if (menuEl && menuEl.style.display !== 'none') positionMenu();
  };

  /* ---------- global capture: type anywhere to start a command ---------- */
  document.addEventListener('keydown', function(e){
    const t = e.target;
    const typingInFormField = !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
    const barEmpty = !inputEl || !inputEl.value;
    const shouldCapture = commandBarShouldCapture({
      key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
      typingInFormField: typingInFormField,
      dialogOpen: host.anyDialogOpen(),
      enabled: RW.enabled,
      keyReserved: function(k){ return RESERVED_KEYS.indexOf(k.toLowerCase()) !== -1; },
      // No piping command or alias starts with a digit, so a bare digit on an empty bar belongs to the page.
      digitPassthrough: barEmpty,
    });
    if (!shouldCapture) return;

    // AutoCAD's Space: nothing typed -> close the armed tool to select, else repeat the last tool,
    // else show what can be armed.
    if (e.key === ' ' && barEmpty) {
      const armed = currentArmed();
      const action = spaceRepeatAction({
        query: '', lastTool: own.lastTool, toolArmed: armed.armed, openMenuWhenIdle: true,
      });
      e.preventDefault(); e.stopImmediatePropagation();
      if (action.action === 'select') { RW.runCommand('select'); return; }
      if (action.action === 'repeat') { RW.runCommand(action.toolId); return; }
      mountBar();
      if (inputEl) inputEl.focus();
      menuItems = rowsFor('').filter(function(r){ return r.entry.kind === 'tool'; });
      menuHighlight = menuItems.length ? 0 : -1;
      renderMenu();
      return;
    }
    e.preventDefault(); e.stopImmediatePropagation();
    mountBar();
    if (!inputEl) return;
    inputEl.value += e.key;
    inputEl.focus();
    if (inputEl.setSelectionRange) inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    openMenu(inputEl.value);
  }, true);

  // Tab must win over the host app's own capture-phase keydown handling: a window-level capture
  // listener always runs before any document-level one, whatever the registration order.
  window.addEventListener('keydown', function(e){
    if (e.key !== 'Tab' || e.target !== inputEl) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    onInputKeydown(e);
  }, true);

  /* ---------- startup ---------- */
  mountBar();
  RW._pipeReposition();
  window.addEventListener('resize', RW._pipeReposition);

  RW._pipeTable = currentTable;
  RW._pipeTableInfo = function(){ return derive().info; };
  RW._pipeOwn = own;
  const first = derive();
  RW._commitStatus && RW._commitStatus('piping command line ready: ' + first.tools.length + ' tools, '
    + PIPE_GRAPH_ACTIONS.length + ' actions (tools read from the ' + first.info.source + ')');
  return 'piping command line installed';
})()
