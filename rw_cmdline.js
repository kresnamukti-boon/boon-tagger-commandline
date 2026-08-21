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
  // `quiet` (added for the auto-select feature below): when true, the readout
  // goes to console.log only, not the status line — an auto-revert firing on
  // every finished shape would otherwise repeatedly stomp messages the
  // annotator actually needs to read (tag-selection confirmations, tag
  // auto-detect results). Every existing call site omits it and is
  // unaffected.
  RW._cmdDispatchAppKey = function(key, quiet){
    const as = (typeof annotationState !== 'undefined') ? annotationState : null;
    const before = as ? as.currentTool : undefined;
    const evt = new KeyboardEvent('keydown', {key:key, bubbles:true, cancelable:true});
    evt.__rwSynthetic = true;
    document.dispatchEvent(evt);
    const after = as ? as.currentTool : undefined;
    // Resync the auto-select watcher's own last-seen value to whatever this
    // deliberate dispatch produced. Without this, dispatching `pan` (which
    // clears currentTool) would look identical to a tool finishing on its
    // own, and the watcher would immediately fight the user back to select.
    RW._cmdToolPrev = after;
    if (quiet){
      console.log('[RW] (auto) dispatched "' + key + '" — currentTool: ' + before + ' -> ' + after);
      return;
    }
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
    const fn = function(){ RW._cmdDispatchAppKey('d'); RW._cmdDispatchAppKey(key); };
    // Marks this as an actual drawing tool (not a mode switch like pan/select/label/
    // crop/mirror) so RW.runCommand can stamp RW._cmdLastTool below — the "repeat the
    // last tool" feature only ever wants to repeat a real tool, never a mode switch.
    fn.__isDrawTool = true;
    return fn;
  }
  function nativeKey(key){
    const fn = function(){ RW._cmdDispatchAppKey(key); };
    // Marks this as a mode switch (pan/select/label/crop/mirror) so RW.runCommand
    // can stamp RW._cmdModeActive below — Space's "force select from label" branch
    // needs to know which mode we're deliberately sitting in, self-maintained the
    // same way RW._cmdToolArmed already is rather than re-reading annotationState.
    fn.__isModeSwitch = true;
    return fn;
  }

  const NATIVE = 'native';

  RW._cmdTable = [
    // No workbench-command aliases to avoid colliding with anymore, so every
    // native tool gets its own real app-keymap letter (wand=k, pan=a,
    // select=s, polygon=r) — on the full command-line branch those four were
    // reserved for workbench cut/addmode/snap/rect.
    { name:'linear',   kind:NATIVE, aliases:['q'],  run: nativeDrawTool('q') },
    { name:'rect',     kind:NATIVE, aliases:['w','bbox'], run: nativeDrawTool('w') }, // AutoCAD-ish rename; `bbox` kept as an alias
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
    { name:'mline',    kind:NATIVE, aliases:['p','ribbon'], run: nativeDrawTool('p') }, // AutoCAD-ish rename; `ribbon` kept as an alias
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

  /* ---------- tool settings diagnostic (read-only DOM probe) ---------- */
  // Wand, wrap, and mline are documented (README's own app keymap) as having
  // dedicated per-tool settings — wand's tolerance/detail sliders, mline's
  // width — but this codebase has never queried the app's settings DOM at
  // all, only dispatched keys to it. This is a one-shot, console-only
  // diagnostic in the same spirit as RW._panDiagnose below: it answers "what
  // does the real DOM look like" so a real detector can be built from actual
  // findings instead of a guess. Purely read-only — no annotationState write,
  // no _commitStatus write (matching RW._panDiagnose, which also never
  // touches the status line), console output + a returned value only.
  //
  // Two independent sweeps, reported separately, since there's no confirmed
  // way yet to associate a settings control with the tool it belongs to:
  // 1. every [data-tool] element (the exact selector round 2's live opencli
  //    inspection already used to confirm data-tool="ribbon") — reports an
  //    `activeGuess` best-effort heuristic, explicitly labeled as a guess,
  //    never asserted as the app's real "currently armed" signal.
  // 2. every likely settings control ANYWHERE on the page (range/number/
  //    checkbox inputs, selects) — reads .value (never getAttribute('value'),
  //    which would return only the initial HTML default, not the live value)
  //    plus min/max/step/name/title/placeholder, and aria-label via
  //    getAttribute since there's no reliably-supported reflected property.
  //
  // Not wired into any user flow — like RW._panDiagnose, this is meant to be
  // run manually from the console once per armed tool (wand, then wrap, then
  // mline) so the outputs can be compared by eye. See README.md.
  RW._toolSettingsDiagnose = function(filter){
    const q = (filter || '').toLowerCase();
    const tools = [];
    const toolEls = document.querySelectorAll('[data-tool]');
    for (const el of toolEls){
      const tool = el.getAttribute('data-tool');
      if (q && (!tool || tool.toLowerCase().indexOf(q) === -1)) continue;
      const cls = el.className || '';
      const activeGuess = el.getAttribute('aria-pressed') === 'true'
        || el.getAttribute('aria-selected') === 'true'
        || /\b(active|selected|current)\b/i.test(cls);
      tools.push({ tool: tool, tag: el.tagName, id: el.id, className: cls, activeGuess: activeGuess });
    }

    const controls = [];
    const selectors = ['input[type="range"]', 'input[type="number"]', 'input[type="checkbox"]', 'select'];
    for (const sel of selectors){
      for (const el of document.querySelectorAll(sel)){
        controls.push({
          tag: el.tagName, type: el.type, id: el.id, name: el.name,
          min: el.min, max: el.max, step: el.step, value: el.value,
          title: el.title, placeholder: el.placeholder,
          ariaLabel: el.getAttribute('aria-label')
        });
      }
    }

    if (console.table){ console.table(tools); console.table(controls); }
    else { console.log('[RW] tool buttons:', tools); console.log('[RW] settings controls:', controls); }
    return { tools: tools, controls: controls };
  };

  /* ---------- tool settings interaction (real ids confirmed live) ---------- */
  // Unlike everything above (a guess awaiting a live check), these prefixes came directly out of a
  // real RW._toolSettingsDiagnose() run plus a manual write-back test on a real job:
  // document.getElementById('magic-wand-tolerance').value = 120 followed by dispatching a plain
  // `input` event took effect immediately AND persisted across further use of the tool — no
  // native-setter workaround needed, unlike the still-unconfirmed annotationState.currentTag
  // write. `change` is also dispatched as cheap insurance for controls that weren't individually
  // write-tested the way wand's tolerance was.
  //
  // Live prefix-based discovery, not a hardcoded per-param table (this replaced an earlier,
  // narrower version that hardcoded every id/min/max — see CLAUDE.md for why). Only the id
  // PREFIX per tool stays hardcoded; every param under it — numeric, checkbox, or select — is
  // discovered by sweeping the page fresh every time, the same querySelectorAll list
  // RW._toolSettingsDiagnose already uses. This means: no stale min/max if the app's own ranges
  // ever change, select/checkbox controls need no separate hardcoded entries, and any FUTURE
  // control that appears under a confirmed prefix (e.g. one only revealed once a checkbox is
  // toggled on) becomes usable the moment it's discoverable, with no code change here at all.
  RW._toolSettingsMap = {
    wand:  { dataTool: 'magic_wand',  prefix: 'magic-wand-' },
    wrap:  { dataTool: 'shrink_wrap', prefix: 'shrink-wrap-' },
    mline: { dataTool: 'ribbon',      prefix: 'ribbon-' }
  };

  function cmdControlType(el){
    if (el.tagName === 'SELECT') return 'select';
    if (el.type === 'checkbox') return 'checkbox';
    return 'number'; // covers both range and number inputs, treated identically today
  }

  // The same control sweep RW._toolSettingsDiagnose uses, reused here rather than duplicated.
  function cmdSweepControls(){
    const out = [];
    const selectors = ['input[type="range"]', 'input[type="number"]', 'input[type="checkbox"]', 'select'];
    for (const sel of selectors){
      for (const el of document.querySelectorAll(sel)) out.push(el);
    }
    return out;
  }

  // Live current value/range/options for each of a tool's params, discovered fresh every call by
  // id prefix — the settings-param menu's data source. Reads the real element's live state (same
  // discipline as RW._toolSettingsDiagnose), never a stale default.
  RW._cmdToolSettingsList = function(tool){
    const entry = RW._toolSettingsMap[tool];
    if (!entry) return [];
    const found = [];
    cmdSweepControls().forEach(function(el){
      if (!el.id || el.id.indexOf(entry.prefix) !== 0) return;
      const param = el.id.slice(entry.prefix.length);
      const type = cmdControlType(el);
      const item = { tool: tool, param: param, id: el.id, type: type };
      if (type === 'select'){
        item.current = el.value;
        item.options = Array.from(el.options).map(function(o, i){ return { index: i + 1, value: o.value, text: o.text }; });
      } else if (type === 'checkbox'){
        item.current = el.checked ? 'on' : 'off';
      } else {
        item.min = (el.min !== '' && el.min != null) ? parseFloat(el.min) : undefined;
        item.max = (el.max !== '' && el.max != null) ? parseFloat(el.max) : undefined;
        item.step = el.step || undefined;
        item.current = el.value;
      }
      found.push(item);
    });
    return found;
  };

  // Which of our tracked tools (if any) is currently armed, by matching
  // annotationState.currentTool against each entry's confirmed dataTool
  // value — the same currentTool strings the auto-select watcher already
  // reads (readTool(), defined further below; referencing it here is safe
  // regardless of source order, since this is only ever called at runtime,
  // after the whole module has finished loading). Used to let a tool's own
  // param names be typed bare while it's active — see onInput() below.
  RW._cmdActiveSettingsTool = function(){
    const cur = (typeof readTool === 'function') ? readTool() : null;
    if (!cur) return null;
    for (const name in RW._toolSettingsMap){
      if (RW._toolSettingsMap[name].dataTool === cur) return name;
    }
    return null;
  };

  // Accepts on/off/true/false/1/0/yes/no, case-insensitive. Returns null (not a boolean) for
  // anything else, so a genuinely invalid value can be told apart from a real "off".
  function cmdParseBoolish(value){
    const q = String(value).trim().toLowerCase();
    if (['on', 'true', '1', 'yes'].indexOf(q) !== -1) return true;
    if (['off', 'false', '0', 'no'].indexOf(q) !== -1) return false;
    return null;
  }

  // Matches a typed value against a live <select>'s own options — either an exact 1-based index
  // (the numbered list the user asked for) or the option's own text/value, exact match first,
  // then a prefix match. Never hardcoded: options always come from the real element.
  function cmdMatchOption(options, value){
    const q = String(value).trim();
    const idx = parseInt(q, 10);
    if (!isNaN(idx) && String(idx) === q){
      const byIndex = options.find(function(o){ return o.index === idx; });
      if (byIndex) return byIndex;
    }
    const ql = q.toLowerCase();
    return options.find(function(o){ return o.text.toLowerCase() === ql || o.value.toLowerCase() === ql; })
        || options.find(function(o){ return o.text.toLowerCase().indexOf(ql) === 0; })
        || null;
  }

  // Writes a value to the real control (numeric, checkbox, or select — branching on
  // cmdControlType), clamped/matched against the control's own LIVE state, and re-arms the tool
  // (via RW.runCommand, which also stamps RW._cmdLastUserCmdAt so the auto-select watcher's
  // grace window doesn't immediately fight the re-arm). Reports which control was set and what
  // it's now at; the "confirm it actually applied" hedge is dropped only for the one control this
  // was actually live-tested against (magic-wand-tolerance) — every other control still carries it,
  // matching this project's own convention of not overclaiming confirmation it doesn't have.
  RW._cmdApplySetting = function(tool, param, value){
    const entry = RW._toolSettingsMap[tool];
    if (!entry){ RW._commitStatus && RW._commitStatus('unknown tool: ' + tool); return false; }
    const id = entry.prefix + param;
    const el = document.getElementById(id);
    if (!el){ RW._commitStatus && RW._commitStatus('"' + tool + '.' + param + '" control (#' + id + ') is not on the page right now'); return false; }
    const type = cmdControlType(el);
    const confirmed = (id === 'magic-wand-tolerance');

    if (type === 'checkbox'){
      const v = cmdParseBoolish(value);
      if (v === null){ RW._commitStatus && RW._commitStatus('"' + value + '" is not on/off'); return false; }
      el.checked = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      RW.runCommand(tool);
      RW._commitStatus && RW._commitStatus(tool + '.' + param + ' set to ' + (v ? 'on' : 'off') + ' — re-armed ' + tool + ' (confirm it actually applied)');
      return true;
    }

    if (type === 'select'){
      const options = Array.from(el.options).map(function(o, i){ return { index: i + 1, value: o.value, text: o.text }; });
      const matched = cmdMatchOption(options, value);
      if (!matched){ RW._commitStatus && RW._commitStatus('"' + value + '" doesn\'t match any option for ' + tool + '.' + param); return false; }
      el.value = matched.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      RW.runCommand(tool);
      RW._commitStatus && RW._commitStatus(tool + '.' + param + ' set to "' + matched.text + '" — re-armed ' + tool + ' (confirm it actually applied)');
      return true;
    }

    let v = parseFloat(value);
    if (isNaN(v)){ RW._commitStatus && RW._commitStatus('"' + value + '" is not a number'); return false; }
    if (el.min !== '' && el.min != null) v = Math.max(parseFloat(el.min), v);
    if (el.max !== '' && el.max != null) v = Math.min(parseFloat(el.max), v);
    el.value = String(v); // explicit — a real <input>.value setter stringifies internally anyway
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    RW.runCommand(tool);
    RW._commitStatus && RW._commitStatus(
      tool + '.' + param + ' set to ' + v + ' — re-armed ' + tool
      + (confirmed ? '' : ' (confirm it actually applied)')
    );
    return true;
  };

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
    // Stamped on every successful run — the auto-select watcher's user-grace
    // window (see below) reads this so a deliberately-run command like `pan`
    // isn't immediately fought back to select.
    RW._cmdLastUserCmdAt = Date.now();
    // AutoCAD's own convention: pressing Space with nothing typed repeats the
    // last tool used (see the global auto-capture listener below). Only real
    // draw-tool entries are tracked (nativeDrawTool marks its own closure with
    // __isDrawTool) — mode switches like pan/select/label/crop/mirror never
    // become "the last tool." RW._cmdToolArmed is OUR OWN record of whether a
    // tool is currently armed, updated only by our own actions here and in
    // RW._cmdGoSelect's own close path below — deliberately NOT derived from a
    // fresh readTool() at decision time, since re-reading annotationState right
    // after our own dispatch is exactly the kind of live-timing dependency this
    // project has been burned by before (no confirmed guarantee the app's own
    // state updates synchronously). Running any mode switch (including a bare
    // `select`) also marks nothing armed, same as an explicit close.
    if (entry.run){
      if (entry.run.__isDrawTool){
        RW._cmdLastTool = entry.name; RW._cmdToolArmed = true; RW._cmdModeActive = null;
      } else {
        RW._cmdToolArmed = false;
        // RW._cmdModeActive tracks which deliberate mode switch we're sitting in —
        // `select` means we're at rest (same as never having entered one), every
        // other mode switch (currently just `label`, see SPACE_GOES_SELECT_FROM
        // below) records itself so Space knows to force select instead of falling
        // into the ordinary repeat-last-tool branch.
        RW._cmdModeActive = (entry.run.__isModeSwitch && entry.name !== 'select') ? entry.name : null;
      }
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

  /* ---------- auto-select: the resting state (AutoCAD-style) ---------- */
  // AutoCAD always drops you back to the bare selection cursor once a
  // command finishes or is cancelled. This section makes `select` that
  // resting state via three triggers: on load, on Escape (deferred so the
  // app's own Escape handling runs first), and on a poll that notices
  // annotationState.currentTool clearing itself back to null. All three
  // funnel through RW._cmdGoSelect so they can never double-dispatch.
  const AUTOSEL_POLL_MS = 250;          // matches rw_panelux.js's own disarm-poll cadence
  const SELECT_SUPPRESS_MS = 600;       // > 2 poll ticks, so a post-dispatch async null can't double-fire
  const AUTOSEL_USER_GRACE_MS = 1000;   // don't fight a command the user just ran (e.g. `pan`)
  const AUTOSEL_BURST_MAX = 5;          // circuit breaker: more than this many auto-reverts...
  const AUTOSEL_BURST_MS = 5000;        // ...within this window disables the feature outright
  const SELECT_KEY = 's';               // must match the `select` table entry's alias, above
  const SELECT_MODE = 'select';
  const DRAW_MODE = 'draw';
  const KNOWN_MODES = ['pan','select','draw','label','crop','mirror'];
  // Which RW._cmdModeActive values make Space go straight to SELECT, instead of
  // falling into the ordinary "nothing armed -> repeat the last tool" branch
  // below. Scoped to `label` only per live confirmation — pan/draw/crop/mirror
  // keep their existing Space behavior (repeat from idle, close when armed).
  //
  // Round 7d originally had this backwards — see CLAUDE.md's "Round 7d
  // (corrected)" for the live report that caught it: leaving `label` was
  // already falling into the plain repeat-last-tool branch even before this
  // constant existed (every mode switch clears RW._cmdToolArmed to false), and
  // that was exactly the reported bug, not a fix target to preserve. What's
  // needed here is the OPPOSITE override — force select, don't let repeat fire.
  const SPACE_GOES_SELECT_FROM = ['label'];

  RW._cmdAutoSelect = true;             // console escape hatch: __RW._cmdAutoSelect = false
  RW._cmdLastSelectAt = 0;
  RW._cmdLastUserCmdAt = 0;
  RW._cmdLastTool = null;               // last draw tool run via RW.runCommand — see the Space-repeats-last-tool listener below
  RW._cmdToolArmed = false;             // our own belief about whether a tool is currently armed — see RW.runCommand and RW._cmdGoSelect
  RW._cmdModeActive = null;             // our own belief about which mode switch (see SPACE_GOES_SELECT_FROM) we're deliberately sitting in, or null
  RW._cmdToolPrev = null;
  RW._cmdToolNullPending = false;
  RW._cmdAutoSelectRevertLog = [];

  // undefined = unreadable (no annotationState, or no currentTool property at
  // all) — a distinct result from a real null/empty tool, so the watcher can
  // fail closed (no-op) rather than misreading "can't tell" as "cleared".
  function readTool(){
    const as = (typeof annotationState !== 'undefined') ? annotationState : null;
    if (!as || !('currentTool' in as)) return undefined;
    const t = as.currentTool;
    return (t === '' || t === undefined) ? null : t;
  }

  // null = unreadable or not one of the known mode strings — callers treat
  // that as "don't know", not as "in select mode" or "in draw mode".
  function readMode(){
    const as = (typeof annotationState !== 'undefined') ? annotationState : null;
    const m = as && as.mode;
    return (typeof m === 'string' && KNOWN_MODES.indexOf(m) !== -1) ? m : null;
  }

  function resetWatchState(){
    const t = readTool();
    RW._cmdToolPrev = (t === undefined) ? null : t;
    RW._cmdToolNullPending = false;
  }

  function recordAutoRevert(reason){
    const now = Date.now();
    RW._cmdAutoSelectRevertLog = RW._cmdAutoSelectRevertLog.filter(function(t){ return now - t < AUTOSEL_BURST_MS; });
    RW._cmdAutoSelectRevertLog.push(now);
    if (RW._cmdAutoSelectRevertLog.length > AUTOSEL_BURST_MAX){
      RW._cmdAutoSelect = false;
      RW._cmdStopToolWatch();
      RW._commitStatus && RW._commitStatus(
        'auto-select disabled — reverted to select ' + RW._cmdAutoSelectRevertLog.length + ' times in '
        + Math.round(AUTOSEL_BURST_MS / 1000) + 's (likely a bad currentTool/mode read); '
        + 'set RW._cmdAutoSelect = true to re-enable'
      );
    }
  }

  // The single funnel every auto-revert trigger goes through — this is what
  // makes Escape and the poll unable to double-dispatch regardless of which
  // one wins the race (see the suppression window and the state reset below).
  // `bypassSuppression`: the 600ms window below exists to stop the AUTOMATIC triggers
  // (the poll and Escape's own deferred call) from double-firing when they race each
  // other — it was never meant to block a deliberate, explicit user action. Space's
  // own close (below) passes this true, so a user rapidly toggling Space (a natural
  // thing to do, e.g. testing that it works) isn't silently swallowed by machinery
  // built for an unrelated race condition — a real bug this project hit live.
  RW._cmdGoSelect = function(reason, quiet, bypassSuppression){
    if (quiet === undefined) quiet = true;
    const now = Date.now();
    if (!bypassSuppression && now - RW._cmdLastSelectAt < SELECT_SUPPRESS_MS){
      resetWatchState(); // erase any pending edge so it can't refire once the window expires
      return false;
    }
    if (readMode() === SELECT_MODE){
      resetWatchState(); // already resting — don't assume `s` toggles rather than switches
      RW._cmdToolArmed = false; // defensively in sync too — we're confirmed at rest either way
      RW._cmdModeActive = null;
      return false;
    }
    RW._cmdDispatchAppKey(SELECT_KEY, quiet);
    RW._cmdLastSelectAt = now;
    resetWatchState();
    recordAutoRevert(reason);
    // Every revert to select — however it was triggered (Escape, the poll noticing a
    // tool clear itself, or the new Space-close below) — means nothing is armed from
    // here on, by definition. Updating our own flag here (not by re-reading
    // annotationState) is what makes a SECOND Space press reliably repeat the last
    // tool right after a Space-close, regardless of how quickly the app's own state
    // actually catches up.
    RW._cmdToolArmed = false;
    RW._cmdModeActive = null;
    return true;
  };

  // Edge-triggered: only a CONFIRMED non-null -> null transition (seen on two
  // consecutive ticks) triggers a revert, so a tool swap that passes through
  // a transient null can never yank the user out of the tool they just
  // picked. Never compares currentTool against a known string — only against
  // null — so an unrecognized tool name behaves exactly like a confirmed one.
  RW._cmdToolWatchTick = function(){
    if (!RW.enabled || !RW._cmdAutoSelect){ resetWatchState(); return; }
    const cur = readTool();
    if (cur === undefined) return; // unreadable — no-op, leave prev untouched
    const prev = RW._cmdToolPrev;
    RW._cmdToolPrev = cur;
    if (cur !== null){ RW._cmdToolNullPending = false; return; }
    if (RW._cmdToolNullPending){
      // These three guards deliberately do NOT clear the pending flag when
      // they block — the edge stays armed and is retried on the next tick,
      // so a temporarily-blocked revert (still inside the grace window,
      // still mid-typed, still in a deliberate mode) fires as soon as the
      // condition clears rather than being silently dropped forever.
      if (Date.now() - RW._cmdLastUserCmdAt < AUTOSEL_USER_GRACE_MS) return; // just ran a deliberate command
      if (inputEl && inputEl.value) return;                                  // mid-typed command
      const mode = readMode();
      if (mode !== null && mode !== DRAW_MODE) return;                       // deliberate pan/label/crop/... — don't fight it
      if (RW._cmdModeActive) return;                                         // OUR OWN record says we're in one too (e.g. `mode` was unreadable/unrecognized)
      RW._cmdToolNullPending = false;
      RW._cmdGoSelect('poll', true);
      return;
    }
    if (prev !== null && prev !== undefined) RW._cmdToolNullPending = true; // the edge itself
  };

  RW._cmdStopToolWatch = function(){
    if (RW._cmdToolWatchTimer){ clearInterval(RW._cmdToolWatchTimer); RW._cmdToolWatchTimer = null; }
  };
  RW._cmdStartToolWatch = function(){
    RW._cmdStopToolWatch();
    resetWatchState(); // seed with the ACTUAL current value, not an assumed null, so an immediate
                        // start can never spuriously fire — a revert needs a non-null->null edge.
    RW._cmdToolWatchTimer = setInterval(function(){ RW._cmdToolWatchTick(); }, AUTOSEL_POLL_MS);
  };

  // A separate, always-on document keydown listener (capture phase) purely
  // to piggyback a deferred revert-to-select after the app's own Escape
  // handling — it NEVER preventDefaults or stops propagation, so the app's
  // real Escape handler always still runs. Deferred via setTimeout(...,0)
  // (not requestAnimationFrame, which can be throttled in a background tab)
  // so the app's own synchronous cancel-work finishes first.
  RW._cmdEscapeHandler = function(e){
    if (e.__rwSynthetic) return;
    if (e.key !== 'Escape') return;
    if (!RW.enabled || !RW._cmdAutoSelect) return;
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return; // includes our own command input
    setTimeout(function(){ RW._cmdGoSelect('escape', true); }, 0);
  };

  /* ---------- command bar + autocomplete ---------- */
  let barEl=null, inputEl=null, menuEl=null, menuItems=[], menuHighlight=-1, menuMode='command';
  // Sticky across a value-entry step (unlike menuMode, which is re-derived from inputEl.value on
  // every keystroke) — {tool, param} once a setting's been picked and we're awaiting its value.
  let settingsDraft = null;

  function ensureMenuDom(){
    if (menuEl) return;
    menuEl = document.createElement('div');
    menuEl.id = 'rw-cmd-menu';
    menuEl.style.cssText = 'position:fixed;display:none;z-index:99991;background:#222;color:#eee;'
      + 'border:1px solid #666;border-radius:4px;max-height:200px;overflow-y:auto;';
    document.body.appendChild(menuEl);
  }

  // Positions the dropdown ABOVE the input: the bar is now a bottom-anchored
  // overlay (RW._cmdRepositionOverlay below), so the menu grows upward from
  // just above the input rather than below it (which would push it off the
  // bottom of the viewport). Bottom is measured from the input's top edge
  // with a fixed 6px gap; top is cleared so it never double-anchors.
  function positionMenu(){
    const r = inputEl.getBoundingClientRect();
    menuEl.style.left = r.left + 'px';
    menuEl.style.width = r.width + 'px';
    menuEl.style.bottom = (window.innerHeight - r.top + 6) + 'px';
    menuEl.style.top = 'auto';
  }

  function hideMenu(){ if (menuEl) menuEl.style.display = 'none'; }

  // Text color only (never the row background, which the keyboard-highlight
  // already uses) so kind stays legible regardless of which row is selected.
  const KIND_COLOR = { native: '#a8e6a3' };
  const TAG_COLOR = '#e0c3fc';
  const SETTINGS_COLOR = '#ffd166';

  // Duck-typed, not mode-gated: a settings item has this exact shape whether
  // it came from the "<tool>." drill-down (menuMode === 'settings-param',
  // every item shaped this way) or from the active-tool bare-param blend
  // inside plain 'command' mode (only SOME items shaped this way, mixed in
  // with ordinary RW._cmdTable entries) — see onInput() below. Checking the
  // item's own shape, not the current mode, is what lets both coexist.
  function isSettingsItem(item){ return !!item && typeof item.tool === 'string' && typeof item.param === 'string'; }
  // A numbered option row inside a select param's own sub-list — carries tool/param for context
  // too (so it happens to also satisfy isSettingsItem), which is exactly why this must be checked
  // FIRST wherever both are possible, rather than relying on the two shapes being exclusive.
  function isOptionItem(item){ return !!item && typeof item.optionIndex === 'number'; }

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
      } else if (isOptionItem(item)){
        label = item.optionIndex + '. ' + item.optionText;
        color = SETTINGS_COLOR;
      } else if (isSettingsItem(item)){
        if (item.type === 'checkbox'){
          label = item.param + ' (toggle, now ' + item.current + ')';
        } else if (item.type === 'select'){
          label = item.param + ' (' + (item.options ? item.options.length : 0) + ' options, now ' + item.current + ')';
        } else {
          label = item.param + ' (' + (item.min != null ? item.min : '') + (item.max != null ? '-' + item.max : '')
            + ', now ' + item.current + ')';
        }
        color = SETTINGS_COLOR;
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
  // navigation to search RW._cmdTagList instead of RW._cmdTable. Typing
  // "<toolname>." (checked first, since a settingsDraft in progress must
  // never be reinterpreted as a fresh prefix) switches it to that tool's
  // settings parameters instead, for any tool with a RW._toolSettingsMap
  // entry — real ids confirmed live, see that map's own comment.
  function onInput(){
    const v = inputEl.value;
    if (settingsDraft){
      if (settingsDraft.type === 'select'){
        // Unlike number/checkbox, a select param keeps the dropdown open — the whole
        // point is to pick one of the live options, not free-type a value. Filters by
        // number OR text, per the "both" decision.
        const raw = inputEl.value;
        const eq = raw.indexOf('=');
        const q = (eq !== -1 ? raw.slice(eq + 1) : raw).trim().toLowerCase();
        menuMode = 'settings-option';
        menuItems = settingsDraft.options
          .filter(function(o){ return !q || String(o.index) === q || o.text.toLowerCase().indexOf(q) === 0; })
          .map(function(o){ return { tool: settingsDraft.tool, param: settingsDraft.param, optionIndex: o.index, optionValue: o.value, optionText: o.text }; });
        menuHighlight = menuItems.length ? 0 : -1;
        renderMenuRows();
        return;
      }
      // Free-typed value entry (number/checkbox) — no dropdown, no autocomplete matching.
      menuMode = 'settings-value';
      menuItems = [];
      hideMenu();
      return;
    }
    const dotMatch = /^([A-Za-z0-9]+)\.(.*)$/.exec(v);
    const dotEntry = dotMatch ? findEntry(dotMatch[1]) : null;
    if (dotEntry && RW._toolSettingsMap[dotEntry.name]){
      const q = (dotMatch[2] || '').toLowerCase();
      menuMode = 'settings-param';
      menuItems = RW._cmdToolSettingsList(dotEntry.name)
        .filter(function(item){ return !q || item.param.toLowerCase().indexOf(q) === 0; });
      menuHighlight = menuItems.length ? 0 : -1;
      renderMenuRows();
      return;
    }
    if (v.charAt(0) === '#'){
      if (!RW._cmdTagList) RW._cmdDetectTags();
      menuMode = 'tag';
      menuItems = RW._cmdMatchTags(v.slice(1)).slice(0, 8);
    } else {
      menuMode = 'command';
      let items = RW._cmdMatch(v);
      // Additive, not exclusive (confirmed via AskUserQuestion): whatever
      // tool is currently armed has its own param names typable bare, with
      // no "tool." prefix needed, blended ahead of the ordinary command
      // matches — every other command (switching tools included) keeps
      // working exactly as it does today, unaffected by this.
      const activeTool = RW._cmdActiveSettingsTool();
      if (activeTool){
        const q = v.toLowerCase();
        const paramItems = RW._cmdToolSettingsList(activeTool)
          .filter(function(p){ return p.param.toLowerCase().indexOf(q) === 0; });
        items = paramItems.concat(items);
      }
      menuItems = items.slice(0, 8);
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
    if (isOptionItem(item)){
      // Picking a numbered option (click, or Enter while one's highlighted) applies it
      // immediately — choosing IS the value, unlike number/checkbox which need a
      // separate typed value.
      settingsDraft = null;
      RW._cmdApplySetting(item.tool, item.param, String(item.optionIndex));
      inputEl.value = '';
      hideMenu();
      inputEl.blur();
      return;
    }
    if (isSettingsItem(item)){
      // Checked by shape, not menuMode — this also fires for a bare-param
      // match picked out of the blended 'command' list while a tool is
      // active. Don't clear/blur — the whole point is to keep the input
      // focused so the user can type the value next, matching Tab's own
      // "fill without running" precedent below rather than the
      // immediate-run convention every other mode uses.
      if (item.type === 'select'){
        // originalValue/previewed exist so Tab-cycling (below) can live-preview each
        // option on the real page and Escape can revert to what was actually current
        // before any cycling happened, rather than leaving whatever was last previewed.
        settingsDraft = { tool: item.tool, param: item.param, type: 'select', options: item.options,
          originalValue: item.current, previewed: false };
        inputEl.value = item.tool + '.' + item.param + ' = ';
        menuMode = 'settings-option';
        menuItems = item.options.map(function(o){
          return { tool: item.tool, param: item.param, optionIndex: o.index, optionValue: o.value, optionText: o.text };
        });
        // Start highlighted on whichever option actually matches the tool's current
        // value, not always the first — Tab then cycles onward from where it really is.
        const curIdx = menuItems.findIndex(function(o){ return o.optionValue === item.current; });
        menuHighlight = curIdx !== -1 ? curIdx : (menuItems.length ? 0 : -1);
        renderMenuRows();
        inputEl.focus();
        if (inputEl.setSelectionRange) inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
        RW._commitStatus && RW._commitStatus(
          item.tool + '.' + item.param + ': pick 1-' + item.options.length + ', currently "' + item.current
          + '" — type a number or the option name, or Tab to live-preview each state, then press Enter'
        );
        return;
      }
      if (item.type === 'checkbox'){
        // Confirmed via live use: picking a checkbox should just flip it right
        // there, like picking a select option — no separate on/off typing step.
        // (RW._cmdApplySetting itself still accepts an explicit on/off value for
        // anyone calling it directly from the console; this only changes what
        // choosing the row in the dropdown does.)
        settingsDraft = null;
        RW._cmdApplySetting(item.tool, item.param, item.current === 'on' ? 'off' : 'on');
        inputEl.value = '';
        hideMenu();
        inputEl.blur();
        return;
      }
      settingsDraft = { tool: item.tool, param: item.param, type: item.type };
      inputEl.value = item.tool + '.' + item.param + ' = ';
      hideMenu();
      inputEl.focus();
      if (inputEl.setSelectionRange) inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
      RW._commitStatus && RW._commitStatus(
        item.tool + '.' + item.param + ': ' + (item.min != null ? item.min : '') + '–' + (item.max != null ? item.max : '')
        + ', currently ' + item.current + ' — type a new value and press Enter'
      );
      return;
    }
    if (menuMode === 'tag') RW._cmdSelectTag(item.tag, item.idx);
    else RW.runCommand(item.name);
    inputEl.value = '';
    hideMenu();
    // Clear the dropdown state after a command actually runs — otherwise menuMode
    // stays 'command'/'tag' with stale non-empty rows. Defensive hygiene only: nothing
    // needs the dropdown open after a run, and stale non-empty state here is exactly
    // what caused scroll-hijack bugs when a document-level wheel handler still existed
    // (see CLAUDE.md rounds 10b/10c — that handler is now removed entirely).
    menuItems = [];
    menuMode = 'command';
    inputEl.blur();
  }

  function onInputKeydown(e){
    if (settingsDraft && (e.key === 'Enter' || e.key === ' ')){
      // Same Enter-or-Space confirm convention as every other mode. Splits
      // on '=' so it works whether the "tool.param = " prefix survived
      // editing or the user retyped the whole line — either way only the
      // trailing value matters. For a select param, a highlighted option
      // row wins over whatever's typed (guarantees an exact match even if
      // the typed text's casing/partiality would otherwise be ambiguous);
      // RW._cmdApplySetting's own matching handles the no-highlight case.
      e.preventDefault(); e.stopPropagation();
      const draft = settingsDraft;
      let valueText;
      if (draft.type === 'select' && menuHighlight >= 0 && menuItems[menuHighlight] && isOptionItem(menuItems[menuHighlight])){
        valueText = String(menuItems[menuHighlight].optionIndex);
      } else {
        const raw = inputEl.value;
        const eq = raw.indexOf('=');
        valueText = (eq !== -1 ? raw.slice(eq + 1) : raw).trim();
      }
      settingsDraft = null;
      RW._cmdApplySetting(draft.tool, draft.param, valueText);
      inputEl.value = '';
      hideMenu();
      inputEl.blur();
      return;
    }
    if (settingsDraft && settingsDraft.type === 'select' && e.key === 'Tab'){
      // Deliberately different from Tab's own "fill without running" rule everywhere
      // else in this file: here Tab actually APPLIES each option as you cycle through,
      // live on the real page, so you can compare states before committing — Shift+Tab
      // cycles backward. The draft stays open (no clear/blur) so cycling can continue;
      // Enter/Space/click still finalizes whichever's highlighted, same as before.
      e.preventDefault(); e.stopPropagation();
      if (menuItems.length){
        menuHighlight = (menuHighlight + (e.shiftKey ? -1 : 1) + menuItems.length) % menuItems.length;
        const picked = menuItems[menuHighlight];
        if (isOptionItem(picked)){
          settingsDraft.previewed = true;
          RW._cmdApplySetting(picked.tool, picked.param, String(picked.optionIndex));
        }
        renderMenuRows();
      }
      return;
    }
    if (e.key === 'ArrowDown'){ e.preventDefault(); e.stopPropagation(); moveHighlight(1); return; }
    if (e.key === 'ArrowUp'){ e.preventDefault(); e.stopPropagation(); moveHighlight(-1); return; }
    if (e.key === 'Tab'){
      e.preventDefault(); e.stopPropagation();
      // Tab now ADVANCES the highlight before filling it in — shell-style completion
      // cycling through the matches, Shift+Tab going backward, wraparound via
      // moveHighlight's own modulo (confirmed via AskUserQuestion). Scoped to the two
      // plain search modes: the "<tool>." settings-param list keeps the older
      // fill-only behavior below unchanged (picking a param arms a value draft, so
      // cycling through them by Tab was never the point), and a select param's own
      // option sub-list never reaches this branch at all — its dedicated live-preview
      // Tab branch above already returned first.
      if (menuMode === 'command' || menuMode === 'tag') moveHighlight(e.shiftKey ? -1 : 1);
      if (menuHighlight >= 0 && menuItems[menuHighlight]){
        const item = menuItems[menuHighlight];
        if (isOptionItem(item)){
          // Fill without applying — mirrors every other Tab case, just fills the
          // option's number into the value slot instead of running it.
          const raw = inputEl.value;
          const eq = raw.indexOf('=');
          inputEl.value = (eq !== -1 ? raw.slice(0, eq + 1) + ' ' : '') + item.optionIndex;
        } else {
          inputEl.value = menuMode === 'tag' ? ('#' + item.tag.name)
            : isSettingsItem(item) ? (item.tool + '.' + item.param)
            : item.name;
        }
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
      else {
        const label = menuMode==='tag' ? 'tag' : ((menuMode==='settings-param'||menuMode==='settings-option') ? 'setting' : 'command');
        RW._commitStatus && RW._commitStatus('unknown ' + label + ': ' + inputEl.value);
      }
      return;
    }
    if (e.key === 'Escape'){
      e.stopPropagation();
      if (settingsDraft){
        // Tab-cycling a select param (above) actually applies each option live as a
        // preview, unlike numeric/checkbox drafts which never touch the real control
        // until confirmed — so Escape here has real work to do: put back whatever was
        // genuinely current before any previewing started. Skipped when nothing was
        // ever previewed, to avoid a pointless extra dispatch on a plain cancel.
        if (settingsDraft.previewed) RW._cmdApplySetting(settingsDraft.tool, settingsDraft.param, settingsDraft.originalValue);
        settingsDraft = null; inputEl.value = ''; hideMenu(); inputEl.blur(); return;
      }
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
    inputEl.placeholder = 'native tool (linear, rect, pan…) or #tag — just start typing';
    inputEl.style.cssText = 'flex:1;font-size:11px;padding:2px 4px;'
      // Near-white text (inherited from #rw-panel's color) on the input's
      // default WHITE UA background is unreadable — give it an explicit dark
      // background and light text so the input matches the dark panel. The
      // placeholder also needs a light-ish color (it would otherwise use the
      // same near-white text, but a faint version reads better).
      + 'background:#111;color:#eee;border:1px solid #555;border-radius:3px;'
      + 'color-scheme:dark;';
    barEl.appendChild(inputEl);
    host.insertBefore(barEl, list);

    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('keydown', onInputKeydown);
    inputEl.addEventListener('blur', function(){ setTimeout(hideMenu, 150); });
  }

  /* ---------- bottom-center overlay positioning ---------- */
  // The command-line panel is a fixed overlay appended to document.body (by
  // rw_core.js), not a side-rail box. This repositions it horizontally
  // centered over the annotation canvas's on-screen rect (so it accounts for
  // the side rail, unlike window-centering) and pinned a tunable gap above
  // the canvas's bottom edge — the whole point being it must NOT scroll or
  // pan with the drawing. No-op without throwing if either #rw-panel or
  // #annotation-canvas is missing. Re-runs on resize to stay pinned over a
  // re-laid-out canvas.
  RW._cmdBarOffset = 16;   // px gap above the canvas's bottom edge — console escape hatch
  RW._cmdBarWidth = 480;   // overlay width, px — console escape hatch

  // Make the two tunables LIVE: assigning __RW._cmdBarWidth or
  // __RW._cmdBarOffset in the console repositions the panel immediately
  // instead of only taking effect on the next resize/paste. Accessors rather
  // than plain fields so `__RW._cmdBarWidth = 600` is a single, complete act
  // — no follow-up `_cmdRepositionOverlay()` call needed (RW._cmdRepositionOverlay
  // is defined immediately below; these are only invoked at runtime, after the
  // module has fully loaded).
  Object.defineProperty(RW, '_cmdBarWidth', {
    configurable: true, enumerable: true,
    get(){ return this.__cmdBarWidthV; },
    set(v){ this.__cmdBarWidthV = Number(v); if (RW._cmdRepositionOverlay) RW._cmdRepositionOverlay(); }
  });
  RW._cmdBarWidth = 480;
  Object.defineProperty(RW, '_cmdBarOffset', {
    configurable: true, enumerable: true,
    get(){ return this.__cmdBarOffsetV; },
    set(v){ this.__cmdBarOffsetV = Number(v); if (RW._cmdRepositionOverlay) RW._cmdRepositionOverlay(); }
  });
  RW._cmdBarOffset = 16;

  RW._cmdRepositionOverlay = function(){
    const panel = document.getElementById('rw-panel');
    const canvas = document.getElementById('annotation-canvas');
    if (!panel || !canvas) return; // no-op without throwing
    const cr = canvas.getBoundingClientRect();
    const width = Math.min(RW._cmdBarWidth, cr.width);
    panel.style.width = width + 'px';
    panel.style.left = (cr.left + (cr.width - width) / 2) + 'px';
    // Bottom edge is (innerHeight - canvas.bottom) + offset in viewport
    // space. When the drawing is scrolled so the canvas bottom falls BELOW
    // the viewport (a long PDF), this goes negative and the fixed panel
    // would sit entirely off-screen — visible nowhere while the input still
    // takes focus (commands "work"). Clamp so the panel's bottom edge never
    // dips below `offset` from the viewport bottom: the bar stays on-screen
    // over the drawing, which is strictly better than disappearing.
    const rawBottom = (window.innerHeight - cr.bottom) + RW._cmdBarOffset;
    panel.style.bottom = Math.max(RW._cmdBarOffset, rawBottom) + 'px';
  };

  // Live overlay diagnostic — run when the bar is missing from the page to
  // learn WHY (stacking/occlusion vs. off-screen placement vs. a transformed
  // body/html breaking position:fixed). Read-only, console-only, same spirit
  // as RW._panDiagnose/RW._zoomDiagnose.
  RW._overlayDiagnose = function(){
    const panel = document.getElementById('rw-panel');
    const canvas = document.getElementById('annotation-canvas');
    const out = { viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight } };
    if (panel){
      const p = panel.getBoundingClientRect ? panel.getBoundingClientRect() : null;
      out.panel = {
        present: true,
        style: { left: panel.style.left, bottom: panel.style.bottom, width: panel.style.width, display: panel.style.display, zIndex: panel.style.zIndex },
        rect: p ? { left: p.left, right: p.right, top: p.top, bottom: p.bottom, width: p.width, height: p.height } : null,
        onScreen: p ? (p.bottom > 0 && p.top < window.innerHeight && p.right > 0 && p.left < window.innerWidth) : false
      };
    } else {
      out.panel = { present: false };
    }
    if (canvas){
      const c = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      out.canvas = { present: true, rect: c ? { left: c.left, right: c.right, top: c.top, bottom: c.bottom, width: c.width, height: c.height } : null };
    } else {
      out.canvas = { present: false };
    }
    // position:fixed is only viewport-anchored if NO ancestor (here: body/html)
    // carries a transform/filter/perspective — otherwise it anchors to that
    // ancestor and the viewport-relative bottom/left computed above is wrong.
    function transformInfo(el, name){
      if (!el) return null;
      const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
      const tf = cs ? (cs.transform && cs.transform !== 'none' ? cs.transform : undefined) : undefined;
      const filt = cs ? (cs.filter && cs.filter !== 'none' ? cs.filter : undefined) : undefined;
      const persp = cs ? (cs.perspective && cs.perspective !== 'none' ? cs.perspective : undefined) : undefined;
      if (!tf && !filt && !persp) return { name: name, clean: true };
      return { name: name, clean: false, transform: tf, filter: filt, perspective: persp };
    }
    out.ancestors = [
      transformInfo(document.body, 'body'),
      transformInfo(document.documentElement, 'html')
    ];
    if (console.table) console.table(out); else console.log(out);
    return out;
  };

  // Called once at load, and on every window resize so the overlay stays
  // pinned to the canvas even after the layout re-flows.
  RW._cmdRepositionOverlay();
  if (window.addEventListener) window.addEventListener('resize', RW._cmdRepositionOverlay);

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
    // AutoCAD's own convention, extended into a toggle: Space with nothing typed
    // either repeats the last tool or closes the one currently active, whichever
    // applies. Both branches only fire when the command bar is genuinely empty (not
    // mid-typed). Which branch depends on RW._cmdToolArmed — OUR OWN record of
    // whether a tool is armed, maintained by RW.runCommand (arms) and
    // RW._cmdGoSelect (closes), deliberately NOT a fresh readTool() read here. An
    // earlier version depended on re-reading annotationState.currentTool live at
    // decision time, which meant a rapid close-then-repeat (Space, Space) could
    // read a currentTool the app hadn't actually finished updating yet, and the
    // second Space would silently do nothing (hit RW._cmdGoSelect's own
    // suppression window with no repeat happening at all) — this project has been
    // burned by exactly this kind of live-timing assumption before. Tracking our
    // own armed/closed state instead sidesteps the question entirely.
    if (e.key === ' ' && (!inputEl || !inputEl.value)){
      // Leaving a mode switch in SPACE_GOES_SELECT_FROM (currently just `label`)
      // forces select — checked ahead of the plain repeat branch below so it
      // isn't shadowed: RW._cmdToolArmed is already false the moment `label` runs
      // (every mode switch clears it), so without this override the very next
      // check down would repeat RW._cmdLastTool instead — exactly the bug a real
      // job reported (Space from label was resuming the prior tool; the fix is to
      // force select here, not to make the resume "work" — see CLAUDE.md's
      // "Round 7d (corrected)").
      if (SPACE_GOES_SELECT_FROM.indexOf(RW._cmdModeActive) !== -1){
        e.preventDefault(); e.stopImmediatePropagation();
        RW._cmdGoSelect('space', true, true); // bypass the auto-trigger suppression window, same as the close branch below
        return;
      }
      if (!RW._cmdToolArmed && RW._cmdLastTool){
        e.preventDefault(); e.stopImmediatePropagation();
        RW.runCommand(RW._cmdLastTool);
        return;
      }
      if (RW._cmdToolArmed){
        e.preventDefault(); e.stopImmediatePropagation();
        RW._cmdGoSelect('space', true, true); // bypass the auto-trigger suppression window — see its own comment
        return;
      }
    }
    e.preventDefault(); e.stopImmediatePropagation();
    mountCommandBar();
    if (!inputEl) return;
    inputEl.value += e.key;
    inputEl.focus();
    if (inputEl.setSelectionRange) inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    onInput();
  }, true);

  // Install the auto-select watcher and its Escape listener (see the section
  // above). Started after mountCommandBar/detectTags so RW._cmdAutoSelect's
  // mid-typing guard already has a real inputEl to read.
  RW._cmdStartToolWatch();
  document.addEventListener('keydown', RW._cmdEscapeHandler, true);

  // Set-select-on-load, deferred beyond build_loader.sh's own ready-and-settle
  // gate: that gate only proves annotationState/DOM presence, not that the
  // app's own keydown listener is registered yet (see CLAUDE.md's unresolved
  // "dispatch worked before a reload, stopped after" finding) — cheap
  // insurance on a path that runs once per paste. Skipped if a tool is
  // already armed, or the app is already in a deliberate non-draw/select
  // mode — this loader gets re-pasted after every page navigation, and
  // yanking an already-working annotator into select would be destructive.
  setTimeout(function(){
    const tool = readTool();
    if (tool !== undefined && tool !== null){
      RW._commitStatus && RW._commitStatus('select-on-load skipped — "' + tool + '" is already active');
      return;
    }
    const mode = readMode();
    if (mode !== null && mode !== SELECT_MODE && mode !== DRAW_MODE){
      RW._commitStatus && RW._commitStatus('select-on-load skipped — already in "' + mode + '" mode');
      return;
    }
    RW._cmdGoSelect('load', false);
  }, 400);

  /* ---------- middle-button drag-pan (does NOT switch the app's tool) ---------- */
  // AutoCAD-style: hold the middle mouse button and drag to move the page,
  // exactly like ordinary scrolling — NOT the app's own dedicated pan tool,
  // so whatever tool is currently armed (linear, rect, mline, ...) survives
  // the whole gesture untouched. This is the one feature in this file that
  // does not work by dispatching a synthetic key: synthetic `wheel` events
  // are untrusted and don't scroll, and dispatching the app's own pan key
  // would switch tools, which is exactly what this must NOT do. Instead it
  // writes scrollLeft/scrollTop directly on a real host element — see
  // CLAUDE.md's amended Constraints section for why that widens this
  // project's "purely a tool-switcher" boundary, deliberately, for this one
  // feature only.
  RW._panEnabled = true;          // subordinate to RW.enabled — disable pan alone without the killswitch
  RW._panInvert = false;          // flip if grab-and-drag feels backwards on a live page
  RW._panThreshold = 3;           // px (Manhattan) before it counts as a real drag, not a bare click
  RW._panStopHostEvents = true;   // stopPropagation the middle press so the host app's own canvas
                                   // mousedown handler never sees it (see the stray-vertex risk below)
  RW._panContainerOverride = null; // console escape hatch: set to a real element to skip the walk

  // An ancestor only qualifies if it BOTH declares itself scrollable (computed
  // overflow) AND actually has something to scroll (scrollWidth/Height >
  // clientWidth/Height) — overflow alone matches height-capped-but-empty
  // containers like #rw-panel itself; metrics alone match ordinary
  // overflow:hidden clipping wrappers, of which a canvas app has many.
  RW._panIsScrollable = function(el, axis){
    if (!el || el.nodeType !== 1) return false;
    const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
    const ov = cs ? (axis === 'x' ? cs.overflowX : cs.overflowY) : 'auto';
    if (ov !== 'auto' && ov !== 'scroll' && ov !== 'overlay') return false;
    return axis === 'x'
      ? (el.scrollWidth  - el.clientWidth)  > 1
      : (el.scrollHeight - el.clientHeight) > 1;
  };

  // Resolves x and y INDEPENDENTLY in one upward walk — a vertically
  // scrolling page with a horizontally scrolling inner viewport (or vice
  // versa) is common, and resolving a single container would lose an axis.
  // document.scrollingElement is checked by METRICS ONLY, not computed
  // overflow: the root element's computed overflowY is typically `visible`
  // even when the document genuinely scrolls, so applying the overflow test
  // there would reject the correct answer.
  RW._panResolveContainers = function(startEl){
    const out = { x:null, y:null, source:'none' };
    if (RW._panContainerOverride){
      out.x = out.y = RW._panContainerOverride; out.source = 'override';
      return out;
    }
    let el = startEl, hops = 0;
    while (el && el.nodeType === 1 && hops++ < 64){
      if (!out.x && RW._panIsScrollable(el, 'x')) out.x = el;
      if (!out.y && RW._panIsScrollable(el, 'y')) out.y = el;
      if (out.x && out.y) break;
      el = el.parentElement;
    }
    if (out.x || out.y) out.source = 'ancestor';
    const se = document.scrollingElement || document.documentElement || document.body;
    if (!out.x && se && (se.scrollWidth  - se.clientWidth)  > 1){ out.x = se; if (out.source === 'none') out.source = 'scrollingElement'; }
    if (!out.y && se && (se.scrollHeight - se.clientHeight) > 1){ out.y = se; if (out.source === 'none') out.source = 'scrollingElement'; }
    return out;
  };

  // The highest-value diagnostic in this feature: the whole thing hinges on
  // one unknown (does this app scroll, or pan via a CSS transform instead?)
  // and this answers it in one console call. Call it BEFORE anything else on
  // a live page.
  RW._panDiagnose = function(el){
    el = el || document.getElementById('annotation-canvas') || document.body;
    const found = [];
    let n = el, hops = 0;
    while (n && n.nodeType === 1 && hops++ < 64){
      found.push({
        tag: n.tagName, id: n.id,
        x: RW._panIsScrollable(n, 'x'), y: RW._panIsScrollable(n, 'y'),
        scrollWidth: n.scrollWidth, clientWidth: n.clientWidth,
        scrollHeight: n.scrollHeight, clientHeight: n.clientHeight
      });
      n = n.parentElement;
    }
    if (console.table) console.table(found); else console.log(found);
    return found;
  };

  function panInOurUi(el){
    let n = el, hops = 0;
    while (n && n.nodeType === 1 && hops++ < 64){
      if (n.id === 'rw-panel' || n.id === 'rw-cmd-menu') return true;
      n = n.parentElement;
    }
    return false;
  }
  function panIsTextTarget(el){
    return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
  }

  function panApplyCursor(){
    if (document.getElementById('rw-pan-cursor')) return;
    const s = document.createElement('style');
    s.id = 'rw-pan-cursor';
    s.innerHTML = '*, *::before, *::after { cursor: grabbing !important; }';
    document.body.appendChild(s);
  }
  function panClearCursor(){
    const s = document.getElementById('rw-pan-cursor');
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  // scrollTop/Left += (not scrollBy(), which respects scroll-behavior:smooth
  // and would animate every frame of the drag into mush) — so smooth
  // scrolling is neutralized for the duration of the drag and restored after.
  function panNeutralizeSmooth(el){
    if (!el || el.__rwPrevScrollBehavior !== undefined) return;
    const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (cs && cs.scrollBehavior === 'smooth' && el.style){
      el.__rwPrevScrollBehavior = el.style.scrollBehavior || '';
      el.style.scrollBehavior = 'auto';
    } else {
      el.__rwPrevScrollBehavior = null; // mark visited, nothing to restore
    }
  }
  function panRestoreSmooth(el){
    if (!el || el.__rwPrevScrollBehavior === undefined) return;
    if (el.__rwPrevScrollBehavior !== null && el.style) el.style.scrollBehavior = el.__rwPrevScrollBehavior;
    delete el.__rwPrevScrollBehavior;
  }

  const panRaf = (window.requestAnimationFrame)
    ? function(fn){ return window.requestAnimationFrame(fn); }
    // Deliberate: no rAF fallback timer, just call synchronously. This is
    // what lets the Node test harness observe scroll writes without a rAF
    // stub, and it's harmless in a real browser (rAF is always present).
    : function(fn){ fn(); };

  const panState = {
    active:false, panned:false, cx:null, cy:null, target:null,
    lastX:0, lastY:0, pendX:0, pendY:0, moved:0,
    rafPending:false, usingMouseFallback:false
  };

  function panSchedule(){
    if (panState.rafPending) return;
    panState.rafPending = true;
    panRaf(function(){
      panState.rafPending = false;
      if (!panState.active) return;
      const sgn = RW._panInvert ? 1 : -1;
      const dx = panState.pendX, dy = panState.pendY;
      panState.pendX = 0; panState.pendY = 0;
      if (panState.cx && dx) panState.cx.scrollLeft += sgn * dx;
      if (panState.cy && dy) panState.cy.scrollTop  += sgn * dy;
    });
  }

  // Resolved ONCE per drag, never re-resolved mid-drag (the element under
  // the cursor changes constantly as you drag across the toolbar/rail/our
  // own panel — re-resolving would make the view jump between containers,
  // the single worst pan bug) and never cached ACROSS drags (a PDF viewport
  // commonly re-mounts on page change/zoom; a stale detached element would
  // make every subsequent write silently do nothing).
  function panBegin(e){
    panClearCursor(); // self-heal a stale cursor style left by an escaped exception
    const c = RW._panResolveContainers(e.target);
    if (!c.x && !c.y){
      RW._commitStatus && RW._commitStatus(
        'middle-drag pan: no scrollable container found under the cursor — this app may pan via a '
        + 'CSS transform instead of scrolling. Use the app\'s own pan tool ("a"), or set '
        + 'RW._panContainerOverride to the right element and try again.'
      );
      return false; // deliberately no preventDefault anywhere upstream — leave native autoscroll intact
    }
    panState.active = true;
    panState.panned = false;
    panState.cx = c.x; panState.cy = c.y;
    panState.target = e.target;
    panState.lastX = e.clientX; panState.lastY = e.clientY;
    panState.pendX = 0; panState.pendY = 0; panState.moved = 0;
    panNeutralizeSmooth(c.x);
    if (c.y !== c.x) panNeutralizeSmooth(c.y);
    if (e.target && e.target.setPointerCapture){
      try { e.target.setPointerCapture(e.pointerId); } catch(_err){ /* not connected — ignore */ }
    }
    return true;
  }

  function panEnd(reason){
    if (!panState.active) return;
    panState.active = false;
    panClearCursor();
    panRestoreSmooth(panState.cx);
    if (panState.cy !== panState.cx) panRestoreSmooth(panState.cy);
    panRemoveDragListeners();
    if (reason === 'killswitch') RW._commitStatus && RW._commitStatus('middle-drag pan: cancelled — RW turned off');
  }

  function panOnMove(e){
    if (!panState.active) return;
    if (!RW.enabled || !RW._panEnabled){ panEnd('killswitch'); return; }
    if (typeof e.buttons === 'number' && (e.buttons & 4) === 0){ panEnd('buttons-clear'); return; }
    const dx = e.clientX - panState.lastX;
    const dy = e.clientY - panState.lastY;
    panState.lastX = e.clientX; panState.lastY = e.clientY;
    panState.moved += Math.abs(dx) + Math.abs(dy);
    if (!panState.panned && panState.moved > RW._panThreshold){ panState.panned = true; panApplyCursor(); }
    panState.pendX += dx; panState.pendY += dy;
    panSchedule();
  }
  function panOnUp(){ panEnd('up'); }
  function panOnLostCapture(){ panEnd('lostpointercapture'); }
  function panOnWindowBlur(){ panEnd('blur'); }

  function panAddDragListeners(usingPointer){
    panState.usingMouseFallback = !usingPointer;
    if (usingPointer){
      document.addEventListener('pointermove', panOnMove, true);
      document.addEventListener('pointerup', panOnUp, true);
      document.addEventListener('pointercancel', panOnUp, true);
      if (panState.target && panState.target.addEventListener) panState.target.addEventListener('lostpointercapture', panOnLostCapture);
    } else {
      document.addEventListener('mousemove', panOnMove, true);
      document.addEventListener('mouseup', panOnUp, true);
    }
  }
  function panRemoveDragListeners(){
    document.removeEventListener('pointermove', panOnMove, true);
    document.removeEventListener('pointerup', panOnUp, true);
    document.removeEventListener('pointercancel', panOnUp, true);
    document.removeEventListener('mousemove', panOnMove, true);
    document.removeEventListener('mouseup', panOnUp, true);
    if (panState.target && panState.target.removeEventListener) panState.target.removeEventListener('lostpointercapture', panOnLostCapture);
  }

  // pointerdown claims the drag. A companion mousedown (below) ALSO
  // preventDefaults the same physical press — that, not this, is what
  // reliably kills Chrome's middle-click autoscroll puck, whose default
  // action is documented on mousedown; pointerdown cancellation is not
  // something to assume covers it too without a live check.
  function panOnPointerDown(e){
    if (e.button !== 1) return;
    if (!RW.enabled || !RW._panEnabled) return;
    if (panIsTextTarget(e.target)) return;   // e.g. middle-click-paste on Linux/X11 — not ours to break
    if (panInOurUi(e.target)) return;        // #rw-panel / #rw-cmd-menu manage their own scrolling
    if (!panBegin(e)) return;
    e.preventDefault();
    if (RW._panStopHostEvents) e.stopPropagation();
    panAddDragListeners(true);
  }

  function panOnMouseDown(e){
    if (e.button !== 1) return;
    if (!RW.enabled || !RW._panEnabled) return;
    if (panState.active){
      // pointerdown already claimed this physical press; this call's only
      // remaining job is the autoscroll-suppressing preventDefault.
      e.preventDefault();
      if (RW._panStopHostEvents) e.stopPropagation();
      return;
    }
    if (window.PointerEvent) return; // pointer path exists but declined the drag — respect that, don't double-drive
    if (panIsTextTarget(e.target)) return;
    if (panInOurUi(e.target)) return;
    if (!panBegin(e)) return;
    e.preventDefault();
    if (RW._panStopHostEvents) e.stopPropagation();
    panAddDragListeners(false);
  }

  // Suppress ONLY when a real pan happened (past the threshold) — a bare
  // middle-click below the threshold is left completely alone, so
  // middle-click-open-in-new-tab still works when nothing actually panned.
  function panOnAuxClick(e){
    if (e.button !== 1) return;
    if (!panState.panned) return;
    e.preventDefault();
    if (RW._panStopHostEvents) e.stopPropagation();
    panState.panned = false;
  }

  document.addEventListener('pointerdown', panOnPointerDown, true);
  document.addEventListener('mousedown', panOnMouseDown, true);
  document.addEventListener('auxclick', panOnAuxClick, true);
  if (window.addEventListener) window.addEventListener('blur', panOnWindowBlur);

  /* ---------- wheel-zoom: diagnostic first, no dispatch yet ---------- */
  // Two prior cuts of this feature both dispatched a synthetic event to trigger
  // one of the app's own documented zoom shortcuts (Ctrl+scroll, then Ctrl+Plus/
  // Minus) — both reverted per direct user request: plain scrolling should zoom
  // by itself, no keypress (real or synthetic) involved at all.
  //
  // That means this can no longer follow the dispatch idiom every other feature in
  // this file uses — it has to actually PRODUCE the zoom itself, the same
  // "implement it ourselves" territory middle-drag pan occupies. But zoom is not
  // like pan: pan moves EXISTING content within its own scroll container via the
  // universal, works-everywhere `scrollLeft`/`scrollTop` DOM properties — nothing
  // about how the content is drawn changes, so there's no way to get it wrong.
  // Zoom has no universal DOM equivalent — every app implements it differently
  // (a CSS transform on a wrapper, a canvas re-rendered at a new resolution, a
  // PDF-library-specific zoom API, a plain `annotationState` field) — and guessing
  // wrong here is not cosmetic: if this app's own click/annotation-placement
  // coordinates are computed against the page's real (untransformed) layout, an
  // externally-applied CSS `transform: scale()` would silently desync the visual
  // zoom from where a click actually lands, which is a correctness risk this
  // project's own annotation-safety boundary (see Constraints below) exists to
  // avoid — worse than shipping nothing.
  //
  // So: a read-only diagnostic first, exactly the same move round 3's
  // RW._panDiagnose made before pan's real mechanism was built, rather than a
  // third guess. Run RW._zoomDiagnose() once before zooming (via the app's own
  // Ctrl+scroll or Ctrl+Plus/Minus) and once after, and diff the two outputs by
  // eye — whatever actually changed is the real mechanism, and that's what the
  // wheel handler will drive once it's identified. Not wired into the wheel event
  // at all yet — plain scrolling still just scrolls, unchanged, until this comes
  // back with a real answer instead of a guess.
  RW._zoomDiagnose = function(el){
    el = el || document.getElementById('annotation-canvas') || document.body;
    const ancestors = [];
    let n = el, hops = 0;
    while (n && n.nodeType === 1 && hops++ < 64){
      const cs = window.getComputedStyle ? window.getComputedStyle(n) : null;
      ancestors.push({
        tag: n.tagName, id: n.id, className: n.className,
        computedTransform: cs ? cs.transform : undefined,
        inlineTransform: n.style ? n.style.transform : undefined,
        inlineZoom: n.style ? n.style.zoom : undefined, // legacy, non-standard, but some apps still use it
        width: n.style && n.style.width, height: n.style && n.style.height,
        // Only meaningful for a <canvas>: a mismatch between attribute size (the
        // backing resolution) and the CSS-rendered size is itself one common real
        // implementation of "zoom" (draw at native res, scale via CSS layout).
        canvasWidthAttr: n.tagName === 'CANVAS' ? n.width : undefined,
        canvasHeightAttr: n.tagName === 'CANVAS' ? n.height : undefined,
        clientWidth: n.clientWidth, clientHeight: n.clientHeight
      });
      n = n.parentElement;
    }
    const stateKeys = [];
    const as = (typeof annotationState !== 'undefined') ? annotationState : null;
    if (as){
      for (const k of Object.keys(as)){
        if (/zoom|scale/i.test(k)) stateKeys.push({ key: k, value: as[k] });
      }
    }
    const result = { ancestors: ancestors, annotationStateZoomLikeKeys: stateKeys };
    if (console.table){ console.table(ancestors); console.table(stateKeys); } else { console.log(result); }
    return result;
  };

  return 'vcmd up: command line (native tools only) — just start typing a tool name (or # for a tag), '
    + RW._cmdTable.length + ' commands, ' + (RW._cmdTagList ? RW._cmdTagList.length + ' tags' : 'no tags detected')
    + '. select is the resting state (Escape returns here); middle-drag pans without switching tools; '
    + 'run __RW._zoomDiagnose() before/after zooming to find the real mechanism for wheel-zoom.';
})()
