// Pure ranking behind `#` tag/system search — no DOM, no host globals. Live
// detection of the real tag/system list (RW._cmdDetectTags) stays in
// shell.js/src/features, since it reads annotationState/the DOM; only
// ranking an already-known list against a query is pure.
//
// Ranking: empty query keeps every tag in its own original order (rank 2
// for all, a stable sort — so `#` alone lists the full detected list, not a
// re-sorted one); otherwise exact name=0, name-prefix=1, name-substring=2.
export function matchTags(list, query) {
  const q = (query ?? '').trim().toLowerCase();
  const ranked = [];
  list.forEach((tag, idx) => {
    const name = (tag.name ?? '').toLowerCase();
    let rank = -1;
    if (!q) rank = 2;
    else if (name === q) rank = 0;
    else if (name.indexOf(q) === 0) rank = 1;
    else if (name.indexOf(q) !== -1) rank = 2;
    if (rank !== -1) ranked.push({ tag, idx, rank });
  });
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.map((r) => ({ tag: r.tag, idx: r.idx }));
}
