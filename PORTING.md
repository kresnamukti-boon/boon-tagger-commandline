# Porting guide

## Start here: piping

For whoever ports the **piping** command line into native. (The duct "Start here" further down is separate.) Built by
Kresna (piping annotator) with an AI assistant; checked against native `bb2935ac` and live deploy `6aadf9a4`. Port from
`master` of `https://github.com/kresnamukti-boon/boon-tagger-commandline`. What is not proven on the real page is in one
place: **[Not verified live](#not-verified-live-piping)**. Details per step are under "Piping command line" below.

**Port, in this order**
1. `src/pipe/pipe-tables.js`: data only (actions, forbidden ids, aliases, isolation list, panel ids). Goes next to
   `buildPipeCommandTable` in `pipe-command-line.js`, shaped like `duct-command-line.js`'s `DUCT_*` exports.
2. `src/core/pipe-table-core.js`: `entryState`/`planEntry`/`planQuery`/`listEntries`, the "may this entry run now" verdicts
   (extends `command-line-core.js`). `deriveTools`, `reconcileArmed`, `loaderGuard` stay out.
3. `src/core/pipe-placement-core.js`: label menu rows, categories, aliases (`labelStep`, `planPick`), `isolationVerdict`,
   `finishVerdict` + latch, `adjustVerdict`, `portLine`. Extends the Place Fitting panel in `pipe-session-ui.js`.
   `panelPhase`/`hintWatch`/`autoMatchedDiameter`/`portRoleFromHint` read hint text: do not port.
4. `src/core/pipe-size-core.js`: size parsing (a copy of native's `parsePipeDiameter`, so reuse native's), max-size rule,
   sizes choice/edit steps, `sizesFinishGate`, `escStepPlan`. Extends the per-port size fields in `pipe-session-ui.js`.
5. `src/core/pipe-setting-core.js`: `diameter`/`dsource`/`material`/`msource` verdicts (the Pipe properties block).
6. `src/core/pipe-system-core.js`: `#` system search (`#graph-system-select`).
7. `src/core/pipe-log-core.js`: the in-memory action log. Optional.
Tests ride along: `test/pipe-*.test.mjs` (`test/purity.test.mjs` is the readiness gate).

**Do not port**: `console_loader_pipe.js`, `dist/rw_pipe_cmdline.js`, the build scripts, `src/pipe/pipe-host.js` and
`src/pipe/pipe-shell.js` (outside-script wiring), anything that reads hint text or the rail's key badges (native has
`bboxController().state.phase` and `PIPE_TOOL_KEYS`), and the key/focus guards (the 700 ms label guard, `refocusBarOnce`,
the focus rules: native does not need them).

**Safety rules that must survive the port**
- Never change a selected item. Settings (`diameter`, `dsource`, `material`, `msource`), `#` system search and port-size
  writes happen only with nothing selected (`__graphDebug.selectedEntityId`, fail closed) and are re-checked inside the writer.
  Native's handlers on those controls send SAVED commands for a selected pipe.
- Finish only at the ready phase of a box tool, once per press, never with typed text; the rest of `PIPE_FORBIDDEN_BUTTON_IDS`
  stays refused in code, not just left out of a list.
- Never click Save, Submit for review, system create/rename/import/assign, or the size-mismatch toast's "Resize anyway".
- Esc steps back (size rows, then the label list) before native's Esc cancels; it never saves.

How to move this project's own features into the host app's own native command line
(`project_graph/js/command-line-core.js` + `command-line-ui.js` + `duct-command-line.js`/
`pipe-command-line.js`, confirmed live via opencli — see `CLAUDE.md`'s "The native command line
(graph host)"). Read that section first for what native already has and doesn't.

## Start here (for whoever is doing the native port)

- **Source of truth**: this project lives at
  `https://github.com/kresnamukti-boon/boon-tagger-commandline`, a public repo. Port from
  `master`, not a feature branch — every portable module described below is only guaranteed
  to be there. (If a ticket cites `tagger-scripts/boon-tagger-commandline` as the path, that's
  wrong — it resolves for nobody. This is the real location.)
- **Start with #1 below** (swap `src/core/command-line-core.js` in for native's own file) — it's
  close to a literal file replacement, needs no `command-line-ui.js` changes, and is a bug fix
  from native's own point of view on two counts: null-tolerant `label`/`aliases` (native's own
  `entry.label.toLowerCase()` throws on a labelless entry), and `digitPassthrough` as an ordinary
  parameter in place of native's own `document.getElementById("graph-click-menu")` DOM probe
  inside `dialogOpen`.
  **Save #3** (the value-prompt / multi-step input) for last — it needs a genuinely new UI mode
  in native (`command-line-ui.js` has no concept of a multi-step prompt today), and #5 (the modal
  walk) depends on it, so there's nothing to port there until #3 exists.
- **Readiness gate**: a module under `src/core/` or `src/features/` is ready to port once it
  passes `test/purity.test.mjs` (no DOM/host globals, no ambient time/randomness, no import from
  `src/hosts`/`src/console`/`src/ui`) and follows the superset rule below. That's a mechanical
  yes/no — it doesn't require asking anyone.
- **Two things the code alone won't tell you, both deliberate, both worth knowing before opening
  a PR that touches the modal walk** (§5 has the full detail): change size, GRD, and riser skip
  the walk's value memory entirely and auto-submit their last field; branch fitting still ends on
  a manual Choose/Cancel prompt. These read as an inconsistency across the four modals unless you
  know they were each asked for individually.
- Separately, and unrelated to this port: the **legacy** `annotation_jobs` bundle (a different
  target, the older non-native command line) is pinned by SHA-256 (`3c0581e7…`) in
  `annotation_jobs/tests/test_command_line_toggle.py`. Refreshing that vendored copy is a
  decision for whoever owns that test, not part of this port.
- Port only `src/core/`/`src/features/` modules and their tests (`test/*.test.mjs`). Never
  `console_loader.js` or `dist/rw_cmdline.js` — those are the console-injection build artifacts,
  not upstream material.

## Why this exists

The graph ("Duct Takeoff") host now ships its own typed command line, built the same
way this project always wished it could be built: a pure, DOM-free core
(`command-line-core.js`) plus a thin DOM-wiring layer (`command-line-ui.js`) that takes
every host-specific fact as an injected dependency. It covers a small slice of what
this project's own `rw_cmdline.js` does — tool matching (by name, alias, *and* label,
which this project's own matching didn't do until this restructure), Tab-cycling,
Space repeat/close, Escape — and nothing else: no actions, no settings drill-down, no
isolation, no modals, no `#` search.

This repo is being restructured (see `CLAUDE.md`'s "Build / verify commands" and the
`src/` layout it describes) so each of those missing features can go upstream as its
own small PR, each shaped the way native's own module already is: a pure decision
function plus a thin DOM-wiring caller. `src/core/*.js` is the part of that work
that's already done and already a superset of native's own module — every function
below either already matches native's shape exactly, or is a clean addition next to
it.

## The superset rule

Every module under `src/core/` and `src/features/` is written so a native port can be
a drop-in file replacement, never a merge. This isn't incidental — it's a rule to keep
following as this restructure continues:

- Every extra thing this project's own version of a function does beyond native's is
  an **optional parameter with a default that reproduces native's own current
  behavior exactly**. `command-line-core.js`'s own header lists its example set
  (`synthetic`, `digitPassthrough`, `modeActive`/`forceSelectModes`, `modalOpen`,
  `openMenuWhenIdle`, null-tolerant `label`/`aliases`); `isolationEscapes` follows the
  same shape (`isNativeTool`/`allowedNames` both required, but native's own callers
  supply them fresh rather than getting a silent default, since isolation doesn't
  exist there at all yet).
- **Never change a default, and never widen a return type without a flag guarding
  it.** `spaceRepeatAction`'s two extra actions (`open-modal-menu`, `open-tool-menu`)
  are unreachable unless `modalOpen`/`openMenuWhenIdle` is explicitly passed — a
  caller that doesn't know about them (native's own `command-line-ui.js`, today) can
  never receive one.
- This is what makes item #1 near-free (a file replacement, no caller changes) and
  is the standard every new `src/core`/`src/features` module should be held to before
  it's considered "ready to port," not just the ones already confirmed against
  native's own source.
- A companion test, `test/purity.test.mjs`, enforces the other half of this same
  property mechanically: every module under `src/core/` and `src/features/` is
  checked to contain no direct `document`/`window`/`RW.`/`localStorage` reference and
  no import from `src/hosts`, `src/console`, or `src/ui` — the DOM/host-wiring layers
  a portable module must never reach into directly. A module that fails either check
  needs every such fact passed in as an argument before it can be considered for this
  list at all.

## What to port, in order, and from where

### 1. The core superset (`src/core/command-line-core.js`)

Already a byte-for-byte match of native's own five functions
(`matchCommands`/`resolveCommand`/`commandDispatch`/`commandBarShouldCapture`/
`spaceRepeatAction`) **when every one of this project's own extra fields is left out**
— see that file's own header for the exact list (`synthetic`, `digitPassthrough`,
`modeActive`/`forceSelectModes`, `modalOpen`, `openMenuWhenIdle`, and null-tolerance on
`label`/`aliases`). This means the PR is close to a literal file replacement:

- Copy `src/core/command-line-core.js` over native's own file.
- Native's own callers (`command-line-ui.js`) don't pass the extra optional fields, so
  they get the defaults, which reproduce native's own current behavior exactly — this
  needs no changes to `command-line-ui.js` at all.
- The null-tolerance on `label`/`aliases` is a pure bug-fix from native's own
  perspective too: today, a table entry native builds without a `label` (there isn't
  one — `duct-command-line.js`/`pipe-command-line.js` always set it) would never hit
  this, but it protects against a future table that omits it.

### 2. Actions (`src/features/actions.js`)

Native has no button-backed action vocabulary at all today — every entry in its own
`buildDuctCommandTable`/`buildPipeCommandTable` is a tool. This is a genuinely new
capability, not a refinement:

- `isActionUsable(entry, {getButtonById, forbiddenIds, isVisible})` needs, from
  native's own code: a table of `{name, label, aliases, btn}` entries (this project's
  own `GRAPH_ACTIONS`, in `src/console/shell.js`, is the reference list — undo, redo,
  zoomfit/in/out, ruler, finish/cancel route, calibrate/setscale/resetscale,
  evidence/note/rationale, region, the eight modal Choose/Cancel actions, annotations),
  and `FORBIDDEN_BUTTON_IDS` (save/recording controls — see `CLAUDE.md`'s
  "Constraints": the "System / network"/"New system" actions are deliberately never
  given entries either, and shouldn't be added without re-confirming scope).
- `command-line-ui.js`'s own `toolDisabled(toolId)` already does the exact same
  button-lookup-and-check work for tools (reading `elements.toolList.querySelector(...)`)
  — `isActionUsable` is the same idea generalized to the action table's own button ids,
  not scoped to `elements.toolList`.
- Wire it into `renderMenu()`'s own per-row `is-disabled` class and into
  `commandDispatch`'s `toolDisabled` callback so a table entry with a `.btn` is
  checked the same way a tool is.

### 3. Settings drill-down + the value-prompt API

Not yet extracted into its own module (still inline in `shell.js`, `RW._cmdToolSettingsList`/
`RW._cmdApplySetting` and the DOM sweep behind them) — the pure pieces already are
(`src/core/settings-core.js`: `labelWords`, `paramMatchesQuery`, `parseBoolish`,
`matchOption`, `parseAndClampNumber`). To port:

- The sweep root is `document.querySelector('.graph-inspector')` (native's own
  `elements` object almost certainly already has a reference to this container) plus,
  when one of the four config-dialog modals is open, that dialog element instead (see
  #5 below).
- Native's own `command-line-ui.js` has no concept of a multi-step prompt at all
  (Enter always either runs a tool or does nothing) — this needs a small new UI
  addition: an input mode where the next Enter submits a value into a specific control
  instead of running a command, chaining into a next field if there is one. This
  project's own `dimension`/modal-walk machinery (`src/console/shell.js`,
  `cmdDimensionPrompt`/`cmdWalkOpenPrompt`) is the reference implementation, but the
  bar/focus plumbing itself is NOT extracted into a standalone module yet (see "Not
  done in this pass" below) — read it directly for that part's shape. The pure
  decisions the walk half of this makes ARE extracted, into
  `src/core/modal-walk-core.js` — see #5 below.
- **Whatever UI addition is written natively must re-derive the field list on every
  step, never index into a list snapshotted at prompt-start.** `walkNextItem` in
  `src/core/modal-walk-core.js` takes the CURRENT field list as an argument on every
  call, specifically because a field can appear or disappear mid-walk (change size's
  own secondary size field, hidden for a round shape; riser's own Shape field, hidden
  for a plain elbow) — an `{phase, fields, index}`-style reducer that snapshots
  `fields` once would desync the moment visibility changes.

### 4. Isolation (`src/core/isolation-core.js`)

- `isolationEscapes(entry, modalOpen, {isNativeTool, allowedNames})` plugs directly
  into native's own `commandDispatch`'s `blocker(id)` hook: return a refusal message
  from `blocker` when `isolationEscapes` says no.
- `isNativeTool` on native's own side is simplest as "this entry came from
  `buildDuctCommandTable`/`buildPipeCommandTable`," i.e. every entry in the table
  `initializeCommandLineUI` was given, vs. a new action-table entry from #2 above.
- `allowedNames` is this project's own `GRAPH_ISOLATION_ALLOWED` (`select`, `finish`,
  `cancel`, the eight modal action names, `dimension`).
- The "which tool to isolate to" decision itself
  (`RW._cmdIsolatedTool`/`RW._cmdActiveSettingsTool`) isn't pure (it reads live app
  state) and isn't extracted yet — natively this is far simpler, since
  `store.state.activeTool` is already a plain, directly-readable value; there's no
  annotate-host-style ambiguity to resolve.

### 5. Modals, walk, and its value memory

The DOM-touching half (`GRAPH_TOOL_MODALS`, `cmdOpenToolModal`, `cmdArmOrNoteModal`,
`RW._cmdModalWalk*`) is still all in `src/console/shell.js`, not yet extracted. The
pure decisions those functions make ARE extracted, into `src/core/modal-walk-core.js`:
`walkNextItem` (the next unvisited field, re-derived fresh every hop — see #3 above),
`walkAdvanceState` (the `{seen, applied, skipped}` bookkeeping after one field),
`walkFinishVerdict` (auto-submit vs. the manual Choose/Cancel prompt),
`canRecordWalkMemory`/`hasWalkMemory` (the skip-list guard, checked in code on both
the write and the read side, same "enforce a hard boundary in code" doctrine
`FORBIDDEN_BUTTON_IDS` follows), and `selectWalkPrefill` (which option row to
highlight and what to prefill, preferring a still-valid remembered value over
today's actual current value over row 0). Every one of these is unit-tested in
`test/core.test.mjs`. To port:

- The four `elements.*Modal` references native's own `graph-session-entry.js` already
  holds (`branchFittingModal`, `checkpointTransitionModal`, `checkpointGrdModal`,
  `checkpointRiserModal` — see `openCheckpointDialog()`) are exactly
  `GRAPH_TOOL_MODALS`'s own four dialog ids.
- Natively, replace the 250ms poll this project uses to detect a modal opening
  (`RW._cmdModalWalkTick`) with a real hook: native's own `openCheckpointDialog()` is
  already called from `attemptActivateTool` and elsewhere, so a modal's own
  `dialog.addEventListener('close', ...)`/a wrapper around whatever opens it can fire
  this synchronously instead of polling.
- The modal walk and its own value memory (`RW._cmdModalWalkValueMemory`, which now covers
  branch only) are unaffected by this port.
- Change size, GRD, and riser are all deliberately excluded from the value memory
  (`MODAL_WALK_MEMORY_SKIP_TOOLS` in `shell.js`) — Kresna's own request, no offer or
  recording for any of the three. Port the walk for them, not the memory.
- Change size, GRD, and riser auto-click their own submit button the instant the walk's
  last field is confirmed (`MODAL_WALK_AUTO_SUBMIT_TOOLS` in `shell.js`) — also Kresna's
  own request, overriding this project's usual "never auto-submit a graph-host action
  button" caution for these three only. Branch fitting still ends on a manual
  Choose/Cancel prompt. A native port should keep this distinction rather than
  generalizing one behavior to all four dialogs.

### 6. `#` system search

Not yet extracted. `elements.systemSelect` (native's own reference to
`#graph-system-select`) is the same element this project's own `#` search already
reads/writes via `.value` + `input`/`change` events — no `annotationState`-style direct
assignment risk on this host (see `src/core/search-core.js`'s `matchTags` for the pure
ranking half, already portable as-is).

## Not upstreamed at all

- **Auto-select** (`src/core/autoselect-core.js` plus the poll around it in
  `shell.js`): native's own `store` is subscribable, so a real subscription on
  `activeTool` clearing itself replaces the entire poll/circuit-breaker/suppression-
  window apparatus this project needed only because it has no such hook. Don't port
  the poll; do read `breakerStep`/`goSelectDecision`/`watchEdge`/`watchShouldFire` if a
  future native feature turns out to need the same "should this fire" shape.
- **Middle-drag pan, the RW: ON/OFF killswitch, the draggable floating panel, and every
  `_*Diagnose()` console probe**: native already has its own middle-click pan, its own
  on/off toggle (`#graph-command-line-toggle`), and its own draggable window
  (`floating-window-drag.js`) — these exist here only because the console-injection
  delivery mechanism has none of them built in.

## What's deliberately NOT restructured yet (and why)

Two things the original restructure plan called for are intentionally left undone,
both flagged here rather than attempted blind:

- **Consolidating the command bar's own shared closure state
  (`barEl`/`inputEl`/`menuEl`/`menuItems`/`menuHighlight`/`menuMode`/`settingsDraft`/
  `modalWalk`) into one controller object**, and physically moving it plus the
  dimension/walk prompt machinery into `src/ui/command-bar.js`. This is a mechanical
  rename across several hundred call sites in the single most intricate, state-
  machine-heavy part of this codebase (arming/disarming, the dimension chain, modal
  memory, the modal walk) — and it buys nothing toward upstreaming, since native's own
  UI layer is entirely separate from this project's bar. The existing CLAUDE.md already
  flags a closely related piece of this exact machinery as needing "a real human
  live-test, not just automation" (the branch-fitting modal walk's auto-focus). Doing a
  large mechanical relocation of code this sensitive with no way to click through the
  real UI first is the kind of speculative change this project's own "Design doctrines"
  section warns against.
- **Splitting `RW.runCommand`/`RW._cmdApplySetting`** into a pure verdict plus a
  thin executor, for the same reason — both are tightly coupled to the same bar state
  above.

If a future session picks this up with live opencli access to iterate against a real
page, both are still worth doing — for this project's own maintainability, not because
either blocks any of the ports listed above.

## Piping command line (separate build)

A second command line for the **piping** trade pack, built next to the duct one and sharing none
of its state. Native's own piping command line (`pipe-command-line.js` + `command-line-ui.js`) only
switches tools; it has no actions, no settings, no walk and no `#` search, and the fitting-placement
panel (`#graph-pipe-bbox-op-panel`) is not connected to it at all. Everything below was checked
against constructions-tagger `bb2935ac` and the live page (2026-10-06), then re-checked against the live deploy
`6aadf9a4` (see "Fixture refetch" below); `test/native-ids.json` lists
every id/class/string we rely on and `test/native-ids.test.mjs` checks them.

### Which file maps to which native slot

| Ours | Native slot | Port? |
|---|---|---|
| `src/pipe/pipe-tables.js` (`PIPE_GRAPH_ACTIONS`, `PIPE_FORBIDDEN_BUTTON_IDS`, `PIPE_ISOLATION_ALLOWED`, `PIPE_TOOL_ALIASES`) | next to `buildPipeCommandTable` in `pipe-command-line.js`, shaped like `duct-command-line.js`'s `DUCT_*` exports | yes: pure data, same entry shape `{ id, name, label, aliases, btn }` |
| `src/core/pipe-table-core.js`: `entryState`, `planEntry`, `planQuery`, `listEntries` | the dispatch verdict half of `command-line-core.js` / `command-line-ui.js` | yes, as a superset (disabled-with-reason rows, forbidden controls refused twice) |
| `src/core/pipe-table-core.js`: `deriveTools`, `reconcileArmed`, `loaderGuard` | none | **no.** `deriveTools` reads the live rail only because a pasted script can't see native's contract (native already has `visiblePipeTools(contract, mode)`); `reconcileArmed` and `loaderGuard` exist because we are an outside script |
| `src/core/pipe-placement-core.js` (Step 2): `labelStep`, `menuEntries`, `aliasesFor`, `planPick`, `isolationVerdict` | the Place Fitting panel's label menu in `pipe-session-ui.js` | `labelStep`/`planPick`/`isolationVerdict`: yes, pure. `panelPhase`/`autoMatchedDiameter`: **no**, native reads `bboxController().state.phase` directly instead of its own hint text |
| `src/pipe/pipe-tables.js` (`PIPE_FITTING_ALIASES`, `PIPE_HINT_PREFIXES`, ...) | beside the family catalog (server contract) | aliases yes; hint prefixes no (we only need them because we are outside) |
| `src/pipe/pipe-host.js` | none | **no.** Native has its own DOM wiring (`command-line-ui.js`) |
| `src/pipe/pipe-shell.js` | none | **no** |

Port-size logic (Step 3b) lives in `src/core/pipe-size-core.js`, the setting commands (Step 5) in `src/core/pipe-setting-core.js`, `#` search in `src/core/pipe-system-core.js` and the action log in `src/core/pipe-log-core.js`: all pure and portable (see "Start here: piping" at the top).

### What must not be ported

- `console_loader_pipe.js`, `dist/rw_pipe_cmdline.js`, `build_pipe_loader.sh`, `scripts/build-pipe-*.js`:
  console-injection artifacts, like the duct ones.
- Anything that reads the panel's **text** (the hint line: "Click two opposite corners...", "Choose
  the fitting subtype.", "Click the detected intersection for <role>.", "Finish inserts this
  fitting."). We only do that because we are outside the app; native owns the phase
  (`bboxController().state.phase`) and an upstream version must read it directly, never the text.
- Reading the key badge off the rendered rail button: native has `PIPE_TOOL_KEYS`.
- The loader guard and the "native's bar must be OFF" rule: inside native they don't exist.

### Step 2 notes (label pick)

- Native shows ONE panel ("Place Fitting") for every bounding-box tool (fitting, fixture, valve,
  equipment, terminal, transition, cut). Our prompt opens by itself when native's hint says "Choose
  the fitting subtype." (phase `label`) and picks by clicking native's own `button[data-family-id]`.
  It never clicks Finish.
- Aliases are matched only against the menu that is open right now. Fitting menu: the curated
  `PIPE_FITTING_ALIASES` (keyed by native family id). Fixture menu: the family id with `pipe-` /
  `fixture-` removed (the user's `wc, lav, sh, ur, ks, ms, rd, fd, hb`); which fixtures exist is
  never hardcoded. The real fixture family ids were verified live on 2026-10-06 (all 9 `pipe-*` ids matched).
- Dropped on purpose: `ft/tt/st/td` (use `trapft`, `traptt`, `trapst`, `traptd`), `rtee`, `rwye`.
- While a placement panel is open, `PIPE_ISOLATION_ALLOWED` is now enforced in code (`runEntry`).
- **Focus after a pick (found live by the user, real keyboard):** native's menu-option click handler calls `subtype.focus()`, and the trigger's keydown opens the menu on Enter / Space / ArrowDown, so the same physical keypress could open native's menu and steal focus. Fixed on our side: the consumed key is cancelled and stopped before the click; for 700 ms a window-capture guard cancels Enter/Space/ArrowDown (keydown, keypress, keyup) aimed at the trigger; and focus returns to our bar once on the next tick. **Handover:** the 700 ms keypress guard on native's label trigger is a workaround for the injected bar only. In native, skip `subtype.focus()` after `chooseFamily` when the pick came from the command line, and drop the guard (and our refocus) entirely.
- **Space = Enter** in the bar (and in the label prompt), like the duct bar. A literal space can no longer be typed, so multi-word labels are reached by id or alias.
- **System/network:** the `service` ("Assign system") tool is a normal tool in the list (alias `assign`); arming it saves nothing. The system create/rename/import/assign **buttons** stay forbidden. `#<name>` system search is built (`src/core/pipe-system-core.js`): it writes `#graph-system-select` (value + input/change). Native's change handler REASSIGNS the selected pipe when one is selected (`assignPipeService`, a real command), so the write is refused unless `__graphDebug.selectedEntityId` is readable and empty. **Handover:** `#` writes `#graph-system-select`. With a pipe selected, native's change handler calls `assignPipeService` (a saved command), so the bar refuses (`systemPickVerdict`). Native's port should keep that rule: only write the dropdown when nothing is selected; the rest of that function is only needed because we are outside.
- Valves and equipment have no curated aliases (their menus match by id and label).

### Step 3 (placing)

- `finishVerdict` / `finishLatchStep` / `portRoleFromHint` / `targetForbidden` in `src/core/pipe-placement-core.js`;
  `PIPE_FINISH_*`, `PIPE_FORBIDDEN_BUTTON_TEXTS` (`resize anyway`) and `PIPE_FORBIDDEN_CONTAINER_IDS`
  (`graph-toast-stack`) in `src/pipe/pipe-tables.js`.
- Enter or Space (`PIPE_FINISH_KEYS`; Space was added at the user's request, the same rules as Enter) in the bar clicks
  `#graph-finish-route` only for `fitting`/`fixture` (since the "All box tools" step: also `valve`/`equipment`) in the ready phase (hint starts with
  "Finish inserts this fitting."), never on repeat, never with text typed, never when the bar lacks focus (Space elsewhere
  just focuses the bar). Finish stays in
  `PIPE_FORBIDDEN_BUTTON_IDS` for every other path; the one deliberate click goes through `host.clickFinish`,
  which re-checks the button right before clicking. Native disables Finish for an incomplete port form, a
  missing transition size, or a phase other than ready; we only obey that.
- Latch: set on our click; released when the phase has left ready (saving) and returns (native restores
  `phase: 'ready'` after a non-synced save), when the panel closes, or after `PIPE_FINISH_LATCH_MS` if native never
  showed "Saving pipe and fitting…". Native's own Enter runs only when `document.activeElement === #pointer-layer`;
  ours only when the bar has focus, so they cannot both fire.
- Port prompt is display only; the hint is `missingPorts()[0]`, so no "n of N" (detected ports are skipped).
- Upstream: none of the key/focus plumbing is needed. Native already has `pipeBboxController.finish()` and its own
  Enter handling; the command line only needs to call it (with the same enabled checks) when the pick came from the bar.
- Never clicked: the MEC-329 size-mismatch toast's "Resize anyway" (re-submits a rejected command with the check off).

### Fixture refetch (2026-10-06, live deploy 6aadf9a4; earlier files were deploy 76785ba3 / commit bb2935ac)

`test/fixtures/native/` (gitignored) was refetched from the live site, `native-ids.json` updated (`source`, new `deploymentVersion`,
`pipe-bbox-connect.js` hash f80bc890..). Only `pipe-bbox-connect.js` changed (54 lines added, 5 removed): a new `placeAtRouteEnd`
(MEC-407, the per-point menu of a 2D route) and a reworked connector lookup in `finish()` for 2D routes (picks the route's
unresolved `end`). Nothing we use moved: every recorded id, string, hint, tool key and the 88 catalog families are the same
(the drift script and the previously skipped fixture tests all pass with the fixtures present). `graph-session-entry` is now
`graph-session-entry.34d090dba1f3.js`.

### Live verification status (test page, 2026-10-06)

Verified by hand on a real piping page (offline harness passes for all of it; live is the only proof against the real page):
- Tools/actions, label pick (`tee` + Enter / Space), `#` system search, fixture display names, port line (`click: <role>`).
- Enter and Space as Finish: one placement = exactly one `/commands/` request each (fixture and fitting); undo through the bar.
- Port sizes (3b): edit prompts, the max-size warning ("outlet 3" is larger than inlet 2"").
- Adjust ports (3c) on a reducing tee: `adjust` ticked the box, `click: inlet (1 of 3)` stepped through the roles as the
  intersections were clicked with the mouse, and the size rows reopened; Esc before Finish left the revision unchanged.

Everything not in the list above is in **[Not verified live](#not-verified-live-piping)**.

### Step 3c (Adjust ports)

- `adjustVerdict`, `portProgress`, `portLine`, `roleDisplayName` in `src/core/pipe-placement-core.js`; `PIPE_ADJUST` and
  `PIPE_ADJUST_ENTRY` (a typed entry with no button; listed only while usable) in `src/pipe/pipe-tables.js`; host
  `readAdjustPorts` / `clickAdjustPorts` (finds the checkbox by its label text " Adjust ports": it has no id) and
  `readFamilyRules` now also returns `portContract`; `sizeChoiceRows` adds the third row.
- Native: the box is hidden unless `operation.detectedPorts?.length && operation.familyId`; its `change` calls
  `toggleAdjustPorts` (placement state, no command). Ticking resets `ports` and starts the ports phase, asking every role
  in catalog order (so "n of N" is exact only then; without Adjust native skips detected ports and a count would be a guess).
  Roles: 1 port [inlet]; 2 [inlet, outlet]; 3 [inlet, outlet, branch]; cross [inlet, outlet, branch_a, branch_b].
- The sizes step forgets its confirmation whenever the phase leaves ready (assigning ports reseeds sizes), whether the box
  was ticked from the bar or the mouse. Upstream: native already owns the controller; none of the key/focus plumbing is
  needed. Keyboard-only picking of the intersections themselves (numbered markers) is Step 3d, deliberately not built.

### Step 3b (port sizes)

- `src/core/pipe-size-core.js`: `parseSizeInput`/`formatSize` (copies of native's `parsePipeDiameter`/`formatPipeDiameter`,
  checked against native's file by `test/pipe-size-core.test.mjs` when the fixture is present), `planSizeWrite`,
  `roleSizes`, `maxViolations`, `sizeWriteVerdict`, the choice/edit state helpers, `sizesFinishGate`. Host: `readPortFields`,
  `readFamilyRules` (from `#graph-session-bootstrap` JSON), `writePortSize` (the only writer; re-checks its own guard).
- **Hazard (user-found):** native's per-port fields also edit an EXISTING selected fitting: there a select change calls
  `updatePortResizeFacts` (a saved command) and the custom box saves on blur/Enter. During a placement
  (`usePerPortPlacement`) a change only toggles the custom box (and focuses it); values are read at Finish via
  `placementPortDiameters()`. So sizes are written only with a new placement open at ready and nothing selected
  (`__graphDebug.selectedEntityId`, fail closed), checked in the shell and again inside `host.writePortSize`.
- Choosing "Custom" makes native call `custom.focus()`: the bar takes focus back once and the same 700 ms key guard covers the
  size controls. Native reseeds only when its seedKey changes (family, box, detected ports, assigned ports); the Finish-time
  recheck is a backstop. Decisions: "as is" confirms and a second Enter finishes (the user's bracket left this open; the
  safer reading was taken, one line to change); a max violation blocks OUR Enter-to-Finish (the server stays the real check);
  an unreadable catalog warns and does not block. Upstream: none of the key/focus plumbing; native can read its own sizes
  and rules directly, and should keep the "never touch an existing selected fitting" rule if a command line can set sizes.

### Esc steps back, then to the label list (Step 3b/3c)

- Before: native's window-level Esc (`pipeEscapeVerdict` -> `cancelActiveRoute`) cancelled the whole placement and switched
  the tool to route. Now `escStepPlan` (pure, `pipe-size-core.js`) gives steps first, for fitting / fixture / valve /
  equipment once a label is chosen (phase ports or ready):
  | state | Esc |
  |---|---|
  | per-port sizes confirmed | the size rows again (writes nothing) |
  | rows open / editing | the bar's own: edit -> rows -> closed (from the page body: native's) |
  | rows closed, one size, no step, or the ports phase | the **label list** for the same box |
  | the label list opened this way | typed text cleared first; with nothing typed: native's Esc (cancels) |
  Not at ports/ready (box, label, saving), transition/cut/terminal, no placement, a form field outside the bar: native's.
- Why this works: native has no "back to label" phase, but `chooseFamily(id)` is accepted at ports and ready (only
  refused while submitting) and the label button stays enabled (`subtype.disabled = !bbox || submitting`). The list is the
  same prompt as at the label phase; a pick clicks native's own menu button (placement state only, nothing saved; native
  resets ports and Adjust ports), then our sizes step starts over for the new label. `promptTick` keeps this list open while
  the phase is ports/ready. Esc is handled with or without bar focus (document capture), the on-screen port line does not
  count as something to close. Upstream: none; it exists because the bar adds the steps.

### Step 5 (setting commands)

- `src/core/pipe-setting-core.js` (`settingVerdict`, `optionMatch`, `diameterPlan`, `readbackVerdict`, `optionRowText`),
  `PIPE_SETTING_IDS` / `PIPE_SETTING_ENTRIES` / `PIPE_SOURCE_UNRESOLVED` in `src/pipe/pipe-tables.js`, host `readSettings` /
  `writeSetting` (the only writer; re-checks its own guard) / `isSettingControl`. Commands: `diameter` (`dia`), `dsource`,
  `material` (`mat`), `msource`. Options are read live from each select; nothing hardcoded.
- **Hazard:** native's `#graph-pipe-diameter` and `#graph-pipe-diameter-source` change handlers call `updateResizeFacts` /
  `updatePortResizeFacts` when a resizable entity is selected (a saved command; the custom box commits on blur/Enter).
  Material and its source go through `readFacts` only (no command found), but all four follow one rule: write only with
  nothing selected (`__graphDebug.selectedEntityId`, fail closed) and no placement panel open, checked in the shell and again
  inside `host.writeSetting`. A non-standard size picks "Custom" and fills the box with `input` + `change` events, never
  blur or Enter (native's commit path). Decisions (user): refuse during a placement; refuse material too with a selection;
  non-standard sizes go to Custom automatically.
  The `diameter` prompt lists the select's own standard sizes (never the blank or Custom rows); typing filters them, a size
  not in the list is marked "custom" in the header and written as Custom + text. An arrow-picked row wins over typed text
  until the next keystroke. Upstream: native already has the select; a command line can offer the same list.
- Readback right after writing, and again after 400 ms, because native's `sync()` rewrites controls from its stored facts
  (the source select is guarded by `activeElement`, material is not). A write that gets reverted is reported.
- Side fix in `planQuery` (pipe only): a refused plan now names its entry, and the shell shows its reason instead of running
  some other highlighted row. Before, typing the exact name of an unusable entry could run a different prefix match.
- Resizing an EXISTING pipe (selected) is deliberately a later step. Upstream: native can set its own next-draw facts
  directly; keep the "never change a selected item by accident" rule if a command line can write these.

### All box tools (fitting, fixture, valve, equipment)

- Native uses ONE placement panel for every box tool. The Adjust ports box (`adjustPortsLabel.hidden` depends only on detected
  ports and a chosen label) and the per-port size fields (`placementOperation` is every tool except transition and cut) are
  tool-independent, and so is the ready hint (only transition and cut differ). So `PIPE_SIZE_TOOLS` (the sizes step: rows
  "as is / edit / Adjust ports") and `PIPE_FINISH_TOOLS` (Enter/Space-to-Finish) list all four (user decision). Transition, cut and terminal stay manual. `adjust` itself never had a tool limit.
- User-found: on a valve there was no visible Adjust ports option (only reducing fittings had the row). First tried a one-line
  hint; the user asked for two real choices instead. A placement with one size now gets the same step as the reducing
  tee, with two rows ("Continue as is", "Adjust ports (click each port)"), whenever native offers the box and it is not
  offered (`mode: 'ports'` in `sizesFacts`; it writes no sizes, so a selection does not block it). Cost: two Enters to finish
  there instead of one (the user chose this). Re-adjusting (user request): once the box is ticked and ports are assigned the
  choices come back and the adjust row reads "Adjust ports again": `runAdjust(true)` clicks the box twice (untick, then tick,
  the second only if the first really unticked it). Native's `toggleAdjustPorts(true)` restarts from `ports: []`, and
  unticking rebuilds the automatic assignment; neither saves. If they do not appear on a valve,
  native is not showing the box (`adjustPortsLabel.hidden`: no detected intersection, or no label chosen).
- Valve and equipment placements are on the [Not verified live](#not-verified-live-piping) list (valve families are not in
  `test/native-ids.json`: only fitting and fixture menus were observed).

### Action log

`src/core/pipe-log-core.js` (`appendLog`, `makeLogEntry`, `parseRevision`, `formatLog`) + `logAction` in the shell:
the bar's own clicks/writes, last `PIPE_LOG_MAX` (50), memory only, `__RW._pipeLog` / `_pipeLogPrint()`. A click that did not
happen takes its entry back. Added after a live session where 12 `/commands/` requests could not be attributed to the bar
or to the person (the app's own history panel gives the command names; nothing else says who clicked). Not needed upstream:
native knows which path called it.

### Safety nets and the drift check

- `hintWatch` / `missingIds` (`src/core/pipe-placement-core.js`) + `PIPE_NATIVE_CHANGED_MESSAGE`,
  `PIPE_REQUIRED_IDS` (`src/pipe/pipe-tables.js`): unknown placement hint -> one status line, nothing else;
  required id missing at load -> install nothing. None of this is needed upstream (native reads its own
  controller state, not its hint text).
- `scripts/check-native-drift.js` is read-only (a test greps its source for any write/POST). It compares
  against `test/native-ids.json` (hashes, ids, strings, `families`) and `PIPE_FALLBACK_KEYS` /
  `PIPE_HINT_PREFIXES`. Families come from the server contract, so they need a menu dump (`--menu`).
- First live run (2026-10-06): `pipe-bbox-connect.js` differs from the saved copy (recorded 51bab414..,
  live f80bc890..): a new `placeAtRouteEnd` (MEC-407, per-point menu of a 2D route) and a reworked
  `finish()` connector lookup. Nothing we use (hints, label menu, ids) changed. The recorded hash was
  left as it is on purpose; refetch the fixtures and update `native-ids.json` when it is reviewed.

### Open decisions

- **Aliases.** `PIPE_TOOL_ALIASES` was proposed, not approved (to be reviewed with the engineer).
  `fit` stays `zoomfit`'s.
- **Finish / Cancel** (`graph-finish-route`, `graph-cancel-route`) stay in `PIPE_FORBIDDEN_BUTTON_IDS` for every path
  except one: Enter or Space in the bar clicks Finish at the ready phase of a fitting, fixture, valve or equipment placement
  (Step 3, `host.clickFinish`, checked twice). Cancel is never clicked: Esc is native's own.
- **Isolation.** `PIPE_ISOLATION_ALLOWED` is enforced while the placement panel is open (`runEntry`); settings and `#`
  are refused during a placement and with anything selected.
- **No hardcoded tool table.** Unlike duct, there is no fallback table when the rail can't be read;
  the loader refuses ("no tool rail found"). `PIPE_FALLBACK_KEYS` only supplies a key for a rail
  button with no readable badge. Note native's badge falls back to the tool id's first letter when
  it has no hotkey, which is a label, not a real key.
- **Native Escape** cancels a placement and then switches to the route tool. The bar steps back first (size rows, then the
  label list; see "Esc steps back") and leaves Esc to native when nothing of ours is open.
- **Panel dragging** (duct has it) is not copied yet.
- **Flange is absent from the rail by native's design** (`pipe-session-ui.js`: "insulation/flange:
  intentionally absent - no canvas handler yet"). The rail is read live, so a flange tool shows up
  here by itself when native adds it.
- **Native's recorder logs our clicks.** `graph_capture` `action-capture.js` records our programmatic
  clicks on `[data-capture-control-id]` buttons as ordinary `tool_change` / `control_activate` steps.
  It does not record typed text or that the command line did it. Native's own command line behaves the
  same. The engineer may want to tag command-line-driven actions.
- **`data-trade="ductwork"`** is native's value for duct (`TradePack: "ductwork" | "piping"`) but has
  not been seen on a live duct page; confirm once before merging.
- **Repeat-last was dropped (user decision): Space finishes; type the short name to pick again.**
- **Fixtures** (`test/fixtures/native/`) are deliberately not in git; `test/native-ids.json` is the
  committed record.

### Not verified live (piping)

The one list. The offline harness (`verify_pipe_cmdline.js`) covers all of it; only the real page can prove it.
What WAS verified live (test page, 2026-10-06 and later) is in "Live verification status" above, plus the Step 5 setting
commands, the sizes step and the Esc step-back on a reducing tee.

- The cross (4-way): no four-way crossing on the test page.
- Vertical-variant fittings.
- Valve and equipment placements: their label menus, Adjust ports, sizes, "Adjust ports again" and Finish from the bar.
  Finish saves, so do it with a watch on `/commands/`, one placement each, then undo.
- The "Native changed: use the mouse for this step" line (needs native to change a hint).
- A full day of real use by a piping annotator.
