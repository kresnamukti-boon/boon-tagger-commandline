// RW core — NATIVE-TOOLS-ONLY BRANCH: minimal bootstrap replacing rw_install.js's
// scaffolding. Creates window.__RW, a bare #rw-panel/#rw-list for rw_cmdline.js
// to mount into, and RW._commitStatus. No region/mask/annotation machinery —
// see CLAUDE.md's "A dedicated branch" section for why this branch exists.
//
// Load after rw_panelux.js, before rw_cmdline.js.
(function(){
  if (window.__RW && window.__RW.vcore) return 'RW core already installed';

  const RW = window.__RW = window.__RW || {};
  RW.vcore = true;
  RW.enabled = (window.__RWgate ? window.__RWgate.enabled : true);

  const old = document.getElementById('rw-panel'); if (old) old.remove();
  const panel = document.createElement('div');
  panel.id = 'rw-panel';
  // Fixed bottom-center overlay pinned to the canvas viewport (positioned by
  // rw_cmdline.js's RW._cmdRepositionOverlay, which also stays pinned on
  // resize). Appended to document.body, not the side rail, so it neither
  // scrolls nor pans with the drawing. z-index is set to the 32-bit signed
  // max so no app-owned element (the annotation canvas wrapper, the right
  // rail, toolbars, modals) can stack above it — a plain high-but-finite
  // value like 99990 was occluded on a real job once the panel left the
  // rail and became a sibling of the app's own content.
  panel.style.cssText = 'position:fixed;z-index:2147483647;background:#222;border:1px solid #666;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.5);padding:8px;font-size:12px;color:#eee;';
  panel.innerHTML = '<div id="rw-list"></div>'; // title bar + killswitch added by rw_panelux.js's retrofit()
  document.body.appendChild(panel);

  RW._commitStatus = function(msg){
    const el = document.getElementById('rw-commit-status');
    if (el) el.innerText = msg;
    console.log('[RW]', msg);
  };
  if (panel && !document.getElementById('rw-commit-status')){
    const s = document.createElement('div');
    s.id = 'rw-commit-status';
    s.style.cssText = 'font-size:11px;opacity:0.8;margin-bottom:4px;min-height:14px;';
    panel.insertBefore(s, document.getElementById('rw-list'));
  }

  return 'RW core up: minimal panel scaffolding installed';
})()
