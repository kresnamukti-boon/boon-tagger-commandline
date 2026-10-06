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

// Command names that stay reachable while a placement panel is open. Shipped now as data;
// enforced from the placement step onward (Step 1 has no panel state to isolate).
export const PIPE_ISOLATION_ALLOWED = [
  'select', 'undo', 'redo', 'zoomfit', 'zoomin', 'zoomout',
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
  ready: 'Finish inserts this fitting.',
  submitting: 'Saving pipe and fitting',
};
// Native's own words after the auto-matched run diameter, e.g. `Diameter 2" auto-matched from the crossed run.`
export const PIPE_AUTOMATCH_PATTERN = /Diameter (\S+?)" auto-matched/;
export const PIPE_UNAVAILABLE_MARK = 'unavailable';

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
export const PIPE_FIXTURE_TOOL = 'fixture';
export const PIPE_FITTING_TOOL = 'fitting';
