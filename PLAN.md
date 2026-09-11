# Round 19: make each config-dialog fitting's own settings selectable/changeable from the command line

## Context

Kresna added a real duct segment to a live test session and pointed out that clicking it (in
Select mode, choosing "Tap in (branch)") opens a **"Branch fitting" popup** — a real `<dialog>`
with its own fields (Fitting type, Branch shape, flush-boot glyph, Starting width, Alignment,
Width/Height, Damper) — and none of it is reachable from the command line today: round 15
deliberately excluded anything inside a `<dialog>` from the settings sweep, so typing `branch.`
lists nothing useful.

Live investigation (via the opencli browser bridge) found this is one of a family of four
identically-structured modals, one per tool, that all follow the same DOM convention already
established for the ordinary inspector (`<label><span>Live label</span><input-or-select></label>`,
so last round's live-label matching applies unchanged): **branch fitting**
(`graph-branch-fitting-modal`), **change-size / transition** (`graph-checkpoint-transition-modal`),
**GRD placement** (`graph-checkpoint-grd-modal`), and **riser elevation**
(`graph-checkpoint-riser-modal`). Kresna confirmed (via `AskUserQuestion`) all four should get the
same treatment, that each modal's own Choose/Cancel-equivalent buttons should become typeable
commands too (not just its fields), and that separately, the inspector's existing "New system"
fields (name + service, currently excluded by the same round-15 rule alongside "System / network",
which already works) should also become selectable/typeable — but its "Add" button stays a manual
click.

Two live checks resolved the design's real risk before writing any code: the dialogs are
**not** `showModal()`-modal (`dialog.matches(':modal')` is `false`), and `#rw-cmd-input` can be
focused and typed into while one is open — the only thing currently blocking that is this
project's own global auto-capture bail-out (`cmdOpenDialogs().length` check), not the app. So the
full typed UX (fields *and* the new commands) is reachable once that bail-out is narrowed.

## Live-confirmed facts (all via opencli this session)

- `__graphDebug.activeTool` equals the owning tool's own `GRAPH_TABLE` name while its modal is
  open: confirmed for `branch`, `transition`, and `grd`. Not directly confirmed for `vertical`
  (riser) — assumed by the now-3-for-3 pattern, to be spot-checked during live verification.
- The exact end-user action that opens the transition/GRD/riser modals wasn't found live (plain
  clicks with those tools armed applied changes directly, no modal) — irrelevant to the
  implementation, which only reacts to "is this recognized dialog open," never to how it got that
  way.
- `graph-new-system-name` carries an explicit `type="text"` attribute (so a real
  `input[type="text"]` selector matches it) and it, together with `graph-new-system-service`, are
  the **only** two elements under the `graph-new-` id prefix — removing that exclusion admits
  nothing else. `graph-branch-fitting-primary-label`/`-secondary-label` are `<SPAN>`s, not inputs —
  no risk of becoming bogus params.
- Widening the control sweep to include `input[type="text"]` (needed for the New-system name field)
  also incidentally makes `graph-tag-input` ("Equipment tag") reachable — a genuine existing
  property that was simply never sweepable before; harmless bonus, worth a one-line mention in
  README.
- No modal contains a text input, so the widening only touches the main inspector.

## Implementation — all in `rw_cmdline.js`

### 1. `GRAPH_TOOL_MODALS` — the tool → modal registry (new, placed after `PARAM_SCOPE`)

```js
const GRAPH_TOOL_MODALS = {
  branch:     { dialogId: 'graph-branch-fitting-modal',        prefix: 'graph-branch-fitting-',        title: 'branch fitting' },
  transition: { dialogId: 'graph-checkpoint-transition-modal', prefix: 'graph-checkpoint-transition-', title: 'change size' },
  grd:        { dialogId: 'graph-checkpoint-grd-modal',        prefix: 'graph-checkpoint-grd-',        title: 'place GRD' },
  vertical:   { dialogId: 'graph-checkpoint-riser-modal',      prefix: 'graph-checkpoint-riser-',      title: 'riser elevation' }
};
```

`cmdOpenToolModal(tool)` returns `{tool, dialog, prefix, id, title}` only when that tool has an
entry AND its dialog is genuinely open (reuses `cmdOpenDialogs`'s own open-check, don't duplicate
it), else `null` — so "no recognized modal open" behaves byte-identically to today for every other
tool and for these four when their modal is closed. `RW._cmdToolModal = cmdOpenToolModal` for
console debugging, matching the project's existing `_cmd*` probe convention.

### 2. `cmdParamAllowed(el, modal)` — thread an optional modal through, don't fork a parallel path

Add a second parameter. When a modal is passed, replace the "exclude inside DIALOG" +
"must be inside the inspector aside" checks with a single `cmdIsWithin(el, modal.dialog)` check;
every other rule (id excludes, collapsed-`<details>`, visibility) stays applied unchanged inside
the modal too — which is what makes branch's already-observed conditional fields
(`round-flush-boot`/`rect-flush-boot`, visible only for certain type+shape combos; `secondary-input`,
hidden for round) work correctly with **zero** new logic, exactly like the existing "Advanced"
collapsed group already does. `modal` can only ever come from `cmdOpenToolModal` against one of the
four hardcoded ids above, so `graph-calibrate-modal`/`graph-known-scale-modal` (and any future
dialog) keep failing on the ordinary `inside-dialog` path, unaffected — existing test 192 must keep
passing unmodified.

### 3. `RW._cmdToolSettingsList(tool, opts)` — resolve the prefix per call

```js
const modal = cmdOpenToolModal(tool);
const prefix = modal ? modal.prefix : entry.prefix;
...
if (!el.id || el.id.indexOf(prefix) !== 0) return;
const reason = cmdParamAllowed(el, modal);
...
const param = el.id.slice(prefix.length);
```
Stamp `item.modal = modal.id` when present, so tests/diagnostics can tell modal params apart
without re-deriving it.

### 4. `RW._cmdApplySetting(tool, param, value)` — same prefix resolution; skip the re-arm while a modal is open

**Load-bearing**: without resolving the same modal-aware prefix here, `entry.prefix + param` would
reconstruct the wrong id (`graph-` + `type` = `graph-type`, which doesn't exist) the moment a param
came from a modal listing. Resolve `modal`/`prefix` identically to Step 3 at the top of the
function.

Each of the three write branches (checkbox/select/numeric) currently ends by calling
`RW.runCommand(tool)` to re-arm. **While a modal is open, skip that call** — dispatching the tool's
own key into an open dialog is untested and could as easily cancel/close it as do nothing; instead
just stamp `RW._cmdLastUserCmdAt = Date.now()` (preserving the auto-select grace window the re-arm
used to provide) and report `'... — ' + modal.title + ' dialog still open'` instead of
`'... — re-armed ' + tool`. None of these new ids go on `CONFIRMED_WRITE_IDS` yet, so every modal
write keeps the existing `(confirm it actually applied)` hedge until individually live-verified —
matching the project's own established convention.

Add a `'text'` branch (new — see Step 6) alongside the existing checkbox/select/numeric ones:
plain `.value =` + `input`/`change` dispatch, same skip-re-arm-while-modal-open rule, no
parse/clamp (unlike numeric).

### 5. `RW._cmdParamScopeDiagnose()` — resolve the modal per control, don't blanket-report `inside-dialog`

Today every modal control would report `inside-dialog`, which is actively misleading once this
round ships. Compute the (at most one) open modal each swept control actually belongs to and pass
it into `cmdParamAllowed` the same way, stamping the reported row's `modal` field with the owning
tool name or `null`.

### 6. "New system" fields + text-input support (the widest-blast-radius piece — do this last)

- `GRAPH_PARAM_SCOPE.excludeIdPrefixes`: `['graph-new-']` → `[]`. Rewrite its comment to record
  *why*: round 15 excluded this prefix wholesale; round 19 deliberately admits
  `graph-new-system-name`/`-service` per explicit instruction, while `graph-create-system` ("Add")
  stays out because it's a `<button>` — `cmdSweepControls()` never sweeps buttons, so it needs no
  exclusion rule of its own and gets no table entry.
- `cmdSweepControls()`: add `'input[type="text"]'` to the selector list (also mirror in
  `RW._toolSettingsDiagnose`'s own copy of the same list, so the two never silently diverge).
- `cmdControlType(el)`: `if (el.type === 'text') return 'text';` before the existing `'number'`
  fallback — don't touch the fallback itself.
- `renderMenuRows`: add a `'text'` branch, e.g. `paramDisplay + ' (text, now "' + item.current +
  '")'`.
- The free-typed-value status message (numeric/checkbox path) needs a `'text'` case that doesn't
  print a `min–max` range.

### 7. The 8 new modal-action commands — appended to `GRAPH_ACTIONS`, no new dispatch mechanism

Plain `{name, kind:ACTION, aliases:[], btn, conditional}` entries — `RW.runCommand`'s existing
button path already handles a missing/disabled/hidden button and forbidden ids, so nothing new is
needed there:

| command | button id | only while... |
|---|---|---|
| `choose` | `graph-branch-fitting-submit` | branch-fitting dialog open |
| `cancelbranch` | `graph-branch-fitting-cancel` | branch-fitting dialog open |
| `apply` | `graph-checkpoint-transition-submit` | change-size dialog open |
| `cancelsize` | `graph-checkpoint-transition-cancel` | change-size dialog open |
| `place` | `graph-checkpoint-grd-submit` | GRD placement dialog open |
| `cancelgrd` | `graph-checkpoint-grd-cancel` | GRD placement dialog open |
| `placeriser` | `graph-checkpoint-riser-submit` | riser-elevation dialog open |
| `cancelriser` | `graph-checkpoint-riser-cancel` | riser-elevation dialog open |

The `×` close buttons are deliberately **not** exposed — Cancel is a sufficient dismiss verb per
dialog. Cross-checked against every existing name/alias in the table (11 tools + 17 actions, all
their aliases) — no collisions; none of the 8 button ids is in `FORBIDDEN_BUTTON_IDS`.

### 8. Isolation (`GRAPH_ISOLATION_ALLOWED`) — one flat list, matching the `finish`/`cancel` precedent

Append all 8 new names to the existing flat allowlist (`select, finish, cancel` today). Keep it one
flat list rather than scoping per-tool: `finish`/`cancel` are already globally allowed despite
being route-specific, and the same reasoning applies here — typing `place` while `route` is
isolated is harmless, since the GRD dialog isn't open and `runCommand` already reports "button is
not on the page right now." No change needed to `RW.runCommand`'s `entry.name !== iso` exemption —
it stays load-bearing for every non-modal write; the modal writes bypass `RW.runCommand(tool)`
entirely per Step 4.

**Robustness for grd/vertical** (only these two have an unconfirmed `activeTool` mapping): in
`onInput()`'s plain-command branch, change `RW._cmdActiveSettingsTool()` to
`RW._cmdActiveSettingsTool() || cmdOpenModalTool()` (a new small helper: which tracked tool, if
any, currently has ITS OWN modal open) so the bare-param blend still works even if `activeTool`
turns out not to read `'grd'`/`'vertical'` while their modals are open. Do **not** feed this into
`RW._cmdIsolatedTool()` — isolation must keep failing open off the single existing signal.

### 9. Auto-capture bail-out — narrow it to exclude the four recognized modals

Live-confirmed necessary and safe: the dialogs are non-modal, so only this project's own
`cmdOpenDialogs().length` bail-out (not the app) currently blocks typing while one is open.
Narrow the check so it still bails for any *other* open dialog (calibrate, known-scale — unaffected)
but not for one of the four recognized ids:

```js
const GRAPH_MODAL_DIALOG_IDS = Object.keys(GRAPH_TOOL_MODALS).map(function(k){ return GRAPH_TOOL_MODALS[k].dialogId; });
...
if (cmdOpenDialogs().some(function(d){ return GRAPH_MODAL_DIALOG_IDS.indexOf(d.id) === -1; })) return;
```

## Test plan (`verify_cmdline.js`)

New fixture next to `makeGraphInspector`/`makeGraphField`: `makeGraphModal(win, byId, id, open)` —
a `<dialog>` appended to `doc.body` with `.open` set, reusing `makeGraphField` for its fields (same
`<label><span>` shape `cmdControlLiveLabel` already expects). No other harness change needed —
`queryAllRecursive`/`matchesSelector` already handle `dialog` and `input[type="text"]`.

Cover: a tool's modal-open settings list surfaces only that modal's own fields, stamped with
`item.modal`; falls back to the ordinary (today: empty) behavior when the modal is closed; a
*different* tool's query never sees another tool's open-modal fields (still rejected via
`inside-dialog` on the non-modal path); calibrate/known-scale stay excluded exactly as before
(existing test 192 unmodified, plus a new loop across all 11 tools); the branch modal's
conditionally-visible fields (`rect-flush-boot`) appear/disappear purely from `offsetParent`, no
new logic; `RW._cmdApplySetting` on a modal param writes the real control and does **not** call
`RW._cmdDispatchAppKey` while re-arming is skipped, but does stamp `_cmdLastUserCmdAt`; the same
call with the modal closed fails cleanly ("not on the page"); all 8 new commands click their real
button when present and report the conditional hint when absent; the isolation allowlist admits
all 8 while their own tool is isolated, and one of them (e.g. `place`) is *not* refused while a
*different* tool (`route`) is isolated — it just reports its button missing (this is the assertion
that pins the flat-list design decision); New system's two fields now appear in `route.`/bare-param
listings (**this reverses existing test 193**, which currently asserts the opposite — rewrite it
in place, comment naming round 19 as the reversal); a text-type write sets the exact string with no
numeric parsing and renders as `(text, now "…")`; `graph-create-system` never gets a table entry
and is never reachable by any command name. If the auto-capture narrowing ships (Step 9), extend/
verify existing test 204 still holds for calibrate while a recognized modal no longer bails.

## Build & verify

```bash
node --check rw_cmdline.js
node verify_cmdline.js
bash build_loader.sh
```

Then live-verify via the opencli browser bridge on the same test session used for design research:
reopen the branch-fitting modal, confirm `branch.`/bare params list its real fields with live
labels, apply one write and confirm it lands without re-arming, run `choose`/`cancelbranch`; repeat
for whichever of transition/GRD/riser can be triggered, specifically re-confirming `activeTool`
for `vertical` (the one unconfirmed mapping); confirm New system's two fields are now listed and
writable via `route.`/bare param while `graph-create-system` still isn't a command; confirm typing
still works while a recognized modal is open and still bails for calibrate/known-scale.

## Known open items (not blocking, to resolve during/after implementation)

- The exact user action that opens the transition/GRD/riser modals wasn't found live — irrelevant
  to the mechanism itself, but worth confirming so the live-verification step above can actually
  reach them.
- `vertical`'s `activeTool` mapping while its own modal is open is assumed, not confirmed.
- None of the new write ids are on `CONFIRMED_WRITE_IDS` yet — every modal write keeps the
  "confirm it actually applied" hedge until individually live-tested.
