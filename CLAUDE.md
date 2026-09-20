# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **This file was compacted** from a much longer round-by-round changelog (27 rounds of history,
> ~3400 lines). The old file narrated every round's live-testing session, verification counts, and
> reverted attempts in full. This version keeps only what's needed to work on the repo going
> forward: current architecture, hard constraints, standing design doctrines, operational gotchas
> for live testing, and the open questions that are still actually open. Round numbers are kept in
> prose only where they anchor a specific still-relevant fact (e.g. "round 19's four modals").

## What this is

An AutoCAD-style command line for two related host apps on the Constructions Tagger platform
(`constructions-tagger-web.onrender.com`): type a native tool's name (or alias) from anywhere on
the page and it dispatches that tool, no click required. This repo is a genuinely isolated
extraction — it contains **only** the command-line activator and its own minimal bootstrap, not
the full region/mask annotation workbench those tools were originally built alongside. That
workbench (regions, mask tools, pipe/elbow annotation, OCR-assisted reference naming, and its own
older version of this same command line with workbench-tool entries) lives in a sibling repo,
`boon-tagger-mask` (also under `~/Projects/boon-projects/`).

Like the mask repo, this is **not a normal web app** — no server, no framework, no package.json.
It's plain-JS modules concatenated into a single script and pasted into the browser DevTools
console to run inside a live page. Nothing here runs standalone; every module assumes it's
executing inside one of the two host pages and reaches into that page's own globals.

Nothing auto-draws or auto-submits annotations on the **annotate** host — every feature but one
(middle-drag pan) dispatches a synthetic keydown to make the host app switch its own current
tool/mode, exactly as if the user had pressed that key. On the **graph** ("Duct Takeoff") host,
button-backed action commands (undo, finish route, apply a modal's Choose button, ...) do click
real buttons that submit real commands to that app's own autosave journal — see "Constraints"
below for the exact, deliberately-narrow boundary this project draws around that. The activity
tracker (`/analytics/api/events/`) is read-only observed, never spoofed.

## Build / verify commands

There is no package manager, linter, or test suite. The only "build" step is concatenation, and
the only syntax verification is `node --check`.

```bash
bash build_loader.sh     # rebuilds console_loader.js (runs node --check on the result)
node verify_cmdline.js   # synthetic Node harness — DOM stub, drives real registered listeners
```

`verify_cmdline.js` is large (1000+ assertions as of round 27) and is this project's only
automated safety net. It cannot validate against a live page's real DOM/globals — to actually
verify a change works, it has to be pasted into a real page in Chrome (see README.md's
"Injection" steps). **This project's own established discipline when adding a test**: after
writing it, revert just the line(s) it's meant to guard and confirm it fails exactly as expected,
then restore — this has repeatedly caught tests that were accidentally tautological.

## Architecture

### Load order

Four modules, concatenated by `build_loader.sh` in this order:

1. **`rw_host.js`** — loads first, before anything else exists. Its only job:
   `window.__RWhost = {id: 'graph'|'annotate', canvasId}`, detected from whether
   `#graph-session-root` exists in the DOM (not the URL, so it stays correct if a route ever
   moves).
2. **`rw_panelux.js`** — collapsible panel UI and the **RW: ON/OFF** master killswitch; wraps
   `window.addEventListener` (keydown, capture) so later handlers auto-gate on `RW.enabled`. Has a
   re-entrancy guard (`if (document.getElementById('rw-collapse')) return;`) so re-pasting the
   loader into an already-loaded page doesn't duplicate the header/killswitch. Also owns the
   draggable-panel mechanics (see below).
3. **`rw_core.js`** — creates `window.__RW` (gated on `RW.vcore`), copies `window.__RWhost` to
   `RW._host` (falling back to the annotate identity if `rw_host.js` didn't run), a bare
   `#rw-panel`/`#rw-list` mounted into `#right-rail-content`, and `RW._commitStatus` (a single
   overwritten status line, not a log). No region/mask/annotation engine at all.
4. **`rw_cmdline.js`** — the command bar, autocomplete, tag/system search, and native-tool
   dispatch itself — everything host-specific (tool table, settings, isolation, modals) branches
   on `RW._host.id` inside this one file, aliased once to `RW_HOST`/`RW_CANVAS_ID`/`RW_IS_GRAPH`.
   Gates on `RW.vcore`, and separately on its own `RW.vcmd` re-entry guard — **re-pasting the
   loader into an already-injected page is a no-op for this module specifically** (see "Live
   testing gotchas" below; this has repeatedly caused confusion mid-session).

### The two hosts

- **annotate** — the ordinary Constructions Tagger annotation-job page. Globals:
  `annotationState` (`.currentTool`, `.mode`, `.currentTag`, `.tagShortcuts`), canvas id
  `annotation-canvas`. Every draw-mode tool dispatches `d` (enter draw mode) immediately before
  its own letter — defensive, never confirmed live to be necessary or unnecessary either way.
  Mode switches (pan/select/draw/label/crop/mirror) dispatch only their own letter.
- **graph** — the "Duct Takeoff" node-graph duct editor (`/graph/projects/.../session/`), a
  completely separate full-screen surface with no `annotationState` at all. Globals:
  `window.__graphDebug.activeTool` (a live, directly-readable current-tool string — unlike the
  annotate host, this has been confirmed live repeatedly), canvas/pan surface
  `graph-canvas-stage`. No draw-mode concept — every tool arms directly on its own key, no `d`
  prefix. Pans via a CSS `transform`, not `scrollLeft`/`scrollTop` (confirmed live), so
  middle-drag pan is disabled by default here (`RW._panEnabled` defaults `false`).
  **Two different trade packs share this host**: a duct pack (the one documented throughout this
  file) and a **piping pack** (`pipe-session-ui.js`'s `PIPE_TOOL_KEYS`, active when
  `bootstrap.workspace.tradePack === "piping"`), which reuses several of the same tool ids
  (`extend`, `vertical`, `cut`, `transition`, ...) under **different key letters**. This is why the
  graph host's tool table is derived live from the toolbar rather than hardcoded — see below.

### Core dispatch mechanism

`RW._cmdDispatchAppKey(key)` dispatches a synthetic keydown —
`document.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}))` — marking
its own event `evt.__rwSynthetic = true` first so the global auto-capture listener (below) never
eats its own dispatch. It reports the dispatched key plus the tool-string before/after via
`RW._commitStatus` — this diagnostic readout is how most of this project's "what's the real
current-tool string" questions have been answered live.

`RW.runCommand(name)` blurs the command input **unconditionally, as its first action**, before
dispatching anything — a real fix, not a nicety: the graph host's own keydown handler refuses to
switch tools while `document.activeElement` is an `INPUT`/`SELECT`/`TEXTAREA`, so without this a
tool-switch command typed into the (focused) command bar would silently no-op. The one deliberate
exception is the `dimension` entry (below), which must keep the input focused to prompt for a
value, so it short-circuits before this blur.

### Command bar + autocomplete

A plain div at the top of `#rw-list`. The dropdown mounts on `document.body` with
`position:fixed`, anchored off `#rw-panel`'s own bounding rect (not the input's — the input sits
below the panel's header strip), preferring to open upward but flipping below when there isn't
room above and there is below; both the panel and the dropdown sit near the 32-bit z-index max
with the dropdown one above the panel so it's never occluded. Ranking (`RW._cmdMatch`): exact name
→ exact alias → name-prefix → alias-prefix → substring. The highlighted row is scrolled into view
by hand (`cmdScrollRowIntoView`, adjusting `menuEl.scrollTop` directly) rather than
`Element.scrollIntoView()`, which would also scroll the drawing itself out from under the user.

**The whole panel is draggable** by its header strip (left mouse button, 3px move threshold before
a drag starts, suppresses the one `click` that would otherwise toggle collapse on release), clamped
on-screen, with no persistence across reloads (a fresh paste always re-pins bottom-center;
`__RW._cmdResetBar()` restores that manually).

### Global auto-capture

One `document`-level, capture-phase `keydown` listener seeds and focuses the command input on the
first printable keystroke typed anywhere (skipped whenever a real input/textarea/contenteditable
is already focused), then hands off to the input's own normal keydown handling. Gated on
`RW.enabled`. Bails out (plain `return`, no `preventDefault`) whenever a `<dialog>` is open, except
for graph host's four tracked config-dialog modals (below) — and even there, a focused `<SELECT>`
inside one of those specific modals is exempted, so the modal's own dropdown fields keep working.

**Tab is escalated to a separate `window`-level capture listener** (scoped to
`e.target === inputEl` only), because the graph host's own keydown handling can register on
`document` ahead of this project's listener and win a same-node race — a `window`-level listener
structurally always sees the capture phase before `document` does, regardless of registration
order.

**Space** does one of several things depending on state, in this priority order: from `label` mode
→ force to select; nothing armed + a remembered last tool + bar empty → repeat that tool directly
(no dropdown); a real tool currently armed → close it to select; the very first Space ever, or
Space while one of the four graph modals is open → "initialize the console" (open the dropdown
pre-populated with either the tool vocabulary or that modal's own fields/actions, without seeding
any character into the bar) rather than falling through to a literal-space query that would dump
the entire, unfiltered command table. All of this state (`RW._cmdToolArmed`, `RW._cmdLastTool`,
`RW._cmdModeActive`) is **tracked by this project itself**, never re-derived from a fresh
`annotationState`/`__graphDebug` read at decision time — see "Design doctrines" below for why.

**Digit passthrough (graph host only)**: a bare digit typed while the command bar is genuinely
empty and unfocused passes straight through untouched, since no graph-host tool/action/param name
starts with a digit — this exists so a duct's own numbered "pick the next tool" prompt (never
positively identified in the DOM) isn't swallowed. Escape hatch: `RW._cmdDigitPassthrough`.

### Tag / system search

Typing `#` as the input's first character switches the dropdown to searching a detected list
instead of the command table.

- **annotate host**: `RW._cmdDetectTags()` auto-detects `RW._cmdTagList` from `annotationState`
  at load. Selection is **exclusively** `RW._cmdSelectTagUnsafe` — a direct
  `annotationState.currentTag = tag` assignment — after an earlier "map list-index to the app's
  1-9/0 digit hotkeys" path was **live-confirmed wrong** (a real job's index-0 tag didn't match
  what its `1` hotkey actually selected) and removed entirely rather than patched. Whether a plain
  property assignment is correctly picked up by the app's own rendering is still not fully
  confirmed (see Open Questions).
- **graph host**: `#` repoints to `#graph-system-select`, read/written via `.value` +
  `input`/`change` events (never a plain property assignment — there's no `annotationState` to
  assign into on this host). Confirmed live against a 30-system project including genuine
  duplicate option texts.

### Native tool table

- **annotate host**: `RW._cmdTable` is a hardcoded list, every entry `kind:'native'`, one-shot
  `run` functions (no armed/disarm tracking — there's no confirmed way to introspect which native
  tool is currently active beyond the one `'bounding_box'`/`'ribbon'`/`'linear'` strings ever
  seen). Four letters were reclaimed once the workbench commands that used to collide with them
  were deleted from this repo (`wand`→k, `pan`→a, `select`→s, `polygon`→r).
- **graph host**: derived **live from the real toolbar** at load
  (`document.querySelectorAll('[data-tool]')`, each button's key read from its own
  `.graph-tool-key` badge span) — **the badge is authoritative, not a hardcoded key**, specifically
  because the piping trade pack reuses duct tool ids under different keys, and reading the DOM
  live is the only way to get the right one for whichever pack is actually active on a given
  project. A hardcoded fallback table (`GRAPH_TABLE`, 13 entries as of round 27) is used only if no
  toolbar is found. Collisions (duplicate `data-tool`, duplicate badge letter, missing badge, a
  curated alias colliding with a derived name) are resolved deterministically and reported via
  `RW._cmdGraphTableInfo` (`skipped`/`aliasDropped`/`shadowedActions`), never silently. A console
  escape hatch, `RW._cmdRebuildGraphTable()`, re-derives without a page reload.
- **graph host, action commands** (`GRAPH_ACTIONS`): button-backed one-shot commands (undo, redo,
  zoomfit/in/out, ruler, finish/cancel a route, calibrate/setscale/resetscale, evidence/note/
  rationale, region, the eight modal Choose/Cancel actions below, `annotations`/`anno` — a
  view-only toggle). Reuses `RW.runCommand`'s pre-existing `btn`/`disabled`/`hidden` resolution
  path. `FORBIDDEN_BUTTON_IDS` (save/recording controls) is refused **in code**, not just left out
  of the table, so a direct console call can't reach them either. `cmdActionUsable(entry)` mirrors
  that resolution read-only so the dropdown itself omits an action that wouldn't currently do
  anything (a disabled or off-page button), rather than listing it and refusing it after the fact.

### Settings drill-down (`tool.param = value`)

Typing `<toolname>.` (or, while that tool is the currently active one, just the bare param name —
additive on the annotate host, but **exclusive** under isolation on the graph host, see below)
lists that tool's own live settings controls and lets you pick one, type a value, and apply it.

- **Discovery is a live DOM sweep by id prefix**, not a hardcoded per-param table — this app keeps
  every tool's settings controls permanently in the DOM (toggled by visibility, not
  mount/unmount), so sweeping fresh on every drill-in can never go stale the way a hardcoded
  min/max table would. Covers number/range, checkbox, select, and text controls, swept in one
  combined `querySelectorAll` call so results come back in real on-screen document order.
- **Matching is by id OR by live label**: a control's `<label><span>` text is read fresh every
  call (never cached), so e.g. typing "diameter" matches route's width control the instant the app
  itself relabels it from "Width (in)" after a profile switch, with "width" still matching by id
  either way. Purely additive to id-matching, never a replacement.
- Applying: parses/clamps the value (numeric), matches by 1-based index/text/prefix (select), or
  toggles immediately on pick (checkbox — no draft, no typed on/off step) — writes the real
  `.value`/`.checked`, dispatches `input`+`change`, then re-arms the tool (skipped while a modal
  is open, see below). A select param's own option list additionally supports **Tab to
  live-preview and cycle** through options on the real page (wraparound, Shift+Tab reverses),
  reverting to the true original value on Escape only if something was actually previewed.
- `dimension`/`dim` — a compound command that chains a width prompt straight into a height prompt
  (on-screen order), fully live-discovered per active tool (checks both controls exist before
  starting; a bad width value stops the chain rather than skipping ahead).
- `CONFIRMED_WRITE_IDS` names the small set of controls individually confirmed live to actually
  take effect (currently `magic-wand-tolerance`, `graph-width-input`, `graph-profile-select`) —
  every other write still carries a "confirm it actually applied" hedge in its status message.

### The four graph config-dialog modals

Four real `<dialog>`s, one per tool, sharing the same `<label><span>` control convention as the
ordinary inspector: **branch fitting** (`graph-branch-fitting-modal`, tool `branch`), **change
size / transition** (`graph-checkpoint-transition-modal`, tool `transition`), **GRD placement**
(`graph-checkpoint-grd-modal`, tool `grd`), **riser elevation** (`graph-checkpoint-riser-modal`,
tool `vertical`). `cmdOpenToolModal(tool)` resolves the currently-open one, if any; the ordinary
settings sweep is scoped to inside that dialog instead of the page-wide inspector when one is
open. Re-arming the tool is **skipped** while its modal is open (dispatching a key into an open
dialog is untested and could just as easily cancel it), and each write stamps
`RW._cmdLastUserCmdAt` directly instead so the auto-select grace window still applies. Each modal
has its own Choose/Cancel-equivalent action commands (branch: `choose`/`cancelbranch`; change
size: `apply`/`cancelsize`; GRD: `place`/`cancelgrd`; riser: `placeriser`/`cancelriser`) — the `×`
close buttons are deliberately not exposed.

**Modal memory** (graph host): select/checkbox fields inside these four modals are remembered
per-tool (`RW._cmdModalMemory`, persisted to `localStorage`, wrapped in try/catch so a disabled/
unavailable store just degrades to in-memory-only) and auto-filled the instant a modal is detected
open (edge-triggered off the same 250ms poll the auto-select watcher already runs). Number/text
fields are never remembered (more likely to differ duct to duct than select/checkbox fields are).
**Branch fitting is excluded from this mechanism entirely** — its own field-memory now lives in a
separate, independent repo, `boon-duct-workbench`, per the user's own request to split it out;
`transition`/`grd`/`vertical` are unaffected.

### Isolation (graph host only)

While a tool is armed, the command line restricts what's typeable to: that tool's own properties
(bare param or `<tool>.`), the ways out (`select`, Escape, Space), `finish`/`cancel`,
`dimension`, and — if a config-dialog modal is open for that tool — its own Choose/Cancel action
commands. Everything else (a different tool, `#` search, an unrelated action button) is refused
with a status message, enforced both in the dropdown filter and, redundantly, inside
`RW.runCommand` itself so a direct console call can't bypass it either.

**Exception**: switching directly to a **different tool** is exempt from isolation (typing or
picking another tool's name arms it immediately, no "type select first" detour) — but **only**
while a real tool is armed, not while one of the four modals is open, since dispatching a
different tool's key over an open dialog was never a considered/tested scenario.

`RW._cmdIsolateTools = false` is the console escape hatch back to the old fully-additive behavior.
The annotate host is unaffected by any of this (its own settings-blend, round 5b, stays additive).

### Auto-select resting state

Select is the default resting state (AutoCAD convention). `RW._cmdGoSelect(reason, quiet,
bypassSuppression)` is the single funnel for every trigger that returns to select — load (skipped
if a tool is already armed), Escape (deferred via `setTimeout(...,0)` so the app's own Escape
handling runs first; never calls `preventDefault`), and a 250ms poll that watches for
`currentTool`/`activeTool` clearing itself back to null/`'select'` on its own. The poll is
edge-triggered (a confirmed transition seen on two consecutive ticks, never a transient blip) and
guarded against fighting a deliberate mode switch three independent ways (a dispatch stamping its
own expected after-state, a mode gate, and a ~1s grace window after any command), plus a circuit
breaker that disables the whole feature if it reverts more than 5 times in 5s. A 600ms suppression
window stops Escape and the poll from double-firing when they race each other; a deliberate,
repeated user action (Space) is allowed to bypass that window.

### Middle-drag pan

The one feature that doesn't dispatch a key: writes `scrollLeft`/`scrollTop` directly on a real
scroll container (resolved fresh per drag, never cached), via pointer events with multiple
independent teardown paths. Annotate-host only by default — the graph host pans via a CSS
transform, confirmed to have nothing to scroll, so `RW._panEnabled` defaults `false` there.
`RW._panDiagnose()` is the console probe for confirming a page's real scroll mechanism before
trusting this feature on it.

## Constraints (do not violate)

- **Console injection only.** `console_loader.js` (paste-per-page) is the only delivery
  mechanism.
- **The user base is annotators, not programmers.** Paste-and-go — no install steps, no config
  files, no build step on the annotator's end.
- **Mostly a tool-switcher, with narrow, deliberate exceptions.** On the **annotate host**, every
  feature but middle-drag pan dispatches a synthetic keydown to make the app switch its own
  current tool/mode — it never draws, submits, or otherwise touches annotation state directly
  (tag selection is the one direct-assignment exception, and is flagged as unverified everywhere
  it appears). Middle-drag pan writes `scrollLeft`/`scrollTop` directly because dispatching the
  app's own pan key would switch tools, which panning must specifically not do, and a synthetic
  `wheel` event can't cause real scrolling — this widens only the *mechanism*, never touches
  `annotationState`.
- **On the graph host, action commands (buttons) DO submit real commands** to that app's own
  autosave journal — confirmed by reading the host's own JS bundle: there is no manual-commit
  mode there at all, every click (a human's or this project's) auto-flushes within ~2s regardless
  of any Save button. Given this, the standing, user-confirmed scope is: implement every
  button-backed action **except** the "System / network" and "New system" property-group actions
  (`AssignDuctSystem`/`CreateDuctSystem`/`RenameDuctSystem`) — those three are deliberately never
  given table entries. Do not add them without re-confirming scope with the user first.

## Live-testing gotchas (opencli / real-page testing)

- **A same-URL "navigation" does not reliably clear `window.__RW`.** `opencli browser <session>
  open <url>` on the URL the page is already at is a JS-context no-op, not a real reload —
  `rw_cmdline.js`'s own `if (RW.vcmd) return;` re-entry guard then makes re-injecting the rebuilt
  loader silently do nothing, which has repeatedly been mistaken for "my fix didn't work." Force a
  genuine `location.reload()` (or navigate away and back) before re-testing a change on an
  already-injected page.
- **`opencli eval` has an argument-length limit well under the shell's real `ARG_MAX`** (roughly
  60–140KB observed) — pasting the full rebuilt loader directly can fail with "Argument list too
  long." Workaround: base64-chunk the loader into `window.__loaderB64` across several `eval` calls,
  then decode (`atob` + `TextDecoder('utf-8')` — this file's own em dashes are multi-byte UTF-8)
  and `eval` the reassembled source in one final call.
- **`#graph-save-status` reading "Capture issue"** has been observed twice, under different
  circumstances, and is most likely environmental (a live DOM sweep found real, named
  `.graph-capture-permission-modal`/`.graph-capture-issue-panel` components — a screen/tab-capture
  status, not something this project's dispatches cause), but treat that as the leading theory,
  not a fully closed case.
- **Native tool dispatch has, on at least two separate occasions, stopped visibly taking effect
  after a genuine page reload within the same test session** (`currentTool`/`activeTool` stays
  unchanged even for a real trusted click on the toolbar button, bypassing this project's own code
  entirely) — root cause never isolated across either occurrence. Not attributable to this
  project's own code (a plain `.click()` on an unrelated action worked in the very same session
  both times) — flagged as an open environmental risk worth a plain human live-test, not just
  automation, before trusting a "it doesn't work" report from an automated session too literally.

## Design doctrines established (apply these when extending)

- **Track our own state; don't re-read the app live at decision time.** `RW._cmdToolArmed`,
  `RW._cmdLastTool`, `RW._cmdModeActive` are all self-maintained rather than derived from a fresh
  `annotationState`/`__graphDebug` read when a decision (e.g. Space's branch) needs to be made —
  this sidesteps live-timing races this project has been burned by more than once (there's no
  confirmed guarantee the host app's own state updates synchronously relative to a dispatched
  keydown).
- **Fail closed/open toward caution whenever live state can't be confirmed.** The auto-select
  poll's circuit breaker, the isolation predicate returning `null` on an unreadable tool, and the
  digit-passthrough/modal-memory escape hatches all default to doing nothing rather than guessing.
- **Enforce a hard boundary in code, not just by omitting it from the dropdown.**
  `FORBIDDEN_BUTTON_IDS` and the isolation allowlist are both checked a second time inside
  `RW.runCommand` itself, so a direct console call can't bypass what the UI merely doesn't offer.
- **Prefer live DOM discovery over a hardcoded per-tool/per-param table.** Two separate hardcoded
  guesses (the digit-to-tag-index mapping, round 9; an assumed toolbar key/id shape) were each
  proven wrong on a real job or a second real trade pack — settings discovery (id-prefix sweep)
  and the graph tool table (derived from the live toolbar's own key badges) both exist specifically
  to avoid repeating that mistake.
- **When adding a test, prove it's non-tautological.** Revert the line(s) it's meant to guard and
  confirm the new test fails exactly as expected, then restore — used throughout this project's
  history and has caught real accidental no-ops more than once.
- **A live report phrased as "X happens instead of Y" is genuinely ambiguous** between "X is the
  bug, Y is wanted" and "X is wanted, Y is the bug." When a fix built against one reading turns out
  to be backwards, get a live before/after diagnostic trace rather than re-guessing from the same
  ambiguous phrasing a second time.
- **`AskUserQuestion` vs. plain-chat clarification is situational, not a fixed preference** — take
  each signal (an explicit rejection of the tool, or an explicit "use question") as what's wanted
  in that moment, not evidence of a standing mode to lock onto.

## Open questions (not yet resolved — check here before assuming)

- Whether the defensive `d` prefix on annotate-host draw-mode commands is actually necessary.
- The real `annotationState.currentTool` strings for every annotate-host native tool beyond
  `'bounding_box'`/`'ribbon'`/`'linear'`.
- Whether a plain `annotationState.currentTag =` assignment is reliably picked up by the app's own
  UI/rendering (tag search's only selection mechanism).
- Whether the `.value`+`input`/`change` write-back technique is sufficient for every settings
  control beyond the few in `CONFIRMED_WRITE_IDS` — every other control still carries the hedge.
- The real, id-keyed shape of `annotationState.tagShortcuts` is confirmed live but not wired into
  anything — reference shape only, for a future per-tag-shortcut dispatch by real id.
- Whether native tool dispatch reliably works post-reload on every job (see "Live-testing
  gotchas" above) — reproduced twice, root cause never isolated.
- Whether the annotate host's viewport actually scrolls (vs. panning via CSS transform) — run
  `RW._panDiagnose()` on a real page before trusting middle-drag pan there.
- Whether `annotationState.mode` ever actually reads `'select'` (only `'draw'` has been observed
  live), and whether `currentTool` genuinely self-clears to `null` or is sticky until the app
  changes it.
- Whether grab-and-drag pan's direction feels correct, or needs `RW._panInvert` flipped.
- Whether the annotate host's canvas mousedown handler is button-blind (a middle-press with a
  draw tool armed could place a stray vertex) — `RW._panStopHostEvents` guards against this but
  has never been deliberately disabled on a real job to confirm it's needed.
- The real mechanism behind the annotate host's own zoom (CSS transform / canvas backing
  resolution / PDF-library API / an `annotationState` field) is unknown; `RW._zoomDiagnose()`
  exists to answer this via a before/after diff but nothing consumes its answer yet.
- The end-user action that opens the change-size/GRD-placement graph modals was never found live
  (branch and riser are both confirmed reachable) — doesn't affect the mechanism (identical code
  path for all four), only how to trigger these two for a future live check.
- None of the 8 modal-action button ids or the "New system" name/service fields are individually
  confirmed via `CONFIRMED_WRITE_IDS` yet.
- Whether change size/GRD/riser's own real fields are select/checkbox-shaped the way branch
  fitting's confirmed ones are — unknown; if any turn out all-numeric, modal memory simply has
  nothing to do there, which isn't a bug.
- Whether a real **piping**-trade-pack toolbar actually renders the same `.graph-tool-key` badge
  markup the duct pack's does — `PIPE_TOOL_KEYS` was read from source, never seen rendered live.
  If it renders differently, `cmdDeriveGraphTools` would silently fall back to the (wrong-keyed,
  by design, for piping) built-in table — confirm live and adjust `cmdToolKeyBadge` if it differs,
  rather than guessing again.
- Whether the graph host's toolbar can ever re-render mid-session without a page reload (whether
  `RW._cmdRebuildGraphTable()` is ever actually needed in practice, or a harmless unused safety
  valve) is unknown.
- `graph-toggle-annotations` being genuinely submit-free was read from the bundle's own
  client-side state handler, not independently confirmed by watching the revision counter across a
  live click.
- A still-unreproduced, unfixed bug (deferred at the user's own request, not yet root-caused):
  tool *property* rows have been seen blending into the dropdown while `__graphDebug.activeTool`
  genuinely reads `'select'` — the code path that's supposed to gate this
  (`RW._cmdActiveSettingsTool()` returning `null` for `'select'`) looks correct on inspection, so
  the actual leak point hasn't been found. Next step for whoever picks this up: reproduce live,
  then read `RW._cmdActiveSettingsTool()`'s actual return value and `RW._toolSettingsMap[tool]` at
  the exact moment the unwanted rows show, rather than re-guessing from the code alone.
