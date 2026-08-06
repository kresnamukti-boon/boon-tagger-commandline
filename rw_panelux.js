// RW v2.8 — collapsible panel + master killswitch.
// MUST be loaded FIRST (before rw_install). Establishes RW.enabled and
// wraps annotation-canvas's addEventListener so every handler registered
// by subsequent modules checks RW.enabled automatically.
// Panel UX (collapse/resize/toggle) attaches at the end.
(function boot(){
  'use strict';

  // Do NOT create __RW here — rw_install will create it. We just set up
  // the addEventListener wrappers so subsequent modules get auto-gated.
  // After rw_install runs, poll for __RW and attach our state + panel UX.

  // We need RW.enabled accessible BEFORE rw_install runs (the wrapper checks
  // it). Store it on a separate object that the wrapper reads.
  if (!window.__RWgate) window.__RWgate = { enabled: true };
  const gate = window.__RWgate;

  /* ---------- auto-gate all annotation-canvas listeners ---------- */
  // Override addEventListener on the annotation-canvas so any handler
  // registered by us checks RW.enabled first. Store the original under
  // _rawAdd so the override itself doesn't get wrapped.
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

  // Also wrap window keydown (capture) for the modules that attach there
  if (!window.__RWrawAddKey){
    window.__RWrawAddKey = window.addEventListener;
    window.addEventListener = function(type, handler, options){
      if (type === 'keydown' && options === true){
        // This is how our modules attach key handlers (capture phase)
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

    // sync the enabled flag from our gate object to RW
    RW.enabled = gate.enabled;
    RW.v28 = true;

    // wrap existing children into collapsible body
    const body = document.createElement('div');
    body.id = 'rw-body';
    while (panel.firstChild) body.appendChild(panel.firstChild);
    panel.appendChild(body);

    // header bar
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;user-select:none;';

    const caret = document.createElement('span');
    caret.id = 'rw-collapse';
    caret.style.cssText = 'font-size:11px;flex:none;';
    caret.innerHTML = '&#9660;';
    caret.title = 'Collapse Region Workbench';
    caret.onclick = (e)=>{ e.stopPropagation(); RW.setPanelExpanded(!RW.panelExpanded); };

    const title = document.createElement('b');
    title.innerText = 'Region Workbench';
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

    // panel styling
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
        c.title = 'Collapse Region Workbench';
      } else {
        p.style.maxHeight = '32px';
        if (b) b.style.display = 'none';
        c.innerHTML = '&#9654;';
        c.title = 'Expand Region Workbench';
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
      const overlay = document.getElementById('rw-overlay');
      if (overlay){
        if (RW.overlayHidden) overlay.style.display = 'none';
        else overlay.style.opacity = RW.enabled ? '0.55' : '0.12';
      }
      if (!RW.enabled){
        RW.maskMode = null; RW.maskMode2 = null; RW.setPick(false);
        RW._polyPtsN = []; RW.__rectStartN = null; RW.__rectCurN = null;
        const av = document.getElementById('annotation-canvas');
        if (av) av.style.cursor = '';
        ['rw-polyline','rw-rectline','rw-brushline','rw-commitpreview'].forEach(id=>{
          const el = document.getElementById(id); if(el) el.remove();
        });
        if (RW._syncRectBtn) RW._syncRectBtn();
        if (RW._syncToolButtons) RW._syncToolButtons();
      }
    };

    RW.setEnabled(true);
    RW.setPanelExpanded(true);
  }

  // The panel is built by rw_install (v2). Schedule retrofit after all modules run.
  setTimeout(retrofit, 100);
  // Backup: if setTimeout fires before rw_install, poll
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
