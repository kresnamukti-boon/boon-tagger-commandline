// Synthetic Node harness for rw_cmdline.js — NATIVE-TOOLS-ONLY BRANCH. Loads
// the real shipped module body against a minimal DOM stub (no browser, no
// network) — same discipline as verify_ocr.js/verify_pipe.js: exercise the
// real source, not a reimplementation, and drive real registered listeners
// (keydown/click/input) rather than only calling exposed functions directly.
//
// This branch's RW._cmdTable has no workbench entries (no `btn`/`ctl`/
// `armed`/`disarm`, no popup borrow/restore) — every entry is a `run`-only
// dispatch to the host app. Tests specific to the full command line's
// workbench-arming/popup machinery were removed accordingly; see CLAUDE.md.
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
    get id(){ return _id; },
    set id(v){
      if (registry && _id) delete registry[_id];
      _id = v;
      if (registry && v) registry[v] = el;
    },
    value: '',
    innerText: '',
    innerHTML: '',
    placeholder: '',
    title: '',
    type: '',
    autocomplete: '',
    spellcheck: false,
    style: { cssText: '', display: '' },
    classList: { _set: new Set(), contains(c){ return this._set.has(c); } },
    _children: [],
    parentNode: null,
    _clicked: 0,
    click(){ this._clicked++; if (this.onclick) this.onclick(); },
    focus(){ this._focused = true; },
    blur(){ this._focused = false; },
    _rect: { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 },
    getBoundingClientRect(){ return this._rect; },
    addEventListener(type, fn){ (listeners[type] = listeners[type] || []).push(fn); },
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

function makeStubWindow(){
  const byId = {};
  const body = makeElement('body', byId);
  const docListeners = {};

  const documentStub = {
    _byId: byId,
    body: body,
    getElementById(id){ return byId[id] || null; },
    createElement(tag){ return makeElement(tag, byId); },
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
    _fire(type, evt){
      evt = Object.assign({ stopPropagation(){}, preventDefault(){}, stopImmediatePropagation(){} }, evt);
      (docListeners[type] || []).slice().forEach(fn => fn(evt));
      return evt;
    }
  };

  const win = { document: documentStub };
  win.__RW = {
    v32: true,
    enabled: true,
    _commitStatus(msg){ this._lastStatus = msg; }
  };

  // Only #rw-sections/#rw-list are needed now — mountCommandBar's anchor.
  // No workbench buttons/sections to build: every table entry on this
  // branch is `run`-only (no `btn`/`ctl`), so the popup/borrow machinery is
  // never exercised by any real command.
  const sections = makeElement('div', byId);
  sections.id = 'rw-sections';
  byId['rw-sections'] = sections;
  const list = makeElement('div', byId);
  list.id = 'rw-list';
  byId['rw-list'] = list;
  const panelBody = makeElement('div', byId);
  panelBody.appendChild(sections);
  panelBody.appendChild(list);

  return { win, doc: documentStub, byId, sections, list };
}

// Node has no KeyboardEvent global; rw_cmdline.js's real dispatch code (the
// same `new KeyboardEvent('keydown', {...})` idiom rw_install.js/etc. already
// use to make the app relinquish its own tool) needs one to run for real.
function FakeKeyboardEvent(type, init){
  Object.assign(this, init || {});
  this.type = type;
  this.defaultPrevented = false;
  this._immediateStopped = false;
}
FakeKeyboardEvent.prototype.preventDefault = function(){ this.defaultPrevented = true; };
FakeKeyboardEvent.prototype.stopPropagation = function(){};
FakeKeyboardEvent.prototype.stopImmediatePropagation = function(){ this._immediateStopped = true; };

function loadModule(win, annotationState){
  const src = fs.readFileSync(path.join(__dirname, 'rw_cmdline.js'), 'utf8');
  const sandboxGlobals = { window: win, document: win.document, KeyboardEvent: FakeKeyboardEvent, annotationState: annotationState };
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
  ok(w[0] && w[0].name === 'bbox', '"w" resolves to bbox first (exact alias beats name-prefix matches)');
  ok(w.some(e => e.name === 'wand'), '"w" still lists wand as a name-prefix match');
  ok(w.some(e => e.name === 'wrap'), '"w" still lists wrap as a name-prefix match');

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
  ok(RW._cmdPopupState === null || RW._cmdPopupState === undefined, 'no popup ever opens for a run-only entry');

  RW.runCommand('unknown-tool-xyz');
  ok(RW._lastStatus.indexOf('unknown command') !== -1, 'unknown command reports status, does not throw');
}

(async () => {
  /* ---------- 5. RW._cmdDispatchAppKey uses the same event shape as the existing Escape idiom ---------- */
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

  /* ---------- 6. native draw tools dispatch "d" (draw mode) before their own letter ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('linear');
    ok(JSON.stringify(keys) === JSON.stringify(['d','q']), 'linear dispatches d then q');
  }

  /* ---------- 7. native mode switches dispatch only their own letter, no "d" prefix ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('mirror');
    ok(JSON.stringify(keys) === JSON.stringify(['m']), 'mirror dispatches only m, not a d prefix');
  }

  /* ---------- 8. global auto-capture: typing anywhere seeds and focuses the command input ---------- */
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

  /* ---------- 9. global auto-capture leaves a real, already-focused input alone ---------- */
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

  /* ---------- 10. the bug fix: our own synthetic dispatch is never eaten by the auto-capture listener ---------- */
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

  /* ---------- 11. the dropdown colors native entries with the native color ---------- */
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

  /* ---------- 12. tag auto-detection: finds the right field among decoys via currentTag membership ---------- */
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

  /* ---------- 13. tag auto-detection: reports null when nothing validates ---------- */
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

  /* ---------- 14. "#" switches the dropdown to tag search; a plain query still matches commands ---------- */
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

  /* ---------- 15. selecting a tag at index <10 dispatches the matching digit, not a direct assignment ---------- */
  {
    const { win } = makeStubWindow();
    const as = { currentTag: null, tags: [{id:1,name:'Alpha'},{id:2,name:'Beta'},{id:3,name:'Gamma'}] };
    loadModule(win, as);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW._cmdSelectTag(as.tags[2], 2); // 3rd tag, index 2 -> digit '3'
    ok(JSON.stringify(keys) === JSON.stringify(['3']), 'index 2 dispatches digit "3"');
    ok(as.currentTag === null, 'the safe digit path never touches annotationState.currentTag directly');
  }

  /* ---------- 16. selecting a tag at index >=10 goes through the unsafe direct-assignment path only ---------- */
  {
    const { win } = makeStubWindow();
    const manyTags = [];
    for (let i = 0; i < 12; i++) manyTags.push({id:i, name:'Tag'+i});
    const as = { currentTag: null, tags: manyTags };
    loadModule(win, as);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW._cmdSelectTag(manyTags[11], 11); // index 11, beyond the first 10
    ok(keys.length === 0, 'index 11 never goes through the digit-dispatch path');
    ok(as.currentTag === manyTags[11], 'index 11 falls back to direct assignment of annotationState.currentTag');
    ok(RW._lastStatus.indexOf('unverified') !== -1, 'the unsafe path\'s status explicitly says so, not just "tag selected"');
  }

  /* ---------- 17. Space acts as Enter in command mode ---------- */
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

  /* ---------- 18. Space is a literal character in tag-search mode, never triggers selection ---------- */
  {
    const { win, byId } = makeStubWindow();
    const as = { currentTag: null, tags: [{id:1,name:'Alpha Room'}] };
    loadModule(win, as);
    const inp = byId['rw-cmd-input'];
    inp.value = '#alpha';
    inp.dispatchEvent({ type: 'input' });
    let defaultPrevented = false;
    inp._fire('keydown', { key: ' ', preventDefault(){ defaultPrevented = true; } });
    ok(!defaultPrevented, 'Space in tag-search mode is left alone, so a multi-word tag name can be typed');
    ok(as.currentTag === null, 'Space in tag mode never selects a tag as a side effect');
  }

  /* ---------- 19. the master RW: ON/OFF killswitch also stops global auto-capture ---------- */
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

  finish();
})();

function finish(){
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
