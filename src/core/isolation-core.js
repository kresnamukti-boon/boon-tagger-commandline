// Pure predicate behind the graph host's isolation restriction (while a
// tool is armed, most of the command table is refused) — no DOM, no host
// globals. The decision of WHICH tool (if any) to isolate to
// (RW._cmdIsolatedTool) stays in shell.js/src/features, since it reads live
// app state; only "does this one entry escape isolation" is pure.

// `entry` is a command-table row ({name, kind, ...}); `modalOpen` is
// whether one of the graph host's own config-dialog modals is open right
// now. `isNativeTool(entry)` tells a real dispatchable tool apart from an
// action/other entry (this project's own convention: `entry.kind ===
// 'native'`, passed in rather than hardcoded so this file has no opinion
// on that string). `allowedNames` is the flat list of non-tool commands
// (select/finish/cancel/the modal actions/dimension) that stay reachable
// regardless of isolation.
//
// Switching directly to a DIFFERENT native tool while one is armed escapes
// isolation (typing/picking another tool's name arms it immediately, no
// "type select first" detour) — but only while isolation comes from an
// actually-armed tool, never while it comes from an OPEN CONFIG-DIALOG
// MODAL: dispatching a different tool's key over an open dialog was never a
// considered/tested scenario, so `modalOpen` suppresses that exemption.
export function isolationEscapes(entry, modalOpen, { isNativeTool, allowedNames }) {
  if (isNativeTool(entry) && !modalOpen) return true;
  return allowedNames.includes(entry.name);
}
