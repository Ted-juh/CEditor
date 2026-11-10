// read-nord-cc.mjs — a Nord manual's MIDI controller list -> its rows as printed, decided nothing.
//
// Every Nord manual prints its panel's controllers as a list near the end, a parameter's name and
// its number: `Nord Lead A1 parameter  MIDI CC`, `Nord Stage 4 Parameter  CC#/NRPN` (`2:22` an NRPN,
// its MSB and LSB), `Nord Lead 3 Parameter  MIDI Controller #  MIDI Controller Name`, `MIDI CC
// Parameter` (the drums, the number first), `Function  MIDI CC Number  Comment` (the C1, its header
// over three lines). Up to three lists stand side by side, and each starts where its header is: the
// Lead A1's left one under a paragraph, its right one at the top of the page. So a header gives each
// list on it its columns, and a line's words between one list's start and the next's are a row of
// that list where its number column holds one.

import { execFileSync } from 'node:child_process';

import { pageLines } from '../waldorf/read-waldorf-sysex.mjs';

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();

/** The document's lines on these pages (`pdftotext -bbox`). */
export function documentLines(pdf, pages) {
  const xml = execFileSync('pdftotext', ['-f', String(pages[0]), '-l', String(pages.at(-1)), '-bbox', pdf, '-'], { maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return pageLines(xml).map((l) => ({ ...l, page: l.page + pages[0] - 1 }));
}

// What a header's columns say: the name column's title ends in `Parameter` (or is `Function`); the
// number column's is `MIDI CC`, `MIDI CC #`, `MIDI Controller #`, `MIDI CC Number`, `CC#/NRPN`; a
// column after it (`MIDI Controller Name`, `Comment`) is kept as printed.
const NAME = /(?:^|\s)(?:Parameter|parameter|Function)$/;
const NUMBER = /^(?:MIDI\s+)?(?:CC|Controller)(?:\s*#|\s+Number)?$|^CC#\/NRPN$/;
const EXTRA = /^(?:MIDI\s+Controller\s+Name|Comment)$/;
// The words a header's second and third lines are made of (`Parameter  Controller  Name` under
// `Nord Wave  MIDI  MIDI Controller`).
const HEADER_WORD = /^(?:Parameter|Controller|Name|Number|CC|MIDI|Comment|#|Function)$/;

/** A line's words grouped into columns: words set less than 9 points apart are one. */
const columnsOf = (words) => {
  const cols = [];
  for (const w of [...words].sort((a, b) => a.x0 - b.x0)) {
    const prev = cols.at(-1);
    if (prev && w.x0 - prev.x1 < 9) { prev.words.push(w); prev.x1 = Math.max(prev.x1, w.x1); } else cols.push({ x: w.x0, x1: w.x1, words: [w] });
  }
  return cols;
};

/**
 * A header on these lines (one, or up to three set one under another): its lists, [{ from, name,
 * number, extra?, reversed? }] (x positions), or [] when they are not one. Stacked lines' words are
 * one column where they overlap (`MIDI` over `Controller`).
 */
export function headerLists(stack) {
  const words = stack.flatMap((l, i) => l.words.map((w) => ({ ...w, row: i })));
  const cols = [];
  // (On its own line, a word joins the column whose last word on that line ends less than 9 points
  // before it; on another line, the column it overlaps.)
  for (const w of [...words].sort((a, b) => a.x0 - b.x0)) {
    const col = cols.find((c) => (c.ends.has(w.row) ? w.x0 - c.ends.get(w.row) < 9 : w.x0 < c.x1 + 9 && w.x1 > c.x - 9));
    if (col) { col.words.push(w); col.x = Math.min(col.x, w.x0); col.x1 = Math.max(col.x1, w.x1); col.ends.set(w.row, w.x1); } else cols.push({ x: w.x0, x1: w.x1, words: [w], ends: new Map([[w.row, w.x1]]) });
  }
  const labelled = cols.sort((a, b) => a.x - b.x).map((c) => ({ x: c.x, x1: c.x1, label: text([...c.words].sort((a, b) => a.row - b.row || a.x0 - b.x0)) }));
  const lists = [];
  for (let i = 0; i < labelled.length - 1; i++) {
    const [a, b] = [labelled[i], labelled[i + 1]];
    if (NAME.test(a.label) && NUMBER.test(b.label)) {
      const extra = labelled[i + 2] && EXTRA.test(labelled[i + 2].label) ? labelled[i + 2] : undefined;
      // (A list's names may start left of its header: the Stage 2's by 13 points.)
      lists.push({ from: a.x - 16, name: a.x, number: b.x, ...(extra ? { extra: extra.x } : {}), end: (extra ?? b).x1 });
      i += extra ? 2 : 1;   // (the next list's name column follows this one's number)
    } else if (NUMBER.test(a.label) && NAME.test(b.label)) {
      lists.push({ from: a.x - 16, name: b.x, number: a.x, reversed: true, end: b.x1 });
      i += 1;
    }
  }
  return lists;
}

// A cell of the number column: a controller (`74`), an NRPN (`2:22`), a run of them (`2:32-34`), two
// controllers (`59, 65`), a run of controllers (`16-24`), or an NRPN with its value bytes (`3:4:x:x`).
const VALUE = /^(?:\d{1,3}(?::(?:\d{1,3}|x))*(?:-\d{1,3})?,?)$/;

/**
 * A line's words in one list -> { name, value, extra } or null. The number is the run of value words
 * after the widest gap that leaves only value words (`Organ Drawbar 9  24`: the `9` is the name's);
 * reversed (`10  Pan`), the first word.
 */
export function rowOf(words, list) {
  if (!words.length) return null;
  const extraAt = list.extra !== undefined ? list.extra - 6 : Infinity;
  const main = words.filter((w) => w.x0 < extraAt);
  // A range after the number (`44 (0-127)`, the Stage 2's) is kept as printed, beside it.
  const range = main.length > 1 && /^\(\d+\s*-\s*\d+\)$/.test(main.at(-1).text) ? main.pop().text : '';
  const extra = text([...(range ? [{ text: range }] : []), ...words.filter((w) => w.x0 >= extraAt)]);
  if (list.reversed) {
    if (!VALUE.test(main[0].text) || main[0].x0 > list.name - 6) return { name: text(main), value: '', extra };
    return { name: text(main.slice(1)), value: main[0].text, extra };
  }
  let start = main.length;
  for (let i = main.length - 1; i > 0; i--) {
    if (!VALUE.test(main[i].text)) break;
    if (main[i].x0 - main[i - 1].x1 >= 10) start = i;
  }
  // (A value set where the number column is, not a number at the end of a name in the name column.)
  if (start < main.length && main[start].x0 < list.number - 45) start = main.length;
  return { name: text(main.slice(0, start)), value: main.slice(start).map((w) => w.text).join(' '), extra };
}

/**
 * The lists on these lines: [{ page, name, value, extra?, heading? }], each list's rows in order and
 * the lists on a page left to right. A line in a list with no number is a heading where it ends in
 * `parameters` (the Lead 3's `Voice mode parameters`) or names a part (the Electro 3's `Drawbars -
 * Preset 1/Lower`), kept with each row after it; the rest of the row above where it starts in
 * lower case (`menu)`), and otherwise not the list's (a paragraph beside it). `lists` are lists the
 * layout places, from the top of their page: a list carried into a column with no header of its own
 * (the Drum 2's, over the paragraph that ends its page).
 */
export function readControllerList(lines, { skip = /\|/, lists: placed = [] } = {}) {
  const rows = [];
  // A heading at the foot of a page is over the rows at the head of the next (the Lead 3's).
  let carried;
  for (const page of [...new Set(lines.map((l) => l.page))]) {
    const on = lines.filter((x) => x.page === page);
    let lists = placed.filter((x) => x.page === page).map(({ page: p, ...x }) => ({ ...x, rows: [] }));
    // A page's lists, left to right; a list a later header replaced before the one replacing it.
    const ended = [];
    let seq = 0;
    for (const l of lists) l.seq = seq++;
    const flush = () => {
      const all = [...ended, ...lists].sort((a, b) => Math.round(a.from / 40) - Math.round(b.from / 40) || a.seq - b.seq);
      for (const l of all) rows.push(...l.rows);
      carried = all.at(-1)?.heading;
      lists = [];
    };
    // The words of a line already read as (part of) a header, by line: not rows, nor another header.
    const hidden = new Map();
    const wordsOf = (j) => on[j].words.filter((w) => !(hidden.get(j) ?? []).some(([a, b]) => w.x0 >= a && w.x0 <= b + 4));
    for (let i = 0; i < on.length; i++) {
      const l = on[i];
      if (skip && skip.test(text(l.words))) continue;   // the running header and footer: `48 | Nord Lead 4 …`
      // A header, on this line alone or over the one or two under it; on those, only the header's
      // own words (the list beside it may have a row on the same line).
      let found = [];
      let used = 0;
      for (let n = 1; n <= 3 && !found.length; n++) {
        if (i + n > on.length || (n > 1 && on[i + n - 1].y - on[i + n - 2].y > 14)) break;
        const stack = [{ words: wordsOf(i) }, ...on.slice(i + 1, i + n).map((x, k) => ({ words: wordsOf(i + 1 + k).filter((w) => HEADER_WORD.test(w.text)) }))];
        if (!stack.at(-1).words.length) break;
        found = headerLists(stack);
        used = n;
      }
      if (found.length) {
        // A header replaces the lists that start where its own do, and leaves the others.
        ended.push(...lists.filter((x) => found.some((f) => Math.abs(f.from - x.from) < 40)));
        lists = lists.filter((x) => !found.some((f) => Math.abs(f.from - x.from) < 40));
        for (const f of found) lists.push({ ...f, rows: [], seq: seq++, heading: carried });
        lists.sort((a, b) => a.from - b.from);
        for (let j = i; j < i + used; j++) hidden.set(j, [...(hidden.get(j) ?? []), ...found.map((f) => [f.from, f.end])]);
      }
      const words = wordsOf(i);
      for (const [k, list] of lists.entries()) {
        const to = lists[k + 1]?.from ?? Infinity;
        const own = words.filter((w) => w.x0 >= list.from && w.x0 < to);
        const row = rowOf(own, list);
        if (!row || !row.name) continue;
        if (row.value) {
          list.rows.push({ page, name: row.name, value: row.value, ...(row.extra ? { extra: row.extra } : {}), ...(list.heading ? { heading: list.heading } : {}) });
          list.lastY = l.y;
        } else if ((/parameters:?$/i.test(row.name) || / - /.test(row.name)) && Math.abs(own[0].x0 - list.name) < 20) {
          list.heading = row.name.replace(/:$/, '').replace(/^[“"](.*?)[”"]/, '$1');
        } else if (/^[a-z(]/.test(row.name) && list.rows.length && l.y - list.lastY <= 14) {
          list.rows.at(-1).name += ` ${row.name}`;
          list.lastY = l.y;
        }
      }
    }
    flush();
  }
  return rows;
}
