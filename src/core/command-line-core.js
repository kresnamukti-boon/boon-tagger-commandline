// Trade-agnostic core of the typed command-line input — ranked matching,
// exact resolution, dispatch verdicts, the capture-phase keydown gate, and
// the bare-Space repeat/close convention. No DOM, no host globals.
//
// This is a SUPERSET of the host app's own native module of the same name
// (constructions-tagger-web.onrender.com's project_graph/js/command-line-
// core.js, read live via opencli — see CLAUDE.md and the restructure plan's
// "Aligning our API with native's" section): every function signature and
// ranking rule below matches native's when this project's own extra fields
// are absent, specifically so this file can go upstream as a drop-in
// replacement with the extra fields simply unused there. The one
// intentional behavioral widening from native, kept everywhere below and
// called out at each site: every `entry.label`/`entry.aliases` read is
// null-tolerant (`?? entry.name` / `?? []`), because this project's own
// existing tables (ANNOTATE_TABLE, the graph host's derived table) predate
// having a separate `label` field at all — native's own version assumes
// `label` and `aliases` always exist and would throw on an entry that
// doesn't carry them.
//
// Native's own header credits this as itself ported from the legacy
// tagger's command line (annotation_jobs/static/js/boon_tagger_
// commandline.js) — ranked prefix/substring matching, exact-match
// resolution, and the AutoCAD bare-Space repeat/close convention.

function entryLabel(entry) {
  return (entry.label ?? entry.name ?? '').toLowerCase();
}
function entryAliases(entry) {
  return (entry.aliases ?? []).map((alias) => alias.toLowerCase());
}

// Ranked matching: exact name/label=0, exact alias=1, name/label prefix=2,
// alias prefix=3, name/label substring=4, stable-sorted by rank. Not fuzzy.
//
// entry.label is checked alongside entry.name at every rank (native's own
// reasoning, unchanged): name is the internal tool id, but a person types
// what they SEE on the tool rail/dropdown — the label — not an id they've
// never been shown. Many id/label pairs share no characters at all, so
// id-only matching leaves a tool unreachable by its own visible name. On
// this project's tables today, label is never set (every entry falls back
// to matching its own name against itself, a no-op widening), which keeps
// this a pure behavior-preserving swap-in for the old RW._cmdMatch.
export function matchCommands(table, query) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return table.slice();
  const ranked = [];
  for (const entry of table) {
    const name = (entry.name ?? '').toLowerCase();
    const label = entryLabel(entry);
    const aliases = entryAliases(entry);
    let rank = -1;
    if (name === q || label === q) rank = 0;
    else if (aliases.includes(q)) rank = 1;
    else if (name.startsWith(q) || label.startsWith(q)) rank = 2;
    else if (aliases.some((alias) => alias.startsWith(q))) rank = 3;
    else if (name.includes(q) || label.includes(q)) rank = 4;
    if (rank !== -1) ranked.push({ entry, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.map((r) => r.entry);
}

// resolveCommand semantics (native's naming; this project's old name was
// findEntry): exact name/label, then exact alias, else null. Deliberately
// NOT prefix-based — Enter/Space only runs an unambiguous match; a bare
// prefix is surfaced through matchCommands' completion list instead.
export function resolveCommand(table, query) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return null;
  for (const entry of table) {
    if ((entry.name ?? '').toLowerCase() === q || entryLabel(entry) === q) return entry;
  }
  for (const entry of table) {
    if (entryAliases(entry).includes(q)) return entry;
  }
  return null;
}

// Native's own dispatch verdict shape: {action:'status', message} or
// {action:'activate', toolId}. This project's own executor (RW.runCommand)
// has more verdict kinds than native's app does (a button click, a
// compound multi-step command, isolation refusals, ...) — those are layered
// on by src/features/ in a later restructure phase, not added here, so this
// stays a faithful copy of what native actually ships today.
export function commandDispatch(table, query, { toolDisabled, blocker }) {
  const entry = resolveCommand(table, query);
  if (!entry) return { action: 'status', message: `unknown command: ${query}` };
  if (toolDisabled(entry.id ?? entry.name)) return { action: 'status', message: `${entry.label ?? entry.name} isn't available right now` };
  const message = blocker(entry.id ?? entry.name);
  if (message) return { action: 'status', message };
  return { action: 'activate', toolId: entry.id ?? entry.name };
}

// Extracted so the modifier/field/dialog gates are unit-testable without a
// DOM. `keyReserved` is an optional per-key callback (default: nothing is
// reserved) for a single-key shortcut the command line has no table entry
// for (native's own example: project_graph's ruler toggle, "m").
//
// Two extra optional gates, both defaulting to native's own behavior when
// omitted (a false positive here would mean an event this project's own
// dispatch just sent gets eaten by its own capture listener, or a real
// tool-selection prompt's digit gets swallowed instead of reaching it):
// - `synthetic`: true for this project's own dispatched keydown
//   (RW._cmdDispatchAppKey's evt.__rwSynthetic) — never captured, so the
//   capture listener can never eat its own dispatch to the host app.
// - `digitPassthrough`: true when the caller has already decided (from ITS
//   OWN context — host, hatch, and whether the bar is genuinely empty/
//   undrafted, none of which this pure function has any business knowing)
//   that a bare digit right now should reach the host app untouched (e.g.
//   this project's graph-host numbered "pick the next tool" prompt) rather
//   than seed the command bar.
export function commandBarShouldCapture({
  key, ctrlKey, metaKey, altKey, typingInFormField, dialogOpen, enabled,
  keyReserved = () => false,
  synthetic = false,
  digitPassthrough = false,
}) {
  if (synthetic) return false;
  if (!enabled) return false;
  if (dialogOpen) return false;
  if (typingInFormField) return false;
  if (ctrlKey || metaKey || altKey) return false;
  if (typeof key !== 'string' || key.length !== 1) return false;
  if (keyReserved(key)) return false;
  if (digitPassthrough && /^[0-9]$/.test(key)) return false;
  return true;
}

// Bare Space on an empty bar: AutoCAD's convention. With a tool armed,
// Space closes to select; with none armed, it repeats the last tool; with
// neither, it's a no-op. A non-empty query means Space is just a normal
// keystroke mid-typing.
//
// Four extra optional parameters, all defaulting to native's own plain
// 3-branch behavior when omitted:
// - `modeActive`/`forceSelectModes`: leaving one of this project's own
//   MODE switches (default: none, i.e. `forceSelectModes = []`) forces
//   select regardless of armed/lastTool state — checked first, since the
//   project's own toolArmed flag is already false the instant a mode
//   switch runs (every mode switch clears it), so without this override
//   Space would repeat the PRIOR tool instead of resting in select.
// - `modalOpen`: while one of the graph host's own config-dialog modals is
//   open, Space neither repeats nor closes (dispatching a raw key at an
//   open dialog is untested) — it opens a menu scoped to that modal
//   instead (`'open-modal-menu'`), checked ahead of the ordinary
//   armed/lastTool branches for the same reason as `forceSelectModes`.
// - `openMenuWhenIdle`: when nothing is armed and there's no lastTool to
//   repeat, native's own plain behavior is `{action:'none'}` (a literal
//   space character, since the app has no dropdown concept of its own tool
//   vocabulary to open at rest). Set this true to get `'open-tool-menu'`
//   instead — "initialize the console," this project's own round-19
//   addition — a starting menu of what can be armed.
export function spaceRepeatAction({
  query, lastTool, toolArmed,
  modeActive = null,
  forceSelectModes = [],
  modalOpen = false,
  openMenuWhenIdle = false,
}) {
  if (query) return { action: 'none' };
  if (forceSelectModes.includes(modeActive)) return { action: 'select' };
  if (modalOpen) return { action: 'open-modal-menu' };
  if (toolArmed) return { action: 'select' };
  if (lastTool) return { action: 'repeat', toolId: lastTool };
  if (openMenuWhenIdle) return { action: 'open-tool-menu' };
  return { action: 'none' };
}
