# Boon Tagger Tools

Client-side workflow enhancers for the Constructions Tagger annotation platform
(constructions-tagger-web.onrender.com). Injected via OpenCLI `browser eval`
into the live Chrome session. Nothing persists on the server; everything lives
in the page until reload/navigation, then must be re-injected.

## Files & load order

1. **rw_install.js** — Region Workbench core (v2)
   - Linework-based region segmentation of the page (flood-fill between drawing lines)
   - Color overlay of regions, region list panel in the right rail
   - Pick mode: select regions by clicking on canvas
   - Merge / Cut for curating region boundaries

2. **rw_masktools.js** — Mask editing (v2.1, needs rw_install)
   - Block (rect) / Open (erase) / Poly (freeform) tools that edit the extraction mask
   - Auto-relabel after each edit, preserving groups by centroid match
   - Use to remove text/dimension artifacts and heal false splits

3. **rw_stable.js** — Pan/zoom-stable previews (v2.2, needs rw_masktools)
   - Stores in-progress mask geometry in normalized page coords
   - Previews stay glued to the drawing while panning/zooming

4. **rw_undo.js** — Undo system (v2.3, needs rw_stable)
   - Poly: Backspace removes last vertex; first Escape clears vertices, second closes tool
   - Block/Open/Poly-commit/Cut/Merge: snapshot undo stack, backtick (`) or panel button

5. **rw_healinterior.js** — Interior noise healing (v3, needs rw_undo)
   - "Heal Interior?" previews wall pixels inside the Pick-mode selection that are safe to erase
     (text/hatch/dimension marks) without merging the region into a neighbor or an existing
     annotation; "Apply Heal" commits it (undo-tracked like other mask edits)
   - "Edit Heal (Brush)" lets you manually correct the preview: drag to mark more area as noise,
     Shift+drag to protect/un-mark an area the detector got wrong; Tab+scroll resizes the brush
   - `hole≤` panel input tunes how big a non-included neighboring area can be before it's
     protected rather than treated as negligible noise
   - `barrier≥` panel input protects a thick boundary line from being partially eaten through
     its middle — set it to roughly the line's full pixel thickness, not half. Protection only
     expands inward from the line's outer face (the side facing a different region/exterior),
     never from the side facing the selected region's own interior, so half the thickness isn't
     enough

6. **rw_snap.js** — Poly2 vertex snapping (v2.7, needs rw_brushpoly)
   - Poly2 vertices snap to nearby line endpoints/intersections detected on the wall bitmap
   - Hold Shift while placing a vertex to bypass snapping; panel "Snap On/Off" toggles it globally

7. **rw_textdetect.js** — Text/hatch density overlay (v2.9, needs rw_snap)
   - "Text? (density)" panel toggle highlights likely text/dimension areas across the whole
     page for manual review — detection only, never edits the mask
   - `cell`/`min` panel inputs tune the density threshold live

## Injection

Open the annotation page, then paste the full `console_loader.js` into the browser console:

1. Navigate to the Constructions Tagger annotation page (`constructions-tagger-web.onrender.com`)
2. Press **F12** to open DevTools, then click the **Console** tab
3. Copy the entire contents of `console_loader.js` and paste into the console, then press **Enter**
4. The workbench installs automatically once the page canvas is ready (up to 30 sec)

Paste again after each page navigation. Nothing persists server-side until you manually click **Save** in the app.

**To rebuild `console_loader.js`** after editing source modules:
```bash
bash build_loader.sh
```

## Keymap (workbench)

| Key | Action |
|---|---|
| P | toggle Pick mode (click regions on canvas) |
| K | Cut mode (drag line across a region to split) |
| B | Block mode (drag rect to paint wall / remove artifacts) |
| O | Open mode (drag rect to erase walls / heal splits) |
| N | Poly mask mode (click vertices, double-click to close) |
| Shift (hold, while placing a poly vertex) | bypass vertex snap for that click |
| Backspace (in poly) | remove last poly vertex |
| Escape (in poly) | clear vertices first, then close tool |
| ` (backtick) | undo last mask edit (block/open/poly/cut/merge) |
| Escape | cancel current workbench mode |

Merge has no hotkey (app uses M for mirror) — select 2+ regions, click Merge in panel.

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

## Boundaries

- Nothing auto-draws or auto-submits annotations. All output is staged through
  the app's own event handlers as unsaved edits; Save is always manual.
- The activity tracker (/analytics/api/events/) is read-only observed, never spoofed.
