# Draggable command-line panel

## Summary

Make the `#rw-panel` command-line overlay movable by dragging its header strip with the left mouse button. Once dragged, the panel stays where the user put it (clamped fully on-screen) and window resizes no longer re-center it. Position is per-page only — each fresh paste of the loader re-pins to bottom-center. A console escape hatch (`__RW._cmdResetBar()`) re-pins on demand.

## Behavior changes

- **Drag handle = the panel header strip** (the row containing the collapse caret, "Command Line" title, and RW: ON/OFF button). Dragging works from the title or empty header space; presses starting on the caret (`#rw-collapse`) or the RW button (`#rw-enable`) are left entirely to their own click handlers.
- **Click vs. drag threshold (3px, tunable).** A sub-threshold press does nothing new — the existing click-to-collapse behavior on the header is unchanged. A real drag past the threshold moves the panel and then **swallows the one `click` that fires on release**, so dragging doesn't accidentally collapse/expand the panel.
- **Left button only.** Middle/right presses on the header are untouched (middle-drag pan already ignores `#rw-panel` via `panInOurUi`).
- **Anchoring conversion.** The panel is currently bottom-anchored (`left`/`bottom`/`width` from `RW._cmdRepositionOverlay`). On the first real drag it converts to top-anchored (`style.top` set from the live rect, `style.bottom` cleared) and moves via `left`/`top` deltas.
- **Clamping.** Position is clamped to the viewport so the whole panel is always fully visible (confirmed choice).
- **No re-centering after a move.** Once `RW._cmdBarUserMoved` is set, `RW._cmdRepositionOverlay` (load/resize/console-accessor callers) only applies `RW._cmdBarWidth` and clamps the current position back into the viewport — it never re-centers. `__RW._cmdResetBar()` clears the flag and re-pins bottom-center.
- **No persistence** across pages/reloads (confirmed choice — no localStorage into the host app's origin).

## Implementation (all in `rw_cmdline.js`, near the overlay-positioning section)

- New tunables/state: `RW._cmdBarDrag = true` (subordinate disable flag), `RW._cmdBarThreshold = 3`, `RW._cmdBarUserMoved = false`, module-private `barDragState = { active, dragging, startX, startY, rect, header, suppressClick }`.
- New functions following the pan feature's established pointer-event idiom (document-level capture `pointermove`/`pointerup`/`pointercancel` listeners added per drag and really removed on teardown; `setPointerCapture` on the header; teardown on `lostpointercapture`, `window` `blur`, and `e.buttons` clearing the left bit): `barOnPointerDown`, `barOnPointerMove`, `barOnPointerUp`, `barOnClick` (capture-phase, on the panel), `barAddListeners`/`barRemoveListeners`, `RW._cmdClampBar`, `RW._cmdResetBar`.
- `barOnPointerDown`: gated on `RW._cmdBarDrag`; requires `e.button === 0`; walks up from `e.target` — aborts if it hits `#rw-collapse` or `#rw-enable`; the drag target is the panel's header identified structurally (the panel's `firstChild`, no `id` — post-retrofit layout; pre-retrofit children all have ids and are excluded). Lazily sets `cursor:move` + `touch-action:none` on the header (drag affordance).
- `barOnPointerMove`: applies deltas only past the Manhattan threshold; first crossing converts anchoring (top from rect, clear bottom) and sets header cursor to `grabbing`; writes clamped `style.left`/`style.top` each move.
- `barOnPointerUp`/teardown: if a real drag happened, set `RW._cmdBarUserMoved = true`, set `suppressClick`, restore the header cursor; schedule a `setTimeout(0)` that clears `suppressClick` in case no click follows.
- `barOnClick` (capture on `#rw-panel`): if `suppressClick`, `stopPropagation()` + `preventDefault()` once and clear the flag — in a real browser the capture phase runs before the header's `onclick`, so the post-drag release can't toggle collapse; sub-threshold presses never set the flag.
- `RW._cmdRepositionOverlay` gains: (1) `panel.style.top = 'auto'` whenever it re-pins (prevents double-anchoring a previously dragged panel); (2) an early `RW._cmdBarUserMoved` branch that applies `RW._cmdBarWidth` then clamps instead of re-centering.
- `RW._overlayDiagnose` panel style report gains `top`.
- Attach: one delegated `pointerdown` (capture) + one `click` (capture) listener on `#rw-panel`, registered at module load right after the resize-listener registration (guarded — `#rw-panel` always exists in real usage, created by `rw_core.js`; no-op otherwise).
- Explicitly **not** gated on `RW.enabled`: dragging the panel is the panel's own chrome, same category as the collapse toggle which already works while RW is off. Only `RW._cmdBarDrag` gates it.
- No `annotationState` reads/writes, no synthetic key dispatches, no menu-positioning changes (the dropdown is repositioned from the input's rect on every render, so it follows the panel automatically).

## Test cases (`verify_cmdline.js`, new blocks)

Harness additions needed: drag-test fixtures (`#rw-panel` with `_rect` + pinned `style.left`/`bottom` like `_cmdRepositionOverlay` would set; header with `#rw-collapse` and `#rw-enable` children; body child for the non-header-area case), attached to `doc.body`. Existing default harness (no `#rw-panel`, no canvas) keeps every current test passing — the drag attach and reposition both no-op.

1. Press+move past threshold sets `style.left`/`style.top` from deltas and clears `style.bottom` (bottom→top anchoring conversion).
2. Clamping at all four viewport edges (drag far left/up clamps ≥ 0; far right/down clamps ≤ `innerWidth/Height − rect`).
3. Sub-threshold press+release: no style mutation, the click is **not** consumed (collapse toggle unaffected).
4. Presses starting on `#rw-collapse` or `#rw-enable`, and presses on the panel body/input area, never start a drag even with movement.
5. `button: 1` (middle) press on the header never starts a drag.
6. First real drag sets `RW._cmdBarUserMoved`; a subsequent `RW._cmdRepositionOverlay()` call (resize) keeps the user's position (clamped), never re-centers; `_cmdBarWidth` still applies in that branch.
7. `RW._cmdResetBar()` clears the flag and re-pins (re-centers over canvas).
8. Post-drag release click is consumed exactly once (`_propStopped`/`defaultPrevented` asserted on the event `_fire` returns); the next click is not consumed; with no click following, the fake-timer `setTimeout(0)` clears `suppressClick` (a later click survives).
9. Teardown paths — `pointerup`, `pointercancel`, `lostpointercapture`, window `blur`, and a move with the left `buttons` bit cleared each end the drag, and a second drag is not double-driven (listener removal is real, matching the pan tests).
10. `RW._cmdBarDrag = false` disables the whole feature.
11. Regression: `RW._cmdRepositionOverlay` clears `style.top` when re-pinning (no double-anchor stretch), asserted on a previously top-anchored panel.

**Verification commands:** `node --check rw_cmdline.js`; `node verify_cmdline.js` (existing 406 assertions must still pass, plus the new blocks); `bash build_loader.sh` (rebuilds `console_loader.js`, runs `node --check` on it). Spot-check at least one guard per the repo's convention (e.g. remove the `RW._cmdBarUserMoved` early-branch and confirm the resize-keeps-position test fails, then restore).

## Docs

- **README.md**: update the overlay section (draggable header, click-vs-drag threshold, clamp, stays-put-on-resize, `__RW._cmdResetBar()`, per-page reset) and the utility-key list if it enumerates panel interactions.
- **CLAUDE.md**: add a new round entry describing the feature, the tests added, the two confirmed choices (no persistence, clamp fully on-screen), and the not-live-verified caveats.

## Assumptions / defaults (recorded)

- Header-strip-only drag handle; left button only; threshold 3px; `RW._cmdBarDrag = true`.
- Not gated on `RW.enabled` (panel chrome, like the collapse toggle) — only the subordinate flag.
- No persistence across pages (confirmed); clamp fully on-screen (confirmed).
- Click suppression depends on real capture-phase ordering; the synthetic harness can only assert the consumption contract, not the ordering itself.

## Not live-verified (to note in CLAUDE.md)

- Real-page feel of the threshold and cursor affordances; whether touch dragging behaves (defensive `touch-action:none` included); that a drag ending on the header really doesn't collapse the panel (capture-phase suppression assumed correct, needs one live drag to confirm).
