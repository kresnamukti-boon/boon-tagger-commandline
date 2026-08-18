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
    focus(){ this._focused = true; },
    blur(){ this._focused = false; },
    _rect: { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 },
    getBoundingClientRect(){ return this._rect; },
    // Scroll/pan surface — a plain object by default (nothing scrollable);
    // makeScrollable() below configures these for pan-resolution tests.
    scrollLeft: 0, scrollTop: 0,
    scrollWidth: 0, scrollHeight: 0,
    clientWidth: 0, clientHeight: 0,
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
      this._children.push(child); child.parentNode = this; return child;
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

function makeStubWindow(){
  const byId = {};
  const body = makeElement('body', byId);
  const docListeners = {};

  const documentStub = {
    _byId: byId,
    body: body,
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

  const win = { document: documentStub };
  win.__RW = {
    vcore: true,
    enabled: true,
    _commitStatus(msg){ this._lastStatus = msg; }
  };
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
function loadModule(win, annotationState, timers){
  timers = timers || makeFakeTimers();
  win._timers = timers;
  const src = fs.readFileSync(path.join(__dirname, 'rw_cmdline.js'), 'utf8');
  const sandboxGlobals = {
    window: win, document: win.document, KeyboardEvent: FakeKeyboardEvent, annotationState: annotationState,
    setTimeout: timers.fakeSetTimeout, clearTimeout: timers.fakeClearTimeout,
    setInterval: timers.fakeSetInterval, clearInterval: timers.fakeClearInterval
  };
  const fn = new Function(...Object.keys(sandboxGlobals), src + '\n//# sourceURL=rw_cmdline.js');
  const ret = fn(...Object.values(sandboxGlobals));
  return ret;
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

    RW.runCommand('mirror'); // stamps RW._cmdLastUserCmdAt = Date.now()
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

  /* ---------- 110. Space falls through to the ordinary dropdown when no tool has been run yet ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const bodyTarget = makeElement('div', byId);
    doc._fire('keydown', { target: bodyTarget, key: ' ' });
    ok(byId['rw-cmd-input'].value === ' ', 'with no RW._cmdLastTool recorded, Space is captured normally, same as any other character');
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
    ok(byId['rw-cmd-input'].value === ' ', 'falls through to the ordinary capture instead');
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
