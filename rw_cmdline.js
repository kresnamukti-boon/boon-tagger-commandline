// RW vcmd — AutoCAD-style command line: type a tool's name/alias into an
// always-visible input, autocomplete suggests matches, Enter arms it by
// clicking its existing panel button (so all existing cross-disarm logic
// fires unchanged) and opens a floating popup with that tool's own controls,
// borrowed from the panel and returned on close/disarm.
//
// Full design history: CLAUDE.md.
//
// Load LAST (after rw_elbow.js, needs v32).
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v32) return 'need v3.2 (rw_elbow.js) first';
  if (RW.vcmd) return 'command line already installed';
  RW.vcmd = true;

  /* ---------- command table ---------- */
  // Each entry is either `btn` (click this id to arm/run it) or `run` (call
  // directly — for one-shot actions with no dedicated button). `ctl` lists
  // ids to relocate into the popup; omitted for pure one-shot actions.
  // `armed` is omitted for tools with no real on/off transition (their popup
  // just stays open until manually closed).
  function cycleMaskAction(){
    const next = RW.maskAction==='block' ? 'open' : (RW.maskAction==='open' ? 'add' : 'block');
    RW.setMaskAction(next);
    RW._commitStatus && RW._commitStatus('action: ' + next);
  }

  // Dispatches a synthetic keydown on `document` for the host app's own
  // listeners to consume — same idiom already used to make the app relinquish
  // its own tool (rw_install.js/rw_wallspan.js/rw_elbow.js's synthetic
  // Escape), generalized to an arbitrary key. Marked `__rwSynthetic` so the
  // global auto-capture listener below (registered on the same target) never
  // swallows its own dispatch before the app's real listener sees it.
  RW._cmdDispatchAppKey = function(key){
    const evt = new KeyboardEvent('keydown', {key:key, bubbles:true, cancelable:true});
    evt.__rwSynthetic = true;
    document.dispatchEvent(evt);
  };

  // Draw-mode tool letters dispatch `d` (draw mode) first — defensive, since
  // the app's own keymap documents these as "Tools (draw mode)"; harmless if
  // they already work from any mode.
  function nativeDrawTool(key){
    return function(){ RW._cmdDispatchAppKey('d'); RW._cmdDispatchAppKey(key); };
  }
  function nativeKey(key){
    return function(){ RW._cmdDispatchAppKey(key); };
  }

  const WORKBENCH = 'workbench', NATIVE = 'native';

  RW._cmdTable = [
    { name:'pick',      kind:WORKBENCH, aliases:['p'],       btn:'rw-pick',        ctl:['rw-pick'],                                   armed:()=>!!RW.pickMode },
    { name:'cut',       kind:WORKBENCH, aliases:['k'],       btn:'rw-cut',         ctl:['rw-cut'],                                    armed:()=>!!RW.cutMode, disarm:()=>RW.setCut(false) },
    { name:'rect',      kind:WORKBENCH, aliases:['r','b'],   btn:'rw-rect',        ctl:['rw-rect'],                                   armed:()=>RW.maskMode==='rect' },
    { name:'poly2',     kind:WORKBENCH, aliases:['poly','n'],btn:'rw-poly2',       ctl:['rw-poly2'],                                  armed:()=>RW.maskMode2==='poly2' },
    { name:'brush',     kind:WORKBENCH, aliases:['j'],       btn:'rw-brush',       ctl:['rw-brush'],                                  armed:()=>RW.maskMode2==='brush' },
    { name:'heal',      kind:WORKBENCH, aliases:['h'],       btn:'rw-heal-btn',    ctl:['rw-heal-group'],                             armed:()=>!!RW._healPreviewOn },
    { name:'healbrush', kind:WORKBENCH, aliases:['hb'],      btn:'rw-healbrush-btn', ctl:['rw-healbrush-btn'],                        armed:()=>!!RW.healBrushMode },
    { name:'pipe',      kind:WORKBENCH, aliases:['c'],       btn:'rw-pipe',        ctl:['rw-pipe-group'],                             armed:()=>!!RW.pipeMode },
    { name:'elbow',     kind:WORKBENCH, aliases:['el','l'],  btn:'rw-elbow',       ctl:['rw-sec-fittings'],                           armed:()=>!!RW.elbowMode },
    { name:'walls',     kind:WORKBENCH, aliases:['wall','o'],btn:'rw-walls',       ctl:['rw-walls'],                                  armed:()=>RW.wallOverlayState!==0,
      disarm:()=>{ const ov=document.getElementById('rw-wall-overlay'); if (ov) ov.remove(); RW.wallOverlayState=0; } },
    { name:'snap',      kind:WORKBENCH, aliases:['s'],       btn:'rw-snap',        ctl:['rw-snap'],                                   armed:()=>!!RW._snapEnabled },
    { name:'text',      kind:WORKBENCH, aliases:['density'], btn:'rw-textdetect',  ctl:['rw-textdetect-group'],                       armed:()=>!!RW.textOverlayOn },
    { name:'addmode',   kind:WORKBENCH, aliases:['add','a'], btn:'rw-addmode',     ctl:['rw-addmode'],                                armed:()=>RW.maskAction==='add' },
    { name:'relabel',   kind:WORKBENCH, aliases:[],          btn:'rw-relabel-btn', ctl:['rw-relabel-label','rw-relabel-inp','rw-relabel-btn'] },
    { name:'cycle',     kind:WORKBENCH, aliases:['action'],  run: cycleMaskAction },

    // ---- native app tools (dispatched to the host app, not this workbench) ----
    // Aliases deliberately omit any single letter already claimed above by a
    // workbench command (k=cut, a=addmode, s=snap, r=rect) — those tools are
    // reachable only by their fuller name; `polygon` also skips `poly`
    // (already poly2's alias). One-shot `run` only: switching the app's own
    // tool isn't an on/off concept the way arming a workbench tool is.
    { name:'linear',   kind:NATIVE, aliases:['q'],  run: nativeDrawTool('q') },
    { name:'bbox',     kind:NATIVE, aliases:['w'],  run: nativeDrawTool('w') },
    { name:'count',    kind:NATIVE, aliases:['e'],  run: nativeDrawTool('e') },
    { name:'polygon',  kind:NATIVE, aliases:[],     run: nativeDrawTool('r') },
    { name:'polyline', kind:NATIVE, aliases:['t'],  run: nativeDrawTool('t') },
    { name:'circle',   kind:NATIVE, aliases:['y'],  run: nativeDrawTool('y') },
    { name:'cloud',    kind:NATIVE, aliases:['u'],  run: nativeDrawTool('u') },
    { name:'wand',     kind:NATIVE, aliases:[],     run: nativeDrawTool('k') },
    { name:'wrap',     kind:NATIVE, aliases:['x'],  run: nativeDrawTool('x') },
    { name:'void',     kind:NATIVE, aliases:['v'],  run: nativeDrawTool('v') },
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

    { name:'pan',      kind:NATIVE, aliases:[],     run: nativeKey('a') },
    { name:'select',   kind:NATIVE, aliases:[],     run: nativeKey('s') },
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

  // Tags at list-index 0-9 are assumed to map to the app's own 1/2/.../9/0
  // hotkeys in list order — unconfirmed, but if right, dispatching the digit
  // goes through the app's real tag-selection code (same proven-safe idiom
  // as the native-tool dispatch above).
  RW._cmdSelectTag = function(tag, idx){
    if (idx != null && idx < 10){
      const digit = String((idx + 1) % 10);
      RW._cmdDispatchAppKey(digit);
      RW._commitStatus && RW._commitStatus('tag: ' + tag.name + ' (via digit ' + digit + ')');
    } else {
      RW._cmdSelectTagUnsafe(tag);
    }
  };

  // UNVERIFIED — the one genuinely risky part of tag search. No known safe
  // mechanism reaches a tag beyond the first 10 without live inspection of
  // the app's own setter/reactive-state mechanism, so this directly assigns
  // annotationState's current tag. If the app needs its own setter/dispatch
  // to notice the change, this can silently desync the app's displayed tag
  // from what's actually used on commit. Kept isolated and never called for
  // an index <10 specifically so it's easy to find and replace once the
  // real mechanism is confirmed live.
  RW._cmdSelectTagUnsafe = function(tag){
    if (typeof annotationState !== 'undefined') annotationState.currentTag = tag;
    RW._commitStatus && RW._commitStatus('tag: ' + tag.name + ' (direct assignment — unverified, confirm it actually applied)');
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

  /* ---------- popup: borrow real controls, never duplicate ---------- */
  let popupEl=null, popupTitleEl=null, popupBodyEl=null;

  function tidyOldParent(oldParent){
    // If the control's old parent is now left empty (or a .rw-sec wrapper is
    // now left with only its label), hide it — mirrors rw_panelsections.js's
    // own empty-section rule — and return how to undo that on restore.
    if (!oldParent) return null;
    if (oldParent.classList && oldParent.classList.contains && oldParent.classList.contains('rw-sec')){
      if (!oldParent.children || oldParent.children.length <= 1){
        const prev = oldParent.style.display;
        oldParent.style.display = 'none';
        return {el: oldParent, prevDisplay: prev};
      }
      return null;
    }
    if (oldParent.id && oldParent.id.indexOf('rw-sec-') === 0 && (!oldParent.children || oldParent.children.length === 0)){
      const wrap = oldParent.parentNode;
      if (wrap){
        const prev = wrap.style.display;
        wrap.style.display = 'none';
        return {el: wrap, prevDisplay: prev};
      }
    }
    return null;
  }

  function ensurePopupDom(){
    if (popupEl) return;
    popupEl = document.createElement('div');
    popupEl.id = 'rw-cmd-popup';
    popupEl.style.cssText = 'position:fixed;display:none;z-index:99990;background:#222;color:#eee;'
      + 'border:1px solid #666;border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,0.4);min-width:100px;';
    popupEl.addEventListener('mousedown', function(e){ e.stopPropagation(); });

    const header = document.createElement('div');
    header.id = 'rw-cmd-popup-bar';
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;'
      + 'padding:4px 6px;cursor:move;border-bottom:1px solid rgba(255,255,255,0.15);'
      + 'font-size:11px;font-weight:bold;user-select:none;';
    popupTitleEl = document.createElement('span');
    header.appendChild(popupTitleEl);
    const closeBtn = document.createElement('button');
    closeBtn.innerText = '×';
    closeBtn.title = 'Close (keeps the tool armed)';
    closeBtn.style.cssText = 'font-size:13px;line-height:1;padding:0 4px;background:none;border:none;color:inherit;cursor:pointer;';
    closeBtn.onclick = closePopup;
    header.appendChild(closeBtn);
    popupEl.appendChild(header);

    popupBodyEl = document.createElement('div');
    popupBodyEl.id = 'rw-cmd-popup-body';
    popupBodyEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:6px;';
    popupEl.appendChild(popupBodyEl);

    document.body.appendChild(popupEl);
    makeDraggable(header, popupEl);
  }

  function makeDraggable(handle, target){
    let dragging=false, offX=0, offY=0;
    handle.addEventListener('mousedown', function(e){
      dragging = true;
      const r = target.getBoundingClientRect();
      offX = e.clientX - r.left; offY = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e){
      if (!dragging) return;
      target.style.left = Math.max(0, e.clientX - offX) + 'px';
      target.style.top = Math.max(0, e.clientY - offY) + 'px';
    });
    document.addEventListener('mouseup', function(){ dragging = false; });
  }

  function positionPopupDefault(){
    if (!inputEl) return;
    const r = inputEl.getBoundingClientRect();
    const w = popupEl.offsetWidth || 200;
    let left = r.left - w - 12;
    if (left < 8) left = r.right + 12;
    popupEl.style.left = Math.max(8, left) + 'px';
    popupEl.style.top = Math.max(8, r.top) + 'px';
  }

  RW._cmdPopupState = null;

  function openPopup(entry){
    closePopup();
    if (!entry.ctl || !entry.ctl.length) return;
    ensurePopupDom();
    popupTitleEl.innerText = entry.name;
    const moved = [];
    entry.ctl.forEach(function(id){
      const node = document.getElementById(id);
      if (!node || !node.parentNode) return;
      const parent = node.parentNode;
      const nextSibling = node.nextSibling;
      const prevInlineDisplay = node.style.display;
      if (prevInlineDisplay === 'none') node.style.display = '';
      popupBodyEl.appendChild(node);
      const hiddenWrap = tidyOldParent(parent);
      moved.push({node:node, parent:parent, nextSibling:nextSibling, prevInlineDisplay:prevInlineDisplay, hiddenWrap:hiddenWrap});
    });
    if (!moved.length){
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:11px;opacity:0.7;max-width:180px;';
      msg.innerText = 'controls unavailable right now — tool is armed; use the panel.';
      popupBodyEl.appendChild(msg);
    }
    popupEl.style.display = 'block';
    positionPopupDefault();

    const state = { entry:entry, moved:moved, pollId:null, sawArmed: entry.armed ? !!entry.armed() : false };
    state.pollId = setInterval(function(){
      if (!RW.enabled){ closePopup(); return; }
      if (!entry.armed) return;
      const now = !!entry.armed();
      if (now) state.sawArmed = true;
      if (state.sawArmed && !now) closePopup();
    }, 250);
    RW._cmdPopupState = state;
  }

  function closePopup(){
    const st = RW._cmdPopupState;
    if (!st) return;
    if (st.pollId) clearInterval(st.pollId);
    for (let i = st.moved.length - 1; i >= 0; i--){
      const m = st.moved[i];
      m.parent.insertBefore(m.node, m.nextSibling);
      m.node.style.display = m.prevInlineDisplay;
      if (m.hiddenWrap) m.hiddenWrap.el.style.display = m.hiddenWrap.prevDisplay;
    }
    if (popupEl) popupEl.style.display = 'none';
    RW._cmdPopupState = null;
  }

  RW._cmdOpenPopup = openPopup;
  RW._cmdClosePopup = closePopup;

  /* ---------- run a command ---------- */
  // Re-running an already-armed tool's command toggles it off (mirrors how
  // the original single-key shortcuts worked). Most tools' own buttons
  // already toggle on click; `disarm` on a table entry overrides that for
  // the two that don't (cut, walls — see the table above).
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
      closePopup();
      return true;
    }
    btn.click();
    if (entry.ctl && entry.ctl.length) openPopup(entry);
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
  const KIND_COLOR = { workbench: '#7ec8e3', native: '#a8e6a3' };
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
        label = item.tag.name + (item.idx < 10 ? ' (' + ((item.idx + 1) % 10) + ')' : '');
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
    if (e.key === 'Enter' || (e.key === ' ' && menuMode === 'command')){
      // Space is AutoCAD's classic alternative to Enter for running a
      // command — scoped to command mode only, since a tag name (unlike a
      // command name) can legitimately contain a space to keep typing.
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
    const sections = document.getElementById('rw-sections');
    const list = document.getElementById('rw-list');
    const host = sections ? sections.parentNode : (list && list.parentNode);
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
    inputEl.placeholder = 'command… (pipe, elbow, rect…) or #tag — just start typing';
    inputEl.style.cssText = 'flex:1;font-size:11px;padding:2px 4px;';
    barEl.appendChild(inputEl);
    host.insertBefore(barEl, sections || list);

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

  return 'vcmd up: command line — just start typing a tool name (or # for a tag), '
    + RW._cmdTable.length + ' commands, ' + (RW._cmdTagList ? RW._cmdTagList.length + ' tags' : 'no tags detected');
})()
