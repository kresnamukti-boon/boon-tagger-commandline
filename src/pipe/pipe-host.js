// Thin DOM layer for the piping command line: reads the page into plain snapshots and clicks native's
// own controls. No decisions live here; every decision is made by src/core/pipe-table-core.js from
// what this returns. The document and window are injected, so the same module runs against the real
// page and against the Node test harness.
import { isElementVisible } from '../features/actions.js';

export function createPipeHost({ doc, win, ids, panelIds = {}, unavailableMark = 'unavailable' }) {
  function railButtons() {
    return Array.from(doc.querySelectorAll(ids.toolSelector));
  }

  function childWithClass(el, className) {
    for (const child of el.children || []) {
      if (String(child.className || '').split(/\s+/).indexOf(className) !== -1) return child;
    }
    return null;
  }

  function text(el) {
    return el ? String(el.textContent || '').trim() : '';
  }

  // The element an entry would click: a tool's own rail button, or an action's button by id.
  function resolve(entry) {
    if (entry.kind === 'tool') {
      return railButtons().find((el) => String(el.getAttribute('data-tool') || '').trim().toLowerCase() === entry.name) || null;
    }
    return entry.btn ? doc.getElementById(entry.btn) : null;
  }

  // Ids of every element above `el` (used to refuse anything that lives inside the toast stack).
  function ancestorIds(el) {
    const out = [];
    for (let n = el && el.parentNode; n; n = n.parentNode) if (n.id) out.push(n.id);
    return out;
  }

  function activeTool() {
    const debug = win.__graphDebug;
    return debug && typeof debug.activeTool === 'string' ? debug.activeTool : null;
  }

  return {
    // Plain facts for loaderGuard.
    readPageFacts() {
      const root = doc.getElementById(ids.root);
      const toggle = doc.getElementById(ids.nativeBarToggle);
      const nativeWindow = doc.getElementById(ids.nativeBarWindow);
      return {
        hasRoot: !!root,
        trade: root ? root.getAttribute('data-trade') : undefined,
        hasStage: !!doc.getElementById(ids.stage),
        railToolCount: railButtons().length,
        nativeBarOn: (!!toggle && toggle.getAttribute('aria-pressed') === 'true') || (!!nativeWindow && !nativeWindow.hidden),
        ductLoaderInstalled: !!(win.__RW && win.__RW.vcmd),
      };
    },

    // [{ id, key, label }] in on-screen order, for deriveTools.
    readRail() {
      return railButtons().map((el) => ({
        id: el.getAttribute('data-tool') || '',
        key: text(childWithClass(el, ids.toolKeyClass)),
        label: text(childWithClass(el, ids.toolLabelClass)),
      }));
    },

    // Plain description of what an entry would click, for entryState. Null when there is nothing.
    describeTarget(entry) {
      const el = resolve(entry);
      if (!el) return null;
      return {
        exists: true,
        disabled: !!el.disabled,
        ariaDisabled: el.getAttribute('aria-disabled'),
        visible: isElementVisible(el),
        title: el.getAttribute('title') || '',
        id: el.id || '',
        captureId: el.getAttribute('data-capture-control-id') || '',
        text: text(el),
        ancestorIds: ancestorIds(el),
      };
    },

    // Click the entry's own control. Returns whether there was something to click.
    clickEntry(entry) {
      const el = resolve(entry);
      if (!el) return false;
      el.click();
      return true;
    },

    readActiveTool: activeTool,

    // The page's current revision number, or null.
    readRevision() {
      const debug = win.__graphDebug;
      if (debug && typeof debug.revision === 'number') return debug.revision;
      const el = doc.getElementById('graph-revision-status');
      return el ? text(el) : null;
    },

    // Plain snapshot of native's "Place Fitting" panel (see pipe-placement-core.js for the shape).
    // The menu is rebuilt by native even while it is hidden, so it is read straight from the DOM.
    readPanel() {
      const panel = doc.getElementById(panelIds.panel);
      if (!panel || panel.hidden) return { open: false, tool: null, hint: '', groups: [] };
      let hint = '';
      for (const child of panel.children || []) {
        if (child.tagName === 'P' && String(child.className || '').indexOf(panelIds.warningClass) === -1) { hint = text(child); break; }
      }
      const menu = doc.getElementById(panelIds.menu);
      const groups = [];
      if (menu) {
        for (const section of menu.children || []) {
          const heading = Array.from(section.children || []).find((c) => String(c.className || '').indexOf(panelIds.groupLabelClass) !== -1);
          const headingText = text(heading);
          const ports = parseInt(headingText, 10);
          const options = Array.from(section.querySelectorAll(panelIds.optionSelector)).map((btn) => ({
            id: btn.getAttribute('data-family-id') || '',
            label: text(btn.children && btn.children[0]),
            usable: !btn.disabled,
          }));
          groups.push({ ports: isNaN(ports) ? 0 : ports, usable: headingText.indexOf(unavailableMark) === -1, options });
        }
      }
      return { open: true, tool: activeTool(), hint, groups };
    },

    // Is this element native's own label button (the one native focuses after a pick, and whose
    // Enter / Space / ArrowDown opens the menu)?
    isLabelTrigger(el) {
      return !!el && String(el.className || '').split(/\s+/).indexOf(panelIds.triggerClass) !== -1;
    },

    // Is keyboard focus on something inside native's placement panel?
    focusInPanel() {
      const active = doc.activeElement;
      const panel = doc.getElementById(panelIds.panel);
      if (!active || !panel) return false;
      for (let n = active; n; n = n.parentNode) if (n === panel) return true;
      return false;
    },

    // Plain description of native's Finish button (see finishVerdict), read fresh every call.
    readFinish(expectedId) {
      const el = doc.getElementById(expectedId);
      if (!el) return { found: false, expectedId };
      return {
        found: true, expectedId, id: el.id || '',
        disabled: !!el.disabled, ariaDisabled: el.getAttribute('aria-disabled'),
        visible: isElementVisible(el),
        text: text(el), ancestorIds: ancestorIds(el),
      };
    },

    // The one Finish click. Re-checks that the element is still enabled, then clicks it. Returns whether it clicked.
    clickFinish(expectedId) {
      const el = doc.getElementById(expectedId);
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      el.click();
      return true;
    },

    // Which of these element ids are not on the page right now?
    missingIds(list) {
      return list.filter((id) => !doc.getElementById(id));
    },

    // Click one label in native's own menu (what a mouse click would do). False if it isn't there or is disabled.
    clickFamily(id) {
      const menu = doc.getElementById(panelIds.menu);
      if (!menu) return false;
      const btn = Array.from(menu.querySelectorAll(panelIds.optionSelector)).find((b) => b.getAttribute('data-family-id') === id);
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    },

    // Plain snapshot of the system dropdown for `#` search (see pipe-system-core.js).
    readSystems() {
      const el = doc.getElementById(ids.systemSelect);
      const debug = win.__graphDebug;
      const readable = !!debug && typeof debug === 'object' && 'selectedEntityId' in debug;
      return {
        found: !!el,
        disabled: !!(el && el.disabled),
        options: el ? Array.from(el.options || []).map((o) => ({ value: o.value, text: o.text })) : [],
        selectionReadable: readable,
        selectedEntityId: readable ? (debug.selectedEntityId || null) : null,
        currentValue: el ? el.value : null,
      };
    },

    // Choose a system the way a person does: set the value, then the change events. Returns the
    // dropdown's own value afterwards so the caller can report what the page actually took.
    writeSystem(id) {
      const el = doc.getElementById(ids.systemSelect);
      if (!el) return null;
      el.value = id;
      el.dispatchEvent(new win.Event('input', { bubbles: true }));
      el.dispatchEvent(new win.Event('change', { bubbles: true }));
      return el.value;
    },

    anyDialogOpen() {
      return !!doc.querySelector('dialog[open]');
    },

    stageRect() {
      const stage = doc.getElementById(ids.stage);
      return stage ? stage.getBoundingClientRect() : null;
    },
  };
}
