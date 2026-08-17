# Boon Tagger Tools — Command Line (native-tools-only)

Client-side workflow enhancer for the Constructions Tagger annotation platform
(constructions-tagger-web.onrender.com). Pasted into the DevTools console of the live
annotation page — no server, no build step, nothing persists until you click the app's own
**Save**. Everything lives in the page until reload/navigation, then must be re-injected.

**This branch is a stripped-down development sandbox for the AutoCAD-style command line only.**
The full Region Workbench (region segmentation, mask tools, undo, Commit, Pipe, Elbow, OCR, …)
lives on `master` — this branch deletes all of it so the command line's native-app-tool dispatch
and tag search can be iterated on without dragging in ~240KB of unrelated tooling on every paste.
If you need any deleted module back, `git checkout master -- <file>` recovers it (or check out
`master` itself for the full build).

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
below for what each one does): draw-mode tools `linear` (`q`), `bbox` (`w`), `count` (`e`),
`polygon` (`r`), `polyline` (`t`), `circle` (`y`), `cloud` (`u`), `wand` (`k`), `wrap` (`x`),
`void` (`v`), `ribbon` (`p`), `tag1`-`tag9`/`tag0` (digits); mode switches `pan` (`a`), `select` (`s`), `draw`
(`d`), `label` (`f`), `crop` (`g`), `mirror` (`m`). Every native tool keeps its real app-keymap
letter as its alias — with no workbench commands left on this branch to collide with, nothing is
reserved. **`tag1`…`tag0` dispatch the app's own digit keys directly — they do not mean "the Nth
tag in the detected list."** That distinction matters: a real job showed the app's digit hotkeys
do **not** map to `#`-search tag-list order (see tag search below) — `tag1`…`tag0` are a
completely separate mechanism from selecting a searched tag.

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
| `Escape` | clear the command input, or close the autocomplete dropdown if it's open |
| `ArrowUp`/`ArrowDown` | move the autocomplete highlight |
| `Tab` | fill the input with the highlighted match without running it |

The only annotation-state write anywhere in this build is `annotationState.currentTag` (tag
selection, above) — nothing here stages annotations, drawings, or edits of any kind.

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

**A structural note on shadowing**: any workbench listener registered in the capture phase with
`stopPropagation()` fully shadows the app's own same-key shortcut — this is how the command
line's global auto-capture works (it must consume a keystroke before the app's own listener sees
it, or dispatch it there itself via a marked synthetic event). Blurring the command input is the
only way to reach an app shortcut directly while this build is loaded.

## Boundaries

- Nothing auto-draws or auto-submits annotations.
- The activity tracker (`/analytics/api/events/`) is read-only observed, never spoofed.
- This is a bridge tool, not a replacement for engineering review.
