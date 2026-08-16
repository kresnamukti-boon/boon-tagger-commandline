# Boon Tagger Tools

Client-side workflow enhancers for the Constructions Tagger annotation platform
(constructions-tagger-web.onrender.com). Pasted into the DevTools console of the live
annotation page — no server, no build step, nothing persists until you click the app's own
**Save**. Everything lives in the page until reload/navigation, then must be re-injected.

Two loader builds: the everyday **`console_loader.js`** (built by `build_loader.sh`), and an
opt-in **`console_loader_ocr.js`** (built by `build_loader_ocr.sh`) that additionally bundles
`rw_ocr.js` — see "OCR-assisted reference naming" below. The everyday loader never includes it,
so annotators who don't need it stay on a smaller, fully offline script.

## Files & load order

Each module is a versioned IIFE gated on the previous module's version flag, so this order is
load-bearing, not cosmetic. `console_loader.js` concatenates all of them, in order.

1. **rw_panelux.js** — loads first, before anything else exists. Collapsible panel UI, and the
   **RW: ON/OFF** master killswitch that gates every handler the later modules register.
2. **rw_install.js** — core region engine. Flood-fills the drawing canvas into wall/background,
   labels enclosed areas as candidate regions, region list panel, **Pick** mode, **Merge**/**Cut**.
3. **rw_masktools.js** — unified **Rect** mask tool (block/open/add, see below), the global area
   floor input + **Relabel** button, the **Walls (O)** diagnostic overlay, live area hint while
   dragging.
4. **rw_stable.js** — pan/zoom-stable preview rendering; no user-facing controls of its own.
5. **rw_undo.js** — snapshot undo stack (backtick) shared by every mask edit, plus poly vertex
   undo (Backspace).
6. **rw_commit.js** — **Commit** button: traces selected region contours, smooths them, and
   stages them as real pending annotations through the app's own `annotationState`/`editHistory`.
   The only module that writes annotation state.
7. **rw_healinterior.js** — **Heal Interior?** / **Apply Heal** / **Edit Heal (Brush)** for
   cleaning text/hatch noise out of a selected region before committing it (see below).
8. **rw_brushpoly.js** — **Poly2** (freeform vertex) and **Brush** (freehand stroke) mask tools;
   owns the **Add ⊕ (A)** toggle.
9. **rw_snap.js** — Poly2 vertex snapping to line endpoints/junctions and region outlines (see
   below); **Snap On/Off** panel toggle.
10. **rw_textdetect.js** — **Text? (density)** whole-page detection-only overlay (see below).
    Currently hidden in the panel along with **Relabel** and **Add ⊕** (not removed — see
    "Hidden controls" below).
11. **rw_wallspan.js** — **Pipe (C)** / **Trace** / **Commit Pipe** for annotating piping
    centerlines as a fixed-width path (see below) — deliberately doesn't trace pixels, since the
    rest of the toolset only handles enclosed areas and pixel-tracing a pipe's actual linework
    turned out to be too fragile against text/fittings crossing the line.
12. **rw_panelsections.js** — reorganizes the panel into labelled sections (REGIONS / MASK TOOLS /
    HEAL / PIPE / FITTINGS / VIEW) by relocating every earlier module's controls by id; purely
    cosmetic, no tool behavior changes. Must load after every module above (so their controls
    already exist to move) and before **rw_elbow.js** (so it can mount into the FITTINGS section).
13. **rw_elbow.js** — **Elbow (L)** / **Commit Elbow** for annotating elbow pipe fittings: drag a
    box (or click-click-click + double-click a tighter polygon region) around the fitting and it
    traces the real drawn linework inside it (see below).
14. **rw_ocr.js** — *OCR loader variant only, not in `console_loader.js`.* Adds an OCR button to
    the app's own reference-naming dialog (see "OCR-assisted reference naming" below).

**To rebuild** after editing any `rw_*.js` source module:
```bash
bash build_loader.sh          # console_loader.js
bash build_loader_ocr.sh      # console_loader_ocr.js (OCR variant)
```

## Injection

1. Navigate to the Constructions Tagger annotation page.
2. Press **F12** → **Console** tab.
3. Paste the entire contents of `console_loader.js`, press **Enter**.
4. The workbench installs automatically once the page canvas is ready (up to ~30s).

Paste again after each page navigation — nothing persists server-side until you manually click
**Save** in the app.

Working in reference mode (`?mode=reference`) and want OCR-assisted naming? Paste
`console_loader_ocr.js` instead of `console_loader.js` — same steps otherwise.

## Mask action modes (Rect / Poly2 / Brush)

Every mask tool shares one 3-state action, shown as a symbol on its button (`−`/`+`/`⊕`):

| State | Effect | Key |
|---|---|---|
| **block** (default) | paint wall — add a split inside an existing enclosed area | — |
| **open** | erase wall — heal a false split | — |
| **add** | carve a brand-new region out of empty whitespace | `A` toggles block↔add |

`Shift+B` / `Shift+N` / `Shift+J` cycle all three states (block → open → add → block) for
Rect/Poly2/Brush respectively.

## Keymap (workbench)

| Key | Action |
|---|---|
| `P` | toggle Pick mode (click regions on canvas to select) |
| `K` | Cut mode (drag a line across a region to split it) — **shadows the app's own Magic Wand**, see below |
| `B` | Rect mask mode (drag to paint/erase/add, per current action state) |
| `N` | Poly2 mask mode (click vertices, double-click to close, Backspace removes last vertex) |
| `J` | Brush mask mode (freehand stroke) |
| `A` | toggle Add mode on/off for Rect/Poly2/Brush |
| `Shift+B` / `Shift+N` / `Shift+J` | cycle block → open → add for that tool |
| `O` | cycle the wall diagnostic overlay (red wall → cyan floodable space → off) |
| Shift (hold, placing a Poly2 vertex) | bypass vertex snap for that click |
| `` ` `` (backtick) | undo last mask edit (block/open/poly/brush/cut/merge/heal) |
| `Escape` | cancel current workbench mode / clear in-progress poly vertices |
| `C` | Pipe mode — click a path along a pipe's centerline (see Pipe annotation below) |
| `L` | Elbow mode — drag a box, or click points + double-click to close a tighter region, around an elbow fitting (see Elbow fitting below) |

Merge has no hotkey (app uses `M` for mirror) — select 2+ regions, click **Merge** in panel.

### Heal Interior (`rw_healinterior.js`)

Scoped to the current Pick-mode **selection**, not the whole page — cleans up text/hatch/
dimension-mark noise inside a region before you commit it:

- **Heal Interior?** previews which wall pixels in the selection are safe to erase without
  merging into a neighboring region or an existing annotation.
- **Apply Heal** commits the preview (undo-tracked, like other mask edits).
- **Edit Heal (Brush)** manually corrects the preview: drag to mark more area as noise,
  Shift+drag to protect/un-mark an area the detector got wrong. Tab+scroll resizes the brush.
- `hole≤` tunes how big a neighboring non-included area can be before it's protected as a real
  feature rather than treated as negligible noise.
- `barrier≥` protects a thick boundary line from being partially eaten through its middle —
  **set it to roughly the line's full pixel thickness, not half.** Protection only expands
  inward from the line's outer face (the side facing a different region/exterior/annotation),
  never from the side facing the selected region's own interior.

### Poly2 vertex snapping (`rw_snap.js`)

Poly2 vertices snap to line endpoints/junctions detected on the drawing, and to any point along
an already-included region's outline (so a vertex can slide along a boundary's length, not just
its corners). Hold Shift to bypass for one click; **Snap On/Off** toggles both globally.

### Text? (density) (`rw_textdetect.js`)

Whole-page, detection-only overlay highlighting areas where line-endpoint/junction candidates
cluster more densely than real linework does (text glyphs are small and stroke-heavy). Never
edits the mask — a manual-review aid only. `cell`/`min` inputs tune sensitivity live.

### Pipe annotation (`rw_wallspan.js`)

For piping-centerline drawings. Deliberately does **not** trace the drawing's actual pixels —
early versions did, but pipes are routinely interrupted by text labels crossing them, leader
lines, and fitting symbols, and no amount of pixel-analysis tuning fully survives that. Instead:

- **Click** points along the pipe's visible centerline — first click is the start, each next
  click is a bend — the same way the existing Poly2 tool places vertices (optionally snapped to
  nearby line endpoints/junctions, Shift bypasses for one click).
- **Double-click** finishes the path — and immediately starts the next one, so you can keep
  drawing. `Backspace` drops the last point of the path you're currently drawing. `Escape` steps
  back one stage at a time: clears the in-progress path, then discards any finished-but-uncommitted
  segments, then exits Pipe mode.
- **Branching/connecting**: click a point on or near an already-finished pipe (this session's, or
  one already committed on the page) and it snaps onto that pipe's true centerline — a white/
  magenta ring marks the hit, with a cross for an end-to-end connection or a dot for a mid-span
  tee. This works even before you've clicked Commit Pipe.
- **Commit Pipe stages every finished segment from the session in one batch** — draw a main pipe
  plus any branches, then one click stages them (button label shows the resulting annotation
  count, e.g. `Commit 3 Pipes`). Each segment keeps the width it had when you finished it, so a
  branch can be a different diameter — there's no way to re-measure a segment's width after
  finishing it; discard it (Escape) and redraw if it's wrong.
- **Segments connected by snapping merge into one combined polygon** instead of staying separate
  shapes — draw a main pipe, then a branch that snaps onto it (mid-span tee or end-to-end), and
  Commit Pipe (and Trace) produce a single polygon covering the true outline of both. This only
  applies to this session's unstaged segments; connecting to a pipe already committed from an
  earlier action still snaps precisely but never rewrites that existing annotation. A merged
  annotation's notes record the segment/width breakdown instead of a single width, and — unlike a
  plain unmerged pipe — it can't be used as a snap target again in a future session. If a fitting's
  real linework is two separate strokes that don't actually connect after merging, the tool falls
  back to committing them separately rather than guessing.
- **Drag** anywhere (a real drag, not a click) measures the **width**: just the on-screen
  distance you drag, converted to a fixed value — drag across the pipe's drawn thickness once
  to set it, or type a value directly into the `width` panel input. It stays set across
  multiple pipes until you drag again or edit it, and this is a plain distance measurement, not
  anything read off the drawing's pixels.
- The tool then builds a constant-width ribbon along your clicked path — crossing a text label
  or a fitting symbol never changes its direction or width, since nothing about it depends on
  what's actually drawn in between the points you clicked.
- **Trace** previews the exact polygon(s) that Commit Pipe would stage — connected segments show
  as one merged outline — reusing the same commit pipeline every other tool uses (no new
  annotation type).
- Every bend along the path gets the same simple mitered/beveled corner, regardless of whether
  it's a slight direction change or a real elbow fitting — elbow fittings get their own
  **dedicated tool** instead (`L`, see "Elbow fitting" below), not a special vertex flag here. An
  earlier version of this tool had a middle-click-to-flag-an-elbow feature built in; it's been
  moved out, not deleted — see "Elbow fitting" below and `CLAUDE.md` for why.
- The measured width is recorded in the pipe's own **notes** field (e.g. `pipe width: 15.00 px`)
  — visible by selecting the annotation and checking its data panel. (An earlier version staged
  a second small "dimension line" tick shape alongside the ribbon for this; live testing found it
  didn't read as a dimension line at all — just an unlabeled, disconnected box — so it was
  dropped. See `CLAUDE.md` for the full account.)
- The `width` panel input shows real decimal precision (e.g. `0.63`), not rounded to a whole
  number — a genuinely sub-1px measurement no longer looks like the drag failed.
- No undo for a committed pipe specifically (only pre-commit: Escape/Backspace both work) — to
  remove a staged pipe, select it in the app and press Delete before you Save.

### Elbow fitting (`rw_elbow.js`)

A dedicated tool for annotating elbow pipe fittings — separate from the Pipe tool above, so a
plain bend in a pipe's path stays a plain mitered corner, and only an elbow you actually box gets
special handling.

- Press **`L`** to arm the tool, then either **drag a box** around the elbow fitting (a real drag,
  not a click — same 5px threshold every other drag tool uses), or **click a series of points and
  double-click to close** a tighter polygon region — useful when a rectangle would inevitably
  sweep in unrelated nearby linework.
- The tool reads the **actual drawn linework pixels** inside that box/region (not a shape inferred
  from where you dragged) at a higher resolution than the page's own mask (`res`), traces the
  **exact** pixel-grid boundary, then collapses any staircased diagonal or curved run into clean
  straight chords (Douglas-Peucker) — a real 90° corner stays sharp while only the staircase around
  it collapses. The traced shape is always clamped to stay **inside** the box/region.
- If the box/region contains more than one disconnected piece of linework, only the piece with the
  **most pixels** is traced and committed — not a merged/bridged union. If your fitting's real
  linework is genuinely two separate strokes (e.g. a double-line pipe wall), use a tighter color
  pick/tolerance so both strokes read as one connected piece, or draw a polygon region that
  excludes the piece you don't want.
- **`pts`** sets a target vertex count for the traced output polygon (`0` = auto).
- **Pick Color** / **Clear Color**: by default, detection uses a flat "how dark is this pixel"
  threshold. Click **Pick Color**, then click the fitting's actual ink, and detection switches to
  matching THAT color instead (within **`tol`**) — replaces the darkness test entirely, the
  **primary** control over what counts as ink. **Clear Color** goes back to the darkness threshold.
  (Only works against a live canvas — falls back to the darkness threshold if detection has to use
  the page's own coarser mask.)
- **`min px`**: minimum pixel-count for a piece to be a candidate at all — raise it to ignore a
  stray speck near the fitting; if every piece in the box/region is below this floor, detection
  refuses. **`width`**: enter the fitting's approximate line thickness (mask px) to seed `min px`
  from it. Defaults: `tol` 100, `min px` 1, `res` 100, `pts` 24, `width` 2.
- Once a box/region is drawn, **drag any corner (box) or vertex (region)** to reshape it — the
  outline and handles update immediately as you drag, and the traced highlight re-detects live
  (debounced) without needing to redraw from scratch.
- **`sub ann`** (on by default) excludes already-committed annotations from the detection.
- **Px?** cycles a debug overlay: source (thresholded, before piece-selection) → selected (the
  piece that gets traced/committed) → off.
- **Commit Elbow** stages the traced polygon; the active tunables are recorded in its notes.
- `Escape` backs out one step at a time: cancels an in-progress region first, then clears a
  committed box/region/trace, then exits the tool.
- History (rejected approaches, an in-pipe predecessor, a removed `fuse`/`hug`/`shrink` pipeline):
  see `CLAUDE.md`.

### OCR-assisted reference naming (`rw_ocr.js`, OCR loader variant only)

In the app's own reference mode (`?mode=reference`), reads the printed text inside a drawn
reference box and pre-fills the naming dialog's Name field — in-browser via Tesseract.js
(CDN-loaded on first use, nothing else leaves the browser), never auto-submitted.

- Ships only in `console_loader_ocr.js` — never bundled into the everyday `console_loader.js`.
- An **OCR** button appears next to the Name field once you draw a *new* reference box (not when
  editing an existing reference's name). Click it to recognize text in the active box and fill
  the Name field with the longest recognized line; the field always stays fully editable.
- **OCR Box** hides the dialog so you can drag a second, tighter box directly on the drawing —
  useful when the reference box itself has to be bigger than just the text. The dialog reopens
  automatically once you finish the drag; **Escape** cancels the drag without losing a box you'd
  already captured. This custom box sticks across repeat OCR clicks until you click **Clear
  Box**, redraw it, or draw a brand-new reference box (which retires it automatically).
- First OCR click on a page downloads Tesseract.js from a CDN — cached for the rest of the page
  session after that. If the page's CSP blocks it, the status line says so and names the
  console override (`RW._ocrTesseractSrc`) to repoint it.
- Never submits automatically — always review or edit the suggested name before clicking the
  app's own Save.

### Panel layout

The panel is organized into labelled sections — **REGIONS**, **MASK TOOLS**, **HEAL**, **PIPE**,
**FITTINGS**, **VIEW** — instead of one long unlabeled row of buttons. This is purely visual
(`rw_panelsections.js` relocates every other module's existing controls by id after they load);
no tool's behavior changes because of it.

### Hidden controls

**Relabel**, **Add ⊕**, and **Text? (density)** are currently hidden in the panel (not removed
— the underlying features and their keybindings still work) since they weren't useful for
current annotation work. Ask if you want any of these visible again.

## App built-in keymap (reference, extracted from their JS)

Modes: A pan, S select, D draw, F label, G crop, M mirror
Tools (draw mode): Q linear, W bounding box, E count, R polygon, T polyline, Y circle, U revision cloud
K magic wand (tolerance/detail sliders), X wrap, V void mode, 1-9/0 tag select+draw, Space temp pan
Ctrl/Cmd +/-/0 zoom, Ctrl+scroll zoom
Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo
Delete/Backspace delete selected, Ctrl+C/V copy/paste, Ctrl+Shift+V mirror paste
Double-click finishes polygon/polyline
Arrows nudge selection 1px, Shift+arrows 10px

**Known collision:** the workbench's own **K** (Cut mode) is bound on `document` in the
capture phase and calls `stopPropagation()`, so it fully shadows the app's **K = Magic Wand**
keyboard shortcut whenever the workbench is loaded and enabled. To use the app's own Magic
Wand tool, either click its "K Wand" button directly (mouse clicks aren't affected) or toggle
the workbench's **RW: ON/OFF** killswitch off first.

The wall diagnostic overlay is bound to **O**, not **W**, specifically because the app's own
**W = Bounding Box** tool would otherwise be fully shadowed the same way K is above.

## Boundaries

- Nothing auto-draws or auto-submits annotations. All output is staged through
  the app's own event handlers as unsaved edits; Save is always manual.
- The activity tracker (`/analytics/api/events/`) is read-only observed, never spoofed.
- This is a bridge tool, not a replacement for engineering review — it stages candidate work
  inside the app's existing Save/EditHistory flow, nothing more.
