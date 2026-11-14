// read-a6-chart.mjs — the Alesis A6 Andromeda's MIDI Sysex Specification, as pdftotext -layout prints it.
//
// Two things are read, as printed, and nothing is decided here:
//
//   - the SYSEX AND NRPN PARAMETER CHART (its last pages): a row a line, `Index  Parameter Name
//     Parent (MSB)  Child (LSB)  NRPN  Default  Range`, the last two under `Sysex Only Fields`; a range
//     is `a to b`, `any`, `Depends on effect config` or nothing; an index the A6 does not use is
//     `(not used)`;
//   - a block of the opcodes' section: from the line that names it to the next opcode or heading,
//     form feeds and page footers taken out.

const FOOTER = /^\s*A6 MIDI Sysex Specification _+Page \d+\s*$/;
const ROW = /^\s*(\d+)\s+(\S.*?)\s{2,}(\d+)\s+(\d+)\s+(ON|OFF)(?:\s+(-?\d+)(?:\s+(any|-?\d+ to -?\d+|Depends on effect config))?)?\s*$/;
const UNUSED = /^\s*(\d+)\s+\(not used\)\s*$/;

/** The text's lines, each with the page it is on (pdftotext ends a page with a form feed). */
export function pagedLines(text) {
  const out = [];
  text.split('\f').forEach((page, k) => {
    for (const line of page.split(/\r?\n/)) out.push({ page: k + 1, text: line });
  });
  return out;
}

/** The chart: its date, the pages it is on, and every row. */
export function readChart(text) {
  const lines = pagedLines(text);
  const start = lines.findIndex((l) => /SYSEX AND NRPN PARAMETER CHART/.test(l.text));
  if (start < 0) return null;
  const rows = [];
  let date = null;
  const unread = [];
  for (const { page, text: line } of lines.slice(start + 1)) {
    if (!line.trim() || FOOTER.test(line)) continue;
    const m = ROW.exec(line);
    if (m) {
      rows.push({
        index: Number(m[1]), page, name: m[2], parent: Number(m[3]), child: Number(m[4]), nrpn: m[5] === 'ON',
        ...(m[6] != null ? { default: Number(m[6]) } : {}), ...(m[7] ? { range: m[7] } : {}),
      });
      continue;
    }
    const unused = UNUSED.exec(line);
    if (unused) { rows.push({ index: Number(unused[1]), page, notUsed: true }); continue; }
    const d = /^\s*(\d{2}\/\d{2}\/\d{4})\s*$/.exec(line);
    if (d && !date) { date = d[1]; continue; }
    if (/These values are to be used|Sysex Only Fields|Parameter Name\s+\(MSB\)/.test(line)) continue;
    unread.push(line.trim());
  }
  const pages = [...new Set(rows.map((r) => r.page))];
  return { date, pages: [pages[0], pages.at(-1)], rows, unread };
}

/**
 * A block of the opcodes' section, as printed: from the first line `start` matches up to (not
 * including) the first after it that `end` matches. Footers and blank runs taken out.
 */
export function block(text, start, end) {
  const lines = pagedLines(text);
  const at = lines.findIndex((l) => start.test(l.text));
  if (at < 0) return null;
  const out = [];
  for (const { page, text: line } of lines.slice(at)) {
    if (out.length && end.test(line)) break;
    if (FOOTER.test(line)) continue;
    out.push({ page, text: line.trimEnd() });
  }
  while (out.length && !out.at(-1).text.trim()) out.pop();
  const kept = out.filter((l, k) => l.text.trim() || (k > 0 && out[k - 1].text.trim()));
  return { pages: [kept[0].page, kept.at(-1).page], lines: kept.map((l) => l.text.replace(/^ {0,6}/, '')) };
}
