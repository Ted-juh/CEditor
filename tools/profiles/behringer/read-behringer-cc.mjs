// read-behringer-cc.mjs — a Behringer guide's MIDI controller table -> its rows as printed, decided
// nothing.
//
// Behringer prints its instruments' controllers as a table in the quick start guide or manual, each
// in its own way: `CC Number  Acts on  Range` (the UB-1 Micro), `CC #  Affects  Range` (the Pro-VS
// Mini), `CC  Action  Range` (the Spice), `CC NUM  PARAMETERS  VALUES` (the CZ-1 Mini), `CC Num  Hex
// Parameter  Value` (the JN-80), `CC Num  Hex  Continuous - Coarse  Continuous - Fine tune  Stepped
// params  MIDI standard` (the PRO-800) — often two or three tables side by side, a cell's lines set
// above and below its number. So a header gives each table its columns, the numbers under its CC
// column anchor the rows, and every other word under its columns goes to the nearest row.

import { execFileSync } from 'node:child_process';

import { pageLines } from '../waldorf/read-waldorf-sysex.mjs';

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();

/** The document's lines on these pages (`pdftotext -bbox`). */
export function documentLines(pdf, pages) {
  const xml = execFileSync('pdftotext', ['-f', String(pages[0]), '-l', String(pages.at(-1)), '-bbox', pdf, '-'], { maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return pageLines(xml).map((l) => ({ ...l, page: l.page + pages[0] - 1 }));
}

// A table's CC column is headed `CC`, `CC #`, `CC Num`, `CC NUM`, `CC Number` or `Controller`.
const CC_HEAD = /^(?:CC|Controller)$/i;
// What each other column holds, by its title.
const ROLE = [
  [/^Hex$/i, 'hex'],
  [/Fine/i, 'fine'],
  [/Stepped/i, 'stepped'],
  [/MIDI standard/i, 'standard'],
  [/Coarse|Acts on|Affects|Action|^Parameters?$|^Controls?$|^Name$|Function/i, 'name'],
  [/^(?:Range|Values?)$/i, 'range'],
];

const TITLE_START = /^(?:Hex|Range|Values?|Parameters?|Controls?|Acts|Affects|Action|Continuous|Stepped|MIDI|Function|Name)$/i;

/** A header line's tables: [{ from, to, cols: [{ role, x, title }] }] or []. */
export function headerTables(words) {
  // (A header has no numbers: `… Portamento CC Control` on a row of the JN-80's table is not one.)
  if (words.some((w) => /^\d+$/.test(w.text))) return [];
  const starts = words.map((w, i) => (CC_HEAD.test(w.text) ? i : -1)).filter((i) => i >= 0);
  const out = [];
  for (const [k, s] of starts.entries()) {
    const end = starts[k + 1] ?? words.length;
    // Titles: words set close together (`Acts on`, `Continuous - Coarse`); the CC column's own
    // (`CC Num`, `CC #`, `CC Number`) with it.
    // (A word that begins a title starts one however close it is set: the CZ-1 Mini's small type runs
    // `CC NUM PARAMETERS VALUES` together. The CC column's title takes only its own words.)
    const titles = [];
    for (const [j, w] of words.slice(s, end).entries()) {
      const prev = titles.at(-1);
      const joins = prev && w.x0 - prev.x1 < 9 && (j === 1 ? /^(?:#|NUM|Num|Number|No\.?)$/.test(w.text) : titles.length > 1 && !TITLE_START.test(w.text));
      if (joins) { prev.title += ` ${w.text}`; prev.x1 = w.x1; } else titles.push({ x: w.x0, x1: w.x1, title: w.text });
    }
    const cols = titles.map((t, i) => ({ x: t.x, x1: t.x1, title: t.title, role: i === 0 ? 'cc' : ROLE.find(([re]) => re.test(t.title))?.[1] ?? null }));
    if (!cols.some((c) => c.role === 'name')) continue;
    // The last table stops a little right of its last column (the JT Mini's Specifications beside it).
    out.push({ from: words[s].x0 - 6, to: k + 1 < starts.length ? words[starts[k + 1]].x0 - 6 : cols.at(-1).x1 + 70, cols });
  }
  return out;
}

/**
 * The tables on these lines: [{ page, cc, hex?, name?, fine?, stepped?, standard?, range? }], a row a
 * number under a CC column. `reach` is how far above or below its number a cell's line may be.
 */
export function readCcTables(lines, { reach = 22 } = {}) {
  const rows = [];
  const pages = [...new Set(lines.map((l) => l.page))];
  for (const page of pages) {
    const own = lines.filter((l) => l.page === page);
    let tables = [];
    for (const l of own) {
      const found = headerTables(l.words);
      if (found.length) { tables = found.map((t) => ({ ...t, y: l.y })); continue; }
      for (const t of tables) (t.lines ??= []).push(l);
    }
    for (const t of tables) {
      // A line splits into cells at its gaps; a cell (often centred, often wider than its title) goes
      // to the column whose title's centre is nearest its own.
      const centre = (c) => (c.x + c.x1) / 2;
      // (A cell set flush under its title, as the PRO-800's are under `Continuous - Coarse`, is that
      // column's however wide the title.)
      const split = (l) => {
        const cells = [];
        for (const w of l.words.filter((x) => x.x0 >= t.from && x.x0 < t.to)) {
          const prev = cells.at(-1);
          if (prev && w.x0 - prev.x1 < 9) { prev.words.push(w); prev.x1 = w.x1; } else cells.push({ x: w.x0, x1: w.x1, words: [w] });
        }
        return cells;
      };
      // Where the cells start at as many aligned places as there are titles (the PRO-800's, the D
      // Mini's: titles set off their cells), those places are the columns, in order.
      const starts = [];
      for (const l of t.lines ?? []) for (const c of split(l)) {
        const near = starts.find((g) => Math.abs(g.x - c.x) <= 3);
        if (near) near.n++; else starts.push({ x: c.x, n: 1 });
      }
      const aligned = starts.filter((g) => g.n >= 3).sort((p, q) => p.x - q.x);
      const byStart = aligned.length === t.cols.length ? (cell) => t.cols[aligned.findIndex((g) => Math.abs(g.x - cell.x) <= 3)] : () => undefined;
      const col = (cell) => byStart(cell) ?? t.cols.find((c) => Math.abs(c.x - cell.x) <= 4) ?? t.cols.reduce((a, b) => (Math.abs(centre(b) - centre(cell)) < Math.abs(centre(a) - centre(cell)) ? b : a));
      const anchors = [];
      const lineCells = [];   // [{ y, cells: [{ role, words }] }] for the lines without a number
      for (const l of t.lines ?? []) {
        const cells = split(l);
        // A hex cell is its first word; what follows it is the next column's (the PRO-800's `1E Glide`).
        for (let i = 0; i < cells.length; i++) {
          if (col(cells[i]).role === 'hex' && cells[i].words.length > 1) {
            const [first, ...more] = cells[i].words;
            cells.splice(i, 1, { x: first.x0, x1: first.x1, words: [first] }, { x: more[0].x0, x1: more.at(-1).x1, words: more });
          }
        }
        const placed = [];
        let anchored = false;
        for (const cell of cells) {
          const c = col(cell);
          // A number under the CC column (`39`, the D Mini's `MIDI CC 39`).
          const n = /^(?:MIDI CC\s+)?(\d{1,3})$/.exec(text(cell.words))?.[1];
          if (c.role === 'cc' && n !== undefined && Number(n) <= 127 && !anchored) { anchors.push({ y: l.y, cc: Number(n), line: placed }); anchored = true; } else if (c.role) placed.push({ role: c.role === 'cc' ? 'name' : c.role, words: cell.words });
        }
        if (!anchored && placed.length) lineCells.push({ y: l.y, cells: placed });
      }
      if (!anchors.length) continue;
      const cells = anchors.map((a) => {
        const out = {};
        for (const c of a.line) (out[c.role] ??= []).push(...c.words.map((w) => ({ ...w, y: a.y })));
        return out;
      });
      const bands = anchors.map(() => []);
      // A line with a name and a range of its own and no number is a value band: of the nearest row
      // whose own line is its number alone (the JT Mini's Voice Mode, its bands set around it), else
      // of the row above (the Pro-VS Mini's `Chorus 0 – 42` under `FX Engine 0 – 127`).
      const rest = [];
      const waiting = anchors.map((a, i) => [a, i]).filter(([a]) => !a.line.length);
      for (const lc of lineCells) {
        const roles = new Set(lc.cells.map((c) => c.role));
        if (!(roles.has('name') && roles.has('range') && lc.cells.length >= 2)) { rest.push(lc); continue; }
        const near = waiting.filter(([a]) => Math.abs(a.y - lc.y) < 60).sort(([a], [b]) => Math.abs(a.y - lc.y) - Math.abs(b.y - lc.y))[0];
        const above = anchors.map((a, i) => [a, i]).filter(([a]) => a.y < lc.y).at(-1);
        const to = near ?? above;
        if (!to) { rest.push(lc); continue; }
        bands[to[1]].push({ y: lc.y, ...Object.fromEntries(lc.cells.map((c) => [c.role, text(c.words)])) });
      }
      // The other lines' cells: a run of lines in one column is one cell (a value list, a name set
      // over two lines), given to the row whose number is nearest the run's middle.
      const runs = [];
      for (const lc of rest) for (const c of lc.cells) {
        // (A cell's own lines are 7 or 8 points apart; rows, 10 or more.)
        const run = runs.find((r) => r.role === c.role && lc.y - r.y1 <= 8.5 && Math.abs(c.words[0].x0 - r.x) < 60);
        if (run) { run.words.push(...c.words.map((w) => ({ ...w, y: lc.y }))); run.y1 = lc.y; } else runs.push({ role: c.role, x: c.words[0].x0, y0: lc.y, y1: lc.y, words: c.words.map((w) => ({ ...w, y: lc.y })) });
      }
      for (const run of runs) {
        // A long list beside several rows is theirs alike (the Spice's divide-by list, printed once
        // for two sub-oscillators).
        const within = anchors.map((a, i) => [a, i]).filter(([a]) => a.y > run.y0 && a.y < run.y1);
        if (within.length >= 2 && run.y1 - run.y0 > 40) { for (const [, i] of within) (cells[i][run.role] ??= []).push(...run.words); continue; }
        const mid = (run.y0 + run.y1) / 2;
        let best = -1;
        for (const [i, a] of anchors.entries()) if (best < 0 || Math.abs(a.y - mid) < Math.abs(anchors[best].y - mid)) best = i;
        if (Math.abs(anchors[best].y - mid) > reach + (run.y1 - run.y0) / 2) continue;
        (cells[best][run.role] ??= []).push(...run.words);
      }
      for (const [i, a] of anchors.entries()) {
        const row = { page, cc: a.cc };
        for (const [role, ws] of Object.entries(cells[i])) {
          const t2 = text(ws.sort((p, q) => p.y - q.y || p.x0 - q.x0));
          if (t2 && !/^[-—–]$/.test(t2)) row[role] = t2;
        }
        if (bands[i].length) row.bands = bands[i].sort((p, q) => p.y - q.y).map(({ y, ...b }) => b);
        rows.push(row);
      }
    }
  }
  return rows;
}
