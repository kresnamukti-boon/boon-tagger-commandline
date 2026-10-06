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
    PIPE_FORBIDDEN_BUTTON_IDS, PIPE_FORBIDDEN_CAPTURE_IDS, PIPE_ISOLATION_ALLOWED,
    PIPE_PANEL_IDS, PIPE_HINT_PREFIXES, PIPE_AUTOMATCH_PATTERN, PIPE_UNAVAILABLE_MARK,
    PIPE_FITTING_ALIASES, PIPE_FIXTURE_ID_PREFIXES, PIPE_FIXTURE_TOOL, PIPE_FIXTURE_DISPLAY_NAMES,
  } = __m_pipe_tables;
  const {
    panelPhase, autoMatchedDiameter, menuEntries, labelStep, planPick, isolationVerdict,
  } = __m_pipe_placement_core;
  const { systemsFromOptions, matchSystems, systemPickVerdict, systemQuery } = __m_pipe_system_core;
  const {
    deriveTools, buildTable, entryState, planEntry, planQuery, listEntries, reconcileArmed, loaderGuard,
  } = __m_pipe_table_core;
  const { matchCommands, commandBarShouldCapture, spaceRepeatAction } = __m_command_line_core;
  const { createPipeHost } = __m_pipe_host;

  const host = createPipeHost({
    doc: document, win: window, ids: PIPE_PAGE_IDS, panelIds: PIPE_PANEL_IDS, unavailableMark: PIPE_UNAVAILABLE_MARK,
  });

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
    // While a placement panel is open only the ways out and the view/undo actions may run.
    const iso = isolationVerdict({ panelOpen: host.readPanel().open, name: entry.name, allowed: PIPE_ISOLATION_ALLOWED });
    if (!iso.ok) { status(iso.message); return false; }
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
  // The label prompt for native's Place Fitting panel (Step 2).
  const prompt = { active: false, dismissed: false, category: null, header: '', tool: null };
  const MENU_GAP = 6, MENU_MAX_H = 220, MENU_MIN_H = 60;
  const COLORS = { tool: '#a8e6a3', action: '#8ecae6', system: '#e6c8ff', disabled: '#888' };

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
    if (prompt.active && prompt.header) {
      const head = document.createElement('div');
      head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;border-bottom:1px solid #444;';
      head.textContent = prompt.header;
      menuEl.appendChild(head);
    }
    menuItems.forEach(function(row, i){
      const el = document.createElement('div');
      el.className = 'rw-pipe-item';
      let usable, color, label;
      if (row.system) {
        usable = true; color = COLORS.system; label = row.system.name;
      } else if (row.prompt) {
        usable = row.prompt.kind === 'category' ? row.prompt.usable : row.prompt.entry.usable;
        color = usable ? COLORS.tool : COLORS.disabled;
        label = promptLabel(row.prompt);
      } else {
        const e = row.entry;
        usable = row.state.usable;
        color = usable ? COLORS[e.kind] : COLORS.disabled;
        label = e.name + (e.aliases.length ? ' (' + e.aliases.join(',') + ')' : '');
        if (!usable) label += ' — ' + (row.state.reason || 'not available');
      }
      el.style.cssText = 'padding:3px 6px;font-size:11px;cursor:pointer;color:' + color + ';'
        + (i === menuHighlight ? 'background:rgba(255,140,0,0.3);' : '');
      el.textContent = label;
      if (i === menuHighlight) highlighted = el;
      el.addEventListener('mousedown', function(ev){ ev.preventDefault(); }); // keep focus through the click
      el.addEventListener('click', function(){ if (row.system) pickSystem(row.system); else if (row.prompt) pickPrompt(row.prompt); else runAndClear(row.entry); });
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
    if (prompt.active) { refreshPrompt(); return; }
    const sq = systemQuery(query);
    if (sq !== null) { openSystemMenu(sq); return; }
    menuItems = rowsFor(query);
    menuHighlight = menuItems.length ? 0 : -1;
    renderMenu();
  }

  /* ---------- `#` system search: choose the system the next route will use ---------- */
  function currentSystems() { return systemsFromOptions(host.readSystems().options); }
  function openSystemMenu(sq) {
    if (host.readPanel().open) { status('system: finish or cancel the fitting first (Esc cancels it)'); hideMenu(); return; }
    menuItems = matchSystems(currentSystems(), sq).map(function(s){ return { system: s }; });
    menuHighlight = menuItems.length ? 0 : -1;
    if (!menuItems.length) status('system: nothing matches "' + sq + '"');
    renderMenu();
  }
  function pickSystem(system) {
    if (host.readPanel().open) { status('system: finish or cancel the fitting first (Esc cancels it)'); return false; }
    const facts = host.readSystems();
    const verdict = systemPickVerdict(facts);
    if (!verdict.ok) { status(verdict.message); hideMenu(); return false; }
    const after = host.writeSystem(system.id);
    own.lastCmdAt = Date.now();
    const shown = host.readSystems();
    const now = systemsFromOptions(shown.options).find(function(s){ return s.id === shown.currentValue; });
    status(after === system.id
      ? 'system: ' + system.name + ' (the page now shows: ' + (now ? now.name : shown.currentValue) + ')'
      : 'system: asked for ' + system.name + ' but the page shows ' + (now ? now.name : shown.currentValue));
    clearBar();
    if (inputEl) inputEl.blur();
    return true;
  }

  /* ---------- label prompt: choose the fitting in native's Place Fitting panel ---------- */
  function promptLabel(item) {
    if (item.kind === 'category') {
      return item.ports + (item.ports === 1 ? ' port' : ' ports') + (item.usable ? ' (' + item.count + ')' : ' — none available');
    }
    const e = item.entry;
    const names = [e.id].concat(e.aliases.length ? ['(' + e.aliases.join(',') + ')'] : []);
    return (e.display || e.label) + '  ' + names.join(' ') + (e.usable ? '' : ' — unavailable');
  }
  function promptEntries(snap) {
    return menuEntries({
      groups: snap.groups, tool: snap.tool, curated: PIPE_FITTING_ALIASES,
      fixtureTool: PIPE_FIXTURE_TOOL, fixturePrefixes: PIPE_FIXTURE_ID_PREFIXES, fixtureNames: PIPE_FIXTURE_DISPLAY_NAMES,
    });
  }
  function refreshPrompt() {
    const snap = host.readPanel();
    const step = labelStep({ entries: promptEntries(snap), category: prompt.category, query: inputEl ? inputEl.value : '' });
    const dia = autoMatchedDiameter(snap.hint, PIPE_AUTOMATCH_PATTERN);
    const where = step.stage === 'category' ? 'ports: type 1-4 or a name' : (step.category !== null ? step.category + '-port: pick one (Backspace = back)' : 'pick one');
    prompt.header = step.stage === 'none'
      ? 'No fitting can be placed for this box. Esc cancels the placement.'
      : 'Fitting label — ' + where + (dia ? ' — auto-matched ' + dia : '');
    menuItems = step.items.map(function(item){ return { prompt: item }; });
    menuHighlight = menuItems.length ? 0 : -1;
    ensureMenu();
    if (!menuItems.length) {
      menuEl.innerHTML = '';
      const head = document.createElement('div');
      head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;';
      head.textContent = prompt.header + (step.stage === 'none' ? '' : ' (nothing matches)');
      menuEl.appendChild(head);
      positionMenu();
      menuEl.style.display = 'block';
      return;
    }
    renderMenu();
  }
  function startPrompt() {
    const snap = host.readPanel();
    prompt.active = true; prompt.category = null; prompt.tool = snap.tool;
    mountBar();
    if (!inputEl) { prompt.active = false; return; }
    inputEl.value = '';
    inputEl.focus();
    refreshPrompt();
  }
  function endPrompt() {
    if (!prompt.active) return;
    prompt.active = false; prompt.category = null; prompt.header = '';
    if (inputEl) inputEl.value = '';
    hideMenu();
  }
  function pickPrompt(item) {
    const plan = planPick(item);
    if (plan.action === 'status') { status(plan.message); return; }
    if (plan.action === 'category') {
      prompt.category = plan.ports;
      if (inputEl) inputEl.value = '';
      refreshPrompt();
      return;
    }
    // Click native's own label button (what a mouse click does). Never Finish: that stays manual.
    if (!host.clickFamily(plan.id)) { status(plan.label + ': could not be chosen (the menu changed)'); refreshPrompt(); return; }
    status(plan.label + ' chosen');
    endPrompt();
    // Native has just moved keyboard focus onto its own label button (subtype.focus()), and that
    // button opens its menu on Enter / Space / ArrowDown. For a moment, swallow those keys if they
    // land on it, and take focus back once so the key's own release or repeat lands harmlessly on our bar.
    labelGuardUntil = Date.now() + LABEL_GUARD_MS;
    setTimeout(refocusBarOnce, 0);
  }
  const LABEL_GUARD_MS = 700;
  let labelGuardUntil = 0;
  function refocusBarOnce() {
    // Once, never in a loop; only if native really did take focus into its own panel.
    if (!inputEl || document.activeElement === inputEl) return;
    if (host.readPanel().open && host.focusInPanel()) inputEl.focus();
  }
  // Called every 250ms: opens the prompt when native reaches the label phase, closes it when it leaves.
  function promptTick() {
    const snap = host.readPanel();
    const phase = snap.open ? panelPhase(snap.hint, PIPE_HINT_PREFIXES) : 'closed';
    if (phase !== 'label') { prompt.dismissed = false; endPrompt(); return; }
    if (prompt.active || prompt.dismissed) return;
    if (host.anyDialogOpen()) return;
    startPrompt();
  }
  function reopenPrompt() { prompt.dismissed = false; startPrompt(); }

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
      if (menuHighlight >= 0 && menuItems[menuHighlight]) {
        const row = menuItems[menuHighlight];
        inputEl.value = row.system ? '#' + row.system.name : row.prompt ? (row.prompt.kind === 'category' ? String(row.prompt.ports) : row.prompt.entry.id) : row.entry.name;
      }
      return;
    }
    if (prompt.active) {
      if (e.key === 'Enter' || e.key === ' ') {
        // Consumed before anything is clicked: the same real keypress must not also reach native.
        e.preventDefault(); e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (menuHighlight >= 0 && menuItems[menuHighlight]) pickPrompt(menuItems[menuHighlight].prompt);
        else status('nothing matches');
        return;
      }
      if (e.key === 'Backspace' && !inputEl.value && prompt.category !== null) {
        e.preventDefault();
        prompt.category = null;
        refreshPrompt();
        return;
      }
    }
    // Space confirms exactly like Enter (AutoCAD's convention, same as the duct bar). It is always
    // consumed, so a literal space is never typed: multi-word labels are reached by id or alias.
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const typed = inputEl.value.trim();
      if (systemQuery(typed) !== null) {
        if (menuHighlight >= 0 && menuItems[menuHighlight] && menuItems[menuHighlight].system) pickSystem(menuItems[menuHighlight].system);
        else status('system: nothing matches "' + typed.slice(1) + '"');
        return;
      }
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
        e.preventDefault(); e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        // A dismissed prompt stays dismissed until native leaves the label phase (Space brings it back).
        if (prompt.active) { prompt.dismissed = true; endPrompt(); }
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

  // Backstop for the same problem: while the guard is on, Enter / Space / ArrowDown (down, press or up)
  // aimed at native's label button are cancelled before native sees them.
  ['keydown', 'keypress', 'keyup'].forEach(function(type){
    window.addEventListener(type, function(e){
      if (Date.now() > labelGuardUntil) return;
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowDown') return;
      if (!host.isLabelTrigger(e.target)) return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
  });

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
      // No tool or action name starts with a digit, so a bare digit on an empty bar belongs to the page,
      // except while the label prompt is open (1-4 pick a port-count category, 45/90 name an elbow).
      digitPassthrough: barEmpty && !prompt.active,
    });
    if (!shouldCapture) return;

    // AutoCAD's Space: nothing typed -> close the armed tool to select, else repeat the last tool,
    // else show what can be armed.
    if (e.key === ' ' && barEmpty && host.readPanel().open) {
      e.preventDefault(); e.stopImmediatePropagation();
      const snap = host.readPanel();
      if (panelPhase(snap.hint, PIPE_HINT_PREFIXES) === 'label') reopenPrompt();
      else status('a fitting is being placed: Esc cancels it');
      return;
    }
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
    if (e.key === ' ' && !barEmpty) {
      // Typed text waiting but the bar lost focus: Space confirms it like Enter.
      e.preventDefault(); e.stopImmediatePropagation();
      onInputKeydown({ key: 'Enter', preventDefault: function(){}, stopPropagation: function(){} });
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
  setInterval(promptTick, 250);

  RW._pipeTable = currentTable;
  RW._pipeTableInfo = function(){ return derive().info; };
  RW._pipeOwn = own;
  RW._pipePrompt = prompt;
  const first = derive();
  RW._commitStatus && RW._commitStatus('piping command line ready: ' + first.tools.length + ' tools, '
    + PIPE_GRAPH_ACTIONS.length + ' actions (tools read from the ' + first.info.source + ')');
  return 'piping command line installed';
})()
