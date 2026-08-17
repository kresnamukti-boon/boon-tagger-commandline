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

  const rail = document.getElementById('right-rail-content');
  const old = document.getElementById('rw-panel'); if (old) old.remove();
  const panel = document.createElement('div');
  panel.id = 'rw-panel';
  panel.style.cssText = 'border-top:1px solid #999;margin-top:8px;padding:8px;font-size:12px;max-height:45%;overflow-y:auto;';
  panel.innerHTML = '<div id="rw-list"></div>'; // title bar + killswitch added by rw_panelux.js's retrofit()
  if (rail) rail.insertBefore(panel, rail.firstChild);

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
