// Pure reducers behind the graph host's auto-select resting-state watcher
// (RW._cmdGoSelect/_cmdToolWatchTick in shell.js) — no DOM, no host globals,
// no Date.now()/setInterval of their own. Not something native needs at
// all: native's own store is subscribable, so it can react to a tool
// clearing itself without polling — this whole feature only exists here
// because this project has no equivalent hook into the host app's state.
// Kept here anyway (not deleted) for the same reason every other pure piece
// was extracted: so the actual decision logic is unit-testable without a
// DOM/timer stub, and so a future host adapter that DOES get a real
// subscription can still reuse the "should this fire" question below
// without the polling machinery around it.

// The circuit breaker: `log` is a list of past revert timestamps (ms);
// returns the pruned log (entries older than `windowMs` dropped, `now`
// appended) plus whether it just crossed the trip threshold. Pruning
// removes items whose age has exceeded `windowMs` — the trip check
// compares the PRUNED length (including the just-pushed entry) against
// `max`, so the threshold means "more than `max` reverts within the last
// `windowMs`," not counting-inclusive-vs-exclusive off-by-one games.
export function breakerStep(log, now, { max, windowMs }) {
  const pruned = log.filter((t) => now - t < windowMs);
  pruned.push(now);
  return { log: pruned, tripped: pruned.length > max };
}

// The decision RW._cmdGoSelect makes before it actually dispatches
// anything: 'suppress' (a recent auto-trigger already fired — Escape and
// the poll racing each other, not a real go-select of its own), 'at-rest'
// (already resting — don't assume `s` toggles rather than switches),
// 'dispatch' (do the real key dispatch). `bypassSuppression` lets a
// deliberate, repeated user action (Space) skip the suppression window
// that exists only to stop two AUTOMATIC triggers from double-firing.
export function goSelectDecision({ now, lastSelectAt, bypassSuppression, suppressMs, atRest }) {
  if (!bypassSuppression && now - lastSelectAt < suppressMs) return 'suppress';
  if (atRest) return 'at-rest';
  return 'dispatch';
}

// The tool-watch poll's edge detector: 'unreadable' (cur can't be read —
// leave everything untouched), 'cleared' (a real, non-null tool — nothing
// pending), 'pending' (already watching a null read, caller should now
// check watchShouldFire), 'armed' (a fresh non-null->null transition —
// start watching it), 'idle' (null seen with no prior non-null to compare
// against, e.g. right after a fresh start). Deliberately never compares
// `cur` against a known tool-name STRING — only against null — so an
// unrecognized tool name behaves exactly like a confirmed one.
export function watchEdge({ cur, prev, nullPending }) {
  if (cur === undefined) return 'unreadable';
  if (cur !== null) return 'cleared';
  if (nullPending) return 'pending';
  if (prev !== null && prev !== undefined) return 'armed';
  return 'idle';
}

// Once an edge is 'pending' (a confirmed non-null->null transition, seen on
// a PRIOR tick — this is what makes it edge-triggered, never a transient
// blip), this decides whether it's safe to actually revert to select right
// now: not fighting a command the user just ran, not mid-typed, and not a
// deliberate non-draw mode switch (pan/label/crop/...) this project's own
// records (`modeActive`) or the app's own live mode both call out. Every
// guard below deliberately does NOT clear the pending edge when it blocks —
// the caller keeps retrying the same edge next tick until it's either
// confirmed by one of these fresh reads or the tool comes back non-null
// (an unrelated edge case, already handled by watchEdge's own 'cleared').
export function watchShouldFire({ now, lastUserCmdAt, userGraceMs, inputHasText, mode, drawMode, modeActive }) {
  if (now - lastUserCmdAt < userGraceMs) return false; // just ran a deliberate command
  if (inputHasText) return false;                      // mid-typed command
  if (mode !== null && mode !== drawMode) return false; // deliberate pan/label/crop/... — don't fight it
  if (modeActive) return false;                         // OUR OWN record says we're in one too
  return true;
}
