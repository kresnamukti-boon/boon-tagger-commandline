// RW vpipe: AutoCAD-style command line for the PIPING graph page. Type a tool name (or its key
// letter, or an alias) from anywhere on the page and the real tool-rail button is clicked; type an
// action (undo, redo, zoomfit, ...) and that real button is clicked.
//
// Step 1 scope: tool switching and a short list of view/undo actions. Nothing here draws, saves or
// submits anything by itself, and the forbidden controls (save, recording, submit, Finish, ...) are
// refused in code. Native's own piping command line must be OFF while this runs (the loader refuses
// to start otherwise).
//
// A plain script, appended last by scripts/build-pipe-dist.js after the modules it uses
// (__m_* consts). All decisions live in src/core/pipe-table-core.js; all DOM access in
// src/pipe/pipe-host.js. This file only wires them to a bar, a dropdown and the keyboard. It does
// not import from, or share state with, src/console/shell.js (the duct bar).
(function(){
  const RW = window.__RW;
  if (!RW || !RW.vcore) return 'need rw_core.js first';
  if (RW.vpipe) return 'piping command line already installed';
  if (RW.vcmd) return 'the duct command line is already loaded on this page; reload the page first';

  const {
    PIPE_PAGE_IDS, PIPE_FALLBACK_KEYS, PIPE_TOOL_ALIASES, PIPE_GRAPH_ACTIONS,
    PIPE_FORBIDDEN_BUTTON_IDS, PIPE_FORBIDDEN_CAPTURE_IDS,
  } = __m_pipe_tables;
  const {
    deriveTools, buildTable, entryState, planEntry, planQuery, listEntries, reconcileArmed, loaderGuard,
  } = __m_pipe_table_core;
  const { matchCommands, commandBarShouldCapture, spaceRepeatAction } = __m_command_line_core;
  const { createPipeHost } = __m_pipe_host;

  const host = createPipeHost({ doc: document, win: window, ids: PIPE_PAGE_IDS });

  // Second line of defence behind the loader's own check (a direct paste of dist/ skips the loader).
  const guard = loaderGuard(host.readPageFacts());
  if (!guard.ok) { console.warn('[RW] ' + guard.message); return guard.message; }
  RW.vpipe = true;

  const FORBIDDEN = { forbiddenIds: PIPE_FORBIDDEN_BUTTON_IDS, forbiddenCaptureIds: PIPE_FORBIDDEN_CAPTURE_IDS };
  const RESERVED_KEYS = ['m']; // native's own ruler hotkey: never captured into the bar

  /* ---------- table (re-derived from the live rail every time, never cached) ---------- */
  function derive() {
    return deriveTools({
      railTools: host.readRail(), fallbackKeys: PIPE_FALLBACK_KEYS,
      curatedAliases: PIPE_TOOL_ALIASES, actions: PIPE_GRAPH_ACTIONS,
    });
  }
  function currentTable() { return buildTable(derive().tools, PIPE_GRAPH_ACTIONS); }
  function stateFor(entry) { return entryState(entry, host.describeTarget(entry), FORBIDDEN); }

  /* ---------- our own record of what is armed (see reconcileArmed) ---------- */
  const own = { armed: false, tool: null, lastTool: null, lastCmdAt: 0 };
  function currentArmed() {
    const r = reconcileArmed({
      own: { armed: own.armed, tool: own.tool }, live: host.readActiveTool(),
      sinceLastCmdMs: Date.now() - own.lastCmdAt,
    });
    own.armed = r.armed; own.tool = r.tool;
    return r;
  }

  function status(msg) { if (RW._commitStatus) RW._commitStatus(msg); }

  /* ---------- running an entry ---------- */
  let inputEl = null;
  function runEntry(entry) {
    // Blur first: native ignores a tool key while a form field has focus, and the bar's input is one.
    if (inputEl && inputEl.blur) inputEl.blur();
    const plan = planEntry(entry, stateFor(entry));
    if (plan.action !== 'click') { status(plan.message); return false; }
    const before = host.readActiveTool();
    if (!host.clickEntry(entry)) { status(entry.name + ': nothing to click on this page'); return false; }
    own.lastCmdAt = Date.now();
    if (entry.kind === 'tool') {
      if (entry.name === 'select') { own.armed = false; own.tool = null; }
      else { own.armed = true; own.tool = entry.name; own.lastTool = entry.name; }
      // Report what the page itself says afterwards; a click that changed nothing is worth seeing.
      setTimeout(function(){
        const after = host.readActiveTool();
        status(after === entry.name
          ? entry.name + ' armed'
          : entry.name + ' clicked, but the page still reports tool: ' + after + ' (was ' + before + ')');
      }, 120);
    } else {
      status(entry.name + ' clicked');
    }
    return true;
  }

  RW.runCommand = function(query){
    const plan = planQuery(currentTable(), query, stateFor);
    if (plan.action !== 'click') { status(plan.message); return false; }
    return runEntry(plan.entry);
  };

  /* ---------- dropdown ---------- */
  let menuEl = null, menuItems = [], menuHighlight = -1;
  const MENU_GAP = 6, MENU_MAX_H = 220, MENU_MIN_H = 60;
  const COLORS = { tool: '#a8e6a3', action: '#8ecae6', disabled: '#888' };

  function ensureMenu() {
    if (menuEl) return;
    menuEl = document.createElement('div');
    menuEl.id = 'rw-pipe-menu';
    menuEl.style.cssText = 'position:fixed;display:none;z-index:2147483647;background:#222;color:#eee;'
      + 'border:1px solid #666;border-radius:4px;max-height:' + MENU_MAX_H + 'px;overflow-y:auto;';
    document.body.appendChild(menuEl);
  }
  function positionMenu() {
    const r = inputEl.getBoundingClientRect();
    const panel = document.getElementById('rw-panel');
    const pr = (panel && panel.getBoundingClientRect) ? panel.getBoundingClientRect() : r;
    menuEl.style.left = r.left + 'px';
    menuEl.style.width = r.width + 'px';
    const above = pr.top - MENU_GAP;
    const below = window.innerHeight - pr.bottom - MENU_GAP;
    if (above >= MENU_MAX_H || above >= below) {
      menuEl.style.bottom = (window.innerHeight - pr.top + MENU_GAP) + 'px';
      menuEl.style.top = 'auto';
      menuEl.style.maxHeight = Math.max(MENU_MIN_H, Math.min(MENU_MAX_H, above)) + 'px';
    } else {
      menuEl.style.top = (pr.bottom + MENU_GAP) + 'px';
      menuEl.style.bottom = 'auto';
      menuEl.style.maxHeight = Math.max(MENU_MIN_H, Math.min(MENU_MAX_H, below)) + 'px';
    }
  }
  function hideMenu() { if (menuEl) menuEl.style.display = 'none'; menuItems = []; menuHighlight = -1; }
  function scrollRowIntoView(row) {
    if (!row || !menuEl) return;
    const top = row.offsetTop, h = row.offsetHeight, view = menuEl.clientHeight;
    if (typeof top !== 'number' || typeof h !== 'number' || !view) return;
    if (top < menuEl.scrollTop) menuEl.scrollTop = top;
    else if (top + h > menuEl.scrollTop + view) menuEl.scrollTop = top + h - view;
  }
  function renderMenu() {
    if (!menuItems.length) { hideMenu(); return; }
    ensureMenu();
    menuEl.innerHTML = '';
    let highlighted = null;
    menuItems.forEach(function(row, i){
      const el = document.createElement('div');
      el.className = 'rw-pipe-item';
      const e = row.entry;
      const usable = row.state.usable;
      let label = e.name + (e.aliases.length ? ' (' + e.aliases.join(',') + ')' : '');
      if (!usable) label += ' — ' + (row.state.reason || 'not available');
      el.style.cssText = 'padding:3px 6px;font-size:11px;cursor:pointer;color:' + (usable ? COLORS[e.kind] : COLORS.disabled) + ';'
        + (i === menuHighlight ? 'background:rgba(255,140,0,0.3);' : '');
      el.textContent = label;
      if (i === menuHighlight) highlighted = el;
      el.addEventListener('mousedown', function(ev){ ev.preventDefault(); }); // keep focus through the click
      el.addEventListener('click', function(){ runAndClear(row.entry); });
      menuEl.appendChild(el);
    });
    positionMenu();
    menuEl.style.display = 'block';
    scrollRowIntoView(highlighted);
  }
  // Everything the dropdown may list for `query` (all tools, usable actions), ranked.
  function rowsFor(query) {
    const table = currentTable();
    const rows = listEntries(table, stateFor);
    const byName = new Map(rows.map(function(r){ return [r.entry.name, r]; }));
    return matchCommands(rows.map(function(r){ return r.entry; }), query).map(function(e){ return byName.get(e.name); });
  }
  function openMenu(query) {
    menuItems = rowsFor(query);
    menuHighlight = menuItems.length ? 0 : -1;
    renderMenu();
  }

  function clearBar() { if (inputEl) inputEl.value = ''; hideMenu(); }
  function runAndClear(entry) { if (runEntry(entry)) clearBar(); else hideMenu(); }

  /* ---------- the bar ---------- */
  function mountBar() {
    if (document.getElementById('rw-pipe-row')) return;
    const list = document.getElementById('rw-list');
    const hostEl = list && list.parentNode;
    if (!hostEl) return;
    const row = document.createElement('div');
    row.id = 'rw-pipe-row';
    row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:6px;';
    const prompt = document.createElement('span');
    prompt.textContent = '>';
    prompt.style.cssText = 'opacity:0.5;font-family:monospace;';
    row.appendChild(prompt);
    inputEl = document.createElement('input');
    inputEl.id = 'rw-pipe-input';
    inputEl.type = 'text';
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;
    inputEl.placeholder = 'piping tool (route, fitting, valve…) or action (undo, zoomfit…) — just start typing';
    inputEl.style.cssText = 'flex:1;font-size:11px;padding:2px 4px;background:#111;color:#eee;'
      + 'border:1px solid #555;border-radius:3px;color-scheme:dark;';
    row.appendChild(inputEl);
    hostEl.insertBefore(row, list);
    inputEl.addEventListener('input', function(){ openMenu(inputEl.value); });
    inputEl.addEventListener('keydown', onInputKeydown);
    inputEl.addEventListener('blur', function(){
      setTimeout(function(){ if (document.activeElement !== inputEl) hideMenu(); }, 150);
    });
  }

  function cycle(delta) {
    if (!menuItems.length) return;
    menuHighlight = (menuHighlight + delta + menuItems.length) % menuItems.length;
    renderMenu();
  }

  function onInputKeydown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); cycle(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); cycle(-1); return; }
    if (e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation();
      if (!menuItems.length) openMenu(inputEl.value);
      else cycle(e.shiftKey ? -1 : 1);
      // Fill the bar with the highlighted name so Enter and Tab agree on what will run. Setting
      // .value fires no input event, so the list stays put and keeps cycling over the same rows.
      if (menuHighlight >= 0 && menuItems[menuHighlight]) inputEl.value = menuItems[menuHighlight].entry.name;
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      const typed = inputEl.value.trim();
      // An exact name/label/alias always wins; otherwise run the highlighted completion.
      const plan = planQuery(currentTable(), typed, stateFor);
      if (typed && plan.action !== 'status') { if (runEntry(plan.entry)) clearBar(); return; }
      if (menuHighlight >= 0 && menuItems[menuHighlight]) { runAndClear(menuItems[menuHighlight].entry); return; }
      if (typed) status(plan.message);
      return;
    }
    if (e.key === 'Escape') {
      // Only swallow Escape while it has something of ours to close; otherwise native's own Escape
      // (cancel the current placement) must still get it.
      if (inputEl.value || (menuEl && menuEl.style.display !== 'none')) {
        e.stopPropagation();
        clearBar();
        inputEl.blur();
      } else {
        inputEl.blur();
      }
    }
  }

  /* ---------- overlay positioning (bottom-centre over the drawing stage) ---------- */
  RW._pipeBarOffset = 16;
  RW._pipeBarWidth = 480;
  RW._pipeReposition = function(){
    if (!RW._cmdOwnsPanelPosition) return;
    const panel = document.getElementById('rw-panel');
    const rect = host.stageRect();
    if (!panel || !rect) return;
    const width = Math.min(RW._pipeBarWidth, rect.width);
    panel.style.width = width + 'px';
    panel.style.left = (rect.left + (rect.width - width) / 2) + 'px';
    panel.style.top = 'auto';
    panel.style.bottom = Math.max(RW._pipeBarOffset, (window.innerHeight - rect.bottom) + RW._pipeBarOffset) + 'px';
    if (menuEl && menuEl.style.display !== 'none') positionMenu();
  };

  /* ---------- global capture: type anywhere to start a command ---------- */
  document.addEventListener('keydown', function(e){
    const t = e.target;
    const typingInFormField = !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
    const barEmpty = !inputEl || !inputEl.value;
    const shouldCapture = commandBarShouldCapture({
      key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
      typingInFormField: typingInFormField,
      dialogOpen: host.anyDialogOpen(),
      enabled: RW.enabled,
      keyReserved: function(k){ return RESERVED_KEYS.indexOf(k.toLowerCase()) !== -1; },
      // No piping command or alias starts with a digit, so a bare digit on an empty bar belongs to the page.
      digitPassthrough: barEmpty,
    });
    if (!shouldCapture) return;

    // AutoCAD's Space: nothing typed -> close the armed tool to select, else repeat the last tool,
    // else show what can be armed.
    if (e.key === ' ' && barEmpty) {
      const armed = currentArmed();
      const action = spaceRepeatAction({
        query: '', lastTool: own.lastTool, toolArmed: armed.armed, openMenuWhenIdle: true,
      });
      e.preventDefault(); e.stopImmediatePropagation();
      if (action.action === 'select') { RW.runCommand('select'); return; }
      if (action.action === 'repeat') { RW.runCommand(action.toolId); return; }
      mountBar();
      if (inputEl) inputEl.focus();
      menuItems = rowsFor('').filter(function(r){ return r.entry.kind === 'tool'; });
      menuHighlight = menuItems.length ? 0 : -1;
      renderMenu();
      return;
    }
    e.preventDefault(); e.stopImmediatePropagation();
    mountBar();
    if (!inputEl) return;
    inputEl.value += e.key;
    inputEl.focus();
    if (inputEl.setSelectionRange) inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    openMenu(inputEl.value);
  }, true);

  // Tab must win over the host app's own capture-phase keydown handling: a window-level capture
  // listener always runs before any document-level one, whatever the registration order.
  window.addEventListener('keydown', function(e){
    if (e.key !== 'Tab' || e.target !== inputEl) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    onInputKeydown(e);
  }, true);

  /* ---------- startup ---------- */
  mountBar();
  RW._pipeReposition();
  window.addEventListener('resize', RW._pipeReposition);

  RW._pipeTable = currentTable;
  RW._pipeTableInfo = function(){ return derive().info; };
  RW._pipeOwn = own;
  const first = derive();
  RW._commitStatus && RW._commitStatus('piping command line ready: ' + first.tools.length + ' tools, '
    + PIPE_GRAPH_ACTIONS.length + ' actions (tools read from the ' + first.info.source + ')');
  return 'piping command line installed';
})()
