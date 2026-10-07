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
    PIPE_NATIVE_CHANGED_MESSAGE, PIPE_REQUIRED_IDS,
    PIPE_FORBIDDEN_BUTTON_TEXTS, PIPE_FORBIDDEN_CONTAINER_IDS, PIPE_FINISH_BUTTON_ID, PIPE_FINISH_HINT_PREFIX,
    PIPE_FINISH_TOOLS, PIPE_FINISH_KEYS, PIPE_FINISH_LATCH_MS, PIPE_PORT_ROLE_PATTERN, PIPE_LOG_MAX, PIPE_LOG_AFTER_MS,
    PIPE_SIZE_IDS, PIPE_SIZE_TOOLS, PIPE_ADJUST, PIPE_ADJUST_ENTRY,
    PIPE_SETTING_IDS, PIPE_SETTING_ENTRIES, PIPE_SOURCE_UNRESOLVED,
  } = __m_pipe_tables;
  const {
    panelPhase, autoMatchedDiameter, menuEntries, labelStep, planPick, isolationVerdict, hintWatch,
    portRoleFromHint, portLine, adjustVerdict, targetForbidden, finishVerdict, finishLatchClick, finishLatchStep, FINISH_LATCH_OFF,
  } = __m_pipe_placement_core;
  const { appendLog, makeLogEntry, parseRevision, formatLog } = __m_pipe_log_core;
  const {
    planSizeInput, planSizeWrite, roleSizes, maxViolations, sizeWriteVerdict, SIZE_CHOICES, editableFields,
    SIZES_IDLE, sizesKey, sizesTickPlan, sizesFinishGate, formatSize, effectiveSize, sizeChoiceRows, escStepPlan, SIZE_CHOICE_ADJUST, SIZE_CHOICE_READJUST,
  } = __m_pipe_size_core;
  const { systemsFromOptions, matchSystems, systemPickVerdict, systemQuery } = __m_pipe_system_core;
  const { settingVerdict, optionMatch, diameterPlan, readbackVerdict, optionRowText } = __m_pipe_setting_core;
  const {
    deriveTools, buildTable, entryState, planEntry, planQuery, listEntries, reconcileArmed, loaderGuard,
  } = __m_pipe_table_core;
  const { matchCommands, commandBarShouldCapture, spaceRepeatAction } = __m_command_line_core;
  const { createPipeHost } = __m_pipe_host;

  const host = createPipeHost({
    doc: document, win: window, ids: PIPE_PAGE_IDS, panelIds: PIPE_PANEL_IDS, sizeIds: PIPE_SIZE_IDS, settingIds: PIPE_SETTING_IDS, unresolvedValue: PIPE_SOURCE_UNRESOLVED, adjustLabelText: PIPE_ADJUST.labelText, unavailableMark: PIPE_UNAVAILABLE_MARK,
  });

  // Second line of defence behind the loader's own check (a direct paste of dist/ skips the loader).
  const guard = loaderGuard(host.readPageFacts());
  if (!guard.ok) { console.warn('[RW] ' + guard.message); return guard.message; }
  // Safety net: if native no longer has an element we depend on, install nothing and say so (one line).
  const missing = host.missingIds(PIPE_REQUIRED_IDS);
  if (missing.length) {
    console.warn('[RW] ' + PIPE_NATIVE_CHANGED_MESSAGE + '. Missing on this page: ' + missing.join(', '));
    RW._pipeMissing = missing;
    if (RW._commitStatus) RW._commitStatus(PIPE_NATIVE_CHANGED_MESSAGE);
    return PIPE_NATIVE_CHANGED_MESSAGE;
  }
  RW.vpipe = true;

  const FORBIDDEN = { forbiddenIds: PIPE_FORBIDDEN_BUTTON_IDS, forbiddenCaptureIds: PIPE_FORBIDDEN_CAPTURE_IDS,
    forbiddenTexts: PIPE_FORBIDDEN_BUTTON_TEXTS, forbiddenContainerIds: PIPE_FORBIDDEN_CONTAINER_IDS };
  const RESERVED_KEYS = ['m']; // native's own ruler hotkey: never captured into the bar

  /* ---------- table (re-derived from the live rail every time, never cached) ---------- */
  function derive() {
    return deriveTools({
      railTools: host.readRail(), fallbackKeys: PIPE_FALLBACK_KEYS,
      curatedAliases: PIPE_TOOL_ALIASES, actions: PIPE_GRAPH_ACTIONS,
    });
  }
  function currentTable() { return buildTable(derive().tools, PIPE_GRAPH_ACTIONS).concat([PIPE_ADJUST_ENTRY], PIPE_SETTING_ENTRIES); }
  // Can the bar tick/untick native's Adjust ports box right now? (see adjustVerdict)
  function adjustFacts() {
    const snap = host.readPanel();
    const a = host.readAdjustPorts();
    return {
      panelOpen: snap.open, phase: snap.open ? panelPhase(snap.hint, PIPE_HINT_PREFIXES) : 'closed',
      found: a.found, visible: a.visible, disabled: a.disabled,
    };
  }
  // Can the bar write this setting right now? (see settingVerdict; the host checks it again when writing)
  function settingFacts(entry) {
    const st = host.readSettings();
    const c = st.controls[entry.control] || { found: false };
    const src = st.controls.dsource || { found: false };
    return {
      label: entry.label, found: c.found, visible: c.visible, disabled: c.disabled,
      panelOpen: st.panelOpen, selectionReadable: st.selectionReadable, selectedEntityId: st.selectedEntityId,
      sourceUnresolved: entry.control === 'diameter' && src.found && src.value === PIPE_SOURCE_UNRESOLVED,
    };
  }
  function stateFor(entry) {
    if (entry.kind === 'setting') {
      const v = settingVerdict(settingFacts(entry));
      return { usable: v.ok, forbidden: false, reason: v.ok ? null : v.message.replace(/^[^:]+: /, '') };
    }
    if (entry.kind === 'adjust') {
      const v = adjustVerdict(adjustFacts());
      return { usable: v.ok, forbidden: false, reason: v.ok ? null : v.message.replace(/^adjust ports: /, '') };
    }
    return entryState(entry, host.describeTarget(entry), FORBIDDEN);
  }

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

  /* ---------- action log: what the bar itself did (in memory only, last PIPE_LOG_MAX) ---------- */
  // Read from the console: __RW._pipeLog (entries) or __RW._pipeLogPrint() (one line each). Never
  // stored in the page, localStorage or sent anywhere. `revAfter` is read PIPE_LOG_AFTER_MS later.
  RW._pipeLog = [];
  RW._pipeLogPrint = function(){ return formatLog(RW._pipeLog); };
  // A click that did not happen is not an action: take its entry back.
  function unlogLast() { RW._pipeLog = RW._pipeLog.slice(0, -1); }
  function logAction(kind, what) {
    const snap = host.readPanel();
    const entry = makeLogEntry({
      at: Date.now(), kind: kind, what: what, hint: snap.open ? snap.hint : '', tool: snap.open ? snap.tool : host.readActiveTool(),
      revBefore: parseRevision(host.readRevision()),
    });
    RW._pipeLog = appendLog(RW._pipeLog, entry, PIPE_LOG_MAX);
    setTimeout(function(){ entry.revAfter = parseRevision(host.readRevision()); }, PIPE_LOG_AFTER_MS);
  }

  /* ---------- running an entry ---------- */
  let inputEl = null;
  function runEntry(entry) {
    // Blur first: native ignores a tool key while a form field has focus, and the bar's input is one.
    if (inputEl && inputEl.blur) inputEl.blur();
    // While a placement panel is open only the ways out and the view/undo actions may run.
    const iso = isolationVerdict({ panelOpen: host.readPanel().open, name: entry.name, allowed: PIPE_ISOLATION_ALLOWED });
    if (!iso.ok) { status(iso.message); return false; }
    if (entry.kind === 'adjust') return runAdjust();
    if (entry.kind === 'setting') return startSetting(entry);
    const plan = planEntry(entry, stateFor(entry));
    if (plan.action !== 'click') { status(plan.message); return false; }
    const before = host.readActiveTool();
    logAction(entry.kind, entry.kind + ' ' + entry.name);
    if (!host.clickEntry(entry)) { unlogLast(); status(entry.name + ': nothing to click on this page'); return false; }
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
  const COLORS = { tool: '#a8e6a3', action: '#8ecae6', adjust: '#8ecae6', setting: '#8ecae6', system: '#e6c8ff', disabled: '#888' };

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
  function hideMenu() { lastCall.on = false; if (menuEl) menuEl.style.display = 'none'; menuItems = []; menuHighlight = -1; }
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
    if (sizesUi.active && sizesUi.header) {
      const head = document.createElement('div');
      head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;border-bottom:1px solid #444;';
      head.textContent = sizesUi.header;
      menuEl.appendChild(head);
    }
    if (lastCall.on) {
      const head = document.createElement('div');
      head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;border-bottom:1px solid #444;';
      head.textContent = LAST_CALL_TEXT;
      menuEl.appendChild(head);
    }
    if (settingUi.active && settingUi.header) {
      const head = document.createElement('div');
      head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;border-bottom:1px solid #444;';
      head.textContent = settingUi.header;
      menuEl.appendChild(head);
    }
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
      if (row.size) {
        usable = true; color = COLORS.tool; label = row.size.text;
      } else if (row.setting) {
        usable = true; color = COLORS.tool; label = optionRowText(row.setting.option, row.setting.index) + (row.setting.current ? '  (now)' : '');
      } else if (row.system) {
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
      el.addEventListener('click', function(){ if (row.size) pickSizeChoice(row.size); else if (row.setting) applyPickedSetting(row.setting.option); else if (row.system) pickSystem(row.system); else if (row.prompt) pickPrompt(row.prompt); else runAndClear(row.entry); });
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
    if (sizesUi.active) { return; } // the sizes step owns the menu; typing is the value being entered
    if (settingUi.active) { refreshSettingRows(); return; } // the setting prompt owns the menu
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
    logAction('system', 'set system dropdown: ' + system.name);
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
    logAction('label', 'chose ' + plan.id);
    if (!host.clickFamily(plan.id)) { unlogLast(); status(plan.label + ': could not be chosen (the menu changed)'); refreshPrompt(); return; }
    status(plan.label + ' chosen');
    endPrompt();
    // Native has just moved keyboard focus onto its own label button (subtype.focus()), and that
    // button opens its menu on Enter / Space / ArrowDown. For a moment, swallow those keys if they
    // land on it, and take focus back once so the key's own release or repeat lands harmlessly on our bar.
    labelGuardUntil = Date.now() + LABEL_GUARD_MS;
    setTimeout(refocusBarOnce, 0);
  }
  let unknownHintWarned = null;

  /* ---------- Step 3: port prompt (display only) and Enter-to-Finish ---------- */
  let finishLatch = FINISH_LATCH_OFF;
  let portNoteRole = null, portNoteShown = false;
  // While native asks for a port ("Click the detected intersection for <role>."), say which one. It
  // never takes focus (Esc and clicks keep going to the app) and never clicks anything.
  function updatePortNote(snap) {
    const role = (snap.open && panelPhase(snap.hint, PIPE_HINT_PREFIXES) === 'ports') ? portRoleFromHint(snap.hint, PIPE_PORT_ROLE_PATTERN) : null;
    let line = null;
    if (role) {
      // With Adjust ports ticked every role is asked from scratch, so "n of N" is exact; otherwise role only.
      const adjustOn = host.readAdjustPorts().checked === true;
      const famId = host.readChosenFamilyId();
      const rules = adjustOn && famId ? host.readFamilyRules(famId) : null;
      line = portLine({ role: role, adjustOn: adjustOn, portContract: rules && rules.readable ? rules.portContract : null });
    }
    if (line === portNoteRole) return;
    portNoteRole = line;
    if (!line) {
      // The note goes away unless the person has typed something into the bar (then the list is theirs).
      if (portNoteShown) { portNoteShown = false; if (!prompt.active && !sizesUi.active && (document.activeElement !== inputEl || !inputEl.value)) hideMenu(); }
      return;
    }
    mountBar();
    if (!inputEl || prompt.active) return;
    ensureMenu();
    menuItems = []; menuHighlight = -1;
    menuEl.innerHTML = '';
    const head = document.createElement('div');
    head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;';
    head.textContent = line;
    menuEl.appendChild(head);
    positionMenu();
    menuEl.style.display = 'block';
    portNoteShown = true;
    status(line);
  }

  /* ---------- Step 3b: port sizes on reducing fittings (keyboard only) ---------- */
  // At ready, for a fitting with per-port size fields, the bar shows two rows ("Use port sizes as is" /
  // "Edit port sizes"). Editing collects typed sizes and writes them into native's own select + custom
  // pair only when a NEW placement is open and ready and nothing is selected (on an existing selected
  // fitting, native saves a size change). Nothing here finishes: Enter-to-Finish stays its own press.
  const sizesUi = { active: false, header: '' };
  const LAST_CALL_TEXT = 'Esc again cancels the placement';
  const lastCall = { on: false };
  let sizes = { stage: SIZES_IDLE.stage, key: null, index: 0, drafts: {}, confirmed: null, mode: null };
  let placementCount = 0, panelWasOpen = false, sizesBlockedWarned = false, rulesUnreadableWarned = false;

  function sizesFacts(snap) {
    const pf = host.readPortFields();
    const sel = host.readSelection();
    const famId = host.readChosenFamilyId();
    const ready = snap.open && String(snap.hint || '').trim().startsWith(PIPE_FINISH_HINT_PREFIX) && PIPE_SIZE_TOOLS.indexOf(snap.tool) !== -1;
    const key = sizesKey({ placement: placementCount, familyId: famId, roles: pf.fields.map(function(f){ return f.role; }) });
    // Which step does this placement get at ready? 'sizes' = per-port fields (use as is / edit / adjust);
    // 'ports' = one size, but the app offers Adjust ports and it is not ticked yet (continue as is / adjust);
    // null = nothing: Enter finishes at once.
    let mode = null;
    if (ready) {
      if (pf.present) mode = 'sizes';
      else if (adjustVerdict(adjustFacts()).ok) mode = 'ports';
    }
    // The selection rules guard SIZE writes. A ports-only step writes nothing, so a selection is not its concern.
    const stepSel = mode === 'ports' ? { selectionReadable: true, selectedEntityId: null } : sel;
    return { pf: pf, sel: sel, stepSel: stepSel, famId: famId, ready: ready, key: key, current: roleSizes(pf.fields), mode: mode, step: mode !== null };
  }
  function currentViolations(f) {
    if (!f.pf.present || !f.famId) return [];
    const rules = host.readFamilyRules(f.famId);
    if (!rules.readable) return null; // unreadable: warn, never block
    return maxViolations(f.current, rules.maximumProfileByPort);
  }
  // The extra conditions Enter-to-Finish must meet for a fitting with per-port sizes.
  function currentSizesGate(snap) {
    const f = sizesFacts(snap);
    const v = currentViolations(f);
    return sizesFinishGate({
      perPort: f.step && PIPE_SIZE_TOOLS.indexOf(snap.tool) !== -1,
      stage: sizes.key === f.key ? sizes.stage : 'idle', confirmed: sizes.confirmed, current: f.current,
      violations: v || [], selectedEntityId: f.stepSel.selectedEntityId, selectionReadable: f.stepSel.selectionReadable,
    });
  }
  function resetSizes() {
    sizes = { stage: SIZES_IDLE.stage, key: null, index: 0, drafts: {}, confirmed: null, mode: null };
    sizesBlockedWarned = false; rulesUnreadableWarned = false;
    if (lastCall.on) hideMenu();
    if (sizesUi.active) { sizesUi.active = false; sizesUi.header = ''; hideMenu(); }
  }
  function renderSizesChoice() {
    sizesUi.active = true;
    const single = sizes.mode === 'ports';
    sizesUi.header = (single ? 'Ports: pick one' : 'Port sizes: pick one') + ' (Enter or Space)';
    menuItems = sizeChoiceRows({ adjustUsable: adjustVerdict(adjustFacts()).ok, singleSize: single, adjustOn: host.readAdjustPorts().checked === true }).map(function(c){ return { size: c }; });
    menuHighlight = 0;
    ensureMenu(); renderMenu();
  }
  function renderSizesEdit(field) {
    sizesUi.active = true;
    const cur = formatSize(effectiveSize(field) || 0);
    sizesUi.header = field.role + ' diameter (now ' + (cur ? cur + '"' : 'blank') + '): type a size, Enter = keep, Esc = back. Use 2-1/2, not 2 1/2';
    menuItems = []; menuHighlight = -1;
    ensureMenu();
    menuEl.innerHTML = '';
    const head = document.createElement('div');
    head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;';
    head.textContent = sizesUi.header;
    menuEl.appendChild(head);
    positionMenu();
    menuEl.style.display = 'block';
  }
  function openSizesChoice() {
    sizes.stage = 'choice'; sizes.index = 0; sizes.drafts = {};
    const opened = sizesFacts(host.readPanel());
    sizes.key = opened.key; sizes.mode = opened.mode || sizes.mode;
    mountBar();
    if (!inputEl) return;
    inputEl.value = '';
    inputEl.focus();
    renderSizesChoice();
  }
  // Tick or untick native's Adjust ports box (placement state only; nothing is saved).
  // again: from the choices, "Adjust ports again" when the box is already ticked: untick (the app goes back to its
  // automatic assignment), then tick (it asks for every port from scratch). Typed `adjust` just toggles.
  function runAdjust(again) {
    const v = adjustVerdict(adjustFacts());
    if (!v.ok) { status(v.message); return false; }
    const wasOn = host.readAdjustPorts().checked === true;
    const redo = !!again && wasOn;
    logAction('adjust', redo ? 'adjusted ports again (unticked, ticked Adjust ports)' : (wasOn ? 'unticked' : 'ticked') + ' Adjust ports');
    let r = host.clickAdjustPorts();
    if (r.ok && redo) {
      // the first click must have unticked it; only then tick it again (never click blindly twice)
      r = r.checked === false ? host.clickAdjustPorts() : { ok: false };
    }
    if (!r.ok) { unlogLast(); status('adjust ports: could not change it'); return false; }
    own.lastCmdAt = Date.now();
    const keep = placementCount; resetSizes(); placementCount = keep;
    status(r.checked
      ? 'adjust ports on: click each port in the order the bar shows (click an assigned port again to undo)'
      : 'adjust ports off: the app assigns the ports itself');
    return true;
  }
  function sizeTick(snap) {
    if (!snap.open) { if (panelWasOpen) resetSizes(); panelWasOpen = false; return; }
    if (!panelWasOpen) { placementCount += 1; panelWasOpen = true; resetSizes(); }
    const f = sizesFacts(snap);
    if (sizes.key !== null && sizes.key !== f.key) { const keep = placementCount; resetSizes(); placementCount = keep; }
    // Leaving ready (a label change, the ports phase after Adjust ports, saving) forgets any confirmation:
    // assigning ports reseeds the sizes, so the rows ask again when ready returns.
    if (!f.ready) { const keep = placementCount; resetSizes(); placementCount = keep; return; }
    const plan = sizesTickPlan({
      state: sizes, key: f.key, perPort: f.step, ready: f.ready,
      selectedEntityId: f.stepSel.selectedEntityId, selectionReadable: f.stepSel.selectionReadable,
    });
    if (plan.action === 'blocked') {
      if (!sizesBlockedWarned) { sizesBlockedWarned = true; status(sizeWriteVerdict({ panelOpen: true, ready: true, selectionReadable: f.sel.selectionReadable, selectedEntityId: f.sel.selectedEntityId }).message); }
      return;
    }
    if (plan.action === 'open' && !prompt.active) { sizes.key = f.key; openSizesChoice(); }
    // The menu goes away when the bar loses focus; bring the current step's rows back (no focus change).
    if (sizesUi.active && (!menuEl || menuEl.style.display === 'none')) {
      if (sizes.stage === 'choice') renderSizesChoice();
      else if (sizes.stage === 'edit') { const fs = editableFields(f.pf.fields); if (fs[sizes.index]) renderSizesEdit(fs[sizes.index]); }
    }
  }
  function pickSizeChoice(choice) {
    lastCall.on = false;
    if (choice.id === 'adjust') { sizesUi.active = false; sizesUi.header = ''; hideMenu(); runAdjust(true); return; }
    if (choice.id === 'asis') { confirmSizes('kept'); return; }
    // edit: ask for each editable port in on-screen order
    sizes.stage = 'edit'; sizes.index = 0; sizes.drafts = {};
    askNextSize();
  }
  function askNextSize() {
    const snap = host.readPanel();
    const f = sizesFacts(snap);
    const fields = editableFields(f.pf.fields);
    if (sizes.index >= fields.length) { applySizes(f, fields); return; }
    if (inputEl) { inputEl.value = ''; inputEl.focus(); }
    renderSizesEdit(fields[sizes.index]);
  }
  function enterSizeValue() {
    const snap = host.readPanel();
    const f = sizesFacts(snap);
    const fields = editableFields(f.pf.fields);
    const field = fields[sizes.index];
    if (!field) { openSizesChoice(); return; }
    const typed = inputEl.value.trim();
    if (typed) {
      const plan = planSizeInput(typed);
      if (!plan.ok) { status('port sizes: ' + plan.message); return; }
      sizes.drafts[field.cap] = plan.value;
    }
    sizes.index += 1;
    askNextSize();
  }
  function applySizes(f, fields) {
    const caps = Object.keys(sizes.drafts);
    for (let i = 0; i < caps.length; i++) {
      const field = fields.filter(function(x){ return x.cap === caps[i]; })[0];
      const fresh = sizesFacts(host.readPanel());
      const verdict = sizeWriteVerdict({
        panelOpen: host.readPanel().open, ready: fresh.ready, selectionReadable: fresh.sel.selectionReadable,
        selectedEntityId: fresh.sel.selectedEntityId, fieldDisabled: !field || field.disabled,
      });
      if (!verdict.ok) { status(verdict.message); openSizesChoice(); return; }
      const write = planSizeWrite(sizes.drafts[caps[i]], field.optionValues);
      logAction('sizes', 'set ' + field.role + ' to ' + formatSize(sizes.drafts[caps[i]]) + '"');
      if (!host.writePortSize(field.cap, write).ok) { unlogLast(); status('port sizes: could not change ' + field.role); openSizesChoice(); return; }
    }
    // Native focuses its custom box when "Custom" is picked: take the keyboard back once, and guard the keys.
    labelGuardUntil = Date.now() + LABEL_GUARD_MS;
    setTimeout(refocusBarOnce, 0);
    confirmSizes(caps.length ? 'set' : 'kept');
  }
  function confirmSizes(how) {
    const snap = host.readPanel();
    const f = sizesFacts(snap);
    sizes.stage = 'confirmed'; sizes.key = f.key; sizes.confirmed = f.current; sizes.drafts = {};
    sizesUi.active = false; sizesUi.header = '';
    hideMenu();
    if (inputEl) inputEl.value = '';
    if (f.mode === 'ports') { status('ports kept as detected. Enter finishes'); return; }
    const shown = Object.keys(f.current).map(function(r){ return r + ' ' + (f.current[r] ? formatSize(f.current[r]) + '"' : '?'); }).join(', ');
    const v = currentViolations(f);
    if (v === null) {
      if (!rulesUnreadableWarned) { rulesUnreadableWarned = true; }
      status('port sizes ' + how + ' (' + shown + '). Could not read the max-size rules, so the server will check them. Enter finishes');
    } else if (v.length) {
      status('port sizes ' + how + ' (' + shown + '). ' + v[0] + '. Enter will not finish until this is fixed');
    } else {
      status('port sizes ' + how + ' (' + shown + '). Enter finishes');
    }
  }

  /* ---------- Step 5: setting commands (diameter, dsource, material, msource) ---------- */
  // Each opens a small prompt in the bar (a size to type, or the select's own options to pick) and writes
  // native's next-draw control only when nothing is selected and no fitting is being placed (with a pipe
  // selected, native's diameter handlers send a saved resize). The host checks again before writing.
  const settingUi = { active: false, stage: null, entry: null, options: [], header: '' };
  function settingNow(entry, st) {
    const c = st.controls[entry.control] || {};
    if (entry.control === 'diameter') {
      const size = effectiveSize({ selectValue: c.value, customValue: (st.controls.custom || {}).value });
      return size ? formatSize(size) + '"' : 'unresolved';
    }
    const hit = (c.options || []).filter(function(o){ return o.value === c.value; })[0];
    return hit ? (hit.text || hit.value || 'blank') : (c.value || 'blank');
  }
  function renderSettingHeader() {
    const st = host.readSettings();
    const entry = settingUi.entry;
    settingUi.header = entry.label + ' (now ' + settingNow(entry, st) + ', applies to the next pipe): '
      + (settingUi.stage === 'value' ? 'type a size, Enter applies, Esc cancels. Use 2-1/2, not 2 1/2' : 'pick one (type to filter, or a number), Esc cancels');
  }
  function refreshSettingRows() {
    const st = host.readSettings();
    const c = st.controls[settingUi.entry.control] || { options: [] };
    settingUi.options = c.options || [];
    renderSettingHeader();
    ensureMenu();
    if (settingUi.stage === 'value') {
      menuItems = []; menuHighlight = -1;
      menuEl.innerHTML = '';
      const head = document.createElement('div');
      head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;';
      head.textContent = settingUi.header;
      menuEl.appendChild(head);
      positionMenu();
      menuEl.style.display = 'block';
      return;
    }
    const q = (inputEl ? inputEl.value : '').trim().toLowerCase();
    const rows = settingUi.options.map(function(o, i){ return { setting: { option: o, index: i, current: o.value === c.value } }; });
    menuItems = q ? rows.filter(function(r){
      const o = r.setting.option;
      return (/^\d+$/.test(q) && r.setting.index + 1 === Number(q)) || o.text.toLowerCase().indexOf(q) !== -1 || o.value.toLowerCase().indexOf(q) !== -1;
    }) : rows;
    const cur = menuItems.findIndex(function(r){ return r.setting.current; });
    menuHighlight = menuItems.length ? (q || cur < 0 ? 0 : cur) : -1;
    renderMenu();
  }
  function startSetting(entry) {
    const v = settingVerdict(settingFacts(entry));
    if (!v.ok) { status(v.message); return false; }
    mountBar();
    if (!inputEl) return false;
    settingUi.active = true; settingUi.entry = entry; settingUi.stage = entry.valueKind === 'size' ? 'value' : 'pick';
    inputEl.value = '';
    inputEl.focus();
    refreshSettingRows();
    return true;
  }
  function endSetting(how) {
    if (!settingUi.active) return;
    const label = settingUi.entry ? settingUi.entry.label : 'setting';
    settingUi.active = false; settingUi.stage = null; settingUi.entry = null; settingUi.options = []; settingUi.header = '';
    if (inputEl) inputEl.value = '';
    hideMenu();
    if (how === 'cancelled') status(label + ': unchanged');
  }
  function enterSetting() {
    const entry = settingUi.entry;
    const typed = inputEl.value.trim();
    if (settingUi.stage === 'value') {
      if (!typed) { endSetting('cancelled'); if (inputEl) inputEl.blur(); return; }
      const st = host.readSettings();
      const plan = diameterPlan(typed, ((st.controls.diameter || {}).options || []).map(function(o){ return o.value; }));
      if (!plan.ok) { status(entry.label + ': ' + plan.message); return; }
      applySetting(entry, plan, formatSize(plan.value) + '"');
      return;
    }
    if (typed) {
      const m = optionMatch(settingUi.options, typed);
      if (!m.ok) { status(entry.label + ': ' + m.message); return; }
      applyPickedSetting(m.option);
    } else if (menuHighlight >= 0 && menuItems[menuHighlight] && menuItems[menuHighlight].setting) {
      applyPickedSetting(menuItems[menuHighlight].setting.option);
    } else status(entry.label + ': nothing matches');
  }
  function applyPickedSetting(option) {
    if (!settingUi.active) return;
    applySetting(settingUi.entry, { mode: 'select', selectValue: option.value }, option.text || option.value || 'blank');
  }
  function applySetting(entry, plan, shown) {
    const v = settingVerdict(settingFacts(entry));
    if (!v.ok) { status(v.message); endSetting(); if (inputEl) inputEl.blur(); return false; }
    logAction('setting', 'set ' + entry.name + ' to ' + shown);
    const r = host.writeSetting(entry.control, plan);
    if (!r.ok) {
      unlogLast(); status(entry.label + ': could not be changed (' + r.reason + '), nothing was written');
      endSetting(); if (inputEl) inputEl.blur(); return false;
    }
    own.lastCmdAt = Date.now();
    endSetting();
    // Native may focus the custom box when "Custom" is picked: take the keyboard back once, and guard the keys.
    labelGuardUntil = Date.now() + LABEL_GUARD_MS;
    setTimeout(refocusBarOnce, 0);
    report(entry, plan, shown, r);
    // Native rewrites these controls from its stored facts now and then: look again a moment later.
    setTimeout(function(){ recheckSetting(entry, plan, shown); }, 400);
    if (inputEl) inputEl.blur();
    return true;
  }
  function readBack(entry) {
    const st = host.readSettings();
    return { selectValue: (st.controls[entry.control] || {}).value, customValue: (st.controls.custom || {}).value, st: st };
  }
  function report(entry, plan, shown, r) {
    const back = readbackVerdict(plan, r);
    status(back.ok ? entry.label + ' set to ' + shown + ' (next pipe)'
      : entry.label + ': asked for ' + shown + ' but ' + back.message + ' (now ' + settingNow(entry, readBack(entry).st) + ')');
  }
  function recheckSetting(entry, plan, shown) {
    const b = readBack(entry);
    const back = readbackVerdict(plan, b);
    if (!back.ok) status(entry.label + ': the app changed it back (now ' + settingNow(entry, b.st) + ')');
  }

  function finishFacts(e) {
    const snap = host.readPanel();
    const fin = host.readFinish(PIPE_FINISH_BUTTON_ID);
    return {
      key: e.key, repeat: !!e.repeat, finishKeys: PIPE_FINISH_KEYS,
      barFocused: document.activeElement === inputEl, barEmpty: !!inputEl && !inputEl.value.trim(),
      panelOpen: snap.open, hint: snap.hint, tool: snap.tool,
      allowedTools: PIPE_FINISH_TOOLS, finishPrefix: PIPE_FINISH_HINT_PREFIX,
      latched: finishLatch.clicked,
      sizesGate: currentSizesGate(snap),
      button: {
        found: fin.found, id: fin.id, expectedId: PIPE_FINISH_BUTTON_ID, visible: fin.visible,
        disabled: fin.disabled, ariaDisabled: fin.ariaDisabled,
        forbidden: fin.found ? targetForbidden(fin, { forbiddenTexts: PIPE_FORBIDDEN_BUTTON_TEXTS, forbiddenContainerIds: PIPE_FORBIDDEN_CONTAINER_IDS }) : false,
      },
    };
  }
  // Enter on an empty bar: click Finish if (and only if) every condition holds, checked twice.
  // Returns true when the key was dealt with (so the generic Enter path is skipped).
  function tryFinish(e) {
    const first = finishVerdict(finishFacts(e));
    if (!first.ok && first.reopen && !sizesUi.active) openSizesChoice();
    if (!first.ok) { if (first.message) status(first.message); return first.reason !== 'not-enter' && first.reason !== 'bar' && first.reason !== 'no-panel' && first.reason !== 'phase'; }
    const second = finishVerdict(finishFacts(e)); // fresh read right before the click
    if (!second.ok) { if (second.message) status(second.message); return true; }
    const label = (host.readPanel().tool || 'fitting');
    logAction('finish', 'clicked Finish (' + label + ')');
    if (!host.clickFinish(PIPE_FINISH_BUTTON_ID)) { status('Finish is not available right now'); unlogLast(); return true; }
    finishLatch = finishLatchClick(Date.now());
    own.lastCmdAt = Date.now();
    status('Finish pressed (' + label + '): placing it now');
    return true;
  }
  const LABEL_GUARD_MS = 700;
  let labelGuardUntil = 0;
  function refocusBarOnce() {
    // Once, never in a loop; only if native really did take focus into its own panel.
    if (!inputEl || document.activeElement === inputEl) return;
    if (host.readPanel().open && (host.focusInPanel() || host.isPortControl(document.activeElement))) inputEl.focus();
    else if (host.isSettingControl(document.activeElement)) inputEl.blur();
  }
  // Called every 250ms: opens the prompt when native reaches the label phase, closes it when it leaves.
  function promptTick() {
    const snap = host.readPanel();
    // Step 3: release the Finish latch when native has been through "saving" and is back, or closed.
    finishLatch = finishLatchStep({
      latch: finishLatch, phase: snap.open ? panelPhase(snap.hint, PIPE_HINT_PREFIXES) : 'closed',
      panelOpen: snap.open, now: Date.now(), expireMs: PIPE_FINISH_LATCH_MS,
    });
    updatePortNote(snap);
    sizeTick(snap);
    if (settingUi.active) {
      const sv = settingVerdict(settingFacts(settingUi.entry));
      if (!sv.ok) { status(sv.message); endSetting(); }
    }
    // Safety net: a hint we don't recognise means native changed this step. One line, nothing else.
    const watch = hintWatch({ open: snap.open, hint: snap.hint, prefixes: PIPE_HINT_PREFIXES, lastWarned: unknownHintWarned });
    unknownHintWarned = watch.hint;
    if (watch.action === 'warn') { status(PIPE_NATIVE_CHANGED_MESSAGE); endPrompt(); return; }
    const phase = snap.open ? panelPhase(snap.hint, PIPE_HINT_PREFIXES) : 'closed';
    if (phase !== 'label') { prompt.dismissed = false; endPrompt(); return; }
    if (prompt.active || prompt.dismissed) return;
    if (host.anyDialogOpen()) return;
    startPrompt();
  }
  function reopenPrompt() { prompt.dismissed = false; startPrompt(); }

  function clearBar() { if (settingUi.active) return; if (inputEl) inputEl.value = ''; hideMenu(); }
  // A command that can't run (unknown, not usable now, refused): say why, empty the bar and keep the keyboard
  // in it, so the next command can be typed straight away.
  function rejectBar(message) {
    if (message) status(message);
    if (!inputEl || settingUi.active) return;
    inputEl.value = '';
    hideMenu();
    inputEl.focus();
  }
  // Esc at the ready phase steps back one level before native's Esc may cancel the placement (escStepPlan).
  // Returns true when the key was ours (the caller swallows it).
  function escStepBack() {
    const snap = host.readPanel();
    const f = sizesFacts(snap);
    const plan = escStepPlan({ ready: f.ready, mode: f.mode, stage: sizes.key === f.key ? sizes.stage : 'idle', lastCall: lastCall.on });
    if (plan.action === 'reopen') {
      openSizesChoice();
      status('port sizes: pick again. Esc closes this, Esc again cancels the placement');
      return true;
    }
    if (plan.action === 'lastcall') {
      mountBar();
      if (!inputEl) return false;
      inputEl.value = '';
      inputEl.focus();
      menuItems = adjustVerdict(adjustFacts()).ok
        ? [{ size: host.readAdjustPorts().checked === true ? SIZE_CHOICE_READJUST : SIZE_CHOICE_ADJUST }] : [];
      menuHighlight = menuItems.length ? 0 : -1;
      lastCall.on = true;
      if (menuItems.length) renderMenu();
      else {
        ensureMenu();
        menuEl.innerHTML = '';
        const head = document.createElement('div');
        head.style.cssText = 'padding:3px 6px;font-size:11px;color:#ffd166;';
        head.textContent = LAST_CALL_TEXT;
        menuEl.appendChild(head);
        positionMenu();
        menuEl.style.display = 'block';
      }
      status(LAST_CALL_TEXT);
      return true;
    }
    if (plan.action === 'leave') hideMenu();
    return false;
  }
  function runAndClear(entry) { if (runEntry(entry)) clearBar(); else rejectBar(); }

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
    inputEl.addEventListener('input', function(){ lastCall.on = false; openMenu(inputEl.value); });
    inputEl.addEventListener('keydown', onInputKeydown);
    inputEl.addEventListener('blur', function(){
      setTimeout(function(){ if (document.activeElement !== inputEl) { if (settingUi.active) endSetting('cancelled'); hideMenu(); } }, 150);
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
        inputEl.value = row.size ? '' : row.setting ? String(row.setting.index + 1) : row.system ? '#' + row.system.name : row.prompt ? (row.prompt.kind === 'category' ? String(row.prompt.ports) : row.prompt.entry.id) : row.entry.name;
      }
      return;
    }
    if (settingUi.active && (e.key === 'Enter' || e.key === ' ')) {
      // Consumed before anything is written: the same real keypress must not also reach native.
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      enterSetting();
      return;
    }
    if (e.key === 'Escape' && settingUi.active) {
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      endSetting('cancelled');
      if (inputEl) inputEl.blur();
      return;
    }
    if (sizesUi.active && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (sizes.stage === 'choice') {
        // The typed word `adjust` (or its aliases) still works while the rows are open.
        const typedWord = inputEl.value.trim().toLowerCase();
        if (typedWord && [PIPE_ADJUST_ENTRY.name].concat(PIPE_ADJUST_ENTRY.aliases).indexOf(typedWord) !== -1) {
          inputEl.value = '';
          pickSizeChoice({ id: 'adjust' });
        } else if (menuHighlight >= 0 && menuItems[menuHighlight]) pickSizeChoice(menuItems[menuHighlight].size);
      }
      else if (sizes.stage === 'edit') enterSizeValue();
      return;
    }
    if (lastCall.on && menuItems.length && menuHighlight >= 0 && !inputEl.value && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      pickSizeChoice(menuItems[menuHighlight].size);
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
      // Enter or Space on an empty bar while a fitting/fixture is ready: Finish. Nowhere else.
      if (!typed && !prompt.active && tryFinish(e)) return;
      if (systemQuery(typed) !== null) {
        if (menuHighlight >= 0 && menuItems[menuHighlight] && menuItems[menuHighlight].system) pickSystem(menuItems[menuHighlight].system);
        else status('system: nothing matches "' + typed.slice(1) + '"');
        return;
      }
      // An exact name/label/alias always wins; otherwise run the highlighted completion.
      const plan = planQuery(currentTable(), typed, stateFor);
      if (typed && plan.action !== 'status') { if (runEntry(plan.entry)) clearBar(); else rejectBar(); return; }
      // An exact name that is not usable right now says why; it never runs some other highlighted row instead.
      if (typed && plan.entry) { rejectBar(plan.message); return; }
      if (menuHighlight >= 0 && menuItems[menuHighlight]) { runAndClear(menuItems[menuHighlight].entry); return; }
      if (typed) rejectBar(plan.message);
      return;
    }
    if (e.key === 'Escape' && sizesUi.active) {
      // Esc steps back: editing -> the two rows; the two rows -> closed (the next Esc reaches native and cancels).
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (sizes.stage === 'edit') { openSizesChoice(); return; }
      sizes.stage = 'dismissed'; sizesUi.active = false; sizesUi.header = ''; hideMenu();
      if (inputEl) inputEl.value = '';
      return;
    }
    if (e.key === 'Escape' && !inputEl.value && (lastCall.on || !menuEl || menuEl.style.display === 'none') && escStepBack()) {
      e.preventDefault(); e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
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
      if (!host.isLabelTrigger(e.target) && !host.isPortControl(e.target) && !host.isSettingControl(e.target)) return;
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
    if (e.key === 'Escape' && !typingInFormField && RW.enabled && !settingUi.active && !host.anyDialogOpen() && escStepBack()) {
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    if (!shouldCapture) return;

    // AutoCAD's Space: nothing typed -> close the armed tool to select, else repeat the last tool,
    // else show what can be armed.
    if (e.key === ' ' && barEmpty && host.readPanel().open) {
      e.preventDefault(); e.stopImmediatePropagation();
      const snap = host.readPanel();
      const phase = panelPhase(snap.hint, PIPE_HINT_PREFIXES);
      if (phase === 'label') reopenPrompt();
      else if (phase === 'unknown' && String(snap.hint || '').trim()) status(PIPE_NATIVE_CHANGED_MESSAGE);
      else if (phase === 'ready' && String(snap.hint || '').trim().startsWith(PIPE_FINISH_HINT_PREFIX)) {
        // The bar is not focused, so this press must not save: focus it. A press in the bar then finishes.
        mountBar(); if (inputEl) inputEl.focus();
        status('bar focused: press Enter or Space again to finish (Esc cancels)');
      }
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
  RW._pipeHost = host; // for tests and console diagnosis
  RW._pipePrompt = prompt;
  const first = derive();
  RW._commitStatus && RW._commitStatus('piping command line ready: ' + first.tools.length + ' tools, '
    + PIPE_GRAPH_ACTIONS.length + ' actions (tools read from the ' + first.info.source + ')');
  return 'piping command line installed';
})()
