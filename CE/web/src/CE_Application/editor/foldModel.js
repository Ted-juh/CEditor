// foldModel.js — pure logic for code folding. The editor keeps the FULL source as the
// source of truth; folding only changes what's DISPLAYED. Given the full source, the set
// of folded start-lines, and the foldable regions (from the parser), this projects the
// visible text and a display-line → full-line map. No source is ever lost.
//
// Folding a region {startLine, endLine} hides lines startLine+1..endLine and marks the
// header line. Nested regions whose header is itself hidden are inert.

/** Hidden full-line numbers (1-based) and the active header start-lines. */
export function computeHidden(foldedSet, regions) {
  const active = (regions || []).filter((r) => foldedSet.has(r.startLine));
  const hidden = new Set();
  for (const r of active) {
    for (let l = r.startLine + 1; l <= r.endLine; l++) hidden.add(l);
  }
  // A header inside another fold's hidden range isn't really showing a marker.
  const activeStarts = new Set(active.map((r) => r.startLine).filter((s) => !hidden.has(s)));
  return { hidden, activeStarts };
}

/**
 * Project the full source to its folded display form.
 * Returns { text, displayToFull } where displayToFull[i] is the 1-based full-source line
 * shown at display row i. The header line of a folded region gets a "⋯" marker appended.
 */
export function projectFolds(source, foldedSet, regions, marker = '  ⋯') {
  const lines = String(source ?? '').split('\n');
  const { hidden, activeStarts } = computeHidden(foldedSet, regions);
  const out = [];
  const displayToFull = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    if (hidden.has(ln)) continue;
    out.push(activeStarts.has(ln) ? lines[i] + marker : lines[i]);
    displayToFull.push(ln);
  }
  return { text: out.join('\n'), displayToFull };
}

/** Keep only the folds still valid for the current regions (drops stale start-lines). */
export function pruneFolds(foldedSet, regions) {
  const starts = new Set((regions || []).map((r) => r.startLine));
  const next = new Set();
  for (const s of foldedSet) if (starts.has(s)) next.add(s);
  return next;
}
