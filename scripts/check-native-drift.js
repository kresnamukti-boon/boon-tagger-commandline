#!/usr/bin/env node
// Drift check: has native (constructions-tagger) changed anything the piping command line depends on?
//
// READ-ONLY. It fetches native's public static files (GET only) or reads files from a folder, and
// compares them with what this repo recorded (test/native-ids.json, src/pipe/pipe-tables.js). It
// writes nothing: no repo files, no temp files, no network POSTs. test/native-drift.test.mjs checks
// that this file contains no write call.
//
//   node scripts/check-native-drift.js                      fetch the live files from the live site
//   node scripts/check-native-drift.js --base <url>         another host (e.g. staging)
//   node scripts/check-native-drift.js --from-dir <dir>     read files from a folder instead (offline)
//   node scripts/check-native-drift.js --html <file>        also check element ids against a saved copy of the rendered
//                                                           piping page (view-source of /graph/projects/<id>/session/?trade=piping)
//   node scripts/check-native-drift.js --menu <file>        also compare the fitting/fixture families (JSON; print the snippet to
//                                                           make it with --menu-snippet)
//   node scripts/check-native-drift.js --entry-url <url>    the hashed graph-session-entry.<hash>.js if you have it
//
// Exit code: 0 = no drift found, 1 = drift found, 2 = could not read something.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const DEFAULT_BASE = 'https://constructions-tagger-web.onrender.com';
const STATIC_DIR = '/static/project_graph/js/';
const HASHED = ['pipe-session-ui.js', 'pipe-bbox-connect.js', 'pipe-diameter.js', 'pipe-command-line.js'];

/* ---------- pure helpers (exported for the tests) ---------- */

function sha16(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// Native's PIPE_TOOL_KEYS literal -> { toolId: 'k' } (lower-cased), or null if it can't be found.
function parseToolKeys(src) {
  const m = stripComments(src).match(/export const PIPE_TOOL_KEYS = (\{[\s\S]*?\});/);
  if (!m) return null;
  const out = {};
  for (const e of m[1].matchAll(/(?:'([a-z-]+)'|"([a-z-]+)"|([a-z][a-z-]*))\s*:\s*['"]([^'"]*)['"]/g)) {
    out[e[1] || e[2] || e[3]] = e[4].toLowerCase();
  }
  return out;
}

// Native's SUPPORTED_TOOLS set -> ['route', ...], or null.
function parseSupportedTools(src) {
  const m = stripComments(src).match(/const SUPPORTED_TOOLS = new Set\(\[([\s\S]*?)\]\)/);
  return m ? [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]) : null;
}

// Every string literal inside the statements that build the placement panel's hint line.
function extractHintLiterals(src) {
  const code = stripComments(src);
  const statements = [];
  for (const m of code.matchAll(/(?:bboxHint\.textContent\s*\+?=|const readyHint\s*=)[\s\S]*?;\s*\n/g)) statements.push(m[0]);
  const found = [];
  for (const st of statements) {
    const appended = /bboxHint\.textContent\s*\+=/.test(st);
    for (const l of st.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
      const text = l[1] ?? l[2] ?? l[3] ?? '';
      if (text.length > 6 && /\s/.test(text)) found.push({ text, appended: appended || text.startsWith(' ') });
    }
  }
  return found;
}

// Known hint openings (strings or arrays of strings per phase) -> flat list.
function flattenPrefixes(prefixes) {
  return Object.values(prefixes).flat();
}

// Compare live hints with ours: which of our openings are gone, which live openings we don't know.
function compareHints(liveSrc, prefixes) {
  const known = flattenPrefixes(prefixes);
  const live = extractHintLiterals(liveSrc);
  const liveText = stripComments(liveSrc);
  const gone = known.filter((p) => !liveText.includes(p.trim()));
  const added = live.filter((l) => !l.appended && !known.some((p) => l.text.startsWith(p)))
    .map((l) => l.text);
  return { gone, added: [...new Set(added)] };
}

// Which of `needles` are not present in `haystack`.
function missingStrings(needles, haystack) {
  return needles.filter((n) => !haystack.includes(n));
}

// Compare tool tables: ours vs native's live PIPE_TOOL_KEYS (+ SUPPORTED_TOOLS).
function compareTools({ ourKeys, liveKeys, liveSupported }) {
  const out = { added: [], removed: [], keyChanged: [], renamed: [], unsupported: [], notInKeys: [] };
  if (!liveKeys) return { ...out, unreadable: true };
  for (const id of Object.keys(liveKeys)) if (!(id in ourKeys)) out.added.push({ id, key: liveKeys[id] });
  for (const id of Object.keys(ourKeys)) if (!(id in liveKeys)) out.removed.push({ id, key: ourKeys[id] });
  for (const id of Object.keys(ourKeys)) if (id in liveKeys && liveKeys[id] !== ourKeys[id]) out.keyChanged.push({ id, was: ourKeys[id], now: liveKeys[id] });
  for (const r of out.removed) {
    const same = out.added.find((a) => a.key === r.key);
    if (same) out.renamed.push({ from: r.id, to: same.id, key: r.key });
  }
  if (liveSupported) {
    out.unsupported = Object.keys(ourKeys).filter((id) => !liveSupported.includes(id));
    out.notInKeys = liveSupported.filter((id) => !(id in liveKeys));
  }
  return out;
}

// Compare family id lists, per tool: { fitting: [...], fixture: [...] }.
function compareFamilies(baseline, live) {
  const out = {};
  for (const tool of Object.keys(baseline)) {
    const have = new Set(live?.[tool] ?? []);
    const was = new Set(baseline[tool]);
    out[tool] = {
      added: [...have].filter((id) => !was.has(id)),
      removed: [...was].filter((id) => !have.has(id)),
      missingTool: !(tool in (live ?? {})),
    };
  }
  return out;
}

// Names in `haystack` that look like `name` (shared '-' parts), for "renamed to?" hints.
function similarNames(name, haystack, limit = 3) {
  const parts = new Set(name.split('-').filter(Boolean));
  const seen = new Map();
  for (const m of haystack.matchAll(/[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+/g)) {
    const cand = m[0];
    if (cand === name || seen.has(cand)) continue;
    const shared = cand.split('-').filter((p) => parts.has(p)).length;
    if (shared >= Math.max(1, Math.ceil(parts.size / 2))) seen.set(cand, shared);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map((e) => e[0]);
}

// Line-level change summary between a saved copy and the live text.
function lineDiff(savedText, liveText) {
  const count = (text) => {
    const m = new Map();
    for (const l of text.split('\n')) { const t = l.trim(); if (t) m.set(t, (m.get(t) || 0) + 1); }
    return m;
  };
  const a = count(savedText), b = count(liveText);
  const removed = [], added = [];
  for (const [l, n] of a) if ((b.get(l) || 0) < n) removed.push(l);
  for (const [l, n] of b) if ((a.get(l) || 0) < n) added.push(l);
  return { added, removed };
}

// The console snippet that dumps the fitting/fixture menus from the open piping page (read-only).
const MENU_SNIPPET = [
  '// Run in the console of a piping page, once per tool: arm the tool, draw the box, then run this.',
  '// (Esc cancels the placement afterwards. Nothing is saved.)',
  "(() => { const m = document.getElementById('graph-pipe-fitting-select-menu');",
  "  return JSON.stringify({ [window.__graphDebug.activeTool]: [...m.querySelectorAll('button[data-family-id]')].map(b => b.dataset.familyId) }); })()",
].join('\n');

/* ---------- reading sources ---------- */

async function fetchText(url) {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

async function loadSources({ base, fromDir, htmlPath, entryUrl, files }) {
  const out = {};
  const errors = [];
  for (const name of files) {
    try {
      if (fromDir) {
        const p = path.join(fromDir, name);
        out[name] = fs.readFileSync(p, 'utf8');
      } else {
        const url = name === 'graph-session-entry.js' && entryUrl ? entryUrl : base + STATIC_DIR + name;
        out[name] = await fetchText(url);
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  if (htmlPath) {
    try { out['graph_session.html'] = fs.readFileSync(htmlPath, 'utf8'); } catch (err) { errors.push(`${htmlPath}: ${err.message}`); }
  }
  return { sources: out, errors };
}

/* ---------- the report ---------- */

async function buildReport(opts) {
  const ids = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'native-ids.json'), 'utf8'));
  const tables = await import(pathToFileURL(path.join(ROOT, 'src', 'pipe', 'pipe-tables.js')).href);
  const files = [...HASHED, 'graph-session-entry.js'];
  const { sources, errors } = await loadSources({ ...opts, files });
  const savedDir = opts.savedDir && fs.existsSync(opts.savedDir) ? opts.savedDir : null;
  const lines = [];
  let drift = 0;
  const section = (title) => lines.push('', `== ${title} ==`);
  const say = (s) => lines.push(s);
  const flag = (s) => { drift += 1; lines.push('  ! ' + s); };

  say(`Native drift check (read-only). Recorded against ${ids.source}, checked live on ${ids.checkedLive}.`);
  say(opts.fromDir ? `Reading files from ${opts.fromDir}` : `Fetched from ${opts.base}${STATIC_DIR}`);
  for (const e of errors) say('  could not read: ' + e);

  section('files (hash vs recorded)');
  for (const name of HASHED) {
    if (!(name in sources)) { say(`  ${name}: not read`); continue; }
    const live = sha16(sources[name]);
    const rec = ids.sha256First16[name];
    if (live === rec) { say(`  ${name}: unchanged (${live})`); continue; }
    flag(`${name}: CHANGED (recorded ${rec}, now ${live})`);
    if (savedDir && fs.existsSync(path.join(savedDir, name))) {
      const d = lineDiff(fs.readFileSync(path.join(savedDir, name), 'utf8'), sources[name]);
      say(`      against the saved copy: ${d.added.length} line(s) added, ${d.removed.length} removed`);
      for (const l of d.removed.slice(0, 15)) say('      - ' + l.slice(0, 150));
      for (const l of d.added.slice(0, 15)) say('      + ' + l.slice(0, 150));
      if (d.added.length > 15 || d.removed.length > 15) say('      (first 15 of each shown)');
    } else {
      say('      (no saved copy to compare with: put the old files in test/fixtures/native/ to see the lines)');
    }
  }
  if ('graph-session-entry.js' in sources) say(`  graph-session-entry.js: hash not recorded (the file name carries a build hash); its strings are checked below`);

  section('tools (native PIPE_TOOL_KEYS / SUPPORTED_TOOLS vs ours)');
  if (sources['pipe-session-ui.js']) {
    const t = compareTools({
      ourKeys: tables.PIPE_FALLBACK_KEYS,
      liveKeys: parseToolKeys(sources['pipe-session-ui.js']),
      liveSupported: parseSupportedTools(sources['pipe-session-ui.js']),
    });
    if (t.unreadable) flag('could not read PIPE_TOOL_KEYS from pipe-session-ui.js (the file changed shape)');
    for (const a of t.added) flag(`new tool "${a.id}" (key ${a.key}): not in our fallback keys`);
    for (const r of t.removed) flag(`tool "${r.id}" (key ${r.key}) is gone from native's keys`);
    for (const c of t.keyChanged) flag(`tool "${c.id}": key ${c.was} -> ${c.now}`);
    for (const r of t.renamed) flag(`probably renamed: "${r.from}" -> "${r.to}" (same key ${r.key})`);
    for (const id of t.unsupported) flag(`tool "${id}" is no longer in SUPPORTED_TOOLS`);
    for (const id of t.notInKeys) flag(`SUPPORTED_TOOLS has "${id}" but PIPE_TOOL_KEYS does not`);
    if (!t.unreadable && !t.added.length && !t.removed.length && !t.keyChanged.length && !t.unsupported.length && !t.notInKeys.length) say('  no change');
    const aliasTools = Object.keys(tables.PIPE_TOOL_ALIASES).filter((id) => !(id in (parseToolKeys(sources['pipe-session-ui.js']) || {})));
    for (const id of aliasTools) flag(`we have aliases for "${id}" but native has no such tool any more`);
  } else say('  not read');

  section('element ids and strings we rely on');
  const checks = [
    ['pipe-session-ui.js', 'pipeSessionUi.strings', ids.pipeSessionUi.strings],
    ['graph-session-entry.js', 'entryBundle.strings', ids.entryBundle.strings],
    ['pipe-bbox-connect.js', 'pipeBboxConnect.strings', (ids.pipeBboxConnect || {}).strings || []],
  ];
  for (const [file, label, needles] of checks) {
    if (!(file in sources)) { say(`  ${file}: not read`); continue; }
    const miss = missingStrings(needles, sources[file]);
    for (const n of miss) {
      const m = n.match(/'([a-z][a-z0-9-]+-[a-z0-9-]+)'/);
      const hint = m ? similarNames(m[1], sources[file]) : [];
      flag(`${file}: "${n}" not found (${label})${hint.length ? ' — similar now: ' + hint.join(', ') : ''}`);
    }
    if (!miss.length) say(`  ${file}: all ${needles.length} strings found`);
  }
  if (sources['graph_session.html']) {
    const html = sources['graph_session.html'];
    const missId = ids.html.ids.filter((id) => !html.includes(`id="${id}"`));
    for (const id of missId) {
      const hint = similarNames(id, html);
      flag(`page html: id "${id}" not found${hint.length ? ' — similar now: ' + hint.join(', ') : ''}`);
    }
    for (const s of ids.html.strings.filter((x) => !html.includes(x))) flag(`page html: ${s} not found`);
    if (!missId.length) say(`  page html: all ${ids.html.ids.length} ids found`);
    const newIds = [...html.matchAll(/id="(graph-[a-z0-9-]+)"/g)].map((m) => m[1]).filter((id) => /^graph-(pipe|system|undo|redo|zoom|ruler|components|finish|cancel|save|recording|submission|import|create|rename|assign(?!ee))/.test(id) && !ids.html.ids.includes(id));
    if (newIds.length) say('  (ids in the page we do not list, FYI): ' + [...new Set(newIds)].slice(0, 25).join(', '));
  } else say('  page html: skipped (pass --html <saved rendered page> to check the element ids)');

  section('hints (what the placement panel says in each phase)');
  if (sources['pipe-session-ui.js']) {
    const h = compareHints(sources['pipe-session-ui.js'], tables.PIPE_HINT_PREFIXES);
    for (const g of h.gone) flag(`hint opening gone or reworded: "${g}"`);
    for (const a of h.added) flag(`new hint wording we do not know: "${a.slice(0, 120)}"`);
    if (!h.gone.length && !h.added.length) say('  all known hints present, no new ones');
  } else say('  not read');

  section('fitting / fixture families');
  if (opts.menuPath) {
    try {
      const live = JSON.parse(fs.readFileSync(opts.menuPath, 'utf8'));
      const f = compareFamilies(ids.families ?? {}, live);
      for (const [tool, r] of Object.entries(f)) {
        if (r.missingTool) { say(`  ${tool}: not in the menu file`); continue; }
        for (const id of r.added) flag(`${tool}: new family ${id}`);
        for (const id of r.removed) {
          const sim = similarNames(id, Object.values(live).flat().join(' ').replace(/ /g, ' '));
          flag(`${tool}: family ${id} is gone${sim.length ? ' — similar now: ' + sim.join(', ') : ''}`);
        }
        if (!r.added.length && !r.removed.length) say(`  ${tool}: no change (${(ids.families[tool] || []).length} families)`);
      }
    } catch (err) { errors.push(`menu file: ${err.message}`); say('  could not read the menu file: ' + err.message); }
  } else {
    say('  skipped: the families come from the server, not from the JS files. To compare them, arm the tool, draw a box,');
    say('  run the snippet from `node scripts/check-native-drift.js --menu-snippet` in the console, save its output as JSON, pass --menu <file>.');
  }

  lines.push('');
  say(drift ? `DRIFT: ${drift} difference(s) found. Review above before trusting the piping command line against this native build.` : 'No drift found.');
  return { text: lines.join('\n'), drift, errors };
}

/* ---------- command line ---------- */

function parseArgs(argv) {
  const o = { base: DEFAULT_BASE, savedDir: path.join(ROOT, 'test', 'fixtures', 'native') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--base') o.base = next().replace(/\/$/, '');
    else if (a === '--from-dir') o.fromDir = next();
    else if (a === '--html') o.htmlPath = next();
    else if (a === '--menu') o.menuPath = next();
    else if (a === '--entry-url') o.entryUrl = next();
    else if (a === '--saved-dir') o.savedDir = next();
    else if (a === '--menu-snippet') o.snippet = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error('unknown option: ' + a);
  }
  return o;
}

async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (err) { console.error(err.message); process.exit(2); }
  if (opts.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 19).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); return; }
  if (opts.snippet) { console.log(MENU_SNIPPET); return; }
  const { text, drift, errors } = await buildReport(opts);
  console.log(text);
  process.exit(errors.length ? 2 : (drift ? 1 : 0));
}

if (require.main === module) main().catch((err) => { console.error(err.stack || err.message); process.exit(2); });

module.exports = {
  sha16, stripComments, parseToolKeys, parseSupportedTools, extractHintLiterals, compareHints, missingStrings,
  compareTools, compareFamilies, similarNames, lineDiff, buildReport, parseArgs, MENU_SNIPPET,
};
