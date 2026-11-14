// read-sonicware-chart.mjs — a Sonicware MIDI implementation chart -> its control changes as printed,
// decided nothing.
//
// Sonicware publishes a MIDI chart for each instrument, the standard form (`Function  Transmitted
// Recognized  Remarks`) with its control changes listed a row each: the controller's number, a mark
// in each of the two columns (〇 or ×), and the parameter's name as the remark. They come in blocks,
// each labelled down the left (`Control *1 Change (PATTERN)`, `Control Change (MIXER) Works in
// TRACK CH`), the label set beside the middle of its block, the blocks a wider space apart than
// their rows. So the rows are read first; they fall into runs at that wider space; and each run takes
// the label set beside it.

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
const MARK = /^[〇○×x]$/;

/**
 * The control changes on these lines: [{ page, cc, name, transmitted, recognized, block }]. `columns`:
 * the x of the number, the two marks and the remarks; the label column is left of the number's.
 */
export function readChart(lines, { number: given, transmitted, recognized, remarks }) {
  // The number column, where not given: where most lone numbers left of the marks stand.
  const xs = lines.flatMap((l) => l.words).filter((w) => /^\d{1,3}$/.test(w.text) && w.x0 < transmitted - 30).map((w) => Math.round(w.x0 / 10) * 10);
  const count = new Map();
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1);
  const number = given ?? [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const rows = [];
  const labels = [];
  for (const l of lines) {
    const n = l.words.find((w) => /^\d{1,3}$/.test(w.text) && Math.abs(w.x0 - number) < 25);
    const remark = text(l.words.filter((w) => w.x0 >= remarks - 60 && !MARK.test(w.text)));
    const left = l.words.filter((w) => w.x1 < number - 15);
    if (left.length) labels.push({ page: l.page, y: l.y, text: text(left) });
    if (!n || !remark || /^\d+\s*-\s*\d+$/.test(remark)) continue;
    // The marks: on the row's line, or on a line just above or below it (the CyDrums sets them apart).
    const near = lines.filter((x) => x.page === l.page && Math.abs(x.y - l.y) <= 9).flatMap((x) => x.words).filter((w) => MARK.test(w.text));
    const at = (x) => near.find((w) => Math.abs(w.x0 - x) < 25)?.text ?? '';
    rows.push({ page: l.page, y: l.y, cc: Number(n.text), name: remark, transmitted: at(transmitted), recognized: at(recognized) });
  }
  // The runs: rows a wider space apart than the page's usual are separate blocks.
  const gaps = rows.slice(1).map((r, i) => (r.page === rows[i].page ? r.y - rows[i].y : null)).filter((g) => g !== null).sort((a, b) => a - b);
  const usual = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 12;
  const runs = [];
  for (const r of rows) {
    const prev = runs.at(-1)?.at(-1);
    if (prev && prev.page === r.page && r.y - prev.y <= usual * 1.45) runs.at(-1).push(r); else runs.push([r]);
  }
  // Each run's label: the label lines beside it, gathered into blocks of lines set close together.
  const blocks = [];
  for (const l of labels) {
    const last = blocks.at(-1);
    if (last && last.page === l.page && l.y - last.y1 <= 16) { last.text += ` ${l.text}`; last.y1 = l.y; } else blocks.push({ page: l.page, y0: l.y, y1: l.y, text: l.text });
  }
  for (const run of runs) {
    const [top, bottom] = [run[0].y, run.at(-1).y];
    const mid = (top + bottom) / 2;
    const candidates = blocks.filter((b) => b.page === run[0].page && /Control|Change|\(|\*\d/.test(b.text));
    const block = candidates.find((b) => b.y0 <= bottom + 6 && b.y1 >= top - 6) ?? candidates.reduce((best, b) => (!best || Math.abs((b.y0 + b.y1) / 2 - mid) < Math.abs((best.y0 + best.y1) / 2 - mid) ? b : best), null);
    for (const r of run) r.block = block?.text ?? '';
  }
  return rows.map(({ y, ...r }) => r);
}
