# Boon Tagger Tools

Client-side workflow enhancers for the Constructions Tagger annotation platform
(constructions-tagger-web.onrender.com). Pasted into the DevTools console of the live
annotation page — no server, no build step, nothing persists until you click the app's own
**Save**. Everything lives in the page until reload/navigation, then must be re-injected.

## Files & load order

Each module is a versioned IIFE gated on the previous module's version flag, so this order is
load-bearing, not cosmetic. `console_loader.js` concatenates all of them, in order.

1. **rw_panelux.js** — loads first, before anything else exists. Collapsible panel UI, and the
   **RW: ON/OFF** master killswitch that gates every handler the later modules register.
2. **rw_install.js** — core region engine. Flood-fills the drawing canvas into wall/background,
   labels enclosed areas as candidate regions, region list panel, **Pick** mode, **Merge**/**Cut**.
3. **rw_masktools.js** — unified **Rect** mask tool (block/open/add, see below), the global area
   floor input + **Relabel** button, the **Walls (W)** diagnostic overlay, live area hint while
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

**To rebuild** after editing any `rw_*.js` source module:
```bash
bash build_loader.sh          # console_loader.js
bash build_userscript.sh      # region-workbench.user.js (Tampermonkey build, not in active use)
```

## Injection

1. Navigate to the Constructions Tagger annotation page.
2. Press **F12** → **Console** tab.
3. Paste the entire contents of `console_loader.js`, press **Enter**.
4. The workbench installs automatically once the page canvas is ready (up to ~30s).

Paste again after each page navigation — nothing persists server-side until you manually click
**Save** in the app.

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
| `W` | cycle the wall diagnostic overlay (red wall → cyan floodable space → off) |
| Shift (hold, placing a Poly2 vertex) | bypass vertex snap for that click |
| `` ` `` (backtick) | undo last mask edit (block/open/poly/brush/cut/merge/heal) |
| `Escape` | cancel current workbench mode / clear in-progress poly vertices |

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

## Boundaries

- Nothing auto-draws or auto-submits annotations. All output is staged through
  the app's own event handlers as unsaved edits; Save is always manual.
- The activity tracker (`/analytics/api/events/`) is read-only observed, never spoofed.
- This is a bridge tool, not a replacement for engineering review — it stages candidate work
  inside the app's existing Save/EditHistory flow, nothing more.
