// read-asm-nrpn.mjs — ASM's "MIDI NRPN & CC Communication Spec" -> its rows as printed, decided
// nothing.
//
// The spec is one long table: `Category  Parameter  CC Dec  CC Hex  NRPN MSB  NRPN LSB` and a comment
// saying what the value is (`VV*128+WW = [0,218]`, `when VV=01H ,set OSC2 Mode`). Every cell but the
// numbers is set in the middle of its row, over as many lines as it needs: a name over two lines
// around its number, a comment over five, a category over a whole group of rows. So the NRPN MSB
// column anchors the rows, and every other cell goes to the row whose anchor is nearest it.

import { execFileSync } from 'node:child_process';

import { pageLines } from '../waldorf/read-waldorf-sysex.mjs';

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();

/** The document's lines on these pages (`pdftotext -bbox`). */
export function documentLines(pdf, pages) {
  const xml = execFileSync('pdftotext', ['-f', String(pages[0]), '-l', String(pages.at(-1)), '-bbox', pdf, '-'], { maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return pageLines(xml).map((l) => ({ ...l, page: l.page + pages[0] - 1 }));
}

const HEX = /^[0-9A-F]{2}H-?$/i;

/**
 * The columns, from the header's titles: `Category` (97), `Parameter` (149), `Dec` (205), `Hex` (231),
 * `MSB` (264), `LSB` (305), and the comment (338). A word belongs to the column whose span holds its
 * left edge.
 */
export function columnsOf(header) {
  const x = (re) => header.find((w) => re.test(w.text))?.x0;
  const c = { category: x(/^Category$/), name: x(/^Parameter$/), dec: x(/^Dec$/), hex: x(/^Hex$/), msb: x(/^MSB$/), lsb: x(/^LSB$/) };
  if (Object.values(c).some((v) => v === undefined)) return null;
  // (A name is set centred, so starts a little left of its title.)
  return { name: c.name - 14, dec: c.dec - 6, hex: c.hex - 6, msb: c.msb - 10, lsb: c.lsb - 14, note: c.lsb + 30 };
}

const columnOf = (cols, x) => (x < cols.name ? 'category' : x < cols.dec ? 'name' : x < cols.hex ? 'dec' : x < cols.msb ? 'hex' : x < cols.lsb ? 'msb' : x < cols.note ? 'lsb' : 'note');

/**
 * The table on these lines: [{ page, category, name, cc?, msb, lsb, note? }], `msb` and `lsb` as
 * printed (`3FH`, `30H-37H`). A row with a controller and no NRPN (the standard controllers at the
 * end) is read so that its cells go to it and not to a row near it, and left out.
 */
export function readNrpnSpec(lines) {
  let cols = null;
  let header = null;
  const anchors = [];
  const loose = [];
  for (const l of lines) {
    if (l.words.some((w) => w.text === 'MSB') && l.words.some((w) => w.text === 'LSB') && l.words.some((w) => w.text === 'Dec')) {
      // The header's titles are over three lines; `Category` and `Parameter` on the middle one.
      const near = lines.filter((m) => m.page === l.page && Math.abs(m.y - l.y) < 8).flatMap((m) => m.words);
      cols = columnsOf(near) ?? cols;
      header = l;
      continue;
    }
    if (!cols) continue;
    // (The header's last line, `value range is [0 - 2000H].`, belongs to no row.)
    if (header && l.page === header.page && l.y - header.y < 15) continue;
    const cells = {};
    for (const w of l.words) (cells[columnOf(cols, w.x0)] ??= []).push(w);
    const msb = (cells.msb ?? []).filter((w) => HEX.test(w.text));
    const dec = (cells.dec ?? []).filter((w) => /^\d{1,3}$/.test(w.text));
    if (msb.length || dec.length) {
      anchors.push({ page: l.page, y: l.y, msb: text(msb), cells: { lsb: [], name: [], note: [], category: [], hex: [], dec: [], msb: [] } });
      const a = anchors.at(-1);
      for (const [col, ws] of Object.entries(cells)) if (col !== 'msb') a.cells[col].push(...ws.map((w) => ({ ...w, y: l.y })));
      continue;
    }
    for (const [col, ws] of Object.entries(cells)) loose.push({ page: l.page, y: l.y, col, words: ws });
  }
  // The loose lines of each column, page by page, run into cells: a cell's lines are 10 points
  // apart, rows further. A cell that holds a row's own line is that row's; any other goes to the
  // nearest row on its page.
  // (Unless that row has a cell in the column already: then it is the end of a cell carried over a
  // page break, `OSC1 WaveScan` at the foot of one page and `Wav6` at the head of the next, and goes
  // to the row on the other side of it.)
  const runs = [];
  for (const c of loose) {
    if (c.col === 'msb' || c.col === 'hex') continue;
    const run = runs.find((r) => r.page === c.page && r.col === c.col && c.y - r.y1 <= 12);
    if (run) { run.words.push(...c.words.map((w) => ({ ...w, y: c.y }))); run.y1 = c.y; } else runs.push({ page: c.page, col: c.col, y0: c.y, y1: c.y, words: c.words.map((w) => ({ ...w, y: c.y })) });
  }
  const rowsCells = anchors.map((a) => Object.fromEntries(Object.entries(a.cells).map(([col, ws]) => [col, ws.length ? [{ y0: a.y, y1: a.y, words: ws }] : []])));
  for (const run of runs) {
    const mid = (run.y0 + run.y1) / 2;
    let best = -1;
    for (const [i, a] of anchors.entries()) if (a.page === run.page && (best < 0 || Math.abs(a.y - mid) < Math.abs(anchors[best].y - mid))) best = i;
    if (best < 0 || Math.abs(anchors[best].y - mid) > 40) continue;
    const own = rowsCells[best][run.col];
    // (A run that meets the row's own line is the same cell.)
    const meets = own.find((c) => run.y0 - c.y1 <= 12 && c.y0 - run.y1 <= 12);
    if (meets) { meets.words.push(...run.words); meets.y0 = Math.min(meets.y0, run.y0); meets.y1 = Math.max(meets.y1, run.y1); continue; }
    own.push({ ...run, mid });
  }
  // A row with two cells in a column, at a page's head or foot: the one further from it goes over
  // the page break.
  for (const [i, a] of anchors.entries()) for (const col of ['name', 'note']) {
    const cs = rowsCells[i][col];
    if (cs.length < 2) continue;
    const far = cs.reduce((p, q) => (Math.abs((q.mid ?? a.y) - a.y) > Math.abs((p.mid ?? a.y) - a.y) ? q : p));
    const other = (far.mid ?? a.y) < a.y ? i - 1 : i + 1;
    if (other < 0 || other >= anchors.length || anchors[other].page === a.page) continue;
    cs.splice(cs.indexOf(far), 1);
    rowsCells[other][col].push(far);
  }
  for (const [i, a] of anchors.entries()) for (const [col, cs] of Object.entries(rowsCells[i])) a.cells[col] = cs.flatMap((c) => c.words.map((w) => ({ ...w, page: a.page === c.page || c.page === undefined ? 0 : c.page < a.page ? -1 : 1 })));
  const sorted = (ws) => text([...ws].sort((p, q) => (p.page ?? 0) - (q.page ?? 0) || p.y - q.y || p.x0 - q.x0));
  const rows = [];
  for (const a of anchors) {
    if (!a.msb) continue;
    const row = { page: a.page, category: sorted(a.cells.category), name: sorted(a.cells.name) };
    const cc = sorted(a.cells.dec);
    if (cc) row.cc = Number(cc);
    row.msb = a.msb;
    row.lsb = sorted(a.cells.lsb).replace(/\s+/g, '');
    const note = sorted(a.cells.note);
    if (note) row.note = note;
    if (!row.category) delete row.category;
    // A row split by a page break is printed on both pages, its numbers and comment twice:
    // `ENV1 Delay(BPM` at the foot of one, `Sync on)` at the head of the next.
    const prev = rows.at(-1);
    if (prev && prev.page === row.page - 1 && prev.msb === row.msb && prev.lsb === row.lsb && prev.note === row.note && prev.cc === row.cc) {
      prev.name = `${prev.name} ${row.name}`.trim();
      if (row.category && !prev.category) prev.category = row.category;
      continue;
    }
    rows.push(row);
  }
  return rows;
}

// A value of a rhythm list: `1/16`, `1/4T`, `1/1Dot`, `8‘` (bars), `0`.
const RHYTHM = /^(?:\d+\/\d+(?:T|Dot)?|\d+[‘’']|0)$/;

/**
 * The rhythm lists after the table (`RHYTHM LISTS`): { ARP: ['1/1', …], 'LFO Rate': […], … }. Each
 * list's caption is printed under it, centred, as the ARP's twelve values (`ARP Division`, `WW =
 * [0,11]`) show.
 */
export function readRhythmLists(lines) {
  const out = {};
  let on = false;
  let items = [];
  for (const l of lines) {
    if (l.words.some((w) => w.text === 'RHYTHM') && l.words.some((w) => w.text === 'LISTS')) { on = true; continue; }
    if (!on) continue;
    if (l.words.every((w) => RHYTHM.test(w.text))) { items.push(...l.words.map((w) => w.text)); continue; }
    if (l.words.length <= 3 && items.length) { out[text(l.words)] = items; items = []; continue; }
    if (l.words.length > 3) break;   // the CC mapping after them
  }
  return out;
}
