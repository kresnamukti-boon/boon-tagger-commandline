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

export const PIPE_TRADE = 'piping';
export const DUCT_TRADE = 'ductwork';

// Page elements the loader and host layer look up.
export const PIPE_PAGE_IDS = {
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
export const PIPE_FALLBACK_KEYS = {
  select: 's', route: 'r', extend: 'x', terminate: 'p', transition: 'n', cut: 'u',
  'split-run': 'k', valve: 'v', equipment: 'q', vertical: 'z', service: 'a',
  evidence: 'd', fixture: 'f', terminal: 't', fitting: 'g', occlusion: 'o',
};

// Extra names for each tool id, on top of its id, its on-screen label and its key letter
// (native already matches all three). Curated; an alias that collides with another tool's
// name/key or with an action's name/alias is dropped and reported, never silently kept.
export const PIPE_TOOL_ALIASES = {
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
export const PIPE_GRAPH_ACTIONS = [
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
export const PIPE_FORBIDDEN_BUTTON_IDS = [
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
export const PIPE_FORBIDDEN_CAPTURE_IDS = ['submit-graph'];
// Native's size-mismatch toast (MEC-329) carries a sticky "Resize anyway" button that re-submits a
// rejected command with the check switched off. It has no id, so it is refused by its text and by
// the toast container it lives in: nothing inside that container is ever clicked by us.
export const PIPE_FORBIDDEN_BUTTON_TEXTS = ['resize anyway'];
export const PIPE_FORBIDDEN_CONTAINER_IDS = ['graph-toast-stack'];

// Command names that stay reachable while a placement panel is open. Shipped now as data;
// enforced from the placement step onward (Step 1 has no panel state to isolate).
export const PIPE_ISOLATION_ALLOWED = [
  'select', 'undo', 'redo', 'zoomfit', 'zoomin', 'zoomout', 'adjust',
];

// ---- Placement panel (Step 2: choose the fitting label) ----
// Native's own ids, classes and hint wording for the "Place Fitting" panel. Used for both the
// fitting and the fixture tool (native shows one panel for every bounding-box tool). Checked by
// test/native-ids.test.mjs against saved copies of native's files.
export const PIPE_PANEL_IDS = {
  panel: 'graph-pipe-bbox-op-panel',
  menu: 'graph-pipe-fitting-select-menu',
  groupLabelClass: 'graph-pipe-fitting-select-group-label',
  optionSelector: 'button[data-family-id]',
  warningClass: 'graph-pipe-bbox-unresolved-entry-warning',
  triggerClass: 'graph-pipe-fitting-select-trigger',
};

// How native's hint line starts in each phase. Matched with "starts with" (native appends extra
// sentences to some of them), never equality.
export const PIPE_HINT_PREFIXES = {
  box: 'Click two opposite corners',
  label: 'Choose the fitting subtype.',
  ports: 'Click the detected intersection for',
  // The transition tool words its ready hint differently depending on the sizes (three more openings).
  ready: ['Finish inserts this fitting.', 'Pick a different diameter', 'Enter the new diameter above, then Finish.', 'From '],
  submitting: 'Saving pipe and fitting',
};
// Native's own words after the auto-matched run diameter, e.g. `Diameter 2" auto-matched from the crossed run.`
export const PIPE_AUTOMATCH_PATTERN = /Diameter (\S+?)" auto-matched/;
export const PIPE_UNAVAILABLE_MARK = 'unavailable';

// Step 3. The ONE control the bar may click as a placement step: native's Finish, reached only from
// Enter in the bar (never from a typed word; it stays in PIPE_FORBIDDEN_BUTTON_IDS for every other path).
// The bar's in-memory action log keeps only this many of the newest entries (nothing is stored or sent).
export const PIPE_LOG_MAX = 50;
// How long after an action the log re-reads the revision to fill in "after".
export const PIPE_LOG_AFTER_MS = 2000;
// Step 3b: native's per-port size fields (reducing fittings) and the page's own catalog JSON.
export const PIPE_SIZE_IDS = {
  container: 'graph-pipe-port-diameters',
  capturePrefix: 'pipe-diameter-',
  customSuffix: '-custom',
  bootstrap: 'graph-session-bootstrap',
};
// Only this tool places fittings that have per-port sizes (reducing tees/wyes, reducers, ...).
export const PIPE_SIZE_TOOLS = ['fitting'];
// Step 3c: native's "Adjust ports" checkbox (no id: a checkbox inside a label of the placement panel).
export const PIPE_ADJUST = { labelText: 'Adjust ports' };
// The typed command for it. Not a button entry: it is handled by the shell, listed only when usable.
export const PIPE_ADJUST_ENTRY = {
  id: 'adjust', name: 'adjust', label: 'Adjust ports', aliases: ['ports', 'adj'], kind: 'adjust',
};
export const PIPE_FINISH_BUTTON_ID = 'graph-finish-route';
// Strictly this opening, not the looser 'ready' variants the transition tool uses.
export const PIPE_FINISH_HINT_PREFIX = 'Finish inserts this fitting.';
// Only these tools may be finished from the bar (valves, equipment, cut, transition stay manual).
export const PIPE_FINISH_TOOLS = ['fitting', 'fixture'];
// How long a Finish click holds the latch if native never shows "Saving..." (e.g. the click was ignored).
export const PIPE_FINISH_LATCH_MS = 1500;
// "Click the detected intersection for <role>." -> role
export const PIPE_PORT_ROLE_PATTERN = /Click the detected intersection for ([A-Za-z0-9_-]+)/;

// The one line shown when native's panel or page no longer looks like what we were built against.
export const PIPE_NATIVE_CHANGED_MESSAGE = 'Native changed: use the mouse for this step';

// Element ids that must exist on the page for the command line to run at all. If one is missing at
// load, native has changed and the bar installs nothing. Every id here is also in
// test/native-ids.json (checked by test/native-ids.test.mjs). The protective (forbidden) ids are
// deliberately not required: a missing Save button can't make us click it.
export const PIPE_REQUIRED_IDS = [
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
export const PIPE_FITTING_ALIASES = {
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
export const PIPE_FIXTURE_ID_PREFIXES = ['pipe-fixture-', 'fixture-', 'pipe-'];
// Readable names shown in the bar for the fixture menu (display only: matching still uses native's
// own label, the id and the aliases). Keyed by the short id (the id without its prefix). A fixture
// not listed here is shown with native's own text.
export const PIPE_FIXTURE_DISPLAY_NAMES = {
  wc: 'Water Closet', lav: 'Lavatory', sh: 'Shower', ur: 'Urinal', ks: 'Kitchen Sink',
  ms: 'Mop Sink', hb: 'Hose Bibb', fd: 'Floor Drain', rd: 'Roof Drain',
};
export const PIPE_FIXTURE_TOOL = 'fixture';
export const PIPE_FITTING_TOOL = 'fitting';
