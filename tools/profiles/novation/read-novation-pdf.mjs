// read-novation-pdf.mjs — the MIDI parameter tables in Novation's user guides and programmer's
// references, from poppler's word positions (`pdftotext -bbox-layout`).
//
// Novation sets these as tables with a column per field (Section, Parameter, CC/NRPN, Control No.,
// Range, Default Value, Notes), often two side by side on a page, with a cell that does not fit
// wrapped onto lines above and below the row's middle. `pdftotext -layout` interleaves all of that.
// Its bbox output keeps each cell's text together in a block, and every cell of a row is centred on
// the same line, so a row is the cells whose middles line up with its CC/NRPN cell. A cell that lines
// up with no row is a section heading (`Envelopes`, `Filter`), and applies to the rows below it.
// Where a guide sets a whole column as one block (the Circuit Mono Station's), its lines are taken one
// by one.
//
// Decides nothing about what a parameter is: the rows come out as printed.

import { execFileSync } from 'node:child_process';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** A page's blocks, each with its lines and their boxes. */
export function pageBlocks(xml) {
  const blocks = [];
  for (const b of String(xml).matchAll(/<block xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/block>/g)) {
    const lines = [...b[5].matchAll(/<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g)].map((l) => ({
      x0: +l[1], y0: +l[2], x1: +l[3], y1: +l[4],
      text: [...l[5].matchAll(/<word[^>]*>([^<]*)<\/word>/g)].map((w) => decode(w[1])).join(' ').replace(/\s+/g, ' ').trim(),
    })).filter((l) => l.text);
    if (lines.length) blocks.push({ x0: +b[1], y0: +b[2], x1: +b[3], y1: +b[4], lines });
  }
  return blocks;
}

/** What a column heading names. */
const COLUMN_KINDS = [
  ['section', /^(Sectio\s*n?|Section|\(Category\))$/i],
  ['parameter', /^Parameter$/i],
  ['type', /^(CC\s*\/\s*NRPN|CC\s*\/\s*CC\s*\(8\)|CC\s*\/|NRPN)$/i],
  ['number', /^(Control\s*(No\.?|Number\.?)?)$/i],
  ['range', /^(Input )?Range$/i],
  ['default', /^Default\s*(Value)?$/i],
  ['notes', /^(Notes|Remarks)$/i],
  // The MiniNova's chart: a column for the CC, two for the NRPN, and the value as shown.
  ['cc', /^CC$/],
  ['nrpnMsb', /^NRPN MSB$/i],
  ['nrpnLsb', /^NRPN LSB$/i],
  ['mapped', /^Mapped Range$/i],
];
const HEADING_WORD = /^(Sectio|n|Section|\(Category\)|Parameter|CC|CC\/|CC \/|NRPN|CC \/ CC\(8\)|CC\/NRPN|CC \/ NRPN|Control|Control No\.|Control Number\.?|Number\.?|No\.|Range|Default|Value|Default Value|Notes|Remarks|MSB|LSB|Input|Mapped)$/i;
const middle = (box) => (box.y0 + box.y1) / 2;
/** What the CC/NRPN column holds in a row (a heading set across the table is anything else). */
const MESSAGE_TYPE = /^(CC|cc|CC pair|CC\s*\(8\)|NRPN|nrpn|NA|N\/A|prog|Program Change|Pitch ?bend|SysEx)$/i;

/**
 * The tables on a page: [{ columns: [{ kind, x0 }], x0, x1, top }]. A table starts at each
 * `Parameter` heading (or the `Section` heading just left of it); its headings are the heading words
 * on the same band, put together where they sit one above the other (`CC/` over `NRPN`).
 */
export function pageTables(blocks) {
  const lines = blocks.flatMap((b) => b.lines);
  const tables = [];
  for (const p of lines.filter((l) => /^Parameter$/i.test(l.text))) {
    // The headings: heading words on the Parameter heading's band, which a second heading line can
    // reach below it (`CC /` over `NRPN`) but a first row of data does not (the Circuit Tracks' drum
    // table starts 11 points under its headings: a name in the Parameter column says it is data).
    const dataRows = lines.filter((l) => !HEADING_WORD.test(l.text) && Math.abs(l.x0 - p.x0) < 40 && middle(l) > middle(p) + 3).map(middle);
    const band = lines.filter((l) => HEADING_WORD.test(l.text) && Math.abs(middle(l) - middle(p)) <= 14 && !dataRows.some((y) => Math.abs(y - middle(l)) <= 3));
    const columns = [];
    for (const l of band.sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0)) {
      const near = columns.find((c) => Math.abs(c.x0 - l.x0) <= 10);
      if (near) { near.parts.push(l); near.bottom = Math.max(near.bottom, l.y1); near.x1 = Math.max(near.x1, l.x1); near.x0 = Math.min(near.x0, l.x0); }
      else columns.push({ x0: l.x0, x1: l.x1, parts: [l], bottom: l.y1 });
    }
    // A heading over two lines reads top to bottom (`CC /` over `NRPN`).
    for (const c of columns) c.text = c.parts.sort((a, b) => a.y0 - b.y0).map((l) => l.text).join(' ').replace(/\s+/g, ' ');
    for (const c of columns) delete c.parts;
    for (const c of columns) c.kind = COLUMN_KINDS.find(([, re]) => re.test(c.text.replace(/\s*\/\s*/g, ' / ').replace(/CC \/ NRPN/i, 'CC/NRPN').trim()) || re.test(c.text))?.[0] ?? null;
    tables.push({ parameter: p, columns, top: Math.max(...columns.map((c) => c.bottom)) });
  }
  // Two headings on one band are two tables side by side: each keeps the columns from its own
  // Section or Parameter heading to the next table's.
  const out = [];
  const bands = new Map();
  for (const t of tables) {
    const key = [...bands.keys()].find((k) => Math.abs(k - middle(t.parameter)) <= 14) ?? middle(t.parameter);
    bands.set(key, [...(bands.get(key) ?? []), t]);
  }
  // Where each table starts: its Section heading just left of its Parameter heading, or that.
  const startOf = new Map();
  for (const group of bands.values()) {
    const all = group[0].columns.filter((c) => c.kind);
    for (const t of group) {
      const section = all.filter((c) => c.kind === 'section' && c.x0 < t.parameter.x0).at(-1);
      startOf.set(t, section && t.parameter.x0 - section.x0 < 160 && !group.some((o) => o !== t && o.parameter.x0 < t.parameter.x0 && o.parameter.x0 > section.x0) ? section.x0 : t.parameter.x0);
    }
  }
  // A table ends on the right where a table beside it begins (one whose headings are near its own:
  // the Summit's right-hand table starts a little higher than its left-hand one), and at the foot
  // where a table below it begins (the Circuit Rhythm's Sampler Parts under its Macro Knobs).
  const placed = [...startOf].map(([t, x0]) => ({ t, x0, y: middle(t.parameter), headTop: Math.min(...t.columns.map((c) => c.bottom)) - 20 }));
  for (const group of bands.values()) {
    const all = group[0].columns.filter((c) => c.kind);
    for (const t of group) {
      const me = placed.find((p) => p.t === t);
      const x1 = Math.min(...placed.filter((p) => p.x0 > me.x0 + 20 && Math.abs(p.y - me.y) < 80).map((p) => p.x0), Infinity);
      const bottom = Math.min(...placed.filter((p) => p.y > me.y + 20 && p.x0 < x1 - 20).map((p) => p.headTop), Infinity);
      // A table's cells may start a little left of its first heading (the Circuit Tracks' audio table).
      out.push({ x0: me.x0 - 24, x1: x1 - 24, y: me.y, top: Math.max(...group.map((g) => g.top)), bottom, columns: all.filter((c) => c.x0 >= me.x0 - 4 && c.x0 < x1 - 4) });
    }
  }
  // Tables side by side are read left before right, each to the foot of the page; stacked ones top
  // to bottom.
  return out.sort((a, b) => (Math.abs(a.y - b.y) < 80 ? a.x0 - b.x0 : a.y - b.y));
}

/**
 * The column a cell starting at x0 falls in. Some guides set a heading over the start of its column
 * (the Peak's), others centre it over left-aligned cells (the Bass Station II's `Parameter` sits well
 * right of `patch volume`): a column runs from halfway across the gap before its heading to halfway
 * across the gap after it.
 */
function columnOf(table, x0) {
  if (table.starts) return table.columns.filter((c) => x0 >= table.starts[c.kind] - 1).at(-1) ?? null;
  let at = null;
  table.columns.forEach((c, i) => {
    const from = i === 0 ? -Infinity : (table.columns[i - 1].x1 + c.x0) / 2;
    if (x0 >= from - 1) at = c;
  });
  return at;
}

/**
 * The rows of every table on the pages given, in reading order (top table first, left before right;
 * page by page), each { page, section, parameter, type, number, range, default, notes } as printed.
 */
export function readTables(pdf, pages, { columnStarts = null } = {}) {
  const rows = [];
  let section = '';
  let carry = null;
  for (const page of pages) {
    const xml = execFileSync('pdftotext', ['-bbox-layout', '-f', String(page), '-l', String(page), pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const blocks = pageBlocks(xml);
    const headed = pageTables(blocks);
    // A table that runs over the page break carries on at the top of the next page without its
    // headings (the Circuit Tracks' synth table, the MiniNova's chart): the previous page's last
    // table, down to the first heading on this one.
    const tables = carry ? [{ ...carry, top: -Infinity, bottom: Math.min(...headed.map((t) => t.y - 15), Infinity), carried: true }, ...headed] : headed;
    if (headed.length) carry = headed.at(-1);
    for (const table of tables) {
      // A new table with no Section column starts with no section (the Circuit Tracks' drum table
      // after its lookup tables); one with a Section column, or a table carried over, keeps it.
      if (!table.carried && !table.columns.some((c) => c.kind === 'section')) section = '';
      // Where a guide's headings say little about where its cells start, its layout says (in points).
      if (columnStarts) {
        table.starts = columnStarts;
        table.columns = table.columns.filter((c) => columnStarts[c.kind] !== undefined).sort((a, b) => columnStarts[a.kind] - columnStarts[b.kind]);
      }
      const inside = (box) => box.x0 >= table.x0 && box.x0 < table.x1 && middle(box) > table.top && box.y1 < table.bottom;
      // The rows hang on the CC/NRPN column, or where a guide has none (the MiniNova's chart), on
      // the category every row starts with, `(Osc1)`.
      const typeColumn = table.columns.find((c) => c.kind === 'type') ?? (table.columns.some((c) => c.kind === 'cc') ? table.columns.find((c) => c.kind === 'section') : null);
      if (!typeColumn) continue;
      const byCategory = typeColumn.kind === 'section';
      // The rows' middles: the cells of the CC/NRPN column. One is a row when it names a message
      // (`CC`, `NRPN`, `CC pair`) or has a parameter beside it (the Bass Station II's `pitchb`, its
      // `end` wrapped onto the line below); a word there with nothing beside it is a heading set
      // across the table (the Peak's `Envelopes`), and a line just below a row's cell continues it.
      const all = blocks.flatMap((b) => b.lines).filter(inside);
      const parameterColumn = table.columns.find((c) => c.kind === 'parameter');
      const named = (l) => all.some((o) => o !== l && columnOf(table, o.x0) === parameterColumn && Math.abs(middle(o) - middle(l)) <= 3);
      const typeLines = all.filter((l) => columnOf(table, l.x0) === typeColumn).sort((a, b) => a.y0 - b.y0);
      const anchors = [];
      const continued = new Set();
      for (const l of typeLines) {
        if (byCategory) { if (/^\(.+\)$/.test(l.text)) anchors.push({ y: middle(l), type: '', cells: { section: l.text.slice(1, -1) }, bottom: l.y1 }); continue; }
        if (MESSAGE_TYPE.test(l.text) || (/^\w{1,10}$/.test(l.text) && named(l))) { anchors.push({ y: middle(l), type: l.text, cells: {}, bottom: l.y1 }); continue; }
        const above = anchors.at(-1);
        if (above && l.y0 - above.bottom < 6 && (!MESSAGE_TYPE.test(above.type) || /^[a-z]/.test(l.text))) { above.type = `${above.type} ${l.text}`; above.bottom = l.y1; continued.add(l); }
      }
      const nearest = (y) => anchors.find((a) => Math.abs(a.y - y) <= 3);
      const loose = [];
      for (const block of blocks) {
        // A block can reach up into the headings (Peak's `Control / Number. / Envelopes`): only its
        // lines below them count, each on its own.
        const lines = block.lines.filter(inside);
        if (!lines.length) continue;
        // A block is one cell unless its lines each line up with a row of their own (the Circuit Mono
        // Station sets a section's rows as one block per column).
        const ownRows = new Set(lines.map((l) => nearest(middle(l))).filter(Boolean));
        const whole = lines.length === block.lines.length && ownRows.size < 2 ? nearest(middle(block)) : null;
        const pieces = whole ? [{ ...block, text: lines.map((l) => l.text).join(' '), row: whole }]
          : lines.filter((l) => !continued.has(l)).map((l) => ({ ...l, row: nearest(middle(l)) }));
        for (const piece of pieces) {
          const column = columnOf(table, piece.x0);
          if (!piece.row || !column?.kind) { loose.push({ y: middle(piece), text: piece.text, kind: column?.kind ?? null }); continue; }
          if (column === typeColumn) continue;
          piece.row.cells[column.kind] = [piece.row.cells[column.kind], piece.text].filter(Boolean).join(' ');
        }
      }
      // A note, range or default that wrapped onto the line below its row (`3=Small Hall, …` under
      // the Circuit Tracks' reverb type) continues that row's cell.
      for (const l of loose.filter((x) => ['notes', 'range', 'default', 'mapped'].includes(x.kind)).sort((a, b) => a.y - b.y)) {
        const above = anchors.filter((a) => a.y < l.y && l.y - (a.last?.[l.kind] ?? a.y) <= 14 && a.cells[l.kind]).at(-1);
        if (above) { above.cells[l.kind] = `${above.cells[l.kind]} ${l.text}`; (above.last ??= {})[l.kind] = l.y; l.used = true; }
      }
      // Rows and section headings in the order they are printed.
      const events = [...anchors.map((a) => ({ y: a.y, row: a })), ...loose.filter((l) => !l.used && !byCategory && !/^[-–\d(]/.test(l.text) && !['notes', 'range', 'default', 'mapped'].includes(l.kind)).map((l) => ({ y: l.y, heading: l.text }))].sort((a, b) => a.y - b.y);
      for (const e of events) {
        if (e.heading) { section = e.heading; continue; }
        const c = e.row.cells;
        // A row whose only name sits in the Section column is named there.
        if (!c.parameter && c.section) { c.parameter = c.section; delete c.section; }
        // The MiniNova's chart: a CC in its own column, or an NRPN's MSB and LSB in two.
        const type = byCategory ? (c.cc ? 'CC' : c.nrpnLsb ? 'NRPN' : '') : e.row.type;
        const number = byCategory ? (c.cc ?? (c.nrpnLsb ? `${c.nrpnMsb ?? ''}:${c.nrpnLsb}` : '')) : c.number ?? '';
        rows.push({ page, section: c.section ?? section, parameter: c.parameter ?? '', type, number, range: c.range ?? '', ...(c.mapped ? { mapped: c.mapped } : {}), default: c.default ?? '', notes: c.notes ?? '' });
      }
    }
  }
  return rows;
}
