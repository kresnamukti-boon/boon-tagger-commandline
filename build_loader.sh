#!/usr/bin/env bash
# Rebuild console_loader.js from source modules after editing them.
# NATIVE-TOOLS-ONLY BRANCH: this loader installs only the command line and
# its native-app-tool dispatch/tag search — no region/mask/pipe/elbow
# workbench. See CLAUDE.md's "A dedicated branch" section.
set -euo pipefail
cd "$(dirname "$0")"

OUT=console_loader.js

cat > "$OUT" <<'HEADER'
/* Boon Command Line (native-tools-only build) — console loader.
 * Usage: F12 -> Console -> paste this entire block -> Enter.
 * Installs only the AutoCAD-style command line: type a native app tool's
 * name/alias (or #tag) to dispatch it. No region workbench on this build.
 * Paste again after each page navigation. */
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
for f in rw_panelux.js rw_core.js rw_cmdline.js; do
  if [ $FIRST -eq 0 ]; then printf ';\n' >> "$OUT"; fi
  FIRST=0
  echo "// ===== $f =====" >> "$OUT"
  cat "$f" >> "$OUT"
  printf '\n' >> "$OUT"
done

cat >> "$OUT" <<'FOOTER'

  console.log('[RW] command line ready: ' + __RW._cmdTable.length + ' commands, ' + (__RW._cmdTagList ? __RW._cmdTagList.length + ' tags' : 'no tags detected') + '. Type a tool name (or # for a tag) anywhere on the page.');
})()
FOOTER

node --check "$OUT" && echo "rebuilt $OUT ($(wc -c < "$OUT") bytes) — syntax OK"
