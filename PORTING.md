# Porting guide

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
- Branch fitting's own field-memory (a different, narrower mechanism than the modal-walk memory
  above) intentionally lives in a separate repo, `boon-duct-workbench` — don't go looking for it
  here.
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
- Branch fitting's own field-memory intentionally lives in a separate repo
  (`boon-duct-workbench`, per the user's own request) — do not port that piece from
  here; the walk mechanism and its own value memory (`RW._cmdModalWalkValueMemory`,
  which now covers branch only) are unaffected.
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
