// Pure decisions behind the graph host's modal field-walk (branch fitting,
// change size, GRD, riser — see CLAUDE.md's "Modal field-walk" and "Modal
// walk value memory"). No DOM, no host globals, no `localStorage` — every
// live-discovered fact (the current field list, the memory store, whether
// a submit button is currently clickable) is passed in by the caller
// (`src/console/shell.js`'s `cmdWalk*` functions), which still owns every
// side effect: opening a prompt, writing a control, reading/persisting
// `RW._cmdModalWalkValueMemory`.
//
// Deliberately NOT an index-based `{phase, fields, index}` reducer: the
// walk re-derives its field list fresh on every hop
// (`RW._cmdToolSettingsList(tool)` in shell.js), because a field can appear
// or disappear depending on an earlier answer (branch's own flush-boot
// glyphs; change size's secondary size field, hidden for a round shape;
// riser's Shape field, hidden for a plain elbow). An index into a list
// snapshotted at walk-start would desync the moment a field's visibility
// changes mid-walk. `walkNextItem` below takes the CURRENT field list on
// every call for exactly this reason — callers must re-fetch it each hop,
// never cache it.

// The next field to prompt for: the first item in `items` (on-screen
// order, already live-fetched by the caller) whose `param` isn't in
// `seen`, or `null` once every current field has been visited. Mirrors
// shell.js's own `cmdWalkNextItem`, minus the live DOM read.
export function walkNextItem(items, seen) {
  return items.find((item) => seen.indexOf(item.param) === -1) || null;
}

// The new `{seen, applied, skipped}` after one field is either applied or
// left untouched — pure counterpart of `cmdWalkAdvance`'s own bookkeeping.
// Recording the actually-applied value (re-reading the control's own live
// `.current` rather than trusting a remembered value verbatim) stays the
// caller's job, same as everything else that touches a real control.
export function walkAdvanceState({ seen, applied, skipped }, { param, skip }) {
  return {
    seen: seen.concat([param]),
    applied: applied + (skip ? 0 : 1),
    skipped: skipped + (skip ? 1 : 0),
  };
}

// Whether ending the walk should auto-click the modal's own submit button
// with no further Enter (change size/GRD/riser) or fall back to the
// manual Choose/Cancel-style prompt (branch fitting, or any of the three
// if their submit button isn't currently usable) — mirrors
// `cmdWalkFinish`'s own branch. `submitUsable` is the caller's own
// read-only usability check (`cmdActionUsable`/`isActionUsable`), not
// re-derived here.
export function walkFinishVerdict(tool, autoSubmitTools, submitUsable) {
  return autoSubmitTools.indexOf(tool) !== -1 && submitUsable ? 'auto-submit' : 'manual-prompt';
}

// Whether an actually-applied field is allowed to be written into the walk
// value memory — mirrors `cmdWalkMemorySet`'s own guard. `skipTools` is
// this project's own `MODAL_WALK_MEMORY_SKIP_TOOLS` (change size, GRD,
// riser — Kresna's own request: never remember or offer reuse for any of
// their fields, enforced here rather than left to omission, same as
// `FORBIDDEN_BUTTON_IDS`).
export function canRecordWalkMemory(tool, { enabled, skipTools }) {
  if (!enabled) return false;
  if (skipTools.indexOf(tool) !== -1) return false;
  return true;
}

// Whether `cmdWalkStart` should show the Edit/use-previous offer at all —
// mirrors `cmdWalkHasMemory`. `memoryForTool` is whatever's already stored
// for this tool (`RW._cmdModalWalkValueMemory[tool]`, or undefined) — a
// skip-listed tool never offers, even if something got recorded for it
// some other way (a stale pre-skip-list `localStorage` value, a direct
// console assignment).
export function hasWalkMemory(memoryForTool, tool, { enabled, skipTools }) {
  if (skipTools.indexOf(tool) !== -1) return false;
  return !!(enabled && memoryForTool && Object.keys(memoryForTool).length);
}

// The select-field prefill decision from `cmdWalkOpenPrompt`: which option
// row to highlight, and what (if anything) to prefill into the command
// bar's own text. `options` is the live option list, each `{optionValue,
// optionText}` (mirrors shell.js's own `menuItems` shape for a settings
// select). Prefers a remembered value that still matches a real option;
// falls back to today's actual current value; falls back to the first row
// if neither matches — never guesses past that (fails toward "highlight
// what's really there," same doctrine as everywhere else this project
// can't confirm live state).
export function selectWalkPrefill(options, remembered, current) {
  let index = -1;
  let prefillText = '';
  if (remembered !== undefined) {
    index = options.findIndex((o) => o.optionValue === remembered);
    if (index !== -1) prefillText = options[index].optionText;
  }
  if (index === -1) {
    const curIdx = options.findIndex((o) => o.optionValue === current);
    index = curIdx !== -1 ? curIdx : (options.length ? 0 : -1);
  }
  return { index, prefillText };
}
