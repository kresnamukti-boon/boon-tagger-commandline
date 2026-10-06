#!/usr/bin/env node
// Synthetic Node harness for the PIPING command line, the counterpart of verify_cmdline.js (duct).
// Loads the real built files (dist/rw_pipe_cmdline.js, console_loader_pipe.js, console_loader.js) into
// a vm sandbox with a small fake page: a tool rail, action buttons, key-event ordering (window
// capture -> document capture -> target) and click side effects. It cannot prove anything about the
// real page (only pasting into Chrome does that), but it drives the real registered listeners.
//
// Like verify_cmdline.js it refuses to run against a build older than the sources it covers.
//   node verify_pipe_cmdline.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIST = path.join(__dirname, 'dist', 'rw_pipe_cmdline.js');
const PIPE_LOADER = path.join(__dirname, 'console_loader_pipe.js');
const DUCT_LOADER = path.join(__dirname, 'console_loader.js');

(function checkFreshness() {
  for (const p of [DIST, PIPE_LOADER]) {
    if (!fs.existsSync(p)) { console.error(`${path.basename(p)} is missing: run \`bash build_pipe_loader.sh\` first.`); process.exit(1); }
  }
  const builtAt = Math.min(fs.statSync(DIST).mtimeMs, fs.statSync(PIPE_LOADER).mtimeMs);
  const sources = [
    ...fs.readdirSync(path.join(__dirname, 'src', 'pipe')).map((n) => path.join('src', 'pipe', n)),
    ...fs.readdirSync(path.join(__dirname, 'src', 'core')).filter((n) => n.startsWith('pipe-')).map((n) => path.join('src', 'core', n)),
    path.join('src', 'core', 'command-line-core.js'), path.join('src', 'core', 'table-core.js'),
    path.join('src', 'features', 'actions.js'),
    'rw_host.js', 'rw_panelux.js', 'rw_core.js',
    path.join('scripts', 'build-pipe-dist.js'), path.join('scripts', 'build-pipe-loader.js'),
  ];
  for (const rel of sources) {
    if (fs.statSync(path.join(__dirname, rel)).mtimeMs > builtAt) {
      console.error(`piping build is stale (${rel} was edited more recently): run \`bash build_pipe_loader.sh\` before re-testing.`);
      process.exit(1);
    }
  }
})();

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.error('FAIL: ' + name); } }
function eq(actual, expected, name) {
  const good = JSON.stringify(actual) === JSON.stringify(expected);
  if (good) pass++; else { fail++; console.error(`FAIL: ${name}\n   expected ${JSON.stringify(expected)}\n   actual   ${JSON.stringify(actual)}`); }
}

/* ---------- a small fake page ---------- */
function makePage({ trade = 'piping', nativeBarOn = false, disabled = {}, withRail = true } = {}) {
  const byId = {};
  const listeners = { window: {}, document: {} };
  const warnings = [];
  const state = { activeElement: null, activeTool: 'select', clicks: [], statuses: [], timers: [] };

  function el(tag) {
    const own = {};
    const node = {
      tagName: String(tag).toUpperCase(), nodeType: 1, children: [], parentNode: null, attrs: {},
      className: '', style: { cssText: '', display: '' }, value: '', textContent: '', placeholder: '', disabled: false, hidden: false,
      _hiddenFromLayout: false, scrollTop: 0, clientHeight: 0, offsetTop: 0, offsetHeight: 0,
      get id() { return this._id || ''; }, set id(v) { this._id = v; if (v) byId[v] = this; },
      get offsetParent() { return this._hiddenFromLayout ? null : {}; },
      getClientRects() { return this._hiddenFromLayout ? [] : [{}]; },
      getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
      setAttribute(n, v) { this.attrs[n] = String(v); },
      set innerHTML(v) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; },
      get innerHTML() { return ''; },
      appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; },
      insertBefore(c, ref) { const i = ref ? this.children.indexOf(ref) : -1; if (i === -1) this.children.push(c); else this.children.splice(i, 0, c); c.parentNode = this; return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i !== -1) this.children.splice(i, 1); c.parentNode = null; return c; },
      addEventListener(type, fn) { (own[type] = own[type] || []).push(fn); },
      _listeners: own,
      dispatch(evt) { (own[evt.type] || []).slice().forEach((fn) => fn(evt)); },
      focus() { state.activeElement = this; this.dispatch({ type: 'focus' }); },
      blur() { if (state.activeElement === this) state.activeElement = null; this.dispatch({ type: 'blur' }); },
      click() {
        if (this.disabled) return; // a real disabled button never fires click
        state.clicks.push(this.id || this.attrs['data-tool'] || this.tagName);
        this.dispatch({ type: 'click', target: this });
      },
      setSelectionRange() {},
      querySelectorAll(sel) {
        const out = [];
        if (sel === 'button[data-family-id]') walk(this, (n) => { if (n.tagName === 'BUTTON' && 'data-family-id' in n.attrs) out.push(n); });
        return out;
      },
      getBoundingClientRect() { return { left: 100, top: 100, right: 700, bottom: 500, width: 600, height: 400 }; },
    };
    return node;
  }
  function walk(node, fn) { for (const c of node.children) { fn(c); walk(c, fn); } }

  const doc = {
    body: el('body'), activeElement: null,
    createElement: el,
    getElementById: (id) => byId[id] || null,
    querySelectorAll(sel) {
      const out = [];
      walk(doc.body, (n) => { if (sel === '[data-tool]' && 'data-tool' in n.attrs) out.push(n); });
      return out;
    },
    querySelector(sel) {
      if (sel === 'dialog[open]') { let hit = null; walk(doc.body, (n) => { if (!hit && n.tagName === 'DIALOG' && 'open' in n.attrs) hit = n; }); return hit; }
      if (sel === '[data-tool]') return doc.querySelectorAll(sel)[0] || null;
      return null;
    },
    addEventListener(type, fn, capture) { (listeners.document[type] = listeners.document[type] || []).push({ fn, capture: !!capture }); },
  };
  Object.defineProperty(doc, 'activeElement', { get: () => state.activeElement });

  const win = {
    innerHeight: 800, innerWidth: 1200, __graphDebug: { get activeTool() { return state.activeTool; } },
    addEventListener(type, fn, capture) { (listeners.window[type] = listeners.window[type] || []).push({ fn, capture: !!capture }); },
  };

  // --- the graph page itself ---
  const root = el('div'); root.id = 'graph-session-root'; root.setAttribute('data-trade', trade); doc.body.appendChild(root);
  const stage = el('div'); stage.id = 'graph-canvas-stage'; doc.body.appendChild(stage);
  const toggle = el('button'); toggle.id = 'graph-command-line-toggle'; toggle.setAttribute('aria-pressed', nativeBarOn ? 'true' : 'false'); doc.body.appendChild(toggle);
  const nativeWin = el('div'); nativeWin.id = 'graph-command-window'; nativeWin.hidden = !nativeBarOn; doc.body.appendChild(nativeWin);
  const panel = el('div'); panel.id = 'rw-panel'; const list = el('div'); list.id = 'rw-list'; panel.appendChild(list); doc.body.appendChild(panel);

  const RAIL = [
    ['select', 'S', 'Select'], ['route', 'R', 'Route pipe'], ['extend', 'X', 'Extend pipe'], ['terminate', 'P', 'Terminate end'],
    ['transition', 'N', 'Change size'], ['cut', 'U', 'Split run'], ['split-run', 'K', 'Split run (no fitting)'], ['valve', 'V', 'Valve'],
    ['fixture', 'F', 'Fixture'], ['equipment', 'Q', 'Equipment'], ['fitting', 'G', 'Place fitting'], ['vertical', 'Z', 'Riser'],
    ['service', 'A', 'Assign system'], ['evidence', 'D', 'Evidence'],
  ];
  if (withRail) {
    for (const [id, key, label] of RAIL) {
      const b = el('button'); b.setAttribute('data-tool', id); b.setAttribute('data-capture-control-id', 'tool-' + id);
      b.setAttribute('title', label); b.setAttribute('aria-disabled', 'false');
      const k = el('span'); k.className = 'graph-tool-key'; k.textContent = key;
      const l = el('span'); l.className = 'graph-tool-label'; l.textContent = label;
      b.appendChild(k); b.appendChild(l);
      if (disabled[id]) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); b.setAttribute('title', disabled[id]); }
      b.addEventListener('click', () => { state.activeTool = id; }); // native arms the tool on click
      doc.body.appendChild(b);
    }
  }
  const ACTIONS = ['graph-undo-command', 'graph-redo-command', 'graph-zoom-fit', 'graph-zoom-in', 'graph-zoom-out', 'graph-ruler', 'graph-components-button',
    'graph-save-commands', 'graph-finish-route', 'graph-cancel-route', 'graph-recording-stop'];
  for (const id of ACTIONS) { const b = el('button'); b.id = id; doc.body.appendChild(b); }
  byId['graph-redo-command'].disabled = true; // redo starts disabled on the real page

  const RW = { vcore: true, enabled: true, _cmdOwnsPanelPosition: false, _commitStatus(m) { state.statuses.push(m); } };
  win.__RW = RW;
  win.window = win;

  const context = vm.createContext({
    window: win, document: doc, console: { log() {}, warn(m) { warnings.push(String(m)); }, error() {} },
    setTimeout, clearTimeout, Date, Math, __graphDebug: win.__graphDebug,
    setInterval(fn) { state.timers.push(fn); return state.timers.length; },
  });

  // key events: window capture -> document capture -> target's own listeners (like a real dispatch)
  function press(target, key, mods = {}) {
    const evt = Object.assign({ type: 'keydown', key, target, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, mods);
    evt.defaultPrevented = false; evt.propagationStopped = false; evt.immediateStopped = false;
    evt.preventDefault = () => { evt.defaultPrevented = true; };
    evt.stopPropagation = () => { evt.propagationStopped = true; };
    evt.stopImmediatePropagation = () => { evt.immediateStopped = true; evt.propagationStopped = true; };
    for (const group of [listeners.window.keydown || [], listeners.document.keydown || []]) {
      for (const l of group.slice()) { if (l.capture && !evt.immediateStopped) l.fn(evt); }
      if (evt.propagationStopped) return evt;
    }
    if (!evt.immediateStopped) target.dispatch(evt);
    return evt;
  }
  // Native's "Place Fitting" panel, built the way pipe-session-ui.js builds it. groups: [{ports, usable, ids:[[id,label,usable]]}]
  function openPanel({ tool = 'fitting', hint = 'Choose the fitting subtype.', groups = [] } = {}) {
    state.activeTool = tool;
    const old = byId['graph-pipe-bbox-op-panel'];
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const pan = el('div'); pan.id = 'graph-pipe-bbox-op-panel';
    const header = el('div'); const title = el('span'); title.textContent = 'Place Fitting'; header.appendChild(title); pan.appendChild(header);
    const hintEl = el('p'); hintEl.textContent = hint; pan.appendChild(hintEl);
    const warn = el('p'); warn.className = 'graph-pipe-bbox-unresolved-entry-warning'; warn.hidden = true; pan.appendChild(warn);
    const field = el('div'); const menu = el('div'); menu.id = 'graph-pipe-fitting-select-menu'; menu.hidden = true;
    for (const g of groups) {
      const section = el('section'); const heading = el('div'); heading.className = 'graph-pipe-fitting-select-group-label';
      heading.textContent = g.ports + (g.ports === 1 ? ' port' : ' ports') + (g.usable === false ? ' \u00b7 unavailable' : '');
      section.appendChild(heading);
      for (const [id, label, usable] of g.ids) {
        const b = el('button'); b.setAttribute('data-family-id', id); b.disabled = usable === false;
        const l = el('span'); l.textContent = label; const c = el('span'); c.textContent = String(g.ports);
        b.appendChild(l); b.appendChild(c);
        b.addEventListener('click', () => { hintEl.textContent = 'Finish inserts this fitting. The connected pipe resumes from its outlet.'; state.chosen = id; });
        section.appendChild(b);
      }
      menu.appendChild(section);
    }
    field.appendChild(menu); pan.appendChild(field);
    doc.body.appendChild(pan);
    return { hintEl, pan };
  }
  function closePanel() { const pan = byId['graph-pipe-bbox-op-panel']; if (pan) pan.hidden = true; }
  return { doc, win, RW, state, warnings, context, press, el, byId, listeners, panel, root, openPanel, closePanel, tick() { state.timers.forEach((f) => f()); } };
}

function loadShell(page) {
  // Wrapped in a function, as the real loader wraps it, so a second load (a re-paste) is legal.
  vm.runInContext('(function(){\n' + fs.readFileSync(DIST, 'utf8') + '\n})()', page.context);
}
function typeText(page, text) {
  for (const ch of text) {
    const t = page.state.activeElement || page.doc.body;
    const evt = page.press(t, ch);
    // A real browser inserts the character into a focused text field unless the key was cancelled.
    if (t.tagName === 'INPUT' && !evt.defaultPrevented) { t.value += ch; t.dispatch({ type: 'input' }); }
  }
}
const input = (page) => page.byId['rw-pipe-input'];
const menuRows = (page) => (page.byId['rw-pipe-menu'] ? page.byId['rw-pipe-menu'].children.map((c) => c.textContent) : []);
const menuShown = (page) => !!page.byId['rw-pipe-menu'] && page.byId['rw-pipe-menu'].style.display === 'block';
const lastStatus = (page) => page.state.statuses[page.state.statuses.length - 1];

(async function main() {
  /* ----- install ----- */
  {
    const page = makePage();
    loadShell(page);
    ok(page.RW.vpipe === true, 'shell installs on a ready piping page');
    ok(!!input(page), 'the bar input is mounted');
    const names = page.RW._pipeTable().map((e) => e.name);
    eq(names.slice(0, 14), ['select', 'route', 'extend', 'terminate', 'transition', 'cut', 'split-run', 'valve', 'fixture', 'equipment', 'fitting', 'vertical', 'service', 'evidence'], 'table: the 14 rail tools, in rail order');
    eq(names.slice(14), ['undo', 'redo', 'zoomfit', 'zoomin', 'zoomout', 'ruler', 'components'], 'table: then the 7 actions');
    const info = page.RW._pipeTableInfo();
    eq([info.source, info.skipped, info.aliasDropped, info.shadowedActions], ['toolbar', [], [], []], 'table info: clean derivation from the toolbar');
    ok(/piping command line ready: 14 tools, 7 actions/.test(page.state.statuses[0]), 'startup status line');
    eq(page.RW._pipeTable().find((e) => e.name === 'fitting').aliases, ['g'], 'fitting\'s only alias is its badge key (fit stays zoomfit\'s)');
  }

  /* ----- refuses to double-install / install next to duct ----- */
  {
    const page = makePage();
    page.RW.vcmd = true;
    loadShell(page);
    ok(!page.RW.vpipe, 'shell refuses when the duct command line is already installed');
    ok(!input(page), 'and mounts nothing');
  }
  {
    const page = makePage();
    loadShell(page);
    const before = (page.listeners.document.keydown || []).length;
    loadShell(page);
    eq((page.listeners.document.keydown || []).length, before, 're-pasting adds no second listener');
  }
  {
    const page = makePage({ trade: 'ductwork' });
    loadShell(page);
    ok(!page.RW.vpipe, 'shell refuses on a duct page even when pasted without the loader');
    ok(!input(page) && !(page.listeners.document.keydown || []).length, 'and installs no UI and no listeners');
  }
  {
    const page = makePage({ nativeBarOn: true });
    loadShell(page);
    ok(!page.RW.vpipe, 'shell refuses while native\'s own command line is on');
  }

  /* ----- typing anywhere starts a command; Enter clicks the real button ----- */
  {
    const page = makePage();
    loadShell(page);
    const e = page.press(page.doc.body, 'g');
    ok(e.defaultPrevented && e.immediateStopped, 'a printable key on the page is captured');
    eq(input(page).value, 'g', 'and seeds the bar');
    ok(page.state.activeElement === input(page), 'and focuses it');
    ok(menuShown(page), 'and opens the dropdown');
    ok(/^fitting \(g\)/.test(menuRows(page)[0]), 'the exact key alias ranks first');
    const enter = page.press(input(page), 'Enter');
    ok(enter.defaultPrevented, 'Enter is handled');
    eq(page.state.clicks, ['fitting'], 'Enter clicks the fitting rail button exactly once');
    eq(page.state.activeTool, 'fitting', 'the page armed the tool');
    eq(input(page).value, '', 'the bar clears');
    ok(page.state.activeElement !== input(page), 'and blurs, so native\'s hotkey guard is not in the way');
    ok(!menuShown(page), 'and closes the dropdown');
    await new Promise((r) => setTimeout(r, 200));
    ok(/fitting armed/.test(lastStatus(page)), 'status confirms what the page reports');
  }
  {
    const page = makePage();
    loadShell(page);
    // A multi-word label can't be typed any more (Space confirms, like Enter), but it still resolves.
    page.RW.runCommand('place fitting');
    eq(page.state.clicks, ['fitting'], 'the on-screen label still resolves as a command');
  }
  {
    const page = makePage();
    loadShell(page);
    typeText(page, 'riser');
    page.press(input(page), 'Enter');
    eq(page.state.clicks, ['vertical'], 'a curated alias (riser) arms its tool (vertical)');
  }
  {
    const page = makePage();
    loadShell(page);
    typeText(page, 'fitt');
    page.press(input(page), 'Enter');
    eq(page.state.clicks, ['fitting'], 'Enter on a prefix runs the highlighted completion');
  }
  {
    const page = makePage();
    loadShell(page);
    typeText(page, 'fit');
    page.press(input(page), 'Enter');
    eq(page.state.clicks, ['graph-zoom-fit'], '"fit" is zoomfit\'s alias, not fitting\'s');
  }
  {
    const page = makePage();
    loadShell(page);
    typeText(page, 'zzzz');
    page.press(input(page), 'Enter');
    eq(page.state.clicks, [], 'an unknown command clicks nothing');
    ok(/unknown command: zzzz/.test(lastStatus(page)), 'and says so');
    eq(input(page).value, 'zzzz', 'and keeps the text so it can be fixed');
  }

  /* ----- disabled tools: listed with native's reason, never clicked ----- */
  {
    const reason = 'Enter a positive diameter before placing piping.';
    const page = makePage({ disabled: { fitting: reason, valve: reason } });
    loadShell(page);
    typeText(page, 'fitting');
    ok(menuRows(page).some((r) => r.startsWith('fitting') && r.includes(reason)), 'a disabled tool stays in the list, with native\'s own reason');
    page.press(input(page), 'Enter');
    eq(page.state.clicks, [], 'Enter on a disabled tool clicks nothing');
    ok(lastStatus(page).includes(reason), 'and reports native\'s reason');
    eq(input(page).value, 'fitting', 'and keeps the text');
    eq(page.RW._pipeOwn.armed, false, 'and does not mark anything armed');
  }

  /* ----- actions ----- */
  {
    const page = makePage();
    loadShell(page);
    typeText(page, 're');
    ok(!menuRows(page).some((r) => r.startsWith('redo')), 'an action that cannot do anything right now (redo, disabled) is left out of the list');
    ok(menuRows(page).some((r) => r.startsWith('fixture')), '...while a tool that merely contains "re" (fixture) is still listed');
    page.press(input(page), 'Escape');
    typeText(page, 'undo');
    page.press(input(page), 'Enter');
    eq(page.state.clicks, ['graph-undo-command'], 'undo clicks the real undo button');
    eq(page.RW._pipeOwn.armed, false, 'an action does not change the armed tool');
  }
  {
    const page = makePage();
    loadShell(page);
    for (const [word, btn] of [['zoomin', 'graph-zoom-in'], ['zo', 'graph-zoom-out'], ['ruler', 'graph-ruler'], ['comp', 'graph-components-button']]) {
      page.state.clicks.length = 0;
      typeText(page, word);
      page.press(input(page), 'Enter');
      eq(page.state.clicks, [btn], `${word} -> ${btn}`);
    }
  }
  {
    const page = makePage();
    page.byId['graph-redo-command'].disabled = false;
    loadShell(page);
    typeText(page, 'redo');
    page.press(input(page), 'Enter');
    eq(page.state.clicks, ['graph-redo-command'], 'redo works once its button is enabled');
  }

  /* ----- the forbidden boundary is enforced in code, not only by omission ----- */
  {
    const page = makePage();
    loadShell(page);
    for (const word of ['save', 'finish', 'cancel', 'submit', 'record', 'stop']) {
      page.RW.runCommand(word);
    }
    eq(page.state.clicks, [], 'save/finish/cancel/submit/record/stop are not commands and click nothing');
    // Even if a table entry (or a page change) pointed an action at a forbidden control:
    page.byId['graph-undo-command'].setAttribute('data-capture-control-id', 'submit-graph');
    const ok1 = page.RW.runCommand('undo');
    eq([ok1, page.state.clicks], [false, []], 'an action whose element turns out to be the Submit control is refused');
    ok(/protected control/.test(lastStatus(page)), 'with a clear message');
    page.byId['graph-undo-command'].setAttribute('data-capture-control-id', 'undo-command');
    // ...or if the page's own button for zoomfit were ever re-labelled with a forbidden id:
    page.byId['graph-zoom-fit'].id = 'graph-save-commands';
    const ok2 = page.RW.runCommand('zoomfit');
    eq([ok2, page.state.clicks], [false, []], 'an action whose element turns out to carry a forbidden id is refused');
  }

  /* ----- Space: repeat / close / initialise ----- */
  {
    const page = makePage();
    loadShell(page);
    const first = page.press(page.doc.body, ' ');
    ok(first.defaultPrevented, 'the very first Space is handled');
    eq(page.state.clicks, [], 'and runs nothing');
    ok(menuShown(page) && menuRows(page).length === 14, 'it opens the tool vocabulary (14 tools, no actions)');
    eq(input(page).value, '', 'without seeding a literal space');
    page.press(input(page), 'Escape');
    typeText(page, 'route');
    page.press(input(page), 'Enter');
    eq(page.state.clicks, ['route'], 'route armed');
    page.state.clicks.length = 0;
    page.press(page.doc.body, ' ');
    eq(page.state.clicks, ['select'], 'Space with a tool armed closes it to select');
    eq(page.state.activeTool, 'select', 'the page is on select');
    page.state.clicks.length = 0;
    page.press(page.doc.body, ' ');
    eq(page.state.clicks, ['route'], 'Space again repeats the last tool');
    eq(page.RW._pipeOwn.lastTool, 'route', 'last tool is tracked by us');
  }
  {
    const page = makePage();
    loadShell(page);
    typeText(page, 'valve');
    page.press(input(page), 'Enter');
    // the user then switches tool on the page by hand, long after our command
    page.RW._pipeOwn.lastCmdAt = Date.now() - 60000;
    page.state.activeTool = 'select';
    page.state.clicks.length = 0;
    page.press(page.doc.body, ' ');
    eq(page.state.clicks, ['valve'], 'after the grace window, a tool changed by hand is noticed (select -> Space repeats, not "closes")');
  }

  /* ----- what must NOT be captured ----- */
  {
    const page = makePage();
    loadShell(page);
    ok(!page.press(page.doc.body, '5').defaultPrevented, 'a bare digit on an empty bar reaches the page');
    ok(!page.press(page.doc.body, 'm').defaultPrevented, 'm (native\'s ruler hotkey) is never captured');
    ok(!page.press(page.doc.body, 'g', { ctrlKey: true }).defaultPrevented, 'Ctrl+key is never captured');
    ok(!page.press(page.doc.body, 'Enter').defaultPrevented, 'non-printable keys are never captured');
    const field = page.el('input'); page.doc.body.appendChild(field);
    ok(!page.press(field, 'g').defaultPrevented, 'typing in a page form field is never captured');
    const select = page.el('select'); page.doc.body.appendChild(select);
    ok(!page.press(select, 'g').defaultPrevented, 'a focused <select> is never captured');
    const dlg = page.el('dialog'); dlg.setAttribute('open', ''); page.doc.body.appendChild(dlg);
    ok(!page.press(page.doc.body, 'g').defaultPrevented, 'nothing is captured while a dialog is open');
    dlg.attrs = {};
    page.RW.enabled = false;
    ok(!page.press(page.doc.body, 'g').defaultPrevented, 'nothing is captured with the RW: OFF killswitch');
    page.RW.enabled = true;
    ok(page.press(page.doc.body, 'g').defaultPrevented, '...and capture resumes when it is back on');
  }

  /* ----- Escape and Tab ----- */
  {
    const page = makePage();
    loadShell(page);
    typeText(page, 'ro');
    const esc = page.press(input(page), 'Escape');
    ok(esc.propagationStopped, 'Escape with text/menu open is ours: native must not also cancel something');
    eq(input(page).value, '', 'it clears the bar');
    ok(!menuShown(page), 'it closes the dropdown');
    ok(page.state.activeElement !== input(page), 'it blurs');
    const esc2 = page.press(input(page), 'Escape');
    ok(!esc2.propagationStopped, 'Escape on an empty, closed bar passes through to native');
  }
  {
    const page = makePage();
    loadShell(page);
    typeText(page, 'r');
    const rows = menuRows(page);
    const tab = page.press(input(page), 'Tab');
    ok(tab.defaultPrevented && tab.immediateStopped, 'Tab is handled at the window level before the page can take it');
    ok(rows.length > 1, 'r matches several commands');
    const filled1 = input(page).value;
    page.press(input(page), 'Tab');
    const filled2 = input(page).value;
    ok(filled1 !== filled2, 'each Tab moves to the next completion and fills its name');
    page.press(input(page), 'Tab', { shiftKey: true });
    eq(input(page).value, filled1, 'Shift+Tab goes back');
    page.press(input(page), 'ArrowDown');
    page.press(input(page), 'Enter');
    eq(page.state.clicks.length, 1, 'Enter after cycling runs exactly one command');
  }

  /* ----- the two loaders ----- */
  async function runLoader(file, page) {
    const code = fs.readFileSync(file, 'utf8');
    try {
      return await vm.runInContext(code, page.context);
    } catch (err) {
      // A loader that throws (instead of refusing cleanly) is a failure, not a crash of the harness.
      ok(false, `${path.basename(file)} threw instead of refusing cleanly: ${err && err.message}`);
      return undefined;
    }
  }
  {
    const page = makePage({ trade: 'ductwork' });
    await runLoader(PIPE_LOADER, page);
    ok(page.warnings.some((w) => /ductwork/.test(w) && /duct command line loader/.test(w)), 'piping loader on a duct page: refuses, naming the right loader');
    ok(!page.RW.vpipe && !page.listeners.window.keydown && !page.listeners.document.keydown, 'and installs no listeners');
    ok(!page.byId['rw-pipe-input'], 'and no bar');
  }
  {
    const page = makePage({ nativeBarOn: true });
    await runLoader(PIPE_LOADER, page);
    ok(page.warnings.some((w) => /switched ON/.test(w)), 'piping loader with native\'s command line ON: refuses and says how to fix it');
    ok(!page.RW.vpipe && !page.listeners.document.keydown, 'and installs nothing');
  }
  {
    const page = makePage();
    page.RW.vcmd = true;
    await runLoader(PIPE_LOADER, page);
    ok(page.warnings.some((w) => /Reload the page/.test(w)), 'piping loader after the duct loader ran: refuses');
  }
  {
    const page = makePage({ trade: 'piping' });
    await runLoader(DUCT_LOADER, page);
    ok(page.warnings.some((w) => /piping page/.test(w) && /console_loader_pipe/.test(w)), 'duct loader on a piping page: refuses, naming the piping loader');
    ok(!page.RW.vcmd && !page.listeners.document.keydown && !page.listeners.window.keydown, 'and installs nothing (no listeners, no panel changes)');
  }

  /* ----- Step 2: choosing the fitting label in native's Place Fitting panel ----- */
  const FITTING_GROUPS = [
    { ports: 3, ids: [['pipe-tee-eq', 'Tee Eq'], ['pipe-tee-reducing', 'Tee Reducing'], ['pipe-wye', 'Wye'], ['pipe-sanitary-tee', 'Sanitary Tee'], ['pipe-wye-reducer', 'Wye Reducer']] },
    { ports: 4, ids: [['pipe-cross', 'Cross']] },
    { ports: 1, usable: false, ids: [['pipe-cap', 'Cap', false], ['pipe-floor-drain', 'Floor Drain', false]] },
    { ports: 2, usable: false, ids: [['pipe-elbow-90', 'Elbow 90', false], ['pipe-elbow-45', 'Elbow 45', false]] },
  ];
  {
    const page = makePage();
    loadShell(page);
    page.tick();
    ok(!page.RW._pipePrompt.active, 'no panel: no prompt');
    page.openPanel({ groups: FITTING_GROUPS });
    page.tick();
    ok(page.RW._pipePrompt.active, 'panel in the label phase: the prompt opens by itself');
    eq(page.state.activeElement && page.state.activeElement.id, 'rw-pipe-input', 'and takes the keyboard');
    const rows = menuRows(page);
    ok(/ports: type 1-4/.test(rows[0]), 'header explains the first step');
    eq(rows.slice(1).map((r) => r.replace(/ .*/, '')), ['3', '4', '1', '2'], 'categories: usable first (3, 4), then the unusable ones (1, 2)');
    ok(/1 port — none available/.test(rows[3]) && /2 ports — none available/.test(rows[4]), 'unusable categories are shown greyed with a reason');
    ok(!page.state.clicks.includes('graph-finish-route'), 'nothing pressed Finish');
  }
  {
    // digit picks a category, Enter picks the fitting; native's own label button is what gets clicked
    const page = makePage(); loadShell(page); page.openPanel({ groups: FITTING_GROUPS }); page.tick();
    typeText(page, '3'); page.press(input(page), 'Enter');
    eq(page.RW._pipePrompt.category, 3, '"3" + Enter chooses the 3-port category');
    const rows = menuRows(page);
    ok(/3-port/.test(rows[0]) && /Tee Eq/.test(rows[1]) && /Sanitary Tee/.test(rows[4]), 'it then lists the 3-port fittings');
    ok(/pipe-tee-eq \(tee,teeeq\)/.test(rows[1]), 'with the id and the approved aliases shown');
    page.press(input(page), 'Backspace');
    eq(page.RW._pipePrompt.category, null, 'Backspace on an empty bar goes back to the categories');
    typeText(page, '3'); page.press(input(page), 'Enter'); page.press(input(page), 'ArrowDown'); page.press(input(page), 'Enter');
    eq(page.state.chosen, 'pipe-tee-reducing', 'the highlighted fitting is chosen by clicking the real label button');
    ok(!page.RW._pipePrompt.active && /Tee Reducing chosen/.test(lastStatus(page)), 'the prompt ends and says what was chosen');
    ok(!page.state.clicks.includes('graph-finish-route') && !page.state.clicks.includes('graph-save-commands'), 'Finish and Save are never touched');
  }
  {
    // typing a fitting name picks it directly; unusable ones are refused
    const page = makePage(); loadShell(page); page.openPanel({ groups: FITTING_GROUPS }); page.tick();
    typeText(page, 'tee'); page.press(input(page), 'Enter');
    eq(page.state.chosen, 'pipe-tee-eq', '"tee" + Enter picks Tee Eq directly (no category step)');
  }
  {
    const page = makePage(); loadShell(page); page.openPanel({ groups: FITTING_GROUPS }); page.tick();
    typeText(page, 'wyer'); page.press(input(page), 'Enter');
    eq(page.state.chosen, 'pipe-wye-reducer', 'alias "wyer" picks Wye Reducer');
  }
  {
    const page = makePage(); loadShell(page); page.openPanel({ groups: FITTING_GROUPS }); page.tick();
    typeText(page, 'cap'); page.press(input(page), 'Enter');
    ok(page.state.chosen === undefined, 'an unavailable fitting (cap) is not chosen');
    ok(/no|nothing/.test(lastStatus(page)), 'and the bar says so');
  }
  {
    // only one usable category: the category step is skipped
    const page = makePage(); loadShell(page);
    page.openPanel({ groups: [{ ports: 2, ids: [['pipe-elbow-90', 'Elbow 90'], ['pipe-elbow-45', 'Elbow 45']] }, { ports: 3, usable: false, ids: [['pipe-tee-eq', 'Tee Eq', false]] }] });
    page.tick();
    const rows = menuRows(page);
    ok(/2-port/.test(rows[0]) && /Elbow 90/.test(rows[1]), 'one usable category: straight to its fittings');
    typeText(page, '45'); page.press(input(page), 'Enter');
    eq(page.state.chosen, 'pipe-elbow-45', 'alias "45" picks Elbow 45');
  }
  {
    // the auto-matched run diameter is shown, and the phase is read with "starts with"
    const page = makePage(); loadShell(page);
    page.openPanel({ hint: 'Choose the fitting subtype. Diameter 2" auto-matched from the crossed run.', groups: FITTING_GROUPS }); page.tick();
    ok(/auto-matched 2"/.test(menuRows(page)[0]), 'header shows the auto-matched diameter');
  }
  {
    // nothing usable
    const page = makePage(); loadShell(page);
    page.openPanel({ groups: [{ ports: 3, usable: false, ids: [['pipe-tee-eq', 'Tee Eq', false]] }] }); page.tick();
    ok(/No fitting can be placed/.test(menuRows(page)[0]), 'nothing usable: says so and points at Esc');
  }
  {
    // fixture menu: aliases come from the open menu's own ids
    const page = makePage(); loadShell(page);
    page.openPanel({ tool: 'fixture', groups: [{ ports: 1, ids: [['pipe-wc', 'Wc'], ['pipe-lav', 'Lav'], ['pipe-fd', 'Fd'], ['pipe-hb', 'Hb']] }] }); page.tick();
    typeText(page, 'fd'); page.press(input(page), 'Enter');
    eq(page.state.chosen, 'pipe-fd', 'fixture menu: "fd" is the fixture');
  }
  {
    // the same word in the fitting menu is the fitting, not the fixture
    const page = makePage(); loadShell(page);
    page.openPanel({ tool: 'fitting', groups: [{ ports: 1, ids: [['pipe-floor-drain', 'Floor Drain'], ['pipe-cap', 'Cap']] }] }); page.tick();
    typeText(page, 'fd'); page.press(input(page), 'Enter');
    eq(page.state.chosen, 'pipe-floor-drain', 'fitting menu: "fd" is Floor Drain');
  }
  {
    // Escape: first Esc closes our prompt and swallows the key, second reaches native (cancel); the prompt stays closed
    const page = makePage(); loadShell(page); page.openPanel({ groups: FITTING_GROUPS }); page.tick();
    const e1 = page.press(input(page), 'Escape');
    ok(e1.propagationStopped && !page.RW._pipePrompt.active, 'first Esc closes the prompt and is swallowed');
    page.tick();
    ok(!page.RW._pipePrompt.active, 'the prompt does not pop straight back open');
    const e2 = page.press(page.doc.body, 'Escape');
    ok(!e2.propagationStopped, 'second Esc is left alone, so native can cancel the placement');
    page.press(page.doc.body, ' ');
    ok(page.RW._pipePrompt.active, 'Space brings the prompt back');
    page.closePanel(); page.tick();
    ok(!page.RW._pipePrompt.active && !menuShown(page), 'when native closes the panel the prompt goes away');
  }
  {
    // a dismissed prompt comes back for the NEXT label phase (a new placement), not the same one
    const page = makePage(); loadShell(page); const h = page.openPanel({ groups: FITTING_GROUPS }); page.tick();
    page.press(input(page), 'Escape'); page.tick();
    h.hintEl.textContent = 'Click two opposite corners around the fitting on the drawing.'; page.tick();
    h.hintEl.textContent = 'Choose the fitting subtype.'; page.tick();
    ok(page.RW._pipePrompt.active, 'after native leaves and re-enters the label phase the prompt opens again');
  }
  {
    // a disabled label is never clicked, even if our own list were stale
    const page = makePage(); loadShell(page);
    page.openPanel({ groups: [{ ports: 3, ids: [['pipe-tee-eq', 'Tee Eq'], ['pipe-wye', 'Wye']] }] }); page.tick();
    typeText(page, 'tee');
    page.byId['graph-pipe-fitting-select-menu'].children[0].children.slice(1).forEach((b) => { b.disabled = true; });
    page.press(input(page), 'Enter');
    ok(page.state.chosen === undefined && !/ chosen$/.test(lastStatus(page)), 'a label that went disabled after we listed it is not chosen, and the bar does not claim it was');
  }
  {
    // prompts only run in the label phase
    const page = makePage(); loadShell(page);
    for (const hint of ['Click two opposite corners around the fitting on the drawing.', 'Click the detected intersection for outlet.', 'Finish inserts this fitting.', 'Saving pipe and fitting…']) {
      page.openPanel({ hint, groups: FITTING_GROUPS }); page.tick();
      ok(!page.RW._pipePrompt.active, 'no prompt while native says: ' + hint.slice(0, 30));
    }
  }
  {
    // isolation: while a placement panel is open, other tools are refused in code; the ways out still work
    const page = makePage(); loadShell(page);
    page.openPanel({ hint: 'Finish inserts this fitting.', groups: FITTING_GROUPS });
    page.state.clicks.length = 0;
    eq(page.RW.runCommand('route'), false, 'route refused while a fitting is open');
    ok(/finish or cancel the fitting/.test(lastStatus(page)) && !page.state.clicks.length, 'with a reason, and no click');
    eq(page.RW.runCommand('zoomin'), true, 'zoomin is still allowed');
    eq(page.RW.runCommand('select'), true, 'select is still allowed');
    page.closePanel();
    eq(page.RW.runCommand('route'), true, 'with the panel closed, route works again');
  }

  /* ----- the system-assignment tool is available like any other tool ----- */
  {
    const page = makePage(); loadShell(page);
    eq(page.RW.runCommand('assign'), true, '"assign" arms the Assign system tool (service)');
    eq(page.state.activeTool, 'service', 'and the page reports it');
  }
  /* ----- Space confirms exactly like Enter ----- */
  {
    const page = makePage(); loadShell(page);
    typeText(page, 'route'); page.press(input(page), ' ');
    eq(page.state.activeTool, 'route', 'Space after typing a tool name runs it, like Enter');
    ok(input(page).value === '', 'and clears the bar (no literal space typed)');
    typeText(page, 'zoomi'); page.press(input(page), ' ');
    ok(page.state.clicks.includes('graph-zoom-in'), 'Space runs the highlighted completion, like Enter');
    // bar lost focus with text waiting: Space still confirms
    typeText(page, 'extend'); input(page).blur();
    page.press(page.doc.body, ' ');
    eq(page.state.activeTool, 'extend', 'text waiting in an unfocused bar: Space confirms it');
  }
  {
    const page = makePage(); loadShell(page); page.openPanel({ groups: FITTING_GROUPS }); page.tick();
    typeText(page, '3'); page.press(input(page), ' ');
    eq(page.RW._pipePrompt.category, 3, 'in the label prompt, Space picks the category like Enter');
    typeText(page, 'wye'); page.press(input(page), ' ');
    eq(page.state.chosen, 'pipe-wye', 'and Space picks the fitting like Enter');
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
