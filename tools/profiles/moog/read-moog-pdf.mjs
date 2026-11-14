// read-moog-pdf.mjs — the MIDI CC (and NRPN) tables in Moog's manuals, from poppler's word positions
// (`pdftotext -bbox-layout`).
//
// Moog sets each table with a column per field and its headings printed over them, as the layout
// names them (`CONTROL/PARAMETER`, `MIDI CC #`, `CC VALUE RANGE`; `Parameter`, `CC Number (MSB)`,
// `CC Number (LSB)`, `Values`). A cell that does not fit wraps onto the lines below its row (the Sub
// 37's value lists), or the row's other cells are set in the middle of it (the Muse's, the Subsequent
// 25's), so a row is anchored on its CC (or NRPN) cell and takes the cells of the other columns that
// reach its line. A section label in a column of its own (the Little Phatty's, the Sirin's) is set in
// the middle of the rows it covers.
//
// Decides nothing about what a parameter is: the rows come out as printed.

import { execFileSync } from 'node:child_process';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/\t/g, ' ');
const norm = (s) => String(s).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toUpperCase();

/** One page's words, each with its box, its line and its block. */
export function pageWords(xml) {
  const page = /<page width="([\d.]+)" height="([\d.]+)"/.exec(xml);
  const words = [];
  const lines = [];
  let blockId = 0;
  for (const b of String(xml).matchAll(/<block [^>]*>([\s\S]*?)<\/block>/g)) {
    blockId++;
    for (const l of b[1].matchAll(/<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g)) {
      const line = { id: lines.length, block: blockId, x0: +l[1], y0: +l[2], x1: +l[3], y1: +l[4], words: [] };
      for (const w of l[5].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
        const word = { x0: +w[1], y0: +w[2], x1: +w[3], y1: +w[4], text: decode(w[5]).trim(), line: line.id, block: blockId };
        if (!word.text) continue;
        line.words.push(word);
        words.push(word);
      }
      line.text = line.words.map((w) => w.text).join(' ');
      if (line.words.length) lines.push(line);
    }
  }
  return { width: page ? +page[1] : 612, height: page ? +page[2] : 792, words, lines };
}

const middle = (box) => (box.y0 + box.y1) / 2;

/**
 * Where a heading is printed: a line, or lines stacked one under the other (`CC Number` over
 * `(MSB)`, `MIDI` over `CC#`), whose words read as the heading. `{ x }` is a column with no heading,
 * starting there.
 */
function findHeadings(lines, heading, near = null) {
  if (typeof heading === 'object' && heading.x !== undefined) return [{ x0: heading.x, x1: heading.x, y0: null, y1: null }];
  const want = norm(heading);
  const fits = (box) => !near || (box.x0 >= near.x1 - 1 && Math.abs(box.y0 - near.y0) < 20);
  const out = [];
  // Words in a row on one line.
  for (const line of lines) {
    for (let i = 0; i < line.words.length; i++) {
      let text = '';
      for (let j = i; j < line.words.length; j++) {
        text = norm(`${text} ${line.words[j].text}`);
        if (!want.startsWith(text)) break;
        const box = { x0: line.words[i].x0, x1: line.words[j].x1, y0: line.y0, y1: line.y1 };
        if (text === want && fits(box)) out.push(box);
      }
    }
  }
  // Lines stacked one under the other.
  for (const first of lines) {
    let box = { x0: first.x0, x1: first.x1, y0: first.y0, y1: first.y1 };
    let text = norm(first.text);
    for (let k = 0; k < 3 && want.startsWith(text) && text !== want; k++) {
      const next = lines.filter((l) => l.y0 >= box.y1 - 2 && l.y0 - box.y1 < 8 && l.x0 < box.x1 + 4 && l.x1 > box.x0 - 4).sort((x, y) => x.y0 - y.y0)[0];
      if (!next) break;
      box = { x0: Math.min(box.x0, next.x0), x1: Math.max(box.x1, next.x1), y0: box.y0, y1: next.y1 };
      text = norm(`${text} ${next.text}`);
      if (text === want && fits(box)) out.push(box);
    }
  }
  return out.sort((x, y) => x.y0 - y.y0 || x.x0 - y.x0);
}

/** The table's headings: the first place on the page where all of them are found, in order across one band. */
function findColumns(lines, columns) {
  const firstText = columns.find(([, h]) => typeof h === 'string');
  for (const start of firstText ? findHeadings(lines, firstText[1]) : []) {
    const found = [];
    let near = null;
    let ok = true;
    for (const [kind, heading] of columns) {
      const box = heading === firstText[1] && !near ? start : findHeadings(lines, heading, near)[0];
      if (!box) { ok = false; break; }
      found.push({ kind, box });
      if (box.y0 !== null) near = box;
    }
    if (ok) return found;
  }
  return null;
}

// A row's anchor: its controller, or a dash or `Varies` where the row has none (it still takes its
// place among the rows, which a section label is centred on).
const ANCHOR = /^((?:CC|MSB)?\s*#?\s*\d|[-–—]$|Varies$)/i;
/** An anchor line that is the second half of the row above: `35(LSB)`, `51 (LSB)`, `36 (fine)`, `LSB 42`. */
const CONTINUES = /^(\d+\s*[([]\s*(LSB|fine)\s*[)\]]|LSB\s*\d+)$/i;

/**
 * The rows of a table on these pages.
 *
 *   columns: [[kind, heading], …] in order across the page; a heading as printed, or { x } for a
 *            column printed without one. One kind is the anchor (`cc`, or the layout's `anchor`).
 *   options: { anchor, end: RegExp (the line the table stops at), valign: 'top' | 'middle',
 *              sections: 'middle' | 'top' (how a section label sits over its rows), left, right,
 *              merged: [[anchor text, …]] (rows whose cell in another column is printed once, across them) }
 *
 * -> [{ page, section, ...cells }], each cell its text as printed, lines joined with a space.
 */
export function pageRows(xml, columns, options = {}, carried = null) {
  const { words, lines, height } = pageWords(xml);
  const anchorKind = options.anchor ?? 'cc';
  // The headings, across the page in the order given, on one band.
  let found = findColumns(lines.filter((l) => l.x0 >= (options.left ?? -Infinity) - 1 && l.x0 < (options.right ?? Infinity)), columns);
  let top;
  if (found) {
    top = Math.max(...found.filter((c) => c.box.y0 !== null).map((c) => c.box.y1));
  } else if (carried) {
    // A page that continues the table without its headings.
    found = carried.found;
    top = 0;
  } else {
    return { rows: [], state: null };
  }
  const left = options.left ?? -Infinity;
  const right = options.right ?? Infinity;
  // The table's body: below its headings, above the line it stops at and the page's foot.
  const stop = options.end ? lines.filter((l) => l.y0 > top && options.end.test(l.text)).map((l) => l.y0).sort((a, b) => a - b)[0] ?? Infinity : Infinity;
  // The page's foot: a page number alone on its line (a value in the table's last row has its name beside it).
  const foot = (l) => l.y0 > height - 70 && /^(Page\s+)?\d+$/i.test(l.text.trim()) && !lines.some((o) => o !== l && o.y0 < l.y1 && o.y1 > l.y0);
  const body = lines.filter((l) => l.y0 > top + 0.5 && l.y1 < stop && !foot(l));
  // Each column starts in the widest gap the body's words leave between its heading and the one
  // before it: a heading centred over its column (`Values`) starts right of the column's cells.
  const bodyWords = body.flatMap((l) => l.words).filter((w) => w.x0 >= left && w.x0 < right);
  const gapAt = (a, b) => {
    if (!(b > a)) return null;
    // Every point from a to b and how many words cover it: the middle of the longest run of the fewest.
    let best = null;
    let run = null;
    for (let x = Math.floor(a); x <= Math.ceil(b); x++) {
      const n = bodyWords.filter((w) => w.x0 < x + 0.5 && w.x1 > x - 0.5).length;
      if (run && run.n === n) run.to = x;
      else run = { n, from: x, to: x };
      if (!best || run.n < best.n || (run.n === best.n && run.to - run.from > best.to - best.from)) best = { ...run };
    }
    return (best.from + best.to) / 2;
  };
  const starts = found.map((c, i) => {
    if (i === 0) return -Infinity;
    if (options.starts?.[c.kind] !== undefined) return options.starts[c.kind];
    if (c.box.y0 === null) return c.box.x0;
    const prev = found[i - 1].box;
    return gapAt(Math.min(prev.x1, c.box.x0 - 1), c.box.x0) ?? (prev.x1 + c.box.x0) / 2;
  });
  const columnOf = (w) => {
    if (w.x0 >= right) return null;
    let k = null;
    for (let i = 0; i < found.length; i++) if (w.x0 >= starts[i] - 0.5) k = found[i].kind;
    return k;
  };
  // Cut each line into its columns' cells.
  const pieces = [];
  for (const l of body) {
    const byColumn = new Map();
    for (const w of l.words) {
      if (w.x0 < left) continue;
      const k = columnOf(w);
      if (!k) continue;
      if (!byColumn.has(k)) byColumn.set(k, []);
      byColumn.get(k).push(w);
    }
    for (const [kind, ws] of byColumn) pieces.push({ kind, block: l.block, line: l.id, x0: Math.min(...ws.map((w) => w.x0)), y0: Math.min(...ws.map((w) => w.y0)), y1: Math.max(...ws.map((w) => w.y1)), text: ws.map((w) => w.text).join(' ') });
  }
  // The rows: an anchor cell each, with the line under it that is its second half.
  const rows = [];
  for (const p of pieces.filter((x) => x.kind === anchorKind).sort((a, b) => a.y0 - b.y0)) {
    const last = rows.at(-1);
    if (last && CONTINUES.test(p.text.trim()) && p.y0 - last.y1 < 8) { last.anchor.push(p); last.y1 = p.y1; continue; }
    if (!ANCHOR.test(p.text.trim()) && !(options.anchorText && options.anchorText.test(p.text.trim()))) { if (last && p.y0 - last.y1 < 4) { last.anchor.push(p); last.y1 = p.y1; } continue; }
    rows.push({ anchor: [p], y0: p.y0, y1: p.y1, cells: {} });
  }
  for (const r of rows) r.mid = (r.y0 + r.y1) / 2;
  // The other columns' cells: a block's lines in one column are one cell, and the cell goes to the
  // row whose line it reaches. A cell reaching two rows' lines is two rows' cells set close together:
  // each line goes to its own row (the nearest above, where the table sets its rows from the top).
  const cells = new Map();
  for (const p of pieces.filter((x) => x.kind !== anchorKind && x.kind !== 'section')) {
    const key = `${p.kind}:${p.block}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(p);
  }
  const nearest = (y) => rows.reduce((best, r) => (!best || Math.abs(r.mid - y) < Math.abs(best.mid - y) ? r : best), null);
  const owner = (y, valign) => (valign === 'top' ? [...rows].reverse().find((r) => r.y0 <= y + 3) ?? rows[0] : nearest(y));
  const put = (row, p) => { if (row) (row.cells[p.kind] ??= []).push(p); };
  for (const parts of cells.values()) {
    const box = { y0: Math.min(...parts.map((p) => p.y0)), y1: Math.max(...parts.map((p) => p.y1)) };
    const reached = rows.filter((r) => r.mid >= box.y0 - 1 && r.mid <= box.y1 + 1);
    if (reached.length === 1) { for (const p of parts) put(reached[0], p); continue; }
    // A cell the layout says is printed once for several rows (the Sirin's bend amounts): each row's.
    const merged = (options.merged ?? []).find((group) => reached.length > 1 && reached.every((r) => group.includes(r.anchor.map((a) => a.text).join(' ').trim())));
    if (merged) { for (const r of reached) for (const p of parts) put(r, p); continue; }
    if (reached.length > 1) { for (const p of parts) put(owner(middle(p), options.valign), p); continue; }
    // Reaching no row's middle: the row whose anchor it is level with (a name on the line of the
    // MSB, its LSB below), or, where rows are set from the top, the row it is wrapped under. A cell
    // level with no anchor is a row printed without a controller (`PITCH WHEEL`), and is no row's.
    const level = rows.filter((r) => r.y0 <= box.y1 + 1 && r.y1 >= box.y0 - 1);
    if (level.length) { for (const p of parts) put(level.length === 1 ? level[0] : owner(middle(p), options.valign), p); continue; }
    if (options.valign === 'top') {
      const by = owner(box.y0, 'top');
      if (by && box.y0 > by.y0 && box.y0 - by.y1 < (options.reach ?? 14)) for (const p of parts) put(by, p);
    }
  }
  // Section labels, each set in the middle of the rows it covers (or over the first of them).
  const labels = [];
  for (const p of pieces.filter((x) => x.kind === 'section').sort((a, b) => a.y0 - b.y0)) {
    const last = labels.at(-1);
    // A label over two lines; set on its side (the Little Phatty's), its lines stand side by side.
    if (last && p.y0 - last.y1 < 4) {
      const across = Math.min(p.y1, last.y1) - Math.max(p.y0, last.y0) > 0.5 * (p.y1 - p.y0);
      last.text = across && p.x0 < last.x0 ? `${p.text} ${last.text}` : `${last.text} ${p.text}`;
      last.y0 = Math.min(last.y0, p.y0); last.y1 = Math.max(last.y1, p.y1); last.x0 = Math.min(last.x0, p.x0);
    } else labels.push({ text: p.text, x0: p.x0, y0: p.y0, y1: p.y1 });
  }
  for (const r of rows) {
    const all = [...r.anchor, ...Object.values(r.cells).flat()];
    r.top = Math.min(...all.map((p) => p.y0));
    r.bottom = Math.max(...all.map((p) => p.y1));
  }
  if (labels.length && rows.length) {
    if (options.sections === 'top') {
      for (const r of rows) r.section = [...labels].reverse().find((l) => l.y0 <= r.bottom)?.text ?? carried?.section ?? '';
    } else {
      // The labels split the rows into runs, one each in order, so that each label sits as near the
      // middle of its run as can be: the split that is out by the least in all.
      const L = labels.length;
      const R = rows.length;
      const centre = (i, j) => (rows[i].top + rows[j].bottom) / 2;
      const cost = Array.from({ length: L + 1 }, () => new Array(R + 1).fill(Infinity));
      const from = Array.from({ length: L + 1 }, () => new Array(R + 1).fill(-1));
      cost[0][0] = 0;
      for (let i = 1; i <= L; i++) {
        const c = middle(labels[i - 1]);
        for (let j = i; j <= R; j++) {
          for (let k = i - 1; k < j; k++) {
            if (cost[i - 1][k] === Infinity) continue;
            const total = cost[i - 1][k] + Math.abs(centre(k, j - 1) - c);
            if (total < cost[i][j]) { cost[i][j] = total; from[i][j] = k; }
          }
        }
      }
      if (L <= R) {
        for (let i = L, j = R; i > 0; j = from[i][j], i--) for (let k = from[i][j]; k < j; k++) rows[k].section = labels[i - 1].text;
      } else {
        for (const r of rows) r.section = labels.reduce((best, l) => (Math.abs(middle(l) - r.mid) < Math.abs(middle(best) - r.mid) ? l : best)).text;
      }
    }
  }
  // A word broken over two lines keeps its hyphen and loses the space (`TRIP-` over `LET`).
  const text = (parts) => parts.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0).map((p) => p.text).join(' ').replace(/([A-Za-z])- (?=[A-Za-z])/g, '$1-').replace(/\s+/g, ' ').trim();
  const out = rows.map((r) => ({
    section: r.section ?? (labels.length ? '' : carried?.section ?? ''),
    [anchorKind]: text(r.anchor),
    ...Object.fromEntries(columns.map(([k]) => k).filter((k) => k !== anchorKind && k !== 'section').map((k) => [k, r.cells[k] ? text(r.cells[k]) : ''])),
  }));
  return { rows: out, state: { found, section: out.at(-1)?.section ?? carried?.section ?? '' } };
}

/**
 * A document's table over its pages. A page is its number, or { page, left, right } where the table
 * is one half of a spread (the Minitaur's manual prints two pages on each sheet).
 */
export function readTable(pdf, pages, columns, options = {}) {
  const rows = [];
  let state = null;
  for (const spec of pages) {
    const { page, ...side } = typeof spec === 'object' ? spec : { page: spec };
    const xml = execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-bbox-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const got = pageRows(xml, columns, { ...options, ...side }, options.carry === false ? null : state);
    for (const r of got.rows) rows.push({ page, ...r });
    if (got.state) state = got.state;
  }
  return rows;
}
