# Boon Tagger Tools — Command Line

An AutoCAD-style command line for the Constructions Tagger platform's graph ("Duct Takeoff") duct
editor (constructions-tagger-web.onrender.com, `/graph/projects/<project>/session/?page=<page>`).
Pasted into the DevTools console of a live session — no server, no build step. Just start typing a
tool, action, or setting's name from anywhere on the page (no click or focus step needed) and it
dispatches. **Graph action commands submit real commands to the app's own autosave journal the
instant they're invoked** — this app has no manual-commit mode, so a button click (a human's or
this project's) auto-flushes regardless of any Save button; see "Boundaries" for the exact,
narrow set of things this project will never do on that basis.

The same loader also still installs on the older annotate-job page (`/annotation-jobs/<job>/
annotate/<item>/`) — it detects which host it's on and switches its whole tool vocabulary,
settings, and `#`-search accordingly. That host gets much lighter treatment in this README (see
"The annotate-job page (legacy)" at the bottom) since almost all current work targets graph.

**This repo contains only the command line** — a minimal build for iterating on native-app-tool
dispatch without dragging in unrelated tooling on every paste. The full Region Workbench (region
segmentation, mask tools, Pipe/Elbow, OCR, and its own older copy of a workbench-aware command
line) lives in the sibling repo `boon-tagger-mask`; this repo is a genuine extraction from that
project's history — see `CLAUDE.md` for the full architecture and `PORTING.md` for how pieces of
this project are meant to move into the graph host's own **native** command line.

## Files & load order

Each module is a versioned IIFE gated on the previous module's version flag. `console_loader.js`
(built by `build_loader.sh`) concatenates four modules, then the command line itself:

1. **rw_host.js** — loads first, before anything else. Detects which host this page is
   (`window.__RWhost = {id, canvasId}`) from the DOM (`#graph-session-root`'s presence), not the
   URL.
2. **rw_panelux.js** — collapsible panel UI, and the **RW: ON/OFF** master killswitch that gates
   every handler the later modules register.
3. **rw_core.js** — minimal bootstrap: creates `window.__RW`, a bare `#rw-panel`/`#rw-list` for
   the command line to mount into, and `RW._commitStatus` for its status-line messages. No region/
   mask/annotation engine at all.
4. **`dist/rw_cmdline.js`** — the command line itself, assembled by `scripts/build-dist.js` from
   the ES modules under `src/core/`, `src/features/`, `src/ui/`, `src/hosts/` (pure logic, being
   extracted out module by module so features can eventually be upstreamed into the graph host's
   own native command line — see `PORTING.md`) plus `src/console/shell.js` (what's left of the
   original monolithic file). Every host-specific fact branches on `RW._host.id` here.

**To rebuild** after editing a source module:

```bash
bash build_loader.sh     # assembles src/ into dist/rw_cmdline.js, then concatenates the loader
node --test "test/*.test.mjs"   # unit tests for the pure src/core/src/features modules
node verify_cmdline.js   # the 1000+-assertion DOM-level harness — this project's real safety net
```

Both `dist/rw_cmdline.js` and `console_loader.js` are committed; rebuild and commit both after
every source edit. See `CLAUDE.md`'s "Build / verify commands" for what each one actually checks.

## Injection

1. Navigate to the graph session ("Duct Takeoff" duct editor).
2. Press **F12** → **Console** tab.
3. Paste the entire contents of `console_loader.js`, press **Enter**.
4. The command line installs automatically once the page is ready (up to ~30s) — the console log
   names which host it detected.

Paste again after each page navigation — a same-URL "navigation" that doesn't actually reload the
page is a no-op for re-injection (see `CLAUDE.md`'s live-testing gotchas).

## Command line

**Just start typing a tool's name from anywhere**, no click or focus step needed (like AutoCAD's
command line): the first character you type auto-focuses the always-visible input, an
autocomplete dropdown suggests matches as you keep typing, and **Enter or Space** dispatches it —
both act identically, AutoCAD's own classic convention. A query with exactly one match always
renders that one row visibly highlighted — there is no hidden "only one match, just run it"
shortcut.

**The whole command-line panel — input, status line, and the RW: ON/OFF killswitch — is a fixed
overlay pinned to the bottom-center of the drawing stage**, not a box in a side rail. It stays
horizontally centered over the stage's on-screen rect and sits a tunable gap above its bottom edge
(default 16px); because it's `position:fixed`, it neither scrolls nor pans with the drawing. Two
console escape hatches tune it: `__RW._cmdBarOffset` (px gap) and `__RW._cmdBarWidth` (overlay
width, default 480px) — both are live, no reload needed. It re-centers itself on window resize,
sits near the 32-bit z-index max so nothing can cover it, and clamps so it stays on-screen. If the
bar ever goes missing but commands still work, run `__RW._overlayDiagnose()` — it reports the
panel/stage/dropdown's actual rects and visibility.

**The autocomplete dropdown always paints above the whole panel.** It's anchored off the panel's
own rect (never just the input's, so it never grows into the header strip), preferring to open
upward and flipping below when there isn't room. It follows the panel if repositioned.

**Drag the panel by its header strip to move it anywhere on screen.** Left mouse button, a 3px
move threshold before a drag starts (so a plain click still just collapses/expands the panel).
Clamped on-screen; once moved it stays put. Position is per-page only — a fresh paste re-pins
bottom-center; `__RW._cmdResetBar()` re-pins manually without reloading. `__RW._cmdBarDrag = false`
disables dragging entirely.

**Because typing is captured from anywhere, it takes over the app's own single-key shortcuts while
you're mid-command** — to reach an app shortcut directly, blur the command input first (Escape, or
click the canvas). **To turn the command line off entirely**, use the panel's own **RW: ON/OFF**
killswitch — it stops the global typing-capture along with every other listener this build
registers.

**Utility keys:**

| Key | Action |
|---|---|
| `Escape` (command input focused) | clear the command input, or close the dropdown if open |
| `Escape` (nothing focused) | return the app to select |
| `ArrowUp`/`ArrowDown` | move the autocomplete highlight |
| `Tab` / `Shift+Tab` | cycle the highlight to the next/previous match, filling each in |

Escape typed twice in a row does two different things: the first clears/closes the bar (if it had
focus), the second — now that nothing is focused — sends the app back to select. **The
highlighted row always stays on screen while cycling** — this matters most for a tool's own
parameter listing, which can carry dozens of rows (the graph inspector's "Advanced" group). **Tab
is escalated to a `window`-level capture listener** so it wins a same-node race against the app's
own `document`-level keydown handling; it's scoped to firing only when the real command input is
the event target.

**Note on the global name**: everything here lives on `window.__RW` (double-underscore, to avoid
colliding with any global the host page might already have). Inside this project's own source
files it's aliased to a shorter local `const RW = window.__RW`, but **from the DevTools console
itself, you must type `__RW.`, not `RW.`** — a bare `RW` throws `ReferenceError`.

## Tools

**Tool vocabulary is read live off the app's own toolbar**, not hardcoded — every `[data-tool]`
button's id becomes a command name, and its own `<span class="graph-tool-key">` badge (the app's
own key hint) becomes that command's key. Curated descriptive aliases are merged in by id on top:
`route`/`duct`, `grd`/`diffuser`, `unit`/`equipment`, `vertical`/`riser`, `cut`/`split`,
`connect`/`join`, `adjust`/`stretch`. On a duct project that yields 13 commands: `select` (`s`,
the resting state), `route` (`r`), `flex` (`f`), `extend` (`e`), `branch` (`b`), `transition`
(`t`), `grd` (`g`), `unit` (`u`), `vertical` (`v`), `cut` (`c`), `damper` (`d`), `connect` (`j`,
"Connect two open ends"), `adjust` (`a`, "Adjust duct length"). Every entry is a plain one-key
dispatch — no draw-mode concept on this host.

**Why derived, not hardcoded**: this same host also runs a *second* trade pack (piping), which
reuses several of the same tool ids with **different** key letters (`extend`=`x` not `e`,
`vertical`=`z` not `v`, `cut`=`u` not `c`, `transition`=`n` not `t`) and filters which tools even
appear per project — a static table would silently dispatch the wrong key there. If the live
toolbar can't be read, the command line falls back to the built-in 13-tool table and reports it —
a status-bar message, a `console.log` naming the source, and `__RW._cmdGraphTableInfo`
(`{source, count, tools, skipped, aliasDropped, shadowedActions}`), console-inspectable any time.
`__RW._cmdRebuildGraphTable()` re-derives without a page reload (useful since re-pasting the
loader onto an already-injected page is a no-op — see "Injection" above); it refreshes
`RW._cmdTable`/`RW._toolSettingsMap` but never touches `RW._cmdLastTool`.

**When a tool's own name collides with an action's** (only known case: the piping pack's
`evidence` tool vs. this host's own `evidence` action), the **tool always wins its own name** —
typing `evidence` arms the tool, and the action stays reachable by its other alias (`attach`).
`__RW._cmdGraphTableInfo.shadowedActions` reports any such collision and what each action is still
reachable by.

## Select is the resting state, and Space

AutoCAD always drops you back to the bare selection cursor once a command finishes or is
cancelled. This build does the same via three triggers, all funnelled through one path so they
can never fire twice for the same event: **on load** (skipped if a tool is already armed); **on
Escape** while nothing else is focused (deferred slightly so the app's own Escape handling runs
first); and **on a poll** that notices `__graphDebug.activeTool` clearing itself back to
null/`'select'` on its own, edge-triggered across two ticks so a momentary null while switching
tools can't yank you out of the tool you just picked.

If this ever mis-fires, `__RW._cmdAutoSelect = false` turns the whole feature off without
re-pasting the loader (it also turns itself off automatically, reporting why, if it ever reverts
more than 5 times in 5 seconds).

**Press `Space` with nothing typed** — another AutoCAD convention (Space/Enter with an empty
command line repeats the last command), extended into a toggle:

- **Nothing currently armed** and a tool has been run at least once → Space **re-arms that same
  tool** directly, no need to type its name again.
- **A tool is currently armed** → Space **closes it** (back to select).
- **One of the four config-dialog modals is currently open** → Space does not try to close the
  armed tool behind it. Instead it "initializes the console": opens the bar and drops into a
  dropdown of what's actually usable while isolated to that modal — its own fields plus its own
  Choose/Cancel-equivalent commands.
- **Nothing has been run through the command line yet at all** → Space just initializes the
  console: opens the bar (nothing seeded into it) and drops into the tool dropdown, pre-filtered
  to real tools only.

Whether a tool is "currently armed" is tracked by this project itself, not re-read from the app at
decision time — see `CLAUDE.md`'s design doctrines for why.

**A bare digit typed at rest passes straight through to the app.** The app offers a numbered
"pick the next tool" prompt at points such as the end of a duct draw — a digit typed while the
command bar is genuinely empty and unfocused reaches the app untouched, since no tool/action/param
name starts with a digit. `__RW._cmdDigitPassthrough = false` restores capture-everything.

**Space shadows the app's own Space-drag pan gesture** — wheel, Shift+wheel, and middle-click
still pan natively, and Ctrl+wheel still zooms; none of that goes through this command line.
Middle-drag pan (this project's own annotate-host feature) is off by default here, since the
drawing stage pans via a CSS transform and has nothing to scroll.

## `#` system search

Typing `#` followed by a name (e.g. `#fptu`) searches the live `#graph-system-select` options
(e.g. "FPTU (Supply)"), read/written via `.value` plus `input`/`change` events. Confirmed live
against a 30-system project including genuine duplicate option texts.

## Tool settings: drill in, apply a value, re-arm the tool

**Type `<tool>.`** (e.g. `route.`) from anywhere to drill into that tool's live settings, or —
while that tool is the one currently armed — type the bare param name directly (`width`), blended
into the ordinary dropdown. Every param is swept **live** by id prefix under one shared `graph-`
prefix — nothing is hardcoded beyond that, so it stays accurate as the app's own controls change.
Visibility alone isn't enough to tell params apart across tools, so the sweep additionally scopes
to the real inspector aside (excluding the toolbar and any open dialog) and skips anything sitting
inside a collapsed disclosure — the inspector's own "Advanced" group, in particular. A param
behind a collapsed group is still real; typing it directly expands the group to make the write.
`RW._cmdParamScopeDiagnose()` is a read-only console diagnostic naming every control found and why
it was or wasn't included.

**Properties match by what the app is showing right now, not just their fixed DOM id** — every
inspector field's live on-screen label is read fresh each time, so `system`/`network` both match
route's system field ("System / network"), and `diameter` matches route's own width control *only*
once its profile is actually `round` — the same element the app relabels from "Width (in)" to
"Diameter (in)" on screen. `width` keeps matching that same control by id regardless of profile.

**What happens next depends on the param's type:**

- **Numeric**: the input becomes `route.width = ` and stays focused. Enter applies — clamped to
  the live range, written to the real control, `input`+`change` dispatched, tool re-armed.
- **Checkbox**: picking it flips it immediately, re-arms the tool.
- **Select**: picking it shows a numbered list of its live options. Type a number or a
  name-prefix to filter, Enter/Space/click applies whichever's highlighted. **Tab live-previews
  each option on the real page as you cycle** (Shift+Tab reverses), genuinely applied so you can
  compare states before committing.

**Escape** cancels cleanly — for numeric/checkbox, the real control is left untouched; for select,
it reverts to whatever was genuinely current before any Tab-preview, if one happened.

**Confirmed vs. still-hedged**: `.value` + `input`/`change` was live-tested against
`magic-wand-tolerance`, `graph-width-input`, and `graph-profile-select` (`CONFIRMED_WRITE_IDS`) and
worked. Every other control uses the identical technique but hasn't been individually
write-tested, so its status message still says "confirm it actually applied."

**The inspector's "New system" name/service fields are typeable too** (`route.new-system-name`/
`-service`, or bare `name`/`service`) — the "Add" button stays a manual click only.

**`dimension` (alias `dim`)** sets Width and Height one after another without re-typing the tool
name: it opens the same numeric draft `width` alone would, but confirming it re-opens the draft on
**Height** instead of clearing the bar. Requires the active tool to genuinely have both controls
right now (a round-profile duct, which only exposes Diameter, does not). A bad value at either
step stops the chain there. Escape cancels the whole two-step command.

## Tool isolation

**The command line is modal while a duct tool is armed.** Once `route`/`flex`/`extend`/... is
armed, what still matches is: that tool's own properties (bare, or via `route.`), the ways out
(`select`, Escape, Space), `finish`/`cancel`, `dimension`, and — if a config-dialog modal is open
for that tool — its own Choose/Cancel-equivalent commands. **Exception**: typing or picking a
*different* tool switches straight to it, arming that tool instead, with no need to return to
`select` first — but only while a real tool is armed, not while a modal is open (dispatching a
different tool's key over an open dialog was never a considered scenario). Everything else — every
action button, `#` search — matches nothing, and the status line says why. Enforced twice: the
dropdown never lists a blocked entry, and `RW.runCommand` refuses one directly too, so a direct
console call can't bypass it either. `__RW._cmdIsolateTools = false` turns isolation off entirely.

## Config-dialog modals

Four real `<dialog>`s, one per tool: **branch fitting** (`branch`), **change size / transition**
(`transition`), **GRD placement** (`grd`), **riser elevation** (`vertical`). While one is open, the
settings listing switches from the ordinary inspector to that dialog's own fields, live-labeled
the same way. Each modal's own Choose/Cancel-equivalent buttons are their own commands:
`choose`/`cancelbranch`, `apply`/`cancelsize`, `place`/`cancelgrd`, `placeriser`/`cancelriser` —
the `×` close button is deliberately not exposed. All eight stay reachable even while a *different*
tool is isolated, the same way `finish`/`cancel` already do.

**Opening any of the four modals auto-walks its own fields, one value prompt at a time.** The
instant a modal is detected open, the command bar takes focus and drops into a value prompt for
its first field (on-screen order), chaining into the next as each is confirmed — a field's list is
re-derived live on every hop, not a fixed array, so a conditionally-visible field (branch's own
flush-boot glyphs; change size's secondary size field, hidden for a round shape; riser's Shape
field, hidden for a plain elbow) is picked up or skipped correctly. Enter with nothing typed
leaves that field untouched and just advances. A walked checkbox opens a typed on/off draft rather
than auto-toggling. **Branch fitting still ends on the dropdown pre-highlighted on `choose`**,
waiting for one further, deliberate Enter. **Change size, GRD, and riser auto-click their own
submit button the instant the last field is confirmed** — no further Enter needed (Kresna's own
explicit choice, overriding this project's usual "never auto-submit a graph-host action button"
caution, for these three specifically). Falls back to the manual Choose/Cancel prompt if the
submit button isn't currently usable. Escape at any point ends the walk without submitting
anything; the modal itself stays open. `__RW._cmdModalWalkEnabled = false` disables auto-start
only (`__RW._cmdStartModalWalk(tool)` still works by hand); `__RW._cmdModalWalk` is
console-inspectable mid-walk.

**The walk remembers what was typed, and offers to reuse it — for branch only.** Change size, GRD,
and riser never remember anything and always walk fresh, at Kresna's own explicit request. For
branch: if anything was applied during an earlier walk, the bar shows a choice instead of jumping
into field 1 — "Edit each field", "use previous for all" (pre-filled, still requiring Enter per
field), or "use previous for all, without confirming" (applied immediately, still ending on the
same Choose/Cancel prompt). Remembered values persist across a page reload (`localStorage`).
`__RW._cmdModalWalkValueMemory` is console-inspectable (`{tool: {param: value}}`, no
`transition`/`grd`/`vertical` key ever appears); `__RW._cmdModalWalkMemoryClear(tool)` forgets one
tool or everything; `__RW._cmdModalWalkMemoryEnabled = false` disables the offer and new
recording. Branch fitting's own field-memory (a different, narrower mechanism) lives in a
separate repo, `boon-duct-workbench`, at the user's own request.

## Action buttons

Button-backed one-shot commands, typed by name (no single-letter aliases, since every letter is —
or might be, on some trade pack — a tool key): `undo`/`redo` (`re`), `zoomfit` (`fit`)/`zoomin`/
`zoomout`, `region` (`addregion`), `ruler` (`measure`), `calibrate` (`cal`), `setscale`
(`scale`)/`resetscale`, `finish`/`cancel` (only while a route is in progress), `evidence`
(`attach`)/`note` (`memo`)/`rationale` (`why`), `toggledamper` (`tdamper`), `elevation`
(`riserelev`, only with a riser selected), `annotations` (`anno` — a view-only toggle, submits
nothing), plus the eight modal Choose/Cancel commands above.

**An action that isn't currently usable is left out of the dropdown entirely, not listed and then
refused** — `finish`/`cancel` while no route is in progress, `elevation` with no riser selected,
and so on, only appear once genuinely runnable (button present, visible, not disabled). Typing the
name straight into `RW.runCommand()` from the console still reports the specific reason
(missing/disabled/hidden).

## Boundaries

- **Graph action commands submit real commands to the app's own autosave journal** — this app has
  no manual-commit mode, so every click auto-flushes within ~2s regardless of any Save button.
  Given this, every button-backed action is implemented **except** the "System / network" and "New
  system" property-group actions (`AssignDuctSystem`/`CreateDuctSystem`/`RenameDuctSystem`) —
  deliberately never given table entries.
- The command line never clicks Save (`#graph-save-commands`), never touches the Submit form, and
  never drives the screen/mic recording controls — enforced in code (`FORBIDDEN_BUTTON_IDS`,
  checked inside `RW.runCommand`), not just by omission from the action vocabulary above.
- The modal walk's own auto-submit is scoped to exactly three tools (change size/GRD/riser) — see
  "Config-dialog modals" above. Do not widen this without re-confirming scope first.
- The activity tracker (`/analytics/api/events/`) is read-only observed, never spoofed.
- This is a bridge tool, not a replacement for engineering review.
- On the annotate-job page (below), nothing auto-draws or auto-submits — every feature but
  middle-drag pan dispatches a synthetic keydown instead of touching app state directly.

## The annotate-job page (legacy)

The original target this project grew from, before the graph host existed. Gets much lighter
treatment here — see `CLAUDE.md` for the full round-by-round history if you need it.

**Tool vocabulary** (native app tools, dispatched via synthetic keydown — every draw-mode tool
dispatches a defensive `d` first, since the app's own keymap documents them as draw-mode-only;
never confirmed live whether that's actually required):

| Command | Key | Aliases | Type | Notes |
|---|---|---|---|---|
| `linear` | `Q` | — | draw tool | |
| `rect` | `W` | `bbox` | draw tool | |
| `count` | `E` | — | draw tool | |
| `polygon` | `R` | — | draw tool | |
| `polyline` | `T` | — | draw tool | |
| `circle` | `Y` | — | draw tool | |
| `cloud` | `U` | — | draw tool | revision cloud |
| `wand` | `K` | — | draw tool | magic wand — has settings (`wand.` → tolerance/detail/padding) |
| `wrap` | `X` | — | draw tool | shrink-wrap — has settings (`wrap.` → padding/smoothing/polygon-mode) |
| `void` | `V` | — | draw tool | delete-area workflow; never becomes Space's repeat target |
| `mline` | `P` | `ribbon` | draw tool | constant-width path — has settings (`mline.` → width/anchor) |
| `tag1`…`tag9`, `tag0` | `1`…`9`, `0` | — | tag select+draw | the app's own digit hotkeys directly — **not** the Nth tag in a `#`-search |
| `pan` | `A` | — | mode switch | |
| `select` | `S` | — | mode switch | the resting state |
| `draw` | `D` | — | mode switch | |
| `label` | `F` | — | mode switch | Space always returns to `select` from here |
| `crop` | `G` | — | mode switch | |
| `mirror` | `M` | — | mode switch | |

**Tag search**: `#name` searches the app's full tag list (auto-detected from `annotationState` on
load). Selection is **always a direct `annotationState.currentTag = tag` assignment**, regardless
of list position — an earlier version dispatched the app's own 1-9/0 hotkey, assuming hotkey order
matched detected-list order; a real job proved that **wrong** (digit 1 selected a different tag
than list-index 0), so that path was removed entirely. Whether direct assignment is reliably
picked up by the app's own rendering is still not fully confirmed — the status line always says
"confirm it actually applied."

**Tool settings** (`wand.`/`wrap.`/`mline.`, or the bare param name while that tool is armed) work
the same way as graph's settings drill-down above, with one difference: it's **additive, not
exclusive** here — switching to a different tool, tag search, anything else, all still works while
a tool's settings are blended into the dropdown. `wand.tolerance` was individually live-confirmed
to take effect; every other control still carries the "confirm it applied" hedge.
`__RW._toolSettingsDiagnose(filter)` is the read-only console probe this was built from.

**Void workflow awareness**: the native void flow auto-reverts to whatever drawing tool was armed
just before entering void, and Space's "last tool" memory reflects exactly that — `void` and the
area tools used while drawing it never become what Space repeats.

**Middle-mouse hold-drag pans** (does not switch tools) — like grabbing and dragging the paper.
Unlike every other feature here, this writes `scrollLeft`/`scrollTop` on a real scroll container
directly rather than dispatching a key, specifically so whatever tool is armed survives the
gesture untouched. `__RW._panDiagnose()` confirms whether this page's viewport actually scrolls
before trusting the feature; `__RW._panEnabled = false` disables it; `__RW._panInvert = true` flips
direction if it feels backwards.

**Scroll-to-zoom** is diagnostic-only so far — `__RW._zoomDiagnose()` reports what actually changes
between two zoom levels (transform / canvas resolution / a state field), since guessing the real
mechanism wrong risks desyncing where a click lands from what's on screen. Plain scrolling still
just scrolls until the real mechanism is known.
