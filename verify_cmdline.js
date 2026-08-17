// Synthetic Node harness for rw_cmdline.js. Loads the real shipped module
// body against a minimal DOM stub (no browser, no network) — same discipline
// as verify_ocr.js/verify_pipe.js: exercise the real source, not a
// reimplementation, and drive real registered listeners (keydown/click/input)
// rather than only calling exposed functions directly.
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
    dispatchEvent(){ return true; },
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
    pickMode: false, cutMode: false, maskMode: null, maskMode2: null,
    maskAction: 'block', _healPreviewOn: false, healBrushMode: false,
    pipeMode: false, elbowMode: false, wallOverlayState: 0, _snapEnabled: false,
    textOverlayOn: false,
    setMaskAction(a){ this.maskAction = a; },
    setCut(on){ this.cutMode = on; },
    _commitStatus(msg){ this._lastStatus = msg; }
  };

  // register(id, el) parents `el` under a section-row-shaped container by
  // default (rw-sec-<key>), matching how these controls really sit once
  // rw_panelsections.js has moved them, so tidyOldParent's real logic runs.
  function makeSectionRow(key){
    const wrap = makeElement('div', byId);
    wrap.classList._set.add('rw-sec');
    const label = makeElement('div', byId);
    label.id = 'rw-sec-label-' + key;
    byId[label.id] = label;
    wrap.appendChild(label);
    const row = makeElement('div', byId);
    row.id = 'rw-sec-' + key;
    byId[row.id] = row;
    wrap.appendChild(row);
    return { wrap, row };
  }

  const sections = makeElement('div', byId);
  sections.id = 'rw-sections';
  byId['rw-sections'] = sections;
  const list = makeElement('div', byId);
  list.id = 'rw-list';
  byId['rw-list'] = list;
  const panelBody = makeElement('div', byId);
  panelBody.appendChild(sections);
  panelBody.appendChild(list);

  const regionsRow = makeSectionRow('regions');
  const maskRow = makeSectionRow('mask');
  const healRow = makeSectionRow('heal');
  const pipeRow = makeSectionRow('pipe');
  const fittingsRow = makeSectionRow('fittings');
  const viewRow = makeSectionRow('view');
  [regionsRow, maskRow, healRow, pipeRow, fittingsRow, viewRow].forEach(r => sections.appendChild(r.wrap));

  function addBtn(id, row, armFlag, armVal, disarmVal){
    const b = makeElement('button', byId);
    b.id = id;
    b.onclick = function(){
      const RW = win.__RW;
      if (armFlag){ RW[armFlag] = (RW[armFlag] === armVal) ? disarmVal : armVal; }
    };
    byId[id] = b;
    row.row.appendChild(b);
    return b;
  }

  addBtn('rw-pick', regionsRow, 'pickMode', true, false);
  addBtn('rw-cut', regionsRow, 'cutMode', true, false);
  addBtn('rw-rect', maskRow, 'maskMode', 'rect', null);
  addBtn('rw-poly2', maskRow, 'maskMode2', 'poly2', null);
  addBtn('rw-brush', maskRow, 'maskMode2', 'brush', null);
  addBtn('rw-heal-btn', healRow, '_healPreviewOn', true, false);
  const healGroup = makeElement('span', byId); healGroup.id = 'rw-heal-group'; byId['rw-heal-group'] = healGroup;
  healGroup.appendChild(byId['rw-heal-btn']);
  healRow.row.appendChild(healGroup);
  addBtn('rw-healbrush-btn', healRow, 'healBrushMode', true, false);
  const pipeBtn = addBtn('rw-pipe', pipeRow, 'pipeMode', true, false);
  const pipeGroup = makeElement('span', byId); pipeGroup.id = 'rw-pipe-group'; byId['rw-pipe-group'] = pipeGroup;
  pipeGroup.appendChild(pipeBtn);
  pipeRow.row.appendChild(pipeGroup);
  addBtn('rw-elbow', fittingsRow, 'elbowMode', true, false);
  addBtn('rw-walls', viewRow, 'wallOverlayState', 1, 0);
  addBtn('rw-snap', maskRow, '_snapEnabled', true, false);
  addBtn('rw-textdetect', viewRow, 'textOverlayOn', true, false);
  const textGroup = makeElement('span', byId); textGroup.id = 'rw-textdetect-group'; byId['rw-textdetect-group'] = textGroup;
  textGroup.appendChild(byId['rw-textdetect']);
  viewRow.row.appendChild(textGroup);
  addBtn('rw-addmode', maskRow, 'maskAction', 'add', 'block');

  const relabelLabel = makeElement('span', byId); relabelLabel.id = 'rw-relabel-label'; byId[relabelLabel.id] = relabelLabel;
  const relabelInp = makeElement('input', byId); relabelInp.id = 'rw-relabel-inp'; byId[relabelInp.id] = relabelInp;
  const relabelBtn = makeElement('button', byId); relabelBtn.id = 'rw-relabel-btn'; byId[relabelBtn.id] = relabelBtn;
  relabelBtn.onclick = function(){ relabelBtn._relabeled = (relabelBtn._relabeled||0) + 1; };
  maskRow.row.appendChild(relabelLabel);
  maskRow.row.appendChild(relabelInp);
  maskRow.row.appendChild(relabelBtn);

  return { win, doc: documentStub, byId, sections, list, rows: { regionsRow, maskRow, healRow, pipeRow, fittingsRow, viewRow } };
}

// Node has no KeyboardEvent global; rw_cmdline.js's real dispatch code (the
// same `new KeyboardEvent('keydown', {...})` idiom rw_install.js/etc. already
// use to make the app relinquish its own tool) needs one to run for real.
function FakeKeyboardEvent(type, init){
  Object.assign(this, init || {});
  this.type = type;
}

function loadModule(win){
  const src = fs.readFileSync(path.join(__dirname, 'rw_cmdline.js'), 'utf8');
  const sandboxGlobals = { window: win, document: win.document, KeyboardEvent: FakeKeyboardEvent };
  const fn = new Function(...Object.keys(sandboxGlobals), src + '\n//# sourceURL=rw_cmdline.js');
  const ret = fn(...Object.values(sandboxGlobals));
  return ret;
}

/* ---------- 1. RW._cmdMatch ranking ---------- */
{
  const { win } = makeStubWindow();
  loadModule(win);
  const RW = win.__RW;

  const p = RW._cmdMatch('p');
  ok(p[0] && p[0].name === 'pick', '"p" resolves to pick first (exact alias beats prefix matches)');
  ok(p.some(e => e.name === 'pipe'), '"p" still lists pipe as a prefix match');
  ok(p.some(e => e.name === 'poly2'), '"p" still lists poly2 as an alias-prefix match');

  const exact = RW._cmdMatch('pipe');
  ok(exact[0].name === 'pipe', 'exact name match ranks first');

  const empty = RW._cmdMatch('');
  ok(empty.length === RW._cmdTable.length, 'empty query returns the whole table');

  const none = RW._cmdMatch('zzz-nonexistent');
  ok(none.length === 0, 'no match returns an empty array');
}

/* ---------- 2. RW.runCommand: click-to-arm, re-run toggles off ---------- */
{
  const { win, byId } = makeStubWindow();
  loadModule(win);
  const RW = win.__RW;

  RW.runCommand('pick');
  ok(RW.pickMode === true, 'runCommand("pick") arms pick');
  ok(byId['rw-pick']._clicked === 1, 'arming pick clicked its real button once');

  RW.runCommand('pick');
  ok(RW.pickMode === false, 'running "pick" again while armed toggles it off');
  ok(byId['rw-pick']._clicked === 2, 'disarming (no explicit disarm fn) clicked the button a second time');
  ok(RW._cmdPopupState === null, 'toggling off closes the popup immediately, not waiting for the poll');

  RW.runCommand('unknown-tool-xyz');
  ok(RW._lastStatus.indexOf('unknown command') !== -1, 'unknown command reports status, does not throw');
}

/* ---------- 2b. explicit `disarm` overrides for tools whose button click isn't a toggle ---------- */
{
  const { win, byId } = makeStubWindow();
  loadModule(win);
  const RW = win.__RW;

  RW.runCommand('cut');
  ok(RW.cutMode === true, 'cut arms normally');
  RW.runCommand('cut');
  ok(RW.cutMode === false, 'running "cut" again disarms via its explicit disarm fn, not a second click');
  ok(byId['rw-cut']._clicked === 1, 'the button itself was only ever clicked once (its onclick is not a toggle)');

  RW.runCommand('walls');
  ok(RW.wallOverlayState === 1, 'walls arms to state 1 on first run');
  RW.runCommand('walls');
  ok(RW.wallOverlayState === 0, 'running "walls" again jumps straight to state 0 (off), not state 2');
}

/* ---------- 3. one-shot `run` entries (no button, no popup) ---------- */
{
  const { win } = makeStubWindow();
  loadModule(win);
  const RW = win.__RW;
  RW.maskAction = 'block';
  RW.runCommand('cycle');
  ok(RW.maskAction === 'open', '"cycle" advances block->open directly, with no button to click');
  ok(!RW._cmdPopupState, 'a pure one-shot command never opens a popup');
}

/* ---------- 4. popup borrow/restore round trip preserves exact sibling order ---------- */
{
  const { win, byId, rows } = makeStubWindow();
  loadModule(win);
  const RW = win.__RW;

  const before = rows.maskRow.row._children.map(c => c.id);
  ok(before.indexOf('rw-relabel-label') < before.indexOf('rw-relabel-inp')
     && before.indexOf('rw-relabel-inp') < before.indexOf('rw-relabel-btn'),
     'sanity: relabel label/input/button start in the expected order');

  RW.runCommand('relabel');
  ok(RW._cmdPopupState !== null, 'relabel command opens a popup (it has real controls)');
  const popupBody = byId['rw-cmd-popup-body'];
  ok(popupBody._children.map(c=>c.id).join(',') === 'rw-relabel-label,rw-relabel-inp,rw-relabel-btn',
     'borrowed nodes land in the popup in declared order');

  RW._cmdClosePopup();
  const after = rows.maskRow.row._children.map(c => c.id);
  ok(JSON.stringify(after.filter(id=>id.indexOf('rw-relabel')===0))
     === JSON.stringify(before.filter(id=>id.indexOf('rw-relabel')===0)),
     'closing the popup restores the exact original relative order, not just presence');
}

/* ---------- 5. hidden controls (e.g. addmode) are un-hidden while borrowed, restored after ---------- */
{
  const { win, byId } = makeStubWindow();
  loadModule(win);
  const RW = win.__RW;
  byId['rw-addmode'].style.display = 'none';

  RW.runCommand('addmode');
  ok(byId['rw-addmode'].style.display === '', 'borrowed hidden control is un-hidden while in the popup');

  RW._cmdClosePopup();
  ok(byId['rw-addmode'].style.display === 'none', 'closing the popup restores its original display:none');
}

/* ---------- 6. moving the elbow section row leaves its label-only wrapper hidden, then restores it ---------- */
{
  const { win, byId, rows } = makeStubWindow();
  loadModule(win);
  const RW = win.__RW;

  RW.runCommand('elbow');
  ok(rows.fittingsRow.wrap.style.display === 'none',
     'the FITTINGS wrapper (now left with only its label) is hidden while its row is borrowed');

  RW._cmdClosePopup();
  ok(rows.fittingsRow.wrap.style.display === '',
     'the FITTINGS wrapper is restored to visible once the row comes back');
}

/* ---------- 7. armed but untouched externally: popup stays open on its own poll tick ---------- */
(async () => {
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW.runCommand('walls');
    ok(RW._cmdPopupState !== null, 'walls opens a popup');
    await new Promise(r => setTimeout(r, 300));
    ok(RW._cmdPopupState !== null, 'walls popup stays open on its own poll tick (armed stayed true)');
  }

  /* ---------- 8. armed()-transition auto-closes the popup ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW.runCommand('pick');
    ok(RW._cmdPopupState !== null, 'pick opens a popup');
    RW.pickMode = false; // simulate an external disarm (e.g. cross-disarm by another tool)
    await new Promise(r => setTimeout(r, 300));
    ok(RW._cmdPopupState === null, 'popup auto-closes once armed() transitions from true to false');
  }

  /* ---------- 9. RW.enabled=false closes any open popup regardless of armed() ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    RW.runCommand('walls');
    ok(RW._cmdPopupState !== null, 'walls opens a popup');
    RW.enabled = false;
    await new Promise(r => setTimeout(r, 300));
    ok(RW._cmdPopupState === null, 'the master killswitch (RW.enabled=false) closes an open popup');
  }

  /* ---------- 10. RW._cmdDispatchAppKey uses the same event shape as the existing Escape idiom ---------- */
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

  /* ---------- 11. native draw tools dispatch "d" (draw mode) before their own letter ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('linear');
    ok(JSON.stringify(keys) === JSON.stringify(['d','q']), 'linear dispatches d then q');
  }

  /* ---------- 12. native mode switches dispatch only their own letter, no "d" prefix ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    const keys = [];
    RW._cmdDispatchAppKey = function(k){ keys.push(k); };
    RW.runCommand('mirror');
    ok(JSON.stringify(keys) === JSON.stringify(['m']), 'mirror dispatches only m, not a d prefix');
  }

  /* ---------- 13. alias-collision resolution: the workbench command keeps the shared letter ---------- */
  {
    const { win } = makeStubWindow();
    loadModule(win);
    const RW = win.__RW;
    ok(RW._cmdMatch('k')[0].name === 'cut', '"k" resolves to cut, not the native magic wand ("wand")');
    ok(RW._cmdMatch('a')[0].name === 'addmode', '"a" resolves to addmode, not the native pan tool ("pan")');
    ok(RW._cmdMatch('s')[0].name === 'snap', '"s" resolves to snap, not the native select mode ("select")');
    ok(RW._cmdMatch('r')[0].name === 'rect', '"r" resolves to rect, not the native polygon tool ("polygon")');
    ok(RW._cmdMatch('wand').some(e => e.name === 'wand'), '"wand" is still reachable by its full name');
    ok(RW._cmdMatch('pan').some(e => e.name === 'pan'), '"pan" is still reachable by its full name');
    ok(RW._cmdMatch('select').some(e => e.name === 'select'), '"select" is still reachable by its full name');
    ok(RW._cmdMatch('polygon').some(e => e.name === 'polygon'), '"polygon" is still reachable by its full name');
    ok(!(RW._cmdTable.find(e => e.name==='polygon').aliases||[]).includes('poly'),
       'polygon does not steal poly2\'s "poly" alias');
  }

  /* ---------- 14. global auto-capture: typing anywhere seeds and focuses the command input ---------- */
  {
    const { win, byId, doc } = makeStubWindow();
    loadModule(win);
    const bodyTarget = makeElement('div', byId); // stands in for "nothing else focused"
    const evt = doc._fire('keydown', { target: bodyTarget, key: 'p' });
    ok(evt.defaultPrevented !== undefined || true, 'sanity: event dispatched without throwing');
    const inp = byId['rw-cmd-input'];
    ok(inp && inp.value === 'p', 'typing "p" with nothing focused seeds the command input');
    ok(inp._focused === true, 'the command input is auto-focused');
  }

  /* ---------- 15. global auto-capture leaves a real, already-focused input alone ---------- */
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

  finish();
})();

function finish(){
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
