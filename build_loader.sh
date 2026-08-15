#!/usr/bin/env bash
# Rebuild console_loader.js from source modules after editing them.
set -euo pipefail
cd "$(dirname "$0")"

OUT=console_loader.js

cat > "$OUT" <<'HEADER'
/* Boon Region Workbench — console loader.
 * Usage: F12 -> Console -> paste this entire block -> Enter.
 * Installs the full workbench (regions, mask tools, undo, commit, helpers).
 * Paste again after each page navigation. Nothing persists server-side until you Save. */
(async function(){
  function ready(){
    return typeof annotationState !== 'undefined'
        && annotationState.annotations
        && document.getElementById('pdf-canvas')
        && document.getElementById('annotation-canvas')
        && document.getElementById('right-rail-content');
  }
  // wait for app (up to 30s) — safe to paste immediately on page load
  for (let i=0; i<60 && !ready(); i++) await new Promise(r=>setTimeout(r,500));
  if (!ready()){ console.warn('[RW] app not ready after 30s — try pasting again once the page renders'); return; }
  await new Promise(r=>setTimeout(r,600)); // let the canvas settle

HEADER

FIRST=1
# rw_panelsections.js must stay after every module that uses the
# `#rw-pick`-parentNode idiom (i.e. after all of them) and before any module
# that calls RW.panelSection (currently just rw_elbow.js).
for f in rw_panelux.js rw_install.js rw_masktools.js rw_stable.js rw_undo.js rw_commit.js rw_brushpoly.js rw_healinterior.js rw_snap.js rw_textdetect.js rw_wallspan.js rw_panelsections.js rw_elbow.js; do
  if [ $FIRST -eq 0 ]; then printf ';\n' >> "$OUT"; fi
  FIRST=0
  echo "// ===== $f =====" >> "$OUT"
  cat "$f" >> "$OUT"
  printf '\n' >> "$OUT"
done

cat >> "$OUT" <<'FOOTER'

  console.log('[RW] workbench ready: ' + __RW.regions.filter(r=>r.included).length + ' regions. Keys: P pick, K cut, B rect, N poly, J brush, A add, W walls, C pipe, L elbow, ` undo.');
})()
FOOTER

node --check "$OUT" && echo "rebuilt $OUT ($(wc -c < "$OUT") bytes) — syntax OK"
