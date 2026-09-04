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
