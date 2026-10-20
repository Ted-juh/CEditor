// closestWord.js — which of a list of words a misspelling was meant to be, for the "Did you mean"
// a refusal ends with. Its own module so the editor's checks (scriptValidate.js, unknownCalls.js)
// can ask without loading the Values sidebar's core, which reads through it too.

/** Edit distance with a swap of two neighbours counted as one edit ("Pluse" is one from "Pulse"). */
function distance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** How many characters two words share at their start. */
const sharedStart = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
};

/**
 * The candidate closest to `word`, when it is close enough to be the one meant, else null: a word a
 * few edits away (a third of its length, three at most), or one sharing most of its start with it
 * ("rotation" for "rotate"). A word that differs only in capitals is its own correct spelling.
 */
export function closest(word, candidates) {
  const w = String(word ?? '').toLowerCase();
  if (!w) return null;
  let best = null;
  let bestD = Infinity;
  const limit = Math.min(3, Math.max(1, Math.floor(w.length / 3)));
  for (const c of candidates) {
    const lc = String(c).toLowerCase();
    const shared = sharedStart(w, lc);
    let d = distance(w, lc);
    if (d > limit && shared >= Math.max(4, Math.ceil(0.6 * Math.min(w.length, lc.length)))) d = limit;
    if (d < bestD) { best = c; bestD = d; }
  }
  if (best === null) return null;
  if (bestD === 0) return best !== word ? best : null;
  return bestD <= limit ? best : null;
}

