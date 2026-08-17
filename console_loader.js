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

// ===== rw_panelux.js =====
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

;
// ===== rw_core.js =====
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

;
// ===== rw_cmdline.js =====
// RW vcmd — AutoCAD-style command line, NATIVE-TOOLS-ONLY BRANCH: type a
// native app tool's name/alias (or a tag via #name) into an always-visible
// input; autocomplete suggests matches; Enter/Space dispatches a synthetic
// key the host app's own listeners consume. No workbench commands on this
// branch — see CLAUDE.md.
//
// Full design history: CLAUDE.md.
//
// Load LAST (after rw_core.js, needs vcore).
(function(){
  const RW = window.__RW;
  if (!RW || !RW.vcore) return 'need rw_core.js first';
  if (RW.vcmd) return 'command line already installed';
  RW.vcmd = true;

  /* ---------- command table ---------- */
  // NATIVE-TOOLS-ONLY BRANCH: no workbench entries — only the host app's own
  // native tools are reachable from this command line. Every entry is
  // `run`-only (a one-shot action, no dedicated button); `armed`/`disarm`
  // support in RW.runCommand below is kept even though nothing here uses it
  // yet — it's what a future native-tool armed() predicate needs (see the
  // diagnostic readout below, which is the first step toward that).

  // Dispatches a synthetic keydown on `document` for the host app's own
  // listeners to consume — same idiom already used elsewhere in this
  // codebase to make the app relinquish its own tool (a synthetic Escape),
  // generalized to an arbitrary key. Marked `__rwSynthetic` so the global
  // auto-capture listener below (registered on the same target) never
  // swallows its own dispatch before the app's real listener sees it.
  //
  // Live-diagnostic readout: reports the dispatched key plus
  // annotationState.currentTool before/after via RW._commitStatus. This is
  // the open question this branch exists to answer — whether native
  // dispatch actually reaches the app's own tool-switching listener, and
  // what the real currentTool strings are (only 'bounding_box' is confirmed
  // anywhere in this codebase so far).
  RW._cmdDispatchAppKey = function(key){
    const as = (typeof annotationState !== 'undefined') ? annotationState : null;
    const before = as ? as.currentTool : undefined;
    const evt = new KeyboardEvent('keydown', {key:key, bubbles:true, cancelable:true});
    evt.__rwSynthetic = true;
    document.dispatchEvent(evt);
    const after = as ? as.currentTool : undefined;
    RW._commitStatus && RW._commitStatus(
      'dispatched "' + key + '" — currentTool: ' + before + ' -> ' + after
    );
  };

  // Draw-mode tool letters dispatch `d` (draw mode) first — defensive, since
  // the app's own keymap documents these as "Tools (draw mode)"; harmless if
  // they already work from any mode. Not yet live-confirmed whether the `d`
  // prefix is actually necessary — the diagnostic above is meant to help
  // settle that on the next live test.
  function nativeDrawTool(key){
    return function(){ RW._cmdDispatchAppKey('d'); RW._cmdDispatchAppKey(key); };
  }
  function nativeKey(key){
    return function(){ RW._cmdDispatchAppKey(key); };
  }

  const NATIVE = 'native';

  RW._cmdTable = [
    // No workbench-command aliases to avoid colliding with anymore, so every
    // native tool gets its own real app-keymap letter (wand=k, pan=a,
    // select=s, polygon=r) — on the full command-line branch those four were
    // reserved for workbench cut/addmode/snap/rect.
    { name:'linear',   kind:NATIVE, aliases:['q'],  run: nativeDrawTool('q') },
    { name:'bbox',     kind:NATIVE, aliases:['w'],  run: nativeDrawTool('w') },
    { name:'count',    kind:NATIVE, aliases:['e'],  run: nativeDrawTool('e') },
    { name:'polygon',  kind:NATIVE, aliases:['r'],  run: nativeDrawTool('r') },
    { name:'polyline', kind:NATIVE, aliases:['t'],  run: nativeDrawTool('t') },
    { name:'circle',   kind:NATIVE, aliases:['y'],  run: nativeDrawTool('y') },
    { name:'cloud',    kind:NATIVE, aliases:['u'],  run: nativeDrawTool('u') },
    { name:'wand',     kind:NATIVE, aliases:['k'],  run: nativeDrawTool('k') },
    { name:'wrap',     kind:NATIVE, aliases:['x'],  run: nativeDrawTool('x') },
    { name:'void',     kind:NATIVE, aliases:['v'],  run: nativeDrawTool('v') },
    // Confirmed live via opencli (not in the app-keymap reference doc when
    // this table was first written): a new native tool, data-tool="ribbon",
    // key P — click points along a path's centerline, drag to measure a
    // fixed width, builds a constant-width polygon. Mirrors this project's
    // own deleted Pipe tool (rw_wallspan.js, master-only) almost exactly.
    { name:'ribbon',   kind:NATIVE, aliases:['p'],  run: nativeDrawTool('p') },
    { name:'tag1',     kind:NATIVE, aliases:['1'],  run: nativeDrawTool('1') },
    { name:'tag2',     kind:NATIVE, aliases:['2'],  run: nativeDrawTool('2') },
    { name:'tag3',     kind:NATIVE, aliases:['3'],  run: nativeDrawTool('3') },
    { name:'tag4',     kind:NATIVE, aliases:['4'],  run: nativeDrawTool('4') },
    { name:'tag5',     kind:NATIVE, aliases:['5'],  run: nativeDrawTool('5') },
    { name:'tag6',     kind:NATIVE, aliases:['6'],  run: nativeDrawTool('6') },
    { name:'tag7',     kind:NATIVE, aliases:['7'],  run: nativeDrawTool('7') },
    { name:'tag8',     kind:NATIVE, aliases:['8'],  run: nativeDrawTool('8') },
    { name:'tag9',     kind:NATIVE, aliases:['9'],  run: nativeDrawTool('9') },
    { name:'tag0',     kind:NATIVE, aliases:['0'],  run: nativeDrawTool('0') },

    { name:'pan',      kind:NATIVE, aliases:['a'],  run: nativeKey('a') },
    { name:'select',   kind:NATIVE, aliases:['s'],  run: nativeKey('s') },
    { name:'draw',     kind:NATIVE, aliases:['d'],  run: nativeKey('d') },
    { name:'label',    kind:NATIVE, aliases:['f'],  run: nativeKey('f') },
    { name:'crop',     kind:NATIVE, aliases:['g'],  run: nativeKey('g') },
    { name:'mirror',   kind:NATIVE, aliases:['m'],  run: nativeKey('m') },
  ];

  /* ---------- tag auto-detection (# search) ---------- */
  // This codebase has never referenced anything beyond annotationState.currentTag
  // (the currently-selected tag, {id,name}) before. Tries a short list of
  // plausible field names for the FULL tag list and validates a candidate
  // against currentTag (if one is set) so a same-shaped-but-unrelated array
  // can't be mistaken for it. Logs which field matched, or that none did, so
  // a wrong guess is visible immediately rather than silently no-op.
  RW._cmdTagList = null;
  RW._cmdTagSource = null;
  RW._cmdDetectTags = function(){
    const as = (typeof annotationState !== 'undefined') ? annotationState : null;
    const cur = as && as.currentTag;
    const candidates = ['tags', 'availableTags', 'tagList', 'allTags', 'projectTags', 'tagOptions'];
    for (const key of candidates){
      const val = as && as[key];
      if (!Array.isArray(val) || !val.length) continue;
      if (!val.every(function(t){ return t && typeof t === 'object' && 'id' in t && 'name' in t; })) continue;
      if (cur && !val.some(function(t){ return t.id === cur.id; })) continue;
      RW._cmdTagList = val;
      RW._cmdTagSource = key;
      RW._commitStatus && RW._commitStatus('detected ' + val.length + ' tags via annotationState.' + key);
      return val;
    }
    RW._cmdTagList = null;
    RW._cmdTagSource = null;
    RW._commitStatus && RW._commitStatus('could not auto-detect the tag list — # search unavailable; check what Object.keys(annotationState) shows');
    return null;
  };

  RW._cmdMatchTags = function(query){
    const list = RW._cmdTagList || [];
    const q = (query||'').trim().toLowerCase();
    const ranked = [];
    list.forEach(function(tag, idx){
      const name = (tag.name||'').toLowerCase();
      let rank = -1;
      if (!q) rank = 2;
      else if (name === q) rank = 0;
      else if (name.indexOf(q) === 0) rank = 1;
      else if (name.indexOf(q) !== -1) rank = 2;
      if (rank !== -1) ranked.push({tag:tag, idx:idx, rank:rank});
    });
    ranked.sort(function(a,b){ return a.rank - b.rank; });
    return ranked.map(function(r){ return {tag:r.tag, idx:r.idx}; });
  };

  // Every tag selection goes through direct assignment regardless of
  // position — a digit-hotkey dispatch path was tried and live-tested WRONG
  // (a real job showed digit 1 selecting a different tag than the one shown
  // at list-index 0) and was removed; see CLAUDE.md's command-line round 9.
  RW._cmdSelectTag = function(tag, idx){
    RW._cmdSelectTagUnsafe(tag);
  };

  // Directly assigns annotationState's current tag to the exact object
  // matched by name. Not fully confirmed live: if the app needs its own
  // setter/dispatch to notice the change rather than a plain property
  // write, this can silently desync the app's displayed tag from what's
  // actually used on commit.
  RW._cmdSelectTagUnsafe = function(tag){
    if (typeof annotationState !== 'undefined') annotationState.currentTag = tag;
    RW._commitStatus && RW._commitStatus('tag: ' + tag.name + ' (direct assignment — confirm it actually applied)');
  };

  /* ---------- matching ---------- */
  RW._cmdMatch = function(query){
    const q = (query||'').trim().toLowerCase();
    if (!q) return RW._cmdTable.slice();
    const ranked = [];
    RW._cmdTable.forEach(function(entry){
      const name = entry.name.toLowerCase();
      const aliases = (entry.aliases||[]).map(function(a){ return a.toLowerCase(); });
      let rank = -1;
      if (name === q) rank = 0;
      else if (aliases.indexOf(q) !== -1) rank = 1;
      else if (name.indexOf(q) === 0) rank = 2;
      else if (aliases.some(function(a){ return a.indexOf(q) === 0; })) rank = 3;
      else if (name.indexOf(q) !== -1) rank = 4;
      if (rank !== -1) ranked.push({entry:entry, rank:rank});
    });
    ranked.sort(function(a,b){ return a.rank - b.rank; });
    return ranked.map(function(r){ return r.entry; });
  };

  function findEntry(name){
    const q = (name||'').trim().toLowerCase();
    if (!q) return null;
    for (const e of RW._cmdTable){ if (e.name.toLowerCase()===q) return e; }
    for (const e of RW._cmdTable){ if ((e.aliases||[]).some(function(a){ return a.toLowerCase()===q; })) return e; }
    return null;
  }

  /* ---------- run a command ---------- */
  // Every entry today is `run`-only (switching the app's own tool isn't an
  // on/off concept the way arming a workbench tool was) — `armed`/`disarm`
  // support is kept for a future native armed() pass, not exercised yet.
  RW.runCommand = function(name){
    const entry = findEntry(name);
    if (!entry){ RW._commitStatus && RW._commitStatus('unknown command: ' + name); return false; }
    if (entry.run){
      entry.run();
      return true;
    }
    const btn = document.getElementById(entry.btn);
    if (!btn){ RW._commitStatus && RW._commitStatus('"' + entry.name + '" — its button is not on the page right now'); return false; }
    const wasArmed = entry.armed ? !!entry.armed() : false;
    if (wasArmed){
      if (entry.disarm) entry.disarm(); else btn.click();
      return true;
    }
    btn.click();
    return true;
  };

  /* ---------- command bar + autocomplete ---------- */
  let barEl=null, inputEl=null, menuEl=null, menuItems=[], menuHighlight=-1, menuMode='command';

  function ensureMenuDom(){
    if (menuEl) return;
    menuEl = document.createElement('div');
    menuEl.id = 'rw-cmd-menu';
    menuEl.style.cssText = 'position:fixed;display:none;z-index:99991;background:#222;color:#eee;'
      + 'border:1px solid #666;border-radius:4px;max-height:200px;overflow-y:auto;';
    document.body.appendChild(menuEl);
  }

  function positionMenu(){
    const r = inputEl.getBoundingClientRect();
    menuEl.style.left = r.left + 'px';
    menuEl.style.top = (r.bottom + 2) + 'px';
    menuEl.style.width = r.width + 'px';
  }

  function hideMenu(){ if (menuEl) menuEl.style.display = 'none'; }

  // Text color only (never the row background, which the keyboard-highlight
  // already uses) so kind stays legible regardless of which row is selected.
  const KIND_COLOR = { native: '#a8e6a3' };
  const TAG_COLOR = '#e0c3fc';

  function renderMenuRows(){
    if (!menuItems.length){ hideMenu(); return; }
    ensureMenuDom();
    menuEl.innerHTML = '';
    menuItems.forEach(function(item, i){
      const row = document.createElement('div');
      row.className = 'rw-cmd-item';
      let label, color;
      if (menuMode === 'tag'){
        label = item.tag.name; // no hotkey-number hint — that mapping was removed as confirmed wrong
        color = TAG_COLOR;
      } else {
        label = item.name + ((item.aliases && item.aliases.length) ? (' (' + item.aliases.join(',') + ')') : '');
        color = KIND_COLOR[item.kind] || '#eee';
      }
      row.style.cssText = 'padding:3px 6px;font-size:11px;cursor:pointer;'
        + 'color:' + color + ';'
        + (i===menuHighlight ? 'background:rgba(255,140,0,0.3);' : '');
      row.innerText = label;
      row.addEventListener('mousedown', function(e){ e.preventDefault(); }); // survive the input's blur
      row.addEventListener('click', function(){ runAndClear(item); });
      menuEl.appendChild(row);
    });
    positionMenu();
    menuEl.style.display = 'block';
  }

  // Typing "#" as the first character switches the same dropdown/keyboard
  // navigation to search RW._cmdTagList instead of RW._cmdTable.
  function onInput(){
    const v = inputEl.value;
    if (v.charAt(0) === '#'){
      if (!RW._cmdTagList) RW._cmdDetectTags();
      menuMode = 'tag';
      menuItems = RW._cmdMatchTags(v.slice(1)).slice(0, 8);
    } else {
      menuMode = 'command';
      menuItems = RW._cmdMatch(v).slice(0, 8);
    }
    menuHighlight = menuItems.length ? 0 : -1;
    renderMenuRows();
  }

  function moveHighlight(delta){
    if (!menuItems.length) return;
    menuHighlight = (menuHighlight + delta + menuItems.length) % menuItems.length;
    renderMenuRows();
  }

  function runAndClear(item){
    if (menuMode === 'tag') RW._cmdSelectTag(item.tag, item.idx);
    else RW.runCommand(item.name);
    inputEl.value = '';
    hideMenu();
    inputEl.blur();
  }

  function onInputKeydown(e){
    if (e.key === 'ArrowDown'){ e.preventDefault(); e.stopPropagation(); moveHighlight(1); return; }
    if (e.key === 'ArrowUp'){ e.preventDefault(); e.stopPropagation(); moveHighlight(-1); return; }
    if (e.key === 'Tab'){
      e.preventDefault(); e.stopPropagation();
      if (menuHighlight >= 0 && menuItems[menuHighlight]){
        const item = menuItems[menuHighlight];
        inputEl.value = menuMode === 'tag' ? ('#' + item.tag.name) : item.name;
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' '){
      // Space is AutoCAD's classic alternative to Enter for confirming
      // whatever's highlighted — commands and tags alike. Always consumed
      // (never falls through to a literal space). Accepted trade-off: once
      // any tag matches (menuHighlight >= 0), Space confirms the top-ranked
      // one immediately — so two tags sharing a first word (e.g. "Room
      // A"/"Room B") can't be disambiguated by typing a space; use the
      // arrow keys or keep typing without one.
      e.preventDefault(); e.stopPropagation();
      let item = null;
      if (menuHighlight >= 0 && menuItems[menuHighlight]) item = menuItems[menuHighlight];
      else if (menuMode === 'command'){
        const matches = RW._cmdMatch(inputEl.value);
        if (matches.length === 1) item = matches[0];
      }
      if (item) runAndClear(item);
      else { RW._commitStatus && RW._commitStatus('unknown ' + (menuMode==='tag'?'tag':'command') + ': ' + inputEl.value); }
      return;
    }
    if (e.key === 'Escape'){
      e.stopPropagation();
      if (menuEl && menuEl.style.display !== 'none'){ hideMenu(); }
      else { inputEl.value = ''; inputEl.blur(); }
      return;
    }
  }

  function mountCommandBar(){
    if (document.getElementById('rw-cmd-row')) return;
    // No #rw-sections on this branch (rw_panelsections.js is gone) — anchor
    // on #rw-list, created by rw_core.js.
    const list = document.getElementById('rw-list');
    const host = list && list.parentNode;
    if (!host) return;
    barEl = document.createElement('div');
    barEl.id = 'rw-cmd-row';
    barEl.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:6px;';
    const prompt = document.createElement('span');
    prompt.innerText = '>';
    prompt.style.cssText = 'opacity:0.5;font-family:monospace;';
    barEl.appendChild(prompt);
    inputEl = document.createElement('input');
    inputEl.id = 'rw-cmd-input';
    inputEl.type = 'text';
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;
    inputEl.placeholder = 'native tool (linear, bbox, pan…) or #tag — just start typing';
    inputEl.style.cssText = 'flex:1;font-size:11px;padding:2px 4px;';
    barEl.appendChild(inputEl);
    host.insertBefore(barEl, list);

    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('keydown', onInputKeydown);
    inputEl.addEventListener('blur', function(){ setTimeout(hideMenu, 150); });
  }

  mountCommandBar();
  RW._cmdDetectTags();

  // Global auto-capture: typing anywhere (nothing else focused) seeds the
  // command input and focuses it — only the FIRST character needs this;
  // every character after that lands on the now-focused real <input> and is
  // handled by onInputKeydown/onInput above, unchanged. "Capture always
  // wins": this consumes the keystroke (preventDefault + stopImmediatePropagation)
  // so the host app's own same-letter shortcut does not also fire — to use a
  // native single-key shortcut directly again, blur the command input first
  // (Escape, or click the canvas).
  document.addEventListener('keydown', function(e){
    if (e.__rwSynthetic) return; // our own dispatch to the app (RW._cmdDispatchAppKey) — never eat it
    if (!RW.enabled) return; // respect the master RW: ON/OFF killswitch, same as every other tool
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    if (e.key.length !== 1) return; // printable characters only
    e.preventDefault(); e.stopImmediatePropagation();
    mountCommandBar();
    if (!inputEl) return;
    inputEl.value += e.key;
    inputEl.focus();
    if (inputEl.setSelectionRange) inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    onInput();
  }, true);

  return 'vcmd up: command line (native tools only) — just start typing a tool name (or # for a tag), '
    + RW._cmdTable.length + ' commands, ' + (RW._cmdTagList ? RW._cmdTagList.length + ' tags' : 'no tags detected');
})()


  console.log('[RW] command line ready: ' + __RW._cmdTable.length + ' commands, ' + (__RW._cmdTagList ? __RW._cmdTagList.length + ' tags' : 'no tags detected') + '. Type a tool name (or # for a tag) anywhere on the page.');
})()
