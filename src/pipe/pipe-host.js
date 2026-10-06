// Thin DOM layer for the piping command line: reads the page into plain snapshots and clicks native's
// own controls. No decisions live here; every decision is made by src/core/pipe-table-core.js from
// what this returns. The document and window are injected, so the same module runs against the real
// page and against the Node test harness.
import { isElementVisible } from '../features/actions.js';

export function createPipeHost({ doc, win, ids }) {
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
      };
    },

    // Click the entry's own control. Returns whether there was something to click.
    clickEntry(entry) {
      const el = resolve(entry);
      if (!el) return false;
      el.click();
      return true;
    },

    readActiveTool() {
      const debug = win.__graphDebug;
      return debug && typeof debug.activeTool === 'string' ? debug.activeTool : null;
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
