// Pure helpers over a command table's own shape — no DOM, no host globals.

// Which action entries a given tool table shadows, and what each is still
// reachable by. Table order IS the resolution rule (the caller's own
// RW._cmdTable is tools-then-actions, and both findEntry/RW._cmdMatch scan
// it in that order — exact name before exact alias) — so a collision is
// deterministic, never ambiguous: the TOOL wins its own name, and the
// action keeps every other token (name/alias) it has that the tool table
// doesn't also use.
export function shadowedActions(tools, actions) {
  const names = tools.map((t) => t.name);
  const rows = [];
  actions.forEach((a) => {
    const tokens = [a.name].concat(a.aliases || []);
    const clashed = tokens.filter((t) => names.includes(t));
    if (clashed.length) {
      rows.push({
        action: a.name,
        shadowed: clashed,
        reachableAs: tokens.filter((t) => !names.includes(t)),
      });
    }
  });
  return rows;
}
