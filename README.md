# Boon Tagger Tools — Command Line

Client-side workflow enhancer for the Constructions Tagger annotation platform
(constructions-tagger-web.onrender.com). Pasted into the DevTools console of the live
annotation page — no server, no build step, nothing persists until you click the app's own
**Save**. Everything lives in the page until reload/navigation, then must be re-injected.

**This repo contains only the AutoCAD-style command line** — a minimal build for iterating on
native-app-tool dispatch and tag search without dragging in unrelated tooling on every paste. The
full Region Workbench (region segmentation, mask tools, undo, Commit, Pipe, Elbow, OCR, and its
own copy of a workbench-aware command line with restored single-key shortcuts) lives in the
sibling repo `boon-tagger-mask` (also under `~/Projects/boon-projects/`). This repo was extracted
from that project's history — see `CLAUDE.md` for the full evolution.

## Files & load order

Each module is a versioned IIFE gated on the previous module's version flag. `console_loader.js`
(built by `build_loader.sh`) concatenates all three, in order:

1. **rw_panelux.js** — loads first. Collapsible panel UI, and the **RW: ON/OFF** master
   killswitch that gates every handler the later modules register (including the command line's
   own global keystroke capture).
2. **rw_core.js** — minimal bootstrap replacing `rw_install.js`'s scaffolding on this branch:
   creates `window.__RW`, a bare `#rw-panel`/`#rw-list` for the command line to mount into, and
   `RW._commitStatus` for its status-line messages. No region/mask/annotation engine at all.
3. **rw_cmdline.js** — the command line itself (see "Command line" below).

**To rebuild** after editing a source module:
```bash
bash build_loader.sh
```

## Injection

1. Navigate to the Constructions Tagger annotation page.
2. Press **F12** → **Console** tab.
3. Paste the entire contents of `console_loader.js`, press **Enter**.
4. The command line installs automatically once the page canvas is ready (up to ~30s).

Paste again after each page navigation.

## Command line

**Just start typing a native tool's name from anywhere**, no click or focus step needed (like
AutoCAD's command line): the first character you type auto-focuses the always-visible input at
the top of the panel and seeds it, an autocomplete dropdown suggests matches as you keep typing
(light green), and **Enter or Space** dispatches it to the app — both act identically, AutoCAD's
own classic convention, and both work the same way whether you're confirming a command or a
searched tag (see below).

**Because typing is captured from anywhere, it takes over the host app's own single-key
shortcuts while you're mid-command** — to press an app shortcut key directly again, blur the
command input first (Escape, or click the canvas). **To turn the command line off entirely**,
use the panel's own **RW: ON/OFF** killswitch — it stops the global typing-capture along with
every other listener this branch registers.

**Native app tool vocabulary** (dispatched to the host app itself — see "App built-in keymap"
below for what each one does): draw-mode tools `linear` (`q`), `rect` (`w`), `count` (`e`),
`polygon` (`r`), `polyline` (`t`), `circle` (`y`), `cloud` (`u`), `wand` (`k`), `wrap` (`x`),
`void` (`v`), `mline` (`p`), `tag1`-`tag9`/`tag0` (digits); mode switches `pan` (`a`), `select` (`s`), `draw`
(`d`), `label` (`f`), `crop` (`g`), `mirror` (`m`). Every native tool keeps its real app-keymap
letter as its alias — with no workbench commands left on this branch to collide with, nothing is
reserved. `rect` and `mline` are AutoCAD-ish renames of what used to be `bbox` and `ribbon` — both
old names still work as aliases. **`tag1`…`tag0` dispatch the app's own digit keys directly — they
do not mean "the Nth tag in the detected list."** That distinction matters: a real job showed the
app's digit hotkeys do **not** map to `#`-search tag-list order (see tag search below) —
`tag1`…`tag0` are a completely separate mechanism from selecting a searched tag.

Draw-mode tool commands dispatch a defensive `d` (enter draw mode) immediately before their own
letter, since the app's keymap documents them as draw-mode-only tools — **not live-verified
whether that's actually required.** Every dispatch reports a live diagnostic to the status line:
the key sent, plus `annotationState.currentTool` before and after — read it after running a
native command to see whether the dispatch actually landed, and to learn the app's real
`currentTool` strings (only `'bounding_box'` was previously confirmed anywhere in this codebase).

**Tag search: type `#` followed by a tag name** (e.g. `#conference`) to search the app's full tag
list, shown in the same dropdown color-coded in purple. The tag list is auto-detected from
`annotationState` when the command line loads — if detection fails, `#` search reports that in
the status line rather than silently doing nothing. **Selecting a tag always directly assigns
`annotationState.currentTag`**, regardless of its position in the list — an earlier version
dispatched the app's own 1-9/0 hotkey for the first 10 tags, assuming hotkey order matched the
detected list's order; a real job proved that assumption **wrong** (digit 1 selected a
completely different tag than the one shown at list-index 0), so that path was removed entirely.
Direct assignment is not fully confirmed live either — if the app needs its own setter/dispatch
to notice the change, this can silently desync the app's displayed tag from what's actually used
on commit. Watch the status line: it always says "confirm it actually applied."

**Utility keys:**

| Key | Action |
|---|---|
| `Escape` (command input focused) | clear the command input, or close the autocomplete dropdown if it's open |
| `Escape` (nothing focused) | return the app to select — see "Select is the resting state" below |
| `ArrowUp`/`ArrowDown` | move the autocomplete highlight |
| `Tab` / `Shift+Tab` | cycle the highlight to the next/previous match, filling each in as you go |
| mouse wheel over the dropdown | same as Tab/Shift+Tab — scroll down for next, up for previous |

So Escape typed twice in a row does two different things: the first clears/closes the command bar
(if it had focus), the second — now that nothing is focused — sends the app back to select.

**Tab and the mouse wheel both just move the highlight — neither one ever applies anything.**
Cycling through `#conc` → CONCRETE / CONCRETE SLAB / CONCRETE WALL with Tab or the wheel only
changes what's highlighted (and, for Tab, what's filled into the input); the tag is only actually
assigned — same as picking a command — once you press Enter, Space, or click a row. The wheel
only does this while the mouse is actually over the dropdown itself, so ordinary page scrolling
(and the still-unbuilt scroll-to-zoom feature, see below) is completely unaffected. Both are
scoped to the two plain search modes (commands and tags) — a `<tool>.` settings-param list keeps
Tab's older fill-only behavior (no wheel-nav either), and a select param's own option list keeps
its existing Tab-live-previews-each-state behavior (see "Tool settings" below); the wheel does
nothing in either of those. Console escape hatches: `RW._cmdMenuWheel` (default `true`) turns
wheel-navigation off on its own without the master killswitch, `RW._cmdMenuWheelMs` (default
`60`) is the minimum time between wheel-driven steps (a physical mouse notch is one event, but a
trackpad gesture can fire dozens per second), and `RW._cmdMenuWheelInvert` flips the scroll
direction if it feels backwards.

## Select is the resting state (AutoCAD-style)

AutoCAD always drops you back to the bare selection cursor once a command finishes or is
cancelled. This build does the same via three triggers, all funnelled through one path so they
can never fire twice for the same event: **on load** (once the app looks idle — skipped if a tool
is already armed, so re-pasting the loader after a navigation doesn't yank you out of a tool
that's already working); **on Escape** while nothing else is focused (deferred slightly so the
app's own Escape handling — cancelling whatever it was doing — runs first); and **on a poll**
that notices `annotationState.currentTool` clearing itself back to null on its own (e.g. a shape
finished), debounced across two ticks so a momentary null while switching tools can't yank you out
of the tool you just picked. Running `pan`/`label`/`crop`/`mirror` is never fought back to select.

If this ever mis-fires, `__RW._cmdAutoSelect = false` in the console turns the whole feature off
without needing to re-paste the loader (it also turns itself off automatically, reporting why on
the status line, if it ever reverts more than 5 times in 5 seconds — a safety net against a bad
`currentTool`/`mode` read looping).

**Press `Space` with nothing typed — it's a toggle** — another AutoCAD convention (pressing
Space/Enter with an empty command line repeats the last command), extended into an on/off switch:

- **Nothing currently armed** and a real draw tool has been run at least once (mode switches like
  `pan`/`select`/`label`/`crop`/`mirror` don't count) → Space **re-arms that same tool** directly,
  no need to type its name again.
- **A tool is currently armed** → Space **closes it** (back to select) — unconditionally, whether
  or not you adjusted any of its settings first; every setting change is already fully applied the
  moment you make it, so there's nothing left in progress to protect by keeping the tool open.
- **You switched to `label` while a tool was active** → Space goes straight to **select**, not
  back to the tool that was active before label (`mline -> label -> Space -> select`, not `mline
  -> label -> Space -> mline`). This is a deliberate override, scoped to `label` only — without
  it, Space would fall into the plain repeat-from-idle rule above and resume the prior tool
  directly, which is what leaving `label` used to do and is not what's wanted here. Switching to
  `pan`/`crop`/`mirror` still uses that plain repeat-from-idle behavior, unaffected.

Both only fire when the command bar is genuinely empty (nothing mid-typed) and neither opens the
command bar or dropdown — they're direct actions, not a search. Whether a tool is "currently armed"
is tracked ourselves (not re-read from the app each press), so closing then repeating in a fast
loop — press Space, press Space again right away, again, again — reliably keeps alternating between
the tool and select every time, with no dead cycle where a press silently does nothing. It keeps
remembering the same tool across as many close/repeat cycles as you like, until you explicitly use
a different one, at which point *that* becomes what Space repeats instead.

One accepted trade-off from tracking this ourselves: if a tool gets armed some other way — clicking
the app's own toolbar directly, bypassing this command line — Space won't know to close it, since
nothing here ever saw it arm. If nothing has been run through the command line yet at all, Space
falls through to ordinary typing instead (opening the full command list, same as any other letter).

**Practical tip**: this blind spot only ever affects *arming* — always start a tool by typing its
name here (or letting the bare-param blend catch it while another tool's active), never by clicking
the app's own toolbar button directly, and Space's close/repeat toggle stays accurate indefinitely.
*Closing* has no such caveat — Escape, Space, or the tool just finishing on its own are all picked
up correctly no matter how the tool was armed in the first place.

## Middle-mouse hold-drag pans (does not switch tools)

Hold the **middle mouse button** (scroll-wheel click) and drag to pan the page — like grabbing and
dragging the paper, AutoCAD-style. Unlike every other feature here, this does **not** dispatch a
key to the app's own pan tool — it moves the page directly, the same way ordinary scrolling would,
specifically so that whatever tool is currently armed (`linear`, `rect`, `mline`, ...) survives the
whole gesture untouched. See CLAUDE.md's amended Constraints for why this is the one feature that
writes to the page directly instead of dispatching a synthetic key.

The app's own native `Space` = temp-pan key still exists in its keymap (see below) but is, in
practice, shadowed by this build's global typing-capture (a bare `Space` gets absorbed into the
command input rather than reaching the app) — middle-drag is the replacement, not an addition.

If it doesn't do anything on a given page, run `__RW._panDiagnose()` in the console first — it walks
up from the annotation canvas and prints every ancestor's scroll metrics, which answers the one
real unknown here: whether this app's viewport actually scrolls, or pans via a CSS transform
instead (in which case no amount of `scrollLeft` writing will do anything, and this feature is a
harmless no-op). Other console-tunable escape hatches: `__RW._panInvert = true` if the direction
feels backwards; `__RW._panEnabled = false` to disable panning alone without touching the rest of
the command line; `__RW._panStopHostEvents = false` to let the host app's own canvas see the middle
press too (default `true`, to guard against a canvas whose mousedown handler doesn't check which
button was pressed); `__RW._panContainerOverride = someElement` to skip the automatic scroll-ancestor
search entirely.

## Scroll-to-zoom (exploratory — diagnostic only so far)

The goal: plain scrolling zooms in and out, no modifier key or keypress involved at all — not a
dispatch to one of the app's own zoom shortcuts, an actual self-implemented zoom.

That turns out to need real information this project doesn't have yet. Middle-drag pan (below)
could be self-implemented safely because it moves EXISTING content within its own scroll container
via `scrollLeft`/`scrollTop` — universal DOM properties every scrollable element has, so there's no
way to get the mechanism wrong. Zoom has no such universal equivalent: different apps implement it
as a CSS transform on a wrapper element, a canvas redrawn at a different resolution, a PDF-library
zoom API, or a plain state field — and guessing wrong here isn't just cosmetic. If this app computes
where a click lands from its real (untransformed) page layout, an externally-applied CSS zoom could
silently desync what you see from where an annotation actually gets placed — a correctness risk
serious enough that shipping a guess would be worse than shipping nothing.

So this round shipped a **read-only diagnostic only**, `__RW._zoomDiagnose()` — run it once before
zooming (using the app's own Ctrl+scroll or Ctrl+Plus/Minus), zoom in noticeably, run it again, and
compare the two outputs by eye. It reports, for the annotation canvas and every ancestor: computed
and inline CSS `transform`, the legacy `zoom` CSS property, a `<canvas>` element's backing
resolution (`width`/`height` attributes) versus its rendered size, and any `annotationState` key
whose name looks zoom/scale-shaped. Whatever value actually changes between the two runs is the
real mechanism — that's what a real scroll-to-zoom implementation needs to drive, once it's known.
Plain scrolling still just scrolls, unchanged, until then.

(Two earlier attempts at this — redispatching a synthetic Ctrl+scroll, then dispatching Ctrl+Plus/
Minus keydowns — were both dispatch-to-the-app approaches; this request specifically wants no
dispatch involved at all, so both were dropped rather than adapted.)

**Note on the global name**: everything here lives on `window.__RW` (the double-underscore prefix
avoids colliding with any global the host page might already have). Inside this project's own
source files it's aliased to a shorter local `const RW = window.__RW`, but that alias is only
visible inside each module's own closure — **from the DevTools console itself, you must type
`__RW.`, not `RW.`** (a bare `RW` is not defined globally and throws `ReferenceError: RW is not
defined`). Every console command in this README uses the correct `__RW.` form.

The only annotation-state write anywhere in this build is `annotationState.currentTag` (tag
selection, above) — nothing here stages annotations, drawings, or edits of any kind. Middle-drag
pan is a distinct, deliberate exception to that: it writes `scrollLeft`/`scrollTop` on a page
viewport element, never on anything under `annotationState`.

## Tool settings: drill in, apply a value, re-arm the tool

Wand, wrap, and mline each have their own dedicated settings in the app. Their real DOM identity
was confirmed live (via `__RW._toolSettingsDiagnose()`, below) and a write-back test on a real
job — plain `.value` assignment plus a synthetic `input` event took effect immediately and
persisted, no framework workaround needed. Every param under a tool is discovered **live**, by id
prefix, every time you drill in — nothing is hardcoded beyond the three prefixes below, so ranges
stay accurate if the app's own sliders ever change, and any control the app adds later under the
same prefix becomes usable automatically, no update needed here:

| Tool | Confirmed id prefix | Params found live under it (this round) |
|---|---|---|
| `wand` | `magic-wand-` | `tolerance` (0–255), `detail` (0–15, step 0.5), `padding` (-20–20) |
| `wrap` | `shrink-wrap-` | `padding` (0–50), `smoothing` (0–50, step 0.5), `polygon-mode` (checkbox) |
| `mline` | `ribbon-` | `width` (≥1, no confirmed max), `anchor` (dropdown, options read live) |

**Two ways to reach a param, both lead to the same next step:**

- **Type `<tool>.`** (e.g. `wand.`) from anywhere, active or not, to drill into that tool's
  settings — the same dropdown switches to listing its parameters, each showing its live current
  value (and range, for numeric ones).
- **Or just type the param name bare** (e.g. `tolerance`, no `wand.` prefix) whenever that tool is
  already the one currently armed — it's blended straight into the ordinary autocomplete
  (highlighted in the same settings color), right alongside every other command. This is
  **additive, not exclusive**: everything else you could already type — switching to a totally
  different tool, tag search, anything — still works exactly the same while a tool with settings
  is active. Nothing is blocked; the active tool's own params are just an extra, faster option.

**What happens next depends on the param's type:**

- **Numeric** (`tolerance`, `padding`, `width`, …): the input becomes `wand.tolerance = ` and stays
  focused (unlike every other mode here, this one deliberately does **not** clear/blur) so you can
  type a number directly. Press **Enter** to apply — clamped to the live range, written to the
  real control, `input`+`change` dispatched, tool re-armed.
- **Checkbox** (`polygon-mode`): picking it **flips it immediately** — off becomes on (or back),
  re-arms the tool, no extra typing needed. Picking it again flips it back.
- **Select** (`anchor`): picking it immediately shows a **second, numbered list** of its live
  options — e.g. `1. Left`, `2. Center`, `3. Right` — read straight from the real `<select>`, never
  hardcoded, starting highlighted on whichever option is *actually* current right now. Type a
  number *or* the option's own name (a prefix is enough — `ri` matches `Right`) to filter, then
  **Enter/Space/click** applies whichever's highlighted — no separate "type a value" step, since
  picking the option *is* the value. **Tab live-previews each option on the real page as you
  cycle** (Shift+Tab cycles the other way, wrapping at both ends) — genuinely applied, not just
  filled into the input, so you can compare states before committing. The option list stays open
  the whole time you're tabbing.

**Escape** at any point cancels cleanly. For a numeric or checkbox param it always leaves the real
control completely untouched. For a select param it's slightly different, on purpose: if you never
pressed Tab, nothing was ever touched, same as the others — but if you *did* Tab through a few
states to preview them, Escape puts it back to whatever was genuinely current before you started
previewing, not whichever state you happened to land on last.

**Confirmed vs. still-hedged**: the write-back technique (`.value` + `input`/`change` events) was
tested live specifically against `magic-wand-tolerance`, and it worked — the app picked up the
change and it stuck. Applying `wand.tolerance` therefore reports without a hedge. Every other
control uses the identical technique but hasn't been individually write-tested the same way, so
their status messages still say "confirm it actually applied," this project's standing convention
for anything not fully live-confirmed.

### `__RW._toolSettingsDiagnose(filter)` — the read-only probe this was built from

A one-shot, console-only diagnostic — same convention as `__RW._panDiagnose()` above, manual and
read-only, never touching `annotationState` or the status line. It reports two things separately:
every `[data-tool]` element on the page (the same selector round 2's live inspection used to
discover the `ribbon` tool), and every settings control anywhere on the page (range/number/
checkbox inputs, selects) with its live value, min/max/step, name, title, and aria-label. Pass a
string to narrow the tool list to a case-insensitive substring match on `data-tool`, e.g.
`__RW._toolSettingsDiagnose('wand')`. Still useful for discovering a control this build doesn't
know about yet, or for confirming the table above hasn't drifted.

## App built-in keymap (reference, extracted from their JS)

**This is the single most load-bearing reference on this branch** — every native command in
`RW._cmdTable` is a 1:1 mapping onto these letters. Extracted from the app's own JS; **it drifts
— confirmed live** (see below), so re-verify against a real page (`document.querySelectorAll
('[data-tool]')`, and `annotationState.reservedKeys` for the full reserved-letter list) before
trusting this table blindly.

```
Modes: A pan, S select, D draw, F label, G crop, M mirror
Tools (draw mode): Q linear, W bounding box, E count, R polygon, T polyline, Y circle, U revision cloud
K magic wand (tolerance/detail sliders), X wrap (shrink-wrap), V void mode, P ribbon
(constant-width path — click centerline points, drag to measure width; added to the app after
this table was first written, confirmed live), 1-9/0 tag select+draw, Space temp pan
Ctrl/Cmd +/-/0 zoom, Ctrl+scroll zoom
Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo
Delete/Backspace delete selected, Ctrl+C/V copy/paste, Ctrl+Shift+V mirror paste
Double-click finishes polygon/polyline
Arrows nudge selection 1px, Shift+arrows 10px
```

Note: `Space` temp pan is the app's own native gesture, listed here for completeness, but this
build's global typing-capture absorbs a bare `Space` into the command input rather than letting it
reach the app — see "Middle-mouse hold-drag pans" above for the replacement.

**A structural note on shadowing**: any workbench listener registered in the capture phase with
`stopPropagation()` fully shadows the app's own same-key shortcut — this is how the command
line's global auto-capture works (it must consume a keystroke before the app's own listener sees
it, or dispatch it there itself via a marked synthetic event). Blurring the command input is the
only way to reach an app shortcut directly while this build is loaded.

## Boundaries

- Nothing auto-draws or auto-submits annotations.
- The activity tracker (`/analytics/api/events/`) is read-only observed, never spoofed.
- This is a bridge tool, not a replacement for engineering review.
- Every feature dispatches a synthetic key to make the app switch its own tool/mode — **except**
  middle-mouse pan, which writes `scrollLeft`/`scrollTop` on a page viewport element directly
  (deliberately, since dispatching the app's own pan key would switch tools, which panning must
  not do). It never touches `annotationState` or anything under it. See CLAUDE.md's Constraints
  section for the full reasoning.
