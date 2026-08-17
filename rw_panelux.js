// RW v2.8 — collapsible panel + master killswitch.
// NATIVE-TOOLS-ONLY BRANCH: trimmed to drop workbench-teardown on disable
// (rw_install.js/rw_masktools.js/rw_brushpoly.js are gone on this branch) —
// see CLAUDE.md's "A dedicated branch" section.
// MUST be loaded FIRST (before rw_core). Wraps annotation-canvas's
// addEventListener so every handler registered by later modules auto-checks
// RW.enabled.
(function boot(){
  'use strict';

  // __RW doesn't exist yet (rw_core creates it). Gate lives on a separate
  // object until retrofit().
  if (!window.__RWgate) window.__RWgate = { enabled: true };
  const gate = window.__RWgate;

  /* ---------- auto-gate all annotation-canvas listeners ---------- */
  const ac = document.getElementById('annotation-canvas');
  if (ac && !ac.__RWrawAdd){
    ac.__RWrawAdd = ac.addEventListener;
    ac.addEventListener = function(type, handler, options){
      const wrapped = function(e){
        if (!window.__RWgate || !window.__RWgate.enabled) return;
        return handler.call(this, e);
      };
      return ac.__RWrawAdd.call(ac, type, wrapped, options);
    };
  }

  // Also wraps window keydown (capture)
  if (!window.__RWrawAddKey){
    window.__RWrawAddKey = window.addEventListener;
    window.addEventListener = function(type, handler, options){
      if (type === 'keydown' && options === true){
        const wrapped = function(e){
          if (!window.__RWgate || !window.__RWgate.enabled) return;
          return handler.call(this, e);
        };
        return window.__RWrawAddKey.call(window, type, wrapped, options);
      }
      return window.__RWrawAddKey.call(window, type, handler, options);
    };
  }

  /* ---------- post-init: retrofits panel after all modules loaded ---------- */
  function retrofit(){
    const RW = window.__RW;
    if (!RW) return;
    const panel = document.getElementById('rw-panel');
    if (!panel) return;
    if (document.getElementById('rw-collapse')) return; // already retrofitted (e.g. re-pasted loader)

    RW.enabled = gate.enabled;
    RW.v28 = true;

    // wrap existing panel children into a collapsible body
    const body = document.createElement('div');
    body.id = 'rw-body';
    while (panel.firstChild) body.appendChild(panel.firstChild);
    panel.appendChild(body);

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;user-select:none;';

    const caret = document.createElement('span');
    caret.id = 'rw-collapse';
    caret.style.cssText = 'font-size:11px;flex:none;';
    caret.innerHTML = '&#9660;';
    caret.title = 'Collapse Command Line';
    caret.onclick = (e)=>{ e.stopPropagation(); RW.setPanelExpanded(!RW.panelExpanded); };

    const title = document.createElement('b');
    title.innerText = 'Command Line';
    title.style.cssText = 'font-size:12px;flex:1;';

    const enableBtn = document.createElement('button');
    enableBtn.id = 'rw-enable';
    enableBtn.style.cssText = 'font-size:11px;padding:1px 6px;flex:none;border-radius:3px;';
    enableBtn.onclick = (e)=>{ e.stopPropagation(); RW.setEnabled(!RW.enabled); };

    header.appendChild(caret);
    header.appendChild(title);
    header.appendChild(enableBtn);
    header.onclick = (e)=>{
      if (e.target === header || e.target === title) RW.setPanelExpanded(!RW.panelExpanded);
    };
    panel.insertBefore(header, body);

    panel.style.position = 'relative';
    panel.style.resize = 'vertical';
    panel.style.overflow = 'auto';
    panel.style.minHeight = '32px';
    panel.style.maxHeight = '50%';

    /* ---------- panel state ---------- */
    RW.panelExpanded = true;
    RW.setPanelExpanded = function(on){
      RW.panelExpanded = !!on;
      const p = document.getElementById('rw-panel');
      const b = document.getElementById('rw-body');
      const c = document.getElementById('rw-collapse');
      if (!p || !c) return;
      if (RW.panelExpanded){
        p.style.maxHeight = '50%';
        if (b) b.style.display = '';
        c.innerHTML = '&#9660;';
        c.title = 'Collapse Command Line';
      } else {
        p.style.maxHeight = '32px';
        if (b) b.style.display = 'none';
        c.innerHTML = '&#9654;';
        c.title = 'Expand Command Line';
      }
    };

    RW.setEnabled = function(on){
      gate.enabled = !!on;
      RW.enabled = !!on;
      const btn = document.getElementById('rw-enable');
      if (btn){
        btn.innerText = 'RW: ' + (RW.enabled ? 'ON' : 'OFF');
        btn.style.background = RW.enabled ? 'rgba(100,220,100,0.25)' : 'rgba(220,100,100,0.30)';
      }
      if (!RW.enabled){
        const av = document.getElementById('annotation-canvas');
        if (av) av.style.cursor = '';
      }
    };

    RW.setEnabled(true);
    RW.setPanelExpanded(true);
  }

  // The panel is built by rw_core.js. Schedule retrofit after all modules run.
  setTimeout(retrofit, 100);
  // Backup: if setTimeout fires before rw_core, poll
  let tries = 0;
  const poll = setInterval(() => {
    tries++;
    const p = document.getElementById('rw-panel');
    if (p && p.children.length > 0){
      if (!document.getElementById('rw-collapse')){
        retrofit();
        clearInterval(poll);
      }
    }
    if (tries > 80) clearInterval(poll);
  }, 250);

  return 'v2.8 boot: listener gate + panel UX pending';
})()
