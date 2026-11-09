// read-nrpn-tables.mjs — Sequential's NRPN parameter tables, read from the manual's own text.
//
// Every Sequential and Dave Smith Instruments manual since the Prophet '08 prints its parameters
// as a table of NRPN numbers, the range each takes, and a name, often with what each value means
// on the lines beneath. The columns come in several orders, and two or three tables are usually
// printed side by side on a page:
//
//   NRPN  Range  Description            Prophet-6, Trigon-6, Pro 2, Prophet 12 globals, Tetra
//     1027   0-3   MIDI Clock Mode
//                  0 = Off
//                  1 = Master
//   Name  NRPN  Range                   Prophet-5/10, Take 5
//     OSC A FREQUENCY   0   0-120
//   NRPN Layer A  NRPN Layer B  Value  Description        Prophet Rev2, Prophet 12
//     0   512   0-120   Osc 1 Pitch
//   Parm  NRPN  Range  Description      Prophet '08, Mopho, Tetra (the program byte, then the NRPN)
//
// A table is found by its header; each occurrence of the header on a line is one column of tables,
// and a row belongs to the column whose header it sits under, so side-by-side tables do not mix.
// A line in a column that does not start a row continues the row above: a wrapped name, or one of
// its value labels. Nothing here decides what a row means; build-nrpn-profile.mjs does.

import { execFileSync } from 'node:child_process';

/** The whole document as text, one string per page. */
export function documentPages(pdf) {
  return execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).split('\f');
}

const DASH = '[-–—]';
const FIELD = {
  nrpn: `(\\d{1,5}(?:\\s*${DASH}\\s*\\d{1,5})?|x)`,
  // Layer B's number, or N/A for a parameter of the whole program (the Rev2's A/B Mode).
  nrpnB: `(\\d{1,5}(?:\\s*${DASH}\\s*\\d{1,5})?|N\\/A|[Xx])`,
  param: '(\\d{1,5})',
  // A range, or what stands in for one: `n/a` beside the MSB half of a two-byte value (the Take 5's
  // FilterFreqMSB), `---` for an unused number (the Fourm's), a negative range (`-700-700`).
  range: `(-?\\d{1,5}\\s*${DASH}\\s*-?\\d{1,5}|-?\\d{1,5}\\s*${DASH}|\\d{1,5},\\s*\\d{1,5}|\\d{1,5}|n\\/a|N\\/A|-{3})`,
  name: '(\\S.*?)',
  desc: '(\\S.*?)',
};
const TEXT = new Set(['name', 'desc']);

/** The pattern a row of this table starts with, from its fields in printed order. */
export function rowPattern(fields) {
  let source = '^\\s*';
  fields.forEach((field, i) => {
    const last = i === fields.length - 1;
    source += FIELD[field];
    if (!last) source += TEXT.has(field) ? '\\s{2,}' : '\\s+';
  });
  // A name printed last is all that is left; anything printed after a last number is a note. A
  // range printed last may be missing altogether (the Fourm's `4  Osc 1 Freq MSB`): such a row is
  // still a row, so it does not run into the one above, and the builder leaves it out.
  if (fields.at(-1) === 'range' && TEXT.has(fields.at(-2))) source = source.replace(/\\s\{2,\}\(-\?.*$/, `(?:\\s{2,}${FIELD.range})?`);
  source += TEXT.has(fields.at(-1)) ? '\\s*$' : '(?:\\s{2,}(\\S.*?))?\\s*$';
  return new RegExp(source);
}

/** `236-255` -> [236, 255]; `12` -> [12, 12]; `x` -> null. */
export function span(text) {
  if (text === 'x' || text === 'X' || text === 'N/A') return null;
  const m = new RegExp(`^(\\d+)\\s*${DASH}\\s*(\\d+)$`).exec(text.trim());
  return m ? [Number(m[1]), Number(m[2])] : [Number(text), Number(text)];
}

// Page furniture: `78   Appendix C: MIDI Implementation   Sequential`, `Prophet-6 Operation Manual … 79`.
const FURNITURE = /(Appendix [A-Z]\b|Operation Manual|User[’']?s Guide|Users Guide|MIDI Implementation(?! Chart)|^\s*\d+\s*$|^\s*Sequential\s*$)/;
// Where a table ends: a footnote, or the heading of what follows it.
const STOP = /^(\*|†|Received |Transmitted |Request |Sysex|SysEx|Universal |Program Data|Global Parameter(s)? Data Dump|Notes?:)/;
// A line under a header that only continues the header (`Layer   Layer`, `A   B`, `scrip-  tion`).
const HEADER_WORDS = /^(?:(?:NRPN#?|Layer|A|B|Value|Range|Description|De-|scrip-|tion|Name|Param|Parm|Number|\(Continued\))\s*)+$/i;

/** The start of a row, unanchored at its end: where on a line a table's column can begin. */
export function rowStart(fields) {
  let source = '^';
  // Up to and including the first name, so a column cannot start on numbers alone; a table that
  // starts with its name also needs the numbers after it.
  const text = fields.findIndex((f) => TEXT.has(f));
  fields.slice(0, text === 0 ? 3 : text + 1).forEach((field, i, list) => {
    // A name starts with a letter. Without that, a range followed by the next table's numbers
    // (the Prophet X's `0-120    72   2120   Inst2Start`) reads as a row starting at the range.
    if (TEXT.has(field)) source += i === 0 ? '[A-Za-z][^\\s].*?' : '[A-Za-z(]';
    else source += FIELD[field];
    if (i < list.length - 1) source += TEXT.has(field) ? '\\s{2,}' : '\\s+';
  });
  return new RegExp(source);
}

/**
 * Where this page's tables start, from its rows rather than its headers.
 *
 * A header is centred over its column and a row is not: the Prophet-6's right-hand table prints
 * `NRPN` eight characters right of where its numbers start, so a column cut at the header splits
 * `109` into `10` and `9`. The rows themselves say where the columns are: every place a row starts
 * on a line, after two spaces or at the margin, counted over the page; the `count` most used
 * positions (one per header on a header line) are the columns.
 */
function columnStarts(lines, startRe, count) {
  const seen = new Map();
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      if (line[i] === ' ' || (i > 0 && !(i <= 2 ? /^\s*$/.test(line.slice(0, i)) : line.slice(i - 2, i) === '  '))) continue;
      if (startRe.test(line.slice(i))) seen.set(i, (seen.get(i) ?? 0) + 1);
    }
  }
  // Positions within three characters are one column (a two-digit number starts one later).
  const clusters = [];
  for (const [at, n] of [...seen].sort((a, b) => a[0] - b[0])) {
    const last = clusters.at(-1);
    if (last && at - last.end <= 3) { last.end = at; last.n += n; } else clusters.push({ start: at, end: at, n });
  }
  return clusters.sort((a, b) => b.n - a.n).slice(0, count).map((c) => c.start).sort((a, b) => a - b);
}

/**
 * Every row of every table matching `spec` in `pages`.
 *
 * spec.header   a global RegExp; each match on a line is one table, side by side.
 * spec.fields   the fields in printed order (`nrpn`, `nrpnB`, `param`, `range`, `name`, `desc`).
 * spec.pages    [first, last], 1-based, to read only the pages the tables are on.
 */
export function readTables(pages, spec) {
  const rowRe = rowPattern(spec.fields);
  // A row printed without its range (the Prophet 12's `480  992  Name Character 1`) is still a row
  // when two numbers start it, so it does not become part of the row above. With one number it
  // would be indistinguishable from a wrapped name (`1 Dest On/Off`), so it is not tried.
  const withoutRange = spec.fields.filter((f) => f !== 'range');
  const numbersFirst = withoutRange.findIndex((f) => TEXT.has(f));
  const looseRe = withoutRange.length < spec.fields.length && numbersFirst >= 2 ? rowPattern(withoutRange) : null;
  const startRe = rowStart(spec.fields);
  const [first, last] = spec.pages ?? [1, pages.length];
  const rows = [];

  // A table that runs onto the next page without printing its header again (the Tetra's, the
  // Mopho's) carries on there, with as many columns as it had.
  let carry = 0;
  // Footnotes, page by page: a mark means what the footnote printed with ITS table says. The Pro 2
  // uses † for "transmitted, but ignored when received" under its globals and for "the first 7
  // bits set the slew value" under its sequencer.
  const footnotes = new Map();
  for (let p = first; p <= last; p++) {
    for (const raw of (pages[p - 1] ?? '').split('\n')) {
      for (const m of raw.matchAll(/(?:^|\s{2,})([*†‡])\s*([A-Z][^*†‡]{10,}?)\s*(?=\s{3,}|$)/g)) {
        if (!footnotes.has(p)) footnotes.set(p, {});
        footnotes.get(p)[m[1]] ??= m[2].trim();
      }
    }
  }
  for (let p = first; p <= last; p++) {
    // A footnote printed beside the table rather than under it (the Rev2's `Pot Mode   *Controller
    // received, but not transmitted.`) is not part of any row; it is cut off before the columns are.
    const lines = (pages[p - 1] ?? '').split('\n')
      .map((line) => line.replace(/\t/g, ' ').replace(/\s{2,}[*†‡]\s*[A-Z][a-z]+ [a-z].*$/, ''));
    const headerAt = new Map();
    const headerCols = [];
    lines.forEach((line, i) => {
      const found = [...line.matchAll(spec.header)];
      if (found.length) headerAt.set(i, found.length);
      for (const m of found) if (!headerCols.some((c) => Math.abs(c - m.index) <= 6)) headerCols.push(m.index);
    });
    if (!headerAt.size && !carry) continue;
    const firstHeader = headerAt.size ? Math.min(...headerAt.keys()) : -1;
    // As many columns as the page prints headers in different places: the Prophet X prints a
    // two-page spread, each half with its own header line, so no one line shows all four.
    const count = headerAt.size ? headerCols.length : carry;
    const starts = columnStarts(lines.slice(firstHeader + 1), startRe, count);
    if (!starts.length) { carry = 0; continue; }
    const columns = starts.map((col) => ({ col, current: null }));
    let open = !headerAt.size;

    lines.forEach((line, i) => {
      if (headerAt.has(i)) { open = true; for (const c of columns) c.current = null; return; }
      if (!open) return;
      // Page furniture (`8   Fourm MIDI Implementation`) can look like a row with no range.
      if (FURNITURE.test(line.trim()) && !/\d\s*[-–]\s*\d/.test(line)) return;
      if (STOP.test(line.trim()) && line.search(/\S/) <= 2) { open = false; return; }
      columns.forEach((c, k) => {
        // The first column starts where its rows do, not at the margin: on a spread the left page's
        // own text is beside it (the Prophet X's Received NRPN Messages, left of its Global table).
        const start = k === 0 ? Math.max(0, c.col - 3) : c.col;
        const end = k + 1 < columns.length ? columns[k + 1].col : line.length;
        // The last column ends where a wide gap opens: a two-page spread puts the next page's
        // text on the same line (the Prophet X's SysEx listing beside its Control NRPN table).
        let segment = line.slice(start, end);
        if (k === columns.length - 1) {
          const gap = segment.search(/\S\s{18,}\S/);
          if (gap >= 0) segment = segment.slice(0, gap + 1);
        }
        const text = segment.trim();
        if (!text || HEADER_WORDS.test(text)) return;
        // A footnote printed in a column (`*Controller received, but not transmitted.`) ends the
        // row above it rather than becoming one of its labels.
        if (/^[*†‡]\s*[A-Za-z]/.test(text) && text.length > 15) { c.current = null; return; }
        // `RESERVED 65-85` (the Prophet-5's), `22  ---  ---`: numbers nothing uses, not part of a row.
        if (/^(\d+(\s*[-–]\s*\d+)?\s+)?RESERVED\b/i.test(text) || /^\d+\s+-{3}\s+-{3}$/.test(text)) { c.current = null; return; }
        const m = rowRe.exec(segment);
        // Only at the table's left edge: a value label under a row (`0  1 voice`) is indented.
        const loose = !m && looseRe && segment.search(/\S/) <= 8 ? looseRe.exec(segment) : null;
        if (m || loose) {
          const row = { page: p, column: k };
          const fields = m ? spec.fields : withoutRange;
          fields.forEach((field, f) => { row[field] = (m ?? loose)[f + 1]?.trim(); });
          const after = m ? m[spec.fields.length + 1] : null;
          row.more = after ? [after.trim()] : [];
          rows.push(row);
          c.current = row;
        } else if (c.current && segment.search(/\S/) > 70) {
          // Far right of a one-column table is the other page of a spread, not this row.
          return;
        } else if (c.current) {
          // Prose at the margin is the page moving on (the Prophet '08's "The following tables list
          // the values…" after its last row), not more of that row.
          if (segment.search(/\S/) <= 2 && text.length > 60 && !/^\d/.test(text)) { c.current = null; open = false; return; }
          c.current.more.push(text.replace(/\s+/g, ' '));
        }
      });
    });
    carry = open ? count : 0;
  }
  // Each marked row gets its mark's footnote: from its own page, else the nearest page after it in
  // the table (a footnote is printed where its table ends), else before.
  for (const row of rows) {
    const marks = [...new Set((`${row.desc ?? ''} ${row.name ?? ''}`.match(/[*†‡]/g) ?? []))];
    for (const mark of marks) {
      const order = [row.page, ...Array.from({ length: last - row.page }, (u, i) => row.page + 1 + i), ...Array.from({ length: row.page - first }, (u, i) => row.page - 1 - i)];
      const at = order.find((p) => footnotes.get(p)?.[mark]);
      if (at !== undefined) (row.footnotes ??= {})[mark] = footnotes.get(at)[mark];
    }
  }
  return rows;
}

/**
 * What a row's continuation lines are: value labels (`0 = Off`, or `0 Off` where the manual prints
 * them bare) and the rest of a name or description that wrapped.
 */
export function splitMore(lines, { labels = 'equals' } = {}) {
  const found = [];
  const text = [];
  const labelRe = labels === 'bare' ? /^(-?\d+)\s*(?:=\s*)?([A-Za-z+\-–'"’(].*)$/ : /^(-?\d+)\s*=\s*(\S.*)$/;
  for (const line of lines) {
    const m = labelRe.exec(line);
    if (m) found.push({ value: Number(m[1]), label: m[2].trim() });
    // A label that wrapped: `2= Sustain Normally Open/` then `Sequencer Normally Closed`.
    else if (found.length && labels !== 'bare') found.at(-1).label += ` ${line}`;
    else text.push(line);
  }
  return { labels: found, text };
}
