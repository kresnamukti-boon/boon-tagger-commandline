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
  systemSelect: 'graph-system-select',
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
// Native's size-mismatch toast (MEC-329) carries a sticky "Resize anyway" button that re-submits a
// rejected command with the check switched off. It has no id, so it is refused by its text and by
// the toast container it lives in: nothing inside that container is ever clicked by us.
const PIPE_FORBIDDEN_BUTTON_TEXTS = ['resize anyway'];
const PIPE_FORBIDDEN_CONTAINER_IDS = ['graph-toast-stack'];

// Command names that stay reachable while a placement panel is open. Shipped now as data;
// enforced from the placement step onward (Step 1 has no panel state to isolate).
const PIPE_ISOLATION_ALLOWED = [
  'select', 'undo', 'redo', 'zoomfit', 'zoomin', 'zoomout', 'adjust',
];

// ---- Placement panel (Step 2: choose the fitting label) ----
// Native's own ids, classes and hint wording for the "Place Fitting" panel. Used for both the
// fitting and the fixture tool (native shows one panel for every bounding-box tool). Checked by
// test/native-ids.test.mjs against saved copies of native's files.
const PIPE_PANEL_IDS = {
  panel: 'graph-pipe-bbox-op-panel',
  menu: 'graph-pipe-fitting-select-menu',
  groupLabelClass: 'graph-pipe-fitting-select-group-label',
  optionSelector: 'button[data-family-id]',
  warningClass: 'graph-pipe-bbox-unresolved-entry-warning',
  triggerClass: 'graph-pipe-fitting-select-trigger',
};

// How native's hint line starts in each phase. Matched with "starts with" (native appends extra
// sentences to some of them), never equality.
const PIPE_HINT_PREFIXES = {
  box: 'Click two opposite corners',
  label: 'Choose the fitting subtype.',
  ports: 'Click the detected intersection for',
  // The transition tool words its ready hint differently depending on the sizes (three more openings).
  ready: ['Finish inserts this fitting.', 'Pick a different diameter', 'Enter the new diameter above, then Finish.', 'From '],
  submitting: 'Saving pipe and fitting',
};
// Native's own words after the auto-matched run diameter, e.g. `Diameter 2" auto-matched from the crossed run.`
const PIPE_AUTOMATCH_PATTERN = /Diameter (\S+?)" auto-matched/;
const PIPE_UNAVAILABLE_MARK = 'unavailable';

// Step 3. The ONE control the bar may click as a placement step: native's Finish, reached only from
// Enter in the bar (never from a typed word; it stays in PIPE_FORBIDDEN_BUTTON_IDS for every other path).
// The bar's in-memory action log keeps only this many of the newest entries (nothing is stored or sent).
const PIPE_LOG_MAX = 50;
// How long after an action the log re-reads the revision to fill in "after".
const PIPE_LOG_AFTER_MS = 2000;
// Step 3b: native's per-port size fields (reducing fittings) and the page's own catalog JSON.
const PIPE_SIZE_IDS = {
  container: 'graph-pipe-port-diameters',
  capturePrefix: 'pipe-diameter-',
  customSuffix: '-custom',
  bootstrap: 'graph-session-bootstrap',
};
// Only this tool places fittings that have per-port sizes (reducing tees/wyes, reducers, ...).
const PIPE_SIZE_TOOLS = ['fitting'];
// Step 3c: native's "Adjust ports" checkbox (no id: a checkbox inside a label of the placement panel).
const PIPE_ADJUST = { labelText: 'Adjust ports' };
// The typed command for it. Not a button entry: it is handled by the shell, listed only when usable.
const PIPE_ADJUST_ENTRY = {
  id: 'adjust', name: 'adjust', label: 'Adjust ports', aliases: ['ports', 'adj'], kind: 'adjust',
};
// Step 5: native's next-draw "Pipe properties" controls. Typed commands for them; written only when nothing is
// selected and no fitting is being placed (with a selection native's diameter handlers send a SAVED resize).
const PIPE_SETTING_IDS = {
  diameter: 'graph-pipe-diameter',
  custom: 'graph-pipe-diameter-custom',
  dsource: 'graph-pipe-diameter-source',
  material: 'graph-pipe-material',
  msource: 'graph-pipe-material-source',
};
// `control` names the PIPE_SETTING_IDS key the entry writes; `valueKind` is how a value is entered.
const PIPE_SETTING_ENTRIES = [
  { id: 'diameter', name: 'diameter', label: 'Diameter', aliases: ['dia'], kind: 'setting', control: 'diameter', valueKind: 'size' },
  { id: 'dsource', name: 'dsource', label: 'Diameter source', aliases: [], kind: 'setting', control: 'dsource', valueKind: 'pick' },
  { id: 'material', name: 'material', label: 'Material', aliases: ['mat'], kind: 'setting', control: 'material', valueKind: 'pick' },
  { id: 'msource', name: 'msource', label: 'Material source', aliases: [], kind: 'setting', control: 'msource', valueKind: 'pick' },
];
// The diameter source value that makes native lock both diameter controls.
const PIPE_SOURCE_UNRESOLVED = 'unresolved';
const PIPE_FINISH_BUTTON_ID = 'graph-finish-route';
// Strictly this opening, not the looser 'ready' variants the transition tool uses.
const PIPE_FINISH_HINT_PREFIX = 'Finish inserts this fitting.';
// The keys that finish (with the bar focused and empty): Enter, and Space (the same as Enter everywhere else).
const PIPE_FINISH_KEYS = ['Enter', ' '];
// Only these tools may be finished from the bar (valves, equipment, cut, transition stay manual).
const PIPE_FINISH_TOOLS = ['fitting', 'fixture'];
// How long a Finish click holds the latch if native never shows "Saving..." (e.g. the click was ignored).
const PIPE_FINISH_LATCH_MS = 1500;
// "Click the detected intersection for <role>." -> role
const PIPE_PORT_ROLE_PATTERN = /Click the detected intersection for ([A-Za-z0-9_-]+)/;

// The one line shown when native's panel or page no longer looks like what we were built against.
const PIPE_NATIVE_CHANGED_MESSAGE = 'Native changed: use the mouse for this step';

// Element ids that must exist on the page for the command line to run at all. If one is missing at
// load, native has changed and the bar installs nothing. Every id here is also in
// test/native-ids.json (checked by test/native-ids.test.mjs). The protective (forbidden) ids are
// deliberately not required: a missing Save button can't make us click it.
const PIPE_REQUIRED_IDS = [
  'graph-session-root', 'graph-canvas-stage', 'graph-command-line-toggle', 'graph-command-window',
  'graph-system-select', 'graph-pipe-bbox-op-panel', 'graph-pipe-fitting-select-menu',
  'graph-undo-command', 'graph-redo-command', 'graph-zoom-fit', 'graph-zoom-in', 'graph-zoom-out',
  'graph-ruler', 'graph-components-button', 'graph-finish-route',
];

// Friendly names for fittings, keyed by native's family id (approved 2026-10-06). The family id and
// native's on-screen label always match as well; these are extras. An alias only ever matches
// against the menu that is open right now, so the same word can mean a fitting in one menu and a
// fixture in another.
// Dropped on purpose: ft/tt/st/td (too short; use trapft, traptt, trapst, traptd), rtee/rwye.
const PIPE_FITTING_ALIASES = {
  'pipe-elbow-90-vertical': ['vertelbow'],
  'pipe-cap': ['cap'],
  'pipe-plug': ['plug'],
  'pipe-cleanout': ['co'],
  'pipe-floor-drain': ['fd', 'drain'],
  'pipe-hose-bibb': ['hb', 'bibb'],
  'pipe-hydrant': ['hyd'],
  'pipe-nozzle': ['noz'],
  'pipe-elbow-45': ['45', 'el45'],
  'pipe-elbow-90': ['90', 'el90'],
  'pipe-elbow-lr-45': ['lr45'],
  'pipe-elbow-lr-90': ['lr90'],
  'pipe-elbow-sr-45': ['sr45'],
  'pipe-elbow-sr-90': ['sr90'],
  'pipe-elbow-90-reducing': ['90r', 'el90r'],
  'pipe-tee-eq-vertical': ['vtee'],
  'pipe-tee-reducing-vertical': ['vteer'],
  'pipe-wye-vertical': ['vwye'],
  'pipe-wye-reducer-vertical': ['vwyer'],
  'pipe-reducer-concentric': ['reducer', 'red', 'concentric'],
  'pipe-reducer-eccentric': ['ecc', 'eccentric'],
  'pipe-union': ['union'],
  'pipe-coupling': ['coupling', 'cpl'],
  'pipe-strainer-y': ['ystrainer'],
  'pipe-strainer-t': ['tstrainer'],
  'pipe-trap-p': ['ptrap'],
  'pipe-trap-s': ['strap'],
  'pipe-trap-steam-ft': ['trapft'],
  'pipe-trap-steam-tt': ['traptt'],
  'pipe-trap-steam-st': ['trapst'],
  'pipe-trap-steam-td': ['traptd'],
  'pipe-expansion-joint-bellows': ['bellows'],
  'pipe-expansion-joint-slip': ['slip'],
  'pipe-tee-eq': ['tee', 'teeeq'],
  'pipe-tee-reducing': ['teer'],
  'pipe-wye': ['wye'],
  'pipe-sanitary-tee': ['santee', 'stee'],
  'pipe-wye-reducer': ['wyer'],
  'pipe-cross': ['cross'],
};

// The fixture tool's own labels are named by native's family ids (wc, lav, sh, ur, ks, ms, rd, fd,
// hb). The family id is derived from what the open menu says, after stripping one of these
// prefixes; nothing about which fixtures exist is hardcoded here.
const PIPE_FIXTURE_ID_PREFIXES = ['pipe-fixture-', 'fixture-', 'pipe-'];
// Readable names shown in the bar for the fixture menu (display only: matching still uses native's
// own label, the id and the aliases). Keyed by the short id (the id without its prefix). A fixture
// not listed here is shown with native's own text.
const PIPE_FIXTURE_DISPLAY_NAMES = {
  wc: 'Water Closet', lav: 'Lavatory', sh: 'Shower', ur: 'Urinal', ks: 'Kitchen Sink',
  ms: 'Mop Sink', hb: 'Hose Bibb', fd: 'Floor Drain', rd: 'Roof Drain',
};
const PIPE_FIXTURE_TOOL = 'fixture';
const PIPE_FITTING_TOOL = 'fitting';

return {PIPE_TRADE, DUCT_TRADE, PIPE_PAGE_IDS, PIPE_FALLBACK_KEYS, PIPE_TOOL_ALIASES, PIPE_GRAPH_ACTIONS, PIPE_FORBIDDEN_BUTTON_IDS, PIPE_FORBIDDEN_CAPTURE_IDS, PIPE_FORBIDDEN_BUTTON_TEXTS, PIPE_FORBIDDEN_CONTAINER_IDS, PIPE_ISOLATION_ALLOWED, PIPE_PANEL_IDS, PIPE_HINT_PREFIXES, PIPE_AUTOMATCH_PATTERN, PIPE_UNAVAILABLE_MARK, PIPE_LOG_MAX, PIPE_LOG_AFTER_MS, PIPE_SIZE_IDS, PIPE_SIZE_TOOLS, PIPE_ADJUST, PIPE_ADJUST_ENTRY, PIPE_SETTING_IDS, PIPE_SETTING_ENTRIES, PIPE_SOURCE_UNRESOLVED, PIPE_FINISH_BUTTON_ID, PIPE_FINISH_HINT_PREFIX, PIPE_FINISH_KEYS, PIPE_FINISH_TOOLS, PIPE_FINISH_LATCH_MS, PIPE_PORT_ROLE_PATTERN, PIPE_NATIVE_CHANGED_MESSAGE, PIPE_REQUIRED_IDS, PIPE_FITTING_ALIASES, PIPE_FIXTURE_ID_PREFIXES, PIPE_FIXTURE_DISPLAY_NAMES, PIPE_FIXTURE_TOOL, PIPE_FITTING_TOOL};
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

function createPipeHost({ doc, win, ids, panelIds = {}, sizeIds = {}, settingIds = {}, unresolvedValue = 'unresolved', adjustLabelText = 'Adjust ports', unavailableMark = 'unavailable' }) {
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

  // Ids of every element above `el` (used to refuse anything that lives inside the toast stack).
  function ancestorIds(el) {
    const out = [];
    for (let n = el && el.parentNode; n; n = n.parentNode) if (n.id) out.push(n.id);
    return out;
  }

  function activeTool() {
    const debug = win.__graphDebug;
    return debug && typeof debug.activeTool === 'string' ? debug.activeTool : null;
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
        text: text(el),
        ancestorIds: ancestorIds(el),
      };
    },

    // Click the entry's own control. Returns whether there was something to click.
    clickEntry(entry) {
      const el = resolve(entry);
      if (!el) return false;
      el.click();
      return true;
    },

    readActiveTool: activeTool,

    // The page's current revision number, or null.
    readRevision() {
      const debug = win.__graphDebug;
      if (debug && typeof debug.revision === 'number') return debug.revision;
      const el = doc.getElementById('graph-revision-status');
      return el ? text(el) : null;
    },

    // Plain snapshot of native's "Place Fitting" panel (see pipe-placement-core.js for the shape).
    // The menu is rebuilt by native even while it is hidden, so it is read straight from the DOM.
    readPanel() {
      const panel = doc.getElementById(panelIds.panel);
      if (!panel || panel.hidden) return { open: false, tool: null, hint: '', groups: [] };
      let hint = '';
      for (const child of panel.children || []) {
        if (child.tagName === 'P' && String(child.className || '').indexOf(panelIds.warningClass) === -1) { hint = text(child); break; }
      }
      const menu = doc.getElementById(panelIds.menu);
      const groups = [];
      if (menu) {
        for (const section of menu.children || []) {
          const heading = Array.from(section.children || []).find((c) => String(c.className || '').indexOf(panelIds.groupLabelClass) !== -1);
          const headingText = text(heading);
          const ports = parseInt(headingText, 10);
          const options = Array.from(section.querySelectorAll(panelIds.optionSelector)).map((btn) => ({
            id: btn.getAttribute('data-family-id') || '',
            label: text(btn.children && btn.children[0]),
            usable: !btn.disabled,
          }));
          groups.push({ ports: isNaN(ports) ? 0 : ports, usable: headingText.indexOf(unavailableMark) === -1, options });
        }
      }
      return { open: true, tool: activeTool(), hint, groups };
    },

    // Is this element native's own label button (the one native focuses after a pick, and whose
    // Enter / Space / ArrowDown opens the menu)?
    isLabelTrigger(el) {
      return !!el && String(el.className || '').split(/\s+/).indexOf(panelIds.triggerClass) !== -1;
    },

    // Is keyboard focus on something inside native's placement panel?
    focusInPanel() {
      const active = doc.activeElement;
      const panel = doc.getElementById(panelIds.panel);
      if (!active || !panel) return false;
      for (let n = active; n; n = n.parentNode) if (n === panel) return true;
      return false;
    },

    // Plain description of native's Finish button (see finishVerdict), read fresh every call.
    readFinish(expectedId) {
      const el = doc.getElementById(expectedId);
      if (!el) return { found: false, expectedId };
      return {
        found: true, expectedId, id: el.id || '',
        disabled: !!el.disabled, ariaDisabled: el.getAttribute('aria-disabled'),
        visible: isElementVisible(el),
        text: text(el), ancestorIds: ancestorIds(el),
      };
    },

    // The one Finish click. Re-checks that the element is still enabled, then clicks it. Returns whether it clicked.
    clickFinish(expectedId) {
      const el = doc.getElementById(expectedId);
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      el.click();
      return true;
    },

    // The selection facts used by every guard that must never touch an existing item.
    readSelection() {
      const debug = win.__graphDebug;
      const readable = !!debug && typeof debug === 'object' && 'selectedEntityId' in debug;
      return { selectionReadable: readable, selectedEntityId: readable ? (debug.selectedEntityId || null) : null };
    },

    // Native's per-port size fields: [{ cap, label, selectValue, customValue, disabled, customHidden, optionValues }]
    // in on-screen order. `present` is false when the container is missing or hidden (a single-size fitting).
    readPortFields() {
      const cont = doc.getElementById(sizeIds.container);
      if (!cont || cont.hidden) return { present: false, fields: [] };
      const fields = [];
      for (const lab of cont.querySelectorAll('label')) {
        const select = lab.querySelectorAll('select')[0];
        const custom = lab.querySelectorAll('input')[0];
        if (!select) continue;
        const cap = select.getAttribute('data-capture-control-id') || '';
        fields.push({
          cap, role: cap.indexOf(sizeIds.capturePrefix) === 0 ? cap.slice(sizeIds.capturePrefix.length) : cap,
          label: text(lab.querySelectorAll('span')[0]),
          selectValue: select.value, customValue: custom ? custom.value : '',
          disabled: !!select.disabled, customHidden: custom ? !!custom.hidden : true,
          optionValues: Array.from(select.options || []).map((o) => o.value),
        });
      }
      return { present: fields.length > 1, fields };
    },

    // The family id currently chosen in native's label menu (the aria-selected option), or null.
    readChosenFamilyId() {
      const menu = doc.getElementById(panelIds.menu);
      if (!menu) return null;
      const hit = Array.from(menu.querySelectorAll(panelIds.optionSelector)).find((b) => b.getAttribute('aria-selected') === 'true');
      return hit ? hit.getAttribute('data-family-id') : null;
    },

    // profileCompatibility of one family from the page's own catalog JSON, or { readable: false }.
    readFamilyRules(familyId) {
      try {
        const el = doc.getElementById(sizeIds.bootstrap);
        const data = JSON.parse(el.textContent);
        const fam = data.catalogSupportedUi.fittingFamilies.find((f) => f.id === familyId);
        if (!fam) return { readable: false };
        return {
          readable: true, maximumProfileByPort: (fam.profileCompatibility && fam.profileCompatibility.maximumProfileByPort) || {},
          portContract: Array.isArray(fam.portContract) ? fam.portContract.slice() : null,
        };
      } catch (err) {
        return { readable: false };
      }
    },

    // Put one size into one port's select + custom pair (what a person's edit does). The ONLY place sizes
    // are written. It re-checks the guard itself: panel open, nothing selected, the field not locked.
    // During a placement a change only toggles the custom box (values are read at Finish); on an existing
    // selected fitting the same change would be a saved command, hence the selection check.
    writePortSize(cap, plan) {
      const panel = doc.getElementById(panelIds.panel);
      const sel = this.readSelection();
      if (!panel || panel.hidden || !sel.selectionReadable || sel.selectedEntityId) return { ok: false };
      const cont = doc.getElementById(sizeIds.container);
      if (!cont || cont.hidden) return { ok: false };
      let select = null, custom = null;
      for (const lab of cont.querySelectorAll('label')) {
        const s = lab.querySelectorAll('select')[0];
        if (s && s.getAttribute('data-capture-control-id') === cap) { select = s; custom = lab.querySelectorAll('input')[0] || null; }
      }
      if (!select || select.disabled) return { ok: false };
      const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));
      if (plan.mode === 'select') {
        select.value = plan.selectValue;
        fire(select, 'change');
      } else {
        if (!custom) return { ok: false };
        select.value = 'custom';
        fire(select, 'change');
        custom.value = plan.customText;
        fire(custom, 'input'); fire(custom, 'change');
      }
      return { ok: true, selectValue: select.value, customValue: custom ? custom.value : '' };
    },

    // Step 5: the next-draw "Pipe properties" controls, one plain snapshot each:
    // { found, visible, disabled, value, options: [{ value, text }] }, plus whether a fitting panel is open
    // and the selection facts. `custom` also reports the box's text.
    readSettings() {
      const panel = doc.getElementById(panelIds.panel);
      const sel = this.readSelection();
      const controls = {};
      for (const key of Object.keys(settingIds)) {
        const el = doc.getElementById(settingIds[key]);
        controls[key] = !el ? { found: false } : {
          found: true, visible: isElementVisible(el), disabled: !!el.disabled, value: String(el.value ?? ''),
          options: Array.from(el.options || []).map((o) => ({ value: o.value, text: String(o.text || o.textContent || '').trim() })),
        };
      }
      return { panelOpen: !!panel && !panel.hidden, ...sel, controls };
    },

    // Put one value into one setting control (what a person's pick does). The ONLY place settings are
    // written. It re-checks the whole guard itself, right before writing: no fitting panel open, nothing
    // selected (and readable), the control present, visible and enabled, and for the diameter the source
    // not "unresolved". `plan` is { mode: 'select', selectValue } or, for the diameter, { mode: 'custom',
    // customText }. Returns { ok, reason?, selectValue, customValue } with what the controls hold afterwards.
    writeSetting(key, plan) {
      const panel = doc.getElementById(panelIds.panel);
      if (panel && !panel.hidden) return { ok: false, reason: 'placement' };
      const sel = this.readSelection();
      if (!sel.selectionReadable || sel.selectedEntityId) return { ok: false, reason: 'selection' };
      const el = settingIds[key] ? doc.getElementById(settingIds[key]) : null;
      if (!el || el.disabled || !isElementVisible(el)) return { ok: false, reason: 'control' };
      if (key === 'diameter') {
        const src = doc.getElementById(settingIds.dsource);
        if (!src || src.value === unresolvedValue) return { ok: false, reason: 'unresolved' };
      }
      const fire = (node, type) => node.dispatchEvent(new win.Event(type, { bubbles: true }));
      let custom = null;
      if (plan.mode === 'custom') {
        custom = key === 'diameter' && settingIds.custom ? doc.getElementById(settingIds.custom) : null;
        if (!custom || custom.disabled) return { ok: false, reason: 'control' };
        el.value = 'custom';
        fire(el, 'change');
        custom.value = plan.customText;
        fire(custom, 'input'); fire(custom, 'change'); // never blur or Enter: that is native's commit path
      } else {
        el.value = plan.selectValue;
        fire(el, 'change');
        custom = key === 'diameter' && settingIds.custom ? doc.getElementById(settingIds.custom) : null;
      }
      return { ok: true, selectValue: el.value, customValue: custom ? custom.value : '' };
    },

    // Is this one of the five Pipe properties controls (diameter, its custom box, either source, material)?
    isSettingControl(el) {
      const id = el && el.id;
      return !!id && Object.keys(settingIds).some((k) => settingIds[k] === id);
    },

    // Is this one of native's per-port size controls (a select or custom box)?
    isPortControl(el) {
      const c = el && String(el.getAttribute && el.getAttribute('data-capture-control-id') || '');
      return !!c && c.indexOf(sizeIds.capturePrefix) === 0;
    },

    // Which of these element ids are not on the page right now?
    missingIds(list) {
      return list.filter((id) => !doc.getElementById(id));
    },

    // Native's "Adjust ports" checkbox (inside a label in the placement panel): { found, visible, checked, disabled }.
    readAdjustPorts() {
      const panel = doc.getElementById(panelIds.panel);
      if (!panel) return { found: false };
      for (const lab of panel.querySelectorAll('label')) {
        if (text(lab).indexOf(adjustLabelText) === -1) continue;
        const box = lab.querySelectorAll('input')[0];
        if (!box) continue;
        return { found: true, visible: !lab.hidden && isElementVisible(lab), checked: !!box.checked, disabled: !!box.disabled };
      }
      return { found: false };
    },

    // The one click on that checkbox (native toggles its placement state on change; nothing is saved).
    // Re-checks right before clicking. Returns { ok, checked }.
    clickAdjustPorts() {
      const panel = doc.getElementById(panelIds.panel);
      if (!panel || panel.hidden) return { ok: false };
      for (const lab of panel.querySelectorAll('label')) {
        if (text(lab).indexOf(adjustLabelText) === -1) continue;
        const box = lab.querySelectorAll('input')[0];
        if (!box || lab.hidden || box.disabled) return { ok: false };
        box.click();
        return { ok: true, checked: !!box.checked };
      }
      return { ok: false };
    },

    // Click one label in native's own menu (what a mouse click would do). False if it isn't there or is disabled.
    clickFamily(id) {
      const menu = doc.getElementById(panelIds.menu);
      if (!menu) return false;
      const btn = Array.from(menu.querySelectorAll(panelIds.optionSelector)).find((b) => b.getAttribute('data-family-id') === id);
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    },

    // Plain snapshot of the system dropdown for `#` search (see pipe-system-core.js).
    readSystems() {
      const el = doc.getElementById(ids.systemSelect);
      const debug = win.__graphDebug;
      const readable = !!debug && typeof debug === 'object' && 'selectedEntityId' in debug;
      return {
        found: !!el,
        disabled: !!(el && el.disabled),
        options: el ? Array.from(el.options || []).map((o) => ({ value: o.value, text: o.text })) : [],
        selectionReadable: readable,
        selectedEntityId: readable ? (debug.selectedEntityId || null) : null,
        currentValue: el ? el.value : null,
      };
    },

    // Choose a system the way a person does: set the value, then the change events. Returns the
    // dropdown's own value afterwards so the caller can report what the page actually took.
    writeSystem(id) {
      const el = doc.getElementById(ids.systemSelect);
      if (!el) return null;
      el.value = id;
      el.dispatchEvent(new win.Event('input', { bubbles: true }));
      el.dispatchEvent(new win.Event('change', { bubbles: true }));
      return el.value;
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

// ===== src/core/pipe-placement-core.js =====
const __m_pipe_placement_core = (function(){
// Pure logic for choosing a fitting label in native's "Place Fitting" panel. Takes a plain snapshot
// of that panel (read by src/pipe/pipe-host.js) and returns what the bar should show and what a
// typed word means. No DOM, no clicks: the host layer does those.
//
// Snapshot shape (all plain data):
//   { open, tool, hint, groups: [{ ports, usable, options: [{ id, label, usable }] }] }
const { matchCommands } = __m_command_line_core;

function lower(value) {
  return String(value ?? '').trim().toLowerCase();
}

// Which phase native's hint line says it is in. "Starts with", because native appends extra
// sentences (auto-matched diameter, per-port notes) to the same line.
function panelPhase(hint, prefixes) {
  const text = String(hint ?? '').trim();
  for (const phase of Object.keys(prefixes ?? {})) {
    const options = Array.isArray(prefixes[phase]) ? prefixes[phase] : [prefixes[phase]];
    if (options.some((prefix) => text.startsWith(prefix))) return phase;
  }
  return 'unknown';
}

// Ids from `required` that are not in `present` (both plain arrays of ids).
function missingIds(required, present) {
  const have = new Set(present ?? []);
  return (required ?? []).filter((id) => !have.has(id));
}

// What the bar should do about the placement panel's hint right now.
//   hint        the hint text (may be empty while native is still drawing the panel)
//   lastWarned  the hint we already warned about (so the warning is shown once, not every tick)
// Returns { action: 'ok' | 'warn' | 'quiet', hint }.
function hintWatch({ open, hint, prefixes, lastWarned }) {
  if (!open) return { action: 'ok', hint: null };
  const text = String(hint ?? '').trim();
  if (!text) return { action: 'quiet', hint: lastWarned ?? null };
  if (panelPhase(text, prefixes) !== 'unknown') return { action: 'ok', hint: null };
  return text === lastWarned ? { action: 'quiet', hint: lastWarned } : { action: 'warn', hint: text };
}

// The auto-matched run diameter native mentions in the hint (e.g. `2"`), or null.
function autoMatchedDiameter(hint, pattern) {
  const m = String(hint ?? '').match(pattern);
  return m ? m[1] + '"' : null;
}

// Extra names for one family in the menu that is open now. Fitting menu: the curated table.
// Fixture menu: the family id with its prefix removed (native's own short ids, wc, lav, ...).
function aliasesFor({ id, tool, curated, fixtureTool, fixturePrefixes }) {
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
function displayNameFor({ id, tool, fixtureTool, fixturePrefixes, names }) {
  if (tool !== fixtureTool) return null;
  const short = aliasesFor({ id, tool, curated: {}, fixtureTool, fixturePrefixes })[0];
  return (short && names && Object.prototype.hasOwnProperty.call(names, short)) ? names[short] : null;
}

// Flat list of every fitting in the open menu as table entries (name = native's family id).
function menuEntries({ groups, tool, curated, fixtureTool, fixturePrefixes, fixtureNames }) {
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
function categoriesOf(entries) {
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
function labelStep({ entries, category = null, query = '' }) {
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
function planPick(item) {
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
function isolationVerdict({ panelOpen, name, allowed }) {
  if (!panelOpen) return { ok: true };
  if ((allowed ?? []).includes(lower(name))) return { ok: true };
  return { ok: false, message: lower(name) + ': finish or cancel the fitting first (Esc cancels it)' };
}

/* ---------- Step 3: port prompts and Enter-to-Finish ---------- */

// The role native is asking for in the ports phase ("Click the detected intersection for inlet."), or
// null. Display only: native's own hint is missingPorts()[0], so it already skips ports native
// detected; we deliberately show no "n of N" because that count would be a guess.
function portRoleFromHint(hint, pattern) {
  const m = String(hint ?? '').match(pattern);
  return m ? m[1] : null;
}

// Is this element one we must never click, whatever else is true? By its text (the size-mismatch
// toast's "Resize anyway") or by living inside a forbidden container (the toast stack).
//   target { text, ancestorIds }
function targetForbidden(target, { forbiddenTexts = [], forbiddenContainerIds = [] } = {}) {
  const text = lower(target?.text);
  if (text && forbiddenTexts.some((t) => text === lower(t))) return true;
  const ancestors = target?.ancestorIds ?? [];
  return forbiddenContainerIds.some((id) => ancestors.includes(id));
}

// May Enter (or Space, per `finishKeys`) in the bar click Finish right now? Every condition is re-read by the caller at the moment
// of the click and this runs again. Returns { ok: true } or { ok: false, reason, message } where
// `message` is null when the key should just do nothing (the bar says something only where the
// person could be confused).
//   f { key, repeat, barFocused, barEmpty, panelOpen, hint, tool, allowedTools, finishPrefix,
//       latched, button: { found, id, expectedId, visible, disabled, ariaDisabled, forbidden } }
function finishVerdict(f) {
  const no = (reason, message = null) => ({ ok: false, reason, message });
  if (!(f?.finishKeys ?? ['Enter']).includes(f?.key)) return no('not-enter');
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
const FINISH_LATCH_OFF = { clicked: false, at: 0, leftReady: false };
function finishLatchClick(now) {
  return { clicked: true, at: now, leftReady: false };
}
function finishLatchStep({ latch, phase, panelOpen, now, expireMs }) {
  if (!latch?.clicked) return FINISH_LATCH_OFF;
  if (!panelOpen) return FINISH_LATCH_OFF;
  if (phase !== 'ready') return latch.leftReady ? latch : { ...latch, leftReady: true };
  if (latch.leftReady) return FINISH_LATCH_OFF;
  if (now - latch.at > expireMs) return FINISH_LATCH_OFF;
  return latch;
}

/* ---------- Step 3c: Adjust ports ---------- */

// "branch_a" -> "branch A", "inlet" -> "inlet". Display only: native's own role names are unchanged.
function roleDisplayName(role) {
  const r = String(role ?? '');
  const m = r.match(/^(.*)_([a-z])$/);
  return m ? `${m[1].replace(/_/g, ' ')} ${m[2].toUpperCase()}` : r.replace(/_/g, ' ');
}

// Where `role` sits in the family's port list: { n, N, done } (n is 1-based; done = the roles before it),
// or null when the role is not in the list. Exact only while Adjust ports is on, because Adjust asks for
// every role from scratch, in catalog order.
function portProgress(role, portContract) {
  const list = portContract ?? [];
  const i = list.indexOf(role);
  return i === -1 ? null : { n: i + 1, N: list.length, done: list.slice(0, i) };
}

// The line shown while native asks for a port. `adjustOn` is whether native's Adjust ports box is ticked.
// With Adjust on and the roles known: "click: outlet (2 of 4)  done: inlet  (click an assigned port again to undo)".
// Otherwise role only (native skips the ports it already detected, so a count there would be a guess).
function portLine({ role, adjustOn, portContract }) {
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
function adjustVerdict(f) {
  const no = (reason, message) => ({ ok: false, reason, message });
  if (!f?.panelOpen) return no('no-panel', 'adjust ports: no fitting is being placed');
  if (f.phase !== 'ready' && f.phase !== 'ports') return no('phase', 'adjust ports: choose the fitting label first');
  if (!f.found || !f.visible) return no('no-checkbox', 'adjust ports: the app shows no Adjust ports option here (it needs detected pipe intersections and a chosen fitting)');
  if (f.disabled) return no('disabled', 'adjust ports: the app has it disabled right now');
  return { ok: true };
}

return {panelPhase, missingIds, hintWatch, autoMatchedDiameter, aliasesFor, displayNameFor, menuEntries, categoriesOf, labelStep, planPick, isolationVerdict, portRoleFromHint, targetForbidden, finishVerdict, FINISH_LATCH_OFF, finishLatchClick, finishLatchStep, roleDisplayName, portProgress, portLine, adjustVerdict};
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
const { targetForbidden } = __m_pipe_placement_core;

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
function entryState(entry, target, { forbiddenIds = [], forbiddenCaptureIds = [], forbiddenTexts = [], forbiddenContainerIds = [] } = {}) {
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
  // A refused plan still names the entry, so the caller can say why instead of running something else.
  return { ...planEntry(entry, stateFor(entry)), entry };
}

// Which entries the dropdown lists: every tool (a disabled one stays visible so its reason can be
// shown), but an action that couldn't do anything right now is left out, as on the duct side.
// `stateFor(entry)` supplies entryState; the result keeps each entry with its state attached.
function listEntries(table, stateFor) {
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

// ===== src/core/search-core.js =====
const __m_search_core = (function(){
// Pure ranking behind `#` tag/system search — no DOM, no host globals. Live
// detection of the real tag/system list (RW._cmdDetectTags) stays in
// shell.js/src/features, since it reads annotationState/the DOM; only
// ranking an already-known list against a query is pure.
//
// Ranking: empty query keeps every tag in its own original order (rank 2
// for all, a stable sort — so `#` alone lists the full detected list, not a
// re-sorted one); otherwise exact name=0, name-prefix=1, name-substring=2.
function matchTags(list, query) {
  const q = (query ?? '').trim().toLowerCase();
  const ranked = [];
  list.forEach((tag, idx) => {
    const name = (tag.name ?? '').toLowerCase();
    let rank = -1;
    if (!q) rank = 2;
    else if (name === q) rank = 0;
    else if (name.indexOf(q) === 0) rank = 1;
    else if (name.indexOf(q) !== -1) rank = 2;
    if (rank !== -1) ranked.push({ tag, idx, rank });
  });
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.map((r) => ({ tag: r.tag, idx: r.idx }));
}

return {matchTags};
})();

// ===== src/core/pipe-system-core.js =====
const __m_pipe_system_core = (function(){
// Pure logic for `#` system search on the piping page: turn the page's system dropdown into a list,
// and decide whether choosing one is safe right now. No DOM, no clicks.
//
// Why a safety decision exists at all: native's change handler on #graph-system-select
// (graph-session-entry.js) does two different things. With NOTHING selected on the drawing it only
// sets the system the next route will use (no save). With a pipe selected it REASSIGNS that pipe
// to the chosen system, which submits a real command to the autosave journal. So choosing a system
// is only allowed when nothing is selected, and fails closed when that can't be read.
const { matchTags } = __m_search_core;

// [{ value, text }] from the dropdown's options -> [{ id, name }], skipping the blank placeholder.
function systemsFromOptions(options) {
  const list = [];
  for (const o of options ?? []) {
    const id = String(o?.value ?? '');
    if (!id) continue;
    list.push({ id, name: String(o?.text ?? '').trim() || id });
  }
  return list;
}

// Ranked list for what was typed after the `#` (empty = every system, in the page's own order).
function matchSystems(systems, query) {
  return matchTags(systems, query).map((r) => r.tag);
}

// May this system be chosen right now?
//   facts { found, disabled, selectionReadable, selectedEntityId }
// Returns { ok } or { ok: false, message }.
function systemPickVerdict(facts) {
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
function systemQuery(text) {
  const t = String(text ?? '');
  return t.startsWith('#') ? t.slice(1) : null;
}

return {systemsFromOptions, matchSystems, systemPickVerdict, systemQuery};
})();

// ===== src/core/pipe-log-core.js =====
const __m_pipe_log_core = (function(){
// Pure helpers for the bar's action log: a short, in-memory record of what the bar itself clicked or
// wrote, so that after a live test it is possible to tell the bar's actions from the person's own
// (mouse, native's Enter, native's undo). Nothing here stores, sends or writes anything.

// Append `entry` and keep only the newest `max` entries. Returns a new array (never mutates).
function appendLog(log, entry, max) {
  const next = (log ?? []).concat([entry]);
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : 1;
  return next.length > cap ? next.slice(next.length - cap) : next;
}

// A log entry. `rev*` are revision numbers (or null when unreadable); `revAfter` is filled in later.
function makeLogEntry({ at, what, kind, hint, tool, revBefore }) {
  return {
    at, time: new Date(at).toISOString(), kind: String(kind ?? ''), what: String(what ?? ''),
    hint: String(hint ?? ''), tool: tool ?? null,
    revBefore: Number.isFinite(revBefore) ? revBefore : null, revAfter: null,
  };
}

// Revision number from native's status text ("R14") or a plain number; null if unreadable.
function parseRevision(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const m = String(value ?? '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// One short line per entry, for printing in the console.
function formatLog(log) {
  return (log ?? []).map((e) => {
    const rev = e.revAfter === null ? `R${e.revBefore ?? '?'} -> ?` : `R${e.revBefore ?? '?'} -> R${e.revAfter}`;
    return `${e.time}  ${e.kind}  ${e.what}  [${rev}]  tool=${e.tool ?? '-'}  hint="${e.hint.slice(0, 60)}"`;
  });
}

return {appendLog, makeLogEntry, parseRevision, formatLog};
})();

// ===== src/core/pipe-size-core.js =====
const __m_pipe_size_core = (function(){
// Pure logic for port sizes on reducing fittings (Step 3b): parsing what a person types, formatting,
// deciding how to put a size into native's select + custom pair, the max-size rule, the choice/edit
// steps, and the guard that keeps us from ever editing an EXISTING fitting. No DOM, no clicks.
//
// parseSizeInput / formatSize are copies of native's parsePipeDiameter / formatPipeDiameter
// (pipe-diameter.js); test/native-ids.test.mjs runs both against native's own file on a set of inputs
// whenever the saved copy is present, so a change in native shows up as a failing test.

const SIZE_MIN_IN = 0.375; // native's own "Range 3/8 to 48 inches"
const SIZE_MAX_IN = 48;
const NOMINAL_SIZES_IN = [
  0.375, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24, 30, 36, 42, 48,
];

const FRACTION_PATTERN = /^(?:(\d+(?:\.\d+)?)[ -])?(\d+)\/(\d+)$/;

// Typed text -> positive number or null: "2", "2.5", "3/4", "1 1/2", "1-1/2", optional " or ″ suffix.
function parseSizeInput(raw) {
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

function formatSize(value) {
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
function planSizeInput(raw) {
  const value = parseSizeInput(raw);
  if (value === null) return { ok: false, message: 'not a size (try 2, 1-1/2, 3/4 or 1.75)' };
  if (value < SIZE_MIN_IN || value > SIZE_MAX_IN) return { ok: false, message: 'sizes run from 3/8" to 48"' };
  return { ok: true, value };
}

// How to put `value` into native's pair: a standard option on the select, or "custom" + text.
// `optionValues` are the select's own option values ("", "0.375", ..., "custom").
function planSizeWrite(value, optionValues) {
  const hit = (optionValues ?? []).find((o) => o !== '' && o !== 'custom' && Number(o) === value);
  return hit !== undefined ? { mode: 'select', selectValue: hit } : { mode: 'custom', customText: formatSize(value) };
}

// The size a select + custom pair currently holds (null when blank or unreadable).
function effectiveSize({ selectValue, customValue }) {
  return parseSizeInput(selectValue === 'custom' ? customValue : selectValue);
}

// "Inlet / Outlet diameter (in)" -> ['inlet', 'outlet']
function rolesFromLabel(label) {
  return String(label ?? '').replace(/diameter.*$/i, '').split('/').map((r) => r.trim().toLowerCase()).filter(Boolean);
}

// Per-role sizes from the fields (each field covers one or more roles).
//   fields [{ label, selectValue, customValue }]  ->  { role: number | null }
function roleSizes(fields) {
  const out = {};
  for (const f of fields ?? []) {
    const size = effectiveSize(f);
    for (const role of rolesFromLabel(f.label)) out[role] = size;
  }
  return out;
}

// The max-size rule from the catalog ({ outlet: 'inlet', branch: 'inlet' } = outlet and branch may not be
// larger than inlet). Returns messages for every broken pair; unknown sizes are skipped.
function maxViolations(sizes, maximumProfileByPort) {
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
function sizeWriteVerdict(f) {
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
const SIZE_CHOICES = [
  { id: 'asis', text: 'Use port sizes as is' },
  { id: 'edit', text: 'Edit port sizes' },
];
// A third row when native's Adjust ports box can be used right now.
const SIZE_CHOICE_ADJUST = { id: 'adjust', text: 'Adjust ports (click each port)' };
function sizeChoiceRows({ adjustUsable }) {
  return adjustUsable ? SIZE_CHOICES.concat([SIZE_CHOICE_ADJUST]) : SIZE_CHOICES.slice();
}

// Which fields the edit step asks about, in order: the ones that are not locked.
function editableFields(fields) {
  return (fields ?? []).filter((f) => !f.disabled);
}

// The state of the sizes step for the current placement.
//   stage: 'idle' | 'choice' | 'edit' | 'confirmed' | 'dismissed'
const SIZES_IDLE = { stage: 'idle', key: null, index: 0, drafts: {} };

// A key that changes when the placement (or its family / set of fields) changes, so a stale
// confirmation never carries over.
function sizesKey({ placement, familyId, roles }) {
  return `${placement}|${familyId ?? ''}|${(roles ?? []).join(',')}`;
}

// What the sizes step needs from the page this tick. Returns { action }:
//   'none'    nothing to do (no per-port fitting, or not at ready)
//   'open'    show the two rows
//   'blocked' per-port fitting at ready, but something is selected (say so once)
function sizesTickPlan({ state, key, perPort, ready, selectedEntityId, selectionReadable }) {
  if (!perPort || !ready) return { action: 'none' };
  if (!selectionReadable || selectedEntityId) return { action: 'blocked' };
  if (state?.key === key && state.stage !== 'idle') return { action: 'none' };
  return { action: 'open' };
}

// The recheck right before Finish: have the sizes changed since the person confirmed them?
function sizesChanged(confirmed, current) {
  const a = confirmed ?? {}, b = current ?? {};
  const roles = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const r of roles) if ((a[r] ?? null) !== (b[r] ?? null)) return true;
  return false;
}

// Extra conditions on Enter-to-Finish for a fitting with per-port sizes. Returns { ok } or
// { ok: false, reason, message, reopen }. `rulesReadable` false = catalog unreadable: warn, never block.
function sizesFinishGate({ perPort, stage, confirmed, current, violations, selectedEntityId, selectionReadable }) {
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

return {SIZE_MIN_IN, SIZE_MAX_IN, NOMINAL_SIZES_IN, parseSizeInput, formatSize, planSizeInput, planSizeWrite, effectiveSize, rolesFromLabel, roleSizes, maxViolations, sizeWriteVerdict, SIZE_CHOICES, SIZE_CHOICE_ADJUST, sizeChoiceRows, editableFields, SIZES_IDLE, sizesKey, sizesTickPlan, sizesChanged, sizesFinishGate};
})();

// ===== src/core/pipe-setting-core.js =====
const __m_pipe_setting_core = (function(){
// Pure logic for the piping "setting" commands (Step 5): diameter, dsource, material, msource. These
// four are the next-draw facts in native's "Pipe properties" block. No DOM, no clicks.
//
// Why a safety decision exists at all: native's change handlers on the diameter and diameter-source
// controls do two different things (pipe-session-ui.js). With NOTHING selected they only set what the
// next pipe will use (no save). With a resizable pipe selected they send a real resize command to the
// autosave journal (the custom box commits on blur or Enter). Material is wired to the local read
// only, but all four follow one rule: write only when nothing is selected and no fitting is being
// placed, and fail closed when the selection can't be read.
const { planSizeInput, planSizeWrite, parseSizeInput } = __m_pipe_size_core;

const lower = (s) => String(s ?? '').trim().toLowerCase();

// May the bar write this control right now? Every fact arrives as an argument.
//   f { label, found, visible, disabled, panelOpen, selectionReadable, selectedEntityId, sourceUnresolved }
// Order matters only for which reason is shown; every failing fact refuses.
function settingVerdict(f) {
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
function optionMatch(options, query) {
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
function diameterPlan(raw, optionValues) {
  const size = planSizeInput(raw);
  if (!size.ok) return size;
  return { ok: true, value: size.value, ...planSizeWrite(size.value, optionValues) };
}

// Did the page take what we wrote? `wanted` is a diameterPlan result ({ mode, selectValue | customText })
// or { mode: 'select', selectValue } for the select-only settings; `read` is what the controls hold now.
function readbackVerdict(wanted, read) {
  if (!wanted || !read) return { ok: false, message: 'could not read the value back' };
  if (wanted.mode === 'custom') {
    const want = parseSizeInput(wanted.customText);
    const got = read.selectValue === 'custom' ? parseSizeInput(read.customValue) : null;
    return want !== null && got === want ? { ok: true } : { ok: false, message: 'the app shows a different size' };
  }
  return String(read.selectValue ?? '') === String(wanted.selectValue ?? '') ? { ok: true } : { ok: false, message: 'the app shows a different value' };
}

// The select's own option row -> the text shown in the bar's list.
function optionRowText(option, index) {
  return `${index + 1}. ${option.text || option.value || '(blank)'}`;
}

return {settingVerdict, optionMatch, diameterPlan, readbackVerdict, optionRowText};
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
    PIPE_FORBIDDEN_BUTTON_IDS, PIPE_FORBIDDEN_CAPTURE_IDS, PIPE_ISOLATION_ALLOWED,
    PIPE_PANEL_IDS, PIPE_HINT_PREFIXES, PIPE_AUTOMATCH_PATTERN, PIPE_UNAVAILABLE_MARK,
    PIPE_FITTING_ALIASES, PIPE_FIXTURE_ID_PREFIXES, PIPE_FIXTURE_TOOL, PIPE_FIXTURE_DISPLAY_NAMES,
    PIPE_NATIVE_CHANGED_MESSAGE, PIPE_REQUIRED_IDS,
    PIPE_FORBIDDEN_BUTTON_TEXTS, PIPE_FORBIDDEN_CONTAINER_IDS, PIPE_FINISH_BUTTON_ID, PIPE_FINISH_HINT_PREFIX,
    PIPE_FINISH_TOOLS, PIPE_FINISH_KEYS, PIPE_FINISH_LATCH_MS, PIPE_PORT_ROLE_PATTERN, PIPE_LOG_MAX, PIPE_LOG_AFTER_MS,
    PIPE_SIZE_IDS, PIPE_SIZE_TOOLS, PIPE_ADJUST, PIPE_ADJUST_ENTRY,
    PIPE_SETTING_IDS, PIPE_SETTING_ENTRIES, PIPE_SOURCE_UNRESOLVED,
  } = __m_pipe_tables;
  const {
    panelPhase, autoMatchedDiameter, menuEntries, labelStep, planPick, isolationVerdict, hintWatch,
    portRoleFromHint, portLine, adjustVerdict, targetForbidden, finishVerdict, finishLatchClick, finishLatchStep, FINISH_LATCH_OFF,
  } = __m_pipe_placement_core;
  const { appendLog, makeLogEntry, parseRevision, formatLog } = __m_pipe_log_core;
  const {
    planSizeInput, planSizeWrite, roleSizes, maxViolations, sizeWriteVerdict, SIZE_CHOICES, editableFields,
    SIZES_IDLE, sizesKey, sizesTickPlan, sizesFinishGate, formatSize, effectiveSize, sizeChoiceRows,
  } = __m_pipe_size_core;
  const { systemsFromOptions, matchSystems, systemPickVerdict, systemQuery } = __m_pipe_system_core;
  const { settingVerdict, optionMatch, diameterPlan, readbackVerdict, optionRowText } = __m_pipe_setting_core;
  const {
    deriveTools, buildTable, entryState, planEntry, planQuery, listEntries, reconcileArmed, loaderGuard,
  } = __m_pipe_table_core;
  const { matchCommands, commandBarShouldCapture, spaceRepeatAction } = __m_command_line_core;
  const { createPipeHost } = __m_pipe_host;

  const host = createPipeHost({
    doc: document, win: window, ids: PIPE_PAGE_IDS, panelIds: PIPE_PANEL_IDS, sizeIds: PIPE_SIZE_IDS, settingIds: PIPE_SETTING_IDS, unresolvedValue: PIPE_SOURCE_UNRESOLVED, adjustLabelText: PIPE_ADJUST.labelText, unavailableMark: PIPE_UNAVAILABLE_MARK,
  });

  // Second line of defence behind the loader's own check (a direct paste of dist/ skips the loader).
  const guard = loaderGuard(host.readPageFacts());
  if (!guard.ok) { console.warn('[RW] ' + guard.message); return guard.message; }
  // Safety net: if native no longer has an element we depend on, install nothing and say so (one line).
  const missing = host.missingIds(PIPE_REQUIRED_IDS);
  if (missing.length) {
    console.warn('[RW] ' + PIPE_NATIVE_CHANGED_MESSAGE + '. Missing on this page: ' + missing.join(', '));
    RW._pipeMissing = missing;
    if (RW._commitStatus) RW._commitStatus(PIPE_NATIVE_CHANGED_MESSAGE);
    return PIPE_NATIVE_CHANGED_MESSAGE;
  }
  RW.vpipe = true;

  const FORBIDDEN = { forbiddenIds: PIPE_FORBIDDEN_BUTTON_IDS, forbiddenCaptureIds: PIPE_FORBIDDEN_CAPTURE_IDS,
    forbiddenTexts: PIPE_FORBIDDEN_BUTTON_TEXTS, forbiddenContainerIds: PIPE_FORBIDDEN_CONTAINER_IDS };
  const RESERVED_KEYS = ['m']; // native's own ruler hotkey: never captured into the bar

  /* ---------- table (re-derived from the live rail every time, never cached) ---------- */
  function derive() {
    return deriveTools({
      railTools: host.readRail(), fallbackKeys: PIPE_FALLBACK_KEYS,
      curatedAliases: PIPE_TOOL_ALIASES, actions: PIPE_GRAPH_ACTIONS,
    });
  }
  function currentTable() { return buildTable(derive().tools, PIPE_GRAPH_ACTIONS).concat([PIPE_ADJUST_ENTRY], PIPE_SETTING_ENTRIES); }
  // Can the bar tick/untick native's Adjust ports box right now? (see adjustVerdict)
  function adjustFacts() {
    const snap = host.readPanel();
    const a = host.readAdjustPorts();
    return {
      panelOpen: snap.open, phase: snap.open ? panelPhase(snap.hint, PIPE_HINT_PREFIXES) : 'closed',
      found: a.found, visible: a.visible, disabled: a.disabled,
    };
  }
  // Can the bar write this setting right now? (see settingVerdict; the host checks it again when writing)
  function settingFacts(entry) {
    const st = host.readSettings();
    const c = st.controls[entry.control] || { found: false };
    const src = st.controls.dsource || { found: false };
    return {
      label: entry.label, found: c.found, visible: c.visible, disabled: c.disabled,
      panelOpen: st.panelOpen, selectionReadable: st.selectionReadable, selectedEntityId: st.selectedEntityId,
      sourceUnresolved: entry.control === 'diameter' && src.found && src.value === PIPE_SOURCE_UNRESOLVED,
    };
  }
  function stateFor(entry) {
    if (entry.kind === 'setting') {
      const v = settingVerdict(settingFacts(entry));
      return { usable: v.ok, forbidden: false, reason: v.ok ? null : v.message.replace(/^[^:]+: /, '') };
    }
    if (entry.kind === 'adjust') {
      const v = adjustVerdict(adjustFacts());
      return { usable: v.ok, forbidden: false, reason: v.ok ? null : v.message.replace(/^adjust ports: /, '') };
    }
    return entryState(entry, host.describeTarget(entry), FORBIDDEN);
  }

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

  /* ---------- action log: what the bar itself did (in memory only, last PIPE_LOG_MAX) ---------- */
  // Read from the console: __RW._pipeLog (entries) or __RW._pipeLogPrint() (one line each). Never
  // stored in the page, localStorage or sent anywhere. `revAfter` is read PIPE_LOG_AFTER_MS later.
  RW._pipeLog = [];
  RW._pipeLogPrint = function(){ return formatLog(RW._pipeLog); };
  // A click that did not happen is not an action: take its entry back.
  function unlogLast() { RW._pipeLog = RW._pipeLog.slice(0, -1); }
  function logAction(kind, what) {
    const snap = host.readPanel();
    const entry = makeLogEntry({
      at: Date.now(), kind: kind, what: what, hint: snap.open ? snap.hint : '', tool: snap.open ? snap.tool : host.readActiveTool(),
      revBefore: parseRevision(host.readRevision()),
    });
    RW._pipeLog = appendLog(RW._pipeLog, entry, PIPE_LOG_MAX);
    setTimeout(function(){ entry.revAfter = parseRevision(host.readRevision()); }, PIPE_LOG_AFTER_MS);
  }

  /* ---------- running an entry ---------- */
  let inputEl = null;
  function runEntry(entry) {
    // Blur first: native ignores a tool key while a form field has focus, and the bar's input is one.
    if (inputEl && inputEl.blur) inputEl.blur();
    // While a placement panel is open only the ways out and the view/undo actions may run.
    const iso = isolationVerdict({ panelOpen: host.readPanel().open, name: entry.name, allowed: PIPE_ISOLATION_ALLOWED });
    if (!iso.ok) { status(iso.message); return false; }
    if (entry.kind === 'adjust') return runAdjust();
    if (entry.kind === 'setting') return startSetting(entry);
    const plan = planEntry(entry, stateFor(entry));
    if (plan.action !== 'click') { status(plan.message); return false; }
    const before = host.readActiveTool();
    logAction(entry.kind, entry.kind + ' ' + entry.name);
    if (!host.clickEntry(entry)) { unlogLast(); status(entry.name + ': nothing to click on this page'); return false; }
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
  // The label prompt for native's Place Fitting panel (Step 2).
  const prompt = { active: false, dismissed: false, category: null, header: '', tool: null };
  const MENU_GAP = 6, MENU_MAX_H = 220, MENU_MIN_H = 60;
  const COLORS = { tool: '#a8e6a3', action: '#8ecae6', adjust: '#8ecae6', setting: '#8ecae6', system: '#e6c8ff', disabled: '#888' };

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
    if (sizesUi.active && sizesUi.header) {
      const head = document.createElement('div');
      head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;border-bottom:1px solid #444;';
      head.textContent = sizesUi.header;
      menuEl.appendChild(head);
    }
    if (settingUi.active && settingUi.header) {
      const head = document.createElement('div');
      head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;border-bottom:1px solid #444;';
      head.textContent = settingUi.header;
      menuEl.appendChild(head);
    }
    if (prompt.active && prompt.header) {
      const head = document.createElement('div');
      head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;border-bottom:1px solid #444;';
      head.textContent = prompt.header;
      menuEl.appendChild(head);
    }
    menuItems.forEach(function(row, i){
      const el = document.createElement('div');
      el.className = 'rw-pipe-item';
      let usable, color, label;
      if (row.size) {
        usable = true; color = COLORS.tool; label = row.size.text;
      } else if (row.setting) {
        usable = true; color = COLORS.tool; label = optionRowText(row.setting.option, row.setting.index) + (row.setting.current ? '  (now)' : '');
      } else if (row.system) {
        usable = true; color = COLORS.system; label = row.system.name;
      } else if (row.prompt) {
        usable = row.prompt.kind === 'category' ? row.prompt.usable : row.prompt.entry.usable;
        color = usable ? COLORS.tool : COLORS.disabled;
        label = promptLabel(row.prompt);
      } else {
        const e = row.entry;
        usable = row.state.usable;
        color = usable ? COLORS[e.kind] : COLORS.disabled;
        label = e.name + (e.aliases.length ? ' (' + e.aliases.join(',') + ')' : '');
        if (!usable) label += ' — ' + (row.state.reason || 'not available');
      }
      el.style.cssText = 'padding:3px 6px;font-size:11px;cursor:pointer;color:' + color + ';'
        + (i === menuHighlight ? 'background:rgba(255,140,0,0.3);' : '');
      el.textContent = label;
      if (i === menuHighlight) highlighted = el;
      el.addEventListener('mousedown', function(ev){ ev.preventDefault(); }); // keep focus through the click
      el.addEventListener('click', function(){ if (row.size) pickSizeChoice(row.size); else if (row.setting) applyPickedSetting(row.setting.option); else if (row.system) pickSystem(row.system); else if (row.prompt) pickPrompt(row.prompt); else runAndClear(row.entry); });
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
    if (prompt.active) { refreshPrompt(); return; }
    if (sizesUi.active) { return; } // the sizes step owns the menu; typing is the value being entered
    if (settingUi.active) { refreshSettingRows(); return; } // the setting prompt owns the menu
    const sq = systemQuery(query);
    if (sq !== null) { openSystemMenu(sq); return; }
    menuItems = rowsFor(query);
    menuHighlight = menuItems.length ? 0 : -1;
    renderMenu();
  }

  /* ---------- `#` system search: choose the system the next route will use ---------- */
  function currentSystems() { return systemsFromOptions(host.readSystems().options); }
  function openSystemMenu(sq) {
    if (host.readPanel().open) { status('system: finish or cancel the fitting first (Esc cancels it)'); hideMenu(); return; }
    menuItems = matchSystems(currentSystems(), sq).map(function(s){ return { system: s }; });
    menuHighlight = menuItems.length ? 0 : -1;
    if (!menuItems.length) status('system: nothing matches "' + sq + '"');
    renderMenu();
  }
  function pickSystem(system) {
    if (host.readPanel().open) { status('system: finish or cancel the fitting first (Esc cancels it)'); return false; }
    const facts = host.readSystems();
    const verdict = systemPickVerdict(facts);
    if (!verdict.ok) { status(verdict.message); hideMenu(); return false; }
    logAction('system', 'set system dropdown: ' + system.name);
    const after = host.writeSystem(system.id);
    own.lastCmdAt = Date.now();
    const shown = host.readSystems();
    const now = systemsFromOptions(shown.options).find(function(s){ return s.id === shown.currentValue; });
    status(after === system.id
      ? 'system: ' + system.name + ' (the page now shows: ' + (now ? now.name : shown.currentValue) + ')'
      : 'system: asked for ' + system.name + ' but the page shows ' + (now ? now.name : shown.currentValue));
    clearBar();
    if (inputEl) inputEl.blur();
    return true;
  }

  /* ---------- label prompt: choose the fitting in native's Place Fitting panel ---------- */
  function promptLabel(item) {
    if (item.kind === 'category') {
      return item.ports + (item.ports === 1 ? ' port' : ' ports') + (item.usable ? ' (' + item.count + ')' : ' — none available');
    }
    const e = item.entry;
    const names = [e.id].concat(e.aliases.length ? ['(' + e.aliases.join(',') + ')'] : []);
    return (e.display || e.label) + '  ' + names.join(' ') + (e.usable ? '' : ' — unavailable');
  }
  function promptEntries(snap) {
    return menuEntries({
      groups: snap.groups, tool: snap.tool, curated: PIPE_FITTING_ALIASES,
      fixtureTool: PIPE_FIXTURE_TOOL, fixturePrefixes: PIPE_FIXTURE_ID_PREFIXES, fixtureNames: PIPE_FIXTURE_DISPLAY_NAMES,
    });
  }
  function refreshPrompt() {
    const snap = host.readPanel();
    const step = labelStep({ entries: promptEntries(snap), category: prompt.category, query: inputEl ? inputEl.value : '' });
    const dia = autoMatchedDiameter(snap.hint, PIPE_AUTOMATCH_PATTERN);
    const where = step.stage === 'category' ? 'ports: type 1-4 or a name' : (step.category !== null ? step.category + '-port: pick one (Backspace = back)' : 'pick one');
    prompt.header = step.stage === 'none'
      ? 'No fitting can be placed for this box. Esc cancels the placement.'
      : 'Fitting label — ' + where + (dia ? ' — auto-matched ' + dia : '');
    menuItems = step.items.map(function(item){ return { prompt: item }; });
    menuHighlight = menuItems.length ? 0 : -1;
    ensureMenu();
    if (!menuItems.length) {
      menuEl.innerHTML = '';
      const head = document.createElement('div');
      head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;';
      head.textContent = prompt.header + (step.stage === 'none' ? '' : ' (nothing matches)');
      menuEl.appendChild(head);
      positionMenu();
      menuEl.style.display = 'block';
      return;
    }
    renderMenu();
  }
  function startPrompt() {
    const snap = host.readPanel();
    prompt.active = true; prompt.category = null; prompt.tool = snap.tool;
    mountBar();
    if (!inputEl) { prompt.active = false; return; }
    inputEl.value = '';
    inputEl.focus();
    refreshPrompt();
  }
  function endPrompt() {
    if (!prompt.active) return;
    prompt.active = false; prompt.category = null; prompt.header = '';
    if (inputEl) inputEl.value = '';
    hideMenu();
  }
  function pickPrompt(item) {
    const plan = planPick(item);
    if (plan.action === 'status') { status(plan.message); return; }
    if (plan.action === 'category') {
      prompt.category = plan.ports;
      if (inputEl) inputEl.value = '';
      refreshPrompt();
      return;
    }
    // Click native's own label button (what a mouse click does). Never Finish: that stays manual.
    logAction('label', 'chose ' + plan.id);
    if (!host.clickFamily(plan.id)) { unlogLast(); status(plan.label + ': could not be chosen (the menu changed)'); refreshPrompt(); return; }
    status(plan.label + ' chosen');
    endPrompt();
    // Native has just moved keyboard focus onto its own label button (subtype.focus()), and that
    // button opens its menu on Enter / Space / ArrowDown. For a moment, swallow those keys if they
    // land on it, and take focus back once so the key's own release or repeat lands harmlessly on our bar.
    labelGuardUntil = Date.now() + LABEL_GUARD_MS;
    setTimeout(refocusBarOnce, 0);
  }
  let unknownHintWarned = null;

  /* ---------- Step 3: port prompt (display only) and Enter-to-Finish ---------- */
  let finishLatch = FINISH_LATCH_OFF;
  let portNoteRole = null, portNoteShown = false;
  // While native asks for a port ("Click the detected intersection for <role>."), say which one. It
  // never takes focus (Esc and clicks keep going to the app) and never clicks anything.
  function updatePortNote(snap) {
    const role = (snap.open && panelPhase(snap.hint, PIPE_HINT_PREFIXES) === 'ports') ? portRoleFromHint(snap.hint, PIPE_PORT_ROLE_PATTERN) : null;
    let line = null;
    if (role) {
      // With Adjust ports ticked every role is asked from scratch, so "n of N" is exact; otherwise role only.
      const adjustOn = host.readAdjustPorts().checked === true;
      const famId = host.readChosenFamilyId();
      const rules = adjustOn && famId ? host.readFamilyRules(famId) : null;
      line = portLine({ role: role, adjustOn: adjustOn, portContract: rules && rules.readable ? rules.portContract : null });
    }
    if (line === portNoteRole) return;
    portNoteRole = line;
    if (!line) {
      if (portNoteShown) { portNoteShown = false; if (!prompt.active && document.activeElement !== inputEl) hideMenu(); }
      return;
    }
    mountBar();
    if (!inputEl || prompt.active) return;
    ensureMenu();
    menuItems = []; menuHighlight = -1;
    menuEl.innerHTML = '';
    const head = document.createElement('div');
    head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;';
    head.textContent = line;
    menuEl.appendChild(head);
    positionMenu();
    menuEl.style.display = 'block';
    portNoteShown = true;
    status(line);
  }

  /* ---------- Step 3b: port sizes on reducing fittings (keyboard only) ---------- */
  // At ready, for a fitting with per-port size fields, the bar shows two rows ("Use port sizes as is" /
  // "Edit port sizes"). Editing collects typed sizes and writes them into native's own select + custom
  // pair only when a NEW placement is open and ready and nothing is selected (on an existing selected
  // fitting, native saves a size change). Nothing here finishes: Enter-to-Finish stays its own press.
  const sizesUi = { active: false, header: '' };
  let sizes = { stage: SIZES_IDLE.stage, key: null, index: 0, drafts: {}, confirmed: null };
  let placementCount = 0, panelWasOpen = false, sizesBlockedWarned = false, rulesUnreadableWarned = false;

  function sizesFacts(snap) {
    const pf = host.readPortFields();
    const sel = host.readSelection();
    const famId = host.readChosenFamilyId();
    const ready = snap.open && String(snap.hint || '').trim().startsWith(PIPE_FINISH_HINT_PREFIX) && PIPE_SIZE_TOOLS.indexOf(snap.tool) !== -1;
    const key = sizesKey({ placement: placementCount, familyId: famId, roles: pf.fields.map(function(f){ return f.role; }) });
    return { pf: pf, sel: sel, famId: famId, ready: ready, key: key, current: roleSizes(pf.fields) };
  }
  function currentViolations(f) {
    if (!f.pf.present || !f.famId) return [];
    const rules = host.readFamilyRules(f.famId);
    if (!rules.readable) return null; // unreadable: warn, never block
    return maxViolations(f.current, rules.maximumProfileByPort);
  }
  // The extra conditions Enter-to-Finish must meet for a fitting with per-port sizes.
  function currentSizesGate(snap) {
    const f = sizesFacts(snap);
    const v = currentViolations(f);
    return sizesFinishGate({
      perPort: f.pf.present && PIPE_SIZE_TOOLS.indexOf(snap.tool) !== -1,
      stage: sizes.key === f.key ? sizes.stage : 'idle', confirmed: sizes.confirmed, current: f.current,
      violations: v || [], selectedEntityId: f.sel.selectedEntityId, selectionReadable: f.sel.selectionReadable,
    });
  }
  function resetSizes() {
    sizes = { stage: SIZES_IDLE.stage, key: null, index: 0, drafts: {}, confirmed: null };
    sizesBlockedWarned = false; rulesUnreadableWarned = false;
    if (sizesUi.active) { sizesUi.active = false; sizesUi.header = ''; hideMenu(); }
  }
  function renderSizesChoice() {
    sizesUi.active = true;
    sizesUi.header = 'Port sizes: pick one (Enter or Space)';
    menuItems = sizeChoiceRows({ adjustUsable: adjustVerdict(adjustFacts()).ok }).map(function(c){ return { size: c }; });
    menuHighlight = 0;
    ensureMenu(); renderMenu();
  }
  function renderSizesEdit(field) {
    sizesUi.active = true;
    const cur = formatSize(effectiveSize(field) || 0);
    sizesUi.header = field.role + ' diameter (now ' + (cur ? cur + '"' : 'blank') + '): type a size, Enter = keep, Esc = back. Use 2-1/2, not 2 1/2';
    menuItems = []; menuHighlight = -1;
    ensureMenu();
    menuEl.innerHTML = '';
    const head = document.createElement('div');
    head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;';
    head.textContent = sizesUi.header;
    menuEl.appendChild(head);
    positionMenu();
    menuEl.style.display = 'block';
  }
  function openSizesChoice() {
    sizes.stage = 'choice'; sizes.index = 0; sizes.drafts = {};
    sizes.key = sizesFacts(host.readPanel()).key;
    mountBar();
    if (!inputEl) return;
    inputEl.value = '';
    inputEl.focus();
    renderSizesChoice();
  }
  // Tick or untick native's Adjust ports box (placement state only; nothing is saved).
  function runAdjust() {
    const v = adjustVerdict(adjustFacts());
    if (!v.ok) { status(v.message); return false; }
    const wasOn = host.readAdjustPorts().checked === true;
    logAction('adjust', (wasOn ? 'unticked' : 'ticked') + ' Adjust ports');
    const r = host.clickAdjustPorts();
    if (!r.ok) { unlogLast(); status('adjust ports: could not change it'); return false; }
    own.lastCmdAt = Date.now();
    const keep = placementCount; resetSizes(); placementCount = keep;
    status(r.checked
      ? 'adjust ports on: click each port in the order the bar shows (click an assigned port again to undo)'
      : 'adjust ports off: the app assigns the ports itself');
    return true;
  }
  function sizeTick(snap) {
    if (!snap.open) { if (panelWasOpen) resetSizes(); panelWasOpen = false; return; }
    if (!panelWasOpen) { placementCount += 1; panelWasOpen = true; resetSizes(); }
    const f = sizesFacts(snap);
    if (sizes.key !== null && sizes.key !== f.key) { const keep = placementCount; resetSizes(); placementCount = keep; }
    // Leaving ready (a label change, the ports phase after Adjust ports, saving) forgets any confirmation:
    // assigning ports reseeds the sizes, so the rows ask again when ready returns.
    if (!f.ready) { const keep = placementCount; resetSizes(); placementCount = keep; return; }
    const plan = sizesTickPlan({
      state: sizes, key: f.key, perPort: f.pf.present, ready: f.ready,
      selectedEntityId: f.sel.selectedEntityId, selectionReadable: f.sel.selectionReadable,
    });
    if (plan.action === 'blocked') {
      if (!sizesBlockedWarned) { sizesBlockedWarned = true; status(sizeWriteVerdict({ panelOpen: true, ready: true, selectionReadable: f.sel.selectionReadable, selectedEntityId: f.sel.selectedEntityId }).message); }
      return;
    }
    if (plan.action === 'open' && !prompt.active) { sizes.key = f.key; openSizesChoice(); }
    // The menu goes away when the bar loses focus; bring the current step's rows back (no focus change).
    if (sizesUi.active && (!menuEl || menuEl.style.display === 'none')) {
      if (sizes.stage === 'choice') renderSizesChoice();
      else if (sizes.stage === 'edit') { const fs = editableFields(f.pf.fields); if (fs[sizes.index]) renderSizesEdit(fs[sizes.index]); }
    }
  }
  function pickSizeChoice(choice) {
    if (choice.id === 'adjust') { sizesUi.active = false; sizesUi.header = ''; hideMenu(); runAdjust(); return; }
    if (choice.id === 'asis') { confirmSizes('kept'); return; }
    // edit: ask for each editable port in on-screen order
    sizes.stage = 'edit'; sizes.index = 0; sizes.drafts = {};
    askNextSize();
  }
  function askNextSize() {
    const snap = host.readPanel();
    const f = sizesFacts(snap);
    const fields = editableFields(f.pf.fields);
    if (sizes.index >= fields.length) { applySizes(f, fields); return; }
    if (inputEl) { inputEl.value = ''; inputEl.focus(); }
    renderSizesEdit(fields[sizes.index]);
  }
  function enterSizeValue() {
    const snap = host.readPanel();
    const f = sizesFacts(snap);
    const fields = editableFields(f.pf.fields);
    const field = fields[sizes.index];
    if (!field) { openSizesChoice(); return; }
    const typed = inputEl.value.trim();
    if (typed) {
      const plan = planSizeInput(typed);
      if (!plan.ok) { status('port sizes: ' + plan.message); return; }
      sizes.drafts[field.cap] = plan.value;
    }
    sizes.index += 1;
    askNextSize();
  }
  function applySizes(f, fields) {
    const caps = Object.keys(sizes.drafts);
    for (let i = 0; i < caps.length; i++) {
      const field = fields.filter(function(x){ return x.cap === caps[i]; })[0];
      const fresh = sizesFacts(host.readPanel());
      const verdict = sizeWriteVerdict({
        panelOpen: host.readPanel().open, ready: fresh.ready, selectionReadable: fresh.sel.selectionReadable,
        selectedEntityId: fresh.sel.selectedEntityId, fieldDisabled: !field || field.disabled,
      });
      if (!verdict.ok) { status(verdict.message); openSizesChoice(); return; }
      const write = planSizeWrite(sizes.drafts[caps[i]], field.optionValues);
      logAction('sizes', 'set ' + field.role + ' to ' + formatSize(sizes.drafts[caps[i]]) + '"');
      if (!host.writePortSize(field.cap, write).ok) { unlogLast(); status('port sizes: could not change ' + field.role); openSizesChoice(); return; }
    }
    // Native focuses its custom box when "Custom" is picked: take the keyboard back once, and guard the keys.
    labelGuardUntil = Date.now() + LABEL_GUARD_MS;
    setTimeout(refocusBarOnce, 0);
    confirmSizes(caps.length ? 'set' : 'kept');
  }
  function confirmSizes(how) {
    const snap = host.readPanel();
    const f = sizesFacts(snap);
    sizes.stage = 'confirmed'; sizes.key = f.key; sizes.confirmed = f.current; sizes.drafts = {};
    sizesUi.active = false; sizesUi.header = '';
    hideMenu();
    if (inputEl) inputEl.value = '';
    const shown = Object.keys(f.current).map(function(r){ return r + ' ' + (f.current[r] ? formatSize(f.current[r]) + '"' : '?'); }).join(', ');
    const v = currentViolations(f);
    if (v === null) {
      if (!rulesUnreadableWarned) { rulesUnreadableWarned = true; }
      status('port sizes ' + how + ' (' + shown + '). Could not read the max-size rules, so the server will check them. Enter finishes');
    } else if (v.length) {
      status('port sizes ' + how + ' (' + shown + '). ' + v[0] + '. Enter will not finish until this is fixed');
    } else {
      status('port sizes ' + how + ' (' + shown + '). Enter finishes');
    }
  }

  /* ---------- Step 5: setting commands (diameter, dsource, material, msource) ---------- */
  // Each opens a small prompt in the bar (a size to type, or the select's own options to pick) and writes
  // native's next-draw control only when nothing is selected and no fitting is being placed (with a pipe
  // selected, native's diameter handlers send a saved resize). The host checks again before writing.
  const settingUi = { active: false, stage: null, entry: null, options: [], header: '' };
  function settingNow(entry, st) {
    const c = st.controls[entry.control] || {};
    if (entry.control === 'diameter') {
      const size = effectiveSize({ selectValue: c.value, customValue: (st.controls.custom || {}).value });
      return size ? formatSize(size) + '"' : 'unresolved';
    }
    const hit = (c.options || []).filter(function(o){ return o.value === c.value; })[0];
    return hit ? (hit.text || hit.value || 'blank') : (c.value || 'blank');
  }
  function renderSettingHeader() {
    const st = host.readSettings();
    const entry = settingUi.entry;
    settingUi.header = entry.label + ' (now ' + settingNow(entry, st) + ', applies to the next pipe): '
      + (settingUi.stage === 'value' ? 'type a size, Enter applies, Esc cancels. Use 2-1/2, not 2 1/2' : 'pick one (type to filter, or a number), Esc cancels');
  }
  function refreshSettingRows() {
    const st = host.readSettings();
    const c = st.controls[settingUi.entry.control] || { options: [] };
    settingUi.options = c.options || [];
    renderSettingHeader();
    ensureMenu();
    if (settingUi.stage === 'value') {
      menuItems = []; menuHighlight = -1;
      menuEl.innerHTML = '';
      const head = document.createElement('div');
      head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;';
      head.textContent = settingUi.header;
      menuEl.appendChild(head);
      positionMenu();
      menuEl.style.display = 'block';
      return;
    }
    const q = (inputEl ? inputEl.value : '').trim().toLowerCase();
    const rows = settingUi.options.map(function(o, i){ return { setting: { option: o, index: i, current: o.value === c.value } }; });
    menuItems = q ? rows.filter(function(r){
      const o = r.setting.option;
      return (/^\d+$/.test(q) && r.setting.index + 1 === Number(q)) || o.text.toLowerCase().indexOf(q) !== -1 || o.value.toLowerCase().indexOf(q) !== -1;
    }) : rows;
    const cur = menuItems.findIndex(function(r){ return r.setting.current; });
    menuHighlight = menuItems.length ? (q || cur < 0 ? 0 : cur) : -1;
    renderMenu();
  }
  function startSetting(entry) {
    const v = settingVerdict(settingFacts(entry));
    if (!v.ok) { status(v.message); return false; }
    mountBar();
    if (!inputEl) return false;
    settingUi.active = true; settingUi.entry = entry; settingUi.stage = entry.valueKind === 'size' ? 'value' : 'pick';
    inputEl.value = '';
    inputEl.focus();
    refreshSettingRows();
    return true;
  }
  function endSetting(how) {
    if (!settingUi.active) return;
    const label = settingUi.entry ? settingUi.entry.label : 'setting';
    settingUi.active = false; settingUi.stage = null; settingUi.entry = null; settingUi.options = []; settingUi.header = '';
    if (inputEl) inputEl.value = '';
    hideMenu();
    if (how === 'cancelled') status(label + ': unchanged');
  }
  function enterSetting() {
    const entry = settingUi.entry;
    const typed = inputEl.value.trim();
    if (settingUi.stage === 'value') {
      if (!typed) { endSetting('cancelled'); if (inputEl) inputEl.blur(); return; }
      const st = host.readSettings();
      const plan = diameterPlan(typed, ((st.controls.diameter || {}).options || []).map(function(o){ return o.value; }));
      if (!plan.ok) { status(entry.label + ': ' + plan.message); return; }
      applySetting(entry, plan, formatSize(plan.value) + '"');
      return;
    }
    if (typed) {
      const m = optionMatch(settingUi.options, typed);
      if (!m.ok) { status(entry.label + ': ' + m.message); return; }
      applyPickedSetting(m.option);
    } else if (menuHighlight >= 0 && menuItems[menuHighlight] && menuItems[menuHighlight].setting) {
      applyPickedSetting(menuItems[menuHighlight].setting.option);
    } else status(entry.label + ': nothing matches');
  }
  function applyPickedSetting(option) {
    if (!settingUi.active) return;
    applySetting(settingUi.entry, { mode: 'select', selectValue: option.value }, option.text || option.value || 'blank');
  }
  function applySetting(entry, plan, shown) {
    const v = settingVerdict(settingFacts(entry));
    if (!v.ok) { status(v.message); endSetting(); if (inputEl) inputEl.blur(); return false; }
    logAction('setting', 'set ' + entry.name + ' to ' + shown);
    const r = host.writeSetting(entry.control, plan);
    if (!r.ok) {
      unlogLast(); status(entry.label + ': could not be changed (' + r.reason + '), nothing was written');
      endSetting(); if (inputEl) inputEl.blur(); return false;
    }
    own.lastCmdAt = Date.now();
    endSetting();
    // Native may focus the custom box when "Custom" is picked: take the keyboard back once, and guard the keys.
    labelGuardUntil = Date.now() + LABEL_GUARD_MS;
    setTimeout(refocusBarOnce, 0);
    report(entry, plan, shown, r);
    // Native rewrites these controls from its stored facts now and then: look again a moment later.
    setTimeout(function(){ recheckSetting(entry, plan, shown); }, 400);
    if (inputEl) inputEl.blur();
    return true;
  }
  function readBack(entry) {
    const st = host.readSettings();
    return { selectValue: (st.controls[entry.control] || {}).value, customValue: (st.controls.custom || {}).value, st: st };
  }
  function report(entry, plan, shown, r) {
    const back = readbackVerdict(plan, r);
    status(back.ok ? entry.label + ' set to ' + shown + ' (next pipe)'
      : entry.label + ': asked for ' + shown + ' but ' + back.message + ' (now ' + settingNow(entry, readBack(entry).st) + ')');
  }
  function recheckSetting(entry, plan, shown) {
    const b = readBack(entry);
    const back = readbackVerdict(plan, b);
    if (!back.ok) status(entry.label + ': the app changed it back (now ' + settingNow(entry, b.st) + ')');
  }

  function finishFacts(e) {
    const snap = host.readPanel();
    const fin = host.readFinish(PIPE_FINISH_BUTTON_ID);
    return {
      key: e.key, repeat: !!e.repeat, finishKeys: PIPE_FINISH_KEYS,
      barFocused: document.activeElement === inputEl, barEmpty: !!inputEl && !inputEl.value.trim(),
      panelOpen: snap.open, hint: snap.hint, tool: snap.tool,
      allowedTools: PIPE_FINISH_TOOLS, finishPrefix: PIPE_FINISH_HINT_PREFIX,
      latched: finishLatch.clicked,
      sizesGate: currentSizesGate(snap),
      button: {
        found: fin.found, id: fin.id, expectedId: PIPE_FINISH_BUTTON_ID, visible: fin.visible,
        disabled: fin.disabled, ariaDisabled: fin.ariaDisabled,
        forbidden: fin.found ? targetForbidden(fin, { forbiddenTexts: PIPE_FORBIDDEN_BUTTON_TEXTS, forbiddenContainerIds: PIPE_FORBIDDEN_CONTAINER_IDS }) : false,
      },
    };
  }
  // Enter on an empty bar: click Finish if (and only if) every condition holds, checked twice.
  // Returns true when the key was dealt with (so the generic Enter path is skipped).
  function tryFinish(e) {
    const first = finishVerdict(finishFacts(e));
    if (!first.ok && first.reopen && !sizesUi.active) openSizesChoice();
    if (!first.ok) { if (first.message) status(first.message); return first.reason !== 'not-enter' && first.reason !== 'bar' && first.reason !== 'no-panel' && first.reason !== 'phase'; }
    const second = finishVerdict(finishFacts(e)); // fresh read right before the click
    if (!second.ok) { if (second.message) status(second.message); return true; }
    const label = (host.readPanel().tool || 'fitting');
    logAction('finish', 'clicked Finish (' + label + ')');
    if (!host.clickFinish(PIPE_FINISH_BUTTON_ID)) { status('Finish is not available right now'); unlogLast(); return true; }
    finishLatch = finishLatchClick(Date.now());
    own.lastCmdAt = Date.now();
    status('Finish pressed (' + label + '): placing it now');
    return true;
  }
  const LABEL_GUARD_MS = 700;
  let labelGuardUntil = 0;
  function refocusBarOnce() {
    // Once, never in a loop; only if native really did take focus into its own panel.
    if (!inputEl || document.activeElement === inputEl) return;
    if (host.readPanel().open && (host.focusInPanel() || host.isPortControl(document.activeElement))) inputEl.focus();
    else if (host.isSettingControl(document.activeElement)) inputEl.blur();
  }
  // Called every 250ms: opens the prompt when native reaches the label phase, closes it when it leaves.
  function promptTick() {
    const snap = host.readPanel();
    // Step 3: release the Finish latch when native has been through "saving" and is back, or closed.
    finishLatch = finishLatchStep({
      latch: finishLatch, phase: snap.open ? panelPhase(snap.hint, PIPE_HINT_PREFIXES) : 'closed',
      panelOpen: snap.open, now: Date.now(), expireMs: PIPE_FINISH_LATCH_MS,
    });
    updatePortNote(snap);
    sizeTick(snap);
    if (settingUi.active) {
      const sv = settingVerdict(settingFacts(settingUi.entry));
      if (!sv.ok) { status(sv.message); endSetting(); }
    }
    // Safety net: a hint we don't recognise means native changed this step. One line, nothing else.
    const watch = hintWatch({ open: snap.open, hint: snap.hint, prefixes: PIPE_HINT_PREFIXES, lastWarned: unknownHintWarned });
    unknownHintWarned = watch.hint;
    if (watch.action === 'warn') { status(PIPE_NATIVE_CHANGED_MESSAGE); endPrompt(); return; }
    const phase = snap.open ? panelPhase(snap.hint, PIPE_HINT_PREFIXES) : 'closed';
    if (phase !== 'label') { prompt.dismissed = false; endPrompt(); return; }
    if (prompt.active || prompt.dismissed) return;
    if (host.anyDialogOpen()) return;
    startPrompt();
  }
  function reopenPrompt() { prompt.dismissed = false; startPrompt(); }

  function clearBar() { if (settingUi.active) return; if (inputEl) inputEl.value = ''; hideMenu(); }
  // A command that can't run (unknown, not usable now, refused): say why, empty the bar and keep the keyboard
  // in it, so the next command can be typed straight away.
  function rejectBar(message) {
    if (message) status(message);
    if (!inputEl || settingUi.active) return;
    inputEl.value = '';
    hideMenu();
    inputEl.focus();
  }
  function runAndClear(entry) { if (runEntry(entry)) clearBar(); else rejectBar(); }

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
      setTimeout(function(){ if (document.activeElement !== inputEl) { if (settingUi.active) endSetting('cancelled'); hideMenu(); } }, 150);
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
      if (menuHighlight >= 0 && menuItems[menuHighlight]) {
        const row = menuItems[menuHighlight];
        inputEl.value = row.size ? '' : row.setting ? String(row.setting.index + 1) : row.system ? '#' + row.system.name : row.prompt ? (row.prompt.kind === 'category' ? String(row.prompt.ports) : row.prompt.entry.id) : row.entry.name;
      }
      return;
    }
    if (settingUi.active && (e.key === 'Enter' || e.key === ' ')) {
      // Consumed before anything is written: the same real keypress must not also reach native.
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      enterSetting();
      return;
    }
    if (e.key === 'Escape' && settingUi.active) {
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      endSetting('cancelled');
      if (inputEl) inputEl.blur();
      return;
    }
    if (sizesUi.active && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (sizes.stage === 'choice') { if (menuHighlight >= 0 && menuItems[menuHighlight]) pickSizeChoice(menuItems[menuHighlight].size); }
      else if (sizes.stage === 'edit') enterSizeValue();
      return;
    }
    if (prompt.active) {
      if (e.key === 'Enter' || e.key === ' ') {
        // Consumed before anything is clicked: the same real keypress must not also reach native.
        e.preventDefault(); e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (menuHighlight >= 0 && menuItems[menuHighlight]) pickPrompt(menuItems[menuHighlight].prompt);
        else status('nothing matches');
        return;
      }
      if (e.key === 'Backspace' && !inputEl.value && prompt.category !== null) {
        e.preventDefault();
        prompt.category = null;
        refreshPrompt();
        return;
      }
    }
    // Space confirms exactly like Enter (AutoCAD's convention, same as the duct bar). It is always
    // consumed, so a literal space is never typed: multi-word labels are reached by id or alias.
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const typed = inputEl.value.trim();
      // Enter or Space on an empty bar while a fitting/fixture is ready: Finish. Nowhere else.
      if (!typed && !prompt.active && tryFinish(e)) return;
      if (systemQuery(typed) !== null) {
        if (menuHighlight >= 0 && menuItems[menuHighlight] && menuItems[menuHighlight].system) pickSystem(menuItems[menuHighlight].system);
        else status('system: nothing matches "' + typed.slice(1) + '"');
        return;
      }
      // An exact name/label/alias always wins; otherwise run the highlighted completion.
      const plan = planQuery(currentTable(), typed, stateFor);
      if (typed && plan.action !== 'status') { if (runEntry(plan.entry)) clearBar(); else rejectBar(); return; }
      // An exact name that is not usable right now says why; it never runs some other highlighted row instead.
      if (typed && plan.entry) { rejectBar(plan.message); return; }
      if (menuHighlight >= 0 && menuItems[menuHighlight]) { runAndClear(menuItems[menuHighlight].entry); return; }
      if (typed) rejectBar(plan.message);
      return;
    }
    if (e.key === 'Escape' && sizesUi.active) {
      // Esc steps back: editing -> the two rows; the two rows -> closed (the next Esc reaches native and cancels).
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (sizes.stage === 'edit') { openSizesChoice(); return; }
      sizes.stage = 'dismissed'; sizesUi.active = false; sizesUi.header = ''; hideMenu();
      if (inputEl) inputEl.value = '';
      return;
    }
    if (e.key === 'Escape') {
      // Only swallow Escape while it has something of ours to close; otherwise native's own Escape
      // (cancel the current placement) must still get it.
      if (inputEl.value || (menuEl && menuEl.style.display !== 'none')) {
        e.preventDefault(); e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        // A dismissed prompt stays dismissed until native leaves the label phase (Space brings it back).
        if (prompt.active) { prompt.dismissed = true; endPrompt(); }
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

  // Backstop for the same problem: while the guard is on, Enter / Space / ArrowDown (down, press or up)
  // aimed at native's label button are cancelled before native sees them.
  ['keydown', 'keypress', 'keyup'].forEach(function(type){
    window.addEventListener(type, function(e){
      if (Date.now() > labelGuardUntil) return;
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowDown') return;
      if (!host.isLabelTrigger(e.target) && !host.isPortControl(e.target) && !host.isSettingControl(e.target)) return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
  });

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
      // No tool or action name starts with a digit, so a bare digit on an empty bar belongs to the page,
      // except while the label prompt is open (1-4 pick a port-count category, 45/90 name an elbow).
      digitPassthrough: barEmpty && !prompt.active,
    });
    if (!shouldCapture) return;

    // AutoCAD's Space: nothing typed -> close the armed tool to select, else repeat the last tool,
    // else show what can be armed.
    if (e.key === ' ' && barEmpty && host.readPanel().open) {
      e.preventDefault(); e.stopImmediatePropagation();
      const snap = host.readPanel();
      const phase = panelPhase(snap.hint, PIPE_HINT_PREFIXES);
      if (phase === 'label') reopenPrompt();
      else if (phase === 'unknown' && String(snap.hint || '').trim()) status(PIPE_NATIVE_CHANGED_MESSAGE);
      else if (phase === 'ready' && String(snap.hint || '').trim().startsWith(PIPE_FINISH_HINT_PREFIX)) {
        // The bar is not focused, so this press must not save: focus it. A press in the bar then finishes.
        mountBar(); if (inputEl) inputEl.focus();
        status('bar focused: press Enter or Space again to finish (Esc cancels)');
      }
      else status('a fitting is being placed: Esc cancels it');
      return;
    }
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
    if (e.key === ' ' && !barEmpty) {
      // Typed text waiting but the bar lost focus: Space confirms it like Enter.
      e.preventDefault(); e.stopImmediatePropagation();
      onInputKeydown({ key: 'Enter', preventDefault: function(){}, stopPropagation: function(){} });
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
  setInterval(promptTick, 250);

  RW._pipeTable = currentTable;
  RW._pipeTableInfo = function(){ return derive().info; };
  RW._pipeOwn = own;
  RW._pipeHost = host; // for tests and console diagnosis
  RW._pipePrompt = prompt;
  const first = derive();
  RW._commitStatus && RW._commitStatus('piping command line ready: ' + first.tools.length + ' tools, '
    + PIPE_GRAPH_ACTIONS.length + ' actions (tools read from the ' + first.info.source + ')');
  return 'piping command line installed';
})()
