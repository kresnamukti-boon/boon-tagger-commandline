# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An AutoCAD-style command line for the Constructions Tagger annotation platform
(`constructions-tagger-web.onrender.com`): type a native app tool's name (or its alias) from
anywhere on the page and it dispatches that tool, no click required. This repo is a genuinely
isolated extraction — it contains **only** the command-line activator and its own bootstrap, not
the full region/mask annotation workbench those tools were originally built alongside. That
workbench (regions, mask tools, pipe/elbow annotation, OCR-assisted reference naming, and its own
version of this same command line with workbench-tool entries) lives in a sibling repo,
`boon-tagger-mask` (also under `~/Projects/boon-projects/`).

Like the mask repo, this is **not a normal web app** — no server, no framework, no package.json.
It's plain-JS modules concatenated into a single script and pasted into the browser DevTools
console to run inside the live annotation page. Nothing here runs standalone; every module
assumes it's executing inside the Constructions Tagger page and reaches into that page's globals
(`annotationState`, DOM ids like `pdf-canvas`/`annotation-canvas`/`right-rail-content`).

Nothing auto-draws or auto-submits annotations — this tool only ever dispatches a synthetic
keydown to make the host app switch its own current tool/mode, exactly as if the annotator had
pressed that key themselves. The activity tracker (`/analytics/api/events/`) is read-only
observed, never spoofed. Preserve this boundary in any change.

## Build / verify commands

There is no package manager, linter, or test suite. The only "build" step is concatenation, and
the only verification is `node --check` (syntax-only — it can't validate against the live page's
DOM/globals).

```bash
bash build_loader.sh     # rebuilds console_loader.js (runs node --check on the result)
node verify_cmdline.js   # synthetic Node harness — DOM stub, drives real registered listeners
```

To actually verify a change works, it has to be pasted into a real annotation-job page in Chrome
(see README.md's "Injection" steps); there's no headless harness for `annotationState`.

## Architecture

### Load order

Three modules, concatenated by `build_loader.sh` in this order:

1. **`rw_panelux.js`** — loads first, before `__RW` exists. Collapsible panel UI and the
   **RW: ON/OFF** master killswitch; wraps `window.addEventListener` (keydown, capture) so every
   handler registered by later modules is auto-gated on `RW.enabled`. Has a re-entrancy guard
   (`if (document.getElementById('rw-collapse')) return;`) so re-pasting the loader into an
   already-loaded page doesn't duplicate the header/killswitch button.
2. **`rw_core.js`** — creates `window.__RW` (gated on `RW.vcore`), a bare `#rw-panel`/`#rw-list`
   mounted into `#right-rail-content`, and `RW._commitStatus`. No region/mask/annotation engine
   at all — this is the minimal scaffolding `rw_cmdline.js` needs to mount into, nothing more.
3. **`rw_cmdline.js`** — the command bar, autocomplete, tag search, and native-tool dispatch
   itself (see below). Gates on `RW.vcore`.

### Core mechanism

"Running a command" dispatches a synthetic `keydown` to the host app itself
(`RW._cmdDispatchAppKey`), via the same idiom the mask repo's own tools originally used to
relinquish the app's own tool:
`document.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}))`.
A draw-mode tool command dispatches `d` (enter draw mode) immediately before its own letter,
defensively, since the app's own keymap documents these tools as draw-mode-only — not confirmed
live whether that prefix is actually required. Mode-switch commands (pan/select/draw/label/
crop/mirror) dispatch only their own letter.

`RW._cmdTable` is a hardcoded list of every reachable native tool: `{name, kind:'native',
aliases, run}`. `armed`/`disarm` support still exists in `RW.runCommand` (a table entry can
supply `armed()`/`disarm()` instead of a plain `run`), kept for a future native `armed()`
predicate once real `annotationState.currentTool` strings are confirmed live — no current table
entry uses it.

### Command bar + autocomplete

A plain div inserted at the top of `#rw-list` (there's no `#rw-sections`/panel-reorg module on
this branch, so `mountCommandBar` always uses its `#rw-list` fallback). The autocomplete dropdown
mounts on `document.body` with `position:fixed` (not inside `#rw-panel`, which is
`overflow:auto`/height-capped and would clip it), repositioned from the input's
`getBoundingClientRect()` on every keystroke. Ranking (`RW._cmdMatch`): exact name → exact alias
→ name-prefix → alias-prefix → substring.

### Global auto-capture

Typing a command's name works from anywhere, no click or focus step needed, AutoCAD-style — one
`document`-level, capture-phase `keydown` listener seeds and focuses the command input on the
first printable keystroke (skipped whenever a real input/textarea/contenteditable is already
focused), then hands off to the input's own normal keydown handling. Gated on `RW.enabled` so the
master killswitch actually stops it (a gap found and fixed after shipping — see round 6 below).

**A critical guard**: `RW._cmdDispatchAppKey`'s own synthetic dispatches mark themselves
(`evt.__rwSynthetic = true`) before dispatching, and the auto-capture listener checks for that
marker first and returns immediately with no `preventDefault`/`stopImmediatePropagation` — without
this, the auto-capture listener would eat its own synthetic native-tool dispatches before the
host app's real listener ever saw them (see round 3 below for how this was found).

### Tag search

Typing `#` as the input's first character switches the same dropdown/keyboard-navigation to
searching `RW._cmdTagList` (auto-detected from `annotationState` at load — see round 4 below) by
name instead of matching `RW._cmdTable`. Selection directly assigns
`annotationState.currentTag` to the exact matched tag object (`RW._cmdSelectTagUnsafe`) — the
*only* mechanism, after an earlier digit-hotkey-dispatch path was proven wrong on a real job (see
round 9 below) and removed entirely, not patched. Still not fully live-confirmed whether a plain
property assignment on `currentTag` is picked up correctly by the app's own UI/rendering.

## Command-line tool activator, round 2: global auto-capture, toggle on/off, native app tools

Three extensions, confirmed via two rounds of `AskUserQuestion` since the requests interact in
ways not obvious up front (see below).

**Toggle on/off** — re-running an already-armed tool's command now disarms it, mirroring how the
original single-key shortcuts worked as toggles (e.g. the old `P` key was
`RW.setPick(!RW.pickMode)`). Checked every table entry's actual button `onclick` directly before
changing anything: **all but two already toggle on click** — removing `RW.runCommand`'s old
"skip the click if already armed" guard gets correct toggle-off behavior for those for free.
The two exceptions get an explicit `disarm` field on their table entry (used instead of
`btn.click()` when already armed):
- **`cut`** — `rw-cut`'s onclick is `RW.setCut(true)`, not a toggle. `disarm: () =>
  RW.setCut(false)`.
- **`walls`** — `rw-walls`'s onclick is a **3-state cycle** (0→1→2→0), so a second click lands on
  state 2, not off. `disarm` mirrors `toggleWallOverlay`'s own cleanup directly (remove
  `#rw-wall-overlay`, force `RW.wallOverlayState = 0`) rather than clicking through the cycle.

`RW.runCommand`: if already armed, call `entry.disarm ? entry.disarm() : btn.click()` and close
the popup immediately (no need to wait for the poll — the disarm was deliberate). `relabel`
(no `armed`) and `cycle` (`run`-only) are unaffected, having no on/off state to toggle.

**Global auto-capture** — typing a command's name works from anywhere now, no click or focus
step needed, like AutoCAD's always-listening command line. Confirmed via `AskUserQuestion`:
**capture always wins** — every keystroke, while nothing else is focused, goes into the command
line; the way back to the host app's own native single-key shortcuts working directly is to blur
the command input first (Escape, or click the canvas). Mechanism: one new `document`-level,
capture-phase `keydown` listener (in `rw_cmdline.js`, which already loads last), guarded
identically to every other handler in this codebase — which is what makes it safe: it already
skips whenever the command input itself, or any other real input anywhere in the app, is
focused, so normal typing elsewhere is unaffected. **Only the first character needs special
handling** — it's `preventDefault`ed and consumed (`stopImmediatePropagation`, so the app's own
same-letter shortcut doesn't also fire — the "capture always wins" decision), the command bar is
ensured to exist, and that one character seeds the now-focused real `<input>`; every character
after that is handled by the existing `onInputKeydown`/`oninput` wiring, completely unchanged —
no parallel input-handling system was built. **Confirmed safe by re-checking every remaining
keydown handler in the codebase directly**: none of them call `stopImmediatePropagation()` for a
plain printable letter/digit anymore (every survivor after the previous round's keybinding
removal only reacts to Escape/Backspace/Tab), so a listener registered last reliably sees every
printable keystroke that isn't already inside a real input.

**Native app tools** — the host app's own draw-mode tools (linear, bounding box, count, polygon,
polyline, circle, revision cloud, magic wand, wrap, void, digit tag-select) and its top-level
mode switches (pan, select, draw, label, crop, mirror) are now reachable from the same command
line. Mechanism: `RW._cmdDispatchAppKey(key)` reuses, verbatim, the exact synthetic-keydown idiom
three modules already use to make the app relinquish its own tool —
`document.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}))`
(`rw_install.js:299`, `rw_wallspan.js:1149`, `rw_elbow.js:704` all dispatch this for `Escape`;
this generalizes it to an arbitrary key). Every draw-mode tool command dispatches `d` (draw mode)
**immediately before** its own letter — defensive, since README's own app-keymap documents these
letters under "Tools (draw mode)", implying they may only mean something once already in draw
mode; over-dispatching a harmless extra `d` costs nothing if the letters already work from any
mode. **Not live-verified**: whether that `d` prefix is actually necessary. Mode-switch commands
(pan/select/draw/label/crop/mirror) dispatch only their own letter. All native-tool entries are
plain one-shot `run` commands — no `armed`/popup tracking, since switching the app's own tool
isn't an on/off concept the way arming a workbench tool is, and (see below) there's no confirmed
way yet to introspect which native tool is currently active.

**A real alias collision, found and resolved, not guessed at.** Checked every native tool's own
app-keymap letter against the existing workbench alias table directly: four collide — `k`
(workbench `cut` vs. native magic wand), `a` (workbench `addmode` vs. native pan), `s` (workbench
`snap` vs. native select), `r` (workbench `rect` vs. native polygon). Global auto-capture means
the app never sees a bare keystroke to disambiguate on its own anymore, so these collisions have
to be resolved inside `RW._cmdTable` itself. Resolution: the already-shipped workbench command
keeps the bare letter (it shipped first); the colliding native tool gets **no single-letter
alias**, reachable only by typing more of its full name (`wand`, `pan`, `select`, `polygon`) —
autocomplete handles the rest. `polygon` also deliberately skips `poly` as an alias, since that's
already `poly2`'s. Every other native letter (`Q`/`W`/`E`/`T`/`Y`/`U`/`X`/`V`/`D`/`F`/`G`/`M`,
digits) is collision-free and keeps its native letter.

**Why `armed()` tracking for native tools isn't attempted yet**: `rw_ocr.js` already reads
`annotationState.currentTool` (confirmed, e.g. `=== 'bounding_box'`) to detect the app's current
tool, so a real `armed()` predicate is *possible* in principle for native tools too — but this
repo has no confirmed tool-name string for anything beyond `'bounding_box'`, and guessing the
rest risks silently-wrong highlighting. Revisit once the real `currentTool` strings for each
native tool are confirmed live.

Verification: `verify_cmdline.js` grew from 27 to 51 tests — toggle-off for an already-toggling
button (and that it closes the popup immediately, not waiting for the poll); both `disarm`
overrides (`cut` never double-clicks its own non-toggling button; `walls` jumps straight to state
0, not state 2); `RW._cmdDispatchAppKey` dispatching the identical event shape as the existing
Escape idiom; a draw-mode tool dispatching `d` then its own letter, a mode switch dispatching
only its own letter; the full alias-collision matrix (`k`/`a`/`s`/`r` still resolve to the
workbench command, `wand`/`pan`/`select`/`polygon` still reachable by full name, `polygon` never
steals `poly`); global auto-capture seeding and focusing the command input from a real dispatched
keydown on a non-input target, and leaving a keydown aimed at a genuine, unrelated `<input>`
alone. Needed a `KeyboardEvent` polyfill in the test harness itself (Node has no such global) —
the same gap silently existed already for `RW.setPipeMode`/`RW.setElbowMode`'s own Escape
dispatch, just never previously exercised by any test that calls those functions for real.
`verify_pipe.js` (196) and `verify_ocr.js` (79) both re-run unchanged. `node --check` passes;
both loaders rebuilt clean.

**Not live-verified this round** (synthetic-only) — in particular whether native draw-mode tool
letters actually need the defensive `d` prefix or already work from any mode, whether typing from
anywhere ever produces a surprising side-effect on a real page, and the real
`annotationState.currentTool` strings needed for a future `armed()` pass on native tools.

## Command-line tool activator, round 3: fix native-tool dispatch, color-code the dropdown

Live use confirmed workbench commands (pipe, elbow, pick, ...) worked through the command line,
but native app tool commands (round 2) did not — plus a request to visually distinguish workbench
vs. native entries in the autocomplete dropdown by color.

**Root cause, confirmed by direct re-reading of the shipped code, not guessed at**: round 2's own
global auto-capture listener was eating its own synthetic dispatches. `RW._cmdDispatchAppKey`
dispatches `document.dispatchEvent(new KeyboardEvent('keydown',{key,...}))` — that event's
`target` is `document` itself (no `tagName`), so the auto-capture listener's input-focus guard
doesn't skip it; the listener then sees a single printable character (true for every native
draw-tool letter/digit, e.g. `q`, `d`, `1`) and calls `stopImmediatePropagation()` on it while
appending it to the command buffer — meaning **no other listener on `document` ever saw the
event**, including whatever the host app's own tool-switching listener is. Workbench commands
were never affected (they arm via `btn.click()`, never touching `document.dispatchEvent`) — this
was specific to round 2's own new native-tool feature, self-inflicted by the auto-capture
listener also added that same round.

**Fixed** by marking `RW._cmdDispatchAppKey`'s own dispatches (`evt.__rwSynthetic = true` before
dispatch) and having the auto-capture listener check for that marker first and return
immediately — no `preventDefault`, no `stopImmediatePropagation` — letting the event continue on
to whatever the app's real listener is, untouched. Confirmed this is a real fix, not just a
plausible-sounding one: reverted the one-line guard and re-ran the test suite — the new
regression test fails exactly as expected, restoring the guard makes it (and everything else)
pass again. The existing synthetic-Escape dispatches elsewhere (`rw_install.js`,
`rw_wallspan.js`, `rw_elbow.js`) were never at risk from this bug in the first place
(`'Escape'.length !== 1`, already excluded by the auto-capture guard on its own) and don't need
the same marker.

**Honest caveat, stated rather than assumed away**: this fixes the *confirmed* self-inflicted
interception. It's possible the host app has additional requirements a synthetic `KeyboardEvent`
still can't satisfy (checking `e.isTrusted`, reading `e.code` instead of `e.key`, or listening on
a different target than `document`) — those would only surface on a real page. If native tools
still don't work after this fix, that's the next thing to check, not evidence this fix was wrong.

**Color-coding**: every table entry now carries an explicit `kind: 'workbench'|'native'` field
(not inferred from `run`/`btn`, since `cycle` is `run`-only but is a workbench command — an
inference would have misclassified it). The autocomplete dropdown colors each row's *text*
(never its background, which the keyboard-highlight already uses) — light blue `#7ec8e3` for
workbench, light green `#a8e6a3` for native — chosen to stay legible against the existing orange
highlight background regardless of which row is currently selected.

Verification: `verify_cmdline.js` grew from 51 to 59 tests — the fix confirmed via a real
(unstubbed) call to `RW._cmdDispatchAppKey` against the actually-registered listeners (needed
upgrading the test harness's `document.dispatchEvent`/`KeyboardEvent` stubs from no-ops to
actually invoke registered listeners and honor `stopImmediatePropagation`, so this is a genuine
end-to-end check of the fix, not just calling the marker-setting code in isolation); a genuine
non-synthetic keystroke is still auto-captured (regression guard against the fix disabling
auto-capture entirely); every table entry has a valid `kind`, including the `cycle` misclassification
trap named above; the dropdown's rendered rows carry the correct color for a mixed match set
(querying `poly` returns both `poly2` and `polyline`/`polygon`). `verify_pipe.js` (196) and
`verify_ocr.js` (79) re-run unchanged. `node --check` passes; both loaders rebuilt clean.

**Not live-verified this round** (synthetic-only) — whether native tools actually work end-to-end
on a real page is exactly what this fix needs a live check to confirm; if they still don't, see
the honest caveat above for what to check next.

## Command-line tool activator, round 4: auto-detect and search the app's tags

Follow-up to "next key input should select the tag": the user wants full tag **search**, not
just the app's own 1-9/0 digit hotkeys (which only reach the first ~10 tags), and asked that the
injection script **auto-detect** the available tags at runtime rather than requiring a manual
lookup. This codebase had never referenced anything beyond `annotationState.currentTag` (the
*currently selected* tag, `{id, name}`, read-only — used by `rw_commit.js`/`rw_wallspan.js`/
`rw_elbow.js` when staging annotations) — nothing had ever needed the *full* list before. No
Explore/Plan agent dispatch this round: the missing piece is a live-runtime data shape no static
code search or design review can resolve, only a live page can.

**Detection, validated against `currentTag`, not just shape-matched**: `RW._cmdDetectTags()`
checks a short ordered list of plausible field names off `annotationState` (`.tags`,
`.availableTags`, `.tagList`, `.allTags`, `.projectTags`, `.tagOptions`) for the first one that's
an array of `{id, name}`-shaped objects. Critically, if `annotationState.currentTag` is set, the
candidate must actually *contain* an entry matching its `id` — real evidence the candidate is the
genuine tag list, not an unrelated same-shaped array. Stores the result as `RW._cmdTagList`/
`RW._cmdTagSource`, and always reports the outcome via `RW._commitStatus` — a wrong guess is
visible immediately (`'could not auto-detect the tag list...'`) rather than a silent no-op
discovered later.

**`#`-prefixed search reuses the existing autocomplete UI wholesale.** Typing `#` as the input's
first character switches the same dropdown/keyboard-navigation (arrows, Enter, Tab, Escape) from
matching `RW._cmdTable` to matching `RW._cmdTagList` by name — a new `menuMode` (`'command'` or
`'tag'`) tracked alongside the existing `menuItems`/`menuHighlight`, checked fresh on every
keystroke via `onInput`. Selecting a tag calls `RW._cmdSelectTag` instead of `RW.runCommand`.
Since `#` is a single printable character, the existing global auto-capture (round 2) already
seeds it correctly with no changes needed there.

**Selection: a safe path for the first 10, an explicitly-flagged best-effort beyond that.** Tags
at list-index 0-9 are assumed to map to the app's own 1/2/.../9/0 hotkeys in list order —
*unconfirmed*, but if right, dispatching the matching digit via the already-proven
`RW._cmdDispatchAppKey` idiom (round 2/3) goes through the app's real tag-selection code, exactly
as safe as the native-tool dispatch already shipped. **Tags beyond index 9** — the actual point of
this request, reaching tags with no hotkey — have no known safe mechanism without live
inspection. Best-effort fallback, isolated into its own function specifically so it's easy to
find and replace (`RW._cmdSelectTagUnsafe`, never called for index <10): directly assigns
`annotationState.currentTag = tag`. **This is the one genuinely unverified part of this round** —
if the app uses a reactive framework needing its own setter/dispatch to notice the change, a raw
assignment could silently desync the app's displayed tag from what's actually used on commit. The
status line always states which path fired (`'tag: X (via digit 3)'` vs. `'tag: X (direct
assignment — unverified, confirm it actually applied)'`) so a live test shows immediately which
mechanism was used, not just that something happened.

Verification: `verify_cmdline.js` grew from 59 to 71 tests — detection picking the right field
among decoys via the `currentTag`-membership check (not just the first array-shaped candidate);
detection correctly reporting `null` and a status message when nothing validates; `#` switching
the dropdown to tag matches with the plain (non-`#`) query path unaffected; index <10 selection
dispatching the exact expected digit and never touching `annotationState.currentTag` directly;
index ≥10 selection going through the unsafe path only, with its status explicitly saying
"unverified." Needed `loadModule` in the test harness to accept an injectable `annotationState`
(previously always `undefined`, matching every prior round's tests which never needed it).
`verify_pipe.js` (196) and `verify_ocr.js` (79) re-run unchanged. `node --check` passes; both
loaders rebuilt clean.

**Not live-verified this round — more than any prior round.** Whether detection finds the real
field at all, whether the digit-to-position mapping for tags 1-10 is actually correct, and
whether the beyond-10 direct assignment actually takes effect in the app's own UI and on a real
committed annotation, all need a live page to confirm. If detection fails on a real job, the
useful next step is checking what `Object.keys(annotationState)` actually contains and adding the
real field name to the candidate list, rather than guessing again.

## Command-line tool activator, round 5: Space as an alternative to Enter

AutoCAD's own classic convention: Space runs a command, same as Enter. Added to
`onInputKeydown`'s Enter branch (`e.key === 'Enter' || (e.key === ' ' && menuMode === 'command')`)
— deliberately scoped to `'command'` mode only, not `'tag'` mode, since a command name is always
one unbroken word but a tag name (round 4) can legitimately contain a space (e.g. "Conference
Room"); treating Space as a confirm key there would make multi-word tag search impossible to
type. In tag mode Space is left completely alone (no `preventDefault`), so it behaves as an
ordinary character.

Verification: `verify_cmdline.js` grew from 71 to 75 tests — Space running the highlighted
command match exactly like Enter, and Space in tag-search mode being left un-consumed (asserted
via `preventDefault` never being called) with no tag-selection side effect. `verify_pipe.js`
(196) and `verify_ocr.js` (79) re-run unchanged. `node --check` passes; both loaders rebuilt
clean.

## Command-line tool activator, round 6: the master killswitch didn't actually stop it

The user asked how to turn the command line off — surfacing a real, previously-unnoticed gap:
`rw_panelux.js`'s master **RW: ON/OFF** killswitch wraps `window.addEventListener` (for
`keydown`+capture) and `annotation-canvas`'s own `addEventListener` so every other tool's
listeners auto-check `RW.enabled` — but round 2's global auto-capture listener was registered via
`document.addEventListener`, which that wrapping never touches. So flipping RW off did **not**
stop the command line from capturing every keystroke — the one feature whose whole documented
purpose is "gates every handler the later modules register" didn't actually gate this one.

**Fixed** with a one-line `if (!RW.enabled) return;` at the top of the auto-capture listener,
confirmed via `AskUserQuestion` as the right shape (tie it to the existing switch, not add a
second independent toggle). Scoped deliberately narrow: only the global "type from anywhere"
capture is gated — running a command by typing directly into the already-visible input, or
clicking a panel button, is a deliberate action and stays consistent with how every other tool's
own panel button remains clickable while RW is off.

Verification: `verify_cmdline.js` grew from 75 to 77 tests — `RW.enabled=false` stopping
auto-capture entirely, and capture resuming once re-enabled. Confirmed the regression test is
real by reverting the one-line fix and re-running — it fails exactly as expected, passes again
once restored. `verify_pipe.js` (196) and `verify_ocr.js` (79) re-run unchanged. `node --check`
passes; both loaders rebuilt clean.

## A dedicated branch: `feature/native-tools-only` — HISTORICAL, now this repo

This section is preserved verbatim from when this content lived inside `boon-tagger-tools`'s own
`CLAUDE.md`, describing a branch of that repo. That branch has since been extracted into this
standalone repo (see "This repo's current state vs. the history above" further down) — read
"the branch" below as "this repo."

A separate git branch (`feature/native-tools-only`) carries a build that has **diverged much
further from `master` than its name originally implied.** It started (forked from
`feature/command-line-tool-activator` after round 6) as just a trimmed `RW._cmdTable` — every
other workbench module still shipped there. It was later rebuilt from scratch into a genuinely
isolated development sandbox: **every workbench module is deleted**, replaced by a ~26KB loader
containing only `rw_panelux.js` + a new `rw_core.js` + `rw_cmdline.js`, so the command line's
native-app-tool dispatch and tag search can be iterated on without a ~240KB paste dragging in
unrelated tooling. **This file (CLAUDE.md) is gitignored, so its content is the same regardless
of which branch is checked out** — everything above this section describes the full workbench as
shipped on `master`; this section is the only place documenting how the native-only branch
actually differs.

**Why the rebuild.** The original trim kept every workbench module loaded just to arrive at a
`RW._cmdTable` with no workbench entries — the branch's entire premise (focus command-line
development, cut everything irrelevant) but done at the *table* level while the *build* stayed
full-sized. It had also quietly diverged from `master`: forked before rounds 8-9, it still
carried the digit-hotkey tag-selection mapping that a later live job proved **wrong** (see
"Command-line tool activator, round 9" above) and pre-round-8 Space semantics. Rebuilding started
by pulling `master`'s `rw_cmdline.js` forward (bringing rounds 8-9 across) and re-applying the
native-only trim on top, rather than patching the stale copy.

**What exists on this branch now:**

- **`rw_core.js`** (new) — a minimal bootstrap replacing everything `rw_install.js` used to
  provide for the command line's benefit: `window.__RW` (gated on its own `RW.vcore` flag,
  which `rw_cmdline.js` now gates on instead of `RW.v32`), a bare `#rw-panel`/`#rw-list` built
  into `#right-rail-content` (no region/mask/annotation engine — no `RW.extract`, no
  `RW.buildPanel`'s button row, nothing), and `RW._commitStatus` ported verbatim from
  `rw_commit.js`. `rw_cmdline.js`'s own `mountCommandBar` already had a `#rw-list` fallback for
  when `#rw-sections` (a `rw_panelsections.js` product) doesn't exist, so no other scaffolding
  was needed — confirmed by direct dependency tracing before any file was deleted.
- **`rw_panelux.js`**, trimmed — the collapsible-panel/killswitch UI is unchanged, but the
  workbench-teardown block inside `RW.setEnabled` (which called `RW.setPick(false)` unguarded,
  reset `maskMode`/`maskMode2`/poly-vertex state, removed `rw-polyline`/`rw-rectline`/
  `rw-brushline`/`rw-commitpreview`, and read the now-nonexistent `#rw-overlay`) is deleted — it
  would throw a `TypeError` on the very first **RW: OFF** click once `rw_install.js` is gone.
  Picked up two more real, pre-existing bugs while in this file for that reason: `retrofit()` had
  no re-entrancy guard, so re-pasting the loader into an already-loaded page duplicated the
  header/killswitch button; fixed with a one-line `if (document.getElementById('rw-collapse'))
  return;` at its top. Title text ("Region Workbench") was also updated to "Command Line"
  throughout, since this branch no longer has a region workbench to name.
- **`rw_cmdline.js`**, trimmed — every workbench table entry (`pick`/`cut`/`rect`/.../`cycle`)
  is gone; every remaining entry is `kind:'native'`, `run`-only. The four aliases that only
  existed to dodge workbench collisions are reclaimed: `wand`→`k`, `pan`→`a`, `select`→`s`,
  `polygon`→`r`. Unlike the original trim, the popup/borrow-restore system is **deleted this
  time, not left dormant** — `ensurePopupDom`/`openPopup`/`closePopup`/`tidyOldParent`/
  `makeDraggable`/`positionPopupDefault`, the 250ms disarm poll, and the `ctl` table field are
  all gone (~140 lines), since with every workbench module deleted there is no RW-panel control
  left anywhere to borrow, and the original "smaller diff against the full branch" rationale for
  keeping it stopped applying once the branch became a from-scratch rebuild rather than an
  incremental trim. `armed`/`disarm` support in `RW.runCommand` is kept (confirmed via
  `AskUserQuestion`) even though no real table entry uses it yet — it's what a future native
  `armed()` predicate needs, once real `annotationState.currentTool` strings are confirmed live.
- **A live-diagnostic readout**, the actual point of the rebuild: `RW._cmdDispatchAppKey` now
  reports, via `RW._commitStatus`, the key it dispatched plus `annotationState.currentTool`
  before and after. This directly targets two questions this branch exists to answer that had
  stayed open across many rounds for lack of a way to test them cheaply: whether the defensive
  `d` prefix native draw-tool commands send is actually necessary, and what the app's real
  `currentTool` strings are (only `'bounding_box'` was ever confirmed anywhere in this codebase,
  via `rw_ocr.js`). One readout after any native dispatch now answers both — it proves whether
  the synthetic keydown reached the app's listener at all, and harvests the real string as a
  side effect.
- **Deleted outright**: `rw_install.js` (replaced by `rw_core.js`), `rw_masktools.js`,
  `rw_stable.js`, `rw_undo.js`, `rw_commit.js`, `rw_brushpoly.js`, `rw_healinterior.js`,
  `rw_snap.js`, `rw_textdetect.js`, `rw_wallspan.js`, `rw_panelsections.js`, `rw_elbow.js`,
  `rw_ocr.js`, `verify_pipe.js`, `verify_ocr.js`, `console_loader_ocr.js`, `build_loader_ocr.sh`.
  All recoverable from `master` at any time (`git checkout master -- <file>`, or check out
  `master` itself). `build_loader.sh`'s file list shrinks to `rw_panelux.js rw_core.js
  rw_cmdline.js`; its footer (which used to dereference `__RW.regions`, and separately claimed a
  `/`-to-focus key that never existed in any shipped version of `rw_cmdline.js`) is rewritten to
  report the command/tag counts instead. `README.md` is rewritten to document only what exists on
  this branch.

`verify_cmdline.js` on this branch is a from-scratch harness, not carried over from `master`'s
78-test file: its DOM stub builds only `#rw-list` (no `#rw-sections`, no workbench buttons/
sections), its `__RW` stub gates on `RW.vcore`, and every workbench-only test (toggle-on/off via
a button click, the popup borrow/restore round trip, `cycle`, the workbench/native
alias-collision-avoidance tests, `relabel`/`walls`/`cut` `disarm`) is gone. New coverage: the
four reclaimed aliases resolve to their native tool; every table entry is `kind:'native'` and
`run`-only; `armed`/`disarm` support in `RW.runCommand` still works against a synthetic
btn-based entry even though nothing real uses it; the diagnostic readout reports the dispatched
key and `currentTool` before/after, and degrades to reporting `undefined -> undefined` rather
than throwing when `annotationState` is absent. Tag-selection and Space-confirmation tests were
brought forward from `master`'s round-8/9 versions (direct assignment only, no digit-dispatch
path, Space confirms both commands and tags) rather than the original trim's now-stale versions.
55 tests total, all passing; `verify_pipe.js` and `verify_ocr.js` don't exist on this branch
(deleted along with the modules they tested) and are unaffected on `master`.

## Command-line tool activator, round 7: `feature/command-line-tool-activator` merged to `master`

`feature/command-line-tool-activator` (rounds 1-6 above) was merged into `master` and pushed —
the everyday `console_loader.js`/`console_loader_ocr.js` now ship the full command line
(workbench + native tools, tag search, Space-to-run, the killswitch fix) to every annotator, not
just on a feature branch. One gap was caught and closed before merging: the round-6 killswitch
fix had only ever been committed on `feature/native-tools-only` (bundled together with that
branch's own trim, in the same commit) — `feature/command-line-tool-activator` itself was still
missing it. Re-applied directly (not cherry-picked, to avoid pulling the native-tools-only trim
along with it) before merging, so `master` has both the full command line and the killswitch fix
together. `feature/native-tools-only` is unaffected — it remains its own separate branch.

**Round 8, immediately after**: live use found Space didn't work to select a tag match, only a
command match — confirmed as the deliberate round-5 scoping (`e.key===' ' && menuMode==='command'`),
not a bug, but the user asked for it to also work for tags. Changed to unconditional
(`e.key==='Enter' || e.key===' '`) after confirming via `AskUserQuestion`, with the accepted
trade-off stated directly rather than glossed over: once *any* tag matches, Space confirms the
top-ranked one immediately, so two tags sharing a first word (e.g. "Room A"/"Room B") can no
longer be disambiguated by typing a literal space into the query — arrow keys or continuing to
type without a space are the ways around it now. This makes tag mode consistent with how command
mode's own Space handling already worked (always consumed, never falls through to a literal
character), rather than introducing a new inconsistency.

Verification: `verify_cmdline.js` grew from 77 to 78 tests — Space confirming a highlighted tag
exactly like Enter, and a direct test of the accepted ambiguity trade-off (two tags sharing "Room",
Space picks the top-ranked one, not a literal space). `verify_pipe.js` (196) and `verify_ocr.js`
(79) re-run unchanged. `node --check` passes; both loaders rebuilt clean. Done directly on
`master` post-merge, not a separate feature branch, since it's a small, low-risk, already-reviewed
change to a feature that just shipped.

## Command-line tool activator, round 9: the digit-hotkey tag mapping was live-confirmed wrong, removed

Live use surfaced exactly the failure round 4 flagged as an open, unverified assumption: the
digit-to-position mapping for tag selection (assuming the app's own 1-9/0 hotkeys select tags in
the same order as the detected `RW._cmdTagList`) is **wrong**, not just unconfirmed. Concrete
report: a real job's tag search showed "CONCRETE" at detected-index 0 (labelled `(1)` in the
dropdown), but the app's real `1` hotkey actually selects a completely different tag ("OPENING").
So the digit-dispatch path — the "safe" half of tag selection, contrasted against the
explicitly-flagged-unverified direct-assignment fallback for tags beyond index 9 — was itself
silently selecting the wrong tag for real jobs, the more serious failure mode of the two (a wrong
selection with no error, vs. a right selection that merely might not render live).

**Fixed by removing the digit-dispatch path entirely**, confirmed via `AskUserQuestion` over the
alternative (supplying the real mapping so the digit path could be corrected instead of
abandoned) — no real mapping was available, and guessing again after one guess was already
disproven wasn't worth the risk of shipping a second wrong assumption. Every tag selection
(`RW._cmdSelectTag`) now goes through `RW._cmdSelectTagUnsafe` unconditionally, regardless of the
tag's position in the detected list — this directly assigns `annotationState.currentTag` to the
exact tag object matched by name, with no ordering assumption involved at all. The dropdown's
per-tag `(N)` hotkey-number hint (round 4) was also removed from `renderMenuRows`, since it named
a mapping that no longer exists and would otherwise keep implying a digit shortcut that was never
real for the tags it was shown next to.

**What's left unverified now is narrower than before**: only whether a plain property assignment
on `annotationState.currentTag` is itself picked up correctly by the app's own UI/rendering (the
concern already named in round 4) — the position-based wrongness that made even *correct-seeming*
selections risky is gone, since there's no position dependency left to be wrong about.

Verification: `verify_cmdline.js`'s existing tag-selection tests (22-23) were rewritten to assert
the digit path is never taken regardless of index, and the exact tag object is assigned directly;
tests 25/25b (Space-confirms-a-tag, and the "Room A"/"Room B" trade-off) were updated the same
way, since they previously asserted on the now-removed digit dispatch as a side effect of
confirming a tag via Space. 78 tests total (net zero change in count — this was a correctness
fix to existing tests' assumptions, not new coverage). `verify_pipe.js` (196) and `verify_ocr.js`
(79) re-run unchanged. `node --check` passes; both loaders rebuilt clean. Done directly on
`master`, matching round 8's reasoning (small, targeted fix to a feature that just shipped).

**Live-verified this round, in the sense that matters most**: this fix exists *because* of a real
job's live result, not synthetic-only reasoning — the first concrete, real-data confirmation this
project has had that a "not live-verified" assumption in this feature was actually wrong, not
just unconfirmed.

## Native-tools-only branch, round 2: a new native tool discovered live (`rw_cmdline.js`)

The user reported "there should be a new native tool" on a specific real job, without naming it.
Bound to that exact page via `opencli` and inspected the live DOM (`document.querySelectorAll`
against the app's own Drawing Tools panel, `[data-tool]` attributes) rather than guessing —
confirmed a tool not in this file's documented app keymap: **`data-tool="ribbon"`, key `P`**,
tooltip *"Ribbon - Click points along a path's centerline (double-click to finish); drag across
the run to measure a fixed width. Builds a constant-width polygon."* Notable: this is almost
exactly this project's own deleted Pipe tool design (`rw_wallspan.js`, `master`-only, see "Pipe
annotation" above) — the host app appears to have grown a native equivalent of a feature this
project built and later removed the manual-tracing predecessor of.

**Added** as `{ name:'ribbon', kind:NATIVE, aliases:['p'], run: nativeDrawTool('p') }` in
`RW._cmdTable` — confirmed `p` was unclaimed (no exact-alias collision) via `RW._cmdMatch('p')`
against the real live table before adding it.

**Live-verified the dispatch mechanism itself, with a caveat.** Before reloading the page,
`RW._cmdDispatchAppKey('d')` + `RW._cmdDispatchAppKey('p')` reliably flipped
`annotationState.currentTool` from `'bounding_box'`/`'linear'` to `'ribbon'` (and back), repeated
successfully across several probes — real, affirmative confirmation that both the new tool and
the existing `d`-prefix dispatch idiom work correctly on a real page. **After a subsequent page
reload** (to test the freshly-rebuilt loader from scratch), the identical dispatch — and even a
genuine CDP-level trusted keypress and a real trusted click directly on the toolbar's own
`[data-tool="linear"]` button — stopped changing `currentTool` at all, with `mode` staying
`'draw'` and `currentTool` staying `null` throughout. Root cause not isolated (candidates: some
page/focus state the automation bridge doesn't fully replicate post-reload; a timing dependency
beyond the loader's existing ready-gate; or something about this specific job/page). **Not a
regression in this change** — confirmed by reverting to the pre-reload session state being the
only thing that mattered: the exact same code, dispatching the exact same events, worked before
the reload and didn't after, with no code change in between. Flagged here rather than glossed
over, per this project's own standing convention. Verified no side effects from the
investigation: annotation count stayed at 301 throughout, `hasPendingAnnotationChanges()` false.

**Also surfaced, unprompted, while inspecting the live page — directly relevant to a much older
open question**: `annotationState.tagShortcuts` is a real, live, **id-keyed** object (e.g.
`{"e8033ced-...":"1", "5c5d5bfd-...":"2", ...}`), not an array in detected-list order. This is
the concrete shape behind round 9's finding that digit hotkeys don't map to `#`-search list
order — confirms the removal in round 9 was the right call (there was never a positional mapping
to recover; the real mapping is a per-tag assignment, editable per the DOM's own "Shortcut: N
(click to change)" affordance). Not wired into anything yet — noted here as the reference shape
if per-tag-shortcut dispatch is ever revisited using the real id, not a list position.

Verification: 1 new test (`verify_cmdline.js`, 56 total) — `ribbon` dispatches `d` then `p`,
matching every other draw-mode tool's test shape. `node --check` passes; loader rebuilt
(26,956 bytes).

## This repo's current state vs. the history above

Rounds 1-6 above (and the merge in round 7) describe the command line as it existed **alongside**
the full region/mask workbench in one shared repo (`boon-tagger-tools`, now `boon-tagger-mask`).
"A dedicated branch" and "Native-tools-only branch, round 2" describe the from-scratch rebuild
that stripped everything workbench-related out — that rebuild **is** this repo's current state.
Concretely, in this repo:

- `rw_cmdline.js`'s `RW._cmdTable` contains **only** `kind:'native'` entries — every workbench
  table entry (`pick`/`cut`/`rect`/`poly2`/`brush`/`heal`/`healbrush`/`pipe`/`elbow`/`walls`/
  `snap`/`text`/`addmode`/`relabel`/`cycle`) described in rounds 1-6 does not exist here. The four
  aliases that only existed to dodge a workbench-vs-native collision are reclaimed: `wand`→`k`,
  `pan`→`a`, `select`→`s`, `polygon`→`r`.
- The popup/borrow-restore system described in round 1 (`ensurePopupDom`/`openPopup`/
  `closePopup`/`tidyOldParent`/`makeDraggable`/`positionPopupDefault`, the 250ms disarm poll) is
  **deleted**, not dormant — with every workbench module gone there is no RW-panel control left
  anywhere to borrow.
- `rw_install.js`, `rw_masktools.js`, `rw_stable.js`, `rw_undo.js`, `rw_commit.js`,
  `rw_brushpoly.js`, `rw_healinterior.js`, `rw_snap.js`, `rw_textdetect.js`, `rw_wallspan.js`,
  `rw_panelsections.js`, `rw_elbow.js`, `rw_ocr.js` and their `verify_*.js` files don't exist in
  this repo at all — see `boon-tagger-mask` (the sibling repo) for all of them.

`verify_cmdline.js` in this repo is a from-scratch harness matching this reality: its DOM stub
builds only `#rw-list` (no `#rw-sections`, no workbench buttons/sections), every workbench-only
test from rounds 1-6 (toggle-on/off via a button click, the popup borrow/restore round trip,
`cycle`, workbench/native alias-collision-avoidance, `relabel`/`walls`/`cut` `disarm`) is gone,
and coverage focuses on: the four reclaimed aliases resolving to their native tool; every table
entry being `kind:'native'` and `run`-only; `armed`/`disarm` support still working against a
synthetic btn-based entry even though nothing real uses it; the diagnostic readout (see below);
tag search and Space-confirmation (both ported forward from the mask repo's post-round-9 logic,
not the stale pre-round-9 version); and the `ribbon` tool discovered live (see below). 56 tests
total, all passing.

**Superseded by round 14 below**: this repo became **dual-target** in round 14 — a fourth module,
`rw_host.js` (loads first, before `rw_panelux.js`), detects which of two hosts the loader is
running on (the annotate-job page described throughout this section, or the graph session /
"Duct Takeoff" duct editor) and every fact this section describes as singular (`RW._cmdTable`,
`readTool`/`readMode`, the canvas id, `#`-search) now branches on that detection inside
`rw_cmdline.js`. Everything above remains accurate as the **annotate-host** behavior specifically
— nothing about it changed — see round 14 for the graph-host counterpart.

### A live-diagnostic readout, the actual point of the rebuild

`RW._cmdDispatchAppKey` reports, via `RW._commitStatus`, the key it dispatched plus
`annotationState.currentTool` before and after. This exists to answer two questions that stayed
open across many rounds for lack of a cheap way to test them: whether the defensive `d` prefix
native draw-tool commands send is actually necessary, and what the app's real `currentTool`
strings are (only `'bounding_box'` was ever confirmed anywhere in this codebase's history, via
the mask repo's `rw_ocr.js`). One readout after any native dispatch answers both — it proves
whether the synthetic keydown reached the app's listener at all, and harvests the real string as
a side effect.

## Native-tools-only branch, round 3: AutoCAD-style resting state, middle-drag pan, command renames

Three requested changes, all landed together since they interact: **select is now the default
resting state** (AutoCAD always drops back to the bare selection cursor once a command finishes or
is cancelled) — enforced via three triggers funnelled through one `RW._cmdGoSelect(reason, quiet)`
so they can never double-dispatch: on load (skipped if a tool is already armed — this loader gets
re-pasted after every navigation, and yanking a working annotator into select would be
destructive), on Escape while nothing is focused (deferred via `setTimeout(...,0)` so the app's own
Escape handling runs first — the listener itself never calls `preventDefault`/`stopPropagation`,
so the app still receives every Escape untouched), and on a 250ms poll that notices
`annotationState.currentTool` clearing itself back to null on its own. **Middle-mouse hold-drag now
pans** the page 1:1 (grab-and-drag) without switching the armed tool, confirmed via
`AskUserQuestion` to mean "move the page like ordinary scrolling," not the app's own dedicated pan
tool — the user was explicit that panning must not disturb whatever draw tool is currently active.
**`bbox`→`rect` and `ribbon`→`mline`** are AutoCAD-ish renames; the old names remain aliases.

**Auto-select's hardest problem: not fighting a deliberate mode switch.** The poll is
edge-triggered (only a *confirmed* non-null→null transition, seen on two consecutive ticks, so a
transient null mid-swap can never yank the user out of the tool they just picked) and guarded
three independent ways so that running `pan`/`label`/`crop`/`mirror` is never reverted: (1) the
primary guard — `RW._cmdDispatchAppKey` now stamps `RW._cmdToolPrev = after` on every dispatch, so
a deliberate command absorbs its own transition before the poll ever sees an edge; (2) a mode gate
— if `annotationState.mode` reads as a recognized value other than `'draw'`, don't fight it; (3) a
~1s grace window after any `RW.runCommand` call. A circuit breaker (more than 5 auto-reverts in 5s
disables the feature and reports why via `_commitStatus`) bounds the worst case if `currentTool`/
`mode` behave unlike anything observed so far — the standing worry this project has been burned by
twice before (rounds 4 and 9).

**A real bug found while writing the tests, not by inspection**: the first implementation cleared
the poll's "pending edge" flag as soon as a confirming tick was *blocked* by the grace-window/
mid-typing/mode guards — silently losing the revert forever instead of retrying once the guard
condition cleared. Fixed by only clearing the pending flag on the tick that actually dispatches (or
on a fresh non-null tool arriving); a blocked confirmation now stays pending and fires on the very
next tick where the guard passes. Caught by a test that typed a command, waited for the guard to
block, then cleared the input and expected a revert on the next tick — it didn't come, until the
fix.

**Middle-drag pan is the first feature in this repo that does not dispatch a synthetic key.**
Synthetic `wheel` events are untrusted and don't cause native scrolling, and dispatching the app's
own pan key would switch tools — precisely what the user ruled out. So it writes `scrollLeft`/
`scrollTop` directly on a real scroll container, resolved fresh per drag (never cached across
drags, since a PDF viewport can re-mount on page change/zoom) via an upward walk that requires both
computed `overflow: auto|scroll|overlay` *and* actual overflow (`scrollWidth > clientWidth`) on
each axis independently, falling back to `document.scrollingElement` checked by metrics alone. A
companion `RW._panDiagnose()` walks the same chain and `console.table`s every ancestor's scroll
metrics — the single highest-value diagnostic here, since the one real unknown is whether this app
scrolls at all or pans via a CSS transform instead (in which case the feature is a harmless no-op).
Wiring is pointer events for the lifecycle (`setPointerCapture` on the pressed target so a release
outside the window is still delivered) plus a companion `mousedown` handler solely to
`preventDefault` Chrome's middle-click autoscroll puck, whose default action lives on `mousedown`
specifically — not confirmed to be cancelable via `pointerdown` alone. `RW._panStopHostEvents`
(default `true`) stops the middle press from reaching the host's own canvas listener at all, since
this project has no evidence the app checks `e.button` on its own mousedown handler, and a
button-blind draw-tool listener would otherwise place a stray vertex on a real job.

**A real harness bug found while writing the pan tests**: the test-only `mouseEvt()` factory's
`preventDefault`/`stopPropagation` closed over their own local variable rather than binding to
`this` — silently mutating a discarded clone once `documentStub._fire()`'s `Object.assign` cloned
the event object, so two tests asserted on a variable that was never actually touched. Confirmed as
a harness bug, not a module bug, by checking the return value of `_fire()` (which *is* the object
listeners actually received) instead of the pre-fire local — the assertions passed once corrected.

**Verification**: `verify_cmdline.js` grew from 58 to 141 tests — every existing test still passes
unchanged. New coverage: the renames resolving by both new and legacy alias without stealing `r`/
`m`; the poll's arm/confirm/anti-spam sequence and its three independent don't-fight-the-user
guards (including the sticky-pending fix above, each guard tested on its own); Escape's
never-touches-preventDefault contract; both double-fire orderings between Escape and the poll
(with the 600ms suppression window proven to expire, not latch permanently); select-on-load's skip
conditions; the pan container walk (nearest-wins, overflow-without-metrics rejected,
metrics-without-overflow rejected, x/y resolving independently, the scrollingElement fallback
tested on metrics alone); the full drag lifecycle (pointerup/pointercancel/lostpointercapture/
buttons-cleared/window-blur teardown, resolved-once-per-drag, fresh-per-next-drag); the killswitch
(`RW.enabled` and the subordinate `RW._panEnabled`, including mid-drag and while-disabled teardown
paths); and the load-bearing regression test that a full middle-drag never calls
`RW._cmdDispatchAppKey` and never touches `annotationState`. Needed harness additions: scroll/
pointer-capture surface on the element stub, `getComputedStyle`/`PointerEvent`/window listener
support, fake `setTimeout`/`setInterval` (so the watcher's poll and both deferrals are driven
deterministically instead of racing Node's real timers), and a `removeChild` fix so a detached
element's id is no longer findable via `getElementById` — a real DOM-accuracy gap that would have
made the pan cursor style's own "already present" guard misbehave across repeated drags in tests.
`node --check` passes; the loader rebuilt clean (50098 bytes).

**Not live-verified this round** (synthetic-only, same caveat as every prior round) — in
particular: whether this app's viewport scrolls at all or pans via a CSS transform (run
`RW._panDiagnose()` first on a real page to find out); whether `annotationState.mode` really holds
the values this design assumes, and whether it's ever `'select'`; whether `currentTool` ever
actually clears to `null` on its own, or stays sticky until the app explicitly changes it; whether
grab-and-drag's direction (`scrollLeft -= dx`) feels right or needs `RW._panInvert`; and whether a
host canvas mousedown handler is button-blind (the stray-vertex risk `RW._panStopHostEvents`
guards against) — deliberately not tested by disabling that flag on a real job this round.

## Native-tools-only branch, round 4: a read-only tool-settings diagnostic

The user asked whether wand/wrap/mline's own dedicated settings (wand's tolerance/detail sliders,
mline's width) could be detected. Checked directly before answering: **no capability existed at
all** — zero references to `tolerance`/`detail`/`slider`/`settings` anywhere in `rw_cmdline.js`/
`rw_core.js`/`rw_panelux.js`, and no `querySelectorAll`/`[data-tool]` query/`MutationObserver` in
any shipped file. The only DOM access anywhere in the project was `document.getElementById`
against a small fixed set of ids. `RW._cmdTable`'s `wand`/`wrap`/`mline` entries are structurally
identical to every other native-tool entry — a bare `nativeDrawTool(key)` dispatch, no per-tool
state read or exposed. No `annotationState` field beyond `currentTool`/`mode`/`currentTag`/
`tagShortcuts` has ever been confirmed live, let alone a tool-parameter one.

Confirmed via `AskUserQuestion` to add a **live-diagnostic probe** rather than guess at a real
detector — this session has no live-browser access, so the real DOM shape stays unknown regardless.

**`RW._toolSettingsDiagnose(filter)`**, added right after `RW._cmdTable`'s definition — the
native-tool DOM-inspection counterpart to the dispatch mechanism above it. Follows this project's
two established "probe unknown live state" conventions at once: manual/console-only/returns a
value, matching `RW._panDiagnose` (never touches `_commitStatus`, unlike every other feature in
this file); and an optional substring `filter`, matching `RW._cmdDetectTags`'s spirit of narrowing
a broad guess. Two independent sweeps, reported separately since there's no known way yet to
associate a settings control with a tool: `document.querySelectorAll('[data-tool]')` (the exact
selector round 2's live `opencli` inspection already used to discover `data-tool="ribbon"`), with
an explicitly-labeled best-effort `activeGuess` heuristic (`aria-pressed`/`aria-selected`/a
className substring) — never asserted as the app's real "currently armed" signal, since that
convention is unconfirmed; and a page-wide sweep for `input[type="range"]`/`input[type="number"]`/
`input[type="checkbox"]`/`select`, reporting live `.value` (deliberately a property read, never
`getAttribute('value')`, which would return only the stale initial HTML default) alongside
`min`/`max`/`step`/`name`/`title`/`placeholder`, plus `aria-label` via `getAttribute` (no reliably
reflected IDL property for it). Purely read-only — no `annotationState` write, no DOM mutation,
matching this project's hard boundary.

**Verification**: `verify_cmdline.js` grew from 142 to 165 tests. Harness needed three additions it
never had before: `getAttribute`/`setAttribute`/`hasAttribute` on the element stub (backed by a
plain `_attrs` object, deliberately kept separate from `.value` — the comment on this addition
states explicitly why `getAttribute('value')` must never substitute for the live property);
a plain `className` string property; and `documentStub.querySelectorAll`, a small hand-rolled
matcher (not a full CSS engine) covering exactly the three selector shapes the new function issues
— bare attribute-presence, tag+single-attribute-equals, and bare tag name — walking recursively
from `doc.body` (fixtures must now be explicitly attached there to be found, a new discipline this
suite hadn't needed before, since every prior test drove behavior purely through registered event
listeners rather than DOM search). Spot-checked per this repo's own convention (rounds 3/6): reverted
the `.value`-not-`getAttribute('value')` guard and confirmed its two dependent tests fail exactly
as expected, then restored. `node --check` passes; loader rebuilt (53327 bytes).

**Not live-verified** (synthetic-only, as always) — the entire DOM shape this probe reports on is
unknown until run on a real page. See README's "Tool settings (exploratory)" section for the
intended usage: arm each of wand/wrap/mline in turn, run `RW._toolSettingsDiagnose()` after each,
and compare the outputs. Whatever that reveals is the prerequisite for any future real detector or
adjuster — not attempted this round.

## Native-tools-only branch, round 5: real settings interaction — drill in, type, apply, re-arm

Follow-up to round 4's read-only probe. The user's request: `[tool] -> [settings parameters] ->
[input variable] -> [parameters applied] -> [using tool again]`. Given this project's own history
(rounds 4 and 9 both shipped a guessed DOM/state interaction that turned out wrong on a live job),
confirmed via `AskUserQuestion` to gather real data first rather than build against a guess.

**Live data gathering, done through the user, not this session** (no live-browser access exists
here). The user ran `__RW._toolSettingsDiagnose('wand')` on a real job with wand armed, then a
manual write-back test in the console: `document.getElementById('magic-wand-tolerance').value =
120` followed by dispatching a synthetic `input` event **took effect immediately and persisted**
across further use of the tool — confirmed live, no native-setter/React-controlled-input
workaround needed, unlike the still-unconfirmed `annotationState.currentTag` write. A second,
unfiltered `__RW._toolSettingsDiagnose()` run surfaced the complete `[data-tool]` vocabulary (9
buttons: `linear`, `bounding_box`, `count`, `polygon`, `polyline`, `circle`, `magic_wand`,
`shrink_wrap`, `ribbon`) and the complete confirmed-live settings-control table:
`magic-wand-tolerance` (0–255), `magic-wand-detail` (0–15, step 0.5), `magic-wand-padding`
(-20–20), `shrink-wrap-padding` (0–50), `shrink-wrap-smoothing` (0–50, step 0.5),
`shrink-wrap-polygon-mode` (checkbox), `ribbon-width` (≥1, number), `ribbon-anchor` (select) —
plus `scale-*`/`ai-takeoff-*`/`render-quality-select` controls belonging to entirely unrelated
features, noted so they're never mistaken for wand/wrap/mline settings later.

**One assumption this data overturned.** The design going in assumed a tool's settings only render
while that tool is armed, so "arm it, then sweep" would naturally scope the controls found to that
tool. **Wrong** — the unfiltered sweep returned all 15 controls across every tool (wand's, wrap's,
ribbon's, and the two unrelated features') in one shot, regardless of which single tool was armed
at the time. This app appears to keep every tool's settings panel in the DOM permanently, toggled
by visibility rather than mount/unmount. The corrected design: associate a control with its tool by
**id prefix** (`magic-wand-`, `shrink-wrap-`, `ribbon-`) against a small hardcoded map, not by "what
the page currently shows."

**Also surfaced, not yet acted on**: `activeGuess` (round 4's best-effort armed-tool heuristic)
came back `false` for the wand button even while it was actually armed — this app signals "current"
with Tailwind-style `border-blue-600 bg-blue-50` classes, not the literal words
active/selected/current the heuristic checks for. Low priority; noted for whenever `activeGuess`
next gets revisited.

**Implementation, in `rw_cmdline.js`, right after `RW._toolSettingsDiagnose`**: `RW._toolSettingsMap`
(the hardcoded, now-confirmed id/range table above, scoped to numeric range/number params only this
round — `shrink-wrap-polygon-mode`'s checkbox and `ribbon-anchor`'s select are real, confirmed-live
controls too, just not wired into the UI yet, matching the user's own "input variable" framing
which is inherently numeric); `RW._cmdToolSettingsList(tool)` (live current value per param, same
"read the real property, never a stale default" discipline as the round-4 probe);
`RW._cmdApplySetting(tool, param, value)` (parses the value, clamps to the confirmed min/max,
writes `String(v)` to `.value` — an explicit stringify, since a real `<input>.value` setter
stringifies internally but the test harness's plain-object stub does not, a real gap the test
suite itself caught — dispatches both `input` and `change` on the element, then calls
`RW.runCommand(tool)` to re-arm, which also stamps `RW._cmdLastUserCmdAt` for free so round 3's
auto-select watcher doesn't fight the re-arm within its ~250ms poll).

**UX reuses the existing prefix-sniff architecture** that already makes `#` switch to tag search
(`onInput`), just with `<toolname>.` as the prefix instead of a bare `#`, resolved through the same
`findEntry` alias lookup `RW.runCommand` already uses (so `k.` — wand's alias — works identically
to `wand.`). One new piece of **sticky** state, `settingsDraft = {tool, param}`, needed because
unlike every other mode here, picking a settings-param row must NOT clear/blur the input — the
whole point is to keep it focused so the user can type the value next. `runAndClear`'s
settings-param branch pre-fills `wand.tolerance = ` and reports the confirmed range/current value
on the status line; `onInputKeydown` checks `settingsDraft` before its general Enter/Space
handling, splitting on `=` so it works whether that pre-filled prefix survived editing or the user
retyped the whole line; Escape at any point (even before a value's typed) clears `settingsDraft`
without ever touching the real control. `renderMenuRows` and Tab-to-fill both gained explicit
`'settings-param'` branches (the file's existing `else` in each was a silent command-mode
fallthrough that would otherwise render `undefined` for a settings-shaped item).

**Verification**: `verify_cmdline.js` grew from 165 to 190 tests — drilling in and filtering by
prefix; selecting a param arms the draft, keeps focus, and reports the confirmed range; applying a
value updates the real control, dispatches both events, re-arms the tool (asserted via the exact
`['d','k']` dispatch sequence), and clears/blurs afterward; values are clamped to the confirmed
max; Escape cancels without touching the control, and a later unrelated command can't resurrect a
cancelled draft; a tool with no settings map entry (`linear.`) never enters settings-param mode at
all; Tab fills `tool.param`, not `undefined`; a missing control and a non-numeric value both fail
loudly via the status line and never throw. Spot-checked per this repo's own convention (rounds
3/6): reverted the re-arm dispatch and the max-clamp individually and confirmed each one's test
fails exactly as expected, then restored. One real stub-vs-real-DOM gap the test suite itself
caught and fixed along the way: assigning a JS number to the stub's plain `.value` property does
not auto-stringify the way a real `<input>.value` setter does, so the implementation now writes
`String(v)` explicitly — harmless in a real browser, and makes the harness accurate. `node --check`
passes; loader rebuilt (60720 bytes).

**Not live-verified this round**: whether `input`+`change` alone is sufficient for wrap's and
mline's controls the same way it was for `magic-wand-tolerance` specifically (their status
messages still carry the "confirm it actually applied" hedge for exactly this reason); whether
`ribbon-width` has a real max in the app UI (none was found in the diagnostic sweep, so none is
enforced here); the checkbox and select controls remain entirely unwired.

## Round 5b: a param's own name is typable bare while its tool is active — additive, not exclusive

Immediate follow-up. The user described a flow where, once a settings-having tool is armed, "the
command line only takes tags and tool params" — ambiguous between a genuinely modal restriction
(other commands stop matching until you return to select) and simply "the tool's own params become
reachable without needing the `wand.` prefix." Confirmed via `AskUserQuestion`: the latter, and
strictly **additive** — every other command (including switching straight to a different tool)
must keep working exactly as it already does; the active tool's own params are just blended in as
an extra, faster option, never a restriction.

**`RW._cmdActiveSettingsTool()`** — maps `annotationState.currentTool` back to our internal tool
name by matching against each `RW._toolSettingsMap` entry's confirmed `dataTool` value
(`magic_wand`→`wand`, `shrink_wrap`→`wrap`, `ribbon`→`mline`); returns `null` for an untracked or
absent active tool, reusing the auto-select watcher's own `readTool()` rather than re-deriving it.

**`onInput()`'s plain-query branch** now blends this in ahead of the ordinary `RW._cmdMatch(v)`
results whenever a tracked tool is active — concatenated, not replacing, so ordinary command
matches are still present in the same list. The tricky part was that `renderMenuRows`/
`runAndClear`/Tab-fill previously branched on `menuMode === 'settings-param'`, but this blended
list lives entirely inside plain `'command'` mode with only *some* items settings-shaped — mode
alone can no longer tell them apart. Switched all three to a duck-typed `isSettingsItem(item)`
check (does it have `.tool`/`.param`, the shape unique to a settings item, regardless of `.tag`/
`.idx` for a tag or `.name`/`.kind`/`.aliases` for a command) instead, which transparently covers
both the original `<tool>.` drill-down (every item settings-shaped) and the new bare-param blend
(a mix) with the same code path.

**Verification**: `verify_cmdline.js` grew from 190 to 203 tests: mapping
`RW._cmdActiveSettingsTool()` correctly for all three tracked tools plus an untracked tool and no
`annotationState` at all; a bare param name matching only while its own tool is active, and *not*
matching for an untracked or absent active tool (the regression guard — reverting the
`RW._cmdActiveSettingsTool()` call to a hardcoded `null` crashes this test immediately, confirming
it's load-bearing); the additive proof itself — typing an unrelated command (`mirror`) while wand
is active still switches tools immediately, nothing blocked; selecting a bare-matched param arms
the identical draft/apply flow as the `<tool>.` form (same clamp, same re-arm, same dispatch
sequence); Tab on a bare match fills `tool.param`, not `undefined`. `node --check` passes; loader
rebuilt (62918 bytes).

**Not live-verified**: the bare-param blend itself hasn't been tried on a real job yet — in
particular whether seeing a tool's own param mixed into the ordinary dropdown, unlabeled with its
tool name, reads as confusing once more than one tracked tool's params could ever overlap in name
(not an issue today — tolerance/detail/padding/smoothing/width don't collide with each other or
with any command name).

## Round 6: select and checkbox params — the static map became a live prefix-based sweep

Immediate follow-up: the user asked whether `ribbon-anchor` (a real, confirmed-live `<select>`
left unwired in round 5) could be typed as numbered states 1-3, and whether `shrink-wrap-
polygon-mode` (a checkbox, also left unwired) could be reached too — plus flagged that checking
that box reveals an additional slider in the app's own UI, which should be reachable "from the
start" without needing its identity hardcoded in advance.

Confirmed via `AskUserQuestion`: select params typable by number *or* text; checkbox params go
through the same value-entry mechanism as numeric ones (`on`/`off`, not an immediate toggle); the
revealed-slider identity is being gathered live by the user, but — the key design decision this
round — **the implementation doesn't need to wait for that report.**

**The static per-param table (`RW._toolSettingsMap`, round 5) became a live DOM sweep by id
prefix.** Only `magic-wand-`/`shrink-wrap-`/`ribbon-` stay hardcoded now; every param under a
prefix — numeric, checkbox, or select — is discovered fresh on every drill-in, reusing the same
`querySelectorAll` sweep `RW._toolSettingsDiagnose` already does. This one change:
- Removes hardcoded min/max entirely — read live from `el.min`/`el.max` every time, so this build
  can't go stale if the app's own ranges change.
- Makes select/checkbox support nearly free — the sweep already includes `select`/
  `input[type="checkbox"]`, round 5 just never extracted `.options`/`.checked` from them.
- **Resolves the revealed-slider question without needing the user's report first.** This app
  already keeps every control in the DOM permanently regardless of which tool is armed (confirmed
  live in round 3's own diagnostic sweep) — so whatever `shrink-wrap-polygon-mode` reveals is
  presumably already sitting in the DOM under the `shrink-wrap-` prefix, just hidden, and a live
  sweep finds it the instant it's discoverable. If it turns out to be a genuinely conditional
  *mount* instead, the exact same mechanism still picks it up correctly the next time the user
  drills in after actually toggling the box — either way, nothing needs to be hardcoded or shipped
  again once the user confirms.

**New helpers in `rw_cmdline.js`**: `cmdControlType(el)` (`'select'`/`'checkbox'`/`'number'`,
module-private); `cmdSweepControls()` (the shared sweep, factored out so
`RW._cmdToolSettingsList` doesn't duplicate `RW._toolSettingsDiagnose`'s selector list);
`cmdParseBoolish(value)` (accepts `on/true/1/yes` and `off/false/0/no`, case-insensitive, `null`
for anything else — so a genuinely invalid value is distinguishable from a real "off");
`cmdMatchOption(options, value)` (a live `<select>`'s options matched by exact 1-based index first,
then exact text/value, then a text prefix — never hardcoded).

**UX — a new drill level for `select` only; numeric and checkbox reuse the existing mechanism
unchanged.** `settingsDraft` gained a `type` field (plus `options` when `'select'`). Picking a
`select` param immediately renders a second numbered list (a new `isOptionItem(item)` shape —
`.optionIndex`/`.optionValue`/`.optionText` — checked *before* `isSettingsItem` everywhere both are
possible, since an option item also carries `tool`/`param` for context and would otherwise satisfy
`isSettingsItem` too); typing filters that list by number or text prefix; Enter/Space/click applies
the highlighted option immediately via the same `RW._cmdApplySetting` re-arm path every other param
type uses. Escape's existing unconditional `settingsDraft` clear needed no changes — it never
inspected the shape it was clearing.

**A real, pre-existing test-harness bug found while writing this round's UX tests, not by
inspection.** `renderMenuRows()` does `menuEl.innerHTML = ''` before re-appending fresh rows — a
real `<div>` clears its child *nodes* along with its markup when you do that, but the harness's
`makeElement` stub had `innerHTML` as a bare string property with no connection to `_children` at
all, so clearing it did nothing. Every prior test happened to avoid exposing this: each either
rendered the menu only once, or asserted with `.some()`/`.find()` rather than an exact count across
multiple renders in one test. This round's select-options tests are the first to render the menu
twice in a single test and assert an exact row count (`rows.length === 3`) — which is exactly what
surfaced it: the second render's rows were appending on top of the first's leftovers instead of
replacing them. Fixed by giving `innerHTML` a real getter/setter that also clears `_children` on
assignment, matching actual DOM semantics — a genuine harness-accuracy fix, not a workaround.

**Verification**: `verify_cmdline.js` grew from 205 to 258 tests. New coverage: `RW._cmdTool
SettingsList` discovering a select (live options, numbered from 1) and a checkbox (`.checked` as
`'on'`/`'off'`, never cached — re-sweeping after flipping `.checked` reflects the change
immediately) purely by prefix; applying a select param by number, by exact text, and by a text
prefix, plus rejecting a non-match; applying a checkbox via every accepted spelling and rejecting
garbage; the full option-list UX (shown immediately on picking a select param, filtered live by
number or text, applied immediately on selection with no separate value step); Escape cancelling
an in-progress option pick same as a numeric draft; Tab filling the highlighted option's number
without applying it. Every existing round-5 test needed its fixtures updated to actually attach
to `doc.body` (discovery is genuinely DOM-driven now, unlike the old static map which listed a
param regardless of whether its element existed) — a mechanical but real adaptation, not a
loosened assertion. Spot-checked per this repo's own convention (rounds 3/6, continued here):
reverted `cmdMatchOption`'s index-match branch and `cmdParseBoolish`'s "on" branch individually and
confirmed each one's dependent tests fail exactly as expected, then restored both. `node --check`
passes; loader rebuilt (70891 bytes).

**Not live-verified this round**: whether `shrink-wrap-polygon-mode`'s revealed slider is genuinely
hidden-in-DOM-already (in which case it's already usable via `wrap.` right now) or conditionally
mounted (in which case it becomes usable the moment the user actually checks the box for real) —
the user is checking this live and will report back, but per the design above, no further code
change is needed either way. Also still open: whether `input`+`change` alone is sufficient for the
select/checkbox controls the way it was individually confirmed for `magic-wand-tolerance`
specifically — every message but that one control's still carries the "confirm it actually
applied" hedge.

## Round 6b: checkbox params toggle immediately, matching how select options already work

Live use found round 6's checkbox mechanism unnecessarily heavy: drilling into `polygon-mode`
armed a draft and waited for a typed `on`/`off`, when the natural action — same as picking a select
option — is to just flip it right there. Small, unambiguous follow-up, implemented directly.

`runAndClear`'s checkbox branch no longer arms `settingsDraft` at all: it reads `item.current`
(already live from `RW._cmdToolSettingsList`) and calls `RW._cmdApplySetting` with the opposite
value immediately, then clears/blurs exactly like a completed select-option pick or an ordinary
command. `RW._cmdApplySetting` itself is unchanged — it still accepts an explicit `on`/`off`
(`true`/`false`/`1`/`0`/`yes`/`no`) value for anyone calling it directly from the console; only
what picking the row in the dropdown *does* changed. The dropdown's own label changed from
"(on/off, now off)" to "(toggle, now off)" to match. This makes `onInput`'s free-typed-value branch
for `settingsDraft.type` unreachable for `'checkbox'` in practice (a draft is simply never created
with that type anymore) — left as dead-but-harmless rather than removed, since `RW._cmdApplySetting`
still needs to parse a typed on/off value for its direct-call path.

**Verification**: `verify_cmdline.js` grew from 258 to 264 tests — picking the checkbox row flips
it immediately with no intermediate step, re-arms the tool, and clears/blurs the input; picking it
again flips it back; the row label reads "toggle" not "on/off"; the same immediate flip applies
whether reached via the `wrap.` drill-down or the bare-param blend while wrap is active. Spot-checked
by hardcoding the toggle to always apply `'on'` regardless of current state and confirming the
flip-back test fails, then restored. `node --check` passes; loader rebuilt (71438 bytes).

## Round 6c: Tab live-previews a select param's states on the real page, cycling as you go

Follow-up to round 6's `mline.anchor` support: the user asked for Tab to switch between anchor
states with a live preview on the page, rather than needing to type a number/text and press Enter
each time just to see what a state looks like.

**Deliberately breaks this file's own Tab convention, scoped narrowly.** Every other Tab usage in
this module — command names, tag names, a select param's own row in the top-level param list —
fills the input without running anything, a rule stated explicitly in existing comments. Inside a
select param's *option* list specifically, Tab now does the opposite: it applies the next option
live (dispatching `input`+`change` and re-arming the tool, exactly like a real confirm), cycling
with wraparound, Shift+Tab going the other way — and leaves the option list open afterward so
cycling can continue. This is intentional and narrow: only `settingsDraft.type === 'select'`
inside `onInputKeydown` takes this branch; every other Tab call site is untouched.

**A real consequence this forced, not an incidental side effect: Escape's contract had to change
for select params specifically.** Previously Escape always "leaves the real control completely
untouched" — true for numeric/checkbox drafts, which never touch anything until confirmed. But
Tab-preview genuinely writes to the real control as you cycle, so leaving the *last previewed*
state in place on Escape would be a real, silent surprise (cancel would keep whatever you happened
to land on). Fixed by recording `settingsDraft.originalValue` (the real current value at the
moment the param was first picked, before any Tab) and a `previewed` flag (only set once an actual
Tab-driven change happens); Escape reverts to `originalValue` via the same `RW._cmdApplySetting`
path, but only when `previewed` is true — a plain cancel with no Tab-ing still does nothing extra.

**A second, smaller fix bundled in because it directly serves the same goal**: the option list's
initial highlight previously always defaulted to index 0 regardless of the tool's real current
value — harmless before (Enter with nothing typed just re-applied whatever was already current, by
coincidence, whenever that happened to be the first option), but wrong for a Tab-cycle that's
supposed to move *from where you actually are*. Now the initial highlight matches the real current
value (`item.current`), falling back to index 0 only if no option matches.

**Verification**: `verify_cmdline.js` grew from 264 to 273 tests. The two round-6 tests this most
directly invalidated were rewritten rather than patched: the old "Tab fills without applying" test
for select params now asserts the opposite (Tab actually changes the real control, re-arms, wraps
both directions, Shift+Tab reverses) since that old assertion described exactly the behavior this
round replaces; the "confirming applies the highlighted option" test switched its fixture to a
non-first current value (`'right'`) specifically so a regression to the old always-index-0 default
would be caught, not silently pass by coincidence. New: Escape reverting to the true original after
previewing, and a dedicated test that Escape triggers zero extra dispatches when nothing was ever
Tab'd. Spot-checked per this repo's convention: reverted the `previewed` flag set and confirmed the
revert-test fails; reverted the live-apply call inside the Tab branch and confirmed five dependent
tests fail; restored both. `node --check` passes; loader rebuilt (73633 bytes).

**Not live-verified**: whether live-previewing on every Tab press feels responsive on a real page,
and whether re-arming the tool (via `RW.runCommand`) on every single Tab press during a fast cycle
causes any visible flicker or lag — untested outside the synthetic harness.

## Round 7: Space repeats the last tool, AutoCAD's own convention

The user described it as "quitting the last tool will save the latest instant of closed tool, so
when pressing space again it will use the last used tool" — AutoCAD's real convention: Enter or
Space with an empty command line repeats the last command.

**Tracking "last tool" turned out not to need reading `annotationState.currentTool` at all** —
the obvious-looking approach (capture whichever tool the app reports as active right before a
close/revert) would have needed reverse-mapping `currentTool` strings back to command names for
every native tool, most of which are still unconfirmed (CLAUDE.md's own open questions). Sidestepped
entirely: `RW._cmdLastTool` is stamped directly inside `RW.runCommand` whenever a real draw-tool
command is *run*, independent of how or when it later closes. `nativeDrawTool(key)` marks its own
returned closure with `fn.__isDrawTool = true`; `RW.runCommand` checks that marker before stamping
— so mode switches (`pan`/`select`/`label`/`crop`/`mirror`, built via `nativeKey` instead) never
become "the last tool," matching what the user actually meant by "tool."

**The repeat trigger lives in the existing global auto-capture listener**, as a new check inserted
before the generic single-character capture: `e.key === ' ' && RW._cmdLastTool && (command bar
empty) && readTool() === null`. Three guards, each preventing a real misfire:
- Command bar empty — a Space that's part of mid-typed text (or confirming a dropdown match) must
  never be reinterpreted as a repeat; this is checked ahead of the generic capture, so a non-empty
  bar just falls through to ordinary typing, unaffected.
- `readTool() === null`, not merely falsy — deliberately the strict equality already established
  by the auto-select watcher's own three-way result (`undefined` = unreadable, `null` = confirmed
  cleared, anything else = a real tool). If `currentTool` can't be read at all, this stays cautious
  and does nothing rather than guessing — the same "fail closed on uncertainty" discipline the
  auto-select watcher already applies to itself.
- A confirmed non-null `currentTool` blocks it outright — Space pressed while some *other* tool is
  genuinely still armed must never get hijacked into switching away from it.

When the repeat fires, it calls `RW.runCommand(RW._cmdLastTool)` directly — the command bar is
never opened or seeded, matching AutoCAD's own instant-repeat feel rather than treating it as a
search. When any guard fails, Space falls through to the pre-existing capture behavior unchanged
(seeds the input with a literal space, which since `RW._cmdMatch('')`'s trim already treats an
all-whitespace query as empty, ends up showing the full command list — pre-existing behavior, not
new).

**Verification**: `verify_cmdline.js` grew from 273 to 285 tests — `RW._cmdLastTool` stamped for a
real tool and never overwritten by a mode switch; Space repeating the exact dispatch sequence a
direct `RW.runCommand` call would produce, without ever touching the command input; Space falling
through to ordinary capture in each guard's failure case individually (no tool run yet, another
tool confirmed still armed, an unreadable `currentTool`, and a non-empty command bar). Spot-checked
per this repo's convention: loosened the `readTool() === null` check to unconditionally `true` and
confirmed the two guard tests it protects fail exactly as expected; removed the `__isDrawTool`
check from `RW.runCommand`'s stamp line and confirmed the mode-switch test fails; restored both.
`node --check` passes; loader rebuilt (75295 bytes).

**Not live-verified**: whether repeating a tool this way (bypassing the command bar/dropdown
entirely) feels right in practice, and whether annotators expect Space to behave this way given
it's also the app's own native temp-pan key (already shadowed by this build's auto-capture, per
earlier rounds) — worth watching for confusion between "Space repeats last tool" and any lingering
expectation of temp-pan.

## Round 7b: Space becomes a full toggle — closes an active tool too, not just repeats

Immediate follow-up: round 7 only handled the "nothing armed" half of Space; the user wanted the
other half too — Space closing whatever tool is currently active. Confirmed via `AskUserQuestion`:
unconditional, no tracking of whether a setting was changed first (every setting change is already
committed the moment it's applied via round 6's mechanism, so there's nothing "pending" a close
could lose).

**The two branches share one `readTool()` call and split on its three-way result** — the exact
same confirmed-null/confirmed-tool/unreadable distinction the auto-select watcher already uses on
itself: confirmed null + a recorded `RW._cmdLastTool` → repeat (round 7, unchanged); a confirmed
non-null tool → close it via `RW._cmdGoSelect('space', true)`, the same funnel Escape and the poll
already use, inheriting its existing suppression window and mode-aware skip for free; unreadable →
neither, falls through to ordinary capture, same cautious default used everywhere else this
three-way read appears.

**The close branch can never misfire on a plain mode switch, confirmed by re-checking round 3's own
design rather than assumed**: `readTool()` only reads non-null while an actual draw tool is armed —
switching to `pan`/`select`/`label`/`crop`/`mirror` clears `currentTool` back to null (this is
exactly what round 3's resync guard was built to handle), so the close branch structurally can't
fire while in a mode switch; it only ever closes a genuine tool.

**Verification**: `verify_cmdline.js` grew from 285 to 287 tests. Rewrote round 7's "Space does not
repeat while another tool is armed, falls through to ordinary capture" test, since that description
was exactly the gap this
round closes — it now asserts the opposite (Space closes that tool, dispatching `s`, never seeding
the command bar). New: closing works for a tool armed any other way (not just one run through
`RW.runCommand`, so `RW._cmdLastTool` being unset doesn't block it); a mode switch (`pan`) with
`currentTool` confirmed null still correctly repeats the last tool rather than triggering a
spurious close. Spot-checked by disabling the close branch and confirming its three dependent tests
fail, then restored. `node --check` passes; loader rebuilt (76324 bytes).

## Round 7c: Space's toggle made self-consistent — two real bugs found live, not by inspection

The user reported the round 7b toggle breaking exactly where it mattered most: close a tool with
Space, press Space again, and it wouldn't repeat the last tool — plus asked explicitly that the
tool keep being "remembered" across cycles as long as nothing else is used. Both turned out to
trace to the same root cause: the close/repeat decision depended on a **fresh `readTool()` read at
the moment of each Space press**, re-querying `annotationState.currentTool` right after our own
prior dispatch — exactly the kind of live-timing dependency this project has been burned by
before, with no confirmed guarantee the app's own state updates synchronously relative to a
dispatched keydown.

**Fix: stop re-reading the app, track our own state instead.** `RW._cmdToolArmed` is now a plain
boolean this project maintains itself — set `true` in `RW.runCommand` whenever a real draw-tool
entry runs (alongside the existing `RW._cmdLastTool` stamp), set `false` whenever any mode switch
runs (`pan`/`select`/`label`/`crop`/`mirror` — matching the same `__isDrawTool` marker already used
to scope what counts as "the last tool") or whenever `RW._cmdGoSelect` successfully closes, from
*any* of its callers (Escape, the poll, or Space). The Space handler's decision now reads this flag
instead of calling `readTool()` at all — sidestepping the live-timing question entirely rather than
trying to work around it.

**A second, independent real bug surfaced immediately by testing the exact reported flow as a loop
(close, repeat, close, repeat, repeat), not a single close-then-repeat pair**: the first cycle
passed, every cycle after it failed. Cause: `RW._cmdGoSelect`'s 600ms suppression window (built in
round 3 to stop the *automatic* triggers — the poll and Escape's own deferred call — from
double-firing when they race each other) also blocked a *second, deliberate* Space-close pressed
within that window, since nothing distinguished an intentional user action from an automatic one at
that check. A user rapidly toggling Space — a completely natural thing to do, including just to
test that it works — would silently hit a dead cycle where a press did nothing at all. Fixed with a
new `bypassSuppression` parameter on `RW._cmdGoSelect`, passed `true` only by Space's own close
call; Escape and the poll are untouched and still fully protected by the window, since their race
condition is real and unrelated to this.

**Verification**: `verify_cmdline.js` grew from 287 to 298 tests. Every round-7/7b test that
previously drove the decision by mutating `annotationState.currentTool` directly was rewritten to
drive it through the real mechanism instead (`RW.runCommand`/`RW._cmdGoSelect`), since that's what
actually maintains `RW._cmdToolArmed` now — mutating `annotationState` directly no longer has any
effect on this decision, which is itself the fix, not a loosened test. New: the literal reported
scenario as a 4-cycle loop (close/repeat/close/repeat/…), asserting every single cycle dispatches
correctly with no dead press; remembering the same tool across cycles until a genuinely different
tool is run, at which point that one takes over; Space repeating correctly even with no
`annotationState` at all (previously impossible, since the old design needed a live read to even
attempt the decision). Spot-checked per this repo's convention: reverted the `bypassSuppression`
argument at the Space-close call site and confirmed the exact loop test fails starting at cycle 1,
matching the live report precisely, then restored. `node --check` passes; loader rebuilt
(77917 bytes).

**An accepted, stated trade-off**: arming a tool by any path other than `RW.runCommand` (e.g.
clicking the app's own toolbar directly) is invisible to `RW._cmdToolArmed`, so Space won't offer
to close it. Given the alternative was the live-read approach that just failed in exactly the way
reported, this is the right trade for now — flagged in README rather than silently accepted.

## Round 7d: switching to `label` from an active tool, then pressing Space, landed on select instead of resuming that tool

Live report: with a draw tool active (e.g. `mline`), switching to `label` and pressing Space with
an empty command line should go straight back to that tool — instead it dropped to select, needing
a second Space to actually get the tool back. Confirmed via `AskUserQuestion`: the fix is scoped to
`label` only (`pan`/`draw`/`crop`/`mirror` keep their existing Space behavior — repeat only from a
confirmed-idle state, otherwise close), and the desired result is `mline -> label -> Space -> mline`
directly, never routing through a visible select step in between.

**Two candidate root causes, both plausible from the code and neither distinguishable without a
live page — so the fix closes both at once rather than picking one to chase.** Space's branch choice
(the global auto-capture listener) reads exactly one flag, `RW._cmdToolArmed`; nothing before this
round recorded *which mode* the app was actually sitting in:
1. If `label` was armed via something other than `RW.runCommand` (leaving `RW._cmdToolArmed` stale
   `true` from whatever ran before it), Space took the close branch straight to `_cmdGoSelect` → `s`.
2. Independently, the auto-select poll (`RW._cmdToolWatchTick`) can itself revert to select ~1s after
   entering label: its existing "don't fight a deliberate mode" guard only holds off when
   `annotationState.mode` reads back as a *recognized* non-`draw` string, and this file's own open
   questions have long recorded that only `'draw'` has ever been confirmed live — if label's real
   `mode` value is unrecognized (or the field doesn't update at all), that guard silently doesn't
   fire and the poll fights the user back to select on its own.

**Fix: track the active mode ourselves, the same doctrine round 7c already applied to
`RW._cmdToolArmed`** — never re-derive it from a fresh `annotationState` read at decision time.
`nativeKey` (used by every mode-switch table entry: `pan`/`select`/`draw`/`label`/`crop`/`mirror`)
now marks its closure `fn.__isModeSwitch = true`, mirroring `nativeDrawTool`'s existing
`__isDrawTool` marker. `RW.runCommand` stamps a new `RW._cmdModeActive` alongside
`RW._cmdToolArmed`: `null` for a draw-tool run, `null` for `select` (at-rest, same as never having
entered a mode), and the mode's own name for every other mode switch. `RW._cmdGoSelect` clears it
on both of its "we are now at rest" exits (the successful-dispatch path and the
already-in-select-mode early return), so it always tracks exactly the same lifecycle
`RW._cmdToolArmed` already does.

This one flag closes both root causes independently: (1) the Space handler gained a new
`SPACE_RESUMES_FROM = ['label']` branch, checked **before** the existing close branch, that calls
`RW.runCommand(RW._cmdLastTool)` directly whenever `RW._cmdModeActive` is `'label'` — so even a
stale `RW._cmdToolArmed` can no longer hijack it into dispatching select first; (2) the poll's
pending-edge block gained `if (RW._cmdModeActive) return;` alongside its existing live-mode-string
gate, so "don't fight a deliberate mode switch" no longer depends on `annotationState.mode` holding
a value this build happens to recognize — it now also holds whenever our own bookkeeping says we're
in one, which is exactly what README already promised for `pan`/`label`/`crop`/`mirror` generally,
just made robust to an unconfirmed/unrecognized `mode` string. Like the poll's other guards, this
one deliberately doesn't clear the pending-edge flag on a block — a still-pending revert fires on
the very next tick once `RW._cmdModeActive` is cleared, not silently dropped.

**One existing test's premise changed, not weakened.** Test 30 (grace-window guard, isolated)
previously ran `RW.runCommand('mirror')` to stamp `RW._cmdLastUserCmdAt` while deliberately defeating
the mode gate — but `mirror` is now *also* tracked by `RW._cmdModeActive`, which would block the
revert on its own and defeat this test's isolation of the grace-window guard specifically. Switched
to `RW.runCommand('wand')` (a draw-tool run, which clears `RW._cmdModeActive`) so the grace window
remains the only guard under test — a mechanical adaptation to the new tracking, not a loosened
assertion.

Verification: `verify_cmdline.js` grew from 298 to 311 tests — running `label` after a draw tool
records `RW._cmdModeActive === 'label'` (test 116); Space from label dispatches the tool directly
with zero intermediate `'s'` dispatch, never seeds the command bar (117); the branch-ordering
regression guard — forcing `RW._cmdToolArmed = true` right after `label` and confirming the resume
branch still wins over the close branch (118); the label-only scope — `pan` is tracked by
`RW._cmdModeActive` too but Space still takes the pre-existing plain-repeat path, unchanged (119);
falling through to ordinary capture when no `RW._cmdLastTool` exists yet (120); the poll gate
holding with `annotationState.mode` deliberately unreadable, and the still-pending edge retrying
the instant `RW._cmdModeActive` clears (121). Spot-checked per this repo's convention (rounds
3/6/7c): reverted the Space resume branch (test 118 failed exactly as expected — 117 alone still
passed, since it's not a discriminating case, confirming 118 is the real regression guard); reverted
the poll's new `RW._cmdModeActive` check (its dedicated test failed); restored both. `node --check`
passes; loader rebuilt (80199 bytes).

**Not live-verified this round** (synthetic-only, as always): whether label's real
`annotationState.mode` string is recognized or not was never actually the deciding factor for
whether this fix works, by design — but confirming it on a real page (`console.log(annotationState.mode,
annotationState.currentTool)` while in label) would settle which of the two candidate root causes
was actually firing, a standing open question this round didn't need to resolve to ship the fix.

## Round 7d (corrected): the live report actually meant the OPPOSITE of what was shipped above

Live testing of round 7d's fix, done properly this time (diagnostic snapshots taken at the right
moments, not guessed at): `mline -> label -> Space` correctly landed on `mline` again exactly as
built — `RW._cmdModeActive` read `'label'` right before the press, and `'draw'`/`'ribbon'`/armed
right after, a clean `d`,`p` dispatch with no `s` in between. The fix worked. **It was fixing the
wrong direction.** A second live trace (`mline -> label -> Space -> mline -> Space`) landed on
select on the *second* Space — correct, unrelated, pre-existing round-7b toggle behavior (an armed
tool closes on Space) — and prompted the user to state the actually-intended behavior plainly:
**leaving `label` should go to select, never back to whatever tool was active before it.**

Re-reading the original round-7d report with that in hand, it was ambiguous in exactly the way
that matters: "clicking space deactivates label then switches to the previous active tool instead
[of going] back to select" was parseable either as a description of a desired fix (what round 7d
built) or as a description of the BUG itself, with "resolve this" meaning eliminate that resume
behavior — the latter is what the user actually meant, confirmed directly once asked plainly rather
than inferred from the original phrasing. The `AskUserQuestion` asked during round 7d's planning
didn't surface this — its options were framed around "what should happen," and the user picked the
option matching the ambiguous original text's surface reading, not necessarily its intent.

**The fix that was actually needed is the opposite override.** Critically, "resume the prior tool"
was never something that had to be *built* — every mode switch already clears `RW._cmdToolArmed`
to `false` (round 7/7c), so the pre-existing "nothing armed + `RW._cmdLastTool` exists → repeat"
branch was *already* resuming the prior tool from `label` before round 7d's `RW._cmdModeActive`
tracking existed at all. That resume was the reported bug the whole time. Round 7d built a
`SPACE_RESUMES_FROM` branch that dispatched the same resume slightly more directly (bypassing the
close branch for a stale-armed edge case) — solving a problem that didn't need solving, while
leaving the actual complaint (it shouldn't resume at all) fully in place.

**Corrected**: `SPACE_RESUMES_FROM` renamed `SPACE_GOES_SELECT_FROM`, same `['label']` scope,
opposite action. Checked first in the Space handler, exactly as before, but now calls
`RW._cmdGoSelect('space', true, true)` — the same suppression-bypassing close call the
already-armed branch below it uses — instead of `RW.runCommand(RW._cmdLastTool)`. This overrides
the ordinary repeat-from-idle rule specifically for `label`, forcing select regardless of whether
`RW._cmdLastTool` is set. `RW._cmdModeActive`'s own tracking mechanism (set in `RW.runCommand`,
cleared in `RW._cmdGoSelect`) needed no changes — only what Space *does* with it flipped. The poll
guard added alongside it (`if (RW._cmdModeActive) return;`, stopping the auto-select watcher from
fighting a deliberate mode switch) was never about which way Space goes and remains correct
unchanged.

Verification: rewrote tests 117/118/120 (the ones asserting the resume direction) to assert `Space`
dispatches `['s']` and never seeds the command bar, including with no `RW._cmdLastTool` recorded at
all (120 — the override no longer depends on it existing, unlike the resume it replaced); left 116
(records `RW._cmdModeActive`), 119 (label-only scope — `pan` still just repeats), and 121 (poll
gate) unchanged, since none of them asserted on Space's direction. 312 tests total. Spot-checked:
disabled the new branch and confirmed the three rewritten tests fail exactly as expected, restored.
`node --check` passes; loader rebuilt (80921 bytes).

**The general lesson, stated rather than filed away**: a live report phrased as "X happens instead
of Y" is genuinely ambiguous between "X is the bug, Y is wanted" and "X is wanted, Y is the bug" —
both readings are grammatically available, and an `AskUserQuestion` whose options are framed around
the ambiguous phrasing's own surface reading can confirm the wrong one without anyone noticing
until a live trace disagrees. Two live diagnostic snapshots (before/after the actual keypress) are
what actually resolved this, not another round of asking — a preference for cheap live evidence
over more up-front clarification, consistent with how round 9 was resolved.

## Round 8: scroll-to-zoom — two dispatch attempts, both dropped; landed on a diagnostic instead

User request: make the scroll wheel zoom in/out directly. This went through two dispatch-based
designs before the user clarified the actual requirement excludes dispatch entirely — recorded
here in full since both attempts are real, working mechanisms this project may still want someday
(e.g. if a future request DOES want a keyboard/wheel-shortcut-triggered zoom), just not for this
request as finally understood.

**Attempt 1 — synthetic ctrl+wheel redispatch.** A real, trusted `wheel` event with no modifier
held would be intercepted (capture phase, matching `RW._panStopHostEvents`'s reasoning), native
scroll suppressed, and a synthetic `WheelEvent` carrying the same delta/position but `ctrlKey:true`
dispatched on `document` — reasoning that `Ctrl+scroll zoom` (README's own app-keymap reference)
is likely a JS `wheel` listener checking `e.ctrlKey`, the same "any listener works for an untrusted
event, only native browser behavior doesn't" distinction this project already relies on for pan.
Shipped with tests, then reverted before any live test — not because it was disproven, but because
the user's very next message ("dont use ctrl, just plain scrolling") ruled out the whole approach.

**Attempt 2 — synthetic Ctrl+Plus/Minus keydown dispatch, throttled.** Re-reading "don't use ctrl"
as "don't use ctrl+*wheel*, specifically" (a wheel-shaped fix was assumed to be the objection, not
the modifier itself), switched to dispatching README's *other* documented zoom binding —
`Ctrl+Plus`/`Ctrl+Minus` — via `RW._cmdDispatchAppKey`'s already-proven keydown idiom instead of an
untested wheel redispatch. Needed throttling (`RW._zoomStepMs`, default 90ms) since a single wheel
gesture can fire many `wheel` events/second, and 1:1 discrete keypresses would zoom far faster than
a real Ctrl+scroll's proportional delta. Fully built and tested (19 tests), then reverted again —
confirmed via `AskUserQuestion` that this STILL wasn't what was wanted: "Scrollwheel only for
zooming in and out, dont need any keypress" — the objection was never about *which* modifier or
*which* event type, it was that dispatching to one of the app's own shortcuts at all is the wrong
shape; the request wants plain scrolling to visually zoom by itself, full stop.

**Why the third attempt is a diagnostic, not a third dispatch guess.** Once dispatch is off the
table, this has to become "implement it ourselves" territory — the same territory middle-drag pan
already occupies. But zoom is not like pan. Pan moves EXISTING content within its own scroll
container via `scrollLeft`/`scrollTop` — universal DOM properties every scrollable element has, so
there is no way to get the *mechanism* wrong, only the *container* (which `RW._panResolveContainers`
already solves generically). Zoom has no universal DOM equivalent: different apps implement it as a
CSS `transform: scale()` on a wrapper, a `<canvas>` redrawn at a different backing resolution, a
PDF-library-specific zoom API, or a plain `annotationState` field — and there is no way to discover
which one this app uses without either a live probe or a guess. A guess here carries a real
correctness risk this project's Constraints exist specifically to avoid: if the app computes where
a click lands from its real, untransformed page layout, an externally-applied CSS zoom could
silently desync the visual zoom from where an annotation actually gets placed — a much worse
failure than pan's own worst case (a harmless no-op if the container walk finds nothing).

**`RW._zoomDiagnose(el)`** — read-only, console-only, same spirit as `RW._panDiagnose` (which
existed and answered its own "does this app even scroll" question BEFORE pan's real mechanism was
built, not alongside a guess). Walks up from the annotation canvas (or an explicit element)
reporting, per ancestor: computed and inline CSS `transform`, the legacy `zoom` CSS property, and
— for a `<canvas>` specifically — its backing-resolution attributes (`width`/`height`) versus its
rendered (`clientWidth`/`clientHeight`) size, since a resolution/render-size mismatch is itself one
common real implementation of zoom. Separately scans `annotationState`'s own keys (if it exists)
for anything name-shaped like `zoom`/`scale` and reports its live value. Intended use: run once
before zooming via the app's own native controls, zoom in noticeably, run again, diff by eye —
whatever changed between the two runs is the real mechanism. **Plain scrolling is not wired to
anything yet** — it still just scrolls, unchanged, until the diagnostic comes back with a real
answer.

Verification: `verify_cmdline.js` net change from 312 (both dispatch attempts' tests fully removed,
not left dormant — they tested mechanisms this round no longer ships) to 318 — `RW._zoomDiagnose`
walking a canvas + one ancestor and reporting the canvas's backing-resolution attributes and the
ancestor's live computed transform correctly; scanning a mixed `annotationState` object and finding
only `zoom`/`scale`-shaped keys with their real values, never `currentTool` or an unrelated key;
degrading to an empty array (not a throw) with no `annotationState` at all. The now-dead
`FakeWheelEvent` test-harness stub (added for attempt 1, unused since attempt 2 switched to
`KeyboardEvent`) was removed along with attempt 1's tests, not left behind. Spot-checked per this
repo's convention: disabled the `annotationState` key-matching condition and confirmed its
dependent test failed. `node --check` passes; loader rebuilt (84855 bytes).

**Not live-verified this round, more than usual**: literally nothing about zoom's real mechanism is
known yet — that is the explicit point of shipping a diagnostic instead of a guess this time. The
next round depends entirely on what `RW._zoomDiagnose()`'s before/after diff actually shows on a
real page.

## Round 9: Tab cycles the dropdown, mouse wheel navigates it too

Request: while searching tags (or commands), reach the second/third match without needing the
arrow keys. Before this round, `ArrowUp`/`ArrowDown` were the *only* way to move between matches
— `Tab` did something different (fill the highlighted match into the input without advancing,
rw_cmdline.js's generic Tab branch), and the mouse wheel did nothing at all (no `wheel` listener
existed anywhere in the repo).

Four decisions confirmed via `AskUserQuestion` before writing any code:

1. **Highlight-only, never apply-as-you-go.** Tab and the wheel only move `menuHighlight`; the
   tag/command is only actually run on Enter, Space, or a click — deliberately unlike round 6c's
   select-param Tab, which live-previews each option on the real page as you cycle. Cycling a
   tag search with Tab or the wheel now never touches `annotationState.currentTag` and never
   dispatches a key, by design.
2. **Wheel scoped to the dropdown itself, not the whole page.** The `wheel` listener is
   registered on `#rw-cmd-menu` directly (inside `ensureMenuDom`), not on `document` — so it only
   ever fires while the pointer is actually over the dropdown. This was deliberate given round
   8's still-open scroll-to-zoom question: a document-level wheel listener here would have been
   exactly the kind of thing a future wheel-zoom feature could collide with. `onMenuWheel` also
   calls `stopPropagation()` on every event it handles, for the same reason.
3. **Both plain search modes (commands and tags), not just tags.** The `<tool>.` settings-param
   list and a select param's own option sub-list are explicitly *out* of scope for both
   mechanisms — the former because picking a param arms a value-entry draft, not something worth
   cycling through; the latter because it already has its own, different Tab behavior (round
   6c's live-preview) that this must not disturb.
4. **Tab keeps filling the input as it advances** (unlike the wheel, which only moves the
   highlight and re-renders — matching how the pre-existing arrow keys already behaved, never
   touching `inputEl.value`).

**Implementation.** Tab's existing generic branch (`e.key === 'Tab'` in `onInputKeydown`) gained
one line at its top: `if (menuMode === 'command' || menuMode === 'tag') moveHighlight(e.shiftKey
? -1 : 1);` — reusing the pre-existing `moveHighlight` helper verbatim (it already wraps via
modulo and no-ops on an empty list), advancing *before* the existing fill code runs so the
highlighted row and the filled text are always in sync. The select-param live-preview Tab branch
and the settings-param mode are unreached by this line's condition, so they're unaffected without
needing an explicit exclusion. `onMenuWheel(e)` is new: gated on `RW.enabled` and its own
`RW._cmdMenuWheel` flag (same killswitch discipline as every other feature here), scoped to
`menuMode === 'command' || 'tag'`, ignores a horizontal-only scroll (`deltaY === 0`), calls
`preventDefault()`+`stopPropagation()` *before* its own throttle check (`RW._cmdMenuWheelMs`,
default 60ms) so a fast trackpad gesture's extra events never leak into real scrolling just
because they landed inside the throttle window, then calls `moveHighlight(1 or -1)` — scroll down
means next match, the same sense as `ArrowDown`. `RW._cmdMenuWheelInvert` (default `false`) is a
console escape hatch if that direction feels backwards on a real page, matching this project's
existing convention of shipping `RW._panInvert`-style flags for exactly this kind of unconfirmed
feel.

Verification: `verify_cmdline.js` grew from 318 to 350 assertions (tests 125-134) — Tab advancing
and wrapping both directions through tag and command matches; the load-bearing guard that neither
Tab-cycling nor wheel-navigating ever assigns `annotationState.currentTag` or dispatches a key,
only Enter does; Enter after cycling commits whatever was actually landed on, not the original
first match; the settings-param scope guard (a multi-match `wrap.` query never advances on Tab);
wheel moving the highlight in both tag and command mode with `preventDefault`/`stopPropagation`
confirmed; the throttle collapsing a fast two-event burst into one step while still
`preventDefault`ing both; the killswitch and scope no-ops (`RW.enabled=false`,
`RW._cmdMenuWheel=false`, a horizontal-only scroll, and a select param's option sub-list left
untouched); a new gap-fill test for `ArrowUp`/`ArrowDown`, which had zero coverage before this
round despite being pre-existing behavior. No existing test needed changing — confirmed by
re-running the full suite before writing any new code. Spot-checked per this repo's own
convention (rounds 3/6/7c): reverted the Tab-cycle line, the throttle check, and the mode-scope
guard individually and confirmed each one's dependent tests fail exactly as expected (8, 1, and 1
respectively), then restored all three. `node --check` passes; loader rebuilt (88056 bytes).

**Not live-verified this round**: whether cycling by wheel feels natural at the confirmed 60ms
throttle on a real trackpad or mouse, and whether the scroll direction (`deltaY > 0` → next)
matches what feels intuitive without `RW._cmdMenuWheelInvert` — both untested outside the
synthetic harness, same caveat as every prior round's UI-feel questions.

## Round 10: wheel navigation works anywhere while the dropdown is open, not just over the dropdown — REVERTED in round 10b/c, see below

***This round was fully reverted in round 10b — a real job found that moving the wheel listener to
document consumed every wheel event over the canvas and blocked page scrolling there. The text
below is preserved to record what was built and why it was wrong; do not re-apply it without
rereading round 10b.***

Follow-up to round 9: the user found that wheel-navigation only worked while the cursor was
actually over the tiny dropdown — scrolling with the cursor anywhere else on the page did nothing.
Since the whole point of `#` tag search (round 4) is to reach the second/third match, having to
keep the cursor parked precisely over the dropdown while cycling defeated the purpose.

**The listener moved from the menu element to `document`.** In `ensureMenuDom()`, the wheel
registration changed from `menuEl.addEventListener('wheel', onMenuWheel, { passive: false })` to
`document.addEventListener('wheel', onMenuWheel, { passive: false })` — so it fires from anywhere
on the page (cursor over the canvas, the panel, or anywhere else) *while the dropdown is open*.
Registration stays inside `ensureMenuDom` (runs once, first time the menu is built, guarded by the
existing `if (menuEl) return;` plus the module's own `RW.vcmd` re-paste guard), so the listener is
added exactly once.

## Round 10b: reverted to menu-scoped — the wheel must scroll the canvas, not hijack it

Live use of round 10 reported exactly the failure its own premise should have warned about: **"now
scroll always highlight the tags, i can scroll down/up the canvas"** — with the wheel listener on
document, every wheel event over the canvas (not just over the dropdown) was `preventDefault`ed
and consumed for tag navigation, so the page could no longer be scrolled from the canvas at all.
Scrolling the drawing around is the annotator's most frequent action, and it was broken the moment
the cursor left the dropdown.

**Reverted to the round-9 behavior: the listener is back on the menu element only.**
`document.addEventListener('wheel', …)` → `menuEl.addEventListener('wheel', …)` in `ensureMenuDom()`.
Wheel navigation only fires while the pointer is actually over the open dropdown; a wheel anywhere
else (cursor over the canvas, the panel, etc.) is never even seen by `onMenuWheel` and scrolls the
page normally. Both comment blocks were updated to state this contract, and to record *why* (a
real job's round-10 report) rather than just what the code does. No guards changed — with the
listener off the menu, the closed-dropdown and settings-mode pass-through guarantees are
structural (the menu element itself isn't a normal scroll target), not something the guards have
to enforce.

Verification: `verify_cmdline.js` went from 356 to 358 tests. The round-10 retargeting was undone
(tests 126, 130-133 fire on `byId['rw-cmd-menu']._fire('wheel', …)` again). Test 130's "anywhere on
the page" acceptance was replaced with the opposite, load-bearing regression guard — **130b**: a
wheel fired on `doc` with `target` set to the panel `list` (the canvas stand-in) leaves the
highlight at index 0 *and* is never `preventDefault`ed/`stopPropagation`ed, proving the page
scrolls normally from the canvas. **133b** was reworked to the same effect: a wheel over the canvas
is untouched even while the dropdown is open. **133c** (settings-mode pass-through) now fires on
the menu element itself and still asserts zero `preventDefault`. `node --check` passes; loader
rebuilt.

**The general lesson, in line with rounds 4/9/7d-corrected**: "make it work from anywhere" is
only right when consuming the wheel from everywhere is harmless. Here the very feature being
augmented (scrolling the canvas) is the thing a global wheel listener destroys — a document-level
`wheel` listener with `preventDefault` is, by nature, a page-scroll blocker for every wheel event
you touch, and the fix scoped it back to the one element that has no page-scroll value of its own.

**Not live-verified this round** (synthetic-only): whether scrolling the dropdown's own
`max-height:200px; overflow-y:auto` list via the wheel now scrolls the list's scrollbar rather
than navigating the highlight is untested outside the harness — a real page will confirm whether
round 9's original trade-off (wheel over the dropdown navigates, wheel elsewhere scrolls) still
holds as intended.

## Round 10c: the scroll-blocker returned after selecting a tool — a stale-dropdown-state leak, made robust two ways

Round 10b reverted to the menu-scoped listener, and the harness passed — yet a real job reported
the canvas scroll problem *still* persisted, with a precise new detail: scrolling was normal until
a tool was selected via the command line, and broke again only afterward. That timing is the
smoking gun, and it exposed a second, independent defect round 10b had not addressed.

**Root cause: `runAndClear` never cleared the dropdown state after running a command.**
`runAndClear` (the function that runs when a dropdown row is confirmed) called `hideMenu()` +
`blur()` but left `menuItems` populated and `menuMode` at `'command'`/`'tag'`. That is harmless
with the current menu-scoped listener (a wheel over the canvas never reaches `onMenuWheel` at
all), but the user's live page was still running the round-10 document-listener build — and in
that build the very first confirmed tool selection left `menuMode`/`menuItems` in a state that
kept the document-level `onMenuWheel`'s guards passing, so *every* wheel event after that was
consumed and the canvas froze. The symptom "fine until I select a tool, then broken" is exactly
this leak firing: the bug was never the listener location alone — it was the leaked state that
let a document listener appear open forever.

**Two defensive fixes, both structural rather than a one-off patch:**

1. **`onMenuWheel` now requires the menu to be visibly open.** Added
   `if (!menuEl || menuEl.style.display === 'none') return;` ahead of the existing `menuMode`/
   `menuItems` checks. The dropdown being *actually visible* is now the load-bearing guard —
   stale `menuMode`/`menuItems` can no longer keep a wheel handler alive on a hidden dropdown.
   This makes the "closed means pass-through" guarantee structural, independent of how a
   document-level listener ever got registered.
2. **`runAndClear` now resets `menuItems = []` and `menuMode = 'command'`** after dispatching a
   command (alongside the existing `hideMenu()`/`blur()`), so no stale dropdown state survives a
   run. Defensive with the menu-scoped listener; with a document listener it is what actually
   stops the post-selection freeze.

Verification: `verify_cmdline.js` went from 358 to 366 tests. New: (133d) confirmed after
`Enter` on a real tool, the input is cleared, the menu hidden, and a subsequent `doc`-level wheel
passes through untouched; (133e) a wheel never navigates while the menu is `display:none` even
when stale rows remain in `menuItems`. Both fail against the pre-fix code (revert either guard
individually and the matching test fails), and all prior tests pass unchanged. `node --check`
passes; loader rebuilt (89467 bytes).

**Honest note**: the code is now defensively correct in both builds, but if your live page is
still running the old round-10 *document-listener* `console_loader.js`, **re-paste the freshly
rebuilt loader** — re-pasting the *source* files won't update a page that already has the old
script loaded. The `RW.vcmd`/`ensureMenuDom` guards mean a stale document listener can coexist
with a newer re-paste; hard-reload or paste the rebuilt `console_loader.js` to get an effective
fix.

## Round 11: wheel navigation removed entirely — Tab/Shift+Tab and the arrow keys are the only highlight movers

The scroll-wheel navigation feature (rounds 9/10/10b/10c) was **removed entirely**, per the user's
direct request and their explicit decision against keeping it gated behind a default-off flag.
Re-scoping the listener yet again was no longer worth it: three rounds had already been spent on
"the wheel must not lock the canvas" (round 10 moved it to document and broke page scroll; round
10b scoped it back to the menu; round 10c fixed a stale-dropdown-state leak that resurrected the
same blocker). The scroll wheel simply no longer drives highlight navigation at all — anywhere, on
any element.

**After this change, only Tab/Shift+Tab (and ArrowUp/ArrowDown) move the autocomplete highlight.**
The scroll wheel is never consumed: a wheel over an open dropdown scrolls that list's own
`overflow-y:auto` scrollbar (an improvement for reading long tag lists), and a wheel anywhere else
scrolls the page normally. Guaranteed by construction — there is no `wheel` listener anywhere in
the injected code, so page scrolling can't be hijacked.

**What was deleted from `rw_cmdline.js` (delete only, no behavior added):** the
`menuEl.addEventListener('wheel', onMenuWheel, { passive:false })` registration in `ensureMenuDom()`
and its rationale comment; the entire `function onMenuWheel(e){ ... }`; the `RW._cmdMenuWheel` /
`RW._cmdMenuWheelMs` / `RW._cmdMenuWheelInvert` console-escape-hatch flags and `let menuWheelAt = 0;`
(throttle state). The `menuItems = []; menuMode = 'command';` reset in `runAndClear` was **kept** as
cheap defensive hygiene — with no wheel handler left it's no longer load-bearing for anything, but
it's harmless and keeps dropdown state clean after a run; only its comment was trimmed to drop the
now-dead "any document-level variant of onMenuWheel" rationale.

**Tests (`verify_cmdline.js`, 366 → 343):** wheel-specific tests 130 / 130b / 131 / 132 / 133 /
133b / 133c deleted wholesale. Test 126 rewritten from "Tab-cycling and wheel-navigating never
apply anything" to "Tab-cycling never applies anything" (the wheel `_fire('wheel')` step and its
wheel-specific assertions removed; Enter now commits index 1 instead of index 2 since the wheel
step is gone). 133d and 133e kept but trimmed to their non-wheel assertions: 133d now just checks
a command run clears the input and hides the menu (its trailing `doc._fire('wheel')`
pass-through check dropped as redundant with no listener); 133e now just checks a query that
misses hides the menu. `grep wheel` across the test file returns nothing.

**README.md:** removed the `mouse wheel over the dropdown` utility-key row, and rewrote the
"Tab and the mouse wheel both just move the highlight" paragraph to state that only Tab/arrows
move the highlight, that the wheel is never consumed, and that neither applies anything until
Enter/Space/click. Deleted the three `RW._cmdMenuWheel*` escape-hatch mentions. The scroll-to-zoom
section (round 8) is untouched — it's a separate, still-diagnostic-only feature whose prose
happens to mention "wheel" but installs no listener.

**Not live-verified** (synthetic-only, as always): the one genuinely new real-page behavior is
that a wheel over the open dropdown scrolls its list's own scrollbar instead of moving the
highlight — the safe, native default that needs no app interaction to validate.

## Round 12: single-match dropdown clarity + void workflow awareness

Two behavior changes to the command line, both additive (no API/global names changed):

**1. A single-match query always shows its one row visibly highlighted — selection never happens
invisibly.** The Enter/Space handler previously carried a hidden escape hatch
(`menuMode === 'command'` with `RW._cmdMatch(inputEl.value).length === 1` → run it) that let a
command execute with no visible dropdown at all — the exact "no dropdown shown, but still can
select" confusion reported. Removed: selection now happens only when there is a real highlighted
row (`menuHighlight >= 0 && menuItems[menuHighlight]`); otherwise the existing `unknown command`
status fires as in every other case. This was safe because `onInput` already sets `menuHighlight =
0` whenever `menuItems` is non-empty, so a legitimate 1-match query always reaches the
visible-highlight branch — the fallback was never load-bearing for correct behavior, only for the
invisible-selection confusion. Tag/settings-option single matches were already visible and are
untouched; the change is scoped to `menuMode === 'command'`.

**2. The command line's "last tool" memory now reflects the app's native void workflow.** The app's
void flow: `void` → draw the area with the previously-selected area tools (rect/bbox, circle,
polygon, polyline) → area deleted → app auto-reverts to the draw tool armed just before `void`
ran. Previously `void` itself, or the last area tool used, could become Space's repeat target —
wrong: after the revert, Space should resume the **pre-void** tool. Fixed via self-tracked state,
consistent with round 7c's established "track our own armed state, don't re-read the app at
decision time" doctrine: `RW._cmdVoidPrev` (snapshot of `RW._cmdLastTool` the moment `void` runs)
and `RW._cmdVoidActive` (true while "inside" the workflow). In `RW.runCommand`'s draw-tool branch:
- the `void` table entry is marked `void:true`; running it snapshots `RW._cmdVoidPrev =
  RW._cmdLastTool`, sets `RW._cmdVoidActive = true`, still dispatches (`d`+`v`) and still sets
  `RW._cmdToolArmed = true` (the app genuinely has a draw tool armed), but does **not** overwrite
  `RW._cmdLastTool` — `void` never becomes the repeat target.
- running any other draw tool while active (an area step) dispatches and arms normally but also
  does not overwrite `RW._cmdLastTool` (frozen at the pre-void tool).
- the session ends (self-tracked, first of these): a mode switch runs → clear active; a
  `RW._cmdGoSelect` close (Escape/Space-close/poll) → clear active (`_cmdLastTool` keeps holding
  the pre-void tool, `_cmdToolArmed` false); `void` runs again → re-snapshot and restart; the
  pre-void tool itself runs again → the self-track signal the app has reverted → clear active and
  let normal bookkeeping stamp `_cmdLastTool` again.

**Result for the reported flow** `rect → void → circle → Space → Space`: `_cmdLastTool` stays
`'rect'` throughout; the app is armed with `rect` after revert; first Space closes (dispatch `s`,
armed false) — correct, a tool *was* armed; second Space repeats `rect` (`['d','w']`). This is the
"reflected in command line behaviour" outcome the report wanted.

**Stated assumptions / trade-off, documented rather than hidden:** no `annotationState` read is
added — the boundary is tracked purely from our own command history. Residual edge case, accepted:
after the app silently auto-reverts (no further command-line action), `RW._cmdVoidActive` stays
true until one of the four endings above; consequently running a genuinely *new, different* draw
tool immediately after the auto-revert — with no intervening mode switch / Space / re-run — is
briefly frozen out of `RW._cmdLastTool`. Rare (the pre-void tool is usually what's re-selected or
Space'd). The precise fallback if it proves real live: end the session via the existing auto-select
poll's `currentTool` read (already running, not a new decision-time read) — noted, not built now.

**Verification:** `verify_cmdline.js` grew from 376 to 406 passing assertions across 11 new test
blocks (146-156, 141 → 152 blocks total). New coverage: a 1-match query renders one visible, highlighted row (`display:block`, one child, orange
highlight); Enter on that visible row still runs it via the visible-highlight branch; the
regression guard — with `menuItems` emptied (via a real no-match query) but a 1-match
`RW._cmdMatch` still possible for the stale input text, Enter reports `unknown command` and never
dispatches (deleting the fallback makes this pass; restoring it fails — confirmed by revert
spot-check). Void: `void` still dispatches `['d','v']`; after `rect → void`, `_cmdLastTool ===
'rect'`, `_cmdVoidPrev === 'rect'`, armed true; `rect → void → circle` leaves `_cmdLastTool` frozen
at `'rect'` while circle still dispatches its own `['d','y']`; the full reported loop `rect → void
→ circle → Space → Space` yields close (`s`) then repeat `rect` (`['d','w']`); a mode switch and a
`_cmdGoSelect` close each end the session (a later tool stamps `_cmdLastTool` again); re-running
the pre-void tool ends it too; the whole bookkeeping works with `annotationState` absent (no throw,
correct flags, Space toggle works end to end). Spot-checked per this repo's convention (rounds
3/6/7c): reverted the `!RW._cmdVoidActive` freeze condition and confirmed its five dependent tests
fail exactly as expected, then restored. `node --check` passes; all 406 assertions pass (376 prior
+ 11 new test blocks, several multi-assert); loader rebuilt clean.

**Not live-verified** (synthetic-only, as always): the actual void revert timing on a real page
(the app's own revert to the pre-void tool is the trigger this self-tracking is designed around —
if the app's real void flow behaves differently, e.g. doesn't auto-revert, the freeze simply never
matters), and whether the single-match dropdown change reads as clearer on a real job. Both need
a live page to confirm.

## Round 13: the dropdown was hidden behind the command-line window — two independent causes, plus a draggable panel

The user reported the autocomplete dropdown rendering *behind* the command-line panel. Confirmed
by reading the code directly, not guessed at — **two independent defects**, both had to be fixed
together:

- **Stacking.** `#rw-panel` was `z-index:2147483647` (the 32-bit signed max, raised to that value
  in the immediately preceding commit because a lower value was occluded on a real job) while
  `#rw-cmd-menu` was `z-index:99991` — body siblings, so wherever they overlapped the panel simply
  painted over the menu.
- **Geometry.** `positionMenu()` anchored the dropdown 6px above the **input's** top edge — but
  the input sits *inside* the panel, below the header strip (caret / "Command Line" title /
  RW: ON/OFF button). So the menu's own lower rows grew straight into that header and were hidden
  behind it even before the stacking defect is considered.

Confirmed via `AskUserQuestion`: the dropdown should anchor clear of the **whole panel**, not just
the input, and should **flip to open below** the panel when there isn't room above — a case that
becomes reachable the moment the panel itself is draggable (see below), so both pieces of work
were done together in one round.

**Fix, part 1 — stacking (`rw_core.js`, `rw_cmdline.js`).** The panel's `z-index` dropped one below
the 32-bit max, to `2147483646`; the menu's raised to the true max, `2147483647` — so the menu
always wins any overlap, and the panel still sits above everything the host app itself stacks
(unchanged from the prior round's reasoning). Both values are asserted directly in
`verify_cmdline.js` — the panel's by reading `rw_core.js`'s own source text (`fs.readFileSync`),
since the harness only sandboxes `rw_cmdline.js` and has no other way to see the panel's stacking.

**Fix, part 2 — geometry (`rw_cmdline.js`, `positionMenu()`).** Rewritten to anchor off `#rw-panel`'s
own `getBoundingClientRect()`, not the input's, so the dropdown is always clear of the header
strip. Preferentially opens **upward** above the panel (matching the pre-existing default feel);
flips to open **downward** below the panel only when there genuinely isn't room above and there's
more room below — the case a dragged-to-the-top panel produces. `maxHeight` is written fresh on
every render (clamped between a 60px floor and the existing 200px cap) to whichever side actually
has the room, instead of a fixed `200px` that could run off either edge of the viewport. The panel
rect is read **fresh on every call**, so a dragged panel (see below) is followed with no extra
wiring — the same "resolve fresh, don't cache across calls" discipline `RW._panResolveContainers`
already uses. Horizontal position (`left`/`width`) still tracks the **input**, unchanged — only the
vertical anchor moved to the panel. Falls back to the input's own rect when `#rw-panel` doesn't
exist (e.g. a synthetic harness), so this never throws. `RW._cmdRepositionOverlay` (the panel's own
resize/drag-reposition function) now also repositions an *open* dropdown after it moves the panel,
so a resize can't leave a visible menu at stale coordinates. `RW._overlayDiagnose` gained a `menu`
section (present/absent, style, live rect) alongside the panel's own report, so a live page can
confirm the fix in one console call.

**A draggable panel, landed in the same round because the flip case above depends on it.** The
whole `#rw-panel` overlay can now be moved by dragging its header strip (the row with the collapse
caret / "Command Line" title / RW: ON/OFF button) with the **left mouse button**, following the
same pointer-event idiom middle-drag pan already established in this file: document-level
capture-phase `pointermove`/`pointerup`/`pointercancel` listeners added per drag and really
removed on teardown, `setPointerCapture` on the press target, and multiple independent teardown
paths (`pointerup`, `pointercancel`, `lostpointercapture`, window `blur`, and a move with the left
`buttons` bit cleared) so a drag can never get stuck active.

- **Drag handle identified structurally, not by id.** `rw_panelux.js`'s `retrofit()` inserts the
  header as the panel's `firstChild` with no `id` of its own — every pre-retrofit child
  (`#rw-commit-status`, `#rw-list`) *does* have an id, so `barHeaderEl()` (`panel.firstChild` with
  no `id`) can't misfire before retrofit runs; there's simply no drag target yet at that point.
- **Click vs. drag threshold (3px, `RW._cmdBarThreshold`).** A sub-threshold press changes nothing
  and leaves the existing click-to-collapse behavior on the header completely alone. A real drag
  past the threshold moves the panel and then swallows the **one** `click` that fires on release
  (a capture-phase listener on `#rw-panel`, which runs before the header's own bubble-phase
  `onclick`), so dragging can never accidentally toggle collapse/expand. A fallback
  `setTimeout(0)` clears the suppression flag in case no click follows at all.
- **Presses on `#rw-collapse` or `#rw-enable`, or anywhere outside the header (the body/input
  area), never start a drag** — left entirely to their own click handlers. **Left button only** —
  middle-drag pan already ignores `#rw-panel`, so the two features can't collide.
- **Anchoring conversion.** The panel starts bottom-anchored (`left`/`bottom`/`width`, set by
  `RW._cmdRepositionOverlay`). The first real drag converts it to top-anchored (`style.top` set
  from the live rect, `style.bottom` cleared) and moves it via `left`/`top` deltas from there,
  cached once per drag (never re-read mid-drag), matching pan's own "resolve once per drag, never
  mid-drag, never across drags" discipline.
- **Clamped fully on-screen** at every point during the drag, and again by `RW._cmdClampBar()` any
  time `RW._cmdRepositionOverlay` runs after the panel's been moved (a resize, or any of the live
  `_cmdBarWidth`/`_cmdBarOffset` setters).
- **No re-centering once moved.** `RW._cmdBarUserMoved` (false until the first real drag) makes
  `RW._cmdRepositionOverlay` take an early branch that only re-applies `RW._cmdBarWidth` and clamps
  back on-screen — it never re-centers again after that. `__RW._cmdResetBar()` is the only way
  back: clears the flag and re-pins bottom-center, same as a fresh page load.
- **No persistence** across pages/reloads (confirmed choice, matching this project's standing
  no-localStorage-into-the-host-origin discipline) — a fresh paste of the loader always re-pins.
- **Explicitly not gated on `RW.enabled`** — dragging the panel is the panel's own chrome, the same
  category as the collapse toggle, which already works while RW is off. Only the subordinate
  `RW._cmdBarDrag` flag (default `true`) gates it.

**A real, pre-existing test-harness gap found while writing these tests, not by inspection.**
`makeElement`'s DOM stub had no `firstChild` at all — nothing before this round ever needed it.
Every drag-based test silently no-op'd (`barHeaderEl()` always returned `null`) until this was
added as a real getter (`_children[0] || null`), matching actual DOM semantics.

**Verification**: `verify_cmdline.js` grew from 406 to 470 assertions. Dropdown-anchor coverage
(tests 157-165): anchoring off the panel's top edge instead of the input's (the load-bearing
regression guard for this round); horizontal position still tracking the input, not the wider
panel; the flip-below case when there's no room above, and the no-flip case when there is;
`maxHeight` clamping to whichever side has room, floored at 60px when neither does; the
no-`#rw-panel` fallback; both z-indices (menu's via its own `cssText`, panel's via reading
`rw_core.js`'s source text directly); an open dropdown repositioning on resize, a closed one
staying untouched; `_overlayDiagnose`'s new `menu` section, present and absent. Draggable-panel
coverage (tests 166-176): the threshold-crossing move setting `left`/`top` from deltas and
converting bottom-anchoring to top; clamping at all four viewport edges; a sub-threshold
press+release touching nothing and leaving the click un-suppressed; presses on the caret/enable
button/body never starting a drag even with real movement past threshold; a middle-button press
on the header never starting a drag; a real drag setting `RW._cmdBarUserMoved` and a later
reposition (simulating a resize) keeping the dragged position while still applying
`_cmdBarWidth`/`_cmdBarOffset` live; `__RW._cmdResetBar()` clearing the flag and re-centering;
the post-drag click consumed exactly once, the next click left alone, and the fallback timer
clearing the suppression when no click ever follows; every teardown path (`pointerup`,
`pointercancel`, `lostpointercapture`, window `blur`, buttons-cleared mid-drag) each ending the
drag for real (a further move afterward is provably ignored, not just visually settled) and a
subsequent drag not double-driven; `RW._cmdBarDrag = false` disabling the whole feature; and the
regression guard that `RW._cmdRepositionOverlay` always clears a stale `style.top` when re-pinning
(no double-anchor stretch). Spot-checked per this repo's convention (rounds 3/6/7c): reverted the
panel-rect anchor in `positionMenu` (new test 157 failed, confirming it's the real regression
guard); reverted the flip branch (test 159 failed); disabled the `RW._cmdBarUserMoved` early branch
in `RW._cmdRepositionOverlay` (tests 171's reposition-keeps-position and width-live-apply
assertions failed); disabled `barOnClick`'s suppression entirely (test 173's exactly-once-consumed
assertion failed) — restored all four after confirming. `node --check` passes on both
`rw_cmdline.js` and `rw_core.js`; loader rebuilt clean (109169 bytes).

**Not live-verified this round** (synthetic-only, as always): whether `2147483646` for the panel
is still above everything the host app itself stacks — the immediately preceding round raised it
to the true max precisely because a lower value was occluded on a real job, so this is the one
place this round's change could plausibly regress that fix; one step down should be
indistinguishable in practice, but only a live page proves it. Also open: whether the 6px gap
above the panel reads right on a real page; whether a flipped-below dropdown ever collides with
the app's own bottom chrome; the drag threshold/cursor affordances' real-page feel; whether touch
dragging behaves (a defensive `touch-action:none` is set on the header but untested); and whether
a drag ending on the header genuinely never collapses the panel (the capture-phase click
suppression is asserted directly in the harness, but real browser event-ordering needs one live
drag to fully confirm).

## Round 14: dual-target host adapter — the graph ("Duct Takeoff") session

The user pointed out a second URL, `/graph/projects/<project>/session/?page=<page>` — a
completely separate annotation surface (the sidebar calls it "Duct Takeoff": a full-screen
node-graph duct editor with its own tool palette, no app chrome, and no `annotationState` at all)
— and asked whether the command line could be brought there too. Pasting the loader on that page
did nothing: `build_loader.sh`'s `ready()` gate required `annotationState`/`#pdf-canvas`/
`#annotation-canvas`/`#right-rail-content`, none of which exist there, so it warned "app not ready
after 30s" and returned.

**Live findings, confirmed via `opencli` against a real (empty, `pageEntities.length === 0`)
page before writing any code — not assumed:**

- Synthetic `keydown` switches tools from `document`, `window`, and the canvas alike — flipped
  `activeTool` route→flex→select→extend→grd→route repeatedly, `pageEntities`/`history` staying `0`
  throughout. **No defensive `d` prefix is needed or dispatched** — this host has no draw-mode
  concept; every tool arms directly on its own key.
- `data-tool` matches the confirmed set exactly: `select` `route` `flex` `extend` `branch`
  `transition` `grd` `unit` `vertical` `cut` `damper`, key hints S R F E B T G U V C D.
- `window.__graphDebug.activeTool` is a live, readable current-tool string — the thing rounds 2/4/9
  spent effort guessing at for the annotate host (only `'bounding_box'` was ever confirmed there).
- No per-tool id prefix the way `magic-wand-`/`shrink-wrap-`/`ribbon-` are on the annotate host —
  all ~43 inspector controls share one flat `graph-` prefix; the inspector aside instead reveals a
  tool's own params by **DOM visibility** (`offsetParent`), confirmed live: `route.` lists
  profile/width/height/elevation/hanger-spacing/insulation/liner/pressure/material/seam/gauge/
  fitting fields, `grd.` lists cfm/rotation instead, with real overlap on shared fields
  (system/component/profile/level) — genuinely different lists, not a coincidence.
- `#graph-canvas-stage` (not `#pointer-layer`/`#graph-canvas-frame`, the actual 3024×2268 drawing
  surface) is the anchor point — the frame carries a large negative-offset CSS `transform`, so
  anchoring the bar there would place it off-screen.
- `#graph-canvas-stage` is `overflow:hidden` with nothing to scroll — this host pans via that same
  CSS transform, not `scrollLeft`/`scrollTop`, so middle-drag pan (this file's one non-dispatch
  feature) can never work here regardless of code; it already pans natively on wheel/Shift+wheel/
  middle-click and zooms on Ctrl+wheel.
- No tag list exists on this host; `#graph-system-select` (e.g. `"FPTU (Supply)"`) is the nearest
  analogue — repointed `#` search there per direct confirmation, rather than leaving it dead.

**Implementation: one new file, `rw_host.js`, loaded FIRST (before `rw_panelux.js`, which needs
the canvas id at its own top level to wrap that element's `addEventListener` before `window.__RW`
even exists).** It does exactly one thing — `window.__RWhost = { id: 'graph'|'annotate', canvasId }`
— detected from `#graph-session-root`'s presence in the DOM, not the URL, so it stays correct if
either route ever moves. `rw_core.js` copies it to `RW._host` for `rw_cmdline.js`'s convenience
(falls back to the annotate identity if `rw_host.js` somehow didn't run, matching this file's
existing no-op-without-throwing style everywhere else). Deliberately **not** a bigger abstraction:
every other host-specific fact — the command table, per-tool settings, tag/system search,
`readTool`/`readMode`, whether middle-drag pan applies — stays inside `rw_cmdline.js` itself,
branching on `RW._host.id` (aliased once to `RW_HOST`/`RW_CANVAS_ID`/`RW_IS_GRAPH` module consts),
because each of those needs the bare `annotationState`/`__graphDebug` globals that only resolve
correctly inside `rw_cmdline.js`'s own sandboxed scope — splitting them into `rw_host.js` would
have meant either duplicating that global-resolution logic in two files or losing it entirely.

**Seven call sites branch on `RW_IS_GRAPH`**, each confirmed against the live findings above:
`RW._cmdTable` (a disjoint `GRAPH_TABLE` — `select` a mode switch same as the annotate host's own
`select`, every other entry a plain one-key dispatch via a new `nativeToolPlain(key)` helper,
marked `__isDrawTool` — kept that name, not renamed, since it has always meant "a real tool, counts
for Space's repeat," which is equally true here even with no draw-mode prefix); `readTool`/
`readMode` (the graph host derives "resting" straight from `readTool() === 'select'`, since there's
no separate `mode` field confirmed to exist there); `RW._cmdDispatchAppKey`'s own diagnostic
readout (fixed to call `readTool()` instead of reading `annotationState.currentTool` directly — a
bug this round's own work surfaced: the diagnostic would have silently reported `undefined ->
undefined` on the graph host regardless of the real live value); `RW._toolSettingsMap` /
`RW._cmdToolSettingsList` (the latter gains a visibility filter, applied only when `RW_IS_GRAPH`);
`RW._cmdActiveSettingsTool` (the graph host's tool name *is* its own settings-map key, no
`dataTool` indirection needed); `RW._cmdDetectTags`/`RW._cmdSelectTagUnsafe` (reads/writes
`#graph-system-select` via `.value` + `input`/`change` events — the same write-back technique
`RW._cmdApplySetting` already uses, confirmed live against `magic-wand-tolerance` — never a plain
property assignment, since there is no `annotationState.currentTag` to assign on this host); and
every `document.getElementById('annotation-canvas')` site (`RW_CANVAS_ID`, 4 in `rw_cmdline.js` +
2 in `rw_panelux.js`). `RW._panEnabled` defaults to `RW_IS_GRAPH ? false : true` — the console
escape hatch (`__RW._panEnabled = true`) stays available if a future page on this host ever does
scroll.

**Deliberately unchanged: Space and Escape.** Confirmed via `AskUserQuestion` — the command line's
own Space close/repeat toggle and Escape-returns-to-select semantics apply on the graph host too,
accepting that Space shadows the host's own Space+drag pan gesture (wheel/Shift+wheel/middle-click
still pan) — consistent with this file's existing "capture always wins" doctrine (see round 2)
rather than carving out a host-specific exception. Escape was already low-risk regardless:
`RW._cmdGoSelect`'s Escape path was always deferred via `setTimeout(...,0)` and never calls
`preventDefault`/`stopPropagation`, so the host's own "Esc finishes the route" already runs first
either way.

**Verification**: `verify_cmdline.js` grew from 482 to 500 assertions (tests 180-187) — every prior
(annotate-host) test passes completely unchanged, since `makeStubWindow()`'s default `_host` fixture
(`{id:'annotate', canvasId:'annotation-canvas'}`) reproduces today's behavior exactly; new tests
pass `{host: {id:'graph', canvasId:'graph-canvas-stage'}}` and (for `readTool`) a `__graphDebug`
sandbox global (`loadModule`'s 4th param) to cover: the graph table is disjoint from the annotate
table; a real graph tool dispatches exactly one key, no `d` prefix; `select` is a mode switch, not
a repeat-tracked tool; the diagnostic readout reads `__graphDebug.activeTool`, never
`annotationState`; the overlay anchors to `#graph-canvas-stage` even with a decoy
`#annotation-canvas` present at a very different rect; `RW._panEnabled` defaults `false` there and
`true` on the annotate host; `#` search detects `#graph-system-select`'s live options and writes
back via `.value`+events; and the visibility filter separates `route.`'s params from `grd.`'s under
their shared `graph-` prefix. `node --check` passes on all four modules; loader rebuilt clean
(123586 bytes, `rw_host.js` + `rw_panelux.js` + `rw_core.js` + `rw_cmdline.js`).

**Live-verified end-to-end on the real (empty) page** — the standing "paste it and see" convention,
not synthetic-only this round: `RW.runCommand` driving `__graphDebug.activeTool` through
grd→select→route with `pageEntities`/`history` staying `0`; the bar rendering on-screen anchored
to `#graph-canvas-stage`; `RW._cmdDetectTags()` finding the project's one system
(`"FPTU (Supply)"`) via `#graph-system-select`; and the full command-bar UI path (type `route.`,
click the `width-input` row, type a value, Enter) writing `#graph-width-input`'s real `.value`
end-to-end through `RW._cmdApplySetting`, confirmed by reading the live DOM back.

**A real, unresolved live-testing finding — reported plainly, not glossed over.** During that same
UI-path check, `#graph-save-status` (a single element that reads "Synced" normally) flipped to
"Capture issue" and **stayed that way across multiple page reloads** — it was not a transient
render glitch. Correlated with, but not proven caused by, this round's own test activity: several
rapid `RW.runCommand()` tool-switches plus one settings write-back (`width` 24→26, reverted back to
24 afterward — confirmed via a fresh reload that the revert itself took, and that
`pageEntities`/`history` stayed `0` throughout every step, so no duct/annotation entity was ever
created or altered). The page's own revision counter climbed from `R2003` at session start to
`R2079` — consistent with the app treating every tool-arm and every settings write as its own
autosave revision, not with anything destructive. No toast/banner text was present to explain
"Capture issue" further, and it did not self-heal after a wait + reload. **Not resolved this
round** — flagged here as an open item on project "Mechanical Ductwork · b2026-08-12.15", page 11
(frame `cffe31a6-4ad4-423d-8b8f-4959dc1aab81`): check that page's save status manually before
relying on this host's live-diagnostic dispatches for further testing, and treat rapid synthetic
`RW.runCommand()` bursts (many tool-arms in quick succession) as the leading suspect if it
recurs.

**Not live-verified this round beyond the above**: whether `RW._cmdApplySetting`'s write-back
technique is confirmed for any graph-host control beyond `graph-width-input` (only
`magic-wand-tolerance` on the annotate host carries that confirmation; every graph control still
reports "confirm it actually applied," this project's standing hedge); whether `#graph-system-select`
selection is confirmed on a project with more than one system to choose between (this session's
project has exactly one, `"FPTU (Supply)"`, so before/after were necessarily identical).

**Correction, found while porting `boon-tagger-darkmode` to this same host (see that repo's own
CLAUDE.md).** "Capture issue," flagged above as an unresolved side effect possibly caused by this
round's `RW.runCommand()` bursts, is very likely unrelated: a live DOM sweep during that later
port found real, purpose-built components named `.graph-capture-permission-modal` and
`.graph-capture-issue-panel` — strong evidence this is a **normal, named status of the host's own
screen/tab-capture recording feature** (plausibly reporting that an automated/remote-controlled
browser session can't grant capture permission), not something this project's synthetic dispatches
caused. The same test page read `"Synced"` both before and after that entire later session (zero
tool dispatches at all). Treat the "leading suspect" framing above as superseded — the status is
most likely pre-existing/environmental, not caused by this repo's own tooling.

## Round 15: scoping the graph host's settings sweep, an action-button vocabulary, closing two round-14 open questions

Prompted by Kresna asking whether this project could work on a specific new graph-session URL —
project "Mechanical Ductwork · b2026-08-12.15", a different page (`763230e6-...`) than round 14's.
It already did: the loader's readiness gate passed unchanged, and every `[data-tool]` value still
matched `GRAPH_TABLE`. The real gap was that this page is far larger than round 14's snapshot (46
`graph-`prefixed controls vs. round 14's ~43, six `<dialog>` modals, a scale/calibration toolbar, an
Advanced disclosure, ~20 action buttons with no vocabulary), which exposed a confirmed defect in the
settings filter and left two round-14 open questions finally answerable.

**Live findings.** With `route` armed: of 46 `graph-`prefixed controls, the old visibility-only
filter listed **18** as `route.`'s params — but only 8 are real (`system-select`, `profile`,
`width-input`, `height-input`, `elevation-input`, `level-select`, `insulation-select`,
`liner-select`). The leak had three causes: `graph-scale-target`/`graph-route-anchor` live in the
canvas toolbar (`<aside aria-label="Duct graph tools">`), not the inspector
(`<aside aria-label="Duct graph inspector">`); `graph-new-system-service` belongs to the inspector's
own "New system" creator block, not to any tool; and all 7 controls under the collapsed "Advanced
(pressure, material, seams, gauge...)" `<details>` passed the visibility check even while shut. A
fourth leak was latent, not observed: the six checkpoint/scale `<dialog>` modals carry their own
`graph-*` ids, which would pollute the list the moment one opened.

**Implementation — the settings filter.** `GRAPH_PARAM_SCOPE` (a new per-host config object,
`RW_IS_GRAPH ? GRAPH_PARAM_SCOPE : null` as `PARAM_SCOPE`) replaces the old inline
`RW_IS_GRAPH && !visible` check with a single predicate, `cmdParamAllowed(el)`, applied inside
`RW._cmdToolSettingsList`. It scopes to the real inspector aside (found by
`aside[aria-label="Duct graph inspector"]`, re-resolved every call), respects a shut `<details>`
ancestor (walked via a hand-rolled `cmdAncestorByTag`/`cmdIsWithin` — this project's own DOM test
stub has no `closest()`/`contains()`, only `parentNode`, so the production code uses only that,
unchanged across both the stub and a real browser), excludes anything inside a `<dialog>`, and
carries two named, commented exclusions (`graph-scale-target`/`graph-route-anchor` — belt-and-braces
documentation, since the aside-scoping already excludes them; `graph-new-` prefix, the pragmatic part,
since the "New system" creator block has no id or `<details>` to key off structurally). Returns
`null` immediately when `PARAM_SCOPE` is `null` (the annotate host), so nothing there changes —
confirmed by a new tripwire test (194) with no inspector aside anywhere and `offsetParent` left
unset. The predicate doubles as `RW._cmdParamScopeDiagnose()`, a new read-only probe (same spirit as
`RW._toolSettingsDiagnose`/`RW._panDiagnose`) reporting `{id, allowed, rejectedBy}` for every
`graph-` control — live output below.

A shut disclosure is a listing concern, not a write gate: `RW._cmdApplySetting` now auto-expands the
ancestor `<details>` (click the `<summary>` first — a real one natively toggles its parent; a direct
`.open = true` fallback for the stub, whose `click()` doesn't) before writing, and says so in the
status. `RW._cmdToolCollapsedGroups(tool)` surfaces that more params exist behind a shut group
without ever including or expanding them unasked; `onInput`'s `<tool>.` listing appends a one-line
hint when a collapsed group exists. `CONFIRMED_WRITE_IDS` (see below) replaces the old single inline
`id === 'magic-wand-tolerance'` comparison with a named, extensible set, and the "confirm it
actually applied" hedge is now gated by it uniformly across all three control types (number, select,
checkbox), not just number as before.

**Live-verified** (project "Mechanical Ductwork · b2026-08-12.15", the round-15 page,
`#graph-save-status` reading "Synced" throughout, `pageEntities`/`history` staying `0` for every
check below): `route.` lists exactly the 8 real params; `{includeCollapsed:true}` lists 15 (the 8
plus the 7 Advanced ones), each stamped with the real `<summary>` text via
`RW._cmdToolCollapsedGroups`; `RW._cmdParamScopeDiagnose()` across all 46 controls reports 8
allowed and the rest split `hidden:5, collapsed:7, inside-dialog:23, excluded-id:2,
excluded-prefix:1` — the dialog count alone (23) is why the `<dialog>` exclusion matters, not just a
theoretical latent leak. Writing `route.gauge-select = 24ga` (a genuinely-collapsed Advanced param)
auto-expanded the real `<details>` and applied; reverted to `"auto (by standard)"` afterward.

**Implementation — the action-button vocabulary.** `RW.runCommand` already carried a complete but
unused `btn`/`armed`/`disarm` dispatch path (kept "for a future native armed() pass" per its own
comment) — reused rather than building a new mechanism. A new `kind:'action'` (constant `ACTION`)
and a `GRAPH_ACTIONS` table (concatenated onto `GRAPH_TABLE` only when `RW_IS_GRAPH`) declare 17
entries by `{name, aliases, btn, conditional?, modal?}`. Because the button path sits outside
`if (entry.run)`, none of the void-tracking/`_cmdToolArmed`/`_cmdModeActive`/`_cmdLastTool`
bookkeeping runs for an action — clicking Undo can never be mistaken for arming a tool nor become
Space's repeat target, confirmed by test 201 with no new code needed for it. The path was hardened to
report *why* a button was skipped rather than silently clicking (or not clicking) it: a real
`disabled`/`aria-disabled="true"` button ("not available right now") vs. a `display:none` one ("not
on the page right now") — this page uses both idioms (`graph-finish-route`/`graph-cancel-route` are
visible-but-disabled while idle; `graph-assign-network`/`graph-toggle-damper` are
hidden-but-enabled with nothing selected). `FORBIDDEN_BUTTON_IDS`
(`graph-save-commands` + all four recording buttons) is checked in code inside `RW.runCommand`
itself, not left as an omission from the table — belt-and-braces so a future careless table edit
can't reopen the boundary (test 206 injects a fake entry targeting `graph-save-commands` and
confirms the refusal). A modal-opening action (`calibrate`, `setscale`) names the dialog it opened
in its status, only when that dialog element actually exists on the page.

Because this round's own vocabulary opens `<dialog>` modals, the existing global auto-capture
keydown listener (which seeds the command bar from anywhere) now bails out while one is open — a
plain early return, not a consume (no `preventDefault`/`stopImmediatePropagation`), so the app's own
modal keyboard handling runs untouched. Gated on `RW_IS_GRAPH` (test 204 confirms an identical
`<dialog>` decoy on the annotate host still captures normally).

**The auto-submit boundary — a scope decision made explicitly with Kresna mid-round.** A deep read of
the graph session's own JS bundle (`graph-session-entry.js`, fetched from the public static root,
~755KB unminified) found this app has **no manual-commit mode at all**: `CommandJournal.enqueue()`/
`.submit()` auto-flush to the server within a 300ms debounce / 2000ms max-wait regardless of the Save
button, which is a force-flush/retry control, not a commit gate — `visibilitychange→hidden`,
undo/redo, and route-finish all force additional flushes on top of that. So every action-button
candidate *except* `zoomfit`/`zoomin`/`zoomout`/`ruler` submits its own real command
(`UndoGraphCommand`, `RouteDuctRiser`-adjacent dialogs, `AttachDuctEvidence`, `AssignDuctSystem`,
`CreateDuctSystem`, `RenameDuctSystem`, …) the instant it's clicked — the same as a human clicking
that same button by hand, not a "pending, unsaved" edit the way drawing normally works. Presented
with this, Kresna's instruction was: **exclude only the "System / network" and "New system"
property-group actions** (`AssignDuctSystem` via `graph-assign-network`, `CreateDuctSystem` via
`graph-create-system`, `RenameDuctSystem` via `graph-rename-system`) **and implement everything
else**, accepting that each remaining action auto-submits on invocation. `GRAPH_ACTIONS` reflects
exactly this: no `network`/`newsystem`/`rensystem` entries exist at all.

**Verification.** `node --check` clean on all four modules; `node verify_cmdline.js`: **578 passed, 0
failed** (500 before this round + 78 new: 188–195b for the settings scope, 196–206 for the action
vocabulary, all annotate-regression tripwires included). Loader rebuilt clean (140720 bytes). Live,
on the round-15 URL: host detected `graph`, `RW._cmdTable.length === 28` (11 tools + 17 actions);
`zoomin`/`zoomout`/`zoomfit` all moved the real `#graph-zoom-readout` (177%→221%→177%→100%) with
`pageEntities`/`history` staying `0` throughout; `finish`/`cancel` (route idle, visible-but-disabled)
and `toggledamper`/`elevation` (hidden, nothing selected) each returned `false` with the correct
disabled/hidden status text, never clicking; `runCommand('save')` — not a real command name, since no
table entry targets `graph-save-commands` — confirmed absent from the table entirely.

**Round-14 open questions this page closes.** `#`-search against 30 systems (round 14's project had
exactly one, `"FPTU (Supply)"`): `RW._cmdDetectTags()` correctly found all 30, including genuine
duplicate option texts (`"Transfer Air"` appears six times with differing services); selecting a
different one of the duplicates via `RW._cmdSelectTag` took (confirmed via `.value` and the select's
own displayed option text), was reverted, and a full page reload confirmed nothing persisted —
`#graph-system-select`'s value matched the pre-test original exactly. Settings write-back beyond
`graph-width-input`: `graph-profile-select` (rectangular → round) was applied via
`RW._cmdApplySetting` and confirmed **independent of the DOM `.value` change** —
`window.__graphDebug.route.profile` itself flipped from `{shape:"rectangular",width_in:24,
height_in:12}` to `{shape:"round",diameter_in:4}`, and the inspector's own primary-dimension label
re-rendered (`"Width (in)"` → `"Diameter (in)"`) — added to `CONFIRMED_WRITE_IDS` accordingly, and
the hedge's actual absence from the status line (`"...set to \"round\" — re-armed route"`, no
`(confirm it actually applied)` suffix) was itself live-confirmed afterward, against a fresh
injection — see the operational finding right below for why that took a second attempt. Reverted
afterward either way.

**An operational finding about testing this project live via opencli, not about the app itself.**
Mid-round, repeated re-injections of the rebuilt loader onto the *same already-injected* page
appeared to silently stop taking effect — newly-added behavior (the hedge-drop above, in
particular) kept reading as absent no matter how long a wait was inserted first, even though the
transferred source was independently verified byte-correct each time and the injected script's own
completion promise resolved with no error. Root cause: `rw_cmdline.js`'s own top-level guard
(`if (RW.vcmd) return 'command line already installed';` — a real, pre-existing, deliberate
line, not a bug) makes every injection after the first a no-op for that module specifically, and
`RW.vcmd` lives on `window.__RW`, which survives a same-URL `opencli browser <session> open <url>`
call — that call turned out to be a no-op for JS-context purposes when the URL doesn't change,
*not* a real page reload, so `window.__RW` was never actually cleared between attempts. A
genuinely different-URL navigation (e.g., to the project page, then back to the session URL) does
force a fresh JS context, confirmed via `typeof window.__RW` reading `"undefined"` right after.
**Practical rule for next time: to re-test a code change on a project already carrying this
family's injected script, navigate away to a different URL and back (or otherwise force a hard
reload) before re-injecting — do not assume "open" on the same URL cleared anything.** One real
side effect surfaced by the many redundant re-injections this caused: `#graph-save-status`
transiently read "Capture issue" partway through that testing burst (`pageEntities`/`history`
stayed `0` throughout, so nothing was actually created or lost). A clean, single injection against
a freshly-forced-reload page — the same sequence of writes repeated end to end — read "Synced"
throughout with no recurrence, so this is not attributed to anything in this round's own feature
code; it is most likely the repeated partial re-execution of `rw_panelux.js`'s/`rw_core.js`'s own
setup (neither carries as strict a re-entry guard as `rw_cmdline.js`'s `RW.vcmd` check) stacking up
across many redundant injections in one session, consistent with the `boon-tagger-darkmode`
correction already on record above that this status is normal/environmental rather than something
this project's dispatches cause — but treat that as reinforced, not independently re-proven, since
this round's own testing pattern is itself a novel way to have triggered it.

**Not live-verified this round:** whether `RW._cmdApplySetting`'s write-back is confirmed for any
graph-host control of the checkbox type (no checkbox write was tested live this round — `insulation`/
`liner` are selects, not checkboxes, on this page); the disabled-vs-hidden idiom was confirmed for
exactly the four buttons tested above, not all 17 `GRAPH_ACTIONS` entries individually; `evidence`/
`note`/`rationale`/`calibrate`/`setscale`/`resetscale`/`region`/`ruler`/`undo`/`redo` were verified
functionally in the Node harness (click mechanics, disabled/hidden reporting, the forbidden-id guard)
but deliberately **not** clicked live on this page, since each auto-submits a real command against
real project data — the harness coverage was judged sufficient without exercising that against a live
job.

## Round 16: reported live — tool-switch commands silently failed to arm; action commands worked fine

Kresna live-tested round 15's build themselves and reported: `route`/`flex` (and, by inspection, every
other native tool-switch command) did not activate, while `undo`/`redo` (and, by inspection, every
other action command) worked. This pointed straight at the one structural difference between the two
command kinds — a synthetic keydown dispatch vs. a real button click — rather than at anything
specific to any one tool or action.

**Root cause.** The graph app's own keydown handler refuses to switch tools whenever
`document.activeElement` is an `INPUT`/`SELECT`/`TEXTAREA` — its own guard against a real typed
shortcut hijacking a form field the user is typing into (found in the graph session's own JS bundle
during round 15's read of it, `graph-entry.js`'s main shortcut handler). `#rw-cmd-input`, this
project's own command bar, is exactly that kind of element while a command is being typed or
confirmed. Every call site that runs a command (`runAndClear`, the Space-repeat listener, ...) blurred
the input **after** calling `RW.runCommand()` — by which point a tool-switch entry had already
dispatched its synthetic keydown and been silently ignored, while an action entry's plain `btn.click()`
never depended on focus at all, so it kept working regardless.

**Fix.** `RW.runCommand` now blurs `inputEl` unconditionally as its first action, before dispatching
anything (key or click) — one change covers every call site, rather than reordering each one
individually. Unconditional rather than gated on `document.activeElement === inputEl`, since
`document.activeElement` isn't something this project's own Node test harness models; `blur()` is a
harmless no-op when the input isn't focused, in both a real browser and the harness stub.

**Verification.** `node --check` clean; `node verify_cmdline.js`: **582 passed, 0 failed** (578 before
this round + 4 new — a graph-host test asserting the input is already blurred at the exact moment a
tool-switch key is dispatched, checked from inside the dispatch callback itself since the harness has
no `document.activeElement`; an annotate-host counterpart confirming the same fix is a harmless no-op
there). Loader rebuilt (142104 bytes). **Live-verified** on the round-15 URL, after a genuinely fresh
page load (see round 15's own operational finding about same-URL "reload" not clearing
`window.__RW`): focused `#rw-cmd-input`, then ran `flex` while it was still focused —
`__graphDebug.activeTool` flipped from `route` to `flex` (previously: no-op) — then reverted to
`route`. `pageEntities`/`history` stayed `0` and `#graph-save-status` read "Synced" throughout.

## Round 17: isolating the command line to the armed tool — graph host only, reverses round 5b there

Kresna asked that route/flex/extend/and-friends stop being freely switchable while one is already
armed: "we are still given the option to select and edit other tools. I want it to be isolated to
only able to select and edit properties." Round 5b (above) had deliberately decided the opposite —
"additive, not exclusive" — for the annotate host's wand/wrap/mline, confirmed by `AskUserQuestion`
at the time. This round reverses that decision, but **only on the graph host**; the annotate host's
own settings-blend behavior is untouched.

Three follow-up questions, all confirmed via `AskUserQuestion`: (1) while a duct tool is armed, what
should still be reachable besides its own properties — the answer was the active tool's properties,
the ways out (`select`/Escape/Space), **and** the route-lifecycle actions `finish`/`cancel`, but
nothing else (no other action buttons, no `#` search); (2) which host — graph only, not annotate;
(3) what happens if a blocked tool's name is typed anyway — refuse it with a status message, not a
silent no-match.

**Mechanism**, all in `rw_cmdline.js`:

- `RW._cmdIsolatedTool()` — returns the armed tool's own name when isolation should apply (graph
  host, hatch on, something other than `select` armed and readable), else `null`. Reuses
  `RW._cmdActiveSettingsTool()` rather than re-deriving anything from `readTool()`. Fails open
  (`null`) on anything it can't confirm — an unreadable `activeTool`, the annotate host, or the new
  `RW._cmdIsolateTools = false` console escape hatch — the same fail-safe convention
  `RW._cmdAutoSelect` already established, so a bad read can never lock the command line down.
- `GRAPH_ISOLATION_ALLOWED = ['select', 'finish', 'cancel']` — the fixed allowlist, checked in three
  places in `onInput()` (the plain-command branch, the `#` branch, and the `<tool>.` drill-in
  branch) and once more in `RW.runCommand` itself as the enforcement floor — following the same
  precedent `FORBIDDEN_BUTTON_IDS` set: refuse in code, not just by omitting it from what the
  dropdown lists, so a direct console call to `RW.runCommand()` can't bypass it either.
- The one load-bearing exemption: `entry.name !== iso` in `RW.runCommand`'s new guard. Without it,
  `RW._cmdApplySetting`'s own re-arm (`RW.runCommand(tool)`, called after every property write)
  would be refused by the very guard meant to isolate that same tool — every property edit would
  silently stop re-arming the tool it just edited.
- The refusal status message only fires once something's actually been typed (`v` non-empty) in the
  plain-command branch — an empty query (e.g. backspacing the bar back to empty) still renders the
  allowed rows quietly rather than re-announcing the refusal on every keystroke.
- Nothing needed to change for Escape/Space: both close via `RW._cmdGoSelect`, which dispatches
  `select` directly through `RW._cmdDispatchAppKey` and never goes through `RW.runCommand` at all —
  confirmed by reading the code, not assumed.
- **Accepted edge**, same shape as round 5b's own accepted edge: isolation reads the app's real
  `__graphDebug.activeTool`, while Space-repeat still branches on the command line's own
  `RW._cmdToolArmed` belief. If a tool was armed by clicking the app's own toolbar directly (the
  existing documented blind spot), Space-repeating a *different* remembered tool is now refused
  instead of silently switching — which is the isolation behavior asked for, not a new bug; the
  refusal's status message explains it either way.

**Verification.** `node --check` clean; `node verify_cmdline.js`: **607 passed, 0 failed** (582
before this round + 25 new): `RW._cmdIsolatedTool()` for the armed tool, `select`, an unreadable
`activeTool`, and the annotate host; a blocked tool name matching nothing with the refusal status;
the isolated tool's own bare params and `route.` drill-in still working while a different tool's
`grd.` drill-in is refused; `select`/`finish`/`cancel` still matching; `#` search refused;
`RW.runCommand` refusing a blocked tool directly (no key dispatched) while still allowing the
isolated tool's own re-arm; `RW._cmdApplySetting`'s real write-and-rearm still working end-to-end
under isolation; Escape/Space still reaching select; and `__RW._cmdIsolateTools = false` restoring
the old additive behavior. Every pre-existing test, including round 5b's own annotate-host additive
proof, passed unchanged. Loader rebuilt (146432 bytes).

**Live-verified** via the opencli browser bridge, on a real graph session (`TestNew` project, a
page with `route` already armed on load). The rebuilt loader was too large for `opencli eval`'s
own argument-length limit to paste directly (~146KB hit "Argument list too long" past roughly
60–140KB, well under the OS `ARG_MAX` — an `opencli`-side limit, not a shell one); worked around by
base64-chunking it into `window.__loaderB64` across four `eval` calls, then decoding
(`atob` + `TextDecoder('utf-8')`, needed because the source's own em dashes are multi-byte UTF-8)
and `eval`-ing the reassembled source in one final call. Confirmed live: `RW._cmdIsolatedTool()`
returned `'route'`; typing `flex` matched nothing and the real `#rw-commit-status` element read
`route is active — press Escape or type "select" first to switch tools`; `route.` still listed all
8 of route's real live params (width/height/elevation/system/profile/level/insulation/liner);
`select`/`finish`/`cancel` still matched; `grd.` and `#` were both refused with the analogous
messages ("...to reach grd's properties" / "...to search systems"); `RW.runCommand('flex')`
returned `false` and left `__graphDebug.activeTool` at `'route'`; `RW._cmdGoSelect` still flipped
it to `'select'`; and re-arming `route` then applying `route.width-input = 24` (its own already-current
value, chosen deliberately so the live write-test made no real change to this shared test project)
went through end-to-end — the control's value stayed `24`, `__graphDebug.activeTool` stayed
`'route'`, and the status line read `route.width-input set to 24 — re-armed route (confirm it
actually applied)`, all under isolation.

## Round 18: choosing system/network, profile, diameter, elevation while a duct tool is armed

Immediate follow-up to round 17. Kresna asked to be able to "choose the system/network, profile,
diameter, elevation" while a tool is active — a request that, live-tested first rather than
assumed, turned out to be already three-quarters true: round 17's isolation restricts *other*
tools/actions/`#` search, never the armed tool's own properties, and `system-select`,
`profile-select`, and `elevation-input` were all already reachable bare or via `route.` (confirmed
live before writing any code — `RW._cmdToolSettingsList('route')` already listed all three).
`AskUserQuestion` narrowed the real gap down to one thing: typing the literal word "diameter"
matched nothing, because route's own diameter field is the *same* DOM element as its width field
(`graph-width-input`) — the real app just relabels it live, on screen, from "Width (in)" to
"Diameter (in)" the instant the route's profile is switched to round (confirmed via opencli
inspection of the real markup: `<label><span>Width (in)</span><input id="graph-width-input">
</label>`, the span's text flipping with no id change at all) — and this project's param matching
has only ever kept the fixed id-derived name (`width-input`), never the label. Kresna's own
follow-up note ("dont forget height") pointed at the right-shaped fix: not a `diameter` special
case bolted onto `width`, but a general mechanism that reads whatever the app is *currently*
showing, which then naturally covers "network" (route's system field's own live label reads
"System / network", so the second word needed matching too, not just "system") and "height" (already
covered by the pre-existing id match, must not be disturbed by the new one) alike.

**Mechanism**, all in `rw_cmdline.js`:

- `cmdControlLiveLabel(el)` — walks up to the nearest `<LABEL>` ancestor (`cmdAncestorByTag`,
  already used by round 15's collapsed-group detection) and returns its first child `<SPAN>`'s
  text, read fresh every call, never cached — confirmed live this is the real markup convention
  for every inspector field, not just the dimension ones. Manual `.children` walking, not
  `.querySelector('span')`: the Node test stub's `querySelector` only supports a plain `#id`
  selector, and this must run unchanged against both.
- `cmdLabelWords(label)` — splits a label into lowercase words ("System / network" ->
  `['system','network']`) so a query can prefix-match any one of them, not just match the whole
  string as one unit.
- `cmdParamMatchesQuery(item, q)` — the one predicate now shared by both places a query was
  matched against a settings item (the `<tool>.` drill-in filter and the bare-param blend in
  `onInput()`, previously two near-identical inline `.indexOf(q) === 0` checks on `item.param`
  alone): matches the id-derived `param` (unchanged) **or** any word of the live `label` (new).
  Purely additive — nothing that matched before stops matching.
- `RW._cmdToolSettingsList` now stamps every item with `item.label = RW_IS_GRAPH ?
  cmdControlLiveLabel(el) : null` — deliberately `null` on the annotate host rather than assumed
  to apply there too, since wand/wrap/mline were never confirmed to share this same
  `<label><span>` convention.
- `renderMenuRows` now displays `item.label || item.param` for a settings row, not `item.param`
  alone — so a row reached by typing "diameter" reads "Diameter (in) (4, now 4)", never the
  internal "width-input" that would read as a mismatch/bug even though it was functionally
  correct. `item.param` itself is untouched and still the one thing `RW._cmdApplySetting`/Tab-fill
  key off of — the live label is a display and matching alias only, never a new identifier.

**Verification.** `node --check` clean; `node verify_cmdline.js`: **616 passed, 0 failed** (607
before this round + 9 new, via a new `makeGraphField(byId, labelText, control)` test helper
building the real `<label><span>...</span>CONTROL</label>` structure): "diameter" not matching
route's width control while its live label reads "Width (in)", matching once the label is changed
to "Diameter (in)" (simulating the app's own real relabel) with "width" still matching the same
control by id either way, and the row displaying the live label rather than the id; "network"
matching the system field by its label's second word with "system" still matching by id too; a
control with no `<label>` ancestor at all falling back to its id-derived name for both matching
and display, unchanged from before this round; and an annotate-host tripwire proving `item.label`
stays `null` there even behind an identical decoy `<label><span>` wrapper, so "diameter" cannot
accidentally match wand's tolerance control. Loader rebuilt (149952 bytes).

**Live-verified** via the opencli browser bridge, same `TestNew` project/session as round 17. One
operational snag reused from round 16's own documented caveat, now hit directly rather than just
cited: re-running `eval` of the freshly rebuilt loader against the *same, not-yet-reloaded* page
silently kept the OLD code running — `rw_cmdline.js`'s own `if (RW.vcmd) return 'command line
already installed';` version-gate (every module has one) refused to reinstall over an existing
`window.__RW`, so the first re-verification attempt showed no change at all. Fixed by
`location.reload()` in the page (a genuine browser-level reload, not a same-URL SPA
"navigation," which this project's own docs already note does not reliably clear `window.__RW`)
before re-uploading, which produced a truly fresh `window.__RW` and the real behavior. Confirmed
live: with route armed and profile rectangular, `network`/`system` both matched and displayed
"System / network", `diameter` matched nothing, `width`/`height` matched and displayed "Width
(in)"/"Height (in)"; after switching profile to round (via the pre-existing `route.profile-select`
mechanism, itself unaffected by this round), `diameter` and `width` both matched the same control
displaying "Diameter (in) (4, now 4)", and `height` correctly stopped matching anything (the field
is genuinely gone in round profile, not merely relabeled). Profile was switched back to
rectangular afterward, restoring the test project to the state it was in before this session.

## Round 19: the four per-tool config-dialog modals (branch fitting, change size, GRD placement, riser elevation), their own commands, and "New system" fields

Kresna added a real duct segment to the `TestNew` test session and found that clicking it (Select
mode, "Tap in (branch)") opens a **"Branch fitting" popup** — a real `<dialog>` with its own fields
(Fitting type, Branch shape, flush-boot glyph, Starting width, Alignment, Width/Height, Damper) —
and none of it was reachable from the command line: round 15 deliberately excluded anything inside
a `<dialog>` from the settings sweep, so typing `branch.` listed nothing. Live investigation (via
the opencli browser bridge) found this is one of a family of **four identically-structured modals**,
one per tool, all following the same `<label><span>Live label</span><control></label>` convention
the ordinary inspector already uses — so round 18's live-label matching applies unchanged: **branch
fitting** (`graph-branch-fitting-modal`), **change-size/transition**
(`graph-checkpoint-transition-modal`), **GRD placement** (`graph-checkpoint-grd-modal`), and **riser
elevation** (`graph-checkpoint-riser-modal`). Kresna confirmed via `AskUserQuestion` that all four
should get the same treatment, that each modal's own Choose/Cancel-equivalent buttons should become
typeable commands too, and that the inspector's existing "New system" fields (name + service,
excluded by the same round-15 rule) should also become selectable/typeable — while its "Add" button
stays a manual click.

Two live checks resolved the design's real risk before writing any code: the dialogs are **not**
`showModal()`-modal (`dialog.matches(':modal')` is `false`), and `#rw-cmd-input` can be focused and
typed into while one is open — the only thing blocking that was this project's own global
auto-capture bail-out (`cmdOpenDialogs().length`), not the app.

**Mechanism**, all in `rw_cmdline.js`:

- `GRAPH_TOOL_MODALS` — the new tool -> modal registry (dialog id, id prefix, human title).
  `cmdOpenToolModal(tool)` returns `{tool, dialog, prefix, id, title}` only when that tool has an
  entry **and** its dialog is genuinely open (reuses `cmdOpenDialogs()`'s own open-check rather than
  duplicating it), else `null` — so "no recognized modal open" behaves byte-identically to every
  prior round for every other tool, and for these four while closed. `cmdOpenModalTool()` is the
  companion that returns which tracked tool (if any) currently has its own modal open, used as a
  fallback so bare-param blending still works even where `RW._cmdActiveSettingsTool()`'s
  `readTool()` doesn't report the modal's own owning tool.
- `cmdParamAllowed(el, modal)` — threaded a second, optional parameter through rather than forking a
  parallel path. When a modal is passed, the `excludeInsideTags` DIALOG check and the ordinary
  inspector-scoping check are both replaced by one `cmdIsWithin(el, modal.dialog)` check; every
  other rule (`excludeIds`, `excludeIdPrefixes`, `cmdCollapsedGroup`, `cmdIsVisible`) still applies
  unchanged inside the modal too — which is what makes branch's own conditionally-visible fields
  (flush-boot glyphs shown only for certain type+shape combos; the secondary dimension hidden for
  round) work correctly with **zero** new logic, live-confirmed via `graph-branch-fitting-rect-
  flush-boot` toggling purely off `offsetParent`. `modal` can only ever come from `cmdOpenToolModal`
  against one of the four hardcoded ids, so `graph-calibrate-modal`/`graph-known-scale-modal` keep
  failing on the ordinary inside-DIALOG path, unaffected.
- `RW._cmdToolSettingsList`/`RW._cmdApplySetting` both resolve `modal`/`prefix` fresh per call
  (`cmdOpenToolModal(tool)`, falling back to `entry.prefix`) — load-bearing for the apply path
  specifically, since reconstructing the id from `entry.prefix + param` alone would produce the
  wrong id (`graph-` + `type` = `graph-type`, which doesn't exist) the instant a param came from a
  modal's own listing. Listed items are stamped `item.modal = modal.id` when present.
  `RW._cmdParamScopeDiagnose` was updated the same way (a new `cmdModalForElement` helper resolves
  the owning modal per swept control) so it stamps `modal: <tool>` per row instead of blanket-
  reporting `inside-dialog`, which would otherwise be actively misleading for these four now.
- **Re-arm is skipped while a modal is open.** Each of `RW._cmdApplySetting`'s write branches used
  to end by calling `RW.runCommand(tool)` to re-arm; dispatching the tool's own key into an open
  `<dialog>` is untested and could as easily cancel/close it as do nothing, so a new
  `cmdArmOrNoteModal(tool, modal)` helper skips that call while a modal is open, stamping
  `RW._cmdLastUserCmdAt` directly instead (preserving the auto-select grace window a real re-arm
  used to provide) and reporting `'... — ' + modal.title + ' dialog still open'` in place of
  `'... — re-armed ' + tool`. Live-confirmed: writing `branch.primary-input` left the dialog open and
  `activeTool` unchanged, with the status naming the dialog, not "re-armed."
- **8 new modal-action commands**, appended to `GRAPH_ACTIONS` with no new dispatch mechanism
  (`RW.runCommand`'s existing button path already handles missing/disabled/hidden buttons): `choose`/
  `cancelbranch` (branch fitting), `apply`/`cancelsize` (change size), `place`/`cancelgrd` (GRD
  placement), `placeriser`/`cancelriser` (riser elevation). The `×` close buttons are deliberately
  not exposed — Cancel is a sufficient dismiss verb per dialog. All 8 are appended flat to
  `GRAPH_ISOLATION_ALLOWED` too, matching the existing `finish`/`cancel` precedent rather than
  scoping per-tool: typing `place` while `route` is isolated is harmless, since the GRD dialog isn't
  open and `RW.runCommand` just reports its button missing.
- **"New system" fields + text-input support.** `GRAPH_PARAM_SCOPE.excludeIdPrefixes` (`['graph-
  new-']`, round 15's wholesale exclusion) is now `[]` — `graph-new-system-name`/`-service` are
  deliberately re-admitted, while `graph-create-system` ("Add") stays out because it's a `<button>`,
  never swept by `cmdSweepControls` at all. `cmdSweepControls()` gained `'input[type="text"]'`
  (mirrored in `RW._toolSettingsDiagnose`'s own copy of the same list), `cmdControlType(el)` gained a
  `'text'` branch, and `RW._cmdApplySetting`/`renderMenuRows`/the free-typed-value status message all
  gained a matching `'text'` case (plain `.value =` write, no parse/clamp, no min–max range printed).
  Side effect, confirmed harmless and noted here: this also makes `graph-tag-input` ("Equipment
  tag") reachable, a genuine existing property never sweepable before.
- **Auto-capture bail-out narrowed** (round 15's `cmdOpenDialogs().length` blanket check) to bail
  only for a dialog **not** one of the four `GRAPH_MODAL_DIALOG_IDS` — calibrate/known-scale still
  bail exactly as before. **Plus a fix for a gap this round's own design surfaced**: the existing
  focus guard skips `INPUT`/`TEXTAREA`/contenteditable but not `SELECT`, so a recognized modal's own
  `<select>` (Fitting type, Branch shape, Alignment, Damper) having focus would otherwise have its
  keystrokes eaten into the command bar instead of reaching it — confirmed via `AskUserQuestion` and
  fixed with one added condition (`t.tagName==='SELECT' && cmdOpenModalTool()`), scoped narrowly so
  the inspector's own ordinary selects are unaffected.
- **Field ordering fix (Kresna's own feedback after first trying the branch-fitting listing live):**
  `cmdSweepControls()` used to run five separate `querySelectorAll` passes, one per input type
  (`range`, `number`, `checkbox`, `text`, `select`), and concatenate the results — so every listing
  read out grouped by control type (all ranges/numbers first, then the checkbox, then any text
  input, then every select), not in the order the fields actually appear on screen. This was invisible
  until a real modal mixed types: branch fitting's own visual order is select, select, number,
  select, number, number, checkbox (Fitting type, Branch shape, Starting width, Alignment, Width,
  Height, Damper), which the old grouped sweep reordered to Starting width, Width, Height, Damper,
  Fitting type, Branch shape, Alignment. Fixed by combining the five selectors into one comma-
  separated `querySelectorAll` call, which returns every match in a single real document-order pass
  — the same fix applies to every tool's listing, not just branch's, since it's a property of
  `cmdSweepControls` itself. `RW._toolSettingsDiagnose`'s own copy of the selector list was
  deliberately left as five separate calls — that function groups by type on purpose, for comparing
  same-kind controls by eye in a console table dump, and isn't the thing that feeds any listing a
  user actually types against. The synthetic test harness's own `matchesSelector` stub didn't support
  comma-separated selector lists (real browsers do) — extended it to split on top-level commas and
  match if any branch matches, mirroring `Element.matches()`'s own selector-list semantics, otherwise
  every `cmdSweepControls()` caller would've silently swept nothing at all in tests.

**Verification.** `node --check` clean; `node verify_cmdline.js`: **706 passed, 0 failed** (624
after the reversal below + 82 new, via a new `makeGraphModal(win, byId, id, open)` fixture reusing
`makeGraphField`): a modal-open listing surfaces only that modal's own fields stamped with
`item.modal`; falls back to empty once closed; a different tool's query never sees another tool's
open-modal fields; calibrate/known-scale stay excluded from every graph tool's listing (test 192
unmodified, plus a new loop across all 10 real tools); branch's conditional field toggles purely off
`offsetParent`; `RW._cmdApplySetting` on a modal param writes the real control without calling
`RW._cmdDispatchAppKey`, still stamps `_cmdLastUserCmdAt`, and names the dialog instead of "re-
armed"; the same call fails cleanly with the modal closed; all 8 new commands click their real
button when present and report the conditional hint when absent; the isolation allowlist admits all
8 while their own tool is isolated, and `place` is *not* refused while a *different* tool (`route`)
is isolated (pins the flat-list decision); a text-type write sets the exact string with no numeric
parsing and renders as `(text, now "…")`; `graph-create-system` never gets a table entry; and the
auto-capture/SELECT-focus tests above; plus one new test built on a realistic interleaved-type
branch fixture (select, select, number, select, number, number, checkbox) asserting the listed
labels come back in that exact DOM order, pinning the field-ordering fix. **Test 193 is reversed in
place** (it used to assert `graph-new-system-service` was excluded; round 19 asserts the opposite,
per Kresna's own instruction) with a comment naming round 19 as the reversal. Loader rebuilt (164010
bytes).

**Live-verified** via the opencli browser bridge, same `TestNew` project/session. Drew a real duct
segment (route, two clicks, `finish`), selected it, and used the app's own real "Tap in (branch)"
click-menu to open the branch-fitting modal for real — confirmed `__graphDebug.activeTool` reads
`'branch'` while it's open, `branch.` lists all 7 real fields with live labels
(`starting-width-input`/`primary-input`/`secondary-input`/`type`/`shape`/`alignment`/`damper`), a
write via `RW._cmdApplySetting` landed on the real control without re-arming (status: "branch
fitting dialog still open"), `choose` clicked the real submit button and closed the dialog (and,
followed by a click on the canvas, genuinely placed the fitting — `pageEntities` went from 1 to 3),
and `cancelbranch` closed a re-opened instance. **Also armed and placed a real riser** (`vertical`
tool, click on canvas) — this resolves round 19's own previously-unconfirmed mapping:
`__graphDebug.activeTool` reads exactly `'vertical'` while its modal is open, `vertical.` correctly
lists its one real field (`elevation-input`, live label "Destination elevation (ft)"), and
`cancelriser` closed it. Also confirmed live: `graph-new-system-name`/`-service` are real elements
already on the page, `route.` now lists both (the name field typed `'text'`), a text write landed
verbatim with no numeric parsing, and `graph-create-system` has no table entry; typing a real
keydown while the branch-fitting modal was open **did** seed the command bar, the same keydown
targeted at the modal's own `<select>` did **not**, and a non-recognized dialog (calibrate) still
bailed exactly as before. **Not reached live this round**: the end-user action that opens the
change-size/GRD modals — every attempt (clicking along a selected duct segment with `transition`
armed, at several points, plain and double-click) left `__graphDebug.activeTool` on `transition`
without ever opening `graph-checkpoint-transition-modal`, so this remains exactly the open item
`PLAN.md`'s own design research already flagged; this doesn't bear on the mechanism itself (identical
code path to branch/riser, both confirmed) — only on how to trigger it for a future live check. One
live mistake, caught and undone: forcing `graph-branch-fitting-modal.open = true/false` directly via
DOM (rather than through the app's own click-menu) left the app's internal "current placement mode"
stuck on `'branch'`, refusing to switch tools even via a real click on the Select toolbar button —
recovered by a genuine cache-busted reload (a same-URL "navigation" does **not** reliably clear
`window.__RW`, per this file's own round-18 note), which also confirmed the test duct/branch/riser
drawn during this session never actually persisted server-side (`pageEntities` was back to `0`).

**Round 19 follow-up — two live-testing observations from Kresna, both fixed:**

1. **Field ordering.** `cmdSweepControls()` ran five separate `querySelectorAll` passes (one per
   input type) and concatenated the results, so every listing read out grouped by control type — all
   ranges/numbers first, then the checkbox, then any text input, then every select — rather than in
   the order the fields actually appear on screen. Invisible until a real modal mixed types: branch
   fitting's own visual order is select, select, number, select, number, number, checkbox (Fitting
   type, Branch shape, Starting width, Alignment, Width, Height, Damper), which the old grouped sweep
   reordered to Starting width, Width, Height, Damper, Fitting type, Branch shape, Alignment. Fixed
   by combining the five selectors into one comma-separated `querySelectorAll` call, which returns
   every match in a single real document-order pass — applies to every tool's listing, not just
   branch's, since it's a property of `cmdSweepControls` itself. `RW._toolSettingsDiagnose`'s own
   copy of the selector list was deliberately left as five separate calls, since that function groups
   by type on purpose for comparing same-kind controls by eye in a console table dump. The synthetic
   test harness's own `matchesSelector` stub didn't support comma-separated selector lists (real
   browsers do) — extended to split on top-level commas and match if any branch matches, mirroring
   `Element.matches()`'s own semantics. New test (237) pins the exact order on a realistic
   interleaved-type branch fixture.
2. **Isolation ("only related commands") now also covers change-size/GRD.** `RW._cmdIsolatedTool()`
   used to read only `RW._cmdActiveSettingsTool()` — which happened to already work for branch and
   riser (both confirmed live to flip `activeTool` correctly) but left isolation off entirely for
   change-size/GRD, whose `activeTool` mapping was never confirmed: with one of those two modals open
   and `activeTool` unreadable, the full, unrelated command list stayed additively reachable instead
   of narrowing to that modal's own fields/actions — the opposite of what Kresna observed (correctly)
   for branch and wanted for every modal. Fixed with the same fallback already used for bare-param
   blending: `RW._cmdActiveSettingsTool() || cmdOpenModalTool()`. This reverses round 19's own
   original, more conservative call ("isolation must keep failing open off the single existing
   signal") — but a real open `<dialog>` is at least as trustworthy a signal as `activeTool`, so this
   isn't a weaker fail-safe, just a second way to reach the same confirmed-open state. New test (238).
3. **Escape now confirms on the status line.** Physical Escape (`RW._cmdEscapeHandler`) called
   `RW._cmdGoSelect('escape', true)` — `quiet=true` — so a real Escape that actually reverted an
   armed tool only ever logged to the console, never to the command bar, unlike typing "select"
   explicitly (which always reports its own dispatch, since `nativeKey`'s `run()` never passes
   `quiet`). Kresna asked for the same confirmation on Escape; changed to
   `RW._cmdGoSelect('escape', false)`. `RW._cmdGoSelect` already no-ops (no dispatch, no status) when
   nothing was armed to begin with, so this can't spam a confirmation for an Escape that had nothing
   to revert — pinned by new test 240 alongside the confirming case (239). The automatic poll-based
   revert (`RW._cmdGoSelect('poll', true)`) deliberately stays quiet, since it fires on a timer, not a
   user keypress.
4. **The very first Space now just opens the bar, instead of dumping every command.** The global
   auto-capture listener's Space handling has three branches — force-select-from-label, repeat the
   last tool, close the currently-armed one — but none of them fire the very first time anyone
   presses Space (nothing armed yet, `RW._cmdLastTool` never set). That case used to fall all the way
   through to the generic capture path at the bottom of the listener, which inserts the literal space
   character into the bar and immediately calls `onInput()` on it; `RW._cmdMatch(' ')` trims to `''`
   and returns the entire `RW._cmdTable` — every tool AND action together, not just tools — which
   Kresna reported reading as a confusing wall of unrelated commands the moment anyone hit Space to
   get started. First attempt at a fix suppressed the dropdown outright (`mountCommandBar()` + focus,
   nothing else) — Kresna's own follow-up ("the command list dropdown is not expanded") made clear
   the dropdown should still pop, just scoped correctly: this is "initialize the console," a starting
   menu of what can be armed, not the ordinary typed-query dropdown that blends tools and actions
   together. Corrected to a fourth branch, `!RW._cmdToolArmed && !RW._cmdLastTool`: mount the bar,
   focus it (no character inserted, so the input stays empty), then populate and render the menu
   directly from `RW._cmdTable.filter(entry => entry.kind === NATIVE).slice(0, 8)` — the tool
   vocabulary only, never `GRAPH_ACTIONS`' button vocabulary (undo/redo/finish/cancel/calibrate/the
   round-19 modal actions, all `kind: ACTION`). `RW._cmdTable`'s own declared order (tool table first,
   `GRAPH_ACTIONS` appended after) means the first 8 are always tools on both hosts, matching the same
   8-row cap every other command-mode listing already uses. Two existing tests (110, 111b) had pinned
   the old dump-everything behavior as a documented trade-off; both rewritten to expect the tool
   dropdown instead. New test 241 (graph host only, since the annotate table is 100% `NATIVE` and
   can't tell "filtered" apart from "whole table") pins that `undo` never appears in this starting
   menu while `route` does.
5. **The same "initialize the console" treatment while a config-dialog modal is open** ("I want that
   behaviour also be in branch mode"). Before this, Space while e.g. the branch-fitting dialog was
   open fell into the ordinary `RW._cmdToolArmed -> close` branch (branch is a real armed draw tool)
   and dispatched a synthetic select keydown at the app while its own modal was still up — never
   actually exercised against a live dialog, and not something to start depending on. Added a new
   branch, checked ahead of both the repeat and the close branches (same reasoning as the pre-existing
   `label` override): `if (cmdOpenModalTool())` — open the bar (no character seeded) and call
   `onInput()` directly on the empty value, which — via `onInput`'s own pre-existing isolated-tool
   blend — shows exactly what a typed empty query already would: that modal's own fields plus its
   allowed action commands (`choose`/`cancelbranch` for branch, and so on for the other three).
   Reusing `onInput()` rather than reimplementing the filter means this can never drift out of sync
   with what typing there shows. New tests 242 (the blend appears, no key dispatched) and 243 (pins
   that with no modal open, Space still closes the armed tool exactly as before — the new branch
   doesn't leak beyond "a modal is actually open").

`node verify_cmdline.js`: **721 passed, 0 failed**. Loader rebuilt (169044 bytes). Not yet
live-verified on a real page.

## Constraints (do not violate)

- **Console injection only.** `console_loader.js` (paste-per-page) is the only delivery
  mechanism.
- **The user base is annotators, not programmers.** Paste-and-go — no install steps, no config
  files, no build step on the annotator's end.
- **Mostly a tool-switcher, with one deliberate exception.** Every feature but one dispatches
  synthetic keydowns to make the host app switch its own current tool/mode — it never draws,
  submits, or otherwise touches annotation state itself. The exception is middle-mouse hold-drag
  pan (added in round 3 above): it writes `scrollLeft`/`scrollTop` directly on a page viewport
  element, because dispatching the app's own pan key would switch tools — which panning must
  specifically *not* do — and a synthetic `wheel` event can't cause real scrolling. This still
  never touches `annotationState` or anything under it; only the *mechanism* half of "purely a
  tool-switcher" is widened, and only for this one feature.

## Live-testing safety note

See the mask repo's own `CLAUDE.md` for the full account of a real live-testing incident (a
committed test annotation surviving a page reload without an explicit Save click) — the same
"don't assume a live test is inconsequential just because you didn't click Save" caution applies
here too, though this repo's own tools have never written annotation state directly.

## Open questions (not yet resolved — check here before assuming)

- Whether the defensive `d` prefix native draw-tool commands send is actually necessary (vs. the
  app's draw-mode tools already working from any mode).
- The real `annotationState.currentTool` strings for every native tool beyond `'bounding_box'`
  and (partially) `'ribbon'`/`'linear'` — needed for a future `armed()` predicate on native tools.
- Whether a plain property assignment on `annotationState.currentTag` (tag search's only
  selection mechanism, after the digit-hotkey path was removed in round 9) is actually picked up
  by the app's own UI/rendering.
- ~~The real DOM shape of wand/wrap/mline's own dedicated settings~~ — **resolved, round 5**: real
  ids/ranges confirmed live for all three tools' numeric params, and the write-back technique
  (`.value` + `input`/`change`) confirmed to actually take effect and persist, at least for
  `magic-wand-tolerance`. Narrower open items remain: whether the same write technique is
  sufficient for wrap's and mline's controls specifically (only wand's was individually tested),
  `ribbon-width`'s real max (none was found in the diagnostic sweep), and the still-unwired
  checkbox (`shrink-wrap-polygon-mode`) and select (`ribbon-anchor`) controls.
- The real, id-keyed shape of `annotationState.tagShortcuts` (confirmed live, see "Native-tools-
  only branch, round 2" above) is not wired into anything yet — noted as the reference shape if
  per-tag-shortcut dispatch by real id (not list position) is ever attempted.
- Whether native tool dispatch reliably works post-reload on every job — a real session found it
  worked before a page reload and stopped working after, root cause not isolated (see "Native-
  tools-only branch, round 2" above).
- Whether this app's viewport actually scrolls (so middle-drag pan's `scrollLeft`/`scrollTop`
  writes do anything) or pans via a CSS transform instead — run `RW._panDiagnose()` on a real page
  to find out before assuming either way (see round 3 above).
- Whether `annotationState.mode` really holds the values the auto-select feature assumes
  (`'pan'`/`'select'`/`'draw'`/`'label'`/`'crop'`/`'mirror'`), and specifically whether it's ever
  `'select'` — only `'draw'` has ever been observed live.
- Whether `annotationState.currentTool` ever actually clears itself to `null` when a shape
  finishes, or stays sticky until the app explicitly changes it — if it's sticky, the auto-select
  poll trigger is a harmless no-op rather than dead code, but this hasn't been distinguished live.
- Whether grab-and-drag's direction (`scrollLeft -= dx`, dragging right moves content right) feels
  correct on a real page, or needs `RW._panInvert = true` flipped.
- Whether the host app's own canvas mousedown handler checks `e.button` — if it doesn't, a
  middle-press with a draw tool armed could place a stray vertex; `RW._panStopHostEvents` (default
  `true`) guards against this by never letting the host see the middle press at all, but that
  guard's necessity has not been confirmed by deliberately disabling it on a real job.
- The real mechanism behind this app's own zoom (round 8) — CSS transform on some ancestor, a
  `<canvas>` redrawn at a different backing resolution, a PDF-library zoom API, or an
  `annotationState` field — is completely unknown. `RW._zoomDiagnose()` exists to answer this via a
  before/after diff around a manual zoom; nothing consumes its answer yet, since a self-implemented
  scroll-to-zoom (what's actually wanted, per direct user correction — no dispatch to the app's own
  zoom shortcuts at all) can't be built safely without knowing it first. **Update after round 11**
  (wheel navigation removed entirely): there is now *no* `wheel` listener anywhere in the injected
  code, so the round-10 collision concern (a document-level wheel listener hijacking page scroll)
  is gone — a future scroll-to-zoom can install its own wheel handling with a clean slate. Only the
  zoom-mechanism unknown above remains.
- ~~**(Round 14, graph host)** `#graph-save-status` flipped from "Synced" to "Capture issue" during
  live testing and did not clear on its own across multiple reloads~~ — **reinforced, not fully
  resolved, round 15**: the same status recurred mid-round, this time traced to a real testing-
  workflow pitfall (repeated re-injection onto an already-injected page without a genuine reload —
  see round 15's own account) rather than to anything in this project's command dispatches; a
  clean single injection with the identical writes read "Synced" throughout, with no recurrence.
  Combined with the `boon-tagger-darkmode` correction already on record above (real
  `.graph-capture-permission-modal`/`.graph-capture-issue-panel` components — a normal, named
  screen/tab-capture status), the balance of evidence is that this is environmental, not caused by
  this project — but it has now been *observed* twice under different circumstances, so treat
  "environmental" as the leading theory, not a closed case.
- ~~**(Round 14, graph host)** Whether `RW._cmdApplySetting`'s `.value` + `input`/`change` write-back
  is confirmed for any graph-host control beyond `graph-width-input`~~ — **resolved for
  `graph-profile-select`, round 15**: live-confirmed independent of the DOM `.value` change (see
  round 15's own account — `window.__graphDebug.route.profile` itself changed shape, and the
  inspector's dimension label re-rendered), added to `CONFIRMED_WRITE_IDS`. Narrower residue: no
  checkbox-type graph control has been individually confirmed yet (this page's checkbox-shaped
  facts, insulation/liner, are actually `<select>`s), and only these two ids total carry the
  confirmation — every other control, on either host, still carries the hedge.
- ~~**(Round 14, graph host)** Whether `#graph-system-select` selection is confirmed on a project
  with more than one system~~ — **resolved, round 15**: this page's project has 30, including
  genuine duplicate option texts (`"Transfer Air"` ×6 with differing services); selecting a
  different one of the duplicates took, was reverted, and a full reload confirmed nothing
  persisted server-side.
- ~~**(Round 15, graph host)** `RW._cmdParamScopeDiagnose`'s `excluded-prefix` rule
  (`graph-new-` — see round 15) is a naming-convention denylist entry, not a structural one~~ —
  **moot, round 19**: the `graph-new-` exclusion is gone entirely (Kresna explicitly asked for the
  "New system" name/service fields to become typeable); `graph-create-system` ("Add") needs no
  exclusion rule of its own since it's a `<button>`, never swept at all.
- **(Round 19, graph host)** The end-user action that opens the change-size/GRD-placement modals
  wasn't found live — every attempt (clicking along a selected duct segment with the tool armed, at
  several points, plain and double-click) applied nothing and never opened
  `graph-checkpoint-transition-modal`/`graph-checkpoint-grd-modal`. Doesn't bear on the mechanism
  itself (`GRAPH_TOOL_MODALS` treats all four modals identically, and branch/riser are both
  confirmed live) — only on how to trigger these two specifically for a future live check.
- **(Round 19)** None of the 8 new modal-action button ids or the "New system" fields are on
  `CONFIRMED_WRITE_IDS` — every modal write and every `graph-new-*` write still carries the
  "confirm it actually applied" hedge until individually live-tested beyond the one manual write
  already done for `graph-branch-fitting-primary-input`.
