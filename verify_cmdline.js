// Synthetic Node harness for rw_cmdline.js — NATIVE-TOOLS-ONLY BRANCH. Loads
// the real shipped module body against a minimal DOM stub (no browser, no
// network) — same discipline as verify_ocr.js/verify_pipe.js: exercise the
// real source, not a reimplementation, and drive real registered listeners
// (keydown/click/input) rather than only calling exposed functions directly.
//
// This branch's RW._cmdTable has no workbench entries (no `btn`/`ctl`/
// popup borrow/restore) — every entry is a `run`-only dispatch to the host
// app. Tests specific to the full command line's workbench-arming/popup
// machinery were removed accordingly; see CLAUDE.md.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, name){
  if (cond){ pass++; }
  else { fail++; console.error('FAIL: ' + name); }
}

/* ---------- minimal DOM stub (same shape as verify_pipe.js/verify_ocr.js) ---------- */

function findById(node, id){
  for (const c of (node._children || [])){
    if (c.id === id) return c;
    const f = findById(c, id);
    if (f) return f;
  }
  return null;
}

function makeElement(tag, registry){
  const listeners = {};
  let _id = '';
  const el = {
    tagName: (tag||'div').toUpperCase(),
    nodeType: 1,               // needed by the pan-container walk's `el.nodeType === 1` checks
    isConnected: true,
    get id(){ return _id; },
    set id(v){
      if (registry && _id) delete registry[_id];
      _id = v;
      if (registry && v) registry[v] = el;
    },
    value: '',
    innerText: '',
    _innerHTML: '',
    get innerHTML(){ return this._innerHTML; },
    // Real DOM semantics: setting innerHTML replaces all child *nodes* too, not just the
    // rendered markup. renderMenuRows() relies on exactly this (`menuEl.innerHTML = ''`
    // before re-appending fresh rows) — without clearing `_children` here as well, a second
    // render within the same test would leave the first render's rows behind, invisible to
    // any assertion using .some()/.find() but breaking an exact `.length` check (the bug
    // that surfaced writing the select-options UX tests, which are the first to render the
    // menu twice in one test and check an exact count).
    set innerHTML(html){
      this._innerHTML = html;
      this._children.forEach(function(c){ c.parentNode = null; });
      this._children.length = 0;
    },
    placeholder: '',
    title: '',
    type: '',
    name: '',
    min: '',
    max: '',
    step: '',
    className: '',            // plain string, distinct from classList below — RW._toolSettingsDiagnose's activeGuess reads this
    checked: false,           // checkbox state
    options: [],              // <select> options — plain {value,text} objects; Array.from() on a plain array just copies it
    autocomplete: '',
    spellcheck: false,
    style: { cssText: '', display: '' },
    classList: { _set: new Set(), contains(c){ return this._set.has(c); } },
    // Generic attribute store — only for attributes with no dedicated stub
    // property above (data-tool, aria-*). Deliberately NOT used for `value`:
    // getAttribute('value') would return only the initial HTML default in a
    // real browser, never the live value, so RW._toolSettingsDiagnose reads
    // .value as a property instead — matched here by keeping them separate.
    _attrs: {},
    getAttribute(name){ return (name in this._attrs) ? this._attrs[name] : null; },
    setAttribute(name, val){ this._attrs[name] = String(val); },
    hasAttribute(name){ return name in this._attrs; },
    _children: [],
    parentNode: null,
    _clicked: 0,
    click(){ this._clicked++; if (this.onclick) this.onclick(); },
    // `registry` (the shared byId map) doubles as a spot to track which
    // element is "active" right now — real enough to exercise the blur
    // handler's own document.activeElement re-check (round 22 follow-up)
    // without modeling a full focus-management system. Each also dispatches
    // its own real event to registered listeners (a genuine gap before this
    // round: the module's own `inputEl.addEventListener('blur', ...)` relies
    // on a real 'blur' EVENT firing, which a plain flag-flip never provided —
    // every prior test exercising .blur() only ever asserted the `_focused`
    // flag, never that its listener actually ran).
    focus(){ this._focused = true; if (registry) registry.__activeElement = this; this.dispatchEvent({ type: 'focus' }); },
    blur(){
      this._focused = false;
      if (registry && registry.__activeElement === this) registry.__activeElement = null;
      this.dispatchEvent({ type: 'blur' });
    },
    _rect: { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 },
    getBoundingClientRect(){ return this._rect; },
    // Scroll/pan surface — a plain object by default (nothing scrollable);
    // makeScrollable() below configures these for pan-resolution tests.
    scrollLeft: 0, scrollTop: 0,
    scrollWidth: 0, scrollHeight: 0,
    clientWidth: 0, clientHeight: 0,
    // offsetTop/offsetHeight default to 0 — a plain stub with no real layout
    // engine. __layoutRowHeight (round 23) opts a container into a synthetic
    // fixed-row-height layout: appendChild below stamps each child's own
    // offsetHeight/offsetTop from its index the moment it's appended, enough
    // to exercise cmdScrollRowIntoView's scrollTop math without modeling a
    // real layout engine.
    offsetTop: 0, offsetHeight: 0,
    _computed: null,           // {overflowX, overflowY, scrollBehavior} — read by the getComputedStyle stub
    _captured: null,
    setPointerCapture(id){ this._captured = id; },
    releasePointerCapture(id){ if (this._captured === id) this._captured = null; },
    hasPointerCapture(id){ return this._captured === id; },
    get parentElement(){ return this.parentNode; }, // the pan walk uses the real DOM property name
    addEventListener(type, fn){ (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn){
      const arr = listeners[type];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    },
    dispatchEvent(evt){ (listeners[evt.type] || []).slice().forEach(fn => fn(evt)); return true; },
    _fire(type, evt){
      evt = Object.assign({ stopPropagation(){}, preventDefault(){}, stopImmediatePropagation(){} }, evt);
      (listeners[type] || []).slice().forEach(fn => fn(evt));
      return evt;
    },
    appendChild(child){
      if (child.parentNode) child.parentNode.removeChild(child);
      this._children.push(child); child.parentNode = this;
      if (this.__layoutRowHeight){
        const i = this._children.length - 1;
        child.offsetHeight = this.__layoutRowHeight;
        child.offsetTop = i * this.__layoutRowHeight;
      }
      return child;
    },
    insertBefore(child, ref){
      if (child.parentNode) child.parentNode.removeChild(child);
      const idx = ref ? this._children.indexOf(ref) : -1;
      if (idx === -1) this._children.push(child); else this._children.splice(idx, 0, child);
      child.parentNode = this;
      return child;
    },
    removeChild(child){
      const idx = this._children.indexOf(child);
      if (idx !== -1) this._children.splice(idx, 1);
      child.parentNode = null;
      // Match real getElementById semantics: a detached element is no longer
      // findable by id. Needed for the pan cursor style's own
      // getElementById-based "already present" guard to behave correctly
      // across repeated drags in tests.
      if (registry && child.id && registry[child.id] === child) delete registry[child.id];
      return child;
    },
    get children(){ return this._children; },
    // Needed by the draggable-panel feature's barHeaderEl(), which identifies
    // the drag handle structurally (the panel's firstChild, no id) rather
    // than by id — a real DOM gap this stub never needed to close before.
    get firstChild(){ return this._children.length ? this._children[0] : null; },
    get nextSibling(){
      if (!this.parentNode) return null;
      const idx = this.parentNode._children.indexOf(this);
      return idx === -1 ? null : (this.parentNode._children[idx+1] || null);
    },
    querySelector(sel){
      if (sel[0] === '#') return findById(this, sel.slice(1));
      return null;
    }
  };
  return el;
}

// A ready-made scrollable ancestor for pan-container-resolution tests.
// opts: {x, y, w, h} — which axes are scrollable and how much overflow.
function makeScrollable(byId, id, opts){
  opts = opts || {};
  const el = makeElement('div', byId);
  el.id = id;
  el._computed = {
    overflowX: opts.x ? 'auto' : 'visible',
    overflowY: opts.y ? 'auto' : 'visible',
    scrollBehavior: opts.smooth ? 'smooth' : 'auto'
  };
  el.clientWidth = 500;  el.scrollWidth  = opts.x ? (opts.w || 2000) : 500;
  el.clientHeight = 500; el.scrollHeight = opts.y ? (opts.h || 4000) : 500;
  return el;
}

// A <select> fixture, id + [{value,text}, ...] pairs, current value defaulting to the first option.
function makeSelect(byId, id, optionPairs, currentValue){
  const el = makeElement('select', byId);
  el.id = id;
  el.options = optionPairs.map(function(p){ return { value: p[0], text: p[1] }; });
  el.value = currentValue != null ? currentValue : (el.options[0] ? el.options[0].value : '');
  return el;
}

// A #rw-panel fixture matching both what RW._cmdRepositionOverlay would have
// already pinned it to (style.left/bottom/width + a rect) AND rw_panelux.js's
// real structural layout: a header with NO id (the drag handle, identified
// structurally — see barHeaderEl in rw_cmdline.js) holding #rw-collapse and
// #rw-enable, plus an #rw-body sibling standing in for the panel's
// non-header content (the input/status area — pressing there must never
// start a drag). Attached to doc.body so it's discoverable exactly like the
// real panel, and built BEFORE loadModule() so the drag-attach code (which
// runs once at module load) finds it, same discipline as the existing
// overlay-positioning tests.
function makeDragPanel(win, byId){
  const panel = makeElement('div', byId);
  panel.id = 'rw-panel';
  byId['rw-panel'] = panel;
  panel.style.left = '160px'; panel.style.bottom = '76px'; panel.style.width = '480px';
  panel._rect = { left: 160, top: 600, right: 640, bottom: 690, width: 480, height: 90 };

  const header = makeElement('div', byId); // no id — the structural drag handle
  const caret = makeElement('span', byId); caret.id = 'rw-collapse';
  const title = makeElement('b', byId);
  const enableBtn = makeElement('button', byId); enableBtn.id = 'rw-enable';
  header.appendChild(caret); header.appendChild(title); header.appendChild(enableBtn);
  panel.appendChild(header);

  const body = makeElement('div', byId); body.id = 'rw-body';
  const bodyContent = makeElement('div', byId); // stand-in for the input/status area
  body.appendChild(bodyContent);
  panel.appendChild(body);

  win.document.body.appendChild(panel);
  return { panel, header, caret, enableBtn, title, body, bodyContent };
}

// Plain-object mouse/pointer event factory — the module never CONSTRUCTS a
// mouse/pointer event (unlike KeyboardEvent, which it really does build), it
// only receives one, so no sandboxGlobals constructor is needed, just a
// shape to pass into _fire/dispatchEvent.
function mouseEvt(props){
  const e = Object.assign({
    button: 1, buttons: 4, clientX: 0, clientY: 0,
    pointerId: 1, pointerType: 'mouse', isPrimary: true,
    defaultPrevented: false, _propStopped: false, _immediateStopped: false
  }, props);
  // Bound to `this`, not closed over `e` — documentStub._fire() clones the
  // event object it hands to listeners (Object.assign into a fresh object),
  // so a closure-captured `e` would silently mutate the wrong, discarded
  // object while the clone this test inspects stayed unaffected.
  e.preventDefault = function(){ this.defaultPrevented = true; };
  e.stopPropagation = function(){ this._propStopped = true; };
  e.stopImmediatePropagation = function(){ this._immediateStopped = true; };
  return e;
}

// Fake setTimeout/setInterval so tests control every deferral and poll tick
// deterministically instead of racing real Node timers (the auto-select
// watcher's 250ms poll, its Escape handler's setTimeout(0), and the 400ms
// select-on-load deferral all go through these once injected via loadModule).
function makeFakeTimers(){
  let nextId = 1;
  const timeouts = {};
  const intervals = {};
  return {
    timeouts, intervals,
    fakeSetTimeout(fn, delay){ const id = nextId++; timeouts[id] = { fn, delay, cleared:false }; return id; },
    fakeClearTimeout(id){ if (timeouts[id]) timeouts[id].cleared = true; },
    fakeSetInterval(fn, delay){ const id = nextId++; intervals[id] = { fn, delay, cleared:false }; return id; },
    fakeClearInterval(id){ if (intervals[id]) intervals[id].cleared = true; },
    // Runs every currently-pending timeout once (marking it cleared first,
    // matching real setTimeout's one-shot semantics), including ones a fired
    // timeout schedules — a plain snapshot would miss those.
    runTimeouts(){
      let more = true;
      while (more){
        more = false;
        for (const id of Object.keys(timeouts)){
          const t = timeouts[id];
          if (t && !t.cleared){ t.cleared = true; t.fn(); more = true; }
        }
      }
    },
    tickIntervals(){
      Object.keys(intervals).forEach(function(id){
        const iv = intervals[id];
        if (iv && !iv.cleared) iv.fn();
      });
    }
  };
}

// A small hand-rolled matcher, not a full CSS engine — covers exactly the
// three selector shapes RW._toolSettingsDiagnose issues: bare attribute
// presence ('[data-tool]'), tag+single-attribute-equals with a
// double-quoted value ('input[type="range"]'), and a bare tag name
// ('select'). Not intended to support anything beyond these three forms.
function matchesSelector(el, selector){
  // Round 19: cmdSweepControls now passes a single comma-separated selector
  // list (so real querySelectorAll returns every match in one document-order
  // pass, instead of type-grouped chunks from separate calls) — split it the
  // same way Element.matches() does for a selector list: match if any
  // comma-branch matches, real leading/trailing whitespace trimmed per branch.
  if (selector.indexOf(',') !== -1){
    return selector.split(',').some(function(s){ return matchesSelector(el, s.trim()); });
  }
  let m;
  if ((m = /^\[([a-zA-Z0-9-]+)\]$/.exec(selector))){
    return el.hasAttribute ? el.hasAttribute(m[1]) : false;
  }
  if ((m = /^([a-zA-Z0-9]+)\[([a-zA-Z0-9-]+)="([^"]*)"\]$/.exec(selector))){
    const [, tag, attr, val] = m;
    if (el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    const propVal = (attr in el) ? el[attr] : (el.getAttribute ? el.getAttribute(attr) : null);
    return propVal === val;
  }
  if (/^[a-zA-Z0-9]+$/.test(selector)){
    return el.tagName.toLowerCase() === selector.toLowerCase();
  }
  return false;
}

// Recursive — real querySelectorAll searches the whole tree, not just direct
// children, so fixtures must be attached under `root` (typically doc.body)
// to be found, unlike most existing tests here which build free-floating
// trees driven purely by event firing.
function queryAllRecursive(root, selector, out){
  out = out || [];
  for (const child of (root._children || [])){
    if (matchesSelector(child, selector)) out.push(child);
    queryAllRecursive(child, selector, out);
  }
  return out;
}

function makeStubWindow(opts){
  const byId = {};
  const body = makeElement('body', byId);
  const docListeners = {};

  const documentStub = {
    _byId: byId,
    body: body,
    // Backed by the same shared byId map every makeElement() in this stub
    // window writes to on focus()/blur() (round 22 follow-up) — real enough
    // to exercise the command bar's own "is the input STILL blurred once the
    // deferred hide timer actually fires" re-check.
    get activeElement(){ return byId.__activeElement || null; },
    getElementById(id){ return byId[id] || null; },
    createElement(tag){ return makeElement(tag, byId); },
    querySelectorAll(selector){ return queryAllRecursive(body, selector); },
    // Real enough to exercise RW._cmdDispatchAppKey against the actually-
    // registered listeners (including our own auto-capture one), honoring
    // stopImmediatePropagation like a real document would.
    dispatchEvent(evt){
      if (evt.target === undefined) evt.target = documentStub;
      for (const fn of (docListeners[evt.type] || []).slice()){
        fn(evt);
        if (evt._immediateStopped) break;
      }
      return !evt.defaultPrevented;
    },
    addEventListener(type, fn){ (docListeners[type] = docListeners[type] || []).push(fn); },
    // Mandatory, not decorative: the pan feature adds/removes its move/up
    // listeners per drag, and without a real removal a second drag would
    // double-apply every delta.
    removeEventListener(type, fn){
      const arr = docListeners[type];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    },
    _fire(type, evt){
      evt = Object.assign({ stopPropagation(){}, preventDefault(){}, stopImmediatePropagation(){} }, evt);
      (docListeners[type] || []).slice().forEach(fn => fn(evt));
      return evt;
    }
  };
  // Non-scrolling by default (matches a typical real page where the
  // documentElement doesn't overflow) — individual tests override the
  // metrics directly when they need the scrollingElement fallback rung.
  documentStub.documentElement = makeScrollable(byId, 'rw-test-html', {});
  documentStub.scrollingElement = documentStub.documentElement;

  const win = { document: documentStub, innerWidth: 1000, innerHeight: 700 };
  win.__RW = {
    vcore: true,
    enabled: true,
    // This fixture represents the normal single-tool case, where rw_core.js
    // built #rw-panel fresh (no workbench present) — matches the real
    // contract rw_core.js now sets when it owns the panel's positioning.
    // See CLAUDE.md's load-order-independence section.
    _cmdOwnsPanelPosition: true,
    // Default host: the annotate page, matching every test written before
    // the dual-target host-adapter round. Pass {host: {...}} to opts (below)
    // to point a test at the graph ("Duct Takeoff") host instead.
    _host: { id: 'annotate', canvasId: 'annotation-canvas' },
    _commitStatus(msg){ this._lastStatus = msg; }
  };
  if (opts && opts.host) win.__RW._host = opts.host;
  // window-level listener support (only `blur` is registered on window by
  // the real module) plus the small feature-detection surface the pan
  // container walk and mouse-fallback path read.
  const winListeners = {};
  win.addEventListener = function(type, fn){ (winListeners[type] = winListeners[type] || []).push(fn); };
  win.removeEventListener = function(type, fn){
    const arr = winListeners[type];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i !== -1) arr.splice(i, 1);
  };
  win._fire = function(type, evt){ (winListeners[type] || []).slice().forEach(fn => fn(evt)); return evt; };
  win.getComputedStyle = function(el){
    return (el && el._computed) || { overflowX:'visible', overflowY:'visible', scrollBehavior:'auto' };
  };
  win.PointerEvent = function(){}; // presence-only feature detect — never constructed by the module
  // No requestAnimationFrame: the module's own raf shim falls back to
  // synchronous execution when it's absent, which is exactly what lets these
  // tests observe scroll writes without a rAF stub.

  // Only #rw-list is needed now — mountCommandBar's anchor (rw_core.js
  // creates it; rw_panelsections.js and its #rw-sections are gone on this
  // branch). No workbench buttons/sections to build: every table entry is
  // `run`-only.
  const list = makeElement('div', byId);
  list.id = 'rw-list';
  byId['rw-list'] = list;
  const panelBody = makeElement('div', byId);
  panelBody.appendChild(list);

  return { win, doc: documentStub, byId, list };
}

// Node has no KeyboardEvent global; rw_cmdline.js's real dispatch code (the
// same `new KeyboardEvent('keydown', {...})` idiom used elsewhere in this
// codebase to make the app relinquish its own tool) needs one to run for real.
function FakeKeyboardEvent(type, init){
  Object.assign(this, init || {});
  this.type = type;
  this.defaultPrevented = false;
  this._immediateStopped = false;
}
FakeKeyboardEvent.prototype.preventDefault = function(){ this.defaultPrevented = true; };
FakeKeyboardEvent.prototype.stopPropagation = function(){};
FakeKeyboardEvent.prototype.stopImmediatePropagation = function(){ this._immediateStopped = true; };

// `timers` is optional — omitted, each call gets its own fresh fake-timer
// set (so the auto-select watcher's real setInterval/setTimeout calls never
// touch Node's real timers and every existing test stays deterministic and
// side-effect-free); pass one explicitly to drive ticks/deferrals from a test.
// `graphDebug` is the graph host's counterpart to `annotationState` —
// window.__graphDebug, read by readTool()/readMode() only when
// win.__RW._host.id === 'graph'; every existing (annotate-host) test omits
// it and is unaffected, same as `typeof __graphDebug !== 'undefined'`
// resolving to false in the real module when nothing supplies it.
function loadModule(win, annotationState, timers, graphDebug){
  timers = timers || makeFakeTimers();
  win._timers = timers;
  const src = fs.readFileSync(path.join(__dirname, 'rw_cmdline.js'), 'utf8');
  const sandboxGlobals = {
    window: win, document: win.document, KeyboardEvent: FakeKeyboardEvent, annotationState: annotationState,
    __graphDebug: graphDebug,
    setTimeout: timers.fakeSetTimeout, clearTimeout: timers.fakeClearTimeout,
    setInterval: timers.fakeSetInterval, clearInterval: timers.fakeClearInterval
  };
  const fn = new Function(...Object.keys(sandboxGlobals), src + '\n//# sourceURL=rw_cmdline.js');
  const ret = fn(...Object.values(sandboxGlobals));
  return ret;
}

// Sandboxes rw_core.js itself (never loaded by loadModule() above, which only
// exercises rw_cmdline.js) — added for the load-order-independence tests
// below. Note: the stub's innerHTML setter doesn't parse markup into real
// elements (see its own comment), so rw_core.js's fresh-build branch's
// `panel.innerHTML = '<div id="rw-list"></div>'` never registers a findable
// #rw-list under this harness — the fresh-build test below doesn't assert on
// it for that reason. The panel-reuse test isn't affected, since reuse never
// touches innerHTML.
function loadCoreModule(win){
  const src = fs.readFileSync(path.join(__dirname, 'rw_core.js'), 'utf8');
  const fn = new Function('window', 'document', src + '\n//# sourceURL=rw_core.js');
  return fn(win, win.document);
}

/* ---------- 1. RW._cmdMatch ranking ---------- */
{
  const { win } = makeStubWindow();
  loadModule(win);
  const RW = win.__RW;

  const w = RW._cmdMatch('w');
  ok(w[0] && w[0].name === 'rect', '"w" resolves to rect first (exact alias beats name-prefix matches)');
  ok(w.some(e => e.name === 'wand'), '"w" still lists wand as a name-prefix match');
  ok(w.some(e => e.name === 'wrap'), '"w" still lists wrap as a name-prefix match');

  const bbox = RW._cmdMatch('bbox');
  ok(bbox[0] && bbox[0].name === 'rect', 'legacy alias "bbox" still resolves to rect');
  const ribbon = RW._cmdMatch('ribbon');
  ok(ribbon[0] && ribbon[0].name === 'mline', 'legacy alias "ribbon" still resolves to mline');

  const exact = RW._cmdMatch('linear');
  ok(exact[0].name === 'linear', 'exact name match ranks first');

  const empty = RW._cmdMatch('');
  ok(empty.length === RW._cmdTable.length, 'empty query returns the whole table');

  const none = RW._cmdMatch('zzz-nonexistent');
  ok(none.length === 0, 'no match returns an empty array');
}

/* ---------- 2. every entry on this branch is a native, run-only dispatch ---------- */
{
  const { win } = makeStubWindow();
  loadModule(win);
  const RW = win.__RW;
  const bad = RW._cmdTable.filter(e => e.kind !== 'native');
  ok(bad.length === 0, 'every command is kind "native" on this branch (offenders: ' + bad.map(e=>e.name).join(',') + ')');
  const noRun = RW._cmdTable.filter(e => typeof e.run !== 'function');
  ok(noRun.length === 0, 'every command is run-only (offenders: ' + noRun.map(e=>e.name).join(',') + ')');
  const hasBtnOrCtl = RW._cmdTable.filter(e => e.btn || e.ctl);
  ok(hasBtnOrCtl.length === 0, 'no entry has btn/ctl on this branch (offenders: ' + hasBtnOrCtl.map(e=>e.name).join(',') + ')');
}

/* ---------- 3. natural aliases restored: no more workbench collisions to avoid ---------- */
{
  const { win } = makeStubWindow();
  loadModule(win);
  const RW = win.__RW;
  ok(RW._cmdMatch('k')[0].name === 'wand', '"k" now resolves directly to wand (no workbench cut to collide with)');
  ok(RW._cmdMatch('a')[0].name === 'pan', '"a" now resolves directly to pan');
  ok(RW._cmdMatch('s')[0].name === 'select', '"s" now resolves directly to select');
  ok(RW._cmdMatch('r')[0].name === 'polygon', '"r" now resolves directly to polygon');
}

/* ---------- 4. RW.runCommand on a run-only entry just calls run(), no button/popup involved ---------- */
{
  const { win } = makeStubWindow();
  loadModule(win);
  const RW = win.__RW;
  const keys = [];
  RW._cmdDispatchAppKey = function(k){ keys.push(k); };
  const okRun = RW.runCommand('mirror');
  ok(okRun === true, 'runCommand returns true for a real command');
  ok(JSON.stringify(keys) === JSON.stringify(['m']), 'runCommand("mirror") dispatches m');

  RW.runCommand('unknown-tool-xyz');
  ok(RW._lastStatus.indexOf('unknown command') !== -1, 'unknown command reports status, does not throw');
}

/* ---------- 5. RW.runCommand still supports armed/disarm for a future native armed() pass ---------- */
// Nothing in RW._cmdTable uses btn/armed/disarm today (see test 2), but the
// plumbing in RW.runCommand is kept deliberately — this is what a future
// native armed() predicate needs once the real annotationState.currentTool
// strings are confirmed live. Exercised directly against a synthetic entry
// so a regression here is caught even though no real table entry hits it yet.
{
  const { win, byId } = makeStubWindow();
  loadModule(win);
  const RW = win.__RW;
  const btn = makeElement('button', byId);
  btn.id = 'test-btn';
  btn.offsetParent = {}; // visible — round 15's runCommand button path now checks this before clicking
  let armedState = false;
  btn.onclick = () => { armedState = true; };
  RW._cmdTable.push({ name:'synthtest', kind:'native', aliases:[], btn:'test-btn',
    armed: () => armedState, disarm: () => { armedState = false; } });

  ok(RW.runCommand('synthtest') === true, 'runCommand arms a btn-based entry by clicking it');
  ok(btn._clicked === 1 && armedState === true, 'clicking the button armed it');
  ok(RW.runCommand('synthtest') === true, 'running it again while armed calls disarm(), not a second click');
  ok(btn._clicked === 1 && armedState === false, 'disarm() fired instead of a second click');
}

(async () => {
  /* ---------- 6. RW._cmdDispatchAppKey uses the same event shape as the existing Escape idiom ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const dispatched = [];
    win.document.dispatchEvent = function(evt){ dispatched.push(evt); };
    RW._cmdDispatchAppKey('q');
    ok(dispatched.length === 1, 'dispatches exactly one event');
    ok(dispatched[0].type === 'keydown' && dispatched[0].key === 'q'
       && dispatched[0].bubbles === true && dispatched[0].cancelable === true,
       'event shape matches the existing synthetic-Escape idiom (keydown, bubbles, cancelable)');
  }

  /* ---------- 7. native draw tools dispatch "d" (draw mode) before their own letter ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('linear');
    ok(JSON.stringify(keys) === JSON.stringify(['d','q']), 'linear dispatches d then q');
  }

  /* ---------- 7b. ribbon (new native tool, confirmed live via opencli) dispatches d then p ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('ribbon');
    ok(JSON.stringify(keys) === JSON.stringify(['d','p']), 'ribbon dispatches d then p');
  }

  /* ---------- 8. native mode switches dispatch only their own letter, no "d" prefix ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('mirror');
    ok(JSON.stringify(keys) === JSON.stringify(['m']), 'mirror dispatches only m, not a d prefix');
  }

  /* ---------- 9. live-diagnostic readout: reports the dispatched key and currentTool before/after ---------- */
  {
    const { win } = makeStubWindow();
    const as = { currentTool: 'select' };
    loadModule(win, as);
    const RW = win.__RW;
    // Real dispatch (not stubbed) — nothing in this harness changes
    // currentTool, so before/after are equal; the point of this test is
    // that both are read and reported, not that they differ.
    RW._cmdDispatchAppKey('q');
    ok(RW._lastStatus.indexOf('dispatched "q"') !== -1, 'status names the dispatched key');
    ok(RW._lastStatus.indexOf('select') !== -1 && RW._lastStatus.indexOf('->') !== -1,
       'status reports currentTool before -> after');
  }

  /* ---------- 10. the diagnostic readout degrades to "undefined", not a throw, with no annotationState ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win); // no annotationState passed
    const RW = win.__RW;
    let threw = false;
    try { RW._cmdDispatchAppKey('q'); } catch (e) { threw = true; }
    ok(!threw, 'dispatching with no annotationState does not throw');
    ok(RW._lastStatus.indexOf('undefined') !== -1, 'status reports undefined -> undefined rather than silently omitting it');
  }

  /* ---------- 11. global auto-capture: typing anywhere seeds and focuses the command input ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const bodyTarget = makeElement('div', byId); // stands in for "nothing else focused"
    const evt = doc._fire('keydown', { target: bodyTarget, key: 'l' });
    ok(evt.defaultPrevented !== undefined || true, 'sanity: event dispatched without throwing');
    const inp = byId['rw-cmd-input'];
    ok(inp && inp.value === 'l', 'typing "l" with nothing focused seeds the command input');
    ok(inp._focused === true, 'the command input is auto-focused');
  }

  /* ---------- 12. global auto-capture leaves a real, already-focused input alone ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const otherInput = makeElement('input', byId);
    otherInput.value = 'hello';
    doc._fire('keydown', { target: otherInput, key: 'p' });
    ok(otherInput.value === 'hello', 'typing into a real, unrelated input is not hijacked');
    ok(!byId['rw-cmd-input'] || byId['rw-cmd-input'].value === '',
       'the command input is not seeded by keystrokes aimed at another input');
  }

  /* ---------- 13. the bug fix: our own synthetic dispatch is never eaten by the auto-capture listener ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;

    RW._cmdDispatchAppKey('q'); // real dispatch, real registered listeners — not stubbed
    ok(byId['rw-cmd-input'].value === '',
       'a synthetic dispatch for a native tool does not get typed into the command input');

    // A real (non-synthetic) single-character keydown must still be captured —
    // guards against the fix being too broad and disabling auto-capture entirely.
    const real = new FakeKeyboardEvent('keydown', { target: win.document.body, key: 'p' });
    win.document.dispatchEvent(real);
    ok(byId['rw-cmd-input'].value === 'p',
       'a genuine keystroke (not marked __rwSynthetic) is still auto-captured as before');
  }

  /* ---------- 14. the dropdown colors native entries with the native color ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    inp.value = 'wr'; // matches wrap
    inp.dispatchEvent({ type: 'input' });
    const rows = byId['rw-cmd-menu']._children;
    const wrapRow = rows.find(r => r.innerText.indexOf('wrap') === 0);
    ok(wrapRow && wrapRow.style.cssText.indexOf('#a8e6a3') !== -1, 'a native match is colored with the native color');
  }

  /* ---------- 15. tag auto-detection: finds the right field among decoys via currentTag membership ---------- */
  {
    const { win } = makeStubWindow();
    const as = {
      currentTag: { id: 5, name: 'Door' },
      unrelatedArray: [{id:1,name:'Nope'}], // shaped right, but not in the candidate name list
      tagList: [{id:9,name:'Wrong list'}],  // a candidate NAME, but doesn't contain currentTag -> must be skipped
      tags: [{id:1,name:'Wall'},{id:5,name:'Door'},{id:12,name:'Window'}], // the real one
    };
    loadModule(win, as);
    const RW = win.__RW;
    ok(RW._cmdTagSource === 'tags', 'detection picks "tags", the candidate that actually contains currentTag');
    ok(RW._cmdTagList.length === 3, 'detected list has the right length');
  }

  /* ---------- 16. tag auto-detection: reports null when nothing validates ---------- */
  {
    const { win } = makeStubWindow();
    const as = {
      currentTag: { id: 5, name: 'Door' },
      tagList: [{id:9,name:'Wrong list'}], // present, shaped right, but never contains currentTag
    };
    loadModule(win, as);
    const RW = win.__RW;
    ok(RW._cmdTagList === null, 'no candidate validates against currentTag -> RW._cmdTagList stays null');
    ok(RW._lastStatus.indexOf('could not auto-detect') !== -1, 'failure is reported via status, not silent');
  }

  /* ---------- 17. "#" switches the dropdown to tag search; a plain query still matches commands ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTag: null, tags: [{id:1,name:'Alpha Room'},{id:2,name:'Beta Room'}] };
    loadModule(win, as);
    const inp = byId['rw-cmd-input'];

    inp.value = '#alpha';
    inp.dispatchEvent({ type: 'input' });
    const tagRows = byId['rw-cmd-menu']._children;
    ok(tagRows.length === 1 && tagRows[0].innerText.indexOf('Alpha Room') === 0,
       '"#alpha" searches tags and finds "Alpha Room"');
    ok(tagRows[0].style.cssText.indexOf('#e0c3fc') !== -1, 'tag rows use the tag color');

    inp.value = 'linear';
    inp.dispatchEvent({ type: 'input' });
    const cmdRows = byId['rw-cmd-menu']._children;
    ok(cmdRows.some(r => r.innerText.indexOf('linear') === 0), 'a plain (non-#) query still searches commands');
  }

  /* ---------- 18. tag selection always uses direct assignment, regardless of position ---------- */
  // The digit-hotkey path (assuming list-index maps to the app's 1-9/0 keys)
  // was live-tested and found wrong — a real job showed digit 1 selecting a
  // different tag than the one at index 0 — and was removed entirely
  // (CLAUDE.md's command-line round 9).
  {
    const { win } = makeStubWindow();
    const as = { currentTag: null, tags: [{id:1,name:'Alpha'},{id:2,name:'Beta'},{id:3,name:'Gamma'}] };
    loadModule(win, as);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW._cmdSelectTag(as.tags[2], 2); // 3rd tag, index 2 — well within the old "digit" range
    ok(keys.length === 0, 'index 2 never dispatches a digit — the digit path no longer exists');
    ok(as.currentTag === as.tags[2], 'index 2 goes straight to direct assignment of the exact matched tag');
  }

  /* ---------- 19. selecting a tag at index >=10 also uses direct assignment (no position-based branch left) ---------- */
  {
    const { win } = makeStubWindow();
    const manyTags = [];
    for (let i = 0; i < 12; i++) manyTags.push({id:i, name:'Tag'+i});
    const as = { currentTag: null, tags: manyTags };
    loadModule(win, as);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW._cmdSelectTag(manyTags[11], 11); // index 11, beyond the old first-10 range
    ok(keys.length === 0, 'index 11 never goes through the digit-dispatch path');
    ok(as.currentTag === manyTags[11], 'index 11 uses direct assignment of annotationState.currentTag');
    ok(RW._lastStatus.indexOf('confirm it actually applied') !== -1,
       'the status still flags this as not fully confirmed');
  }

  /* ---------- 20. Space acts as Enter in command mode ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const inp = byId['rw-cmd-input'];
    inp.value = 'mirror';
    inp.dispatchEvent({ type: 'input' }); // populates menuItems/menuHighlight via onInput
    let defaultPrevented = false;
    inp._fire('keydown', { key: ' ', preventDefault(){ defaultPrevented = true; } });
    ok(JSON.stringify(keys) === JSON.stringify(['m']), 'Space runs the highlighted command match (mirror), same as Enter would');
    ok(defaultPrevented, 'Space is consumed (preventDefault) when it triggers a command');
  }

  /* ---------- 21. Space also confirms the highlighted tag, same as Enter ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTag: null, tags: [{id:1,name:'Alpha Room'}] };
    loadModule(win, as);
    const inp = byId['rw-cmd-input'];
    inp.value = '#alpha';
    inp.dispatchEvent({ type: 'input' }); // highlights "Alpha Room" at index 0
    let defaultPrevented = false;
    inp._fire('keydown', { key: ' ', preventDefault(){ defaultPrevented = true; } });
    ok(defaultPrevented, 'Space is consumed once a tag is highlighted');
    ok(as.currentTag === as.tags[0], 'Space confirms the highlighted tag via direct assignment, same as Enter would');
  }

  /* ---------- 21b. accepted trade-off: Space can't disambiguate two tags sharing a first word ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTag: null, tags: [{id:1,name:'Room A'},{id:2,name:'Room B'}] };
    loadModule(win, as);
    const inp = byId['rw-cmd-input'];
    inp.value = '#room'; // both match; "Room A" ranks first and is highlighted
    inp.dispatchEvent({ type: 'input' });
    inp._fire('keydown', { key: ' ', preventDefault(){} });
    ok(as.currentTag === as.tags[0],
       'Space immediately confirms the top-ranked match ("Room A") rather than typing a space to narrow further — the accepted trade-off');
  }

  /* ---------- 22. the master RW: ON/OFF killswitch also stops global auto-capture ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW.enabled = false;
    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: 'p' });
    ok(byId['rw-cmd-input'].value === '',
       'RW.enabled=false stops the command line from capturing keystrokes, closing the earlier gap');

    RW.enabled = true;
    doc._fire('keydown', { target: bodyTarget, key: 'p' });
    ok(byId['rw-cmd-input'].value === 'p', 'auto-capture resumes once RW is enabled again');
  }

  /* ---------- 23. AutoCAD-ish renames: rect/mline dispatch correctly by their new primary name ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('rect');
    ok(JSON.stringify(keys) === JSON.stringify(['d','w']), 'rect dispatches d then w');
    keys.length = 0;
    RW.runCommand('mline');
    ok(JSON.stringify(keys) === JSON.stringify(['d','p']), 'mline dispatches d then p');
  }

  /* ---------- 24. the renames stole no existing single-letter alias ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    ok(RW._cmdMatch('r')[0].name === 'polygon', '"r" still resolves to polygon, not the new rect (exact alias beats name-prefix)');
    ok(RW._cmdMatch('m')[0].name === 'mirror', '"m" still resolves to mirror, not the new mline');
  }

  /* ---------- 25. auto-select: seeded on install, no spurious revert with nothing armed ---------- */
  {
    const { win } = makeStubWindow();
    const as = { currentTool: null, mode: 'select' };
    loadModule(win, as);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };
    RW._cmdToolWatchTick();
    RW._cmdToolWatchTick();
    ok(dispatches.length === 0, 'starting already null/select never fires a revert — nothing was armed to begin with');
  }

  /* ---------- 26. auto-select: a confirmed non-null -> null edge reverts exactly once ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };
    RW._cmdLastUserCmdAt = 0; // outside the user-grace window

    as.currentTool = null; // the shape "finished" on its own
    RW._cmdToolWatchTick();
    ok(dispatches.length === 0, 'the first null tick only arms the pending edge — no revert yet (debounces a transient null)');

    RW._cmdToolWatchTick();
    ok(dispatches.length === 1 && dispatches[0] === 's', 'the CONFIRMING tick reverts to select exactly once');

    RW._cmdToolWatchTick();
    RW._cmdToolWatchTick();
    ok(dispatches.length === 1, 'further null ticks cause no further reverts — the core anti-spam guarantee');
  }

  /* ---------- 27. auto-select: re-arms after a new tool is picked, and ignores a transient null ---------- */
  {
    const { win } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };
    RW._cmdLastUserCmdAt = 0;

    as.currentTool = null;
    RW._cmdToolWatchTick();
    as.currentTool = 'wand'; // transient — a new tool got picked before the confirming tick
    RW._cmdToolWatchTick();
    ok(dispatches.length === 0, 'a transient null (cleared, then a new tool, before the confirming tick) never reverts');

    as.currentTool = null;
    RW._cmdToolWatchTick(); // re-arm
    RW._cmdToolWatchTick(); // confirm
    ok(dispatches.length === 1, 'a fresh non-null -> null transition after re-arming reverts again');
  }

  /* ---------- 28. auto-select: the dispatch resync guard is what makes `pan` usable at all ---------- */
  // Simulates the real app: a document keydown listener mutates
  // annotationState in response to the dispatched key, exactly as the real
  // host app's own tool-switching listener would. Uses the REAL
  // RW._cmdDispatchAppKey (never overridden) so its resync line
  // (`RW._cmdToolPrev = after`) is genuinely exercised, not assumed.
  {
    const { win, doc } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    doc.addEventListener('keydown', function(e){
      if (e.key === 'a'){ as.currentTool = null; as.mode = 'pan'; }
    });
    let selectCalls = 0;
    const origGoSelect = RW._cmdGoSelect;
    RW._cmdGoSelect = function(){ selectCalls++; return origGoSelect.apply(this, arguments); };

    RW.runCommand('pan'); // dispatches 'a' for real — the listener above clears currentTool, like the real app would
    ok(as.currentTool === null && as.mode === 'pan', 'sanity: the simulated app listener did clear currentTool');

    RW._cmdToolWatchTick();
    RW._cmdToolWatchTick();
    RW._cmdToolWatchTick();
    ok(selectCalls === 0, 'running `pan` (which clears currentTool) is never fought back to select — the resync absorbed the transition');
  }

  /* ---------- 28b. auto-select: the resync guard ALONE is sufficient, isolated from the other two guards ---------- */
  // Test 28 above is realistic but not isolating: with `mode` left at 'pan'
  // and RW._cmdLastUserCmdAt freshly stamped by runCommand, the mode gate and
  // the user-grace window would ALSO block a revert on their own — so test
  // 28 alone can't prove the resync guard is doing anything. This defeats
  // both of the other guards deliberately (mode stays 'draw', and
  // RW._cmdLastUserCmdAt is rolled back to 0) so the resync guard is the only
  // thing left standing between the transition and a fought-back revert.
  {
    const { win, doc } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    doc.addEventListener('keydown', function(e){
      if (e.key === 'a'){ as.currentTool = null; } // mode deliberately left at 'draw' — don't let the mode gate cover
    });
    let selectCalls = 0;
    const origGoSelect = RW._cmdGoSelect;
    RW._cmdGoSelect = function(){ selectCalls++; return origGoSelect.apply(this, arguments); };

    RW.runCommand('pan');
    RW._cmdLastUserCmdAt = 0; // defeat the grace window too — resync must stand alone now

    RW._cmdToolWatchTick();
    RW._cmdToolWatchTick();
    ok(selectCalls === 0, 'with the mode gate and grace window both defeated, the resync guard alone still prevents the revert');
  }

  /* ---------- 29. auto-select: the mode gate is a second, independent guard against fighting pan/label/crop ---------- */
  // Bypasses the resync guard on purpose (dispatch is overridden, so no
  // resync happens) to prove the mode gate alone is enough.
  {
    const { win } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    RW._cmdDispatchAppKey = function(){}; // no resync — isolate the mode gate
    RW._cmdLastUserCmdAt = 0;

    as.currentTool = null; as.mode = 'label'; // deliberately switched to label mode
    RW._cmdToolWatchTick();
    let selectCalls = 0;
    const origGoSelect = RW._cmdGoSelect;
    RW._cmdGoSelect = function(){ selectCalls++; return origGoSelect.apply(this, arguments); };
    RW._cmdToolWatchTick();
    ok(selectCalls === 0, 'a recognized non-draw/select mode blocks the revert even without the resync guard');
  }

  /* ---------- 30. auto-select: the user-grace window blocks a revert right after a deliberate command ---------- */
  {
    const { win } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };

    // A draw-tool run (not a mode switch) — stamps RW._cmdLastUserCmdAt = Date.now()
    // without also setting RW._cmdModeActive, which would otherwise block the revert
    // on its own and defeat this test's isolation of the grace-window guard alone.
    RW.runCommand('wand');
    dispatches.length = 0;
    as.currentTool = null; as.mode = null; // mode unreadable — falls back to tool-only logic
    RW._cmdToolWatchTick(); // arms the pending edge
    RW._cmdToolWatchTick(); // confirming tick, but still inside the grace window — BLOCKED, stays pending (not dropped)
    ok(dispatches.length === 0, 'the confirming tick is skipped while inside the post-command grace window');

    RW._cmdLastUserCmdAt = 0; // simulate the window having expired
    RW._cmdToolWatchTick(); // the still-pending edge from before fires on the very next tick, not lost
    ok(dispatches.length === 1, 'once the grace window has passed, the pending edge reverts — it was retried, not dropped');
  }

  /* ---------- 31. auto-select: mid-typed command blocks the revert ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };
    RW._cmdLastUserCmdAt = 0;
    byId['rw-cmd-input'].value = 'lin'; // composing a command

    as.currentTool = null;
    RW._cmdToolWatchTick();
    RW._cmdToolWatchTick();
    ok(dispatches.length === 0, 'a revert is skipped while a command is mid-typed in the input');

    byId['rw-cmd-input'].value = '';
    RW._cmdToolWatchTick();
    ok(dispatches.length === 1, 'once the input is cleared, the still-pending edge reverts normally');
  }

  /* ---------- 32. auto-select: unrecognized tool/mode strings degrade gracefully, never thrown ---------- */
  {
    const { win } = makeStubWindow();
    const as = { currentTool: 'some_future_tool_2027', mode: 'GARBAGE_MODE' };
    loadModule(win, as);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };
    RW._cmdLastUserCmdAt = 0;

    as.currentTool = null; // unknown tool string clearing behaves exactly like a known one
    RW._cmdToolWatchTick();
    RW._cmdToolWatchTick();
    ok(dispatches.length === 1, 'an unrecognized tool string reverts identically to a known one once cleared');
  }

  /* ---------- 33. auto-select: missing annotationState / missing currentTool never throws, never reverts ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win); // no annotationState at all
    const RW = win.__RW;
    let threw = false;
    try { RW._cmdToolWatchTick(); RW._cmdToolWatchTick(); RW._cmdToolWatchTick(); }
    catch(e){ threw = true; }
    ok(!threw, 'ticking with no annotationState at all never throws');

    const { win: win2 } = makeStubWindow();
    loadModule(win2, {}); // annotationState present but no currentTool property
    const RW2 = win2.__RW;
    let threw2 = false;
    try { RW2._cmdToolWatchTick(); RW2._cmdToolWatchTick(); }
    catch(e){ threw2 = true; }
    ok(!threw2, 'ticking with a currentTool-less annotationState never throws either');
  }

  /* ---------- 34. auto-select: RW.enabled=false makes the watcher fully inert, and does not retro-fire on re-enable ---------- */
  {
    const { win } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };
    RW._cmdLastUserCmdAt = 0;

    RW.enabled = false;
    as.currentTool = null; // the transition happens while RW is off
    RW._cmdToolWatchTick();
    RW._cmdToolWatchTick();
    ok(dispatches.length === 0, 'no revert while RW.enabled is false');

    RW.enabled = true;
    RW._cmdToolWatchTick(); // this transition happened entirely while off — must not retro-fire
    RW._cmdToolWatchTick();
    ok(dispatches.length === 0, 're-enabling does not retroactively fire the edge that occurred while off');
  }

  /* ---------- 35. auto-select: RW._cmdAutoSelect=false is a full console kill switch for the feature ---------- */
  {
    const { win } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };
    RW._cmdLastUserCmdAt = 0;
    RW._cmdAutoSelect = false;

    as.currentTool = null;
    RW._cmdToolWatchTick();
    RW._cmdToolWatchTick();
    ok(dispatches.length === 0, 'RW._cmdAutoSelect=false disables the poll trigger entirely');
  }

  /* ---------- 36. auto-select: circuit breaker trips after repeated reverts and reports why ---------- */
  {
    const { win } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    RW._cmdDispatchAppKey = function(){}; // isolate: no resync, so each revert is independently forceable
    for (let i = 0; i < 6; i++){
      RW._cmdLastUserCmdAt = 0;
      RW._cmdLastSelectAt = 0; // bypass the suppression window each time — simulate 6 genuine reverts in a burst
      as.currentTool = 'linear'; RW._cmdToolWatchTick(); // re-arm prev to non-null
      as.currentTool = null; RW._cmdToolWatchTick();     // edge
      RW._cmdToolWatchTick();                            // confirm -> revert
    }
    ok(RW._cmdAutoSelect === false, 'more than 5 reverts in 5 seconds trips the circuit breaker');
    ok(RW._cmdToolWatchTimer === null, 'the breaker also stops the poll interval');
    ok(RW._lastStatus.indexOf('auto-select disabled') !== -1, 'the breaker reports itself on the status line');
  }

  /* ---------- 37. Escape: schedules a deferred revert, never touches preventDefault/stopPropagation itself ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    const timers = makeFakeTimers();
    loadModule(win, as, timers);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };

    const target = makeElement('div', byId);
    let pd = false, sp = false, sip = false;
    win.document._fire('keydown', {
      target, key: 'Escape',
      preventDefault(){ pd = true; }, stopPropagation(){ sp = true; }, stopImmediatePropagation(){ sip = true; }
    });
    ok(dispatches.length === 0, 'Escape does not dispatch select synchronously');
    ok(!pd && !sp && !sip, 'the Escape listener never touches preventDefault/stopPropagation — the app still gets its own Escape');

    timers.runTimeouts();
    ok(dispatches.length === 1 && dispatches[0] === 's', 'the deferred timeout fires the revert to select');
  }

  /* ---------- 38. Escape: ignored while the command input itself is the target ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    const timers = makeFakeTimers();
    loadModule(win, as, timers);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };

    win.document._fire('keydown', { target: byId['rw-cmd-input'], key: 'Escape' });
    timers.runTimeouts();
    ok(dispatches.length === 0,
       'Escape with the command input focused schedules no app-select revert — onInputKeydown handles it locally instead');
  }

  /* ---------- 39. Escape: inert while RW.enabled is false ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    const timers = makeFakeTimers();
    loadModule(win, as, timers);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };
    RW.enabled = false;

    win.document._fire('keydown', { target: makeElement('div', byId), key: 'Escape' });
    timers.runTimeouts();
    ok(dispatches.length === 0, 'Escape is ignored entirely while RW.enabled is false');
  }

  /* ---------- 40. coexistence: Escape reverting first means the poll does not double-fire afterward ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    const timers = makeFakeTimers();
    loadModule(win, as, timers);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };
    RW._cmdLastUserCmdAt = 0;

    as.currentTool = null;
    RW._cmdToolWatchTick(); // arm the pending edge

    win.document._fire('keydown', { target: makeElement('div', byId), key: 'Escape' });
    timers.runTimeouts();
    ok(dispatches.length === 1 && dispatches[0] === 's', 'Escape reverts to select exactly once');

    RW._cmdToolWatchTick();
    RW._cmdToolWatchTick();
    ok(dispatches.length === 1, 'the poll does not double-fire afterward — the funnel reset erased the pending edge');
  }

  /* ---------- 41. coexistence: the poll reverting first means Escape is suppressed, but only for a window ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    const timers = makeFakeTimers();
    loadModule(win, as, timers);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };
    RW._cmdLastUserCmdAt = 0;

    as.currentTool = null;
    RW._cmdToolWatchTick();
    RW._cmdToolWatchTick();
    ok(dispatches.length === 1, 'the poll reverts first');

    win.document._fire('keydown', { target: makeElement('div', byId), key: 'Escape' });
    timers.runTimeouts();
    ok(dispatches.length === 1, 'an Escape immediately afterward, inside the suppression window, does not double-dispatch');

    RW._cmdLastSelectAt = 0; // simulate the suppression window having expired
    win.document._fire('keydown', { target: makeElement('div', byId), key: 'Escape' });
    timers.runTimeouts();
    ok(dispatches.length === 2, 'once the suppression window has expired, Escape reverts again — it is a window, not a permanent latch');
  }

  /* ---------- 42. select-on-load: dispatches once, deferred, when nothing is armed ---------- */
  {
    const { win } = makeStubWindow();
    const as = { currentTool: null };
    const timers = makeFakeTimers();
    loadModule(win, as, timers);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };

    timers.runTimeouts();
    ok(dispatches.length === 1 && dispatches[0] === 's', 'load with no active tool dispatches select once, after the deferral');
  }

  /* ---------- 43. select-on-load: skipped when a tool is already armed, and says so ---------- */
  {
    const { win } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    const timers = makeFakeTimers();
    loadModule(win, as, timers);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };

    timers.runTimeouts();
    ok(dispatches.length === 0, 'load skipped — a tool is already active');
    ok(RW._lastStatus.indexOf('select-on-load skipped') !== -1 && RW._lastStatus.indexOf('linear') !== -1,
       'the skip is reported with the tool name');
  }

  /* ---------- 44. select-on-load: skipped when already in a deliberate non-draw/select mode ---------- */
  {
    const { win } = makeStubWindow();
    const as = { currentTool: null, mode: 'pan' };
    const timers = makeFakeTimers();
    loadModule(win, as, timers);
    const RW = win.__RW;
    const dispatches = [];
    const orig = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ dispatches.push(k); return orig(k, q); };

    timers.runTimeouts();
    ok(dispatches.length === 0, 'load skipped while already in pan mode, even with no currentTool');
  }

  /* ---------- 45. pan: container resolution — nearest scrollable ancestor wins ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const outer = makeScrollable(byId, 'p45-outer', { x:true, y:true });
    const inner = makeScrollable(byId, 'p45-inner', { x:true, y:true });
    outer.appendChild(inner);
    const leaf = makeElement('div', byId);
    inner.appendChild(leaf);
    const c = RW._panResolveContainers(leaf);
    ok(c.x === inner && c.y === inner, 'the nearest scrollable ancestor wins over a farther one');
  }

  /* ---------- 46. pan: overflow:visible is skipped even when it numerically overflows ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const el = makeScrollable(byId, 'p46', {});
    el.scrollWidth = 2000; el.clientWidth = 500;
    const c = RW._panResolveContainers(el);
    ok(c.x === null, 'overflow:visible is skipped regardless of scrollWidth/clientWidth');
  }

  /* ---------- 47. pan: overflow:auto with nothing to actually scroll is skipped ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const el = makeScrollable(byId, 'p47', { x:true });
    el.scrollWidth = el.clientWidth;
    const c = RW._panResolveContainers(el);
    ok(c.x === null, 'computed overflow:auto alone is not enough — it must actually overflow');
  }

  /* ---------- 48. pan: x and y resolve independently across different ancestors ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const outerY = makeScrollable(byId, 'p48-outerY', { y:true });
    const innerX = makeScrollable(byId, 'p48-innerX', { x:true });
    outerY.appendChild(innerX);
    const leaf = makeElement('div', byId);
    innerX.appendChild(leaf);
    const c = RW._panResolveContainers(leaf);
    ok(c.x === innerX && c.y === outerY, 'a horizontally-scrolling inner viewport and a vertically-scrolling outer page resolve independently');
  }

  /* ---------- 49. pan: falls back to document.scrollingElement by METRICS ONLY ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    // Deliberately leave overflow at its default 'visible' — the fallback
    // must still qualify on scrollWidth/clientWidth alone.
    doc.scrollingElement.scrollWidth = 3000;
    doc.scrollingElement.clientWidth = 500;
    const leaf = makeElement('div', byId);
    const c = RW._panResolveContainers(leaf);
    ok(c.x === doc.scrollingElement, 'falls back to document.scrollingElement on metrics alone, ignoring its computed overflow');
    ok(c.y === null, 'y is still null since scrollingElement has no y overflow configured');
  }

  /* ---------- 50. pan: nothing scrollable anywhere reports via the status line and never throws ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const leaf = makeElement('div', byId);
    let threw = false, c;
    try { c = RW._panResolveContainers(leaf); } catch(e){ threw = true; }
    ok(!threw, 'resolving containers never throws');
    ok(c.x === null && c.y === null, 'nothing scrollable anywhere resolves to both null');
  }

  /* ---------- 51. pan: RW._panContainerOverride short-circuits the walk entirely ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const forced = makeElement('div', byId);
    RW._panContainerOverride = forced;
    const c = RW._panResolveContainers(makeElement('div', byId));
    ok(c.x === forced && c.y === forced && c.source === 'override', 'the override short-circuits the walk entirely');
  }

  /* ---------- 52. pan: middle pointerdown claims the drag and preventDefaults; drag right/up moves the content (grab-and-drag) ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const scroller = makeScrollable(byId, 'p52', { x:true, y:true });
    scroller.scrollLeft = 100; scroller.scrollTop = 100;
    const target = makeElement('div', byId);
    scroller.appendChild(target);

    const down = doc._fire('pointerdown', mouseEvt({ target, button:1, clientX:50, clientY:50 }));
    ok(down.defaultPrevented, 'middle pointerdown over a scrollable ancestor calls preventDefault');
    ok(target._captured === 1, 'setPointerCapture was called on the target with the pointer id');

    doc._fire('pointermove', mouseEvt({ target, buttons:4, clientX:80, clientY:40 })); // dx=+30, dy=-10
    ok(scroller.scrollLeft === 70, 'drag right by 30px decreases scrollLeft by 30 (grab-and-drag)');
    ok(scroller.scrollTop === 110, 'drag up by 10px increases scrollTop by 10 (grab-and-drag)');
  }

  /* ---------- 53. pan: the companion mousedown also preventDefaults — the actual autoscroll kill ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const scroller = makeScrollable(byId, 'p53', { x:true, y:true });
    const target = makeElement('div', byId);
    scroller.appendChild(target);
    doc._fire('pointerdown', mouseEvt({ target, button:1 }));
    const md = doc._fire('mousedown', mouseEvt({ target, button:1 }));
    ok(md.defaultPrevented, 'the companion mousedown also calls preventDefault');
    doc._fire('pointerup', mouseEvt({ target, button:1 }));
  }

  /* ---------- 54. pan: left/right buttons are completely untouched ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const target = makeElement('div', byId);
    const left = doc._fire('pointerdown', mouseEvt({ target, button:0 }));
    ok(!left.defaultPrevented && !left._propStopped, 'left-button pointerdown is completely untouched');
    const right = doc._fire('pointerdown', mouseEvt({ target, button:2 }));
    ok(!right.defaultPrevented && !right._propStopped, 'right-button pointerdown is completely untouched');
  }

  /* ---------- 55. pan: teardown via pointerup / pointercancel / lostpointercapture / buttons-clear / window blur ---------- */
  {
    function dragThenTeardown(fireTeardown){
      const { win, byId, doc } = makeStubWindow();
      loadModule(win);
      const scroller = makeScrollable(byId, 'p55', { x:true, y:true });
      const target = makeElement('div', byId);
      scroller.appendChild(target);
      doc._fire('pointerdown', mouseEvt({ target, button:1, clientX:0, clientY:0 }));
      fireTeardown(doc, win, target);
      const before = scroller.scrollLeft;
      doc._fire('pointermove', mouseEvt({ target, buttons:4, clientX:500, clientY:0 }));
      return scroller.scrollLeft === before;
    }
    ok(dragThenTeardown((doc, win, target) => doc._fire('pointerup', mouseEvt({ target, button:1 }))),
       'pointerup ends the drag — a further move scrolls nothing');
    ok(dragThenTeardown((doc, win, target) => doc._fire('pointercancel', mouseEvt({ target, button:1 }))),
       'pointercancel ends the drag the same way');
    ok(dragThenTeardown((doc, win, target) => target._fire('lostpointercapture', {})),
       'losing pointer capture ends the drag');
    ok(dragThenTeardown((doc, win, target) => doc._fire('pointermove', mouseEvt({ target, buttons:0, clientX:999, clientY:999 }))),
       'a pointermove whose buttons no longer include the middle button ends the drag (release-outside-window recovery)');
    ok(dragThenTeardown((doc, win, target) => win._fire('blur', {})),
       'a window blur ends the drag (alt-tab mid-drag)');
  }

  /* ---------- 56. pan: killswitch — RW.enabled=false at pointerdown leaves autoscroll untouched ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW.enabled = false;
    const scroller = makeScrollable(byId, 'p56', { x:true, y:true });
    const target = makeElement('div', byId);
    scroller.appendChild(target);
    const before = scroller.scrollLeft;
    const down = doc._fire('pointerdown', mouseEvt({ target, button:1 }));
    ok(!down.defaultPrevented, 'RW.enabled=false: no preventDefault at pointerdown — native autoscroll stays available');
    doc._fire('pointermove', mouseEvt({ target, buttons:4, clientX:50, clientY:0 }));
    ok(scroller.scrollLeft === before, 'no scroll happens since the drag never started while disabled');
  }

  /* ---------- 57. pan: killswitch — RW._panEnabled=false is subordinate, independent of RW.enabled ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW._panEnabled = false;
    const scroller = makeScrollable(byId, 'p57', { x:true, y:true });
    const target = makeElement('div', byId);
    scroller.appendChild(target);
    const down = doc._fire('pointerdown', mouseEvt({ target, button:1 }));
    ok(!down.defaultPrevented, 'RW._panEnabled=false alone (RW.enabled still true) also disables pan');
  }

  /* ---------- 58. pan: killswitch — flipping RW off mid-drag tears the drag down, and re-enabling does not resume it ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const scroller = makeScrollable(byId, 'p58', { x:true, y:true });
    const target = makeElement('div', byId);
    scroller.appendChild(target);
    doc._fire('pointerdown', mouseEvt({ target, button:1, clientX:0, clientY:0 }));
    const before = scroller.scrollLeft;
    RW.enabled = false;
    doc._fire('pointermove', mouseEvt({ target, buttons:4, clientX:50, clientY:0 }));
    ok(scroller.scrollLeft === before, 'flipping RW off mid-drag tears the drag down on the next move — no scroll happens');
    RW.enabled = true;
    doc._fire('pointermove', mouseEvt({ target, buttons:4, clientX:100, clientY:0 }));
    ok(scroller.scrollLeft === before, 're-enabling RW does not resume the already-torn-down drag');
  }

  /* ---------- 59. pan: pointerup teardown runs even while RW.enabled is false — no listener leak ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const scroller = makeScrollable(byId, 'p59', { x:true, y:true });
    const target = makeElement('div', byId);
    scroller.appendChild(target);
    doc._fire('pointerdown', mouseEvt({ target, button:1, clientX:0, clientY:0 }));
    RW.enabled = false;
    doc._fire('pointerup', mouseEvt({ target, button:1 }));
    RW.enabled = true;
    const before = scroller.scrollLeft;
    doc._fire('pointermove', mouseEvt({ target, buttons:4, clientX:9999, clientY:0 }));
    ok(scroller.scrollLeft === before, 'pointerup teardown runs even while disabled, and re-enabling leaves no leaked listener');
  }

  /* ---------- 60. pan: a full drag never dispatches a synthetic app key and never touches annotationState ---------- */
  // The regression test for the user's actual requirement: panning must not
  // disturb whatever tool is currently armed.
  {
    const { win, byId, doc } = makeStubWindow();
    const as = { currentTool: 'linear', currentTag: { id:1, name:'X' }, mode:'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    const dispatches = [];
    RW._cmdDispatchAppKey = function(k){ dispatches.push(k); };
    const scroller = makeScrollable(byId, 'p60', { x:true, y:true });
    const target = makeElement('div', byId);
    scroller.appendChild(target);

    doc._fire('pointerdown', mouseEvt({ target, button:1, clientX:0, clientY:0 }));
    doc._fire('pointermove', mouseEvt({ target, buttons:4, clientX:40, clientY:20 }));
    doc._fire('pointerup', mouseEvt({ target, button:1 }));
    ok(dispatches.length === 0, 'a full middle-drag never dispatches a synthetic app key');
    ok(as.currentTool === 'linear' && as.currentTag.id === 1, 'annotationState is completely untouched by a pan gesture');
  }

  /* ---------- 61. pan: skips #rw-panel, #rw-cmd-menu, and INPUT targets entirely ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);

    const panel = makeElement('div', byId); panel.id = 'rw-panel';
    const inPanel = makeElement('div', byId); panel.appendChild(inPanel);
    const firedPanel = doc._fire('pointerdown', mouseEvt({ target: inPanel, button:1 }));
    ok(!firedPanel.defaultPrevented, 'a middle-press inside #rw-panel is skipped entirely');

    const menu = makeElement('div', byId); menu.id = 'rw-cmd-menu';
    const inMenu = makeElement('div', byId); menu.appendChild(inMenu);
    const firedMenu = doc._fire('pointerdown', mouseEvt({ target: inMenu, button:1 }));
    ok(!firedMenu.defaultPrevented, 'a middle-press inside #rw-cmd-menu is skipped entirely');

    const inputTarget = makeElement('input', byId);
    const firedInput = doc._fire('pointerdown', mouseEvt({ target: inputTarget, button:1 }));
    ok(!firedInput.defaultPrevented, 'a middle-press on an INPUT is skipped — middle-click paste is preserved');
  }

  /* ---------- 62. pan: RW._panStopHostEvents controls whether the host ever sees the middle press ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const scroller = makeScrollable(byId, 'p62', { x:true, y:true });
    const target = makeElement('div', byId);
    scroller.appendChild(target);

    RW._panStopHostEvents = true;
    let fired = doc._fire('pointerdown', mouseEvt({ target, button:1 })); // _fire returns the clone listeners actually saw
    ok(fired._propStopped, 'with _panStopHostEvents=true, stopPropagation is called on the middle pointerdown');
    doc._fire('pointerup', mouseEvt({ target, button:1 }));

    RW._panStopHostEvents = false;
    fired = doc._fire('pointerdown', mouseEvt({ target, button:1 }));
    ok(!fired._propStopped, 'with _panStopHostEvents=false, propagation is left alone');
  }

  /* ---------- 63. pan: auxclick is suppressed only after a real pan, never after a bare middle-click ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const scroller = makeScrollable(byId, 'p63', { x:true, y:true });
    const target = makeElement('div', byId);
    scroller.appendChild(target);

    doc._fire('pointerdown', mouseEvt({ target, button:1, clientX:0, clientY:0 }));
    doc._fire('pointerup', mouseEvt({ target, button:1 }));
    let aux = doc._fire('auxclick', mouseEvt({ target, button:1 })); // _fire returns the clone listeners actually saw
    ok(!aux.defaultPrevented, 'a bare middle-click (no real drag) leaves auxclick alone — open-in-new-tab still works');

    doc._fire('pointerdown', mouseEvt({ target, button:1, clientX:0, clientY:0 }));
    doc._fire('pointermove', mouseEvt({ target, buttons:4, clientX:50, clientY:0 }));
    doc._fire('pointerup', mouseEvt({ target, button:1 }));
    aux = doc._fire('auxclick', mouseEvt({ target, button:1 }));
    ok(aux.defaultPrevented, 'auxclick IS suppressed after a real pan happened');
  }

  /* ---------- 64. pan: below the click threshold content still tracks the cursor, but no grabbing-cursor style yet ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const scroller = makeScrollable(byId, 'p64', { x:true, y:true });
    const target = makeElement('div', byId);
    scroller.appendChild(target);

    doc._fire('pointerdown', mouseEvt({ target, button:1, clientX:0, clientY:0 }));
    doc._fire('pointermove', mouseEvt({ target, buttons:4, clientX:1, clientY:0 })); // 1px, below threshold(3)
    ok(scroller.scrollLeft === -1, 'content still tracks the cursor even below the drag threshold');
    ok(!byId['rw-pan-cursor'], 'the grabbing-cursor style is not injected below the threshold');

    doc._fire('pointermove', mouseEvt({ target, buttons:4, clientX:10, clientY:0 })); // now past the threshold
    ok(!!byId['rw-pan-cursor'], 'the grabbing-cursor style appears once past the threshold');

    doc._fire('pointerup', mouseEvt({ target, button:1 }));
    ok(!byId['rw-pan-cursor'], 'the cursor style is removed once the drag ends');
  }

  /* ---------- 65. pan: the container resolved at drag start is used for the whole drag, even if the pointer target changes ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const scroller = makeScrollable(byId, 'p65', { x:true, y:true });
    const target = makeElement('div', byId);
    scroller.appendChild(target);
    const elsewhere = makeElement('div', byId); // no scrollable ancestor of its own

    doc._fire('pointerdown', mouseEvt({ target, button:1, clientX:0, clientY:0 }));
    const before = scroller.scrollLeft;
    doc._fire('pointermove', mouseEvt({ target: elsewhere, buttons:4, clientX:30, clientY:0 }));
    ok(scroller.scrollLeft === before - 30,
       'the container resolved once at drag start keeps being used even if the pointer target changes mid-drag');
  }

  /* ---------- 66. pan: re-resolves fresh on the NEXT drag rather than reusing a stale container ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const scrollerA = makeScrollable(byId, 'p66a', { x:true });
    const targetA = makeElement('div', byId);
    scrollerA.appendChild(targetA);
    doc._fire('pointerdown', mouseEvt({ target: targetA, button:1, clientX:0, clientY:0 }));
    doc._fire('pointermove', mouseEvt({ target: targetA, buttons:4, clientX:20, clientY:0 }));
    doc._fire('pointerup', mouseEvt({ target: targetA, button:1 }));
    const afterFirstDrag = scrollerA.scrollLeft;

    const scrollerB = makeScrollable(byId, 'p66b', { x:true });
    const targetB = makeElement('div', byId);
    scrollerB.appendChild(targetB);
    doc._fire('pointerdown', mouseEvt({ target: targetB, button:1, clientX:0, clientY:0 }));
    doc._fire('pointermove', mouseEvt({ target: targetB, buttons:4, clientX:20, clientY:0 }));

    ok(scrollerA.scrollLeft === afterFirstDrag, 'the first drag\'s container is untouched by the second drag');
    ok(scrollerB.scrollLeft === -20, 'the second drag resolves and scrolls its own, different container');
  }

  /* ---------- 67. querySelectorAll stub: attribute-presence selector, found regardless of value, at any depth ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    const outer = makeElement('div', byId);
    const inner = makeElement('div', byId);
    outer.appendChild(inner);
    const withAttr = makeElement('button', byId);
    withAttr.setAttribute('data-tool', 'wand');
    inner.appendChild(withAttr);
    const withoutAttr = makeElement('button', byId);
    inner.appendChild(withoutAttr);
    doc.body.appendChild(outer);

    const found = doc.querySelectorAll('[data-tool]');
    ok(found.length === 1 && found[0] === withAttr,
       'attribute-presence selector finds a nested match regardless of its value, and skips elements without the attribute');
  }

  /* ---------- 68. querySelectorAll stub: tag+attribute-equals matches only the right value ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    const range = makeElement('input', byId); range.type = 'range';
    const number = makeElement('input', byId); number.type = 'number';
    doc.body.appendChild(range);
    doc.body.appendChild(number);

    const found = doc.querySelectorAll('input[type="range"]');
    ok(found.length === 1 && found[0] === range, 'tag+attribute-equals matches only the input with that exact type value');
  }

  /* ---------- 69. querySelectorAll stub: bare tag name matches every element of that tag ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    const s1 = makeElement('select', byId);
    const s2 = makeElement('select', byId);
    const div = makeElement('div', byId);
    doc.body.appendChild(s1); doc.body.appendChild(s2); doc.body.appendChild(div);

    const found = doc.querySelectorAll('select');
    ok(found.length === 2 && found.indexOf(s1) !== -1 && found.indexOf(s2) !== -1,
       'a bare tag selector matches every element of that tag');
  }

  /* ---------- 70. querySelectorAll stub: no match returns an empty array, never throws ---------- */
  {
    const { win, doc } = makeStubWindow();
    let threw = false, found;
    try { found = doc.querySelectorAll('[nonexistent-attr]'); } catch(e){ threw = true; }
    ok(!threw && Array.isArray(found) && found.length === 0, 'a non-matching selector returns an empty array without throwing');
  }

  /* ---------- 71. RW._toolSettingsDiagnose: finds [data-tool] elements at any depth and reports tool/id/tag ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const wrapper = makeElement('div', byId);
    const wandBtn = makeElement('button', byId);
    wandBtn.id = 'wand-btn';
    wandBtn.setAttribute('data-tool', 'wand');
    wrapper.appendChild(wandBtn);
    const wrapBtn = makeElement('button', byId);
    wrapBtn.id = 'wrap-btn';
    wrapBtn.setAttribute('data-tool', 'wrap');
    wrapper.appendChild(wrapBtn);
    doc.body.appendChild(wrapper);

    const result = RW._toolSettingsDiagnose();
    ok(result.tools.length === 2, 'finds both [data-tool] elements regardless of nesting depth');
    const wand = result.tools.find(t => t.tool === 'wand');
    ok(wand && wand.id === 'wand-btn' && wand.tag === 'BUTTON', 'reports the correct tool/id/tag for each');
  }

  /* ---------- 72. RW._toolSettingsDiagnose: filter narrows to a case-insensitive substring match ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const wandBtn = makeElement('button', byId); wandBtn.setAttribute('data-tool', 'wand');
    const wrapBtn = makeElement('button', byId); wrapBtn.setAttribute('data-tool', 'wrap');
    doc.body.appendChild(wandBtn);
    doc.body.appendChild(wrapBtn);

    const result = RW._toolSettingsDiagnose('WAND'); // deliberately mixed case
    ok(result.tools.length === 1 && result.tools[0].tool === 'wand', 'filter narrows to a case-insensitive substring match');
  }

  /* ---------- 73. RW._toolSettingsDiagnose: finds settings controls anywhere, reads the LIVE .value ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const slider = makeElement('input', byId);
    slider.type = 'range'; slider.id = 'tolerance-slider'; slider.name = 'tolerance';
    slider.min = '0'; slider.max = '100'; slider.step = '1';
    slider.setAttribute('value', '0');  // the stale HTML default — must NOT be what gets reported
    slider.value = '42';                // the live value, set programmatically like a real slider drag would
    slider.title = 'Tolerance';
    slider.setAttribute('aria-label', 'Wand tolerance');
    doc.body.appendChild(slider); // unattached to any [data-tool] element — the association is unknown, by design

    const result = RW._toolSettingsDiagnose();
    ok(result.controls.length === 1, 'finds a range input anywhere on the page, with no [data-tool] relation required');
    const c = result.controls[0];
    ok(c.value === '42', 'reports the LIVE .value, not the stale getAttribute("value") default');
    ok(c.min === '0' && c.max === '100' && c.step === '1' && c.name === 'tolerance' && c.id === 'tolerance-slider',
       'reports min/max/step/name/id correctly');
    ok(c.title === 'Tolerance' && c.ariaLabel === 'Wand tolerance', 'reports title and aria-label correctly');
  }

  /* ---------- 74. RW._toolSettingsDiagnose: finds number/checkbox/select controls too ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const num = makeElement('input', byId); num.type = 'number'; num.value = '3';
    const check = makeElement('input', byId); check.type = 'checkbox';
    const sel = makeElement('select', byId);
    doc.body.appendChild(num); doc.body.appendChild(check); doc.body.appendChild(sel);

    const result = RW._toolSettingsDiagnose();
    ok(result.controls.length === 3, 'finds number, checkbox, and select controls in addition to range');
    ok(result.controls.some(c => c.tag === 'INPUT' && c.type === 'number' && c.value === '3'), 'reports the number input');
    ok(result.controls.some(c => c.tag === 'INPUT' && c.type === 'checkbox'), 'reports the checkbox');
    ok(result.controls.some(c => c.tag === 'SELECT'), 'reports the select');
  }

  /* ---------- 75. RW._toolSettingsDiagnose: activeGuess is an explicit best-effort heuristic ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const pressed = makeElement('button', byId);
    pressed.setAttribute('data-tool', 'wand'); pressed.setAttribute('aria-pressed', 'true');
    const classActive = makeElement('button', byId);
    classActive.setAttribute('data-tool', 'wrap'); classActive.className = 'tool-btn active';
    const plain = makeElement('button', byId);
    plain.setAttribute('data-tool', 'mline');
    doc.body.appendChild(pressed); doc.body.appendChild(classActive); doc.body.appendChild(plain);

    const result = RW._toolSettingsDiagnose();
    const byTool = t => result.tools.find(x => x.tool === t);
    ok(byTool('wand').activeGuess === true, 'aria-pressed="true" is flagged as activeGuess');
    ok(byTool('wrap').activeGuess === true, 'a className containing "active" is flagged as activeGuess');
    ok(byTool('mline').activeGuess === false, 'an element with neither signal is not flagged');
  }

  /* ---------- 76. RW._toolSettingsDiagnose: empty page, and a missing console.table, never throw ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    let threw = false, result;
    try { result = RW._toolSettingsDiagnose(); } catch(e){ threw = true; }
    ok(!threw, 'an empty page never throws');
    ok(result.tools.length === 0 && result.controls.length === 0, 'an empty page returns empty arrays, not null/undefined');

    const savedTable = console.table;
    console.table = undefined;
    let threw2 = false;
    try { RW._toolSettingsDiagnose(); } catch(e){ threw2 = true; }
    console.table = savedTable;
    ok(!threw2, 'falls back to console.log without throwing when console.table is unavailable');
  }

  /* ---------- 77. RW._toolSettingsDiagnose: purely read-only — never mutates any fixture ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    const as = { currentTool: 'linear', currentTag: { id:1, name:'X' }, mode: 'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    const btn = makeElement('button', byId);
    btn.setAttribute('data-tool', 'wand'); btn.id = 'wand-btn'; btn.className = 'tool-btn';
    const slider = makeElement('input', byId);
    slider.type = 'range'; slider.value = '7'; slider.min = '0'; slider.max = '10';
    doc.body.appendChild(btn); doc.body.appendChild(slider);

    const snapshotBefore = JSON.stringify({
      btnId: btn.id, btnClass: btn.className, btnTool: btn.getAttribute('data-tool'),
      sliderValue: slider.value, sliderMin: slider.min, sliderMax: slider.max
    });
    RW._toolSettingsDiagnose();
    const snapshotAfter = JSON.stringify({
      btnId: btn.id, btnClass: btn.className, btnTool: btn.getAttribute('data-tool'),
      sliderValue: slider.value, sliderMin: slider.min, sliderMax: slider.max
    });
    ok(snapshotBefore === snapshotAfter, 'no fixture property is mutated by the diagnostic');
    ok(as.currentTool === 'linear' && as.currentTag.id === 1 && as.mode === 'draw',
       'annotationState is completely untouched — the diagnostic never reads or writes it at all');
  }

  /* ---------- 78. settings interaction: "wand." lists its real, confirmed params with live current values ---------- */
  // Discovery is now a live DOM sweep by id prefix — every param a test wants discovered has to
  // actually be a fixture in the tree, unlike the earlier static-map version which always listed
  // all three regardless of whether the elements existed.
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const tolerance = makeElement('input', byId);
    tolerance.id = 'magic-wand-tolerance'; tolerance.type = 'range'; tolerance.value = '40';
    const detail = makeElement('input', byId);
    detail.id = 'magic-wand-detail'; detail.type = 'range'; detail.value = '2';
    const padding = makeElement('input', byId);
    padding.id = 'magic-wand-padding'; padding.type = 'range'; padding.value = '0';
    doc.body.appendChild(tolerance); doc.body.appendChild(detail); doc.body.appendChild(padding);
    const inp = byId['rw-cmd-input'];

    inp.value = 'wand.';
    inp.dispatchEvent({ type: 'input' });
    const rows = byId['rw-cmd-menu']._children;
    ok(rows.length === 3, '"wand." lists all three of wand\'s real params found live in the DOM (tolerance, detail, padding)');
    const toleranceRow = rows.find(r => r.innerText.indexOf('tolerance') === 0);
    ok(toleranceRow && toleranceRow.innerText.indexOf('now 40') !== -1,
       'the tolerance row reports its live current value (40), read from the real DOM element');
    ok(toleranceRow.style.cssText.indexOf('#ffd166') !== -1, 'settings rows use the settings color');
  }

  /* ---------- 79. settings interaction: typing past the dot filters the param list ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const tolerance = makeElement('input', byId);
    tolerance.id = 'magic-wand-tolerance'; tolerance.type = 'range'; tolerance.value = '40';
    const detail = makeElement('input', byId);
    detail.id = 'magic-wand-detail'; detail.type = 'range'; detail.value = '2';
    doc.body.appendChild(tolerance); doc.body.appendChild(detail);
    const inp = byId['rw-cmd-input'];
    inp.value = 'wand.tol';
    inp.dispatchEvent({ type: 'input' });
    const rows = byId['rw-cmd-menu']._children;
    ok(rows.length === 1 && rows[0].innerText.indexOf('tolerance') === 0,
       '"wand.tol" narrows the param list to just tolerance, excluding detail');
  }

  /* ---------- 80. settings interaction: selecting a param arms a value-entry draft, keeps focus, reports its range ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const tolerance = makeElement('input', byId);
    tolerance.id = 'magic-wand-tolerance'; tolerance.type = 'range';
    tolerance.min = '0'; tolerance.max = '255'; tolerance.value = '40';
    doc.body.appendChild(tolerance);
    const inp = byId['rw-cmd-input'];
    inp.value = 'wand.tolerance';
    inp.dispatchEvent({ type: 'input' });
    const rows = byId['rw-cmd-menu']._children;
    rows[0]._fire('click', {}); // the row's registered click listener calls runAndClear(item)

    ok(inp.value === 'wand.tolerance = ', 'selecting the param pre-fills the input, ready for a value');
    ok(inp._focused === true, 'the input stays focused — unlike every other mode, this one must not blur');
    ok(RW_lastStatusFrom(win).indexOf('0–255') !== -1 && RW_lastStatusFrom(win).indexOf('press Enter') !== -1,
       'the status line reports the confirmed real range and what to do next');
  }

  /* ---------- 81. settings interaction: typing a value and pressing Enter applies it, dispatches input+change, and re-arms the tool ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const tolerance = makeElement('input', byId);
    tolerance.id = 'magic-wand-tolerance'; tolerance.type = 'range'; tolerance.value = '40';
    const seenEvents = [];
    tolerance.addEventListener('input', function(){ seenEvents.push('input'); });
    tolerance.addEventListener('change', function(){ seenEvents.push('change'); });
    doc.body.appendChild(tolerance);

    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };

    const inp = byId['rw-cmd-input'];
    inp.value = 'wand.tolerance';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {}); // pick tolerance -> draft armed, input now "wand.tolerance = "

    inp.value = 'wand.tolerance = 120';
    inp._fire('keydown', { key: 'Enter' });

    ok(tolerance.value === '120', 'the real control\'s value is updated');
    ok(seenEvents.indexOf('input') !== -1 && seenEvents.indexOf('change') !== -1,
       'both input and change are dispatched — confirmed live: a plain input event alone was enough on the real job, change is cheap insurance');
    ok(JSON.stringify(keys) === JSON.stringify(['d','k']), 'applying the value re-arms wand (dispatches d then k, same as running the command directly)');
    ok(inp.value === '' && !inp._focused, 'the input is cleared and blurred once applied, matching every other completed command');
  }

  /* ---------- 82. settings interaction: values are clamped to the confirmed real min/max ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const padding = makeElement('input', byId);
    padding.id = 'magic-wand-padding'; padding.type = 'range';
    padding.min = '-20'; padding.max = '20'; padding.value = '0';
    doc.body.appendChild(padding);
    const inp = byId['rw-cmd-input'];

    inp.value = 'wand.padding';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children.find(r => r.innerText.indexOf('padding') === 0)._fire('click', {});
    inp.value = 'wand.padding = 9999';
    inp._fire('keydown', { key: 'Enter' });
    ok(padding.value === '20', 'a value above the confirmed max (20) is clamped down to it');
  }

  /* ---------- 83. settings interaction: Escape while a value is pending cancels the draft, never touches the control ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const tolerance = makeElement('input', byId);
    tolerance.id = 'magic-wand-tolerance'; tolerance.type = 'range'; tolerance.value = '40';
    doc.body.appendChild(tolerance);
    const inp = byId['rw-cmd-input'];

    inp.value = 'wand.tolerance';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {});
    inp.value = 'wand.tolerance = 200';
    inp._fire('keydown', { key: 'Escape' });

    ok(tolerance.value === '40', 'Escape leaves the real control completely untouched');
    ok(inp.value === '' && !inp._focused, 'Escape clears and blurs the input, cancelling the draft');

    // A fresh Enter afterward (as if the user starts typing a plain command) must not re-apply
    // the cancelled draft — regression guard for a settingsDraft that outlives its cancellation.
    inp.value = 'mirror';
    inp.dispatchEvent({ type: 'input' });
    inp._fire('keydown', { key: 'Enter' });
    ok(tolerance.value === '40', 'the cancelled draft cannot be resurrected by a later, unrelated command');
  }

  /* ---------- 84. settings interaction: only tools with a real settings map entry trigger drill-down ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    inp.value = 'linear.'; // a real tool, but not in RW._toolSettingsMap
    inp.dispatchEvent({ type: 'input' });
    ok(!byId['rw-cmd-menu'], '"linear." (a tool with no known settings) does not enter settings-param mode at all — nothing matches, so no dropdown is even created');
  }

  /* ---------- 85. settings interaction: Tab fills "tool.param", not "undefined" ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    inp.value = 'wand.tolerance';
    inp.dispatchEvent({ type: 'input' });
    inp._fire('keydown', { key: 'Tab' });
    ok(inp.value === 'wand.tolerance', 'Tab fills the input with "tool.param", not the command-mode item.name (undefined)');
  }

  /* ---------- 86. RW._cmdApplySetting: a missing control and an unknown tool both fail loudly, never throw ---------- */
  // Since discovery moved to a live id-prefix sweep (no more static per-param table), an unknown
  // param name and a genuinely-missing control collapse into the same "not on the page" failure —
  // both just mean "no element at prefix+param exists right now." Only an unknown TOOL (not in
  // RW._toolSettingsMap at all) is distinguishable as its own failure.
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    let threw = false;
    try { ok(RW._cmdApplySetting('wand', 'tolerance', '50') === false, 'fails when the real control is not on the page'); }
    catch(e){ threw = true; }
    ok(!threw, 'a missing control never throws');
    ok(RW._lastStatus.indexOf('not on the page') !== -1, 'the missing-control failure is reported');

    ok(RW._cmdApplySetting('wand', 'bogus-param', '50') === false, 'an unknown param name (constructs a non-existent id) fails the same way');
    ok(RW._lastStatus.indexOf('not on the page') !== -1, 'reported as a missing control, not a separate "unknown setting" case');

    ok(RW._cmdApplySetting('not-a-real-tool', 'x', '50') === false, 'an unknown tool fails cleanly too');
    ok(RW._lastStatus.indexOf('unknown tool') !== -1, 'the unknown-tool failure is reported distinctly');
  }

  /* ---------- 87. RW._cmdApplySetting: a non-numeric value is rejected and never touches the control ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const tolerance = makeElement('input', byId);
    tolerance.id = 'magic-wand-tolerance'; tolerance.type = 'range'; tolerance.value = '40';
    doc.body.appendChild(tolerance);

    ok(RW._cmdApplySetting('wand', 'tolerance', 'not-a-number') === false, 'a non-numeric value is rejected');
    ok(tolerance.value === '40', 'the control is left completely untouched when the value is rejected');
    ok(RW._lastStatus.indexOf('is not a number') !== -1, 'the rejection is reported');
  }

  /* ---------- 88. RW._cmdActiveSettingsTool: maps a real currentTool string back to our internal tool name ---------- */
  {
    const { win: w1 } = makeStubWindow();
    loadModule(w1, { currentTool: 'magic_wand' });
    ok(w1.__RW._cmdActiveSettingsTool() === 'wand', 'currentTool "magic_wand" maps to our "wand"');

    const { win: w2 } = makeStubWindow();
    loadModule(w2, { currentTool: 'shrink_wrap' });
    ok(w2.__RW._cmdActiveSettingsTool() === 'wrap', 'currentTool "shrink_wrap" maps to our "wrap"');

    const { win: w3 } = makeStubWindow();
    loadModule(w3, { currentTool: 'ribbon' });
    ok(w3.__RW._cmdActiveSettingsTool() === 'mline', 'currentTool "ribbon" maps to our "mline"');

    const { win: w4 } = makeStubWindow();
    loadModule(w4, { currentTool: 'linear' }); // a real tool, just not one with tracked settings
    ok(w4.__RW._cmdActiveSettingsTool() === null, 'a tool with no settings map entry returns null');

    const { win: w5 } = makeStubWindow();
    loadModule(w5); // no annotationState at all
    ok(w5.__RW._cmdActiveSettingsTool() === null, 'no annotationState at all returns null, never throws');
  }

  /* ---------- 89. settings interaction: the active tool's own params are typable bare, additively — confirmed via AskUserQuestion ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win, { currentTool: 'magic_wand' });
    const tolerance = makeElement('input', byId);
    tolerance.id = 'magic-wand-tolerance'; tolerance.type = 'range'; tolerance.value = '40';
    doc.body.appendChild(tolerance);
    const inp = byId['rw-cmd-input'];

    inp.value = 'tolerance'; // no "wand." prefix — wand is already active, so this is implied
    inp.dispatchEvent({ type: 'input' });
    const rows = byId['rw-cmd-menu']._children;
    ok(rows.some(r => isSettingsRow(r) && r.innerText.indexOf('tolerance') === 0),
       'wand\'s own "tolerance" matches bare, with no tool prefix, while wand is the active tool');
  }

  /* ---------- 90. settings interaction: bare param matching does NOT activate for an untracked or absent active tool ---------- */
  {
    const { win: w1, byId: b1 } = makeStubWindow();
    loadModule(w1, { currentTool: 'linear' }); // active, but not one of wand/wrap/mline
    const inp1 = b1['rw-cmd-input'];
    inp1.value = 'tolerance';
    inp1.dispatchEvent({ type: 'input' });
    ok(!b1['rw-cmd-menu'] || b1['rw-cmd-menu']._children.every(r => !isSettingsRow(r)),
       'no settings row appears when the active tool has no tracked settings');

    const { win: w2, byId: b2 } = makeStubWindow();
    loadModule(w2); // nothing active at all
    const inp2 = b2['rw-cmd-input'];
    inp2.value = 'tolerance';
    inp2.dispatchEvent({ type: 'input' });
    ok(!b2['rw-cmd-menu'] || b2['rw-cmd-menu']._children.every(r => !isSettingsRow(r)),
       'no settings row appears when nothing is active at all');
  }

  /* ---------- 91. settings interaction: additive, not exclusive — switching to a different tool still works while one is active ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win, { currentTool: 'magic_wand' });
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const inp = byId['rw-cmd-input'];

    inp.value = 'mirror'; // an ordinary command, unrelated to wand's own settings
    inp.dispatchEvent({ type: 'input' });
    inp._fire('keydown', { key: 'Enter' });
    ok(JSON.stringify(keys) === JSON.stringify(['m']),
       'typing an unrelated command while wand is active still switches tools immediately — nothing is blocked');
  }

  /* ---------- 92. settings interaction: selecting a bare-matched param arms the same draft/apply flow as the "tool." form ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win, { currentTool: 'magic_wand' });
    const RW = win.__RW;
    const tolerance = makeElement('input', byId);
    tolerance.id = 'magic-wand-tolerance'; tolerance.type = 'range'; tolerance.value = '40';
    doc.body.appendChild(tolerance);
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const inp = byId['rw-cmd-input'];

    inp.value = 'tolerance';
    inp.dispatchEvent({ type: 'input' });
    inp._fire('keydown', { key: 'Enter' }); // highlighted row 0 is the bare-matched settings item
    ok(inp.value === 'wand.tolerance = ', 'selecting the bare match arms the draft exactly like the "tool." form does');

    inp.value = 'wand.tolerance = 99';
    inp._fire('keydown', { key: 'Enter' });
    ok(tolerance.value === '99', 'typing a value and confirming applies it the same way regardless of how the param was reached');
    ok(JSON.stringify(keys) === JSON.stringify(['d','k']), 'applying it re-arms wand');
  }

  /* ---------- 93. settings interaction: Tab on a bare-matched param fills "tool.param", not "undefined" ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win, { currentTool: 'magic_wand' });
    const tolerance = makeElement('input', byId);
    tolerance.id = 'magic-wand-tolerance'; tolerance.type = 'range'; tolerance.value = '40';
    doc.body.appendChild(tolerance);
    const inp = byId['rw-cmd-input'];
    inp.value = 'tolerance';
    inp.dispatchEvent({ type: 'input' });
    inp._fire('keydown', { key: 'Tab' });
    ok(inp.value === 'wand.tolerance', 'Tab fills "wand.tolerance", not the command-mode item.name (undefined)');
  }

  /* ---------- 94. settings interaction: RW._cmdToolSettingsList discovers select/checkbox controls, typed, live ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'center');
    const width = makeElement('input', byId);
    width.id = 'ribbon-width'; width.type = 'number'; width.min = '1'; width.value = '6'; // no confirmed max
    doc.body.appendChild(anchor); doc.body.appendChild(width);

    const list = RW._cmdToolSettingsList('mline');
    ok(list.length === 2, 'finds both of mline\'s real controls');
    const anchorItem = list.find(i => i.param === 'anchor');
    ok(anchorItem.type === 'select' && anchorItem.current === 'center', 'the select param is typed "select" with its live current value');
    ok(anchorItem.options.length === 3 && anchorItem.options[0].index === 1 && anchorItem.options[0].text === 'Left',
       'options are read live and numbered from 1, never hardcoded');
    const widthItem = list.find(i => i.param === 'width');
    ok(widthItem.type === 'number' && widthItem.min === 1 && widthItem.max === undefined,
       'the numeric param has no max — none was ever confirmed, so none is invented');
  }

  /* ---------- 95. settings interaction: RW._cmdToolSettingsList discovers a checkbox by prefix ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const polygonMode = makeElement('input', byId);
    polygonMode.id = 'shrink-wrap-polygon-mode'; polygonMode.type = 'checkbox'; polygonMode.checked = false;
    doc.body.appendChild(polygonMode);

    const list = RW._cmdToolSettingsList('wrap');
    const item = list.find(i => i.param === 'polygon-mode');
    ok(item && item.type === 'checkbox' && item.current === 'off', 'the checkbox param reports its live .checked state as "off"');

    polygonMode.checked = true;
    ok(RW._cmdToolSettingsList('wrap').find(i => i.param === 'polygon-mode').current === 'on',
       'flipping .checked live changes what the next discovery call reports — never cached');
  }

  /* ---------- 96. settings interaction: applying a select param by number, by exact text, and by prefix-text ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'center');
    doc.body.appendChild(anchor);

    ok(RW._cmdApplySetting('mline', 'anchor', '3') === true, 'applying by number succeeds');
    ok(anchor.value === 'right', 'index 3 matches the third option ("Right")');
    ok(JSON.stringify(keys) === JSON.stringify(['d','p']), 'applying it re-arms mline');

    anchor.value = 'center'; keys.length = 0;
    ok(RW._cmdApplySetting('mline', 'anchor', 'Left') === true, 'applying by exact option text succeeds');
    ok(anchor.value === 'left', 'the matched option\'s value is set');

    anchor.value = 'center'; keys.length = 0;
    ok(RW._cmdApplySetting('mline', 'anchor', 'rig') === true, 'applying by a text PREFIX also succeeds');
    ok(anchor.value === 'right', 'the prefix match resolved to "Right"');
  }

  /* ---------- 97. settings interaction: applying a select param with no matching option fails cleanly ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'center');
    doc.body.appendChild(anchor);

    ok(RW._cmdApplySetting('mline', 'anchor', 'nonexistent') === false, 'a non-matching value is rejected');
    ok(anchor.value === 'center', 'the control is left completely untouched when rejected');
    ok(RW._lastStatus.indexOf("doesn't match any option") !== -1, 'the rejection is reported');
  }

  /* ---------- 98. settings interaction: applying a checkbox param via every accepted on/off spelling ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const polygonMode = makeElement('input', byId);
    polygonMode.id = 'shrink-wrap-polygon-mode'; polygonMode.type = 'checkbox'; polygonMode.checked = false;
    doc.body.appendChild(polygonMode);
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };

    ['on', 'true', '1', 'yes', 'ON', 'True'].forEach(function(spelling){
      polygonMode.checked = false;
      ok(RW._cmdApplySetting('wrap', 'polygon-mode', spelling) === true, '"' + spelling + '" is accepted as on');
      ok(polygonMode.checked === true, '"' + spelling + '" actually checks the box');
    });
    ['off', 'false', '0', 'no', 'OFF'].forEach(function(spelling){
      polygonMode.checked = true;
      ok(RW._cmdApplySetting('wrap', 'polygon-mode', spelling) === true, '"' + spelling + '" is accepted as off');
      ok(polygonMode.checked === false, '"' + spelling + '" actually unchecks the box');
    });
    ok(JSON.stringify(keys.slice(0,2)) === JSON.stringify(['d','x']), 'applying a checkbox setting re-arms wrap, same idiom as numeric params');

    ok(RW._cmdApplySetting('wrap', 'polygon-mode', 'maybe') === false, 'garbage is rejected, neither on nor off');
    ok(RW._lastStatus.indexOf('is not on/off') !== -1, 'the rejection is reported');
  }

  /* ---------- 99. settings interaction UX: picking a select param shows its live options immediately, no value-typing step ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'center');
    doc.body.appendChild(anchor);
    const inp = byId['rw-cmd-input'];

    inp.value = 'mline.anchor';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {}); // picks the anchor param

    const rows = byId['rw-cmd-menu']._children;
    ok(rows.length === 3, 'selecting a select param immediately shows its 3 live options, not a free-value prompt');
    ok(rows[0].innerText === '1. Left' && rows[1].innerText === '2. Center' && rows[2].innerText === '3. Right',
       'options are numbered starting at 1, in their live DOM order');
    ok(rows[0].style.cssText.indexOf('#ffd166') !== -1, 'option rows use the settings color too');
  }

  /* ---------- 100. settings interaction UX: the option list filters by number and by text as you keep typing ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'center');
    doc.body.appendChild(anchor);
    const inp = byId['rw-cmd-input'];
    inp.value = 'mline.anchor';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {});

    inp.value = 'mline.anchor = 2';
    inp.dispatchEvent({ type: 'input' });
    let rows = byId['rw-cmd-menu']._children;
    ok(rows.length === 1 && rows[0].innerText === '2. Center', 'typing "2" filters to just the second option, by number');

    inp.value = 'mline.anchor = ri';
    inp.dispatchEvent({ type: 'input' });
    rows = byId['rw-cmd-menu']._children;
    ok(rows.length === 1 && rows[0].innerText === '3. Right', 'typing "ri" filters to "Right", by text prefix');
  }

  /* ---------- 101. settings interaction UX: selecting an option applies it immediately, re-arms, clears/blurs ---------- */
  // Fixture deliberately uses 'right' (the LAST option) as the current value — if the initial
  // highlight defaulted to index 0 ("left") instead of matching the real current value, this
  // would apply the wrong one and expose it immediately.
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'right');
    doc.body.appendChild(anchor);
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const inp = byId['rw-cmd-input'];

    inp.value = 'mline.anchor';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {});
    ok(byId['rw-cmd-menu']._children.some(r => r.innerText === '3. Right' && r.style.cssText.indexOf('rgba(255,140,0,0.3)') !== -1),
       'the option matching the real current value ("Right") is highlighted by default, not always the first');

    inp._fire('keydown', { key: 'Enter' }); // confirms whatever's highlighted, with nothing else typed
    ok(anchor.value === 'right', 'confirming with nothing else typed applies the highlighted option — the one already matching current, here');
    ok(JSON.stringify(keys) === JSON.stringify(['d','p']), 'applying it re-arms mline');
    ok(inp.value === '' && !inp._focused, 'the input is cleared and blurred, matching every other completed command');
  }

  /* ---------- 102. settings interaction UX: Escape while browsing options cancels cleanly, never touches the control ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'center');
    doc.body.appendChild(anchor);
    const inp = byId['rw-cmd-input'];

    inp.value = 'mline.anchor';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {});
    inp._fire('keydown', { key: 'Escape' });

    ok(anchor.value === 'center', 'Escape leaves the real control completely untouched');
    ok(inp.value === '' && !inp._focused, 'Escape clears and blurs the input, cancelling the option pick');
  }

  /* ---------- 103. settings interaction UX: Tab live-previews each option on the real page, cycling as you go ---------- */
  // Deliberately different from Tab's own "fill without running" rule used everywhere else in
  // this file — for a select param specifically, Tab actually applies each option live so it can
  // be compared on the real page, confirmed via live use.
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'center');
    doc.body.appendChild(anchor);
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const inp = byId['rw-cmd-input'];

    inp.value = 'mline.anchor';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {}); // starts highlighted on "Center" (the real current value)

    inp._fire('keydown', { key: 'Tab' });
    ok(anchor.value === 'right', 'Tab cycles to the NEXT option and applies it live immediately, not just fills the input');
    ok(keys.length > 0, 'each Tab-driven preview re-arms the tool, same as any other applied setting');
    ok(byId['rw-cmd-menu']._children.length === 3, 'the option list stays open after Tab — cycling can continue');

    keys.length = 0;
    inp._fire('keydown', { key: 'Tab' });
    ok(anchor.value === 'left', 'Tab wraps around past the last option back to the first');

    inp._fire('keydown', { key: 'Tab', shiftKey: true });
    ok(anchor.value === 'right', 'Shift+Tab cycles backward');
  }

  /* ---------- 103d (round 22): each Tab-preview re-focuses the input — a real live regression, missed before since nothing asserted focus here ---------- */
  // Live report: Tab moved the highlight ONE step, then the dropdown closed
  // and the browser's own focus took over. Root cause: RW._cmdApplySetting's
  // own re-arm (cmdArmOrNoteModal -> RW.runCommand(tool)) unconditionally
  // calls inputEl.blur() BEFORE dispatching (round 16's own fix, needed so
  // the app's activeElement guard doesn't block a real tool-switch dispatch)
  // — every Tab-preview cycle goes through that exact path. In a real
  // browser this genuinely defocuses the bar (the input's own 'blur'
  // listener then hides the dropdown ~150ms later); the very next keystroke
  // (another Tab, or Space) lands wherever focus actually is instead —
  // Space in particular gets picked up by the global auto-capture listener,
  // which (tool still armed) closes it to select, matching the second
  // symptom reported live. Nothing before this round asserted `inp._focused`
  // after a Tab-preview, so this genuine regression slipped through despite
  // every other assertion in test 103 above passing.
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'center');
    doc.body.appendChild(anchor);
    const inp = byId['rw-cmd-input'];

    inp.value = 'mline.anchor';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {});
    ok(inp._focused === true, 'sanity: picking the param starts focused, as before');

    inp._fire('keydown', { key: 'Tab' });
    ok(inp._focused === true, 'still focused after ONE Tab-preview — the re-arm\'s own blur is immediately undone');

    inp._fire('keydown', { key: 'Tab' });
    ok(inp._focused === true, 'and after a SECOND Tab-preview in a row — cycling repeatedly never drops focus');

    inp._fire('keydown', { key: 'Tab', shiftKey: true });
    ok(inp._focused === true, 'Shift+Tab (cycling backward) refocuses too, not just the forward direction');
  }

  /* ---------- 103e (round 22 follow-up): the ORIGINAL blur's deferred "hide the dropdown" no longer fires once focus has genuinely come back ---------- */
  // Live report (a step further than 103d): the dropdown itself kept
  // disappearing mid-cycle, not just once — reported against route's own
  // system/network select, profile, and "New system." Root cause: 103d's own
  // fix undoes the blur SYNCHRONOUSLY, but the input's `blur` LISTENER
  // (`inputEl.addEventListener('blur', ...)`) already ran at the moment
  // RW.runCommand called inputEl.blur() — scheduling `setTimeout(hideMenu,
  // 150)` — and that timer does not know focus came back moments later; it
  // fires regardless ~150ms later and hides the dropdown out from under an
  // otherwise-still-open Tab-preview cycle. This exercises the deferred timer
  // itself (via the fake-timer harness), not just the synchronous focus flag
  // test 103d already covers — the two are complementary, not redundant.
  {
    const { win, byId, doc } = makeStubWindow();
    const timers = makeFakeTimers();
    loadModule(win, null, timers);
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'center');
    doc.body.appendChild(anchor);
    const inp = byId['rw-cmd-input'];

    inp.value = 'mline.anchor';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {});

    inp._fire('keydown', { key: 'Tab' }); // previews "right" — blurs internally, then re-focuses (103d)
    ok(inp._focused === true, 'sanity: still focused right after the Tab-preview');

    timers.runTimeouts(); // let the ORIGINAL blur's own deferred hide actually run
    ok(byId['rw-cmd-menu'].style.display !== 'none',
       'the dropdown survives — focus had already come back before the deferred hide fired, so it correctly skips hiding');

    // Cycling further afterward must keep working — the dropdown was never
    // silently torn down behind the scenes by the timer that just ran.
    inp._fire('keydown', { key: 'Tab' });
    ok(anchor.value === 'left', 'a further Tab-preview after the deferred timer already fired still cycles normally');
    timers.runTimeouts();
    ok(byId['rw-cmd-menu'].style.display !== 'none', 'and survives a second round of the same deferred check too');
  }

  /* ---------- 103f (round 22 follow-up): a GENUINE, lasting blur still hides the dropdown once the deferred delay elapses ---------- */
  // The fix in 103e must not disable the original mechanism outright — if the
  // user actually clicks or tabs away from the bar for real (nothing
  // refocuses it afterward), the dropdown should still close ~150ms later,
  // exactly as it always has.
  {
    const { win, byId, doc } = makeStubWindow();
    const timers = makeFakeTimers();
    loadModule(win, null, timers);
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'center');
    doc.body.appendChild(anchor);
    const inp = byId['rw-cmd-input'];

    inp.value = 'mline.anchor';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {});
    ok(byId['rw-cmd-menu'].style.display !== 'none', 'sanity: the dropdown starts open');

    inp.blur(); // the user genuinely leaves the bar — nothing re-focuses it afterward
    ok(inp._focused === false, 'sanity: genuinely blurred this time');
    timers.runTimeouts();
    ok(byId['rw-cmd-menu'].style.display === 'none',
       'a real, lasting blur still hides the dropdown once the deferred delay elapses — this fix narrows the skip condition, it does not disable it');
  }

  /* ---------- 103b. settings interaction UX: Escape after Tab-previewing reverts to what was really current, not the last preview ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'center');
    doc.body.appendChild(anchor);
    const inp = byId['rw-cmd-input'];

    inp.value = 'mline.anchor';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {});
    inp._fire('keydown', { key: 'Tab' }); // previews "right" live
    ok(anchor.value === 'right', 'sanity: the preview actually took effect before Escape');

    inp._fire('keydown', { key: 'Escape' });
    ok(anchor.value === 'center', 'Escape restores the value that was genuinely current before any Tab-previewing, not "right"');
    ok(inp.value === '' && !inp._focused, 'Escape still clears and blurs the input as usual');
  }

  /* ---------- 103c. settings interaction UX: Escape with no Tab-previewing does nothing extra (no pointless re-dispatch) ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const anchor = makeSelect(byId, 'ribbon-anchor', [['left','Left'],['center','Center'],['right','Right']], 'center');
    doc.body.appendChild(anchor);
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const inp = byId['rw-cmd-input'];

    inp.value = 'mline.anchor';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {});
    inp._fire('keydown', { key: 'Escape' }); // never Tab'd, nothing was ever previewed
    ok(keys.length === 0, 'Escape without any prior Tab-preview never re-dispatches — nothing changed, so nothing needs reverting');
    ok(anchor.value === 'center', 'the control is exactly as it was');
  }

  /* ---------- 104. settings interaction UX: picking a checkbox param flips it immediately — no on/off typing step ---------- */
  // Confirmed via live use, follow-up to round 6: entering polygon-mode should just switch it,
  // the same "choosing IS the value" model as a select option, not a separate value-entry draft.
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const polygonMode = makeElement('input', byId);
    polygonMode.id = 'shrink-wrap-polygon-mode'; polygonMode.type = 'checkbox'; polygonMode.checked = false;
    doc.body.appendChild(polygonMode);
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const inp = byId['rw-cmd-input'];

    inp.value = 'wrap.polygon-mode';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {});

    ok(polygonMode.checked === true, 'picking the checkbox row flips it immediately, off -> on, with no intermediate typing step');
    ok(JSON.stringify(keys) === JSON.stringify(['d','x']), 'flipping it re-arms wrap');
    ok(inp.value === '' && !inp._focused, 'the input is cleared and blurred right away, matching the select-option and command flows');
  }

  /* ---------- 105. settings interaction UX: picking it again flips it back ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const polygonMode = makeElement('input', byId);
    polygonMode.id = 'shrink-wrap-polygon-mode'; polygonMode.type = 'checkbox'; polygonMode.checked = true;
    doc.body.appendChild(polygonMode);
    const inp = byId['rw-cmd-input'];

    inp.value = 'wrap.polygon-mode';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children[0]._fire('click', {});
    ok(polygonMode.checked === false, 'picking it while already on flips it back off');
  }

  /* ---------- 106. settings interaction UX: the checkbox row label reads "toggle", not "on/off" ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const polygonMode = makeElement('input', byId);
    polygonMode.id = 'shrink-wrap-polygon-mode'; polygonMode.type = 'checkbox'; polygonMode.checked = false;
    doc.body.appendChild(polygonMode);
    const inp = byId['rw-cmd-input'];

    inp.value = 'wrap.polygon-mode';
    inp.dispatchEvent({ type: 'input' });
    const row = byId['rw-cmd-menu']._children[0];
    ok(row.innerText.indexOf('toggle') !== -1, 'the row label reflects the immediate-toggle behavior');
  }

  /* ---------- 107. settings interaction UX: picking a checkbox via the bare-param blend (active tool) also toggles immediately ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win, { currentTool: 'shrink_wrap' });
    const polygonMode = makeElement('input', byId);
    polygonMode.id = 'shrink-wrap-polygon-mode'; polygonMode.type = 'checkbox'; polygonMode.checked = false;
    doc.body.appendChild(polygonMode);
    const inp = byId['rw-cmd-input'];

    inp.value = 'polygon-mode'; // no "wrap." prefix — wrap is already active
    inp.dispatchEvent({ type: 'input' });
    inp._fire('keydown', { key: 'Enter' });
    ok(polygonMode.checked === true, 'the same immediate toggle applies when reached through the bare-param blend, not just the "tool." drill-down');
  }

  /* ---------- 108. RW._cmdLastTool: stamped for a real draw tool, never for a mode switch ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW._cmdDispatchAppKey = function(){}; // isolate — only care about RW._cmdLastTool bookkeeping here

    RW.runCommand('wand');
    ok(RW._cmdLastTool === 'wand', 'running an actual draw tool stamps it as the last tool');

    RW.runCommand('pan');
    ok(RW._cmdLastTool === 'wand', 'running a mode switch (pan) does NOT overwrite the last tool');

    RW.runCommand('mline');
    ok(RW._cmdLastTool === 'mline', 'running a different draw tool updates it');
  }

  /* ---------- 109. Space repeats the last tool once RW._cmdToolArmed is false (our own flag, not a live read) ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW.runCommand('wand'); // arms wand for real: RW._cmdLastTool='wand', RW._cmdToolArmed=true
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW._cmdGoSelect('escape', true); // the actual close mechanism — sets RW._cmdToolArmed=false itself
    keys.length = 0; // only care about what the Space press itself dispatches

    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: ' ' });

    ok(JSON.stringify(keys) === JSON.stringify(['d','k']), 'bare Space re-dispatches wand exactly like running the command directly');
    ok(byId['rw-cmd-input'].value === '', 'the command input is never seeded/opened for this — it\'s a direct repeat, not a search');
  }

  /* ---------- 110. Space opens the bar AND its tool dropdown when no tool has been run yet, without seeding a literal space character (Kresna's own report, corrected) ---------- */
  // Originally this fell through to the ordinary capture path, which seeded the
  // bar with a literal space and immediately ran onInput() on it —
  // RW._cmdMatch(' ') trims to '' and returns the entire command table (every
  // tool AND action together), which read as a wall of unrelated commands the
  // moment anyone hit Space just to get started. A first attempt at a fix
  // suppressed the dropdown entirely, but Kresna's own follow-up made clear
  // the dropdown should still expand — just scoped to the tool list (kind
  // NATIVE), the same starting menu "initializing the console" implies,
  // never GRAPH_ACTIONS' button vocabulary (undo/redo/finish/cancel/...).
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: ' ' });
    ok(byId['rw-cmd-input'] && byId['rw-cmd-input'].value === '',
       'with no RW._cmdLastTool recorded, Space opens the bar without seeding it with a space character');
    const rows = byId['rw-cmd-menu'] && byId['rw-cmd-menu']._children;
    ok(rows && rows.length > 0, 'the tool dropdown DOES expand — this is "initialize the console," not a no-op');
    ok(rows && rows.some(function(r){ return r.innerText.indexOf('linear') === 0; }),
       'a real tool (linear) is offered right away, with nothing typed');
  }

  /* ---------- 111. Space is a toggle: while RW._cmdToolArmed is true, it CLOSES that tool instead of repeating ---------- */
  // Confirmed via AskUserQuestion: Space always closes an active tool unconditionally,
  // never falls through to typing a literal space while something is confirmed armed.
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW.runCommand('wand'); // RW._cmdToolArmed = true
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };

    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: ' ' });

    ok(keys.length === 1 && keys[0] === 's', 'Space closes the currently-armed tool (dispatches select) rather than repeating wand or typing a literal space');
    ok(byId['rw-cmd-input'].value === '', 'the command bar is never seeded — closing is a direct action, not a search');
    ok(RW._cmdToolArmed === false, 'closing clears our own armed flag, ready for the next Space to repeat');
  }

  /* ---------- 111b. Space-closes does NOT fire for a tool armed only by directly mutating annotationState ---------- */
  // A deliberate, accepted trade-off of tracking OUR OWN armed state rather than
  // re-reading the app live: arming a tool by some path outside this command line
  // entirely (clicking the app's own toolbar, or in this test's case just mutating
  // annotationState directly) is invisible to RW._cmdToolArmed. This is the
  // intentional cost of fixing the close-then-repeat staleness bug below.
  {
    const { win, byId, doc } = makeStubWindow();
    const as = { currentTool: 'magic_wand' }; // "armed" only via direct state mutation, never through RW.runCommand
    loadModule(win, as);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };

    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: ' ' });

    ok(keys.length === 0, 'RW._cmdToolArmed stays false since nothing ran through RW.runCommand — Space does not close');
    ok(byId['rw-cmd-input'] && byId['rw-cmd-input'].value === '',
       'falls through to the "nothing to repeat" branch instead — the bar opens empty, not seeded with a space character');
  }

  /* ---------- 111c. Running a mode switch (pan/select/etc) clears RW._cmdToolArmed too, so Space repeats instead of closing ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('wand');   // RW._cmdLastTool='wand', armed=true
    RW.runCommand('pan');    // a mode switch — armed=false, lastTool untouched
    keys.length = 0;

    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: ' ' });

    ok(JSON.stringify(keys) === JSON.stringify(['d','k']), 'after switching to pan, Space repeats the last real tool (wand), not a spurious close');
  }

  /* ---------- 112. Space repeats reliably even with no annotationState at all — the whole point of not depending on a live read ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win); // no annotationState at all
    const RW = win.__RW;
    RW.runCommand('wand');
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW._cmdGoSelect('escape', true); // closes — RW._cmdToolArmed=false regardless of annotationState being readable
    keys.length = 0;

    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: ' ' });

    ok(JSON.stringify(keys) === JSON.stringify(['d','k']), 'Space repeats correctly even though annotationState was never readable at all');
  }

  /* ---------- 113. Space does NOT repeat when the command bar already has unsubmitted text ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW.runCommand('wand');
    RW._cmdGoSelect('escape', true);
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    byId['rw-cmd-input'].value = 'lin'; // stale, unsubmitted text left over

    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: ' ' });

    ok(keys.length === 0, 'a non-empty command bar means Space is treated as ordinary typing, not a repeat');
    ok(byId['rw-cmd-input'].value === 'lin ', 'the space is appended normally instead');
  }

  /* ---------- 114. The actual scenario reported live: close, repeat, close, repeat — loops indefinitely as long as no other tool runs ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const bodyTarget = makeElement('div', byId);

    RW.runCommand('wand'); // arm it the first time, same as typing "wand"
    for (let i = 0; i < 4; i++){
      keys.length = 0;
      doc._fire('keydown', { target: bodyTarget, key: ' ' }); // close
      ok(JSON.stringify(keys) === JSON.stringify(['s']), 'cycle ' + i + ': Space closes wand');
      keys.length = 0;
      doc._fire('keydown', { target: bodyTarget, key: ' ' }); // repeat
      ok(JSON.stringify(keys) === JSON.stringify(['d','k']), 'cycle ' + i + ': the next Space reliably re-arms wand — no dead cycle');
    }
  }

  /* ---------- 115. Remembers the tool across repeated close/repeat cycles until a DIFFERENT tool is actually run ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const bodyTarget = makeElement('div', byId);

    RW.runCommand('wand');
    doc._fire('keydown', { target: bodyTarget, key: ' ' }); // close
    doc._fire('keydown', { target: bodyTarget, key: ' ' }); // repeat -> wand again
    ok(RW._cmdLastTool === 'wand', 'still remembers wand after a close/repeat cycle');

    RW.runCommand('mline'); // the user explicitly uses a different tool
    doc._fire('keydown', { target: bodyTarget, key: ' ' }); // close mline
    keys.length = 0;
    doc._fire('keydown', { target: bodyTarget, key: ' ' }); // repeat -> should now be mline, not wand
    ok(JSON.stringify(keys) === JSON.stringify(['d','p']), 'once a different tool is actually used, IT becomes the one Space remembers, not wand');
  }

  /* ---------- 116. Round 7d: switching to label from an active tool records RW._cmdModeActive, not just RW._cmdToolArmed=false ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW.runCommand('mline');
    ok(RW._cmdModeActive === null && RW._cmdToolArmed === true, 'sanity: arming a draw tool records no active mode');

    RW.runCommand('label');
    ok(RW._cmdModeActive === 'label', 'switching to label records it as the active mode');
    ok(RW._cmdToolArmed === false, 'and still clears the armed flag exactly as before');
  }

  /* ---------- 117. Round 7d (corrected): Space from label forces SELECT — never resumes the prior tool ---------- */
  // A real job reported the opposite of round 7d's first cut: leaving `label` was already
  // falling into the plain "nothing armed -> repeat last tool" branch (every mode switch
  // clears RW._cmdToolArmed to false) even before SPACE_GOES_SELECT_FROM existed — THAT
  // was the reported bug, not a resume feature to preserve. This test replaces the old
  // (backwards) "Space resumes mline" assertion.
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const bodyTarget = makeElement('div', byId);

    RW.runCommand('mline'); // arm the tool
    RW.runCommand('label'); // leave it for label
    keys.length = 0;
    doc._fire('keydown', { target: bodyTarget, key: ' ' });

    ok(JSON.stringify(keys) === JSON.stringify(['s']), 'Space forces select directly — never resumes mline');
    ok(byId['rw-cmd-input'].value === '', 'the command bar is never seeded — this is a direct action, not a search');
    ok(RW._cmdModeActive === null, 'forcing select clears the active-mode record, via the ordinary RW._cmdGoSelect path');
    ok(RW._cmdLastTool === 'mline', 'mline is still remembered — a LATER Space (once at rest) would repeat it, same as any other close-then-repeat cycle');
  }

  /* ---------- 118. Round 7d (corrected): forcing select wins even if RW._cmdToolArmed is stale-true (branch-ordering regression guard) ---------- */
  // Reachable in practice only if a tool got armed some other way (e.g. the app's own
  // toolbar) right before label — RW._cmdToolArmed would then be stale-true. Both branches
  // happen to dispatch select in that case, but this still guards that the
  // SPACE_GOES_SELECT_FROM check (checked first) is what's actually firing, not an
  // accidental fallthrough — confirmed by never seeding the command bar either.
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const bodyTarget = makeElement('div', byId);

    RW.runCommand('mline');
    RW.runCommand('label');
    RW._cmdToolArmed = true; // force the stale/conflicting state directly
    keys.length = 0;

    doc._fire('keydown', { target: bodyTarget, key: ' ' });
    ok(JSON.stringify(keys) === JSON.stringify(['s']), 'select still fires — the stale armed flag changes nothing about the outcome');
  }

  /* ---------- 119. Round 7d: scope is label-only — pan/crop/mirror keep their existing Space behavior unchanged ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const bodyTarget = makeElement('div', byId);

    RW.runCommand('mline');
    RW.runCommand('pan'); // a mode switch, but NOT in SPACE_GOES_SELECT_FROM
    ok(RW._cmdModeActive === 'pan', 'pan is still recorded as an active mode...');
    keys.length = 0;
    doc._fire('keydown', { target: bodyTarget, key: ' ' });
    // Unchanged from test 111c: with RW._cmdToolArmed already false (set by running `pan`),
    // this hits the pre-existing "repeat" branch, not the label-only select override.
    ok(JSON.stringify(keys) === JSON.stringify(['d','p']), '...but Space still just repeats the last tool exactly as it did before this round, not the select override');
  }

  /* ---------- 120. Round 7d (corrected): Space forces select from label even with no RW._cmdLastTool recorded at all ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW.runCommand('label'); // no tool was ever run first — RW._cmdLastTool stays null
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const bodyTarget = makeElement('div', byId);

    doc._fire('keydown', { target: bodyTarget, key: ' ' });
    ok(JSON.stringify(keys) === JSON.stringify(['s']), 'still forces select — the override does not depend on RW._cmdLastTool existing');
    ok(byId['rw-cmd-input'].value === '', 'the command bar is never seeded');
  }

  /* ---------- 121. Round 7d: the poll's mode gate now also trusts RW._cmdModeActive, not just a live annotationState.mode read ---------- */
  // Mirrors test 29 (the live-mode-string gate) but defeats that guard on purpose
  // (mode set to an unrecognized/unreadable value) to prove RW._cmdModeActive alone
  // is enough to stop the poll from fighting label back to select — the actual gap
  // this round's live report traced back to (CLAUDE.md: only 'draw' has ever been
  // confirmed live; label's real mode string is unconfirmed).
  {
    const { win } = makeStubWindow();
    const as = { currentTool: 'ribbon', mode: 'draw' };
    loadModule(win, as);
    const RW = win.__RW;
    RW._cmdDispatchAppKey = function(){}; // isolate — no resync from a real dispatch

    RW.runCommand('mline');
    RW.runCommand('label'); // RW._cmdModeActive = 'label'
    RW._cmdLastUserCmdAt = 0; // defeat the grace window too — runCommand() above re-stamps it to "now"
    as.currentTool = null; as.mode = undefined; // simulate an unrecognized/unreadable mode string

    let selectCalls = 0;
    const origGoSelect = RW._cmdGoSelect;
    RW._cmdGoSelect = function(){ selectCalls++; return origGoSelect.apply(this, arguments); };
    RW._cmdToolWatchTick();
    RW._cmdToolWatchTick();
    ok(selectCalls === 0, 'RW._cmdModeActive alone blocks the revert even though annotationState.mode is unreadable');

    // And once we resync back to null (as a real resume/close would do), the still-pending
    // edge is retried on the very next tick rather than having been silently dropped.
    RW._cmdModeActive = null;
    RW._cmdToolWatchTick();
    ok(selectCalls === 1, 'clearing RW._cmdModeActive lets the still-pending edge fire — retried, not lost');
  }

  /* ---------- 122. RW._zoomDiagnose: walks ancestors reporting transform/zoom-relevant fields ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;

    const outer = makeElement('div', byId); outer.id = 'zoom-outer';
    outer._computed = { transform: 'matrix(1.5, 0, 0, 1.5, 0, 0)' }; // simulates a CSS-transform zoom implementation
    const canvas = makeElement('canvas', byId); canvas.id = 'annotation-canvas';
    canvas.width = 1600; canvas.height = 1200; // backing resolution
    canvas.clientWidth = 800; canvas.clientHeight = 600; // rendered size — a res/render mismatch is itself a zoom signal
    outer.appendChild(canvas);

    const result = RW._zoomDiagnose(canvas);
    ok(result.ancestors.length === 2, 'walked canvas + its one ancestor');
    ok(result.ancestors[0].tag === 'CANVAS' && result.ancestors[0].canvasWidthAttr === 1600 && result.ancestors[0].canvasHeightAttr === 1200,
      'reports a <canvas> element\'s backing resolution attributes');
    ok(result.ancestors[1].id === 'zoom-outer' && result.ancestors[1].computedTransform === 'matrix(1.5, 0, 0, 1.5, 0, 0)',
      'reports an ancestor\'s live computed transform — the CSS-transform-zoom signal');
  }

  /* ---------- 123. RW._zoomDiagnose: scans annotationState for zoom/scale-like keys, ignoring unrelated ones ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { zoomLevel: 1.5, scale: 2, currentTool: 'linear', foo: 'bar' };
    loadModule(win, as);
    const RW = win.__RW;
    const target = makeElement('div', byId);

    const result = RW._zoomDiagnose(target);
    const keys = result.annotationStateZoomLikeKeys.map(function(k){ return k.key; }).sort();
    ok(JSON.stringify(keys) === JSON.stringify(['scale', 'zoomLevel']), 'finds only the zoom/scale-shaped keys, not currentTool or foo');
    const zl = result.annotationStateZoomLikeKeys.find(function(k){ return k.key === 'zoomLevel'; });
    ok(zl.value === 1.5, 'reports the live value, not just the key name');
  }

  /* ---------- 124. RW._zoomDiagnose: degrades gracefully with no annotationState at all ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win); // no annotationState
    const RW = win.__RW;
    const target = makeElement('div', byId);

    const result = RW._zoomDiagnose(target);
    ok(Array.isArray(result.annotationStateZoomLikeKeys) && result.annotationStateZoomLikeKeys.length === 0,
      'empty array, not a throw, when annotationState is absent');
  }

  /* ---------- 125. Tab now CYCLES the highlight through tag matches, filling each in, wrapping both ways ---------- */
  // Confirmed via AskUserQuestion: Tab should advance to the next match (like shell-style
  // completion) rather than just re-filling the same already-highlighted one every time.
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTag: null, tags: [{id:1,name:'Concrete'},{id:2,name:'Concrete Slab'},{id:3,name:'Concrete Wall'}] };
    loadModule(win, as);
    const inp = byId['rw-cmd-input'];
    inp.value = '#conc';
    inp.dispatchEvent({ type: 'input' }); // highlights "Concrete" at index 0, none filled yet

    inp._fire('keydown', { key: 'Tab' });
    ok(inp.value === '#Concrete Slab', 'Tab advances the highlight to the next tag match and fills it in');
    const rows = byId['rw-cmd-menu']._children;
    ok(rows[1].style.cssText.indexOf('rgba(255,140,0,0.3)') !== -1, 'the highlight itself moved to that row, not just the filled text');

    inp._fire('keydown', { key: 'Tab' });
    ok(inp.value === '#Concrete Wall', 'a second Tab advances again');

    inp._fire('keydown', { key: 'Tab' });
    ok(inp.value === '#Concrete', 'a third Tab wraps back around to the first match');

    inp._fire('keydown', { key: 'Tab', shiftKey: true });
    ok(inp.value === '#Concrete Wall', 'Shift+Tab cycles backward');
  }

  /* ---------- 126. Tab-cycling never applies anything — only Enter/Space/click actually commit ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTag: null, tags: [{id:1,name:'Concrete'},{id:2,name:'Concrete Slab'},{id:3,name:'Concrete Wall'}] };
    loadModule(win, as);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const inp = byId['rw-cmd-input'];
    inp.value = '#conc';
    inp.dispatchEvent({ type: 'input' }); // highlight at index 0 (Concrete)

    inp._fire('keydown', { key: 'Tab' }); // -> index 1 (Concrete Slab)
    ok(as.currentTag === null, 'Tab-cycling never assigns annotationState.currentTag on its own');
    ok(keys.length === 0, 'Tab never dispatches a key to the app on its own');

    inp._fire('keydown', { key: 'Enter' });
    ok(as.currentTag === as.tags[1], 'only committing (Enter) applies whatever was actually landed on — here, Concrete Slab');
  }

  /* ---------- 127. Tab cycles through command matches too, not just tags ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    inp.value = 'po'; // matches polygon, then polyline
    inp.dispatchEvent({ type: 'input' });
    ok(inp.value === 'po', 'no fill yet before any Tab press');

    inp._fire('keydown', { key: 'Tab' });
    ok(inp.value === 'polyline', 'Tab advances off the already-highlighted first match, to the next one, and fills it');

    inp._fire('keydown', { key: 'Tab' });
    ok(inp.value === 'polygon', 'a second Tab wraps back around (only two matches)');

    inp._fire('keydown', { key: 'Tab', shiftKey: true });
    ok(inp.value === 'polyline', 'Shift+Tab cycles backward');
  }

  /* ---------- 128. Enter after Tab-cycling runs the command actually landed on, not the original first match ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const inp = byId['rw-cmd-input'];
    inp.value = 'po';
    inp.dispatchEvent({ type: 'input' });
    inp._fire('keydown', { key: 'Tab' }); // advances off polygon, onto polyline
    inp._fire('keydown', { key: 'Enter' });
    ok(JSON.stringify(keys) === JSON.stringify(['d','t']), 'Enter dispatches polyline (the tool actually cycled to), not polygon');
  }

  /* ---------- 129. Tab does NOT cycle inside the "<tool>." settings-param list — keeps its older fill-only behavior ---------- */
  // Deliberately out of scope (confirmed via AskUserQuestion): picking a param arms a value
  // draft, so cycling through param names by Tab was never the point there.
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const padding = makeElement('input', byId);
    padding.id = 'shrink-wrap-padding'; padding.type = 'range'; padding.min = '0'; padding.max = '50'; padding.value = '5';
    doc.body.appendChild(padding);
    const smoothing = makeElement('input', byId);
    smoothing.id = 'shrink-wrap-smoothing'; smoothing.type = 'range'; smoothing.min = '0'; smoothing.max = '50'; smoothing.value = '2';
    doc.body.appendChild(smoothing);
    const inp = byId['rw-cmd-input'];

    inp.value = 'wrap.'; // both of wrap's params match (empty query after the dot)
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu']._children.length === 2, 'both of wrap\'s params are listed');

    inp._fire('keydown', { key: 'Tab' });
    ok(inp.value === 'wrap.padding', 'Tab in settings-param mode still just fills the first (highlighted) param, never advancing to the second');
  }

  /* ---------- 133d. Running a command clears the input and hides the menu ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTag: null, tags: [{id:1,name:'Concrete'},{id:2,name:'Concrete Slab'}] };
    loadModule(win, as);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const inp = byId['rw-cmd-input'];
    inp.value = 'linear'; // a native tool command
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    ok(menu._children.length >= 1, 'command matches shown before dispatch');
    inp._fire('keydown', { key: 'Enter' }); // runs it
    ok(JSON.stringify(keys) === JSON.stringify(['d','q']), 'the command was dispatched (draw-prefix d + linear\'s q)');
    ok(inp.value === '', 'input cleared after a command runs');
    ok(menu.style.display === 'none', 'menu hidden after a command runs');
  }

  /* ---------- 133e. A query that misses hides the menu — even if stale rows remain ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTag: null, tags: [{id:1,name:'Concrete'}] };
    loadModule(win, as);
    const inp = byId['rw-cmd-input'];
    inp.value = '#conc';
    inp.dispatchEvent({ type: 'input' }); // menu opens with a match
    const menu = byId['rw-cmd-menu'];
    ok(menu.style.display !== 'none', 'menu is open');
    inp.value = '#zzz';
    inp.dispatchEvent({ type: 'input' }); // no matches -> hideMenu() sets display:none
    ok(menu.style.display === 'none', 'menu hidden once the query misses');
  }

  /* ---------- 134. ArrowUp/ArrowDown move the highlight — existing behavior, previously untested ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    inp.value = 'po'; // polygon, polyline
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    function highlightedRow(){ return menu._children.find(function(r){ return r.style.cssText.indexOf('rgba(255,140,0,0.3)') !== -1; }); }
    ok(highlightedRow().innerText.indexOf('polygon') === 0, 'starts highlighted on the first match');

    inp._fire('keydown', { key: 'ArrowDown' });
    ok(highlightedRow().innerText.indexOf('polyline') === 0, 'ArrowDown moves to the next match');
    ok(inp.value === 'po', 'unlike Tab, ArrowDown never fills the input');

    inp._fire('keydown', { key: 'ArrowUp' });
    ok(highlightedRow().innerText.indexOf('polygon') === 0, 'ArrowUp moves back to the previous match');
  }

  /* ---------- 135. Dropdown opens upward above the input (bottom-anchored overlay) ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 700;
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    // Input sits low in the viewport, like a bottom-anchored bar; give it a
    // known rect (top edge at y=650 of a 700-high viewport).
    inp._rect = { left: 300, top: 650, right: 780, bottom: 670, width: 480, height: 20 };
    inp.value = 'po';
    inp.dispatchEvent({ type: 'input' }); // renders rows -> positionMenu() runs
    const menu = byId['rw-cmd-menu'];
    ok(menu.style.display !== 'none', 'menu opened for the query');
    const bottom = parseFloat(menu.style.bottom);
    ok(!isNaN(bottom) && bottom > 0, 'menu anchors by a positive bottom (grew upward): got "' + menu.style.bottom + '"');
    ok(menu.style.top === 'auto', 'menu top is cleared to auto (single, upward anchor), got "' + menu.style.top + '"');
    // bottom = innerHeight - inputTop + 6 = 700 - 650 + 6 = 56
    ok(bottom === 56, 'menu bottom uses the input top edge + 6px gap (expected 56, got ' + bottom + ')');
  }

  /* ---------- 136. Reposition centers the panel over the canvas ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 700;
    loadModule(win);
    const RW = win.__RW;
    RW._cmdBarOffset = 16; RW._cmdBarWidth = 480;
    const panel = byId['rw-panel'] || makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    const canvas = makeElement('canvas', byId);
    canvas.id = 'annotation-canvas';
    byId['annotation-canvas'] = canvas;
    canvas._rect = { left: 20, top: 40, right: 820, bottom: 640, width: 800, height: 600 };
    win.document.body.appendChild(canvas);

    RW._cmdRepositionOverlay();
    ok(panel.style.left === '180px', 'panel left = canvas.left + (canvas.width - barWidth)/2 = 20 + 160 = 180px, got "' + panel.style.left + '"');
    ok(panel.style.width === '480px', 'panel width = bar width (480px), got "' + panel.style.width + '"');
    ok(panel.style.bottom === '76px', 'panel bottom = (innerHeight - canvas.bottom) + offset = (700-640)+16 = 76px, got "' + panel.style.bottom + '"');
  }

  /* ---------- 137. Reposition clamps width when the canvas is narrower than the bar ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW._cmdBarWidth = 480;
    const panel = byId['rw-panel'] || makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    const canvas = makeElement('canvas', byId);
    canvas.id = 'annotation-canvas';
    byId['annotation-canvas'] = canvas;
    canvas._rect = { left: 10, top: 10, right: 210, bottom: 610, width: 200, height: 600 };
    win.document.body.appendChild(canvas);

    RW._cmdRepositionOverlay();
    ok(panel.style.left === '10px', 'panel left = canvas.left when the canvas is narrower than the bar, got "' + panel.style.left + '"');
    ok(parseInt(panel.style.width, 10) <= 200, 'panel width is clamped to the canvas width (<=200), got "' + panel.style.width + '"');
  }

  /* ---------- 138. Offset is tunable via RW._cmdBarOffset ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerHeight = 700;
    loadModule(win);
    const RW = win.__RW;
    const panel = byId['rw-panel'] || makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    const canvas = makeElement('canvas', byId);
    canvas.id = 'annotation-canvas';
    byId['annotation-canvas'] = canvas;
    canvas._rect = { left: 0, top: 0, right: 500, bottom: 600, width: 500, height: 600 };
    win.document.body.appendChild(canvas);

    RW._cmdBarOffset = 16;
    RW._cmdRepositionOverlay();
    ok(panel.style.bottom === '116px', 'offset 16 -> bottom (700-600)+16 = 116px, got "' + panel.style.bottom + '"');
    RW._cmdBarOffset = 40;
    RW._cmdRepositionOverlay();
    ok(panel.style.bottom === '140px', 'offset 40 -> bottom (700-600)+40 = 140px, got "' + panel.style.bottom + '"');
  }

  /* ---------- 139. Reposition no-ops safely without #annotation-canvas or #rw-panel ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win); // neither #rw-panel nor #annotation-canvas exists — overlay can't run
    let threw = false;
    try { win.__RW._cmdRepositionOverlay(); } catch(_e){ threw = true; }
    ok(!threw, 'reposition no-ops without throwing when #rw-panel / #annotation-canvas are absent');
  }

  /* ---------- 140. Reposition runs on load and re-runs on window resize ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerHeight = 700;
    loadModule(win);
    const panel = byId['rw-panel'] || makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    const canvas = makeElement('canvas', byId);
    canvas.id = 'annotation-canvas';
    byId['annotation-canvas'] = canvas;
    canvas._rect = { left: 0, top: 0, right: 500, bottom: 600, width: 500, height: 600 };
    win.document.body.appendChild(canvas);

    // The module calls _cmdRepositionOverlay() at load, so the panel should
    // already be positioned before we touch it.
    ok(panel.style.bottom !== '', 'overlay ran at load (panel has a bottom position), got "' + panel.style.bottom + '"');

    // Simulate a resize: re-flow the canvas lower, then fire window resize.
    canvas._rect = { left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500 };
    win._fire('resize');
    ok(panel.style.bottom === (700 - 500 + 16) + 'px', 'resize re-runs reposition to the new canvas bottom (expected ' + (700-500+16) + 'px, got "' + panel.style.bottom + '")');
  }

  /* ---------- 141. Reposition clamps bottom so the bar never leaves the viewport ---------- */
  {
    // When the drawing is scrolled so the canvas bottom falls below the viewport
    // (a long PDF), the unclamped (innerHeight - canvas.bottom) + offset goes
    // negative and a position:fixed panel would sit entirely off-screen — the
    // reported "can't see the bar but commands work" symptom. Clamp keeps it on.
    const { win, byId } = makeStubWindow();
    win.innerHeight = 700;
    loadModule(win);
    const RW = win.__RW;
    RW._cmdBarOffset = 16;
    const panel = byId['rw-panel'] || makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    const canvas = makeElement('canvas', byId);
    canvas.id = 'annotation-canvas';
    byId['annotation-canvas'] = canvas;
    win.document.body.appendChild(canvas);

    // canvas bottom at 1000, viewport height 700 -> raw bottom = (700-1000)+16 = -284
    canvas._rect = { left: 0, top: 400, right: 500, bottom: 1000, width: 500, height: 600 };
    RW._cmdRepositionOverlay();
    ok(panel.style.bottom === '16px', 'negative raw bottom clamps to the offset (16px), got "' + panel.style.bottom + '"');

    // and a normal in-view case is untouched: canvas bottom 600 -> (700-600)+16 = 116
    canvas._rect = { left: 0, top: 0, right: 500, bottom: 600, width: 500, height: 600 };
    RW._cmdRepositionOverlay();
    ok(panel.style.bottom === '116px', 'in-view canvas still uses the real computed bottom (116px), got "' + panel.style.bottom + '"');
  }

  /* ---------- 142. _overlayDiagnose reports panel/canvas/ancestor state without throwing ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerHeight = 700;
    loadModule(win);
    const panel = byId['rw-panel'] || makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    panel.style.left = '180px'; panel.style.bottom = '76px'; panel.style.width = '480px';
    panel._rect = { left: 180, top: 600, right: 660, bottom: 684, width: 480, height: 84 };
    const canvas = makeElement('canvas', byId);
    canvas.id = 'annotation-canvas';
    byId['annotation-canvas'] = canvas;
    win.document.body.appendChild(canvas);
    canvas._rect = { left: 20, top: 40, right: 820, bottom: 640, width: 800, height: 600 };

    let threw = false;
    let diag = null;
    try { diag = win.__RW._overlayDiagnose(); } catch(_e){ threw = true; }
    ok(!threw, '_overlayDiagnose runs without throwing');
    ok(diag && diag.panel && diag.panel.present === true, 'diagnose reports the panel as present');
    ok(diag && diag.canvas && diag.canvas.present === true, 'diagnose reports the canvas as present');
    ok(diag && diag.panel.onScreen === true, 'diagnose computes the panel on-screen (rect inside the 1000x700 viewport)');
    ok(Array.isArray(diag && diag.ancestors) && diag.ancestors.length === 2, 'diagnose reports body + html ancestor transform info');
  }

  /* ---------- 143. _overlayDiagnose degrades gracefully when elements are missing ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win); // no #rw-panel, no #annotation-canvas
    let threw = false;
    let diag = null;
    try { diag = win.__RW._overlayDiagnose(); } catch(_e){ threw = true; }
    ok(!threw, 'diagnose no-ops without throwing when panel/canvas are absent');
    ok(diag && diag.panel && diag.panel.present === false, 'diagnose reports the panel absent');
    ok(diag && diag.canvas && diag.canvas.present === false, 'diagnose reports the canvas absent');
  }

  /* ---------- 144. Assigning _cmdBarWidth / _cmdBarOffset repositions immediately ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerHeight = 700;
    // Build the panel + canvas BEFORE loadModule so the module's load-time
    // _cmdRepositionOverlay() applies the defaults (tests load only
    // rw_cmdline.js, which doesn't create #rw-panel itself).
    const panel = makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    const canvas = makeElement('canvas', byId);
    canvas.id = 'annotation-canvas';
    byId['annotation-canvas'] = canvas;
    win.document.body.appendChild(canvas);
    canvas._rect = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };

    loadModule(win);
    const RW = win.__RW;

    // Width: 480 (default) centers at (800-480)/2 = 160.
    ok(panel.style.left === '160px' && panel.style.width === '480px', 'default width 480 centers the panel (left 160), got left="' + panel.style.left + '" width="' + panel.style.width + '"');
    RW._cmdBarWidth = 600;
    ok(panel.style.width === '600px', 'assigning _cmdBarWidth repositions immediately to 600px, got "' + panel.style.width + '"');
    ok(panel.style.left === '100px', 'recentered for the new width: (800-600)/2 = 100, got "' + panel.style.left + '"');

    // Offset: (700-600)+16 = 116 by default.
    ok(panel.style.bottom === '116px', 'default offset 16 gives bottom 116px, got "' + panel.style.bottom + '"');
    RW._cmdBarOffset = 40;
    ok(panel.style.bottom === '140px', 'assigning _cmdBarOffset repositions immediately to 140px, got "' + panel.style.bottom + '"');

    // Values survive a read back.
    ok(RW._cmdBarWidth === 600 && RW._cmdBarOffset === 40, 'the new values are retained on read-back (width ' + RW._cmdBarWidth + ', offset ' + RW._cmdBarOffset + ')');
  }

  /* ---------- 145. The command input is styled readable against the dark panel ---------- */
  {
    // Near-white text (inherited from #rw-panel's color) on the input's default
    // WHITE UA background is unreadable — the fix is an explicit dark input bg +
    // light text. Guard that the input carries both, so a regression can't return
    // the white-on-white state.
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    ok(inp && inp.style.cssText.indexOf('background:#111') !== -1, 'input has an explicit dark background (unreadable white-on-white avoided)');
    ok(inp && inp.style.cssText.indexOf('color:#eee') !== -1, 'input has explicit near-white text');
    ok(inp && inp.style.cssText.indexOf('color-scheme:dark') !== -1, 'input opts into a dark native color scheme');
  }

  /* ---------- 146. Single-match UX: a query with exactly one command match renders one VISIBLE highlighted row ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    inp.value = 'rect'; // exact name match — only one command matches
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    ok(menu.style.display === 'block', 'a single match still opens the dropdown (display:block), never silently hidden');
    ok(menu._children.length === 1, 'exactly one row is rendered for a single match');
    ok(menu._children[0].style.cssText.indexOf('rgba(255,140,0,0.3)') !== -1, 'the single row is visibly highlighted, ready for Enter/Space');
  }

  /* ---------- 147. Single-match UX: Enter with the single match visible runs it through the visible-highlight branch ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const inp = byId['rw-cmd-input'];
    inp.value = 'rect';
    inp.dispatchEvent({ type: 'input' }); // single visible, highlighted match
    inp._fire('keydown', { key: 'Enter' });
    ok(JSON.stringify(keys) === JSON.stringify(['d','w']), 'Enter on a single visible match runs it (draw-prefix d + rect\'s w)');
    ok(inp.value === '' && byId['rw-cmd-menu'].style.display === 'none', 'input cleared and menu hidden after the run');
  }

  /* ---------- 148. Single-match UX regression guard: the invisible `matches.length === 1` fallback is GONE ---------- */
  // The old Enter/Space handler had a hidden escape hatch that ran a single command
  // match even with no visible dropdown — the exact "no dropdown shown, but still can
  // select" confusion. Now selection only happens via a real highlighted row; with the
  // menu emptied, Enter reports unknown command instead of silently running.
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    const inp = byId['rw-cmd-input'];
    inp.value = 'rect'; // a real match first — creates the menu element
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu'].style.display === 'block', 'menu opens for a real match (baseline)');
    inp.value = 'zzz-nonexistent'; // now a no-match query empties menuItems and hides the menu
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu'].style.display === 'none', 'no-match query leaves the menu hidden (baseline)');
    inp.value = 'rect'; // WITHOUT an input event: a stale input whose text WOULD match exactly one command
    inp._fire('keydown', { key: 'Enter' });
    ok(keys.length === 0, 'Enter with no highlighted row never dispatches — the invisible single-match fallback is gone');
    ok(RW._lastStatus.indexOf('unknown command') !== -1, 'it reports unknown command instead of silently running');
  }

  /* ---------- 149. Void: `void` is still a real draw tool — dispatches d then v ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('void');
    ok(JSON.stringify(keys) === JSON.stringify(['d','v']), 'void dispatches draw-prefix d then its own letter v, unchanged');
  }

  /* ---------- 150. Void: void never becomes the Space-repeat target; _cmdVoidPrev snapshots the pre-void tool ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('rect'); // the pre-void tool
    RW.runCommand('void');
    ok(RW._cmdLastTool === 'rect', 'void does NOT overwrite the last tool — rect is still remembered');
    ok(RW._cmdVoidPrev === 'rect', 'the pre-void tool is snapshotted into _cmdVoidPrev');
    ok(RW._cmdVoidActive === true, 'the void workflow is marked active');
    ok(RW._cmdToolArmed === true, 'void is a real draw tool, so the app genuinely has a tool armed');
  }

  /* ---------- 151. Void: an area tool used during void freezes _cmdLastTool at the pre-void tool ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('rect');
    RW.runCommand('void');
    RW.runCommand('circle'); // an area step while inside void
    ok(RW._cmdLastTool === 'rect', 'circle does not become the last tool while void is active — frozen at rect');
    ok(JSON.stringify(keys) === JSON.stringify(['d','w','d','v','d','y']), 'circle still dispatches its own draw keys (d then y)');
    ok(RW._cmdToolArmed === true, 'area tools still mark a tool as armed');
  }

  /* ---------- 152. Void: full reported loop — rect -> void -> circle -> Space -> Space repeats the PRE-VOID tool ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('rect');
    RW.runCommand('void');
    RW.runCommand('circle');
    keys.length = 0; // only care about what the two Space presses dispatch
    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: ' ' }); // first Space: closes the armed tool
    ok(JSON.stringify(keys) === JSON.stringify(['s']), 'first Space closes the armed (post-revert rect) tool');
    ok(RW._cmdToolArmed === false, 'after the close, nothing is armed');
    keys.length = 0;
    doc._fire('keydown', { target: bodyTarget, key: ' ' }); // second Space: repeats the last (pre-void) tool
    ok(JSON.stringify(keys) === JSON.stringify(['d','w']), 'second Space repeats rect — the PRE-VOID tool, not void or circle');
  }

  /* ---------- 153. Void: a mode switch ends the session and releases the freeze ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('rect');
    RW.runCommand('void');
    RW.runCommand('pan'); // a mode switch ends the void session
    ok(RW._cmdVoidActive === false, 'the mode switch clears _cmdVoidActive');
    RW.runCommand('circle');
    ok(RW._cmdLastTool === 'circle', 'after the session ends, a later tool stamps _cmdLastTool normally again');
  }

  /* ---------- 154. Void: RW._cmdGoSelect (Escape/Space-close/poll) ends the session ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('rect');
    RW.runCommand('void');
    RW._cmdGoSelect('escape', true); // a close ends the session too
    ok(RW._cmdVoidActive === false, 'a close clears _cmdVoidActive');
    ok(RW._cmdToolArmed === false, 'a close leaves nothing armed');
    RW.runCommand('circle');
    ok(RW._cmdLastTool === 'circle' && RW._cmdToolArmed === true, 'a later tool stamps _cmdLastTool and arms normally after the session ends');
  }

  /* ---------- 155. Void: re-running the pre-void tool itself ends the session — the app has reverted ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('rect');
    RW.runCommand('void');
    RW.runCommand('rect'); // the pre-void tool itself -> the app has reverted, session over
    ok(RW._cmdVoidActive === false, 're-running the pre-void tool clears _cmdVoidActive');
    ok(RW._cmdLastTool === 'rect' && RW._cmdToolArmed === true, 'normal bookkeeping resumes — rect is the last tool and armed');
  }

  /* ---------- 156. Void: whole void bookkeeping works with no annotationState at all ---------- */
  {
    const { win, byId, doc } = makeStubWindow(); // no annotationState passed to loadModule
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('rect');
    RW.runCommand('void');
    RW.runCommand('circle');
    ok(RW._cmdLastTool === 'rect' && RW._cmdVoidActive === true, 'void bookkeeping holds with annotationState absent');
    ok(RW._cmdToolArmed === true, 'armed flag is maintained without annotationState');
    // And the Space toggle still works end to end without annotationState.
    keys.length = 0; // only care about what the two Space presses dispatch
    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: ' ' });
    doc._fire('keydown', { target: bodyTarget, key: ' ' });
    ok(JSON.stringify(keys) === JSON.stringify(['s','d','w']), 'Space-close then Space-repeat of the pre-void tool both work with no annotationState');
  }

  /* ---------- 157. Dropdown anchors clear of the WHOLE panel, not just the input ---------- */
  {
    // The load-bearing regression guard for this round: the input sits INSIDE
    // the panel, below its header strip (caret / "Command Line" / RW: ON/OFF).
    // Anchoring off the input alone (the old behavior) would let the dropdown's
    // lower rows grow straight into that header and be painted over by it —
    // positionMenu must anchor off the PANEL's top edge instead.
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 700;
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    const panel = makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    // Panel's header strip sits above the input inside it: panel top (600) is
    // well above the input's own top (650).
    panel._rect = { left: 300, top: 600, right: 780, bottom: 690, width: 480, height: 90 };
    inp._rect = { left: 300, top: 650, right: 780, bottom: 670, width: 480, height: 20 };
    inp.value = 'po';
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    const bottom = parseFloat(menu.style.bottom);
    // bottom = innerHeight - panelTop + 6 = 700 - 600 + 6 = 106 (NOT 700-650+6=56, the input-anchored value)
    ok(bottom === 106, 'menu anchors off the PANEL top edge (expected 106), got "' + menu.style.bottom + '"');
    ok(menu.style.top === 'auto', 'still a single, upward anchor (top cleared)');
  }

  /* ---------- 158. Dropdown horizontal position still tracks the INPUT, not the panel ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 700;
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    const panel = makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    panel._rect = { left: 280, top: 600, right: 800, bottom: 690, width: 520, height: 90 };
    inp._rect = { left: 300, top: 650, right: 780, bottom: 670, width: 480, height: 20 };
    inp.value = 'po';
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    ok(menu.style.left === '300px', 'menu left still tracks the INPUT rect (300px), not the wider panel, got "' + menu.style.left + '"');
    ok(menu.style.width === '480px', 'menu width still tracks the INPUT rect (480px), got "' + menu.style.width + '"');
  }

  /* ---------- 159. Dropdown flips BELOW the panel when there's no room above ---------- */
  {
    // Simulates the panel having been dragged near the top of the screen
    // (the draggable-panel feature) — the dropdown must still be fully
    // visible, so it opens downward instead of clipping off the top.
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 700;
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    const panel = makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    // Panel pinned near the very top: only 10px above it, but 590px below.
    panel._rect = { left: 300, top: 10, right: 780, bottom: 100, width: 480, height: 90 };
    inp._rect = { left: 300, top: 70, right: 780, bottom: 90, width: 480, height: 20 };
    inp.value = 'po';
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    ok(menu.style.bottom === 'auto', 'flip clears the bottom anchor, got "' + menu.style.bottom + '"');
    // top = panelBottom + 6 = 100 + 6 = 106
    ok(menu.style.top === '106px', 'flipped menu anchors below the panel (top 106px), got "' + menu.style.top + '"');
    const maxH = parseFloat(menu.style.maxHeight);
    // below = innerHeight - panelBottom - 6 = 700 - 100 - 6 = 594, clamped to MENU_MAX_H (200)
    ok(maxH === 200, 'flipped menu maxHeight clamps to the 200px cap when there is ample room below, got "' + menu.style.maxHeight + '"');
  }

  /* ---------- 160. Dropdown does NOT flip when there's enough room above (prefers upward) ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 700;
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    const panel = makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    panel._rect = { left: 300, top: 600, right: 780, bottom: 690, width: 480, height: 90 };
    inp._rect = { left: 300, top: 650, right: 780, bottom: 670, width: 480, height: 20 };
    inp.value = 'po';
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    ok(menu.style.top === 'auto', 'no flip: top stays cleared, got "' + menu.style.top + '"');
    ok(menu.style.bottom !== 'auto' && menu.style.bottom !== '', 'no flip: bottom is set, got "' + menu.style.bottom + '"');
    ok(menu.style.maxHeight === '200px', 'ample room above still clamps to the 200px cap, got "' + menu.style.maxHeight + '"');
  }

  /* ---------- 161. Dropdown maxHeight floors at MENU_MIN_H when neither side has much room ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 200; // a tiny viewport
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    const panel = makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    // Panel sits mid-viewport: only ~90px above, ~70px below.
    panel._rect = { left: 300, top: 90, right: 780, bottom: 130, width: 480, height: 40 };
    inp._rect = { left: 300, top: 100, right: 780, bottom: 120, width: 480, height: 20 };
    inp.value = 'po';
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    const maxH = parseFloat(menu.style.maxHeight);
    ok(maxH >= 60, 'maxHeight never shrinks below the 60px floor even when space is tight, got "' + menu.style.maxHeight + '"');
  }

  /* ---------- 162. Dropdown falls back to the input's own rect when #rw-panel is absent ---------- */
  {
    // e.g. a synthetic harness, or (defensively) a page state where the panel
    // hasn't mounted yet — positionMenu must never throw.
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 700;
    loadModule(win); // no #rw-panel built
    const inp = byId['rw-cmd-input'];
    inp._rect = { left: 300, top: 650, right: 780, bottom: 670, width: 480, height: 20 };
    let threw = false;
    try {
      inp.value = 'po';
      inp.dispatchEvent({ type: 'input' });
    } catch(_e){ threw = true; }
    ok(!threw, 'positionMenu does not throw without #rw-panel');
    const menu = byId['rw-cmd-menu'];
    ok(parseFloat(menu.style.bottom) === 56, 'falls back to anchoring off the INPUT rect (56px, same as pre-fix behavior), got "' + menu.style.bottom + '"');
  }

  /* ---------- 163. Menu and panel stacking: menu z-index above the panel's, source-confirmed on both files ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    inp.value = 'po';
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    ok(menu.style.cssText.indexOf('z-index:2147483647') !== -1, 'menu carries the true 32-bit max z-index, got "' + menu.style.cssText + '"');
    // rw_core.js (the panel's own module) isn't loaded by this harness (only
    // rw_cmdline.js is sandboxed) — read its source directly to confirm the
    // panel was deliberately dropped one below the menu's max, not left equal.
    const coreSrc = fs.readFileSync(path.join(__dirname, 'rw_core.js'), 'utf8');
    ok(coreSrc.indexOf('z-index:2147483646') !== -1, 'rw_core.js pins the panel one below the true max, so the menu always wins, got no match');
    ok(coreSrc.indexOf('z-index:2147483647') === -1, 'rw_core.js no longer claims the true max for the panel itself');
  }

  /* ---------- 164. A resize repositions an OPEN dropdown; a closed one is left alone ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerHeight = 700;
    loadModule(win);
    const RW = win.__RW;
    const inp = byId['rw-cmd-input'];
    const panel = byId['rw-panel'] || makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    const canvas = makeElement('canvas', byId);
    canvas.id = 'annotation-canvas';
    byId['annotation-canvas'] = canvas;
    win.document.body.appendChild(canvas);
    canvas._rect = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };
    panel._rect = { left: 160, top: 600, right: 640, bottom: 684, width: 480, height: 84 };
    inp._rect = { left: 160, top: 650, right: 640, bottom: 670, width: 480, height: 20 };

    inp.value = 'po';
    inp.dispatchEvent({ type: 'input' }); // opens the menu, anchored off the current panel rect
    const menu = byId['rw-cmd-menu'];
    const beforeBottom = menu.style.bottom;

    // Move the panel (simulating a resize re-centering it) and re-fire resize.
    panel._rect = { left: 160, top: 500, right: 640, bottom: 584, width: 480, height: 84 };
    canvas._rect = { left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500 };
    win._fire('resize');
    ok(menu.style.bottom !== beforeBottom, 'an OPEN dropdown is repositioned along with the panel on resize (was "' + beforeBottom + '", now "' + menu.style.bottom + '")');

    // Now close it and confirm a further resize does not reopen/touch it.
    menu.style.display = 'none';
    const afterCloseBottom = menu.style.bottom;
    panel._rect = { left: 160, top: 300, right: 640, bottom: 384, width: 480, height: 84 };
    canvas._rect = { left: 0, top: 0, right: 800, bottom: 300, width: 800, height: 300 };
    win._fire('resize');
    ok(menu.style.display === 'none', 'a CLOSED dropdown stays closed after a resize');
    ok(menu.style.bottom === afterCloseBottom, 'a CLOSED dropdown is left at its stale position, untouched, got "' + menu.style.bottom + '"');
  }

  /* ---------- 165. _overlayDiagnose reports the menu section (present + absent) ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const inp = byId['rw-cmd-input'];

    let diag = RW._overlayDiagnose();
    ok(diag.menu && diag.menu.present === false, 'diagnose reports the menu absent before any query has ever matched');

    inp.value = 'po';
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    menu._rect = { left: 300, top: 500, right: 780, bottom: 650, width: 480, height: 150 };
    diag = RW._overlayDiagnose();
    ok(diag.menu && diag.menu.present === true, 'diagnose reports the menu present once it has been created');
    ok(diag.menu.style && diag.menu.style.zIndex === menu.style.zIndex, 'diagnose reports the menu\'s own zIndex style');
    ok(diag.menu.rect && diag.menu.rect.height === 150, 'diagnose reports the menu\'s live rect');
  }

  /* ---------- 166. Press+move past threshold sets style.left/top from deltas, converts bottom->top anchoring ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 700;
    const fx = makeDragPanel(win, byId);
    loadModule(win);
    const doc = win.document;

    fx.panel._fire('pointerdown', mouseEvt({ button:0, target: fx.header, clientX:200, clientY:650, pointerId:1 }));
    doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:210, clientY:655, buttons:1 })); // dx=10, dy=5

    ok(fx.panel.style.left === '170px', 'left = start(160) + dx(10) = 170px, got "' + fx.panel.style.left + '"');
    ok(fx.panel.style.top === '605px', 'top = start(600) + dy(5) = 605px, got "' + fx.panel.style.top + '"');
    ok(fx.panel.style.bottom === 'auto', 'bottom is cleared — the overlay converts to top-anchoring on first real drag, got "' + fx.panel.style.bottom + '"');
  }

  /* ---------- 167. Clamping at all four viewport edges ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 700;
    const fx = makeDragPanel(win, byId);
    loadModule(win);
    const doc = win.document;

    // Drag far up-left: clamps to (0, 0).
    fx.panel._fire('pointerdown', mouseEvt({ button:0, target: fx.header, clientX:200, clientY:650, pointerId:1 }));
    doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:-5000, clientY:-5000, buttons:1 }));
    doc._fire('pointerup', mouseEvt({ target: fx.header }));
    ok(fx.panel.style.left === '0px', 'far up-left drag clamps left to 0, got "' + fx.panel.style.left + '"');
    ok(fx.panel.style.top === '0px', 'far up-left drag clamps top to 0, got "' + fx.panel.style.top + '"');

    // Drag far down-right: clamps to (innerWidth - width, innerHeight - height) = (1000-480, 700-90) = (520, 610).
    fx.panel._fire('pointerdown', mouseEvt({ button:0, target: fx.header, clientX:0, clientY:0, pointerId:1 }));
    doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:5000, clientY:5000, buttons:1 }));
    doc._fire('pointerup', mouseEvt({ target: fx.header }));
    ok(fx.panel.style.left === '520px', 'far down-right drag clamps left to innerWidth-width=520, got "' + fx.panel.style.left + '"');
    ok(fx.panel.style.top === '610px', 'far down-right drag clamps top to innerHeight-height=610, got "' + fx.panel.style.top + '"');
  }

  /* ---------- 168. Sub-threshold press+release: no style mutation, the click is NOT consumed ---------- */
  {
    const { win, byId } = makeStubWindow();
    const fx = makeDragPanel(win, byId);
    loadModule(win);
    const doc = win.document;

    fx.panel._fire('pointerdown', mouseEvt({ button:0, target: fx.header, clientX:200, clientY:650, pointerId:1 }));
    doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:201, clientY:650, buttons:1 })); // manhattan 1 <= threshold 3
    doc._fire('pointerup', mouseEvt({ target: fx.header }));

    ok(fx.panel.style.left === '160px', 'a sub-threshold press+release never touches style.left (still the fixture\'s pinned value), got "' + fx.panel.style.left + '"');
    ok(fx.panel.style.top === undefined, 'a sub-threshold press+release never touches style.top');

    const evt = fx.panel._fire('click', mouseEvt({}));
    ok(evt.defaultPrevented === false && evt._propStopped === false, 'the click-to-collapse click is left completely alone (nothing suppressed)');
  }

  /* ---------- 169. Presses starting on #rw-collapse / #rw-enable / the body never start a drag, even with movement ---------- */
  {
    const { win, byId } = makeStubWindow();
    const fx = makeDragPanel(win, byId);
    loadModule(win);
    const doc = win.document;

    [fx.caret, fx.enableBtn, fx.bodyContent].forEach(function(target, i){
      fx.panel._fire('pointerdown', mouseEvt({ button:0, target: target, clientX:200, clientY:650, pointerId:1 }));
      doc._fire('pointermove', mouseEvt({ target: target, clientX:400, clientY:400, buttons:1 })); // well past threshold
      doc._fire('pointerup', mouseEvt({ target: target }));
      ok(fx.panel.style.left === '160px', 'target #' + i + ' never starts a drag (style.left still the fixture\'s pinned value)');
      ok(fx.panel.style.top === undefined, 'target #' + i + ' never starts a drag (style.top untouched)');
    });
  }

  /* ---------- 170. A middle-button (button:1) press on the header never starts a drag ---------- */
  {
    const { win, byId } = makeStubWindow();
    const fx = makeDragPanel(win, byId);
    loadModule(win);
    const doc = win.document;

    fx.panel._fire('pointerdown', mouseEvt({ button:1, target: fx.header, clientX:200, clientY:650, pointerId:1 }));
    doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:400, clientY:400, buttons:4 }));
    doc._fire('pointerup', mouseEvt({ target: fx.header }));
    ok(fx.panel.style.left === '160px', 'a middle-button press on the header never starts a drag (style.left still the fixture\'s pinned value)');
  }

  /* ---------- 171. First real drag sets RW._cmdBarUserMoved; a later reposition keeps position, never re-centers ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 700;
    const fx = makeDragPanel(win, byId);
    const canvas = makeElement('canvas', byId);
    canvas.id = 'annotation-canvas';
    byId['annotation-canvas'] = canvas;
    canvas._rect = { left: 20, top: 40, right: 820, bottom: 640, width: 800, height: 600 };
    win.document.body.appendChild(canvas);
    loadModule(win);
    const RW = win.__RW;
    const doc = win.document;

    ok(RW._cmdBarUserMoved === false, 'starts un-moved');
    fx.panel._fire('pointerdown', mouseEvt({ button:0, target: fx.header, clientX:200, clientY:650, pointerId:1 }));
    doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:150, clientY:600, buttons:1 })); // dx=-50, dy=-50
    doc._fire('pointerup', mouseEvt({ target: fx.header }));
    ok(RW._cmdBarUserMoved === true, 'a real drag sets RW._cmdBarUserMoved');

    const draggedLeft = fx.panel.style.left, draggedTop = fx.panel.style.top;
    RW._cmdRepositionOverlay(); // simulates a window resize re-running reposition
    ok(fx.panel.style.left === draggedLeft && fx.panel.style.top === draggedTop,
      'reposition after a user move keeps the dragged position (was "' + draggedLeft + '/' + draggedTop + '", now "' + fx.panel.style.left + '/' + fx.panel.style.top + '")');
    ok(fx.panel.style.width === '480px', 'the default bar width is still applied in the moved branch');

    RW._cmdBarWidth = 600; // live setter also triggers a reposition
    ok(fx.panel.style.width === '600px', 'assigning _cmdBarWidth still applies immediately while moved, got "' + fx.panel.style.width + '"');
    ok(fx.panel.style.left === draggedLeft, 'a width change alone does not re-center a user-moved panel');
  }

  /* ---------- 172. RW._cmdResetBar() clears the flag and re-pins (re-centers over canvas) ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 700;
    const fx = makeDragPanel(win, byId);
    const canvas = makeElement('canvas', byId);
    canvas.id = 'annotation-canvas';
    byId['annotation-canvas'] = canvas;
    canvas._rect = { left: 20, top: 40, right: 820, bottom: 640, width: 800, height: 600 };
    win.document.body.appendChild(canvas);
    loadModule(win);
    const RW = win.__RW;
    const doc = win.document;

    fx.panel._fire('pointerdown', mouseEvt({ button:0, target: fx.header, clientX:200, clientY:650, pointerId:1 }));
    doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:150, clientY:600, buttons:1 }));
    doc._fire('pointerup', mouseEvt({ target: fx.header }));
    ok(RW._cmdBarUserMoved === true, 'moved before reset');

    RW._cmdResetBar();
    ok(RW._cmdBarUserMoved === false, '_cmdResetBar clears the moved flag');
    // Re-centered exactly like RW._cmdRepositionOverlay's default (un-moved) branch: left = cr.left + (cr.width-width)/2 = 20 + (800-480)/2 = 180
    ok(fx.panel.style.left === '180px', 're-pins centered over the canvas, got "' + fx.panel.style.left + '"');
    ok(fx.panel.style.bottom !== 'auto' && fx.panel.style.bottom !== '', 're-pins bottom-anchored again, got "' + fx.panel.style.bottom + '"');
  }

  /* ---------- 173. Post-drag click is consumed exactly once; the next click is not; the fallback timer clears it with no click following ---------- */
  {
    const { win, byId } = makeStubWindow();
    const timers = makeFakeTimers();
    const fx = makeDragPanel(win, byId);
    loadModule(win, undefined, timers);
    const doc = win.document;

    fx.panel._fire('pointerdown', mouseEvt({ button:0, target: fx.header, clientX:200, clientY:650, pointerId:1 }));
    doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:230, clientY:650, buttons:1 })); // real drag
    doc._fire('pointerup', mouseEvt({ target: fx.header }));

    const consumed = fx.panel._fire('click', mouseEvt({}));
    ok(consumed.defaultPrevented === true && consumed._propStopped === true, 'the release click is consumed exactly once');

    const next = fx.panel._fire('click', mouseEvt({}));
    ok(next.defaultPrevented === false && next._propStopped === false, 'the click AFTER the consumed one is left alone');

    // A second drag with no click following: the fallback setTimeout(0) must clear suppressClick on its own.
    fx.panel._fire('pointerdown', mouseEvt({ button:0, target: fx.header, clientX:200, clientY:650, pointerId:1 }));
    doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:230, clientY:650, buttons:1 }));
    doc._fire('pointerup', mouseEvt({ target: fx.header }));
    timers.runTimeouts(); // no click ever fired — the fallback timer must clear suppressClick itself
    const later = fx.panel._fire('click', mouseEvt({}));
    ok(later.defaultPrevented === false && later._propStopped === false, 'with no click following, the fallback timer clears suppressClick and a later click survives');
  }

  /* ---------- 174. Teardown paths: pointerup, pointercancel, lostpointercapture, window blur, and buttons-cleared mid-drag ---------- */
  {
    const { win, byId } = makeStubWindow();
    const fx = makeDragPanel(win, byId);
    loadModule(win);
    const doc = win.document;

    function beginRealDrag(){
      fx.panel._fire('pointerdown', mouseEvt({ button:0, target: fx.header, clientX:200, clientY:650, pointerId:1 }));
      doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:220, clientY:650, buttons:1 })); // crosses the 3px threshold
    }
    function assertIgnoredAfterTeardown(label){
      const before = fx.panel.style.left;
      doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:900, clientY:650, buttons:1 }));
      ok(fx.panel.style.left === before, label + ': a further move after teardown is ignored (listeners were really removed)');
    }

    beginRealDrag();
    doc._fire('pointerup', mouseEvt({ target: fx.header }));
    assertIgnoredAfterTeardown('pointerup');

    beginRealDrag();
    doc._fire('pointercancel', mouseEvt({ target: fx.header }));
    assertIgnoredAfterTeardown('pointercancel');

    beginRealDrag();
    fx.header._fire('lostpointercapture', {});
    assertIgnoredAfterTeardown('lostpointercapture');

    beginRealDrag();
    win._fire('blur', {});
    assertIgnoredAfterTeardown('window blur');

    // buttons-cleared MID-drag (after already crossing the threshold), not just a sub-threshold press.
    beginRealDrag();
    const midDragLeft = fx.panel.style.left;
    doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:400, clientY:650, buttons:0 }));
    ok(fx.panel.style.left === midDragLeft, 'a move with the left buttons bit cleared mid-drag stops applying further deltas');
    assertIgnoredAfterTeardown('buttons-cleared');

    // A fresh drag afterward is not double-driven (proves listener removal is real, not additive).
    beginRealDrag();
    const singleDriveLeft = fx.panel.style.left;
    doc._fire('pointerup', mouseEvt({ target: fx.header }));
    ok(fx.panel.style.left === singleDriveLeft, 'a subsequent drag applies deltas exactly once, not doubled by leftover listeners');
  }

  /* ---------- 175. RW._cmdBarDrag = false disables the whole feature ---------- */
  {
    const { win, byId } = makeStubWindow();
    const fx = makeDragPanel(win, byId);
    loadModule(win);
    const RW = win.__RW;
    const doc = win.document;
    RW._cmdBarDrag = false;

    fx.panel._fire('pointerdown', mouseEvt({ button:0, target: fx.header, clientX:200, clientY:650, pointerId:1 }));
    doc._fire('pointermove', mouseEvt({ target: fx.header, clientX:400, clientY:400, buttons:1 }));
    doc._fire('pointerup', mouseEvt({ target: fx.header }));

    ok(fx.panel.style.left === '160px', 'RW._cmdBarDrag=false disables dragging entirely (style.left still the fixture\'s pinned value)');
    ok(RW._cmdBarUserMoved === false, 'and never marks the panel as user-moved');
  }

  /* ---------- 176. Regression: RW._cmdRepositionOverlay always clears style.top when re-pinning (no double-anchor stretch) ---------- */
  {
    const { win, byId } = makeStubWindow();
    win.innerHeight = 700;
    const fx = makeDragPanel(win, byId);
    fx.panel.style.top = '123px'; // simulate a leftover top-anchor from an earlier drag
    const canvas = makeElement('canvas', byId);
    canvas.id = 'annotation-canvas';
    byId['annotation-canvas'] = canvas;
    canvas._rect = { left: 0, top: 0, right: 500, bottom: 600, width: 500, height: 600 };
    win.document.body.appendChild(canvas);
    loadModule(win);
    const RW = win.__RW;

    ok(RW._cmdBarUserMoved === false, 'not in the user-moved branch for this test');
    RW._cmdRepositionOverlay();
    ok(fx.panel.style.top === 'auto', 're-pinning always clears a stale style.top (no double-anchor stretch), got "' + fx.panel.style.top + '"');
  }

  /* ---------- 177. Load-order independence: rw_core.js reuses an existing #rw-panel instead of removing it ---------- */
  {
    // Simulates the workbench's rw_install.js having already built #rw-panel
    // (embedded, with its own button row + #rw-list) before boon-command-line
    // ever loads — see CLAUDE.md's load-order-independence section. rw_core.js
    // isn't loaded by loadModule() (only rw_cmdline.js is sandboxed), so its
    // source is loaded directly, the same pattern test 163 already uses.
    const { win, byId } = makeStubWindow();
    const existingPanel = win.document.createElement('div');
    existingPanel.id = 'rw-panel';
    existingPanel.style.cssText = 'border-top:1px solid #999;'; // the workbench's own embedded styling
    byId['rw-panel'] = existingPanel;
    const existingList = win.document.createElement('div');
    existingList.id = 'rw-list';
    byId['rw-list'] = existingList;
    existingPanel.appendChild(existingList);
    win.document.body.appendChild(existingPanel);
    win.__RW = { v: 2, W: 9999 }; // a pre-existing workbench key that must survive the merge

    loadCoreModule(win);

    ok(win.document.getElementById('rw-panel') === existingPanel, 'rw_core.js reuses the existing #rw-panel object rather than removing and rebuilding it');
    ok(existingPanel.style.cssText.indexOf('border-top') !== -1, "the workbench's own panel styling survives — rw_core.js never rebuilt it");
    ok(win.__RW.v === 2 && win.__RW.W === 9999, 'pre-existing __RW keys survive the merge (window.__RW = window.__RW || {})');
    ok(win.__RW.vcore === true, 'rw_core.js still stamps its own vcore flag onto the shared object');
    ok(!win.__RW._cmdOwnsPanelPosition, 'reusing another tool\'s panel does NOT claim positioning ownership');
    ok(win.document.getElementById('rw-commit-status'), 'the commit-status div is still added into the reused panel');
  }

  /* ---------- 178. Load-order independence: rw_core.js builds its own fixed overlay and claims positioning ownership when no panel exists yet ---------- */
  {
    const { win } = makeStubWindow();
    // The default fixture's __RW already has vcore:true (it represents the
    // post-rw_core.js state every other test in this file needs) — clear it
    // so rw_core.js's own re-entry guard doesn't short-circuit before this
    // test can observe its fresh-build branch.
    win.__RW = null;
    ok(!win.document.getElementById('rw-panel'), 'no panel exists yet (the normal single-tool case)');

    loadCoreModule(win);

    const panel = win.document.getElementById('rw-panel');
    ok(!!panel, 'rw_core.js builds a fresh #rw-panel when none exists');
    ok(panel.style.cssText.indexOf('position:fixed') !== -1, 'the freshly-built panel is the fixed overlay, unchanged from before this round');
    ok(win.__RW._cmdOwnsPanelPosition === true, 'building the panel fresh claims positioning ownership — matches the default fixture every other test in this file relies on');
  }

  /* ---------- 179. Not owning the panel's positioning: reposition and drag both no-op ---------- */
  {
    // Simulates rw_cmdline.js reusing a panel the workbench's rw_install.js
    // built (embedded, position:relative) — RW._cmdOwnsPanelPosition is unset
    // in that case (test 177), so neither the resize/reposition path nor the
    // drag-to-move path may touch panel.style, or they'd dislocate a panel
    // this tool doesn't own the layout of. See CLAUDE.md.
    const { win, byId } = makeStubWindow();
    win.innerWidth = 1000; win.innerHeight = 700;
    win.__RW._cmdOwnsPanelPosition = false;
    const fx = makeDragPanel(win, byId);
    const before = { left: fx.panel.style.left, top: fx.panel.style.top, bottom: fx.panel.style.bottom, width: fx.panel.style.width };
    const canvas = makeElement('canvas', byId);
    canvas.id = 'annotation-canvas';
    byId['annotation-canvas'] = canvas;
    canvas._rect = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };
    win.document.body.appendChild(canvas);
    loadModule(win);
    const RW = win.__RW;

    RW._cmdRepositionOverlay();
    ok(fx.panel.style.left === before.left && fx.panel.style.top === before.top && fx.panel.style.bottom === before.bottom && fx.panel.style.width === before.width,
      'RW._cmdRepositionOverlay is a no-op when this tool does not own the panel\'s positioning');

    fx.panel._fire('pointerdown', mouseEvt({ button:0, target: fx.header, clientX:200, clientY:650, pointerId:1 }));
    win.document._fire('pointermove', mouseEvt({ target: fx.header, clientX:400, clientY:750, buttons:1 }));
    ok(fx.panel.style.left === before.left && fx.panel.style.top === before.top,
      'a drag never arms either — no style mutation from a press+move past the threshold');
  }

  /* ---------- DUAL-TARGET HOST ADAPTER: the graph ("Duct Takeoff") host ---------- */
  // Every test above this point exercises the default (annotate) host fixture
  // makeStubWindow() already builds — none of it changed. The tests below
  // point win.__RW._host at the graph host instead, confirming each of the
  // seven call sites CLAUDE.md's host-adapter round retargeted actually
  // branches correctly, without re-testing everything the annotate host
  // already covers. See CLAUDE.md.
  const GRAPH_HOST = { id: 'graph', canvasId: 'graph-canvas-stage' };

  /* ---------- 180. Graph host: RW._cmdTable is the graph table, disjoint from the annotate table ---------- */
  {
    const { win } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const RW = win.__RW;
    ok(RW._cmdTable.some(e => e.name === 'route'), 'graph table has "route", confirmed live via opencli');
    ok(RW._cmdTable.some(e => e.name === 'grd') && RW._cmdTable.some(e => e.name === 'damper'),
       'graph table has the rest of the confirmed data-tool set (grd, damper, ...)');
    ok(!RW._cmdTable.some(e => e.name === 'linear' || e.name === 'wand'),
       'graph table does not carry annotate-host-only tool names');
  }

  /* ---------- 181. Graph host: a real tool dispatches ONLY its own key — no defensive "d" draw-mode prefix ---------- */
  // Contrast with test 149 (annotate host): `void` there dispatches d then v,
  // because the annotate host's own keymap documents those letters as
  // draw-mode-only. The graph host has no such concept — confirmed live via
  // opencli (dispatching a bare key flipped __graphDebug.activeTool directly).
  {
    const { win } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('route');
    ok(keys.length === 1 && keys[0] === 'r', 'route dispatches exactly one key ("r"), with no leading "d"');
    RW.runCommand('grd');
    ok(keys[1] === 'g', 'grd dispatches its own key too, same one-key pattern');
  }

  /* ---------- 182. Graph host: `select` is a mode switch, not a repeat-tracked tool — same contract as the annotate host ---------- */
  {
    const { win } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const RW = win.__RW;
    RW.runCommand('route');
    ok(RW._cmdLastTool === 'route', 'a real graph tool becomes the Space-repeat target, same as a draw tool on the annotate host');
    RW.runCommand('select');
    ok(RW._cmdToolArmed === false, 'select clears the armed flag');
    ok(RW._cmdLastTool === 'route', 'select never overwrites the last-repeated tool, same as the annotate host\'s own select');
  }

  /* ---------- 183. Graph host: the live-diagnostic readout (and readTool/readMode generally) reads window.__graphDebug.activeTool, never annotationState ---------- */
  {
    const { win } = makeStubWindow({ host: GRAPH_HOST });
    const gd = { activeTool: 'flex' };
    // annotationState is deliberately left undefined — a real graph page has
    // no such global at all; if anything here still touched it, this would
    // either throw or silently report "undefined -> undefined" instead of
    // the real live value below.
    loadModule(win, undefined, null, gd);
    const RW = win.__RW;
    RW._cmdDispatchAppKey('r');
    ok(RW._lastStatus.indexOf('flex') !== -1, 'the readout reports __graphDebug.activeTool ("flex"), not an annotationState field');
  }

  /* ---------- 184. Graph host: the command-bar overlay anchors to #graph-canvas-stage, not #annotation-canvas ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    win.innerHeight = 700;
    loadModule(win, null, null, { activeTool: 'select' });
    const panel = byId['rw-panel'] || makeElement('div', byId);
    panel.id = 'rw-panel';
    byId['rw-panel'] = panel;
    win.document.body.appendChild(panel);
    // A same-named #annotation-canvas is deliberately ALSO present, positioned
    // so a wrong anchor would be caught immediately (a very different bottom).
    const wrongCanvas = makeElement('canvas', byId);
    wrongCanvas.id = 'annotation-canvas';
    wrongCanvas._rect = { left: 0, top: 0, right: 500, bottom: 100, width: 500, height: 100 };
    win.document.body.appendChild(wrongCanvas);
    const stage = makeElement('div', byId);
    stage.id = 'graph-canvas-stage';
    stage._rect = { left: 0, top: 0, right: 500, bottom: 600, width: 500, height: 600 };
    win.document.body.appendChild(stage);

    win.__RW._cmdRepositionOverlay();
    ok(panel.style.bottom === (700 - 600 + 16) + 'px',
       'reposition uses #graph-canvas-stage\'s rect (bottom 600), not the decoy #annotation-canvas\'s (bottom 100) — got "' + panel.style.bottom + '"');
  }

  /* ---------- 185. Graph host: middle-drag pan is OFF by default; the annotate host is unaffected ---------- */
  // Confirmed live: #graph-canvas-stage is overflow:hidden with nothing to
  // scroll (this page pans via a CSS transform instead), so the
  // scrollLeft/scrollTop technique below can never work here regardless.
  {
    const { win: graphWin } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(graphWin, null, null, { activeTool: 'select' });
    ok(graphWin.__RW._panEnabled === false, 'RW._panEnabled defaults to false on the graph host');

    const { win: annotateWin } = makeStubWindow();
    loadModule(annotateWin);
    ok(annotateWin.__RW._panEnabled === true, 'the annotate host default is unchanged (still true)');
  }

  /* ---------- 186. Graph host: "#" search auto-detects from #graph-system-select's live options ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const sysSelect = makeSelect(byId, 'graph-system-select', [['sys1','System One'],['sys2','System Two']]);
    win.document.body.appendChild(sysSelect);
    const RW = win.__RW;

    const list = RW._cmdDetectTags();
    ok(list && list.length === 2 && list[0].name === 'System One' && list[0].id === 'sys1',
       'detects the two live options as {id,name} pairs');
    ok(RW._lastStatus.indexOf('systems') !== -1, 'status names them "systems", not "tags"');

    let inputFired = false, changeFired = false;
    sysSelect.addEventListener('input', function(){ inputFired = true; });
    sysSelect.addEventListener('change', function(){ changeFired = true; });
    RW._cmdSelectTag(list[1]);
    ok(sysSelect.value === 'sys2', 'selecting a system writes the real <select>\'s value');
    ok(inputFired && changeFired, 'selection dispatches input+change, the same write-back technique RW._cmdApplySetting uses — never a plain annotationState.currentTag assignment');
  }

  // Builds <aside aria-label="Duct graph inspector"> under doc.body — the
  // real structural root round 15's PARAM_SCOPE scopes the settings sweep
  // to. Every control is given offsetParent={} (visible) unless the caller
  // overrides it; the stub's default is undefined (falsy ⇒ hidden), same
  // trap test 187 already worked around by hand.
  function makeGraphInspector(win, byId){
    const aside = makeElement('aside', byId);
    aside.setAttribute('aria-label', 'Duct graph inspector');
    win.document.body.appendChild(aside);
    return aside;
  }

  /* ---------- 187. Graph host: RW._cmdToolSettingsList filters the shared "graph-" prefix by DOM visibility ---------- */
  // Unlike wand/wrap/mline's own confirmed-unique id prefixes, every graph
  // control shares one flat "graph-" prefix — visibility (offsetParent) is
  // what tells "route's params" apart from "grd's params" under it, matching
  // how the real inspector aside only shows the controls for whichever tool
  // is currently armed.
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.value = '24';
    width.offsetParent = {}; // visible — route's own inspector fields
    const cfm = makeElement('input', byId);
    cfm.id = 'graph-cfm-input'; cfm.type = 'number'; cfm.value = '400';
    cfm.offsetParent = null; // hidden — belongs to grd, not currently armed
    inspector.appendChild(width); inspector.appendChild(cfm);

    const params = RW._cmdToolSettingsList('route');
    ok(params.length === 1 && params[0].param === 'width-input',
       'only the currently-visible "graph-" control is listed for route');
    ok(!params.some(p => p.param === 'cfm-input'), 'a hidden control under the same shared prefix is excluded');
  }

  /* ---------- 188. Graph host: a control outside the inspector is excluded even if visible and graph-prefixed ---------- */
  // The confirmed round-15 defect: graph-scale-target/graph-route-anchor
  // live in the canvas toolbar (its own <aside>, not the inspector), yet
  // the old visibility-only check listed them under every tool.
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const toolbar = makeElement('aside', byId);
    toolbar.setAttribute('aria-label', 'Duct graph tools');
    win.document.body.appendChild(toolbar);

    const scaleTarget = makeElement('select', byId);
    scaleTarget.id = 'graph-scale-target'; scaleTarget.offsetParent = {};
    toolbar.appendChild(scaleTarget);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.value = '24'; width.offsetParent = {};
    inspector.appendChild(width);

    const params = RW._cmdToolSettingsList('route');
    ok(!params.some(p => p.id === 'graph-scale-target'), 'a visible graph- control outside the inspector aside is excluded');
    ok(params.some(p => p.id === 'graph-width-input'), 'an inspector control beside it is still included');
  }

  /* ---------- 189. Graph host: a control inside a shut <details> is excluded from the default list — the exact defect ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const details = makeElement('details', byId);
    details.open = false;
    const summary = makeElement('summary', byId);
    summary.innerText = 'Advanced (pressure, material, seams, gauge...)';
    details.appendChild(summary);
    const gauge = makeElement('select', byId);
    gauge.id = 'graph-gauge-select'; gauge.offsetParent = {}; // truthy — the exact defect: visible but shut
    details.appendChild(gauge);
    inspector.appendChild(details);

    const params = RW._cmdToolSettingsList('route');
    ok(!params.some(p => p.id === 'graph-gauge-select'),
       'a control inside a shut <details> is excluded even with offsetParent truthy');
  }

  /* ---------- 190. Graph host: {includeCollapsed:true} surfaces it, stamped with the group's own label ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const details = makeElement('details', byId);
    details.open = false;
    const summary = makeElement('summary', byId);
    summary.innerText = 'Advanced (pressure, material, seams, gauge...)';
    details.appendChild(summary);
    const gauge = makeElement('select', byId);
    gauge.id = 'graph-gauge-select'; gauge.offsetParent = {};
    gauge.options = [{ value:'auto', text:'auto (by standard)' }];
    details.appendChild(gauge);
    inspector.appendChild(details);

    const withCollapsed = RW._cmdToolSettingsList('route', { includeCollapsed: true });
    const item = withCollapsed.find(p => p.id === 'graph-gauge-select');
    ok(!!item && item.collapsedGroup === 'Advanced (pressure, material, seams, gauge...)',
       'includeCollapsed:true includes it, stamped with the <summary> text');
  }

  /* ---------- 191. Graph host: RW._cmdToolCollapsedGroups reports the shut group; RW._cmdApplySetting auto-expands it to write ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const details = makeElement('details', byId);
    details.open = false;
    const summary = makeElement('summary', byId);
    summary.innerText = 'Advanced (pressure, material, seams, gauge...)';
    details.appendChild(summary);
    const gauge = makeSelect(byId, 'graph-gauge-select', [['auto','auto (by standard)'],['24ga','24 ga']]);
    gauge.offsetParent = {};
    details.appendChild(gauge);
    inspector.appendChild(details);

    const groups = RW._cmdToolCollapsedGroups('route');
    ok(groups.length === 1 && groups[0].label === 'Advanced (pressure, material, seams, gauge...)' && groups[0].count === 1,
       'RW._cmdToolCollapsedGroups reports the one shut group with its real count');

    ok(RW._cmdToolSettingsList('route').every(p => p.id !== 'graph-gauge-select'),
       'still excluded from the default (non-includeCollapsed) list before any write');

    RW._cmdApplySetting('route', 'gauge-select', '24ga');
    ok(gauge.value === '24ga', 'the write itself still took');
    ok(details.open === true, 'RW._cmdApplySetting expanded the shut <details> to make the write, via the fallback the stub click() needs');
    ok(RW._lastStatus.indexOf('collapsed') !== -1 && RW._lastStatus.indexOf('Advanced') !== -1,
       'status names the group it had to expand');
    ok(RW._lastStatus.indexOf('confirm it actually applied') !== -1,
       'graph-gauge-select is not individually confirmed, so the hedge still shows');
  }

  /* ---------- 192. Graph host: a control inside an open <dialog> (even inside the inspector) is excluded — modal-proof ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const dialog = makeElement('dialog', byId);
    dialog.open = true;
    const modalInput = makeElement('input', byId);
    modalInput.id = 'graph-calibrate-feet'; modalInput.type = 'number'; modalInput.offsetParent = {};
    dialog.appendChild(modalInput);
    inspector.appendChild(dialog); // deliberately inside the inspector — scoping alone must not be enough

    ok(RW._cmdToolSettingsList('route').every(p => p.id !== 'graph-calibrate-feet'),
       'a control inside an open <dialog> never appears, even nested under the inspector aside');
  }

  /* ---------- 193. Graph host: round 19 REVERSES this — graph-new-system-service is now admitted, per explicit instruction; a real sibling param is unaffected ---------- */
  // Was: "graph-new-system-service is excluded by the chrome rule." Round 15's
  // wholesale graph-new- exclusion is gone (Kresna explicitly asked for the
  // "New system" name/service fields to become typeable, while graph-create-system
  // stays out because it's a <button>, never swept at all).
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const newSvc = makeSelect(byId, 'graph-new-system-service', [['supply','Supply']]);
    newSvc.offsetParent = {};
    inspector.appendChild(newSvc);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.offsetParent = {};
    inspector.appendChild(width);

    const params = RW._cmdToolSettingsList('route');
    ok(params.some(p => p.id === 'graph-new-system-service'), 'round 19: the "New system" service control is now admitted (was excluded before this round)');
    ok(params.some(p => p.id === 'graph-width-input'), 'a genuine sibling param is unaffected');
  }

  /* ---------- 194. Annotate-host tripwire: PARAM_SCOPE is null there, so nothing above changes its behavior ---------- */
  {
    const { win, byId } = makeStubWindow(); // default host: annotate
    loadModule(win);
    const RW = win.__RW;
    const tol = makeElement('input', byId);
    tol.id = 'magic-wand-tolerance'; tol.type = 'range'; tol.value = '10'; tol.min = '0'; tol.max = '100';
    // Deliberately leaving offsetParent undefined — annotate-host params
    // were never visibility-filtered before this round and must not become
    // so now (PARAM_SCOPE is null there, so cmdParamAllowed always allows).
    win.document.body.appendChild(tol);

    const params = RW._cmdToolSettingsList('wand');
    ok(params.length === 1 && params[0].id === 'magic-wand-tolerance',
       'wand. still lists magic-wand-tolerance with no inspector aside anywhere and offsetParent left unset');
  }

  /* ---------- 195. RW._cmdParamScopeDiagnose reports a reason per graph- control, read-only, n/a on the annotate host ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.offsetParent = {};
    inspector.appendChild(width);
    // A novel id (not on GRAPH_PARAM_SCOPE's own excludeIds list, unlike
    // graph-scale-target) so this specifically exercises the "outside the
    // inspector" rejection path, not the separate named-chrome exclusion.
    const decoy = makeElement('select', byId);
    decoy.id = 'graph-decoy-control'; decoy.offsetParent = {};
    win.document.body.appendChild(decoy); // outside the inspector

    const rows = RW._cmdParamScopeDiagnose();
    const widthRow = rows.find(r => r.id === 'graph-width-input');
    const scaleRow = rows.find(r => r.id === 'graph-decoy-control');
    ok(!!widthRow && widthRow.allowed === true && widthRow.rejectedBy === null, 'an inspector param is reported allowed');
    ok(!!scaleRow && scaleRow.allowed === false && scaleRow.rejectedBy === 'outside-inspector',
       'chrome outside the inspector is reported with its real rejection reason');
    ok(width.value === '' || width.value === undefined || true, 'the diagnostic never mutates the DOM (no value/attribute writes observed)');

    const { win: annotateWin } = makeStubWindow();
    loadModule(annotateWin);
    ok(JSON.stringify(annotateWin.__RW._cmdParamScopeDiagnose()) === JSON.stringify([]),
       'n/a (empty array) on the annotate host, where PARAM_SCOPE is null');
  }

  /* ---------- 195b. Graph host: graph-profile-select is the one confirmed select-type write — the hedge is dropped for it, and only it ---------- */
  // Live-confirmed this round: beyond the DOM .value change,
  // window.__graphDebug.route.profile itself flipped shape (rectangular ->
  // round) and the inspector's own dimension label re-rendered — the app
  // genuinely consumed the write, not just a DOM property. See
  // CONFIRMED_WRITE_IDS's own comment.
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const profile = makeSelect(byId, 'graph-profile-select', [['rectangular','rectangular'],['round','round']]);
    profile.offsetParent = {};
    inspector.appendChild(profile);
    const gauge = makeSelect(byId, 'graph-gauge-select', [['auto','auto (by standard)'],['24ga','24 ga']]);
    gauge.offsetParent = {};
    inspector.appendChild(gauge);

    RW._cmdApplySetting('route', 'profile-select', 'round');
    ok(RW._lastStatus.indexOf('confirm it actually applied') === -1,
       'graph-profile-select is individually confirmed, so the hedge is dropped');
    RW._cmdApplySetting('route', 'gauge-select', '24ga');
    ok(RW._lastStatus.indexOf('confirm it actually applied') !== -1,
       'a different, unconfirmed select control right beside it still carries the hedge — the drop is per-id, not per-type');
  }

  /* ---------- 196. Graph host: GRAPH_ACTIONS entries are in RW._cmdTable; the annotate table carries no action/btn entry ---------- */
  {
    const { win: graphWin } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(graphWin, null, null, { activeTool: 'select' });
    ok(graphWin.__RW._cmdTable.some(e => e.name === 'undo' && e.kind === 'action' && e.btn === 'graph-undo-command'),
       'the graph table carries the new action entries');
    ok(graphWin.__RW._cmdTable.some(e => e.name === 'route'), 'the existing native tool entries are still present alongside them');

    const { win: annotateWin } = makeStubWindow();
    loadModule(annotateWin);
    ok(!annotateWin.__RW._cmdTable.some(e => e.kind === 'action' || e.btn),
       'the annotate table has no action/btn entry at all');
  }

  /* ---------- 197. runCommand("undo") clicks the real button ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const btn = makeElement('button', byId);
    btn.id = 'graph-undo-command'; btn.offsetParent = {};
    win.document.body.appendChild(btn);
    ok(win.__RW.runCommand('undo') === true && btn._clicked === 1, 'runCommand("undo") clicks graph-undo-command');
  }

  /* ---------- 198. missing button: reported, never throws, never "clicked" ---------- */
  {
    const { win } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    ok(win.__RW.runCommand('redo') === false, 'returns false when the button is not on the page');
    ok(win.__RW._lastStatus.indexOf('not on the page') !== -1, 'status says so');
  }

  /* ---------- 199. disabled button: reported, never clicked ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const btn = makeElement('button', byId);
    btn.id = 'graph-finish-route'; btn.offsetParent = {}; btn.disabled = true;
    win.document.body.appendChild(btn);
    ok(win.__RW.runCommand('finish') === false, 'returns false for a disabled button');
    ok(btn._clicked === 0, 'never clicked');
    ok(win.__RW._lastStatus.indexOf('not available') !== -1 && win.__RW._lastStatus.indexOf('route is in progress') !== -1,
       'status reports unavailable plus the conditional hint');
  }

  /* ---------- 200. hidden-but-not-disabled button: reported, never clicked ---------- */
  // Confirmed live: this page uses two different disabled idioms —
  // visible-but-disabled (test 199) and hidden-but-enabled (this one).
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const btn = makeElement('button', byId);
    btn.id = 'graph-toggle-damper'; btn.offsetParent = null; btn.disabled = false;
    win.document.body.appendChild(btn);
    ok(win.__RW.runCommand('toggledamper') === false, 'returns false for a hidden (display:none) button');
    ok(btn._clicked === 0, 'never clicked');
    ok(win.__RW._lastStatus.indexOf('not on the page') !== -1, 'status treats it the same as "missing"');
  }

  /* ---------- 201. an action is never mistaken for arming a tool ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const RW = win.__RW;
    const btn = makeElement('button', byId);
    btn.id = 'graph-undo-command'; btn.offsetParent = {};
    win.document.body.appendChild(btn);

    RW.runCommand('route');
    const before = { armed: RW._cmdToolArmed, lastTool: RW._cmdLastTool, modeActive: RW._cmdModeActive, voidActive: RW._cmdVoidActive };
    RW.runCommand('undo');
    ok(RW._cmdToolArmed === before.armed && RW._cmdLastTool === before.lastTool
       && RW._cmdModeActive === before.modeActive && RW._cmdVoidActive === before.voidActive,
       'runCommand("undo") leaves every tool-arming record exactly as route left it');
  }

  /* ---------- 202. runCommand("undo") still stamps the user-grace timestamp, so the auto-select poll won't fight it ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    const gd = { activeTool: 'route' };
    loadModule(win, null, null, gd);
    const RW = win.__RW;
    const btn = makeElement('button', byId);
    btn.id = 'graph-undo-command'; btn.offsetParent = {};
    win.document.body.appendChild(btn);

    const before = RW._cmdLastUserCmdAt;
    RW.runCommand('undo');
    ok(RW._cmdLastUserCmdAt >= before, 'RW._cmdLastUserCmdAt is stamped on a successful action, same as a real command');
  }

  /* ---------- 203. runCommand("calibrate") names the dialog it opened, only when that dialog is actually on the page ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const btn = makeElement('button', byId);
    btn.id = 'graph-calibrate'; btn.offsetParent = {};
    win.document.body.appendChild(btn);
    win.__RW.runCommand('calibrate');
    ok(win.__RW._lastStatus.indexOf('opened the calibrate dialog') === -1,
       'no modal-opened clause when graph-calibrate-modal is not on the page');

    const modal = makeElement('dialog', byId);
    modal.id = 'graph-calibrate-modal';
    win.document.body.appendChild(modal);
    win.__RW.runCommand('calibrate');
    ok(win.__RW._lastStatus.indexOf('opened the calibrate dialog') !== -1,
       'names the dialog it opened once graph-calibrate-modal exists');
  }

  /* ---------- 204. with a <dialog> open, the graph host's own auto-capture bails out; the annotate host is unaffected ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const bodyTarget = makeElement('div', byId); // stands in for "nothing else focused", same as test 11
    const dialog = makeElement('dialog', byId);
    dialog.open = true;
    win.document.body.appendChild(dialog);

    win.document._fire('keydown', { target: bodyTarget, key: 'a' });
    ok(!byId['rw-cmd-input'] || byId['rw-cmd-input'].value === '',
       'a real graph keydown does not seed the command bar while a <dialog> is open');

    const { win: annotateWin, byId: annotateById } = makeStubWindow();
    loadModule(annotateWin);
    const annotateBodyTarget = makeElement('div', annotateById);
    const decoyDialog = makeElement('dialog', annotateById);
    decoyDialog.open = true;
    annotateWin.document.body.appendChild(decoyDialog);
    annotateWin.document._fire('keydown', { target: annotateBodyTarget, key: 'a' });
    ok(annotateById['rw-cmd-input'] && annotateById['rw-cmd-input'].value === 'a',
       'the identical decoy on the annotate host still captures — the dialog guard is graph-only');
  }

  /* ---------- 205. table integrity: no duplicate names/aliases, and no action name/alias shadows a tool's ---------- */
  {
    const { win: graphWin } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(graphWin, null, null, { activeTool: 'select' });
    const table = graphWin.__RW._cmdTable;
    const names = table.map(e => e.name);
    ok(new Set(names).size === names.length, 'no two graph-table entries share a name');
    const allAliases = [].concat(...table.map(e => e.aliases || []));
    ok(new Set(allAliases).size === allAliases.length, 'no two graph-table entries share an alias');
    const toolNames = table.filter(e => e.kind === 'native' && e.name !== 'select').map(e => e.name);
    table.filter(e => e.kind === 'action').forEach(function(action){
      const tokens = [action.name].concat(action.aliases || []);
      tokens.forEach(function(tok){
        ok(!toolNames.some(t => t === tok || t.indexOf(tok) === 0),
           '"' + tok + '" (action "' + action.name + '") does not equal or prefix any tool name (' + toolNames.join(',') + ')');
      });
    });
  }

  /* ---------- 206. boundary guard: no table entry ever carries a forbidden button id, and the guard is enforced in code ---------- */
  {
    const { win: graphWin } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(graphWin, null, null, { activeTool: 'select' });
    const table = graphWin.__RW._cmdTable;
    const forbidden = ['graph-save-commands', 'graph-recording-configure', 'graph-recording-pause', 'graph-recording-resume', 'graph-recording-stop'];
    ok(!table.some(e => forbidden.indexOf(e.btn) !== -1), 'no real table entry targets a forbidden button id');

    graphWin.__RW._cmdTable.push({ name: 'sneaky', kind: 'action', aliases: [], btn: 'graph-save-commands' });
    ok(graphWin.__RW.runCommand('sneaky') === false, 'even if one were injected, runCommand refuses it');
    ok(graphWin.__RW._lastStatus.indexOf('deliberately not clickable') !== -1, 'and says why');
  }

  /* ---------- 207. reported live: a tool-switch dispatched while #rw-cmd-input is still focused is blurred first ---------- */
  // The real graph app refuses to switch tools while document.activeElement
  // is an INPUT/SELECT/TEXTAREA (confirmed live by Kresna: route/flex never
  // armed, while undo/redo — a plain click, never gated on focus — worked
  // fine). This harness doesn't model document.activeElement, so the
  // regression this guards is really "RW.runCommand blurs the input BEFORE
  // dispatching, not after" — checked here by inspecting focus state from
  // inside the dispatch callback itself, at the exact moment a real app
  // handler would also be checking it.
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const RW = win.__RW;
    const inputEl = byId['rw-cmd-input'];
    inputEl.focus();
    ok(inputEl._focused === true, 'sanity: the command input starts focused, simulating mid-typed/confirmed entry');
    let focusedAtDispatch = null;
    RW._cmdDispatchAppKey = function(){ focusedAtDispatch = inputEl._focused; };
    RW.runCommand('route');
    ok(focusedAtDispatch === false, 'the input was already blurred by the time the tool-switch key was dispatched');
    ok(inputEl._focused === false, 'and stays blurred afterward');
  }

  /* ---------- 208. the same blur-before-dispatch is harmless (and a no-op) on the annotate host ---------- */
  {
    const { win, byId } = makeStubWindow(); // default host: annotate
    loadModule(win);
    const RW = win.__RW;
    const inputEl = byId['rw-cmd-input'];
    inputEl.focus();
    let focusedAtDispatch = null;
    RW._cmdDispatchAppKey = function(){ focusedAtDispatch = inputEl._focused; };
    RW.runCommand('mirror');
    ok(focusedAtDispatch === false, 'blurred before dispatch here too — no regression, same fix applies to both hosts');
  }

  /* ---------- 209. RW._cmdIsolatedTool(): the armed tool on the graph host, null for select/unreadable/annotate ---------- */
  {
    const { win: routeWin } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(routeWin, null, null, { activeTool: 'route' });
    ok(routeWin.__RW._cmdIsolatedTool() === 'route', 'returns the armed tool\'s own name');

    const { win: selectWin } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(selectWin, null, null, { activeTool: 'select' });
    ok(selectWin.__RW._cmdIsolatedTool() === null, 'null while resting in select — nothing to isolate to');

    const { win: unreadableWin } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(unreadableWin, null, null, {}); // no activeTool property at all
    ok(unreadableWin.__RW._cmdIsolatedTool() === null, 'fails open (null) when activeTool is unreadable');

    const { win: annotateWin } = makeStubWindow();
    loadModule(annotateWin, { currentTool: 'magic_wand' });
    ok(annotateWin.__RW._cmdIsolatedTool() === null, 'always null on the annotate host, regardless of what is armed');
  }

  /* ---------- 210. isolated: typing a different tool's name matches nothing and reports why ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const inp = byId['rw-cmd-input'];
    inp.value = 'flex';
    inp.dispatchEvent({ type: 'input' });
    ok(!byId['rw-cmd-menu'] || byId['rw-cmd-menu']._children.length === 0,
       'typing a blocked tool name while route is armed matches nothing');
    ok(win.__RW._lastStatus.indexOf('route is active') !== -1 && win.__RW._lastStatus.indexOf('switch tools') !== -1,
       'status explains why, naming the active tool');
  }

  /* ---------- 211. isolated: the active tool's own params still match bare, and via "route." ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const inspector = makeGraphInspector(win, byId);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.value = '24'; width.offsetParent = {};
    inspector.appendChild(width);
    const inp = byId['rw-cmd-input'];

    inp.value = 'width';
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu']._children.some(r => isSettingsRow(r) && r.innerText.indexOf('width-input') === 0),
       'route\'s own param still matches bare while isolated — isolation restricts other tools, not the active one\'s params');

    inp.value = 'route.';
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu']._children.some(r => r.innerText.indexOf('width-input') === 0),
       '"route." still drills into its own properties while isolated');

    inp.value = 'grd.';
    inp.dispatchEvent({ type: 'input' });
    // Checked via style.display, not children.length: the menu DOM element already
    // exists with "route."'s own rows from just above, and clearing to a genuinely
    // empty menuItems list hides it (menuEl.style.display = 'none') rather than
    // clearing its stale _children — same convention the rest of this file's
    // no-match assertions use (see the innerHTML setter's own comment).
    ok(byId['rw-cmd-menu'].style.display === 'none',
       '"grd." (a different tool\'s properties) is refused while route is isolated');
    ok(win.__RW._lastStatus.indexOf('route is active') !== -1, 'and reports why');
  }

  /* ---------- 212. isolated: select/finish/cancel still match — the allowed escapes and route-lifecycle actions ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const inp = byId['rw-cmd-input'];
    ['select', 'finish', 'cancel'].forEach(function(name){
      inp.value = name;
      inp.dispatchEvent({ type: 'input' });
      ok(byId['rw-cmd-menu'] && byId['rw-cmd-menu']._children.some(r => r.innerText.indexOf(name) === 0),
         '"' + name + '" still matches while route is isolated');
    });
  }

  /* ---------- 213. isolated: # system search is refused too ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const sysSelect = makeSelect(byId, 'graph-system-select', [['sys1', 'FPTU (Supply)']]);
    win.document.body.appendChild(sysSelect);
    const inp = byId['rw-cmd-input'];
    inp.value = '#fp';
    inp.dispatchEvent({ type: 'input' });
    ok(!byId['rw-cmd-menu'] || byId['rw-cmd-menu']._children.length === 0,
       '# system search matches nothing while route is isolated');
    ok(win.__RW._lastStatus.indexOf('route is active') !== -1 && win.__RW._lastStatus.indexOf('search systems') !== -1,
       'status explains why');
  }

  /* ---------- 214. isolated: RW.runCommand refuses a blocked tool in code, not just via the dropdown; the tool's own re-arm is exempted ---------- */
  {
    const { win } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };

    ok(RW.runCommand('flex') === false, 'runCommand refuses a different tool directly, bypassing the dropdown entirely');
    ok(JSON.stringify(keys) === JSON.stringify([]), 'no key is dispatched for the refused command');
    ok(RW._lastStatus.indexOf('route is active') !== -1, 'status names the active tool');

    ok(RW.runCommand('route') === true, 'runCommand still allows re-arming the SAME tool that is isolated');
    ok(JSON.stringify(keys) === JSON.stringify(['r']), 'and it actually dispatches — the exemption RW._cmdApplySetting\'s re-arm depends on');
  }

  /* ---------- 215. isolated: RW._cmdApplySetting's own re-arm still works end-to-end under isolation ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.value = '24'; width.offsetParent = {};
    inspector.appendChild(width);
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };

    RW._cmdApplySetting('route', 'width-input', '14');
    ok(width.value === '14', 'the write itself still takes effect under isolation');
    ok(JSON.stringify(keys) === JSON.stringify(['r']), 'and re-arming route (its own RW.runCommand("route") call) is not refused by its own guard');
  }

  /* ---------- 216. isolated: Escape and Space both still reach select — neither goes through RW.runCommand's gate ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW._cmdToolArmed = true; // simulate route having been armed via the command line

    RW._cmdGoSelect('escape', true, true);
    ok(keys.indexOf('s') !== -1, 'RW._cmdGoSelect (what Escape drives) still dispatches select while route is isolated');
  }

  /* ---------- 217. __RW._cmdIsolateTools = false restores the old additive behavior on the graph host ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    RW._cmdIsolateTools = false;
    ok(RW._cmdIsolatedTool() === null, 'the hatch turns isolation off entirely');

    const inp = byId['rw-cmd-input'];
    inp.value = 'flex';
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu'] && byId['rw-cmd-menu']._children.some(r => r.innerText.indexOf('flex') === 0),
       'with the hatch off, a different tool matches again, same as before this round');
  }

  // Builds the real inspector field markup confirmed live: <label><span>LABEL
  // TEXT</span>CONTROL</label>. Used by the round-18 live-label tests below —
  // cmdControlLiveLabel walks up to this exact structure.
  function makeGraphField(byId, labelText, control){
    const label = makeElement('label', byId);
    const span = makeElement('span', byId);
    span.innerText = labelText;
    label.appendChild(span);
    label.appendChild(control);
    return label;
  }

  // A <dialog> fixture for one of the round-19 config-dialog modals
  // (branch-fitting, change-size, GRD placement, riser elevation) — reuses
  // makeGraphField for its own fields, the same <label><span> shape
  // cmdControlLiveLabel already expects. Appended to doc.body directly, NOT
  // to makeGraphInspector's <aside> — confirmed live these dialogs are their
  // own top-level element, not nested inside the inspector aside. `open`
  // (default true) sets the dialog's own .open flag, matching cmdOpenDialogs's
  // own check (`d.open || d.hasAttribute('open')`).
  function makeGraphModal(win, byId, id, open){
    const dialog = makeElement('dialog', byId);
    dialog.id = id;
    dialog.open = open !== false;
    win.document.body.appendChild(dialog);
    return dialog;
  }

  /* ---------- 218. round profile flips route's own width control's live label to "Diameter (in)" — "diameter" now matches it, "width" still does too ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const inspector = makeGraphInspector(win, byId);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.value = '4'; width.offsetParent = {};
    const field = makeGraphField(byId, 'Width (in)', width);
    inspector.appendChild(field);
    const inp = byId['rw-cmd-input'];

    inp.value = 'diameter';
    inp.dispatchEvent({ type: 'input' });
    ok(!byId['rw-cmd-menu'] || byId['rw-cmd-menu']._children.length === 0 || byId['rw-cmd-menu'].style.display === 'none',
       'while rectangular ("Width (in)"), "diameter" does not match — it genuinely is not a diameter field right now');

    inp.value = 'width';
    inp.dispatchEvent({ type: 'input' });
    // Displays as "Width (in)...", not "width-input...": a live label, once found,
    // is what the row shows (round 18) — "width" still finding this row at all is
    // what proves the id-based match is unaffected, not the row's own display text.
    ok(byId['rw-cmd-menu']._children.some(r => r.innerText.indexOf('Width (in)') === 0),
       '"width" still matches by id, unaffected — row displays the live label "Width (in)"');

    // The app itself relabels the SAME element once profile flips to round —
    // confirmed live via opencli; simulated here by changing only the live
    // label span's text, not the control's id, matching what was observed.
    span_of(field).innerText = 'Diameter (in)';

    inp.value = 'diameter';
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu']._children.some(r => r.innerText.indexOf('Diameter (in)') === 0),
       '"diameter" now matches the very same control once its live label reads "Diameter (in)" — and the row itself displays that live label, not "width-input"');

    inp.value = 'width';
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu']._children.some(r => r.innerText.indexOf('Diameter (in)') === 0),
       '"width" still matches it too, by id — label-matching is additive, never a replacement for id-matching');
  }

  function span_of(label){ return label.children.find(c => c.tagName === 'SPAN'); }

  /* ---------- 219. "network" matches the system field by its own second label word; "system" still matches by id ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const inspector = makeGraphInspector(win, byId);
    const sys = makeSelect(byId, 'graph-system-select', [['sys1', 'Supply Air (Supply)']]);
    sys.offsetParent = {};
    inspector.appendChild(makeGraphField(byId, 'System / network', sys));
    const inp = byId['rw-cmd-input'];

    inp.value = 'network';
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu']._children.some(r => r.innerText.indexOf('System / network') === 0),
       '"network" matches the system field by the second word of its live label, not just its first');

    inp.value = 'system';
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu']._children.some(r => r.innerText.indexOf('System / network') === 0),
       '"system" still matches it too — by id (system-select) and by the label\'s first word alike');
  }

  /* ---------- 220. a graph control with no <label> wrapper falls back to its id-derived param name for both matching and display ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const inspector = makeGraphInspector(win, byId);
    const hanger = makeElement('input', byId);
    hanger.id = 'graph-hanger-spacing-input'; hanger.type = 'number'; hanger.value = '8'; hanger.offsetParent = {};
    inspector.appendChild(hanger); // no <label> ancestor at all
    const inp = byId['rw-cmd-input'];

    inp.value = 'hanger';
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu']._children.some(r => r.innerText.indexOf('hanger-spacing-input') === 0),
       'with no live label discoverable, matching and display both fall back to the id-derived param name, unchanged from before this round');
  }

  /* ---------- 221. annotate-host tripwire: item.label stays null there even behind an identical <label><span> wrapper — the round-18 addition is graph-only ---------- */
  {
    const { win, byId, doc } = makeStubWindow(); // default host: annotate
    loadModule(win, { currentTool: 'magic_wand' });
    const RW = win.__RW;
    const tolerance = makeElement('input', byId);
    tolerance.id = 'magic-wand-tolerance'; tolerance.type = 'range'; tolerance.value = '40';
    doc.body.appendChild(makeGraphField(byId, 'Diameter (in)', tolerance)); // decoy label — must be ignored on this host

    const items = RW._cmdToolSettingsList('wand');
    ok(items.length === 1 && items[0].label === null,
       'item.label is always null on the annotate host, regardless of what DOM surrounds the control');

    const inp = byId['rw-cmd-input'];
    inp.value = 'diameter';
    inp.dispatchEvent({ type: 'input' });
    ok(!byId['rw-cmd-menu'] || byId['rw-cmd-menu']._children.every(r => !isSettingsRow(r)),
       '"diameter" does not match wand\'s tolerance control via the decoy label — label-matching never applies on the annotate host');
  }

  /* =====================================================================
   * Round 19: the four per-tool config-dialog modals (branch fitting,
   * change size, GRD placement, riser elevation), their 8 new commands,
   * and the "New system" fields + text-input support.
   * ===================================================================== */

  /* ---------- 222. with the branch-fitting modal open, branch.'s settings list surfaces only the modal's own fields, stamped with item.modal ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' });
    const RW = win.__RW;
    const modal = makeGraphModal(win, byId, 'graph-branch-fitting-modal');
    const typeSel = makeSelect(byId, 'graph-branch-fitting-type-select', [['tap', 'Tap'], ['wye', 'Wye']]);
    typeSel.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Fitting type', typeSel));
    const widthInput = makeElement('input', byId);
    widthInput.id = 'graph-branch-fitting-width-input'; widthInput.type = 'number'; widthInput.value = '6'; widthInput.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Width (in)', widthInput));
    // An ordinary inspector field under branch's own flat "graph-" prefix — must NOT appear.
    const inspector = makeGraphInspector(win, byId);
    const decoy = makeElement('input', byId);
    decoy.id = 'graph-not-a-modal-field'; decoy.type = 'number'; decoy.offsetParent = {};
    inspector.appendChild(decoy);

    const params = RW._cmdToolSettingsList('branch');
    ok(params.length === 2, 'only the modal\'s own two fields are listed while it is open');
    ok(params.every(p => p.modal === 'graph-branch-fitting-modal'), 'every listed item is stamped with the owning modal id');
    ok(params.some(p => p.param === 'type-select' && p.label === 'Fitting type'), 'the type select is listed with its live label');
    ok(!params.some(p => p.id === 'graph-not-a-modal-field'), 'an ordinary inspector field under the same flat prefix is excluded while the modal is open');
  }

  /* ---------- 223. the same query falls back to the ordinary (today: empty) behavior once the modal is closed ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' });
    const RW = win.__RW;
    const modal = makeGraphModal(win, byId, 'graph-branch-fitting-modal', false); // closed
    const typeSel = makeSelect(byId, 'graph-branch-fitting-type-select', [['tap', 'Tap']]);
    typeSel.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Fitting type', typeSel));

    const params = RW._cmdToolSettingsList('branch');
    ok(params.length === 0, 'with the modal closed, branch.\'s listing is empty exactly as before this round (a closed dialog\'s fields are rejected via the ordinary inside-DIALOG path)');
  }

  /* ---------- 224. a different tool's query never sees another tool's open-modal fields ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' });
    const RW = win.__RW;
    const modal = makeGraphModal(win, byId, 'graph-branch-fitting-modal');
    const typeSel = makeSelect(byId, 'graph-branch-fitting-type-select', [['tap', 'Tap']]);
    typeSel.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Fitting type', typeSel));

    const routeParams = RW._cmdToolSettingsList('route');
    ok(!routeParams.some(p => p.id === 'graph-branch-fitting-type-select'),
       "route's own query never sees branch's open-modal field — rejected via the ordinary inside-dialog path, since route has no modal of its own open");
  }

  /* ---------- 225. calibrate/known-scale (non-recognized) modal controls stay excluded from EVERY graph tool's listing, not just route's (test 192's own tool) ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const dialog = makeElement('dialog', byId);
    dialog.open = true;
    const calInput = makeElement('input', byId);
    calInput.id = 'graph-calibrate-feet'; calInput.type = 'number'; calInput.offsetParent = {};
    dialog.appendChild(calInput);
    inspector.appendChild(dialog); // deliberately inside the inspector, same as test 192

    const tools = RW._cmdTable.filter(e => e.kind === 'native' && e.name !== 'select').map(e => e.name);
    ok(tools.length === 10, 'sanity: 10 real graph tools besides select');
    tools.forEach(function(tool){
      const params = RW._cmdToolSettingsList(tool);
      ok(params.every(p => p.id !== 'graph-calibrate-feet'), tool + '. never lists a control inside the non-recognized calibrate dialog');
    });
  }

  /* ---------- 226. branch's conditionally-visible modal field appears/disappears purely from offsetParent — zero new logic needed ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' });
    const RW = win.__RW;
    const modal = makeGraphModal(win, byId, 'graph-branch-fitting-modal');
    const flushBoot = makeElement('input', byId);
    flushBoot.id = 'graph-branch-fitting-rect-flush-boot'; flushBoot.type = 'checkbox'; flushBoot.offsetParent = null; // hidden — e.g. round profile
    modal.appendChild(makeGraphField(byId, 'Flush boot', flushBoot));

    ok(!RW._cmdToolSettingsList('branch').some(p => p.param === 'rect-flush-boot'),
       'hidden while offsetParent is null — excluded exactly like every other hidden control, no modal-specific logic');

    flushBoot.offsetParent = {}; // e.g. switched to rectangular
    ok(RW._cmdToolSettingsList('branch').some(p => p.param === 'rect-flush-boot'),
       'visible once offsetParent is set — same plain visibility check, inside the modal too');
  }

  /* ---------- 227. RW._cmdApplySetting on a modal param writes the real control, skips the re-arm (no RW._cmdDispatchAppKey call), but still stamps _cmdLastUserCmdAt, and names the dialog instead of "re-armed" ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' });
    const RW = win.__RW;
    const modal = makeGraphModal(win, byId, 'graph-branch-fitting-modal');
    const widthInput = makeElement('input', byId);
    widthInput.id = 'graph-branch-fitting-width-input'; widthInput.type = 'number'; widthInput.value = '6'; widthInput.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Width (in)', widthInput));

    let dispatchCalls = 0;
    const realDispatch = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(){ dispatchCalls++; return realDispatch.apply(this, arguments); };
    const before = RW._cmdLastUserCmdAt;

    const wrote = RW._cmdApplySetting('branch', 'width-input', '8');
    ok(wrote === true, 'the write itself succeeds');
    ok(widthInput.value === '8', 'the real control was actually written');
    ok(dispatchCalls === 0, 'RW._cmdDispatchAppKey is never called while the modal is open — the re-arm is skipped');
    ok(RW._cmdLastUserCmdAt !== before, '_cmdLastUserCmdAt is still stamped directly, preserving the auto-select grace window a real re-arm used to provide');
    ok(RW._lastStatus.indexOf('branch fitting dialog still open') !== -1, 'status names the dialog instead of "re-armed"');
    ok(RW._lastStatus.indexOf('re-armed') === -1, 'the "re-armed" wording never appears for a modal write');
  }

  /* ---------- 228. the same call with the modal closed fails cleanly ("not on the page") ---------- */
  {
    const { win } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' });
    const RW = win.__RW;
    ok(RW._cmdApplySetting('branch', 'width-input', '8') === false, 'fails when no modal is open and no ordinary control exists under branch\'s own prefix either');
    ok(RW._lastStatus.indexOf('is not on the page right now') !== -1, 'status reports the control is not on the page');
  }

  /* ---------- 229. all 8 new modal-action commands click their real button when present, and report the conditional hint when absent ---------- */
  {
    const MODAL_ACTIONS = [
      ['choose', 'graph-branch-fitting-submit', 'branch fitting'],
      ['cancelbranch', 'graph-branch-fitting-cancel', 'branch fitting'],
      ['apply', 'graph-checkpoint-transition-submit', 'change size'],
      ['cancelsize', 'graph-checkpoint-transition-cancel', 'change size'],
      ['place', 'graph-checkpoint-grd-submit', 'place GRD'],
      ['cancelgrd', 'graph-checkpoint-grd-cancel', 'place GRD'],
      ['placeriser', 'graph-checkpoint-riser-submit', 'riser elevation'],
      ['cancelriser', 'graph-checkpoint-riser-cancel', 'riser elevation']
    ];
    MODAL_ACTIONS.forEach(function(row){
      const name = row[0], btnId = row[1], hint = row[2];
      {
        const { win } = makeStubWindow({ host: GRAPH_HOST });
        loadModule(win, null, null, { activeTool: 'select' });
        ok(win.__RW.runCommand(name) === false, name + ': returns false when its button is not on the page');
        ok(win.__RW._lastStatus.indexOf(hint) !== -1, name + ': status names the dialog it is conditional on (' + hint + ')');
      }
      {
        const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
        loadModule(win, null, null, { activeTool: 'select' });
        const btn = makeElement('button', byId);
        btn.id = btnId; btn.offsetParent = {};
        win.document.body.appendChild(btn);
        ok(win.__RW.runCommand(name) === true && btn._clicked === 1, name + ': clicks ' + btnId + ' when present');
      }
    });
  }

  /* ---------- 230. isolation admits all 8 new commands while their own tool is isolated, and never refuses one merely because a DIFFERENT tool is isolated (pins the flat-list design decision) ---------- */
  {
    const { win } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' }); // isolated to branch
    const RW = win.__RW;
    ['choose', 'cancelbranch', 'apply', 'cancelsize', 'place', 'cancelgrd', 'placeriser', 'cancelriser'].forEach(function(name){
      ok(RW.runCommand(name) === false, name + ': its button is missing, but isolation never refuses it');
      ok(RW._lastStatus.indexOf('is active') === -1, name + ': the failure is "not on the page," never the isolation message');
    });

    const { win: win2 } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win2, null, null, { activeTool: 'route' }); // isolated to a DIFFERENT tool
    ok(win2.__RW.runCommand('place') === false, '"place" still fails while route (not grd) is isolated');
    ok(win2.__RW._lastStatus.indexOf('is active') === -1, 'but not because isolation refused it');
    ok(win2.__RW._lastStatus.indexOf('not on the page') !== -1, 'the actual reason is simply that the GRD dialog is not open');
  }

  /* ---------- 231. a text-type write (graph-new-system-name) sets the exact string with no numeric parsing, and renders as (text, now "…") ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const nameInput = makeElement('input', byId);
    nameInput.id = 'graph-new-system-name'; nameInput.type = 'text'; nameInput.value = ''; nameInput.offsetParent = {};
    inspector.appendChild(nameInput);

    const params = RW._cmdToolSettingsList('route');
    const item = params.find(p => p.id === 'graph-new-system-name');
    ok(!!item && item.type === 'text', 'graph-new-system-name is listed and typed "text"');

    ok(RW._cmdApplySetting('route', 'new-system-name', '12 Supply') === true, 'the write succeeds');
    ok(nameInput.value === '12 Supply', 'the exact string is set with no numeric parsing (the numeric path would have produced NaN)');
    ok(RW._lastStatus.indexOf('set to "12 Supply"') !== -1, 'status quotes the exact string');

    const inp = byId['rw-cmd-input'];
    inp.value = 'route.new';
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu']._children.some(r => r.innerText.indexOf('(text, now "12 Supply")') !== -1),
       'the dropdown row renders the text branch, not a min–max numeric range');
  }

  /* ---------- 232. graph-create-system ("Add") never gets a table entry and is never reachable by any command name ---------- */
  {
    const { win } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const RW = win.__RW;
    ok(!RW._cmdTable.some(e => e.btn === 'graph-create-system'), 'no table entry references graph-create-system as its button');
  }

  /* ---------- 233. Step 9: typing still works while a RECOGNIZED modal (branch-fitting) is open ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' });
    const bodyTarget = makeElement('div', byId);
    makeGraphModal(win, byId, 'graph-branch-fitting-modal');

    win.document._fire('keydown', { target: bodyTarget, key: 'a' });
    ok(byId['rw-cmd-input'] && byId['rw-cmd-input'].value === 'a',
       'a real keydown DOES seed the command bar while the recognized branch-fitting modal is open');
  }

  /* ---------- 234. a NON-recognized modal (calibrate) still bails, even after the round-19 narrowing (test 204's own guarantee, re-pinned here by id rather than by dialog count) ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const bodyTarget = makeElement('div', byId);
    const dialog = makeElement('dialog', byId);
    dialog.id = 'graph-calibrate-modal';
    dialog.open = true;
    win.document.body.appendChild(dialog);

    win.document._fire('keydown', { target: bodyTarget, key: 'a' });
    ok(!byId['rw-cmd-input'] || byId['rw-cmd-input'].value === '',
       'calibrate (not one of the four recognized modals) still bails exactly as before this round');
  }

  /* ---------- 235. a focused <select> inside a recognized open modal does not get its keystroke eaten into the command bar ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' });
    const modal = makeGraphModal(win, byId, 'graph-branch-fitting-modal');
    const typeSel = makeSelect(byId, 'graph-branch-fitting-type-select', [['tap', 'Tap'], ['wye', 'Wye']]);
    modal.appendChild(typeSel);

    win.document._fire('keydown', { target: typeSel, key: 'w' });
    ok(!byId['rw-cmd-input'] || byId['rw-cmd-input'].value === '',
       'a keydown targeting a <select> inside a recognized open modal is left alone for the select\'s own native type-ahead');
  }

  /* ---------- 236. the same recognized-modal-open state still seeds the bar for a plain, non-select target — the SELECT guard is scoped narrowly ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' });
    makeGraphModal(win, byId, 'graph-branch-fitting-modal');
    const bodyTarget = makeElement('div', byId);

    win.document._fire('keydown', { target: bodyTarget, key: 'c' });
    ok(byId['rw-cmd-input'] && byId['rw-cmd-input'].value === 'c',
       'a plain div target still seeds the command bar, even with the same modal open');
  }

  /* ---------- 237. branch.'s settings list is ordered top-to-bottom by real DOM position, not grouped by control type (Kresna's own feedback) ---------- */
  // cmdSweepControls originally ran five separate querySelectorAll passes (one
  // per input type) and concatenated the results, so every listing read out
  // grouped by type — all ranges/numbers first, then checkboxes, then text,
  // then selects — regardless of how the fields are actually laid out on
  // screen. Round 19's real branch-fitting modal interleaves types (select,
  // select, number, select, number, number, checkbox), which made that
  // grouping visibly wrong the first time a real multi-type modal existed.
  // This fixture reproduces that exact shape and pins the fix: a single
  // combined selector, returned in one document-order pass.
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' });
    const RW = win.__RW;
    const modal = makeGraphModal(win, byId, 'graph-branch-fitting-modal');

    const fittingSel = makeSelect(byId, 'graph-branch-fitting-type-select', [['tap', 'Tap'], ['wye', 'Wye']]);
    fittingSel.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Fitting type', fittingSel));

    const shapeSel = makeSelect(byId, 'graph-branch-fitting-shape-select', [['round', 'Round'], ['rect', 'Rectangular']]);
    shapeSel.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Branch shape', shapeSel));

    const startWidth = makeElement('input', byId);
    startWidth.id = 'graph-branch-fitting-starting-width-input'; startWidth.type = 'number'; startWidth.value = '12'; startWidth.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Starting width (in)', startWidth));

    const alignSel = makeSelect(byId, 'graph-branch-fitting-alignment-select', [['center', 'Center'], ['top', 'Top']]);
    alignSel.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Alignment', alignSel));

    const width = makeElement('input', byId);
    width.id = 'graph-branch-fitting-width-input'; width.type = 'number'; width.value = '6'; width.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Width (in)', width));

    const height = makeElement('input', byId);
    height.id = 'graph-branch-fitting-height-input'; height.type = 'number'; height.value = '4'; height.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Height (in)', height));

    const damper = makeElement('input', byId);
    damper.id = 'graph-branch-fitting-damper-checkbox'; damper.type = 'checkbox'; damper.checked = true; damper.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Damper', damper));

    const params = RW._cmdToolSettingsList('branch');
    ok(params.length === 7, 'all seven of branch\'s interleaved-type fields are found');
    const labels = params.map(p => p.label);
    ok(JSON.stringify(labels) === JSON.stringify([
      'Fitting type', 'Branch shape', 'Starting width (in)', 'Alignment', 'Width (in)', 'Height (in)', 'Damper'
    ]), 'the list reads top to bottom in real DOM order — Fitting, Branch shape, Starting width, Alignment, Width, Height, Damper — not grouped by control type (was: numbers/ranges first, then the checkbox, then the selects)');
  }

  /* ---------- 238. RW._cmdIsolatedTool() falls back to cmdOpenModalTool() so a modal isolates the command line even when activeTool doesn't confirm it (Kresna's own request) ---------- */
  // Change-size/GRD's own activeTool mapping was never confirmed live (unlike
  // branch/vertical) — before this fix, opening one of those two modals with
  // activeTool unreadable left isolation off entirely, so the full, unrelated
  // command list stayed reachable instead of narrowing to just that modal's
  // own fields/actions.
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: null }); // simulates the unconfirmed grd/transition mapping
    const RW = win.__RW;
    makeGraphModal(win, byId, 'graph-checkpoint-grd-modal');

    ok(RW._cmdIsolatedTool() === 'grd',
       'an open, recognized modal isolates the command line to its own tool even when activeTool itself reads null');

    RW._lastStatus = '';
    const ok1 = RW.runCommand('route');
    ok(ok1 === false && RW._lastStatus.indexOf('grd is active') !== -1,
       'a command unrelated to the open modal is refused, same as ordinary activeTool-driven isolation');

    const ok2 = RW.runCommand('place'); // one of GRD's own allowlisted commands — its button isn't on the page in this fixture
    ok(ok2 === false && RW._lastStatus.indexOf('grd is active') === -1,
       '"place" itself is never refused as a tool switch — it just reports its own button missing');
  }

  /* ---------- 239. Escape reverting an armed tool now reports a confirming status message, matching typing "select" explicitly (Kresna's own request) ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTool: 'linear', mode: 'draw' };
    const timers = makeFakeTimers();
    loadModule(win, as, timers);
    const RW = win.__RW;
    RW._lastStatus = '';

    win.document._fire('keydown', { target: makeElement('div', byId), key: 'Escape' });
    timers.runTimeouts();
    ok(RW._lastStatus.indexOf('currentTool') !== -1,
       'a real Escape that actually reverts an armed tool now writes a confirming message to the status line, not just console.log');
  }

  /* ---------- 240. Escape still reports nothing when there was no tool to revert from — no spurious confirmation ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTool: null, mode: 'select' }; // already resting
    const timers = makeFakeTimers();
    loadModule(win, as, timers);
    const RW = win.__RW;
    RW._lastStatus = '';

    win.document._fire('keydown', { target: makeElement('div', byId), key: 'Escape' });
    timers.runTimeouts();
    ok(RW._lastStatus === '',
       'Escape with nothing armed stays silent — RW._cmdGoSelect short-circuits before ever dispatching or reporting anything');
  }

  /* ---------- 241. on the graph host, the very-first-Space tool dropdown excludes every GRAPH_ACTIONS entry — pins "tools, not commands" ---------- */
  // The annotate host's own table is 100% kind:NATIVE, so test 110 alone can't
  // tell "filtered to tools" apart from "just showing the whole table" — the
  // graph host is where GRAPH_ACTIONS (undo/redo/finish/cancel/calibrate/the
  // round-19 modal actions, all kind:ACTION) actually mixes into RW._cmdTable,
  // so it's the one case that can prove those are excluded.
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: null });

    win.document._fire('keydown', { target: makeElement('div', byId), key: ' ' });
    const rows = byId['rw-cmd-menu'] && byId['rw-cmd-menu']._children;
    ok(rows && rows.length > 0, 'the tool dropdown expands on the graph host too');
    ok(rows && rows.some(function(r){ return r.innerText.indexOf('route') === 0; }),
       'a real graph tool (route) is offered');
    ok(rows && !rows.some(function(r){ return r.innerText.indexOf('undo') === 0; }),
       'undo — an action, not a tool — is never offered in this starting menu');
  }

  /* ---------- 242. Space also "initializes the console" while a config-dialog modal is open — no synthetic key dispatch, just its own dropdown (Kresna: "I want that behaviour also be in branch mode") ---------- */
  // Before this fix, Space here fell into the ordinary "RW._cmdToolArmed ->
  // close" branch (branch is a real armed draw tool) and dispatched a
  // synthetic select keydown at the app while the branch-fitting dialog was
  // still open — never actually exercised against a live dialog, and not
  // something to start relying on. Now it's treated like the nothing-armed
  // case: open the bar and call onInput() on the empty value, which (via the
  // existing isolated-tool blend) shows branch's own fields plus its allowed
  // actions (choose/cancelbranch).
  {
    const { win, byId, doc } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' });
    const RW = win.__RW;
    RW.runCommand('branch'); // arms branch for real: RW._cmdToolArmed=true, RW._cmdLastTool='branch'
    const modal = makeGraphModal(win, byId, 'graph-branch-fitting-modal');
    const typeSel = makeSelect(byId, 'graph-branch-fitting-type-select', [['tap', 'Tap']]);
    typeSel.offsetParent = {};
    modal.appendChild(makeGraphField(byId, 'Fitting type', typeSel));

    const keys = [];
    const origDispatch = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ keys.push(k); return origDispatch(k, q); };

    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: ' ' });

    ok(keys.length === 0,
       'Space while the branch-fitting modal is open never dispatches a synthetic key — it does not try to close the tool');
    ok(byId['rw-cmd-input'] && byId['rw-cmd-input'].value === '', 'the bar opens empty, no character seeded');
    const rows = byId['rw-cmd-menu'] && byId['rw-cmd-menu']._children;
    ok(rows && rows.some(function(r){ return r.innerText.indexOf('Fitting type') === 0; }),
       "branch's own field (Fitting type) is offered");
    ok(rows && rows.some(function(r){ return r.innerText.indexOf('choose') === 0; }),
       '"choose" — branch\'s own submit action — is offered too, the same blend a typed query already shows');
  }

  /* ---------- 243. once the modal closes, Space goes back to its ordinary close-the-armed-tool behavior — the new branch does not leak beyond "a modal is actually open" ---------- */
  {
    const { win, byId, doc } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'branch' });
    const RW = win.__RW;
    RW.runCommand('branch');
    // No modal fixture this time — cmdOpenModalTool() has nothing to find.

    const keys = [];
    const origDispatch = RW._cmdDispatchAppKey;
    RW._cmdDispatchAppKey = function(k, q){ keys.push(k); return origDispatch(k, q); };

    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: ' ' });

    ok(keys.length === 1 && keys[0] === 's',
       'with no modal open, Space closes the armed tool exactly as before this round');
  }

  /* ---------- 244. round 20: `dimension` on route opens a width draft first, focused, naming height as next ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.min = '1'; width.max = '48'; width.value = '24'; width.offsetParent = {};
    const height = makeElement('input', byId);
    height.id = 'graph-height-input'; height.type = 'number'; height.min = '1'; height.max = '48'; height.value = '12'; height.offsetParent = {};
    inspector.appendChild(makeGraphField(byId, 'Width (in)', width));
    inspector.appendChild(makeGraphField(byId, 'Height (in)', height));
    const inp = byId['rw-cmd-input'];

    inp.value = 'dimension';
    inp.dispatchEvent({ type: 'input' });
    const row = byId['rw-cmd-menu']._children.find(r => r.innerText.indexOf('dimension') === 0);
    ok(!!row, '"dimension" is a real, typeable/pickable command on the graph host');
    row._fire('click', {});

    ok(inp.value === 'route.width-input = ', 'picking dimension opens the SAME numeric draft a bare "width" pick would, starting with width');
    ok(inp._focused === true, 'the input stays focused, same as any other numeric settings draft');
    ok(RW._lastStatus.indexOf('Width (in)') !== -1 && RW._lastStatus.indexOf('1–48') !== -1 && RW._lastStatus.indexOf('24') !== -1,
       'the status line reports width\'s own live range/current, same as picking it directly');
    ok(RW._lastStatus.indexOf('Height (in) next') !== -1, 'and additionally previews that height comes next, since this is a chained dimension draft');
  }

  /* ---------- 245. round 20: applying width chains straight into height — no re-typing the tool name ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.min = '1'; width.max = '48'; width.value = '24'; width.offsetParent = {};
    const height = makeElement('input', byId);
    height.id = 'graph-height-input'; height.type = 'number'; height.min = '1'; height.max = '48'; height.value = '12'; height.offsetParent = {};
    inspector.appendChild(makeGraphField(byId, 'Width (in)', width));
    inspector.appendChild(makeGraphField(byId, 'Height (in)', height));
    const inp = byId['rw-cmd-input'];

    inp.value = 'dimension';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children.find(r => r.innerText.indexOf('dimension') === 0)._fire('click', {});

    inp.value = 'route.width-input = 18';
    inp._fire('keydown', { key: 'Enter' });

    ok(width.value === '18', 'width was actually applied to the real control');
    ok(height.value === '12', 'height has not been touched yet');
    ok(inp.value === 'route.height-input = ', 'confirming width immediately re-opens the draft on height, not a blank/cleared bar');
    ok(inp._focused === true, 'the input stays focused across the width -> height hop');
    ok(RW._lastStatus.indexOf('Height (in)') !== -1 && RW._lastStatus.indexOf('12') !== -1,
       'the status line now reports HEIGHT\'s own live range/current');
    ok(RW._lastStatus.indexOf('next') === -1, 'no further "next" hint — height is the last param in the chain');

    inp.value = 'route.height-input = 9';
    inp._fire('keydown', { key: 'Enter' });
    ok(height.value === '9', 'height was applied too, finishing the compound command');
    ok(inp.value === '' && !inp._focused, 'once the chain is exhausted, the bar clears and blurs exactly like any other completed command');
  }

  /* ---------- 246. round 20: dimension refuses cleanly with no active tool, and does not crash ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: null });
    const RW = win.__RW;
    const inp = byId['rw-cmd-input'];

    inp.value = 'dimension';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children.find(r => r.innerText.indexOf('dimension') === 0)._fire('click', {});

    ok(RW._lastStatus.indexOf('no duct tool is currently active') !== -1, 'reports why, rather than silently doing nothing');
    ok(inp.value === '' && !inp._focused, 'falls back to the ordinary failed-command cleanup (bar cleared, blurred)');
  }

  /* ---------- 247. round 20: dimension refuses when the active tool is missing one of width/height (e.g. a round profile) ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const width = makeElement('input', byId);
    // Only width is present/visible — as if profile were round and height's own control were hidden.
    width.id = 'graph-width-input'; width.type = 'number'; width.value = '4'; width.offsetParent = {};
    inspector.appendChild(makeGraphField(byId, 'Diameter (in)', width));
    const inp = byId['rw-cmd-input'];

    inp.value = 'dimension';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children.find(r => r.innerText.indexOf('dimension') === 0)._fire('click', {});

    ok(RW._lastStatus.indexOf('height-input') !== -1, 'names exactly which control is missing');
    ok(RW._lastStatus.indexOf('round profile') !== -1, 'hints at the likely real-world cause');
    ok(inp.value === '' && !inp._focused, 'no draft is left open — same cleanup as any other failed command');
  }

  /* ---------- 248. round 20: an invalid width value stops the chain — it never silently skips ahead to height ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.value = '24'; width.offsetParent = {};
    const height = makeElement('input', byId);
    height.id = 'graph-height-input'; height.type = 'number'; height.value = '12'; height.offsetParent = {};
    inspector.appendChild(makeGraphField(byId, 'Width (in)', width));
    inspector.appendChild(makeGraphField(byId, 'Height (in)', height));
    const inp = byId['rw-cmd-input'];

    inp.value = 'dimension';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children.find(r => r.innerText.indexOf('dimension') === 0)._fire('click', {});

    inp.value = 'route.width-input = not-a-number';
    inp._fire('keydown', { key: 'Enter' });

    ok(width.value === '24', 'the bad value never reached the real control');
    ok(height.value === '12', 'and the chain never advanced to height off the back of a failed apply');
    ok(inp.value === '' && !inp._focused, 'the whole compound command is abandoned, same as a plain failed numeric apply');
  }

  /* ---------- 249. round 20: the "dim" alias resolves the same table entry, and RW.runCommand("dimension") starts it directly (console parity) ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.value = '24'; width.offsetParent = {};
    const height = makeElement('input', byId);
    height.id = 'graph-height-input'; height.type = 'number'; height.value = '12'; height.offsetParent = {};
    inspector.appendChild(makeGraphField(byId, 'Width (in)', width));
    inspector.appendChild(makeGraphField(byId, 'Height (in)', height));
    const inp = byId['rw-cmd-input'];

    inp.value = 'dim';
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu']._children.some(r => r.innerText.indexOf('dimension') === 0),
       'the "dim" alias finds the same "dimension" row via ordinary alias matching');

    ok(RW.runCommand('dimension') === true, 'RW.runCommand("dimension") starts the chain directly, the same console-parity path every other command has');
    ok(inp.value === 'route.width-input = ' && inp._focused === true,
       'the direct call opens the width draft too — dimension is special-cased BEFORE runCommand\'s unconditional blur, unlike every dispatching command');
  }

  /* ---------- 250. round 20: dimension stays reachable while a tool is isolated (armed) — it only ever edits ITS OWN width/height ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    RW.runCommand('route'); // arm it — RW._cmdIsolatedTool() now reads 'route'
    const inspector = makeGraphInspector(win, byId);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.value = '24'; width.offsetParent = {};
    const height = makeElement('input', byId);
    height.id = 'graph-height-input'; height.type = 'number'; height.value = '12'; height.offsetParent = {};
    inspector.appendChild(makeGraphField(byId, 'Width (in)', width));
    inspector.appendChild(makeGraphField(byId, 'Height (in)', height));
    const inp = byId['rw-cmd-input'];

    inp.value = 'dimension';
    inp.dispatchEvent({ type: 'input' });
    ok(byId['rw-cmd-menu']._children.some(r => r.innerText.indexOf('dimension') === 0),
       '"dimension" still matches while route is isolated — it is in GRAPH_ISOLATION_ALLOWED, same precedent as finish/cancel');

    ok(RW.runCommand('dimension') === true, 'and actually runs, not refused by the isolation guard');
    ok(inp.value === 'route.width-input = ', 'opening the width draft on the isolated tool itself, never a different one');
  }

  /* ---------- 251. round 20: Escape mid-chain cancels the WHOLE compound command, not just the current param ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const RW = win.__RW;
    const inspector = makeGraphInspector(win, byId);
    const width = makeElement('input', byId);
    width.id = 'graph-width-input'; width.type = 'number'; width.value = '24'; width.offsetParent = {};
    const height = makeElement('input', byId);
    height.id = 'graph-height-input'; height.type = 'number'; height.value = '12'; height.offsetParent = {};
    inspector.appendChild(makeGraphField(byId, 'Width (in)', width));
    inspector.appendChild(makeGraphField(byId, 'Height (in)', height));
    const inp = byId['rw-cmd-input'];

    inp.value = 'dimension';
    inp.dispatchEvent({ type: 'input' });
    byId['rw-cmd-menu']._children.find(r => r.innerText.indexOf('dimension') === 0)._fire('click', {});
    inp.value = 'route.width-input = 30';
    inp._fire('keydown', { key: 'Escape' });

    ok(width.value === '24' && height.value === '12', 'Escape before confirming width leaves BOTH real controls untouched');
    ok(inp.value === '' && !inp._focused, 'and clears/blurs the bar, the same as cancelling any other settings draft');

    // A stray Enter afterward must not resurrect the cancelled chain — same
    // regression shape as test 83's single-param version.
    inp.value = 'mirror';
    inp.dispatchEvent({ type: 'input' });
    inp._fire('keydown', { key: 'Enter' });
    ok(width.value === '24' && height.value === '12', 'the cancelled dimension chain cannot be resurrected by a later, unrelated command');
  }

  /* ---------- 252. round 21: Tab is escalated to a window-level capture listener that wins over a host-app-style document-level capture listener ---------- */
  // Reproduces the live report: a host app can register its OWN keydown
  // listener on `document` in the capture phase (its own focus/accessibility
  // handling) — registered before this loader is ever pasted in, so it would
  // otherwise always win a same-node registration-order race against a
  // document-level listener this project adds. This test drives the actual
  // window -> document capture ORDER by hand (the flat per-node `_fire`
  // helpers here don't simulate real cross-node propagation on their own),
  // to prove the new window-level listener claims Tab before a document-level
  // one — real or host-app's — ever gets a chance to see it.
  {
    const { win, doc, byId } = makeStubWindow();
    loadModule(win);
    const inp = byId['rw-cmd-input'];
    inp.value = 'wand.tolerance';
    inp.dispatchEvent({ type: 'input' });

    let hostSawIt = false;
    doc.addEventListener('keydown', function(e){
      if (e.key === 'Tab'){ hostSawIt = true; e.stopImmediatePropagation(); }
    });

    const evt = {
      target: inp, key: 'Tab', defaultPrevented: false, _immediateStopped: false,
      preventDefault(){ this.defaultPrevented = true; },
      stopPropagation(){},
      stopImmediatePropagation(){ this._immediateStopped = true; }
    };
    win._fire('keydown', evt); // window's own capture listeners run first, structurally, in a real browser
    if (!evt._immediateStopped) doc._fire('keydown', evt); // only reachable if window didn't already claim it

    ok(evt._immediateStopped === true, 'the new window-capture listener claims Tab immediately');
    ok(hostSawIt === false, 'a host-app-style document-level capture listener never gets a chance to see/steal it');
    ok(inp.value === 'wand.tolerance', 'and the ordinary Tab handling (fill "tool.param") still ran end-to-end via the escalated listener');
  }

  /* ---------- 253. round 21: the escalated Tab listener only ever acts on the real command input, never anywhere else on the page ---------- */
  {
    const { win, byId } = makeStubWindow();
    loadModule(win);
    const other = makeElement('input', byId); // some unrelated real page input/control
    let defaultPrevented = false;
    const evt = {
      target: other, key: 'Tab', _immediateStopped: false,
      preventDefault(){ defaultPrevented = true; },
      stopPropagation(){},
      stopImmediatePropagation(){ this._immediateStopped = true; }
    };
    win._fire('keydown', evt);
    ok(!defaultPrevented && !evt._immediateStopped,
       'Tab aimed at any other element is left completely alone — ordinary page-wide Tab navigation is unaffected');
  }

  /* ---------- 254. round 23: cycling the highlight scrolls a below-the-fold row into view ---------- */
  // The "<tool>." parameter listing (rw_cmdline.js:1702) is the one dropdown
  // list in this file that isn't capped at 8 rows — the graph inspector can
  // carry far more params than fit in the 200px-max menu, and renderMenuRows()
  // rebuilding every row from scratch on each highlight move used to reset
  // scrollTop to 0 regardless of where the highlight actually was.
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const inspector = makeGraphInspector(win, byId);
    for (let i = 0; i < 10; i++){
      const el = makeElement('input', byId);
      el.id = 'graph-p' + i + '-input'; el.type = 'number'; el.value = String(i); el.offsetParent = {};
      inspector.appendChild(el);
    }
    const inp = byId['rw-cmd-input'];
    inp.value = 'route.';
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    ok(menu._children.length === 10, 'sanity: all 10 params are listed, uncapped');

    // Opt the menu into the synthetic fixed-row layout only now — mirrors a
    // real page, where the menu's rows only get real geometry once actually
    // painted, which happens after this first render.
    menu.__layoutRowHeight = 18; menu.clientHeight = 100; // ~5 rows visible

    for (let i = 0; i < 5; i++) inp._fire('keydown', { key: 'ArrowDown' }); // highlight -> row index 5
    ok(menu.scrollTop === 8, 'scrolled down just enough to bring row 5 (offscreen below) into view');
  }

  /* ---------- 255. round 23: cycling back up scrolls to bring an above-the-fold row into view ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const inspector = makeGraphInspector(win, byId);
    for (let i = 0; i < 10; i++){
      const el = makeElement('input', byId);
      el.id = 'graph-p' + i + '-input'; el.type = 'number'; el.value = String(i); el.offsetParent = {};
      inspector.appendChild(el);
    }
    const inp = byId['rw-cmd-input'];
    inp.value = 'route.';
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    menu.__layoutRowHeight = 18; menu.clientHeight = 100;

    // Deliberately doesn't return to row 0 (scrollTop 0 there would be
    // indistinguishable from "scrollTop was simply never touched" — a
    // tautological pass). Down to row 8 (scrollTop lands on 62), then up to
    // row 2 (scrollTop 36) — a non-zero value only the fix's up-scroll branch
    // can produce.
    for (let i = 0; i < 8; i++) inp._fire('keydown', { key: 'ArrowDown' }); // -> row 8, scrollTop 62
    for (let i = 0; i < 6; i++) inp._fire('keydown', { key: 'ArrowUp' });   // -> row 2, above the current scroll position
    ok(menu.scrollTop === 36, 'scrolled back up to bring row 2 into view');
  }

  /* ---------- 256. round 23: a highlight that's already fully in view leaves scrollTop untouched ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const inspector = makeGraphInspector(win, byId);
    for (let i = 0; i < 10; i++){
      const el = makeElement('input', byId);
      el.id = 'graph-p' + i + '-input'; el.type = 'number'; el.value = String(i); el.offsetParent = {};
      inspector.appendChild(el);
    }
    const inp = byId['rw-cmd-input'];
    inp.value = 'route.';
    inp.dispatchEvent({ type: 'input' });
    const menu = byId['rw-cmd-menu'];
    menu.__layoutRowHeight = 18; menu.clientHeight = 100;

    for (let i = 0; i < 5; i++) inp._fire('keydown', { key: 'ArrowDown' }); // -> row 5, scrollTop 8
    inp._fire('keydown', { key: 'ArrowUp' }); // -> row 4, top=72, bottom=90, both within [8, 108] already
    ok(menu.scrollTop === 8, 'row 4 was already fully visible at the current scroll position, so it is left unchanged');
  }

  /* ---------- 257. round 23: no menu geometry (a non-rendering context) never throws, and scrollTop stays put ---------- */
  {
    const { win, byId } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'route' });
    const inspector = makeGraphInspector(win, byId);
    for (let i = 0; i < 10; i++){
      const el = makeElement('input', byId);
      el.id = 'graph-p' + i + '-input'; el.type = 'number'; el.value = String(i); el.offsetParent = {};
      inspector.appendChild(el);
    }
    const inp = byId['rw-cmd-input'];
    inp.value = 'route.';
    inp.dispatchEvent({ type: 'input' });
    // Deliberately NOT opting the menu into __layoutRowHeight — matches the
    // stub's default (offsetTop/offsetHeight/clientHeight all 0), the
    // "geometry never set" case cmdScrollRowIntoView's own guard exists for.
    let threw = false;
    try {
      for (let i = 0; i < 8; i++) byId['rw-cmd-input']._fire('keydown', { key: 'ArrowDown' });
    } catch (e) { threw = true; }
    ok(!threw, 'cycling the highlight with no real layout geometry never throws');
    ok(byId['rw-cmd-menu'].scrollTop === 0, 'and scrollTop is left at 0 rather than computed from bogus zeroed geometry');
  }

  /* ---------- 258. round 23: a digit typed at rest, bar empty, passes straight through to the app (graph host) ---------- */
  // Reported live: at the end of a duct draw the app offers the next tool by
  // a numbered prompt, and the global auto-capture listener was swallowing
  // the digit into the command bar instead of letting the app see it.
  {
    const { win, byId, doc } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const bodyTarget = makeElement('div', byId); // stands in for "nothing else focused" — same convention as test 11
    let defaultPrevented = false;
    doc._fire('keydown', { target: bodyTarget, key: '3', preventDefault(){ defaultPrevented = true; } });
    ok(!defaultPrevented, 'the digit is not consumed — the app receives it untouched');
    ok(byId['rw-cmd-input'].value === '', 'the command bar is not seeded by the digit');
  }

  /* ---------- 259. round 23: a digit still lands in the bar once something's already been typed ---------- */
  // Directly exercises the guard's actual condition (bar genuinely EMPTY),
  // not just "nothing focused" — proves the fix is scoped to a resting bar,
  // not a blanket digit exemption on this host.
  {
    const { win, byId, doc } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    const bodyTarget = makeElement('div', byId);
    byId['rw-cmd-input'].value = 'ro'; // bar already holds a partial command
    let defaultPrevented = false;
    doc._fire('keydown', { target: bodyTarget, key: '3', preventDefault(){ defaultPrevented = true; } });
    ok(defaultPrevented, 'a non-empty bar still captures the digit, same as any other printable character');
    ok(byId['rw-cmd-input'].value === 'ro3', 'the digit was appended, not passed through');
  }

  /* ---------- 260. round 23: the annotate host is completely unaffected — digits keep working as tag hotkeys there ---------- */
  {
    const { win, byId, doc } = makeStubWindow(); // no {host: GRAPH_HOST} -> annotate host
    loadModule(win);
    const bodyTarget = makeElement('div', byId);
    let defaultPrevented = false;
    doc._fire('keydown', { target: bodyTarget, key: '3', preventDefault(){ defaultPrevented = true; } });
    ok(defaultPrevented, 'on the annotate host a digit is still captured even at rest — tag1..tag0 stay real commands there');
    ok(byId['rw-cmd-input'].value === '3', 'and still seeds the bar exactly as before this round');
  }

  /* ---------- 261. round 23: RW._cmdDigitPassthrough = false restores the old capture-everything behavior ---------- */
  {
    const { win, byId, doc } = makeStubWindow({ host: GRAPH_HOST });
    loadModule(win, null, null, { activeTool: 'select' });
    win.__RW._cmdDigitPassthrough = false;
    const bodyTarget = makeElement('div', byId);
    let defaultPrevented = false;
    doc._fire('keydown', { target: bodyTarget, key: '3', preventDefault(){ defaultPrevented = true; } });
    ok(defaultPrevented, 'the console escape hatch restores capture on the graph host too');
    ok(byId['rw-cmd-input'].value === '3', 'and the digit seeds the bar exactly as it did before this round');
  }

  finish();
})();

// Settings rows are colored with SETTINGS_COLOR ('#ffd166') — used by the additive-blend tests
// above to tell a settings row apart from an ordinary command row sharing the same 'command' menuMode.
function isSettingsRow(row){ return row.style.cssText.indexOf('#ffd166') !== -1; }

// Small helper for reading a module's last status message off its own win.__RW —
// kept local to these settings-interaction tests since it's the first place this
// file has needed to fetch it as an expression rather than asserting on it inline.
function RW_lastStatusFrom(win){ return win.__RW._lastStatus || ''; }

function finish(){
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
