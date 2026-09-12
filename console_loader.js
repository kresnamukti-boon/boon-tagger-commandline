/* Boon Command Line (native-tools-only, dual-target build) — console loader.
 * Usage: F12 -> Console -> paste this entire block -> Enter.
 * Installs the AutoCAD-style command line on either the annotate-job page or
 * the graph session ("Duct Takeoff") duct editor: type a native app tool's
 * name/alias (or #tag / #system) to dispatch it. No region workbench on this
 * build. Paste again after each page navigation. */
(async function(){
  function ready(){
    // The graph session has no annotationState/pdf-canvas at all — detected
    // by its own root id instead, confirmed live via opencli.
    if (document.getElementById('graph-session-root')){
      return document.getElementById('graph-canvas-stage')
          && typeof __graphDebug !== 'undefined';
    }
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

// ===== rw_host.js =====
// RW host detector — DUAL-TARGET BRANCH: identifies which Constructions
// Tagger surface this loader is running on (the annotate-job page, or the
// graph session / "Duct Takeoff" duct editor) and publishes the one fact
// every other module needs before it can do anything host-specific: which
// canvas/stage element to anchor the command-line overlay to.
//
// MUST be loaded FIRST, before rw_panelux.js — rw_panelux.js reads
// window.__RWhost.canvasId at its own top level (to wrap that element's
// addEventListener) BEFORE window.__RW exists, so this can't be a method on
// RW itself; it has to be a plain window global available pre-__RW.
//
// Detected from the DOM (a graph-session-only root id), not the URL, so it
// stays correct if either route ever moves. Every other host-specific fact
// (the command table, tag/system search, readTool/readMode, per-tool
// settings, whether middle-drag pan applies) lives in rw_cmdline.js itself,
// branching on window.__RWhost.id — see CLAUDE.md's "dual-target host
// adapter" round for why that split, not this file, owns those.
(function(){
  if (window.__RWhost) return 'host already detected: ' + window.__RWhost.id;

  const isGraph = !!document.getElementById('graph-session-root');

  window.__RWhost = {
    id: isGraph ? 'graph' : 'annotate',
    // The element RW._cmdRepositionOverlay anchors the command-bar overlay
    // to, and rw_panelux.js's listener-gate wraps. Confirmed live via
    // opencli: #graph-canvas-frame/#pointer-layer carry a large negative-
    // offset CSS transform (the actual 3024x2268 drawing surface), so
    // anchoring there would place the bar off-screen — #graph-canvas-stage
    // is the viewport-sized box the drawing scrolls/zooms inside.
    canvasId: isGraph ? 'graph-canvas-stage' : 'annotation-canvas'
  };

  return 'host detected: ' + window.__RWhost.id;
})()

;
// ===== rw_panelux.js =====
// RW v2.8 — collapsible panel + master killswitch.
// NATIVE-TOOLS-ONLY BRANCH: trimmed to drop workbench-teardown on disable
// (rw_install.js/rw_masktools.js/rw_brushpoly.js are gone on this branch) —
// see CLAUDE.md's "A dedicated branch" section.
// DUAL-TARGET BRANCH: loaded right after rw_host.js, so window.__RWhost is
// already set — see CLAUDE.md's host-adapter round for why detection itself
// lives in that separate, tinier file rather than here.
// MUST be loaded before rw_core. Wraps the host's canvas/stage element's
// addEventListener so every handler registered by later modules auto-checks
// RW.enabled.
(function boot(){
  'use strict';

  // __RW doesn't exist yet (rw_core creates it). Gate lives on a separate
  // object until retrofit().
  if (!window.__RWgate) window.__RWgate = { enabled: true };
  const gate = window.__RWgate;

  // Falls back to the annotate-page id if rw_host.js somehow didn't run —
  // defensive, matching this file's existing no-op-without-throwing style.
  const canvasId = (window.__RWhost && window.__RWhost.canvasId) || 'annotation-canvas';

  /* ---------- auto-gate all host-canvas listeners ---------- */
  const ac = document.getElementById(canvasId);
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

    RW.enabled = gate.enabled;
    RW.v28 = true;

    // Build the header/collapsible-body DOM exactly once. Guarded so a
    // re-paste of this loader, OR the workbench's own rw_panelux.js having
    // already retrofitted the same shared panel first (load-order
    // independence — see CLAUDE.md), doesn't duplicate the header.
    if (!document.getElementById('rw-collapse')){
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
    }

    // No side-panel CSS anymore — the panel is a fixed bottom-center overlay
    // styled by rw_core.js and positioned by rw_cmdline.js's
    // RW._cmdRepositionOverlay. Nothing here manages its box geometry.

    /* ---------- panel state — compose with whatever the workbench's own
       rw_panelux.js already defined here (load-order independence), so
       behavior accumulates regardless of which copy's retrofit() ran
       first. See CLAUDE.md. ---------- */
    RW.panelExpanded = true;
    const prevSetPanelExpanded = RW.setPanelExpanded || function(){};
    RW.setPanelExpanded = function(on){
      prevSetPanelExpanded(on);
      RW.panelExpanded = !!on;
      const b = document.getElementById('rw-body');
      const c = document.getElementById('rw-collapse');
      if (!c) return;
      // Expansion now only toggles the body's display — the panel's fixed
      // overlay box stays as rw_core.js sized it (the overlay is positioned
      // bottom-up, so a collapsed body naturally leaves just the header).
      if (RW.panelExpanded){
        if (b) b.style.display = '';
        c.innerHTML = '&#9660;';
        c.title = 'Collapse Command Line';
      } else {
        if (b) b.style.display = 'none';
        c.innerHTML = '&#9654;';
        c.title = 'Expand Command Line';
      }
    };

    const prevSetEnabled = RW.setEnabled || function(){};
    RW.setEnabled = function(on){
      prevSetEnabled(on);
      gate.enabled = !!on;
      RW.enabled = !!on;
      const btn = document.getElementById('rw-enable');
      if (btn){
        btn.innerText = 'RW: ' + (RW.enabled ? 'ON' : 'OFF');
        btn.style.background = RW.enabled ? 'rgba(100,220,100,0.25)' : 'rgba(220,100,100,0.30)';
      }
      if (!RW.enabled){
        const av = document.getElementById(canvasId);
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
// Load after rw_host.js and rw_panelux.js, before rw_cmdline.js.
(function(){
  if (window.__RW && window.__RW.vcore) return 'RW core already installed';

  const RW = window.__RW = window.__RW || {};
  RW.vcore = true;
  RW.enabled = (window.__RWgate ? window.__RWgate.enabled : true);
  // Copied onto RW for rw_cmdline.js's convenience (it already aliases
  // window.__RW to a local RW const) — falls back to the annotate-page
  // identity if rw_host.js somehow didn't run, same defensive style as
  // rw_panelux.js's own fallback.
  RW._host = window.__RWhost || { id: 'annotate', canvasId: 'annotation-canvas' };

  // Reuse #rw-panel if the workbench's rw_install.js already built one — this
  // is meant as a minimal FALLBACK bootstrap for when the real workbench isn't
  // present, not a competitor to it. First-loaded owns the panel's mount/style.
  let panel = document.getElementById('rw-panel');
  if (!panel){
    panel = document.createElement('div');
    panel.id = 'rw-panel';
    // Fixed bottom-center overlay pinned to the canvas viewport (positioned by
    // rw_cmdline.js's RW._cmdRepositionOverlay, which also stays pinned on
    // resize). Appended to document.body, not the side rail, so it neither
    // scrolls nor pans with the drawing. z-index is set one below the 32-bit
    // signed max so no app-owned element (the annotation canvas wrapper, the
    // right rail, toolbars, modals) can stack above it — a plain high-but-finite
    // value like 99990 was occluded on a real job once the panel left the
    // rail and became a sibling of the app's own content. The one thing that
    // DOES deliberately stack above the panel is rw_cmdline.js's own
    // #rw-cmd-menu autocomplete dropdown, at the true max (2147483647) — it
    // used to render behind the panel and get clipped by the header strip.
    panel.style.cssText = 'position:fixed;z-index:2147483646;background:#222;border:1px solid #666;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.5);padding:8px;font-size:12px;color:#eee;';
    panel.innerHTML = '<div id="rw-list"></div>'; // title bar + killswitch added by rw_panelux.js's retrofit()
    document.body.appendChild(panel);
    // Only the tool that actually built the fixed overlay owns its
    // positioning — RW._cmdRepositionOverlay/the drag handlers check this
    // before writing style.left/top/bottom, so they no-op instead of
    // dislocating a panel some other tool mounted differently (e.g. embedded
    // in #right-rail-content with position:relative).
    RW._cmdOwnsPanelPosition = true;
  }

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
// RW vcmd — AutoCAD-style command line, NATIVE-TOOLS-ONLY, DUAL-TARGET
// BRANCH: type a native app tool's name/alias (or a tag/system via #name)
// into an always-visible input; autocomplete suggests matches; Enter/Space
// dispatches a synthetic key the host app's own listeners consume. No
// workbench commands on this branch — see CLAUDE.md.
//
// Installs on either of two hosts, detected once via RW._host (rw_host.js):
// the annotate-job page ('annotate', RW._host.id today's default), or the
// graph session / "Duct Takeoff" duct editor ('graph'). Every host-specific
// fact — the command table, per-tool settings, tag/system search, and
// whether middle-drag pan applies — branches on RW_HOST below, computed
// once. See CLAUDE.md's host-adapter round for the live findings behind
// each branch.
//
// Full design history: CLAUDE.md.
//
// Load LAST (after rw_core.js, needs vcore).
(function(){
  const RW = window.__RW;
  if (!RW || !RW.vcore) return 'need rw_core.js first';
  if (RW.vcmd) return 'command line already installed';
  RW.vcmd = true;

  // Computed once, module-wide — falls back to the annotate-page identity if
  // RW._host is somehow missing (rw_core.js already defends this the same
  // way; kept here too so this file never depends on load order to avoid
  // throwing outright).
  const RW_HOST = (RW._host && RW._host.id) || 'annotate';
  const RW_CANVAS_ID = (RW._host && RW._host.canvasId) || 'annotation-canvas';
  const RW_IS_GRAPH = RW_HOST === 'graph';

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
    // readTool() (defined further below) is host-aware — annotationState.currentTool
    // on the annotate host, window.__graphDebug.activeTool on the graph host. Safe to
    // call here despite being defined later in this file: this function is itself only
    // ever CALLED at runtime, after the whole module (and readTool's own declaration)
    // has finished loading — the same "safe regardless of source order" guarantee this
    // file already relies on for RW._cmdActiveSettingsTool below.
    const before = readTool();
    const evt = new KeyboardEvent('keydown', {key:key, bubbles:true, cancelable:true});
    evt.__rwSynthetic = true;
    document.dispatchEvent(evt);
    const after = readTool();
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
  // The graph host's own real tools (route, flex, grd, ...) — confirmed live
  // via opencli to arm directly on their own key, with no separate draw-mode
  // concept to enter first, unlike the annotate host's nativeDrawTool above.
  // Still marked __isDrawTool (not renamed) so Space's "repeat the last real
  // tool" logic in RW.runCommand treats them exactly like a draw tool —
  // that flag has always meant "a real tool, not a mode switch," which is
  // equally true here even though nothing is prefixed.
  function nativeToolPlain(key){
    const fn = function(){ RW._cmdDispatchAppKey(key); };
    fn.__isDrawTool = true;
    return fn;
  }

  const NATIVE = 'native';
  const ACTION = 'action'; // graph host only — a click on one of the app's own action buttons, no keyboard shortcut of its own (see GRAPH_ACTIONS below)

  // ----- annotate host: unchanged from every prior round -----
  const ANNOTATE_TABLE = [
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
    { name:'void',     kind:NATIVE, aliases:['v'],  void:true, run: nativeDrawTool('v') }, // void:true marks it so RW.runCommand can self-track the void workflow (see below) without reversing its draw-tool dispatch
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

  // ----- graph ("Duct Takeoff") host: confirmed live via opencli — every
  // data-tool value and its key hint (S R F E B T G U V C D) matched exactly,
  // and dispatching each key from `document` flipped __graphDebug.activeTool
  // with pageEntities/history staying at 0 throughout. `select` is this
  // host's own resting state already, so it's a mode switch here too, same
  // as the annotate host's `select` — everything else is a real tool.
  const GRAPH_TABLE = [
    { name:'select',     kind:NATIVE, aliases:['s'], run: nativeKey('s') },
    { name:'route',      kind:NATIVE, aliases:['r','duct'],      run: nativeToolPlain('r') },
    { name:'flex',       kind:NATIVE, aliases:['f'],             run: nativeToolPlain('f') },
    { name:'extend',     kind:NATIVE, aliases:['e'],             run: nativeToolPlain('e') },
    { name:'branch',     kind:NATIVE, aliases:['b'],             run: nativeToolPlain('b') },
    { name:'transition', kind:NATIVE, aliases:['t'],             run: nativeToolPlain('t') },
    { name:'grd',        kind:NATIVE, aliases:['g','diffuser'],  run: nativeToolPlain('g') },
    { name:'unit',       kind:NATIVE, aliases:['u','equipment'], run: nativeToolPlain('u') },
    { name:'vertical',   kind:NATIVE, aliases:['v','riser'],     run: nativeToolPlain('v') },
    { name:'cut',        kind:NATIVE, aliases:['c','split'],     run: nativeToolPlain('c') },
    { name:'damper',     kind:NATIVE, aliases:['d'],             run: nativeToolPlain('d') },
  ];

  // Enforced in RW.runCommand's button-dispatch path, not just by omission
  // from GRAPH_ACTIONS below — see that function's own comment. Save is a
  // force-flush/retry control (this app has no manual-commit mode at all,
  // confirmed live), Submit has no id to begin with (never reachable via
  // getElementById), and recording is capture tooling this command line
  // must never drive.
  const FORBIDDEN_BUTTON_IDS = [
    'graph-save-commands',
    'graph-recording-configure', 'graph-recording-pause', 'graph-recording-resume', 'graph-recording-stop'
  ];

  // ----- graph host: action-button vocabulary (round 15) -----
  // Buttons the graph session owns with no keyboard shortcut of their own —
  // reuses RW.runCommand's existing (until now unused) `btn` dispatch path
  // rather than a new mechanism (see that function). Deliberately excludes
  // Save/Submit/recording (see FORBIDDEN_BUTTON_IDS, enforced in code, not
  // just by omission here) and, per Kresna's own instruction this round, the
  // "System / network" and "New system" property-group actions — assigning
  // a network to a system, creating a system, and renaming a system all stay
  // out of the command line's vocabulary. Every other action button on the
  // page is included, accepting that each one auto-submits a real command to
  // the server the instant it's invoked (confirmed live: this app has no
  // manual-commit mode — CommandJournal flushes within 300ms-2s regardless
  // of the Save button, which is a force-flush/retry control, not a commit
  // gate) — exactly the same as a user clicking that same button by hand.
  // No single-letter aliases: every one of s/r/f/e/b/t/g/u/v/c/d is already
  // a GRAPH_TABLE tool key, so these take word names/aliases only, chosen so
  // no name or alias collides with (or prefixes) a tool's own name/alias.
  const GRAPH_ACTIONS = [
    { name:'undo',         kind:ACTION, aliases:[],                       btn:'graph-undo-command' },
    { name:'redo',         kind:ACTION, aliases:['re'],                   btn:'graph-redo-command' },
    { name:'zoomfit',      kind:ACTION, aliases:['zf','fit'],             btn:'graph-zoom-fit' },
    { name:'zoomin',       kind:ACTION, aliases:['zi'],                   btn:'graph-zoom-in' },
    { name:'zoomout',      kind:ACTION, aliases:['zo'],                   btn:'graph-zoom-out' },
    { name:'region',       kind:ACTION, aliases:['addregion'],            btn:'graph-add-region' },
    { name:'ruler',        kind:ACTION, aliases:['measure'],              btn:'graph-ruler' },
    { name:'calibrate',    kind:ACTION, aliases:['cal'],                  btn:'graph-calibrate',       modal:'graph-calibrate-modal' },
    { name:'setscale',     kind:ACTION, aliases:['scale','knownscale'],   btn:'graph-set-known-scale', modal:'graph-known-scale-modal' },
    { name:'resetscale',   kind:ACTION, aliases:['scalereset'],           btn:'graph-reset-scale' },
    { name:'finish',       kind:ACTION, aliases:['fin'],                  btn:'graph-finish-route',    conditional:'only appears while a route is in progress' },
    { name:'cancel',       kind:ACTION, aliases:['can'],                  btn:'graph-cancel-route',    conditional:'only appears while a route is in progress' },
    { name:'evidence',     kind:ACTION, aliases:['attach'],               btn:'graph-attach-evidence' },
    { name:'note',         kind:ACTION, aliases:['memo'],                 btn:'graph-attach-note' },
    { name:'rationale',    kind:ACTION, aliases:['why'],                  btn:'graph-attach-rationale' },
    { name:'toggledamper', kind:ACTION, aliases:['tdamper'],              btn:'graph-toggle-damper' },
    { name:'elevation',    kind:ACTION, aliases:['riserelev'],            btn:'graph-edit-riser-elevation', conditional:'only appears with a riser selected' },

    // ----- round 19: each config-dialog modal's own Choose/Cancel-equivalent
    // buttons — reuses RW.runCommand's existing button-dispatch path
    // wholesale, same as every action above. The × close buttons are
    // deliberately not exposed — Cancel is a sufficient dismiss verb per
    // dialog. No single-letter aliases needed here (none of these words
    // collide with a tool name or alias — checked directly against all 11
    // GRAPH_TABLE entries and every existing action above, see test 205).
    { name:'choose',       kind:ACTION, aliases:[],                       btn:'graph-branch-fitting-submit',        conditional:'only while the branch fitting dialog is open' },
    { name:'cancelbranch', kind:ACTION, aliases:[],                       btn:'graph-branch-fitting-cancel',        conditional:'only while the branch fitting dialog is open' },
    { name:'apply',        kind:ACTION, aliases:[],                       btn:'graph-checkpoint-transition-submit', conditional:'only while the change size dialog is open' },
    { name:'cancelsize',   kind:ACTION, aliases:[],                       btn:'graph-checkpoint-transition-cancel', conditional:'only while the change size dialog is open' },
    { name:'place',        kind:ACTION, aliases:[],                       btn:'graph-checkpoint-grd-submit',        conditional:'only while the place GRD dialog is open' },
    { name:'cancelgrd',    kind:ACTION, aliases:[],                       btn:'graph-checkpoint-grd-cancel',        conditional:'only while the place GRD dialog is open' },
    { name:'placeriser',   kind:ACTION, aliases:[],                       btn:'graph-checkpoint-riser-submit',      conditional:'only while the riser elevation dialog is open' },
    { name:'cancelriser',  kind:ACTION, aliases:[],                       btn:'graph-checkpoint-riser-cancel',      conditional:'only while the riser elevation dialog is open' },

    // Round 20: bundles the active tool's own width AND height fields into one
    // guided sequence — no `btn`/`run` (this never dispatches a key or clicks a
    // button, so RW.runCommand/runAndClear special-case `dimension` directly,
    // see cmdStartDimension below), just the marker field itself.
    { name:'dimension',    kind:ACTION, aliases:['dim'],                  dimension:true },
  ];

  RW._cmdTable = RW_IS_GRAPH ? GRAPH_TABLE.concat(GRAPH_ACTIONS) : ANNOTATE_TABLE;

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
    // Kept in sync with cmdSweepControls's own copy of this list, by hand —
    // 'input[type="text"]' added round 19 for graph-new-system-name.
    const selectors = ['input[type="range"]', 'input[type="number"]', 'input[type="checkbox"]', 'input[type="text"]', 'select'];
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
  const ANNOTATE_SETTINGS_MAP = {
    wand:  { dataTool: 'magic_wand',  prefix: 'magic-wand-' },
    wrap:  { dataTool: 'shrink_wrap', prefix: 'shrink-wrap-' },
    mline: { dataTool: 'ribbon',      prefix: 'ribbon-' }
  };
  // The graph host has no per-tool id prefix the way wand/wrap/mline do —
  // every one of its ~43 inspector controls shares one flat "graph-" prefix
  // (confirmed live), and a tool's own params are told apart from another
  // tool's by DOM visibility instead (the inspector aside only shows the
  // controls relevant to whatever's armed). RW._cmdToolSettingsList below
  // applies that extra visibility filter whenever RW_IS_GRAPH is true — see
  // its own comment. Every real tool gets an entry (even `damper`/`cut`,
  // which may round up empty) so `<tool>.` still drills in cleanly instead
  // of reporting "unknown tool."
  const GRAPH_SETTINGS_PREFIX = 'graph-';
  const GRAPH_SETTINGS_MAP = GRAPH_TABLE.reduce(function(map, entry){
    if (entry.name !== 'select') map[entry.name] = { dataTool: entry.name, prefix: GRAPH_SETTINGS_PREFIX };
    return map;
  }, {});

  RW._toolSettingsMap = RW_IS_GRAPH ? GRAPH_SETTINGS_MAP : ANNOTATE_SETTINGS_MAP;

  // ----- graph host: scoping the settings sweep to the real inspector (round 15) -----
  // Confirmed live: "every graph- id that's currently visible" (the rule
  // above) leaks chrome that happens to share the visible check but isn't
  // any tool's own param — graph-scale-target/graph-route-anchor live in the
  // canvas toolbar (<aside aria-label="Duct graph tools">), not the
  // inspector (<aside aria-label="Duct graph inspector">); graph-new-
  // system-service belongs to the inspector's own "New system" creator
  // block, not to any tool; and all 7 controls under the collapsed
  // "Advanced (pressure, material, seams, gauge...)" <details> passed the
  // old visibility check even while shut, so route. listed 18 params
  // instead of the real 8. This object is the structural fix: rootTag/
  // rootLabel scope the sweep to the real inspector, collapsedGroupTag
  // respects a shut <details>, excludeInsideTags keeps a <dialog>'s own
  // inputs out even while open (six checkpoint/scale modals carry graph-*
  // ids of their own), and the two exclude lists are the pragmatic
  // remainder — chrome with no purely-structural discriminator available
  // (graph-new-system-service's creator block has no id and no <details> to
  // key off). null on the annotate host, so cmdParamAllowed no-ops there —
  // byte-identical behavior to before this round.
  const GRAPH_PARAM_SCOPE = {
    rootTag: 'ASIDE',
    rootLabel: 'Duct graph inspector',
    excludeIds: ['graph-scale-target', 'graph-route-anchor'], // canvas toolbar — also excluded by rootTag/rootLabel; kept as documentation of the live finding
    // Round 15 excluded this prefix wholesale (the inspector's "New system"
    // creator block, not a tool param). Round 19 deliberately re-admits
    // graph-new-system-name/-service per explicit instruction — confirmed
    // live those two are the ONLY elements under this prefix, and
    // graph-create-system ("Add") is a <button>, never swept by
    // cmdSweepControls, so it needs no exclusion rule of its own and gets no
    // table entry. Left empty rather than removed so a future round has an
    // obvious place to re-add an exclusion if one is ever needed.
    excludeIdPrefixes: [],
    excludeInsideTags: ['DIALOG'],
    collapsedGroupTag: 'DETAILS'
  };
  const PARAM_SCOPE = RW_IS_GRAPH ? GRAPH_PARAM_SCOPE : null;

  // ----- graph host: the four per-tool config-dialog modals (round 19) -----
  // Confirmed live via opencli: clicking a real duct segment's "Tap in
  // (branch)" opens a genuine <dialog> (graph-branch-fitting-modal) with its
  // own fields, following the exact same <label><span>Live label</span>
  // <control></label> convention the ordinary inspector already uses — so
  // round 18's live-label matching (cmdControlLiveLabel) applies unchanged.
  // Three siblings share the identical structure: change-size/transition,
  // GRD placement, and riser elevation. None of these are showModal()-modal
  // (confirmed: dialog.matches(':modal') is false) — #rw-cmd-input can be
  // focused and typed into while one is open; the auto-capture bail-out
  // narrowed below (see cmdOpenDialogs's own comment) was the only thing
  // stopping that.
  const GRAPH_TOOL_MODALS = {
    branch:     { dialogId: 'graph-branch-fitting-modal',        prefix: 'graph-branch-fitting-',        title: 'branch fitting' },
    transition: { dialogId: 'graph-checkpoint-transition-modal', prefix: 'graph-checkpoint-transition-', title: 'change size' },
    grd:        { dialogId: 'graph-checkpoint-grd-modal',        prefix: 'graph-checkpoint-grd-',        title: 'place GRD' },
    vertical:   { dialogId: 'graph-checkpoint-riser-modal',      prefix: 'graph-checkpoint-riser-',      title: 'riser elevation' }
  };
  const GRAPH_MODAL_DIALOG_IDS = Object.keys(GRAPH_TOOL_MODALS).map(function(k){ return GRAPH_TOOL_MODALS[k].dialogId; });

  // Returns {tool, dialog, prefix, id, title} only when `tool` has a
  // registered modal AND that modal's dialog is genuinely open right now —
  // reuses cmdOpenDialogs's own open-check (d.open || hasAttribute('open'))
  // rather than duplicating it, so it's also [] (and this is null) for free
  // on the annotate host. Returns null in every other case — including for
  // every other graph tool, and for these four while closed — so behavior
  // stays byte-identical to before this round whenever no recognized modal
  // is actually open.
  function cmdOpenToolModal(tool){
    const reg = GRAPH_TOOL_MODALS[tool];
    if (!reg) return null;
    const open = cmdOpenDialogs().find(function(d){ return d.id === reg.dialogId; });
    if (!open) return null;
    return { tool: tool, dialog: open, prefix: reg.prefix, id: reg.dialogId, title: reg.title };
  }

  // Which tracked tool (if any) currently has ITS OWN modal open — used so
  // bare-param blending in onInput() still works even if a modal's owning
  // tool isn't reported by RW._cmdActiveSettingsTool() (see round 19's
  // robustness note for grd/vertical, whose activeTool mapping while their
  // own modal is open was never individually confirmed live).
  function cmdOpenModalTool(){
    for (const tool in GRAPH_TOOL_MODALS){
      if (cmdOpenToolModal(tool)) return tool;
    }
    return null;
  }
  RW._cmdToolModal = cmdOpenToolModal; // console debugging, matching this file's existing _cmd* probe convention

  // Extraction of the old inline visibility check — shared with the
  // button-usability check in RW.runCommand (see GRAPH_ACTIONS).
  function cmdIsVisible(el){
    return !!(el.offsetParent || (el.getClientRects && el.getClientRects().length));
  }

  // ----- Round 24: is a GRAPH_ACTIONS entry actually runnable RIGHT NOW? -----
  // Read-only mirror of RW.runCommand's own button-resolution steps (never
  // clicks anything) — extracted so the dropdown can hide an action that
  // would just be refused if picked, instead of listing it and only reporting
  // "not available right now" after the fact (Kresna's own request: "command
  // that didn't applicable for a specific state, its best not to include in
  // the dropdown list"). Confirmed live (see RW.runCommand's own comment):
  // this page uses two different disabled idioms — visible-but-disabled
  // (finish/cancel while a route is idle) and hidden-but-not-disabled
  // (assign-network/toggle-damper with nothing selected) — both covered here
  // the same way runCommand already covers them. Entries with no `.btn` at
  // all (every native tool, and `dimension`, which has its own dedicated
  // isolation exemption) always return true — this only ever gates the
  // button-backed GRAPH_ACTIONS vocabulary, never a tool switch.
  function cmdActionUsable(entry){
    if (!entry.btn) return true;
    if (FORBIDDEN_BUTTON_IDS.indexOf(entry.btn) !== -1) return false;
    const btn = document.getElementById(entry.btn);
    if (!btn) return false;
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
    if (!cmdIsVisible(btn)) return false;
    return true;
  }

  // Upward parentNode walk to the nearest ancestor with the given tagName.
  // Not Element.closest(): this project's own Node test harness
  // (verify_cmdline.js) has no closest()/contains(), only parentNode/
  // parentElement, and this code must run unchanged against both the real
  // DOM and that stub. Capped, matching this file's existing pan-container-
  // walk idiom.
  function cmdAncestorByTag(el, tagName){
    let node = el.parentNode, hops = 0;
    while (node && hops++ < 64){
      if (node.tagName === tagName) return node;
      node = node.parentNode;
    }
    return null;
  }

  // True if `el` is `root` or a descendant of it — again a hand-rolled
  // parentNode walk, no .contains() available in the stub.
  function cmdIsWithin(el, root){
    let node = el, hops = 0;
    while (node && hops++ < 64){
      if (node === root) return true;
      node = node.parentNode;
    }
    return false;
  }

  // The live inspector aside — re-resolved every call (it re-renders per
  // armed tool), never cached. Selector form ('tag[attr="value"]') is
  // supported by both a real querySelectorAll and this project's own DOM
  // stub's matcher.
  function cmdScopeRoots(){
    if (!PARAM_SCOPE) return [];
    return Array.from(document.querySelectorAll(
      PARAM_SCOPE.rootTag.toLowerCase() + '[aria-label="' + PARAM_SCOPE.rootLabel + '"]'
    ));
  }

  // The nearest shut disclosure ancestor, or null if `el` isn't inside one
  // (or its disclosure is already open). `label` comes from the child
  // <summary>'s own text, found by walking .children — not
  // querySelector('summary'), which the stub can't do.
  function cmdCollapsedGroup(el){
    if (!PARAM_SCOPE) return null;
    const details = cmdAncestorByTag(el, PARAM_SCOPE.collapsedGroupTag);
    if (!details || details.open) return null;
    let label = null;
    const kids = details.children || [];
    for (const child of kids){
      if (child.tagName === 'SUMMARY'){ label = (child.innerText || child.textContent || '').trim() || null; break; }
    }
    return { details: details, label: label };
  }

  // Graph host only (round 18): the live, human-readable label the app itself is
  // currently showing next to a control — confirmed live: every inspector field
  // wraps its control in a <label>, whose own first child <span> holds the
  // on-screen text. Crucially this can flip without the control's id ever
  // changing — route's own `graph-width-input` reads "Width (in)" while its
  // profile is rectangular and "Diameter (in)" the instant it's switched to
  // round, confirmed via opencli — so this is read fresh every call, never
  // cached alongside `param` (which stays the fixed DOM id suffix on purpose,
  // the one stable identifier RW._cmdApplySetting/Tab-fill key off of). Walks
  // `.children` by hand rather than querySelector('span') — same reason
  // cmdCollapsedGroup does above: the Node test stub has no querySelector
  // beyond a plain #id lookup, and this must run unchanged against both.
  function cmdControlLiveLabel(el){
    const label = cmdAncestorByTag(el, 'LABEL');
    if (!label) return null;
    const kids = label.children || [];
    for (const child of kids){
      if (child.tagName === 'SPAN'){
        const text = (child.innerText || child.textContent || '').trim();
        return text || null;
      }
    }
    return null;
  }

  // Splits a live label into lowercase words a bare query can prefix-match
  // against individually — e.g. "Width (in)" -> ['width','in'], "System /
  // network" -> ['system','network'] — so typing "network" matches the
  // system field by its second word, not just its first, and "diameter"
  // matches the very same width control once its label has flipped under a
  // round profile. Never treated as a stable identifier the way `param` is;
  // purely an extra, live-read alias for matching.
  function cmdLabelWords(label){
    return label ? label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) : [];
  }

  // Shared match predicate for both the "<tool>." drill-in list and the bare-
  // param blend below: a query matches a settings item if it prefixes the
  // item's own id-derived param name (unchanged, pre-round-18 behavior) OR
  // prefixes any word of its live on-screen label (round 18's addition).
  function cmdParamMatchesQuery(item, q){
    if (!q) return true;
    if (item.param.toLowerCase().indexOf(q) === 0) return true;
    return cmdLabelWords(item.label).some(function(w){ return w.indexOf(q) === 0; });
  }

  // The one predicate this round fixes: which "graph-" control is actually
  // the currently-armed tool's own param, vs. chrome that merely shares the
  // same visible prefix. Returns null when allowed, else a short reason
  // token — used both by RW._cmdToolSettingsList (to filter) and
  // RW._cmdParamScopeDiagnose (to report why each control was rejected).
  // Annotate host: PARAM_SCOPE is null, so this always returns null —
  // nothing here ever ran before this round, and nothing here changes now.
  //
  // `modal` (round 19, optional) — when the caller already knows a
  // recognized config-dialog modal is open for this tool (see
  // cmdOpenToolModal above), pass it here to swap BOTH the excludeInsideTags
  // DIALOG check and the ordinary inspector-scoping check for a single
  // "is this element inside THAT modal's own dialog" check. Every other
  // rule below — excludeIds, excludeIdPrefixes, cmdCollapsedGroup,
  // cmdIsVisible — still applies unchanged inside the modal too, which is
  // what makes branch's already-observed conditional fields (flush-boot
  // glyphs shown only for certain type+shape combos; a secondary dimension
  // hidden for round) work correctly with zero new logic, exactly like the
  // existing collapsed-"Advanced" group already does. `modal` can only ever
  // come from cmdOpenToolModal against one of the four hardcoded
  // GRAPH_TOOL_MODALS ids, so any other dialog (graph-calibrate-modal,
  // graph-known-scale-modal) keeps failing on the ordinary inside-DIALOG
  // path below, unaffected.
  function cmdParamAllowed(el, modal){
    if (!PARAM_SCOPE) return null;
    if (PARAM_SCOPE.excludeIds.indexOf(el.id) !== -1) return 'excluded-id';
    if (PARAM_SCOPE.excludeIdPrefixes.some(function(p){ return el.id.indexOf(p) === 0; })) return 'excluded-prefix';
    if (modal){
      if (!cmdIsWithin(el, modal.dialog)) return 'outside-modal';
    } else {
      for (const tag of PARAM_SCOPE.excludeInsideTags){
        if (cmdAncestorByTag(el, tag)) return 'inside-' + tag.toLowerCase();
      }
      const roots = cmdScopeRoots();
      if (!roots.some(function(root){ return cmdIsWithin(el, root); })) return 'outside-inspector';
    }
    const grp = cmdCollapsedGroup(el);
    if (grp) return 'collapsed:' + (grp.label || 'group');
    if (!cmdIsVisible(el)) return 'hidden';
    return null;
  }

  // Any currently-open <dialog> — graph host only. Originally added because
  // round 15's own action vocabulary (calibrate/setscale) opens two modals;
  // round 19's own GRAPH_TOOL_MODALS (branch/transition/grd/vertical) opens
  // four more, all discovered through this same sweep. Used to bail the
  // global auto-capture keydown listener out of the way (see its own
  // comment) while a non-recognized one is open, so typing reaches the
  // app's modal instead of the command bar; also reused by
  // cmdOpenToolModal above rather than re-implementing the open-check.
  function cmdOpenDialogs(){
    if (!RW_IS_GRAPH) return [];
    return Array.from(document.querySelectorAll('dialog'))
      .filter(function(d){ return d.open || d.hasAttribute('open'); });
  }

  function cmdControlType(el){
    if (el.tagName === 'SELECT') return 'select';
    if (el.type === 'checkbox') return 'checkbox';
    if (el.type === 'text') return 'text'; // round 19: needed for graph-new-system-name
    return 'number'; // covers both range and number inputs, treated identically today
  }

  // The same control sweep RW._toolSettingsDiagnose uses, reused here rather than duplicated.
  // 'input[type="text"]' added round 19 for the inspector's "New system" name
  // field (graph-new-system-name carries an explicit type="text" attribute,
  // confirmed live) — mirror any change here in RW._toolSettingsDiagnose's
  // own copy of this same list so the two never silently diverge (that one
  // groups by type on purpose, for comparing controls of the same kind by
  // eye in the console — this one must not).
  //
  // Round 19 fix (Kresna's own feedback on the branch-fitting listing): the
  // single combined selector string below returns matches in real DOM
  // (document) order, so a modal's — or the inspector's — fields list top to
  // bottom exactly as they're laid out on screen (Fitting, Branch shape,
  // Starting width, Alignment, Width, Height, Damper), not grouped by input
  // type as five separate querySelectorAll passes concatenated together
  // would (all ranges/numbers first, then checkboxes, then text, then
  // selects — which is what shipped originally and read out of visual
  // order). Every caller (RW._cmdToolSettingsList, RW._cmdParamScopeDiagnose)
  // gets this ordering for free.
  function cmdSweepControls(){
    return Array.from(document.querySelectorAll(
      'input[type="range"], input[type="number"], input[type="checkbox"], input[type="text"], select'
    ));
  }

  // Live current value/range/options for each of a tool's params, discovered fresh every call by
  // id prefix — the settings-param menu's data source. Reads the real element's live state (same
  // discipline as RW._toolSettingsDiagnose), never a stale default.
  // `opts.includeCollapsed` (default false) additionally returns params that
  // are real but currently hidden behind a shut disclosure (e.g. graph's own
  // "Advanced" group), stamping `item.collapsedGroup` with that group's
  // label — see RW._cmdToolCollapsedGroups, which is what surfaces their
  // existence without ever silently including them here by default.
  RW._cmdToolSettingsList = function(tool, opts){
    const entry = RW._toolSettingsMap[tool];
    if (!entry) return [];
    // Round 19: while one of this tool's own config-dialog modals is open,
    // its params live under a different id prefix (and a different scoping
    // root) than the ordinary inspector — resolve both fresh per call. When
    // no recognized modal is open this is null and every line below behaves
    // exactly as it did before this round.
    const modal = cmdOpenToolModal(tool);
    const prefix = modal ? modal.prefix : entry.prefix;
    const includeCollapsed = !!(opts && opts.includeCollapsed);
    const found = [];
    cmdSweepControls().forEach(function(el){
      if (!el.id || el.id.indexOf(prefix) !== 0) return;
      const reason = cmdParamAllowed(el, modal);
      const isCollapsed = !!reason && reason.indexOf('collapsed:') === 0;
      if (reason && !(includeCollapsed && isCollapsed)) return;
      const param = el.id.slice(prefix.length);
      const type = cmdControlType(el);
      // Graph host only (round 18) — the live on-screen label ("Width (in)",
      // flipping to "Diameter (in)" the moment route's own profile switches
      // to round), an extra alias cmdParamMatchesQuery matches queries
      // against alongside `param`. Left null on the annotate host, where
      // wand/wrap/mline were never confirmed to have this same <label>-
      // wrapping convention — scoped here rather than assumed to apply
      // everywhere.
      const item = { tool: tool, param: param, id: el.id, type: type, label: RW_IS_GRAPH ? cmdControlLiveLabel(el) : null };
      if (modal) item.modal = modal.id; // lets callers/tests tell modal params apart without re-deriving it
      if (isCollapsed) item.collapsedGroup = reason.slice('collapsed:'.length);
      if (type === 'select'){
        item.current = el.value;
        item.options = Array.from(el.options).map(function(o, i){ return { index: i + 1, value: o.value, text: o.text }; });
      } else if (type === 'checkbox'){
        item.current = el.checked ? 'on' : 'off';
      } else if (type === 'text'){
        item.current = el.value; // no min/max/step — a free-typed string, not a number
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

  // Which of `tool`'s own params are currently hidden behind a shut
  // disclosure — the sibling to the list above's default (collapsed-
  // excluded) view. Lets a caller learn there's more without silently
  // expanding anything itself; RW._cmdApplySetting is the thing that
  // actually expands, and only when asked to write one of these.
  RW._cmdToolCollapsedGroups = function(tool){
    const withCollapsed = RW._cmdToolSettingsList(tool, { includeCollapsed: true });
    const byLabel = {};
    withCollapsed.forEach(function(item){
      if (!item.collapsedGroup) return;
      byLabel[item.collapsedGroup] = (byLabel[item.collapsedGroup] || 0) + 1;
    });
    return Object.keys(byLabel).map(function(label){ return { label: label, count: byLabel[label] }; });
  };

  // The (at most one) open recognized modal `el` actually sits inside, or
  // null — used by RW._cmdParamScopeDiagnose below so it can pass the right
  // modal into cmdParamAllowed per control, the same way
  // RW._cmdToolSettingsList does when it already knows which tool it's
  // asking about.
  function cmdModalForElement(el){
    for (const tool in GRAPH_TOOL_MODALS){
      const modal = cmdOpenToolModal(tool);
      if (modal && cmdIsWithin(el, modal.dialog)) return modal;
    }
    return null;
  }

  // Read-only probe, same spirit as RW._toolSettingsDiagnose/_panDiagnose:
  // for every "graph-"-prefixed control currently on the page, reports
  // whether RW._cmdToolSettingsList would allow it and why not when it
  // wouldn't. Console-only, never mutates the DOM. n/a (empty array) on the
  // annotate host, where PARAM_SCOPE is null and this question doesn't apply.
  // Round 19: every modal control used to blanket-report 'inside-dialog',
  // which is actively misleading now that these four are reachable —
  // resolve the (at most one) owning modal per control and pass it through,
  // stamping the reported row's `modal` field with the owning tool name.
  RW._cmdParamScopeDiagnose = function(){
    if (!PARAM_SCOPE){ console.log('[RW] param-scope diagnostic: n/a on this host'); return []; }
    const rows = cmdSweepControls()
      .filter(function(el){ return el.id && el.id.indexOf(GRAPH_SETTINGS_PREFIX) === 0; })
      .map(function(el){
        const modal = cmdModalForElement(el);
        const reason = cmdParamAllowed(el, modal);
        return { id: el.id, allowed: !reason, rejectedBy: reason || null, modal: modal ? modal.tool : null };
      });
    if (console.table) console.table(rows); else console.log(rows);
    return rows;
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
    // Graph host: readTool() already returns the tool's own name (e.g.
    // "route"), the same key GRAPH_SETTINGS_MAP is built from — no separate
    // dataTool lookup needed the way the annotate host's currentTool
    // strings (e.g. "magic_wand") require.
    if (RW_IS_GRAPH) return RW._toolSettingsMap[cur] ? cur : null;
    for (const name in RW._toolSettingsMap){
      if (RW._toolSettingsMap[name].dataTool === cur) return name;
    }
    return null;
  };

  // ----- graph host only: isolate the command line to the armed tool (round 17) -----
  // Confirmed via AskUserQuestion: reverses round 5b's "additive, not exclusive"
  // decision, but only on the graph host — the annotate host's wand/wrap/mline stay
  // additive, unchanged below. While a duct tool (route, flex, ...) is armed, the
  // command line becomes modal: only that tool's own properties, the ways out
  // (select/Escape/Space), and the route-lifecycle actions (finish/cancel) are
  // reachable. Everything else — other action buttons, # system search — is
  // refused with a status message rather than silently vanishing.
  // Round 19: the 8 new modal-action commands are appended flat, matching
  // the finish/cancel precedent above rather than scoping per-tool —
  // finish/cancel are already globally allowed despite being route-specific,
  // and the same reasoning applies here: typing `place` while `route` is
  // isolated is harmless, since the GRD dialog isn't open and RW.runCommand
  // already reports "its button is not on the page right now" (see test 205's
  // sibling coverage of this decision).
  const GRAPH_ISOLATION_ALLOWED = [
    'select', 'finish', 'cancel',
    'choose', 'cancelbranch', 'apply', 'cancelsize', 'place', 'cancelgrd', 'placeriser', 'cancelriser',
    // Round 20: `dimension` only ever edits the isolated tool's OWN width/height
    // fields (via RW._cmdApplySetting, exactly like typing "<tool>.width-input="
    // by hand) — never another tool's, so it's exempt from isolation the same way
    // finish/cancel already are, not scoped per-tool.
    'dimension'
  ];
  // Round 25 (Kresna's own request, scoped narrowly: "only for the tool"):
  // switching directly to a DIFFERENT native tool while one is ARMED is no
  // longer refused — every `kind === NATIVE` entry (route, flex, select, ...)
  // escapes isolation the same way the GRAPH_ISOLATION_ALLOWED actions above
  // do, so typing/picking another tool's name arms it immediately with no
  // "type select first" detour. Everything else isolation was ever meant to
  // restrict is unchanged: that tool's own properties via a DIFFERENT tool's
  // `tool.` prefix, `#` system search, and every non-tool action (undo,
  // zoomfit, ...) are still refused exactly as before.
  //
  // Deliberately narrower than "isolated at all": the exemption only applies
  // while isolation comes from an actually-ARMED tool, never while it comes
  // from an OPEN CONFIG-DIALOG MODAL (`cmdOpenModalTool()`'s own fallback in
  // RW._cmdIsolatedTool). Dispatching a tool-switch key while one of the four
  // modals (branch fitting, change size, GRD, riser elevation) sits open on
  // screen was never a considered scenario — this file's own modal-dispatch
  // comment elsewhere already flags that as untested — and "switch tools"
  // isn't really what picking a different tool WHILE A DIALOG IS OPEN would
  // mean anyway; Cancel/Escape is the way out of a modal, unchanged.
  function cmdIsolationEscapes(entry, modalOpen){
    if (entry.kind === NATIVE && !modalOpen) return true;
    return GRAPH_ISOLATION_ALLOWED.indexOf(entry.name) !== -1;
  }
  RW._cmdIsolateTools = true; // console escape hatch: __RW._cmdIsolateTools = false restores the old additive behavior
  // Round 23: console escape hatch for the digit-passthrough bail-out in the global
  // auto-capture listener below — __RW._cmdDigitPassthrough = false restores the old
  // behavior (bare digits captured into the command bar even at rest, graph host too).
  RW._cmdDigitPassthrough = true;

  // Returns the tool name to isolate to, or null when nothing should be restricted:
  // annotate host, the hatch turned off, resting in select, or an unreadable
  // activeTool. Deliberately fails OPEN (null) on anything it can't confirm, so a bad
  // read can never lock the command line down — mirrors RW._cmdAutoSelect's own
  // fail-safe convention.
  //
  // Round 19 follow-up (Kresna's own request): fall back to cmdOpenModalTool()
  // when activeTool doesn't resolve on its own. Branch already isolated correctly
  // without this (its activeTool read is confirmed live), but change-size/GRD's own
  // activeTool mapping was never confirmed, so without this fallback opening one of
  // those two modals left isolation off entirely — the full, unrelated command list
  // stayed reachable instead of narrowing to that modal's own fields/actions. A real
  // open `<dialog>` (cmdOpenToolModal's own check) is at least as trustworthy a
  // signal as activeTool, so this isn't a weaker fail-safe — just a second way to
  // reach the same confirmed-open state.
  RW._cmdIsolatedTool = function(){
    if (!RW_IS_GRAPH || RW._cmdIsolateTools === false) return null;
    return RW._cmdActiveSettingsTool() || cmdOpenModalTool();
  };

  // Shared wording for every refusal below, so the message stays consistent regardless
  // of which onInput()/runCommand branch triggered it.
  function cmdIsolationRefuse(tool, what){
    RW._commitStatus && RW._commitStatus(
      tool + ' is active — press Escape or type "select" first' + (what ? ' to ' + what : ''));
  }

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
  // Ids individually confirmed live to actually persist when written this
  // way — the hedge below ("confirm it actually applied") is dropped only
  // for these, everything else still carries it, matching this project's
  // own convention of not overclaiming confirmation it doesn't have. Was a
  // single inline comparison (number-type only) before round 15; pulled into
  // a named set covering all three control types purely so a future round
  // can extend it by adding an id, not by touching logic.
  // - magic-wand-tolerance: confirmed pre-round-15 (a number/range control).
  // - graph-profile-select: confirmed live this round — beyond the DOM
  //   .value change, window.__graphDebug.route.profile itself flipped from
  //   {shape:"rectangular",width_in,height_in} to {shape:"round",diameter_in}
  //   and the inspector's own primary-dimension label re-rendered
  //   ("Width (in)" -> "Diameter (in)"), independent confirmation the app
  //   actually consumed the write, not just that a DOM property changed —
  //   the first select-type control this hedge has ever been dropped for.
  const CONFIRMED_WRITE_IDS = ['magic-wand-tolerance', 'graph-profile-select'];

  // Round 19: re-arms the tool as before UNLESS one of its own config-dialog
  // modals is open, in which case dispatching the tool's own key into an
  // open <dialog> is untested and could as easily cancel/close it as do
  // nothing — so that dispatch is skipped entirely. RW._cmdLastUserCmdAt is
  // still stamped directly either way, preserving the auto-select watcher's
  // grace window a real re-arm used to provide as a side effect. Returns the
  // clause to append to the status line, so every write branch below reports
  // consistently.
  function cmdArmOrNoteModal(tool, modal){
    if (modal){
      RW._cmdLastUserCmdAt = Date.now();
      return modal.title + ' dialog still open';
    }
    RW.runCommand(tool);
    return 're-armed ' + tool;
  }

  RW._cmdApplySetting = function(tool, param, value){
    const entry = RW._toolSettingsMap[tool];
    if (!entry){ RW._commitStatus && RW._commitStatus('unknown tool: ' + tool); return false; }
    // Load-bearing (round 19): without resolving the same modal-aware prefix
    // here as RW._cmdToolSettingsList does, entry.prefix + param would
    // reconstruct the wrong id (e.g. 'graph-' + 'type' = 'graph-type', which
    // doesn't exist) the instant a param came from a modal's own listing.
    const modal = cmdOpenToolModal(tool);
    const prefix = modal ? modal.prefix : entry.prefix;
    const id = prefix + param;
    const el = document.getElementById(id);
    if (!el){ RW._commitStatus && RW._commitStatus('"' + tool + '.' + param + '" control (#' + id + ') is not on the page right now'); return false; }
    const type = cmdControlType(el);
    const confirmed = CONFIRMED_WRITE_IDS.indexOf(id) !== -1;

    // Graph host: a param can be real but currently hidden behind a shut
    // disclosure (RW._cmdToolSettingsList's default view excludes it for
    // exactly that reason). Writing to it explicitly is still allowed — the
    // filter is a listing concern, not a write gate — but the group must be
    // revealed first, or the write would land on a control the inspector
    // itself isn't showing. Click-first (a real <summary> click natively
    // toggles its parent <details>) with a direct-assign fallback, since the
    // DOM stub's click() doesn't toggle .open. No modal contains a <details>
    // group, so this is a no-op whenever `modal` is set.
    let revealNote = '';
    const grp = cmdCollapsedGroup(el);
    if (grp){
      let summaryEl = null;
      const kids = grp.details.children || [];
      for (const child of kids){ if (child.tagName === 'SUMMARY'){ summaryEl = child; break; } }
      if (summaryEl && summaryEl.click) summaryEl.click();
      if (!grp.details.open) grp.details.open = true;
      revealNote = ' (was under collapsed "' + (grp.label || 'group') + '" — expanded it to set this)';
    }

    if (type === 'checkbox'){
      const v = cmdParseBoolish(value);
      if (v === null){ RW._commitStatus && RW._commitStatus('"' + value + '" is not on/off'); return false; }
      el.checked = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const armNote = cmdArmOrNoteModal(tool, modal);
      cmdRememberModalValue(tool, modal, param, v ? 'on' : 'off');
      RW._commitStatus && RW._commitStatus(
        tool + '.' + param + ' set to ' + (v ? 'on' : 'off') + ' — ' + armNote + revealNote
        + (confirmed ? '' : ' (confirm it actually applied)')
      );
      return true;
    }

    if (type === 'select'){
      const options = Array.from(el.options).map(function(o, i){ return { index: i + 1, value: o.value, text: o.text }; });
      const matched = cmdMatchOption(options, value);
      if (!matched){ RW._commitStatus && RW._commitStatus('"' + value + '" doesn\'t match any option for ' + tool + '.' + param); return false; }
      el.value = matched.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const armNote = cmdArmOrNoteModal(tool, modal);
      cmdRememberModalValue(tool, modal, param, matched.value);
      RW._commitStatus && RW._commitStatus(
        tool + '.' + param + ' set to "' + matched.text + '" — ' + armNote + revealNote
        + (confirmed ? '' : ' (confirm it actually applied)')
      );
      return true;
    }

    if (type === 'text'){
      // Plain assignment — no parse/clamp, unlike numeric below.
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const armNote = cmdArmOrNoteModal(tool, modal);
      RW._commitStatus && RW._commitStatus(
        tool + '.' + param + ' set to "' + value + '" — ' + armNote + revealNote
        + (confirmed ? '' : ' (confirm it actually applied)')
      );
      return true;
    }

    let v = parseFloat(value);
    if (isNaN(v)){ RW._commitStatus && RW._commitStatus('"' + value + '" is not a number'); return false; }
    if (el.min !== '' && el.min != null) v = Math.max(parseFloat(el.min), v);
    if (el.max !== '' && el.max != null) v = Math.min(parseFloat(el.max), v);
    el.value = String(v); // explicit — a real <input>.value setter stringifies internally anyway
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const armNote = cmdArmOrNoteModal(tool, modal);
    RW._commitStatus && RW._commitStatus(
      tool + '.' + param + ' set to ' + v + ' — ' + armNote + revealNote
      + (confirmed ? '' : ' (confirm it actually applied)')
    );
    return true;
  };

  // ----- graph host only: remember & auto-fill the four config-dialog modals' own categorical fields (round 26) -----
  // Kresna's own request, confirmed via AskUserQuestion: all four modals (branch fitting, change
  // size, GRD placement, riser elevation) get this, persisted across reloads (localStorage), no
  // typed command needed — the remembered fields are auto-filled the instant a modal opens.
  //
  // "Fields that tend to repeat" is drawn from live control TYPE (select/checkbox), not a
  // hardcoded per-modal field list — this project's own live-discovery convention
  // (RW._cmdToolSettingsList's id-prefix sweep, no hardcoded per-param table) applies here too,
  // and it happens to land exactly on the split Kresna was steered toward: branch fitting's own
  // Fitting type/Branch shape/Alignment/Damper (select/checkbox) get remembered; Starting
  // width/Width/Height (number) don't, since those are more likely to differ duct to duct. Change
  // size/GRD/riser's own real field shapes were never individually confirmed live (see round 19's
  // still-open item) — this rule needs no such confirmation to be correct, since it reads each
  // control's live type, never a specific id.
  const GRAPH_MODAL_MEMORY_KEY = 'rw_graph_modal_memory_v1';

  // window.localStorage, not a bare `localStorage` global reference — this file already relies on
  // `window` for everything else host-environment-shaped (window.innerHeight, window.__graphDebug,
  // ...), and it's what lets the synthetic test harness (verify_cmdline.js) supply its own fake
  // store per test via the stub window object, with no change needed to loadModule's own sandbox
  // globals list.
  function cmdModalMemoryLoad(){
    try {
      const ls = window.localStorage;
      const raw = ls ? ls.getItem(GRAPH_MODAL_MEMORY_KEY) : null;
      return raw ? JSON.parse(raw) : {};
    } catch (e){ return {}; } // private browsing / quota / disabled storage — fail to "nothing remembered", never throw
  }
  function cmdModalMemorySave(){
    try { if (window.localStorage) window.localStorage.setItem(GRAPH_MODAL_MEMORY_KEY, JSON.stringify(RW._cmdModalMemory)); }
    catch (e){ /* same fail-open — a value just won't persist past this page */ }
  }
  RW._cmdModalMemory = RW_IS_GRAPH ? cmdModalMemoryLoad() : {}; // {tool: {param: 'on'/'off'/<select value>}} — console-inspectable
  RW._cmdModalMemoryEnabled = true; // console escape hatch: __RW._cmdModalMemoryEnabled = false stops both remembering and auto-filling
  // Round 26 follow-up: branch fitting's own memory moved to a dedicated standalone repo
  // (boon-duct-workbench, ~/Projects/boon-projects/) — no dependency in either direction, but
  // this is now the ONE place branch's own fields are remembered, so this repo excludes it
  // entirely rather than keep two independent copies of the same idea that could drift apart.
  // change size/GRD/riser (transition/grd/vertical) are unaffected.
  const MODAL_MEMORY_EXCLUDED_TOOLS = ['branch'];
  // Console helper: clears one tool's remembered values, or everything with no argument.
  // Clearing 'branch' is a documented no-op now — nothing is ever recorded there to begin with.
  RW._cmdModalMemoryClear = function(tool){
    if (tool) delete RW._cmdModalMemory[tool]; else RW._cmdModalMemory = {};
    cmdModalMemorySave();
  };

  // Called from RW._cmdApplySetting's own checkbox/select branches right after a real write —
  // `modal` is only truthy when that write happened while the tool's OWN config-dialog modal was
  // open (RW._cmdApplySetting already resolves this fresh per call), which is exactly what scopes
  // remembering to "change-size/GRD/riser windows" and not the ordinary always-visible inspector —
  // a write to route's own `gauge-select`, say, is never remembered by this. `branch` is excluded
  // here too (see MODAL_MEMORY_EXCLUDED_TOOLS above).
  function cmdRememberModalValue(tool, modal, param, value){
    if (!modal || !RW._cmdModalMemoryEnabled) return;
    if (MODAL_MEMORY_EXCLUDED_TOOLS.indexOf(tool) !== -1) return;
    RW._cmdModalMemory[tool] = RW._cmdModalMemory[tool] || {};
    RW._cmdModalMemory[tool][param] = value;
    cmdModalMemorySave();
  }

  // Silently applies a remembered value to a real control — no status line, no arm/re-arm note,
  // no re-recording into memory (this only ever reads from it). Only ever called with type
  // 'select'/'checkbox', the only two kinds this remembers.
  function cmdWriteRememberedValue(el, type, value){
    if (type === 'checkbox') el.checked = (value === 'on');
    else el.value = value; // select — the option's own .value, exactly as stored
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Called once each time a recognized modal transitions from closed to open (see
  // RW._cmdModalMemoryTick below) — fills in whichever of its own select/checkbox fields have a
  // remembered value that differs from the field's current one, then reports ONE combined status
  // line rather than spamming one per field (RW._commitStatus is a single overwritten line, not a
  // log — see rw_core.js).
  function cmdAutoFillModalMemory(tool){
    if (!RW._cmdModalMemoryEnabled) return;
    if (MODAL_MEMORY_EXCLUDED_TOOLS.indexOf(tool) !== -1) return; // branch — see its own dedicated repo instead
    const remembered = RW._cmdModalMemory[tool];
    if (!remembered) return;
    const filled = [];
    RW._cmdToolSettingsList(tool).forEach(function(item){
      if (item.type !== 'select' && item.type !== 'checkbox') return;
      const value = remembered[item.param];
      if (value === undefined || value === item.current) return;
      const el = document.getElementById(item.id);
      if (!el) return;
      cmdWriteRememberedValue(el, item.type, value);
      filled.push(item.label || item.param);
    });
    if (filled.length){
      RW._commitStatus && RW._commitStatus(
        tool + ': auto-filled ' + filled.length + ' remembered field' + (filled.length === 1 ? '' : 's')
        + ' from last time (' + filled.join(', ') + ')'
      );
    }
  }

  // Edge-triggered the same way RW._cmdToolWatchTick is (see below): only a transition INTO a
  // recognized modal being open fires the auto-fill, never every tick it stays open, and never a
  // transition to closed. Deliberately independent of RW._cmdAutoSelect (that gate is specific to
  // the unrelated auto-select-to-select feature) — only RW.enabled and this feature's own hatch
  // apply. Ticked from the same timer RW._cmdToolWatchTick already runs on (RW._cmdStartToolWatch
  // below), rather than a second interval.
  RW._cmdModalMemoryLastOpen = null;
  RW._cmdModalMemoryTick = function(){
    if (!RW_IS_GRAPH || !RW.enabled || !RW._cmdModalMemoryEnabled) return;
    const cur = cmdOpenModalTool();
    if (cur === RW._cmdModalMemoryLastOpen) return;
    RW._cmdModalMemoryLastOpen = cur;
    if (cur) cmdAutoFillModalMemory(cur);
  };

  // ----- graph host only: `dimension` — width then height, one after another (round 20) -----
  // Kresna asked for a single command that lets you type the active tool's own
  // width value, then immediately its height value, rather than drilling into
  // `route.width-input=`/`route.height-input=` as two separate commands. Built
  // as a thin chain on top of the existing numeric settingsDraft flow rather
  // than a new input mechanism: picking/typing "dimension" opens the ordinary
  // "tool.width-input = " numeric draft (see runAndClear's isSettingsItem
  // branch, which this mirrors), and the settingsDraft Enter/Space handler
  // below (onInputKeydown) checks `draft.chain` after applying a value — if
  // non-empty, it re-opens the draft on the next param instead of clearing/
  // blurring, so pressing Enter after width drops straight into height with no
  // re-typing of the tool name needed. A failed apply (bad number) stops the
  // chain rather than skipping ahead to height with nothing set.
  //
  // Order is on-screen order, not alphabetical: every confirmed tool/modal
  // listing so far (route, branch's own modal) shows "Width (in)" immediately
  // before "Height (in)". Param names (not labels) are used here since those
  // are RW._cmdToolSettingsList/RW._cmdApplySetting's own stable identifier —
  // the live label is still what gets shown in each prompt.
  const DIMENSION_PARAMS = ['width-input', 'height-input'];

  // Whichever tool `dimension` should target — the same "armed tool, or this
  // tool's own modal is open" resolution bare-param blending already uses
  // elsewhere in this file (RW._cmdActiveSettingsTool() || cmdOpenModalTool()),
  // so `dimension` follows whatever tool a plain "width"/"height" bare-param
  // type would already reach.
  function cmdDimensionTool(){
    return RW._cmdActiveSettingsTool() || cmdOpenModalTool();
  }

  // Entry point for both runAndClear (picking "dimension" from the dropdown)
  // and RW.runCommand (console/direct call) — returns whether the first
  // prompt (width) was actually opened, so callers can fall back to their own
  // ordinary "command failed" cleanup when it wasn't.
  function cmdStartDimension(){
    const tool = cmdDimensionTool();
    if (!tool){
      RW._commitStatus && RW._commitStatus('dimension: no duct tool is currently active — arm one first (e.g. route, branch)');
      return false;
    }
    const list = RW._cmdToolSettingsList(tool);
    const missing = DIMENSION_PARAMS.filter(function(p){ return !list.some(function(i){ return i.param === p; }); });
    if (missing.length){
      RW._commitStatus && RW._commitStatus(
        tool + ' has no ' + missing.join('/') + ' control right now — dimension needs both width and height (e.g. not available on a round profile)'
      );
      return false;
    }
    cmdDimensionPrompt(tool, DIMENSION_PARAMS.slice());
    return true;
  }

  // Opens the numeric draft for `chain[0]`, stamping the REMAINING params
  // (chain.slice(1)) onto the draft so the settingsDraft Enter/Space handler
  // knows to continue instead of finishing. Re-reads RW._cmdToolSettingsList
  // fresh (never cached across the width->height hop) — same live-read
  // discipline as every other control lookup in this file, and load-bearing
  // here specifically since applying width can shift what height's own
  // min/max/current legitimately are.
  function cmdDimensionPrompt(tool, chain){
    const param = chain[0];
    const item = RW._cmdToolSettingsList(tool).find(function(i){ return i.param === param; });
    if (!item){
      RW._commitStatus && RW._commitStatus(tool + '.' + param + ' is no longer on the page — dimension stopped');
      return;
    }
    const rest = chain.slice(1);
    settingsDraft = { tool: tool, param: param, type: item.type, chain: rest };
    inputEl.value = tool + '.' + param + ' = ';
    hideMenu();
    inputEl.focus();
    if (inputEl.setSelectionRange) inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    const label = item.label || item.param;
    let nextHint = '';
    if (rest.length){
      const nextItem = RW._cmdToolSettingsList(tool).find(function(i){ return i.param === rest[0]; });
      nextHint = ' (then ' + (nextItem ? (nextItem.label || nextItem.param) : rest[0]) + ' next)';
    }
    RW._commitStatus && RW._commitStatus(
      'dimension: ' + label + ' ' + (item.min != null ? item.min : '') + '–' + (item.max != null ? item.max : '')
      + ', currently ' + item.current + ' — type a new value and press Enter' + nextHint
    );
  }

  /* ---------- tag auto-detection (# search) ---------- */
  // This codebase has never referenced anything beyond annotationState.currentTag
  // (the currently-selected tag, {id,name}) before. Tries a short list of
  // plausible field names for the FULL tag list and validates a candidate
  // against currentTag (if one is set) so a same-shaped-but-unrelated array
  // can't be mistaken for it. Logs which field matched, or that none did, so
  // a wrong guess is visible immediately rather than silently no-op.
  RW._cmdTagList = null;
  RW._cmdTagSource = null;
  // Graph host: there is no annotationState/tag list at all, so `#` search
  // is repointed at the live #graph-system-select options (e.g. "FPTU
  // (Supply)") instead — same {id,name} shape RW._cmdMatchTags/renderMenuRows
  // already expect, so nothing downstream needs to know which host it's on.
  RW._cmdDetectTags = function(){
    if (RW_IS_GRAPH){
      const el = document.getElementById('graph-system-select');
      const opts = (el && el.options) ? Array.from(el.options) : [];
      if (opts.length){
        RW._cmdTagList = opts.map(function(o){ return { id: o.value, name: o.text }; });
        RW._cmdTagSource = 'graph-system-select';
        RW._commitStatus && RW._commitStatus('detected ' + RW._cmdTagList.length + ' systems via #graph-system-select');
        return RW._cmdTagList;
      }
      RW._cmdTagList = null;
      RW._cmdTagSource = null;
      RW._commitStatus && RW._commitStatus('could not find any systems on #graph-system-select — # search unavailable');
      return null;
    }
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

  // Graph host: writes the real <select>'s value plus input/change events —
  // the identical write-back technique RW._cmdApplySetting uses for tool
  // settings (live-confirmed against magic-wand-tolerance), not a plain
  // property assignment. Still carries the "confirm it actually applied"
  // hedge since this specific control (#graph-system-select) hasn't itself
  // been individually write-tested the way that one was.
  //
  // Annotate host: directly assigns annotationState's current tag to the
  // exact object matched by name. Not fully confirmed live: if the app needs
  // its own setter/dispatch to notice the change rather than a plain
  // property write, this can silently desync the app's displayed tag from
  // what's actually used on commit.
  RW._cmdSelectTagUnsafe = function(tag){
    if (RW_IS_GRAPH){
      const el = document.getElementById('graph-system-select');
      if (!el){ RW._commitStatus && RW._commitStatus('system: ' + tag.name + ' — #graph-system-select not found'); return; }
      el.value = tag.id;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      RW._commitStatus && RW._commitStatus('system: ' + tag.name + ' (confirm it actually applied)');
      return;
    }
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
    // Isolation enforcement floor (round 17) — the menuItems filtering in onInput()
    // already keeps a blocked command from ever being highlighted/run through the
    // dropdown, but this follows the same precedent FORBIDDEN_BUTTON_IDS set below:
    // refuse in code, not just by omission, so a direct RW.runCommand() call from the
    // console (or any future call site) can't bypass it either.
    // `entry.name !== iso` is load-bearing, not a formality: RW._cmdApplySetting
    // re-arms the isolated tool itself via RW.runCommand(tool) after every property
    // write, so without this exemption every property edit would be refused by its
    // own guard the instant isolation is in force.
    const iso = RW._cmdIsolatedTool();
    if (iso && entry.name !== iso && !cmdIsolationEscapes(entry, !!cmdOpenModalTool())){
      cmdIsolationRefuse(iso, 'run "' + entry.name + '"');
      return false;
    }
    // Round 20: `dimension` never dispatches a key or clicks a button (it only
    // opens the ordinary numeric settingsDraft against the active tool's own
    // width/height controls) — handled entirely before the unconditional
    // blur() below, since a dimension prompt needs the input to STAY focused,
    // the opposite of every other entry.run() dispatch.
    if (entry.dimension) return cmdStartDimension();
    // Reported live (round 16): on the graph host, tool-switch commands
    // (route, flex, ...) silently failed to arm while action commands
    // (undo, redo, ...) worked fine. Root cause: the graph app's own
    // keydown handler refuses to switch tools whenever
    // `document.activeElement` is an INPUT/SELECT/TEXTAREA (its own guard
    // against hijacking a real form field) — and #rw-cmd-input, this
    // project's own command bar, is exactly that while a command is being
    // typed/confirmed. Every call site (runAndClear, the Space-repeat
    // listener, ...) used to blur the input only AFTER calling
    // RW.runCommand, which was too late: the synthetic keydown a tool-switch
    // dispatches had already been read and ignored by the app's handler by
    // then. Blurring HERE, before any dispatch (key or click) happens,
    // fixes every call site at once instead of reordering each one
    // individually. Unconditional rather than checking
    // `document.activeElement === inputEl` first, since that global isn't
    // something this project's own DOM test stub models — blur() is a
    // harmless no-op when the input isn't focused, in both a real browser
    // and the stub. No observed effect on the annotate host or on action
    // commands (clicking a button never depended on focus).
    if (inputEl && inputEl.blur) inputEl.blur();
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
      // ----- void workflow self-tracking (see CLAUDE.md round 12) -----
      // The app's native void flow: enter void -> draw the area with the
      // previously-selected area tools (rect/bbox, circle, polygon, polyline)
      // -> area deleted -> app auto-reverts to whatever draw tool was armed
      // just before void. So `void` and the area tools used while drawing the
      // void area must NEVER become Space's repeat target — Space must resume
      // the PRE-VOID tool. Tracked purely from our own command history (no
      // fresh annotationState read at decision time, per this project's
      // self-track doctrine). RW._cmdVoidPrev snapshots RW._cmdLastTool the
      // moment void runs; RW._cmdVoidActive is true while "inside" the
      // workflow. While active, _cmdLastTool is frozen at the pre-void tool.
      const isVoid = !!entry.void;
      const wasVoidActive = RW._cmdVoidActive;
      if (isVoid){
        // (re)start the session — re-running void re-snapshots from the current
        // (possibly already-frozen) last tool and restarts.
        RW._cmdVoidPrev = RW._cmdLastTool;
        RW._cmdVoidActive = true;
      } else if (wasVoidActive && entry.run.__isModeSwitch){
        // a mode switch ends the session; _cmdLastTool already holds _cmdVoidPrev
        RW._cmdVoidActive = false;
      } else if (wasVoidActive && entry.name === RW._cmdVoidPrev){
        // re-running the pre-void tool itself is the self-track signal that the
        // app has reverted; end the session and let normal bookkeeping stamp below
        RW._cmdVoidActive = false;
      }
      if (entry.run.__isDrawTool){
        RW._cmdToolArmed = true; RW._cmdModeActive = null;
        // freeze _cmdLastTool at the pre-void tool while the void workflow is
        // active (void itself never becomes the target; neither do area tools)
        if (!RW._cmdVoidActive) RW._cmdLastTool = entry.name;
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
    // Belt-and-braces, in code rather than only by omission from
    // GRAPH_ACTIONS above: no table entry should ever carry one of these
    // ids, but this makes AGENTS.md's "never auto-save/auto-submit" boundary
    // self-enforcing against a future careless table edit, not just a
    // review catch.
    if (FORBIDDEN_BUTTON_IDS.indexOf(entry.btn) !== -1){
      RW._commitStatus && RW._commitStatus('"' + entry.name + '" is deliberately not clickable from the command line — Save/Submit/recording are yours to click');
      return false;
    }
    const hint = entry.conditional ? ' (' + entry.conditional + ')' : '';
    const btn = document.getElementById(entry.btn);
    if (!btn){ RW._commitStatus && RW._commitStatus('"' + entry.name + '" — its button is not on the page right now' + hint); return false; }
    const wasArmed = entry.armed ? !!entry.armed() : false;
    if (wasArmed){
      if (entry.disarm) entry.disarm(); else btn.click();
      return true;
    }
    // Report why a button was skipped rather than silently clicking (or not
    // clicking) it — confirmed live, this page has two different disabled
    // idioms: visible-but-disabled (graph-finish-route/graph-cancel-route
    // while a route is idle) and hidden-but-not-disabled (graph-assign-
    // network/graph-toggle-damper with nothing selected).
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true'){
      RW._commitStatus && RW._commitStatus('"' + entry.name + '" is on the page but not available right now' + hint);
      return false;
    }
    if (!cmdIsVisible(btn)){
      RW._commitStatus && RW._commitStatus('"' + entry.name + '" — its button is not on the page right now' + hint);
      return false;
    }
    btn.click();
    RW._commitStatus && RW._commitStatus(
      'clicked "' + entry.name + '"'
      + (entry.modal && document.getElementById(entry.modal) ? ' — opened the ' + entry.name + ' dialog; finish it in the app' : '')
    );
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
  RW._cmdVoidPrev = null;               // the draw tool Space would have resumed just before `void` ran (void's own self-tracking, see RW.runCommand)
  RW._cmdVoidActive = false;            // true while "inside" the void workflow — while set, _cmdLastTool is frozen at _cmdVoidPrev
  RW._cmdToolPrev = null;
  RW._cmdToolNullPending = false;
  RW._cmdAutoSelectRevertLog = [];

  // undefined = unreadable (no annotationState/__graphDebug, or no
  // currentTool/activeTool property at all) — a distinct result from a real
  // null/empty tool, so the watcher can fail closed (no-op) rather than
  // misreading "can't tell" as "cleared".
  function readTool(){
    if (RW_IS_GRAPH){
      // window.__graphDebug.activeTool — confirmed live via opencli (flipped
      // route->flex->select->extend->grd->route, matching every dispatch).
      const gd = (typeof __graphDebug !== 'undefined') ? __graphDebug : null;
      if (!gd || !('activeTool' in gd)) return undefined;
      const t = gd.activeTool;
      return (t === '' || t === undefined) ? null : t;
    }
    const as = (typeof annotationState !== 'undefined') ? annotationState : null;
    if (!as || !('currentTool' in as)) return undefined;
    const t = as.currentTool;
    return (t === '' || t === undefined) ? null : t;
  }

  // null = unreadable or not one of the known mode strings — callers treat
  // that as "don't know", not as "in select mode" or "in draw mode".
  function readMode(){
    if (RW_IS_GRAPH){
      // No separate mode field confirmed live on this host — select is just
      // another tool here, not a distinct mode/currentTool pair the way the
      // annotate host works, so "resting" is derived straight from readTool().
      return readTool() === 'select' ? SELECT_MODE : null;
    }
    const as = (typeof annotationState !== 'undefined') ? annotationState : null;
    const m = as && as.mode;
    return (typeof m === 'string' && KNOWN_MODES.indexOf(m) !== -1) ? m : null;
  }

  function resetWatchState(){
    const t = readTool();
    RW._cmdToolPrev = (t === undefined) ? null : t;
    RW._cmdToolNullPending = false;
  }

  function recordAutoRevert(_reason){
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
      RW._cmdVoidActive = false; // confirmed at rest — no void workflow in progress
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
    RW._cmdVoidActive = false; // a close ends the void workflow too — _cmdLastTool already holds _cmdVoidPrev
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
    // Round 26: deliberately re-seeded to null (not the actual current state) every start — unlike
    // resetWatchState() just above, this means a modal that's ALREADY open at the moment the
    // loader is (re-)pasted still gets one auto-fill pass, rather than being treated as
    // already-seen and skipped. Harmless either way if nothing's remembered yet, and idempotent
    // if a field already matches what's remembered.
    RW._cmdModalMemoryLastOpen = null;
    RW._cmdToolWatchTimer = setInterval(function(){ RW._cmdToolWatchTick(); RW._cmdModalMemoryTick(); }, AUTOSEL_POLL_MS);
  };

  // A separate, always-on document keydown listener (capture phase) purely
  // to piggyback a deferred revert-to-select after the app's own Escape
  // handling — it NEVER preventDefaults or stops propagation, so the app's
  // real Escape handler always still runs. Deferred via setTimeout(...,0)
  // (not requestAnimationFrame, which can be throttled in a background tab)
  // so the app's own synchronous cancel-work finishes first.
  //
  // `quiet=false` (Kresna's own request, round 19 follow-up): a deliberate
  // Escape press is exactly as much a real user action as typing "select" —
  // which already reports its own dispatch to the status line (nativeKey's
  // run() never passes `quiet` at all) — so Escape should read out the same
  // way instead of only logging to the console. RW._cmdGoSelect itself
  // already no-ops (no dispatch, no status) when nothing was armed to begin
  // with (readMode() === SELECT_MODE short-circuits above the dispatch line),
  // so this can't spam a confirmation for an Escape that had nothing to do.
  // The automatic poll-based revert (RW._cmdGoSelect('poll', true) above)
  // deliberately stays quiet — it fires on a timer, not on a user keypress,
  // and would spam the status line if it didn't.
  RW._cmdEscapeHandler = function(e){
    if (e.__rwSynthetic) return;
    if (e.key !== 'Escape') return;
    if (!RW.enabled || !RW._cmdAutoSelect) return;
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return; // includes our own command input
    setTimeout(function(){ RW._cmdGoSelect('escape', false); }, 0);
  };

  /* ---------- command bar + autocomplete ---------- */
  let barEl=null, inputEl=null, menuEl=null, menuItems=[], menuHighlight=-1, menuMode='command';
  // Sticky across a value-entry step (unlike menuMode, which is re-derived from inputEl.value on
  // every keystroke) — {tool, param} once a setting's been picked and we're awaiting its value.
  let settingsDraft = null;

  // Gap between the dropdown and whichever edge of the panel it's anchored
  // to, its "prefer this much room" height, and the floor it's still
  // allowed to shrink to when neither side of the panel has much space.
  // MENU_MAX_H doubles as ensureMenuDom's CSS max-height so the two can't
  // drift apart.
  const MENU_GAP = 6, MENU_MAX_H = 200, MENU_MIN_H = 60;

  function ensureMenuDom(){
    if (menuEl) return;
    menuEl = document.createElement('div');
    menuEl.id = 'rw-cmd-menu';
    // z-index is the true 32-bit signed max — one above #rw-panel's own
    // (rw_core.js, deliberately one below the max) — so the dropdown always
    // paints on top of the panel, never behind it. Before this the menu sat
    // at a much lower z-index and its rows anchored off the INPUT's rect,
    // which sits below the panel's header strip — so the list's own lower
    // rows grew straight into the header and were painted over by it. See
    // positionMenu() below for the anchor-off-the-panel half of the fix.
    menuEl.style.cssText = 'position:fixed;display:none;z-index:2147483647;background:#222;color:#eee;'
      + 'border:1px solid #666;border-radius:4px;max-height:' + MENU_MAX_H + 'px;overflow-y:auto;';
    document.body.appendChild(menuEl);
  }

  // Anchors the dropdown clear of the WHOLE panel (never just the input),
  // so it never overlaps the panel's own header strip (caret / "Command
  // Line" / RW: ON/OFF) — previously anchored off the input's rect alone,
  // which sits below that header inside the panel, so the list's lower rows
  // grew straight into it and were hidden behind it (see the z-index note
  // above; both defects had to be fixed together). Preferentially opens
  // upward above the panel; flips to open downward below it only when there
  // genuinely isn't room above (e.g. the panel's been dragged near the top
  // of the screen) and there's more room below. The panel rect is read
  // fresh on every call, so a dragged panel is followed automatically with
  // no extra wiring. Falls back to the input's own rect when #rw-panel
  // doesn't exist (e.g. a synthetic/test harness) so this never throws.
  function positionMenu(){
    const r = inputEl.getBoundingClientRect();
    const panel = document.getElementById('rw-panel');
    const pr = (panel && panel.getBoundingClientRect) ? panel.getBoundingClientRect() : r;
    menuEl.style.left = r.left + 'px';   // horizontal tracking stays off the INPUT (inset by the panel's own padding)
    menuEl.style.width = r.width + 'px';
    const above = pr.top - MENU_GAP;
    const below = window.innerHeight - pr.bottom - MENU_GAP;
    if (above >= MENU_MAX_H || above >= below){
      menuEl.style.bottom = (window.innerHeight - pr.top + MENU_GAP) + 'px';
      menuEl.style.top = 'auto';
      menuEl.style.maxHeight = Math.max(MENU_MIN_H, Math.min(MENU_MAX_H, above)) + 'px';
    } else {
      menuEl.style.top = (pr.bottom + MENU_GAP) + 'px';
      menuEl.style.bottom = 'auto';
      menuEl.style.maxHeight = Math.max(MENU_MIN_H, Math.min(MENU_MAX_H, below)) + 'px';
    }
  }

  function hideMenu(){ if (menuEl) menuEl.style.display = 'none'; }

  // ----- Round 23: keep the highlighted row visible while cycling -----
  // renderMenuRows() rebuilds every row from scratch on each call (innerHTML = ''
  // below), which resets menuEl.scrollTop to 0 — so cycling the highlight past
  // whatever fits in MENU_MAX_H (~10 rows) moved it below the fold with nothing
  // scrolling to follow. This bites the "<tool>." parameter listing specifically,
  // the one list in this file that isn't capped at 8 rows (the graph inspector has
  // ~43 graph- controls). Deliberately NOT Element.scrollIntoView() — that also
  // scrolls every scrollable ancestor, which on this host would yank the drawing
  // itself out from under the user; this only ever touches menuEl's own scrollTop,
  // the same "our own UI manages its own scrolling" boundary panInOurUi already
  // enforces elsewhere in this file. Every geometry read is guarded so a
  // non-rendering context (e.g. offsetHeight/clientHeight never set, as in a
  // synthetic harness that hasn't opted into layout) is a silent no-op, not a throw.
  function cmdScrollRowIntoView(row){
    if (!row || !menuEl) return;
    const rowTop = row.offsetTop, rowH = row.offsetHeight, viewH = menuEl.clientHeight;
    if (typeof rowTop !== 'number' || typeof rowH !== 'number' || !viewH) return;
    if (rowTop < menuEl.scrollTop){
      menuEl.scrollTop = rowTop;
    } else if (rowTop + rowH > menuEl.scrollTop + viewH){
      menuEl.scrollTop = rowTop + rowH - viewH;
    }
  }

  // Text color only (never the row background, which the keyboard-highlight
  // already uses) so kind stays legible regardless of which row is selected.
  const KIND_COLOR = { native: '#a8e6a3', action: '#8ecae6' };
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
    let highlightRow = null;
    menuItems.forEach(function(item, i){
      const row = document.createElement('div');
      row.className = 'rw-cmd-item';
      if (i === menuHighlight) highlightRow = row;
      let label, color;
      if (menuMode === 'tag'){
        label = item.tag.name; // no hotkey-number hint — that mapping was removed as confirmed wrong
        color = TAG_COLOR;
      } else if (isOptionItem(item)){
        label = item.optionIndex + '. ' + item.optionText;
        color = SETTINGS_COLOR;
      } else if (isSettingsItem(item)){
        // Prefer the control's own live on-screen label (round 18, graph host
        // only) over its fixed DOM-id-derived param name — so a row picked by
        // typing "diameter" actually reads "Diameter (in)", not the
        // internal "width-input" that only cmdParamMatchesQuery/Tab-fill/
        // RW._cmdApplySetting still key off of. Falls back to `param` when
        // no live label was found (every annotate-host item, and any graph
        // control this round's <label> convention doesn't cover).
        const paramDisplay = item.label || item.param;
        if (item.type === 'checkbox'){
          label = paramDisplay + ' (toggle, now ' + item.current + ')';
        } else if (item.type === 'select'){
          label = paramDisplay + ' (' + (item.options ? item.options.length : 0) + ' options, now ' + item.current + ')';
        } else if (item.type === 'text'){
          label = paramDisplay + ' (text, now "' + item.current + '")';
        } else {
          label = paramDisplay + ' (' + (item.min != null ? item.min : '') + (item.max != null ? '-' + item.max : '')
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
    cmdScrollRowIntoView(highlightRow);
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
    const isolatedTool = RW._cmdIsolatedTool();
    if (dotEntry && RW._toolSettingsMap[dotEntry.name] && isolatedTool && dotEntry.name !== isolatedTool){
      // Isolated to a different tool's properties — refuse the drill-in rather than
      // showing another tool's params while this one is armed.
      menuMode = 'settings-param';
      menuItems = [];
      menuHighlight = -1;
      renderMenuRows();
      cmdIsolationRefuse(isolatedTool, "reach " + dotEntry.name + "'s properties");
      return;
    }
    if (dotEntry && RW._toolSettingsMap[dotEntry.name]){
      const q = (dotMatch[2] || '').toLowerCase();
      menuMode = 'settings-param';
      menuItems = RW._cmdToolSettingsList(dotEntry.name)
        .filter(function(item){ return cmdParamMatchesQuery(item, q); });
      menuHighlight = menuItems.length ? 0 : -1;
      renderMenuRows();
      // Graph host only (RW._cmdToolCollapsedGroups is a no-op elsewhere):
      // surface that more params exist behind a shut disclosure, without
      // ever listing or expanding them unasked — typing the param directly
      // (RW._cmdApplySetting) is what expands it.
      if (RW._cmdToolCollapsedGroups){
        const collapsed = RW._cmdToolCollapsedGroups(dotEntry.name);
        if (collapsed.length && RW._commitStatus){
          RW._commitStatus(collapsed.map(function(g){
            return '+' + g.count + ' more under collapsed "' + g.label + '" — expand it in the app, or type e.g. "' + dotEntry.name + '.<param>=<value>" to auto-expand';
          }).join('; '));
        }
      }
      return;
    }
    if (v.charAt(0) === '#'){
      if (isolatedTool){
        // Graph host, tool isolated: # system search is one of the things
        // deliberately not reachable while a duct tool is armed.
        menuMode = 'tag';
        menuItems = [];
        cmdIsolationRefuse(isolatedTool, 'search systems');
      } else {
        if (!RW._cmdTagList) RW._cmdDetectTags();
        menuMode = 'tag';
        menuItems = RW._cmdMatchTags(v.slice(1)).slice(0, 8);
      }
    } else {
      menuMode = 'command';
      // Round 19 robustness: || cmdOpenModalTool() so bare-param blending still
      // works even if activeTool's own readTool() doesn't report 'grd'/'vertical'
      // while their own modal is open (the one part of the now-3-for-3 activeTool
      // pattern never individually confirmed live — see GRAPH_TOOL_MODALS's own
      // comment). RW._cmdIsolatedTool() now falls back the same way (round 19
      // follow-up), so `isolatedTool` above already covers this whenever isolation
      // is actually in force; this local read stays independent of that so bare-
      // param blending keeps working even with the console hatch
      // (RW._cmdIsolateTools = false) turned off.
      const activeTool = RW._cmdActiveSettingsTool() || cmdOpenModalTool();
      const paramItems = activeTool
        ? RW._cmdToolSettingsList(activeTool).filter(function(p){ return cmdParamMatchesQuery(p, v.toLowerCase()); })
        : [];
      let items;
      if (isolatedTool){
        // Modal: only the isolated tool's own params (already filtered above) plus
        // the allowlisted escapes/actions (select, finish, cancel) — everything
        // else RW._cmdMatch(v) would have matched is deliberately dropped, not
        // blended, and reported so it doesn't read as a silent typo. The refusal
        // message only fires once something's actually typed (v non-empty) — an
        // empty query (e.g. backspacing the bar clear) still shows the allowed
        // rows quietly, matching every other empty-query case in this file.
        const allMatches = RW._cmdMatch(v);
        const modalOpen = !!cmdOpenModalTool();
        const allowed = allMatches.filter(function(e){ return cmdIsolationEscapes(e, modalOpen); });
        if (v && allMatches.length > allowed.length) cmdIsolationRefuse(isolatedTool, 'use it');
        // Usability is filtered SEPARATELY from the isolation accounting just
        // above (round 24) — an allowed-but-currently-unusable action (e.g.
        // "finish" while isolated to route but no route is actually in
        // progress yet) is dropped from the LIST quietly here, without being
        // counted as something isolation itself blocked.
        items = paramItems.concat(allowed.filter(cmdActionUsable));
      } else {
        // Additive, not exclusive (confirmed via AskUserQuestion): whatever
        // tool is currently armed has its own param names typable bare, with
        // no "tool." prefix needed, blended ahead of the ordinary command
        // matches — every other command (switching tools included) keeps
        // working exactly as it does today, unaffected by this.
        // Round 24: also drops any GRAPH_ACTIONS match that isn't actually
        // usable right now (its button missing, disabled, or hidden) — see
        // cmdActionUsable's own comment. Native tool entries have no `.btn`
        // at all, so they're never affected by this.
        items = paramItems.concat(RW._cmdMatch(v).filter(cmdActionUsable));
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
        item.type === 'text'
          // No min–max range for a free-typed string — unlike numeric below.
          ? item.tool + '.' + item.param + ': currently "' + item.current + '" — type a new value and press Enter'
          : item.tool + '.' + item.param + ': ' + (item.min != null ? item.min : '') + '–' + (item.max != null ? item.max : '')
            + ', currently ' + item.current + ' — type a new value and press Enter'
      );
      return;
    }
    if (item.dimension){
      // Round 20: unlike every other table entry, a successful start must NOT
      // clear/blur the input — cmdStartDimension already opened the width
      // draft and (re)focused it, exactly like picking a numeric settings item
      // above. Only fall through to the ordinary cleanup below when it
      // couldn't start at all (no active tool, or that tool has no width/
      // height right now), matching how every other failed command still
      // clears the bar and reports why via the status line.
      if (cmdStartDimension()) return;
      inputEl.value = '';
      hideMenu();
      menuItems = [];
      menuMode = 'command';
      inputEl.blur();
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
      const applied = RW._cmdApplySetting(draft.tool, draft.param, valueText);
      // Round 20 (`dimension`): a chained draft carries the remaining params
      // (width's own draft carries ['height-input']) — once THIS one applies
      // cleanly, re-open the draft on the next one instead of the ordinary
      // clear/blur below, so Enter after width drops straight into height. A
      // failed apply (e.g. a non-numeric value) stops the chain right here —
      // it does NOT skip ahead to height with nothing set — same as it would
      // for any other numeric draft.
      if (applied && draft.chain && draft.chain.length){
        cmdDimensionPrompt(draft.tool, draft.chain);
        return;
      }
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
          // Round 22 fix (live report: Tab moved one option then the dropdown
          // closed and focus fell out to the browser). RW._cmdApplySetting's
          // own re-arm (cmdArmOrNoteModal -> RW.runCommand(tool)) unconditionally
          // blurs inputEl FIRST (round 16's own fix, needed so the app's
          // activeElement guard doesn't block a real tool-switch dispatch) —
          // a real browser actually loses focus there, whereas this file's own
          // synthetic .blur() stub is a silent no-op with no 'blur' EVENT
          // dispatched, which is why no existing test caught this: nothing here
          // ever asserted inp._focused after a Tab-preview. Once genuinely
          // blurred, the NEXT keystroke (another Tab, or Space) lands on
          // whatever now has focus instead — Space in particular gets picked up
          // by the global auto-capture listener instead, which (tool still
          // armed) closes it to select, exactly the second symptom reported.
          RW._cmdApplySetting(picked.tool, picked.param, String(picked.optionIndex));
        }
        renderMenuRows();
        // Refocus synchronously, right after the blur RW._cmdApplySetting's
        // own re-arm just caused — same "stays focused" contract this draft
        // already had before Tab was pressed, and the same blur-then-refocus
        // dance `dimension`'s own chain hop (round 20) already relies on.
        inputEl.focus();
        if (inputEl.setSelectionRange) inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
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
      // NOTE: there is deliberately NO `matches.length === 1` invisible fallback here
      // anymore. Selection happens ONLY when there's a real highlighted row; otherwise
      // the unknown-command branch below reports it. The old fallback let a command run
      // with no visible dropdown — the "single match selected something invisible"
      // confusion. onInput always sets menuHighlight = 0 whenever menuItems is
      // non-empty, so a legitimate 1-match query still reaches this through the
      // visible-highlight branch; the fallback was never load-bearing.
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
    inputEl.placeholder = RW_IS_GRAPH
      ? 'native tool (route, grd, select…) or #system — just start typing'
      : 'native tool (linear, rect, pan…) or #tag — just start typing';
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
    // Round 22 follow-up (live report: cycling a select param — system/network,
    // profile, "New system" — kept losing the open dropdown mid-cycle, not
    // just once). Every settings write re-arms the tool via
    // RW._cmdApplySetting -> cmdArmOrNoteModal -> RW.runCommand(tool), which
    // unconditionally blurs inputEl FIRST (round 16's own fix) — round 22
    // already re-focuses synchronously right after each Tab-preview so the
    // input itself never stays visibly blurred, but THIS deferred hide was
    // still scheduled from the ORIGINAL blur before that refocus ran, and
    // fires 150ms later regardless of whether focus has since come back —
    // hiding a dropdown the user is still actively tabbing through. Guarding
    // on document.activeElement here (checked only once the timer actually
    // fires, not at schedule time) makes this self-correcting: a blur that
    // gets undone within the 150ms window before the timer fires no longer
    // closes anything, while a genuine, lasting blur (the user actually
    // clicked or tabbed away from the bar) still hides it exactly as before.
    inputEl.addEventListener('blur', function(){
      setTimeout(function(){ if (document.activeElement !== inputEl) hideMenu(); }, 150);
    });
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
    // Only the tool that actually built the fixed overlay (rw_core.js, when
    // no #rw-panel existed yet) owns its positioning. If the workbench's
    // rw_install.js built the panel first (embedded, position:relative), this
    // no-ops rather than writing fixed-style offsets onto a panel that isn't
    // fixed — see CLAUDE.md's load-order-independence section.
    if (!RW._cmdOwnsPanelPosition) return;
    const panel = document.getElementById('rw-panel');
    const canvas = document.getElementById(RW_CANVAS_ID);
    if (!panel || !canvas) return; // no-op without throwing
    const cr = canvas.getBoundingClientRect();
    const width = Math.min(RW._cmdBarWidth, cr.width);
    // Once the user has dragged the bar (RW._cmdBarUserMoved), never
    // re-center it — only keep it the right width and clamp it back
    // on-screen (a resize could otherwise leave it partly off-viewport).
    // __RW._cmdResetBar() is the only way back to the default layout.
    if (RW._cmdBarUserMoved){
      panel.style.width = width + 'px';
      RW._cmdClampBar();
      if (menuEl && menuEl.style.display !== 'none') positionMenu();
      return;
    }
    panel.style.width = width + 'px';
    panel.style.left = (cr.left + (cr.width - width) / 2) + 'px';
    panel.style.top = 'auto'; // clear a prior top-anchor (from a dragged state) before re-pinning bottom-center
    // Bottom edge is (innerHeight - canvas.bottom) + offset in viewport
    // space. When the drawing is scrolled so the canvas bottom falls BELOW
    // the viewport (a long PDF), this goes negative and the fixed panel
    // would sit entirely off-screen — visible nowhere while the input still
    // takes focus (commands "work"). Clamp so the panel's bottom edge never
    // dips below `offset` from the viewport bottom: the bar stays on-screen
    // over the drawing, which is strictly better than disappearing.
    const rawBottom = (window.innerHeight - cr.bottom) + RW._cmdBarOffset;
    panel.style.bottom = Math.max(RW._cmdBarOffset, rawBottom) + 'px';
    // The dropdown anchors off the panel's own rect (positionMenu, above) —
    // if it's open while the panel moves (e.g. a resize), it would otherwise
    // stay at its stale pre-move coordinates until the next keystroke.
    if (menuEl && menuEl.style.display !== 'none') positionMenu();
  };

  // Live overlay diagnostic — run when the bar is missing from the page to
  // learn WHY (stacking/occlusion vs. off-screen placement vs. a transformed
  // body/html breaking position:fixed). Read-only, console-only, same spirit
  // as RW._panDiagnose/RW._zoomDiagnose.
  RW._overlayDiagnose = function(){
    const panel = document.getElementById('rw-panel');
    const canvas = document.getElementById(RW_CANVAS_ID);
    const out = { viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight } };
    if (panel){
      const p = panel.getBoundingClientRect ? panel.getBoundingClientRect() : null;
      out.panel = {
        present: true,
        style: { left: panel.style.left, top: panel.style.top, bottom: panel.style.bottom, width: panel.style.width, display: panel.style.display, zIndex: panel.style.zIndex },
        rect: p ? { left: p.left, right: p.right, top: p.top, bottom: p.bottom, width: p.width, height: p.height } : null,
        onScreen: p ? (p.bottom > 0 && p.top < window.innerHeight && p.right > 0 && p.left < window.innerWidth) : false
      };
    } else {
      out.panel = { present: false };
    }
    // The autocomplete dropdown — reported so a live page can confirm it's
    // stacking (and staying positioned) above the panel, not behind it.
    if (menuEl){
      const m = menuEl.getBoundingClientRect ? menuEl.getBoundingClientRect() : null;
      out.menu = {
        present: true,
        style: { top: menuEl.style.top, bottom: menuEl.style.bottom, maxHeight: menuEl.style.maxHeight, display: menuEl.style.display, zIndex: menuEl.style.zIndex },
        rect: m ? { left: m.left, right: m.right, top: m.top, bottom: m.bottom, width: m.width, height: m.height } : null
      };
    } else {
      out.menu = { present: false }; // never created yet — no query has matched anything so far
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

  /* ---------- draggable command-line panel ---------- */
  // Lets the whole #rw-panel overlay be moved by dragging its header strip
  // (the row with the collapse caret / "Command Line" title / RW: ON/OFF
  // button) with the left mouse button. Follows the same pointer-event idiom
  // as middle-drag pan above: document-level capture-phase pointermove/up/
  // cancel listeners added per drag and really removed on teardown,
  // setPointerCapture on the press target, and several independent teardown
  // paths so a drag can never get stuck "active". Once dragged, the panel
  // stays where the user put it — RW._cmdRepositionOverlay (below) stops
  // re-centering it, only re-applying width and clamping back on-screen.
  // Explicitly NOT gated on RW.enabled: dragging the panel is the panel's
  // own chrome, same category as the collapse toggle, which already works
  // while RW is off — only the subordinate RW._cmdBarDrag flag gates this.
  RW._cmdBarDrag = true;         // subordinate disable flag
  RW._cmdBarThreshold = 3;       // px (Manhattan) before a press counts as a real drag, not a click
  RW._cmdBarUserMoved = false;   // once true, reposition never re-centers — see RW._cmdRepositionOverlay

  // { rect } is the panel's own box (left/top/width/height), cached ONCE per
  // drag the moment it crosses the threshold — never re-read mid-drag, same
  // "resolve once per drag" discipline as panState.cx/cy above.
  const barDragState = { active:false, dragging:false, startX:0, startY:0, rect:null, header:null, suppressClick:false };

  function barClampBox(left, top, width, height){
    const maxLeft = Math.max(0, window.innerWidth - width);
    const maxTop = Math.max(0, window.innerHeight - height);
    return { left: Math.min(Math.max(0, left), maxLeft), top: Math.min(Math.max(0, top), maxTop) };
  }

  // Identified STRUCTURALLY, not by id: post-retrofit (rw_panelux.js), the
  // header it inserts is the panel's firstChild and carries no id of its
  // own — every pre-retrofit child (#rw-commit-status, #rw-list) DOES have
  // an id, so this can't misfire before retrofit runs (there's simply no
  // drag target yet, and dragging is a no-op until there is one).
  function barHeaderEl(panel){
    const fc = panel && panel.firstChild;
    return (fc && !fc.id) ? fc : null;
  }

  // Read-only: current on-screen box, width from the style we just wrote
  // (authoritative — nothing else touches it), height from the live rect
  // (the panel autosizes to its content; there's no style equivalent).
  function barCurrentBox(panel){
    const r = (panel && panel.getBoundingClientRect) ? panel.getBoundingClientRect() : { width:0, height:0 };
    const w = parseFloat(panel.style.width);
    return { width: isNaN(w) ? r.width : w, height: r.height };
  }

  // Console escape hatch + the only place outside a live drag that needs to
  // clamp a stale position back on-screen (a resize after the user moved the
  // bar, or a viewport that shrank under it).
  RW._cmdClampBar = function(){
    const panel = document.getElementById('rw-panel');
    if (!panel) return;
    const box = barCurrentBox(panel);
    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    const c = barClampBox(isNaN(left) ? 0 : left, isNaN(top) ? 0 : top, box.width, box.height);
    panel.style.left = c.left + 'px';
    panel.style.top = c.top + 'px';
  };

  // Clears the moved flag and re-pins bottom-center — the only way back to
  // the default layout, since this project deliberately persists nothing
  // across pages/reloads (a fresh paste of the loader already re-pins on
  // its own; this is for resetting mid-session).
  RW._cmdResetBar = function(){
    RW._cmdBarUserMoved = false;
    const panel = document.getElementById('rw-panel');
    if (panel) panel.style.top = 'auto';
    RW._cmdRepositionOverlay();
  };

  function barOnPointerMove(e){
    if (!barDragState.active) return;
    if (typeof e.buttons === 'number' && (e.buttons & 1) === 0){ barOnPointerEnd(); return; }
    const dx = e.clientX - barDragState.startX;
    const dy = e.clientY - barDragState.startY;
    if (!barDragState.dragging){
      if (Math.abs(dx) + Math.abs(dy) <= RW._cmdBarThreshold) return;
      barDragState.dragging = true;
      const panel = document.getElementById('rw-panel');
      barDragState.rect = panel.getBoundingClientRect(); // cached once — see barDragState comment above
      // first real movement converts the bottom-anchored overlay to a
      // top-anchored one, from its own live rect, so it never double-anchors.
      panel.style.top = barDragState.rect.top + 'px';
      panel.style.bottom = 'auto';
      if (barDragState.header) barDragState.header.style.cursor = 'grabbing';
    }
    const panel = document.getElementById('rw-panel');
    const r = barDragState.rect;
    const c = barClampBox(r.left + dx, r.top + dy, r.width, r.height);
    panel.style.left = c.left + 'px';
    panel.style.top = c.top + 'px';
  }

  function barOnPointerEnd(){
    if (!barDragState.active) return;
    barDragState.active = false;
    if (barDragState.header) barDragState.header.style.cursor = '';
    barRemoveListeners();
    if (barDragState.dragging){
      RW._cmdBarUserMoved = true;
      // Swallow the ONE click that fires on release, so dragging doesn't
      // also toggle the collapse/expand the header's own onclick handles —
      // barOnClick (registered below) checks this flag in the capture phase,
      // which runs before the header's own bubble-phase onclick. Cleared on
      // a fallback timer in case no click follows at all (e.g. the pointer
      // was captured by something else).
      barDragState.suppressClick = true;
      setTimeout(function(){ barDragState.suppressClick = false; }, 0);
    }
    barDragState.dragging = false;
  }
  function barOnLostCapture(){ barOnPointerEnd(); }
  function barOnWindowBlur(){ barOnPointerEnd(); }

  function barAddListeners(){
    document.addEventListener('pointermove', barOnPointerMove, true);
    document.addEventListener('pointerup', barOnPointerEnd, true);
    document.addEventListener('pointercancel', barOnPointerEnd, true);
    if (barDragState.header && barDragState.header.addEventListener) barDragState.header.addEventListener('lostpointercapture', barOnLostCapture);
  }
  function barRemoveListeners(){
    document.removeEventListener('pointermove', barOnPointerMove, true);
    document.removeEventListener('pointerup', barOnPointerEnd, true);
    document.removeEventListener('pointercancel', barOnPointerEnd, true);
    if (barDragState.header && barDragState.header.removeEventListener) barDragState.header.removeEventListener('lostpointercapture', barOnLostCapture);
  }

  function barOnPointerDown(e){
    if (!RW._cmdBarDrag) return;
    // Same ownership check as RW._cmdRepositionOverlay — dragging a panel
    // this tool doesn't own the positioning of would fight whatever mount
    // built it (e.g. the workbench's embedded, position:relative panel).
    if (!RW._cmdOwnsPanelPosition) return;
    if (e.button !== 0) return; // left button only — middle-drag pan owns the rest of the page
    const panel = document.getElementById('rw-panel');
    if (!panel) return;
    // Walk up from the press target: abort on the caret or the RW button
    // (left entirely to their own click handlers), and require the press to
    // actually land inside the structural header, not the body below it.
    const header = barHeaderEl(panel);
    if (!header) return;
    let n = e.target, hops = 0, hitControl = false, onHeader = false;
    while (n && n.nodeType === 1 && hops++ < 32){
      if (n.id === 'rw-collapse' || n.id === 'rw-enable'){ hitControl = true; break; }
      if (n === header) onHeader = true;
      if (n === panel) break;
      n = n.parentElement;
    }
    if (hitControl || !onHeader) return;

    barDragState.active = true;
    barDragState.dragging = false;
    barDragState.startX = e.clientX;
    barDragState.startY = e.clientY;
    barDragState.header = header;
    header.style.cursor = 'move';
    header.style.touchAction = 'none'; // defensive: touch dragging isn't live-verified, see CLAUDE.md
    if (e.target && e.target.setPointerCapture){
      try { e.target.setPointerCapture(e.pointerId); } catch(_err){ /* not connected — ignore */ }
    }
    barAddListeners();
  }

  // Capture-phase on the panel: runs before the header's own bubble-phase
  // onclick, so a post-drag release can't toggle collapse/expand. A
  // sub-threshold press never sets suppressClick, so ordinary click-to-
  // collapse is completely unaffected.
  function barOnClick(e){
    if (!barDragState.suppressClick) return;
    barDragState.suppressClick = false;
    e.stopPropagation();
    e.preventDefault();
  }

  (function attachBarDrag(){
    const panel = document.getElementById('rw-panel'); // always present in real usage (rw_core.js); no-op otherwise
    if (!panel) return;
    panel.addEventListener('pointerdown', barOnPointerDown, true);
    panel.addEventListener('click', barOnClick, true);
  })();
  if (window.addEventListener) window.addEventListener('blur', barOnWindowBlur);

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
    // Graph host only, and originally added because round 15's own action
    // vocabulary (calibrate/setscale) opens two <dialog> modals — with one
    // open, typing must reach the app's own modal, not get captured into the
    // command bar. A plain bail-out, not a consume (no preventDefault/
    // stopImmediatePropagation, unlike capture's normal "always wins" below),
    // so the app's own modal keyboard handling runs completely untouched.
    // Round 19 narrows this: the four GRAPH_TOOL_MODALS dialogs are NOT
    // showModal()-modal (confirmed live: dialog.matches(':modal') is false)
    // and #rw-cmd-input can be focused/typed into while one is open — the
    // only thing stopping that was this blanket bail-out, not the app. So it
    // still bails for any OTHER open dialog (calibrate, known-scale —
    // unaffected) but not for one of the four recognized ids.
    if (cmdOpenDialogs().some(function(d){ return GRAPH_MODAL_DIALOG_IDS.indexOf(d.id) === -1; })) return;
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    // Round 19: the focus guard above skips INPUT/TEXTAREA/contenteditable
    // but not SELECT — so once a recognized modal's own <select> (Fitting
    // type, Branch shape, Alignment, Damper) has focus, keystrokes would
    // otherwise be eaten into the command bar instead of reaching it.
    // Scoped to "a recognized modal is actually open" so the inspector's own
    // ordinary selects are completely unaffected.
    if (t && t.tagName==='SELECT' && cmdOpenModalTool()) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    if (e.key.length !== 1) return; // printable characters only
    // ----- Round 23: bare digits pass through to the app (graph host only) -----
    // Reported live: at the end of a duct draw the app offers the next tool by a
    // numbered prompt, and this listener was swallowing the digit into the command
    // bar instead. No host-state signal for that prompt exists (its DOM identity
    // was never found live — see CLAUDE.md's round 19 open item), so this doesn't
    // try to detect it; instead it's safe unconditionally, because no graph-host
    // command or param name starts with a digit (GRAPH_TABLE/GRAPH_ACTIONS are all
    // words/letters), so a digit at a genuinely EMPTY, unfocused bar can never be
    // the start of anything typeable on this host. A plain bail-out, not a consume
    // (no preventDefault/stopImmediatePropagation), matching the open-<dialog>
    // bail-out's own doctrine just above — the app receives the key untouched.
    // Scoped to RW_IS_GRAPH only: on the annotate host a digit is the app's own tag
    // hotkey and tag1...tag0 are real commands, so that host is unaffected.
    // !inputEl.value (not just e.target !== inputEl, already true here since the
    // editable-target guard above bailed if inputEl had focus) is what keeps digits
    // working once a command's been started or a numeric param value is being
    // typed (e.g. route.width-input=18) — this only ever fires at a genuinely
    // resting, empty bar. !settingsDraft is belt-and-braces on the same point.
    // RW._cmdDigitPassthrough (default true) is a console escape hatch, matching
    // this file's existing RW._cmdIsolateTools/RW._panEnabled convention.
    if (RW_IS_GRAPH && RW._cmdDigitPassthrough !== false && /^[0-9]$/.test(e.key)
        && !settingsDraft && (!inputEl || !inputEl.value)) return;
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
      // Round 19 follow-up (Kresna's own request: "I want that behaviour also
      // be in branch mode" — the just-fixed "initialize the console" starting
      // menu, while one of the four config-dialog modals is open). Checked
      // ahead of both the repeat and the close branches below, for the same
      // reason as the label override above: without it, Space while e.g. the
      // branch-fitting dialog is open would fall into "RW._cmdToolArmed ->
      // close" and dispatch a synthetic select keydown at the app while its
      // own modal is still up — a raw key dispatch this project has never
      // actually needed to make work against a live dialog, and isn't going
      // to start relying on now. Instead, treat it exactly like the
      // nothing-armed case: open the bar (no character seeded) and show
      // what's actually usable while isolated to this modal's own tool —
      // its own fields (bare-param blend) plus the allowed action commands
      // (choose/cancelbranch and siblings) — by simply calling onInput() on
      // the empty bar, the same isolated-tool blend a typed query already
      // produces (see onInput's own `isolatedTool` branch), so this can't
      // drift out of sync with what typing there shows.
      if (cmdOpenModalTool()){
        e.preventDefault(); e.stopImmediatePropagation();
        mountCommandBar();
        if (inputEl) inputEl.focus();
        onInput();
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
      // Round 19 follow-up (Kresna's own report): the very first Space —
      // nothing armed yet, and no RW._cmdLastTool to repeat — used to fall
      // all the way through to the generic capture path below, which inserts
      // a literal space into the bar and immediately runs onInput() on it;
      // RW._cmdMatch(' ') trims to '' and returns the ENTIRE command table
      // (every tool AND action together), which read as a confusing wall of
      // unrelated commands the moment anyone hit Space just to get started.
      // With truly nothing to repeat or close, Space should open the bar,
      // focused and empty (no literal space character seeded), and pop the
      // dropdown straight to the tool list (kind === NATIVE only — never the
      // action-button vocabulary in GRAPH_ACTIONS, e.g. undo/redo/finish/
      // cancel/calibrate/the round-19 modal actions) — this is "initialize
      // the console," a starting menu of what can be armed, not the ordinary
      // typed-query dropdown blending tools and actions together. Capped to
      // the same 8 rows every other command-mode listing already caps at
      // (RW._cmdTable's own declared order — GRAPH_TABLE/ANNOTATE_TABLE
      // first, GRAPH_ACTIONS appended after — so the first 8 are always
      // tools on both hosts; typing further still reaches everything else).
      if (!RW._cmdToolArmed && !RW._cmdLastTool){
        e.preventDefault(); e.stopImmediatePropagation();
        mountCommandBar();
        if (inputEl) inputEl.focus();
        menuMode = 'command';
        menuItems = RW._cmdTable.filter(function(entry){ return entry.kind === NATIVE; }).slice(0, 8);
        menuHighlight = menuItems.length ? 0 : -1;
        renderMenuRows();
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

  // ----- Round 21: Tab must win over any host-app-level keydown capture -----
  // Reported live: pressing Tab while the command input was genuinely
  // focused (an autocomplete dropdown already open from prior typing) did
  // not cycle the highlight — the dropdown flickered and then closed
  // instead. onInputKeydown's own Tab branch already calls preventDefault()/
  // stopPropagation() (confirmed by this file's many existing Tab tests,
  // which drive it directly and pass) — so the observed symptom (the
  // BROWSER's own default Tab action, moving focus away, firing instead,
  // with the dropdown then hiding ~150ms later via the input's own blur
  // handler) points to something intercepting the event before that handler
  // ever runs: most likely a keydown listener the HOST APP ITSELF registers
  // in the capture phase on `document` (its own accessibility/focus
  // handling, unrelated to this project). A later capture-phase listener we
  // add on `document` can never win that race — the app's own script always
  // registers first (it runs at page load, always before this loader is
  // pasted in), and two capture-phase listeners on the SAME node fire in
  // registration order. A capture-phase listener on `window`, however,
  // structurally fires BEFORE any document-level listener regardless of
  // registration order, since the capture phase always visits window before
  // document — the same "capture always wins" doctrine the global
  // auto-capture listener above already relies on for printable characters,
  // escalated one level higher specifically for Tab.
  //
  // Scoped tightly to "the real command input is the actual event target"
  // (checked via e.target, which never changes across the whole capture+
  // bubble dispatch regardless of listener order — unlike re-reading
  // document.activeElement, which could be one tick stale) so this can never
  // affect anything else on the page or either host differently.
  // stopImmediatePropagation (not just stopPropagation) both wins against
  // the app's own document-level listener AND stops the SAME event from
  // also reaching inputEl's own bubble-phase onInputKeydown listener a
  // second time — this fully REPLACES that path for Tab, it never runs
  // alongside it, so Tab is still only ever handled once.
  window.addEventListener('keydown', function(e){
    if (e.key !== 'Tab') return;
    if (e.target !== inputEl) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    onInputKeydown(e);
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
  // Off by default on the graph host: confirmed live that its drawing stage
  // (#graph-canvas-stage) is overflow:hidden with nothing to scroll — this
  // page pans via a CSS transform on #graph-canvas-frame instead, which the
  // scrollLeft/scrollTop technique below cannot drive. That host already
  // pans natively on wheel/Shift+wheel/middle-click, so there's nothing to
  // replace; the console escape hatch (__RW._panEnabled = true) is still
  // available if a future page on this host ever does scroll.
  RW._panEnabled = !RW_IS_GRAPH;  // subordinate to RW.enabled — disable pan alone without the killswitch
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
    el = el || document.getElementById(RW_CANVAS_ID) || document.body;
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
    el = el || document.getElementById(RW_CANVAS_ID) || document.body;
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

  const listNoun = RW_IS_GRAPH ? 'systems' : 'tags';
  return 'vcmd up: command line (native tools only, ' + RW_HOST + ' host) — just start typing a tool name '
    + '(or # for a ' + (RW_IS_GRAPH ? 'system' : 'tag') + '), ' + RW._cmdTable.length + ' commands, '
    + (RW._cmdTagList ? RW._cmdTagList.length + ' ' + listNoun : 'no ' + listNoun + ' detected')
    + '. select is the resting state (Escape returns here); '
    + (RW_IS_GRAPH
        ? 'this host pans/zooms natively (wheel, Shift+wheel, middle-click, Ctrl+wheel) — middle-drag pan is off here.'
        : 'middle-drag pans without switching tools; run __RW._zoomDiagnose() before/after zooming to find the real mechanism for wheel-zoom.');
})()


  console.log('[RW] command line ready (' + __RW._host.id + ' host): ' + __RW._cmdTable.length + ' commands, ' + (__RW._cmdTagList ? __RW._cmdTagList.length + ' ' + (__RW._host.id === 'graph' ? 'systems' : 'tags') : 'none detected') + '. Type a tool name (or # for a ' + (__RW._host.id === 'graph' ? 'system' : 'tag') + ') anywhere on the page. select is the resting state (Escape returns here);' + (__RW._host.id === 'graph' ? ' this host pans/zooms natively (wheel, Shift+wheel, middle-click, Ctrl+wheel) — middle-drag pan is off here.' : ' hold the middle mouse button to pan.'));
})()
