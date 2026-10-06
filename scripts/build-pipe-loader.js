#!/usr/bin/env node
// Assembles console_loader_pipe.js, the paste-into-DevTools loader for the PIPING command line.
//
// Order matters: (1) wait for the page, (2) define the modules, (3) run loaderGuard (refuses a duct
// page, a page with native's own command line on, a page where the duct bar is already loaded...),
// and only then (4) install the panel scaffolding (rw_host/rw_panelux/rw_core) and (5) the shell.
// A refused page therefore gets no panel and no listeners at all, only a console message.
//
// The scaffolding files are the same ones the duct loader uses, concatenated unchanged.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'rw_pipe_cmdline.js');
const OUT = path.join(ROOT, 'console_loader_pipe.js');
const SHELL_MARKER = '// ===== src/pipe/pipe-shell.js =====';

// Pure: takes the text of dist/rw_pipe_cmdline.js, returns the text of console_loader_pipe.js (so the freshness
// check in verify_pipe_cmdline.js can rebuild it in memory and compare, with no file writes).
function buildPipeLoader(dist) {
const at = dist.indexOf(SHELL_MARKER);
if (at === -1) throw new Error('dist/rw_pipe_cmdline.js has no shell marker; rebuild it with scripts/build-pipe-dist.js');
const modulesPart = dist.slice(0, at).trimEnd();
const shellPart = dist.slice(at);

const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const HEADER = `/* Boon Command Line, PIPING build: console loader.
 * Usage: open a PIPING session page, F12 -> Console -> paste this entire block -> Enter.
 * Type a tool name (route, fitting, valve...) or an action (undo, zoomfit...) anywhere on the page.
 * Native's own "Command line" button must be OFF. Refuses to start on a duct page.
 * Paste again after each page navigation. */
(async function(){
  function ready(){
    return !!document.getElementById('graph-session-root')
        && !!document.getElementById('graph-canvas-stage')
        && typeof __graphDebug !== 'undefined'
        && document.querySelector('[data-tool]');
  }
  for (let i=0; i<60 && !ready(); i++) await new Promise(r=>setTimeout(r,500));
  if (!ready()){ console.warn('[RW] page not ready after 30s (is this a graph session page?) - try pasting again once the drawing renders'); return; }
  await new Promise(r=>setTimeout(r,600)); // let the canvas settle

`;

const GUARD = `
  // ===== loader guard (src/core/pipe-table-core.js loaderGuard) =====
  const __guard = __m_pipe_table_core.loaderGuard(
    __m_pipe_host.createPipeHost({ doc: document, win: window, ids: __m_pipe_tables.PIPE_PAGE_IDS }).readPageFacts()
  );
  if (!__guard.ok){ console.warn('[RW] ' + __guard.message); return; }

`;

const FOOTER = `

  console.log('[RW] piping command line ready: type a tool (route, fitting, valve...) or an action (undo, zoomfit...) anywhere on the page. Space repeats the last tool or returns to select. Keep native\\'s own Command line OFF.');
})()
`;

const parts = [HEADER, '// ===== modules =====\n', modulesPart, '\n', GUARD];
for (const name of ['rw_host.js', 'rw_panelux.js', 'rw_core.js']) {
  parts.push(`;\n// ===== ${name} =====\n`, read(name), '\n');
}
parts.push(';\n', shellPart, FOOTER);

return parts.join('');
}

if (require.main === module) {
  const out = buildPipeLoader(fs.readFileSync(DIST, 'utf8'));
  fs.writeFileSync(OUT, out);
  console.log(`built console_loader_pipe.js (${out.length} bytes)`);
}

module.exports = { buildPipeLoader, DIST, OUT };
