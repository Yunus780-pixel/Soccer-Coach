// Fuzzy (typo-forgiving) search helpers.
//
// editDistance counts the smallest number of single-letter fixes
// (add, remove, or swap one letter) to turn word A into word B.
// "juglin" -> "juggling" needs 2 fixes, so they're close.

export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr: number[] = new Array(n + 1);
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1, // remove a letter
        curr[j - 1] + 1, // add a letter
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // swap a letter
      );
    }
    prev = curr;
  }
  return prev[n];
}

// How well does `query` match `text`?
// Returns a score where LOWER = better match, or null if not close enough.
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t.includes(q)) return 0; // direct hit anywhere in the text

  const queryWords = q.split(/\s+/);
  const textWords = t.split(/[^a-z0-9]+/).filter(Boolean);

  let total = 0;
  for (const qw of queryWords) {
    let best = Infinity;
    for (const tw of textWords) {
      if (tw.startsWith(qw)) {
        best = 0.5; // typing the start of a word is almost a hit
        break;
      }
      best = Math.min(best, editDistance(qw, tw));
      if (tw.length > qw.length) {
        // also compare against just the beginning of longer words,
        // so "jugl" still lines up with "juggling"
        best = Math.min(best, editDistance(qw, tw.slice(0, qw.length)) + 0.5);
      }
    }
    // short words may only be a little wrong; longer words can be more wrong
    const allowed = qw.length <= 3 ? 1 : qw.length <= 5 ? 2 : 3;
    if (best > allowed) return null;
    total += best;
  }
  return total;
}
