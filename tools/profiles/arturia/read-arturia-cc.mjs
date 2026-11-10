// read-arturia-cc.mjs — an Arturia manual's MIDI CC chart -> its rows as printed, decided nothing.
//
// Arturia prints its instruments' controllers as a chart near the end of the manual, a name and
// then its controller number: `Section  Parameter  CC` (the MiniFreak), `Parameter  CC number` (the
// MicroFreak), a block for each section headed `VCO 1 Parameters  MIDI CC  Resolution` (the
// MatrixBrute), or three such blocks side by side, `MIDI` and `CC` over two lines (the PolyBrute). So
// a header line gives each block its title and its CC column, and a line with a number under a CC
// column is a row of that block.

import { execFileSync } from 'node:child_process';

import { pageLines } from '../waldorf/read-waldorf-sysex.mjs';

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();

/** The document's lines on these pages (`pdftotext -bbox`). */
export function documentLines(pdf, pages) {
  const xml = execFileSync('pdftotext', ['-f', String(pages[0]), '-l', String(pages.at(-1)), '-bbox', pdf, '-'], { maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return pageLines(xml).map((l) => ({ ...l, page: l.page + pages[0] - 1 }));
}

/**
 * A header line's blocks: [{ from, to, cc, title, section?, name, extra? }] (x positions), or [] for a
 * line that is not one. The CC column's title is `CC`, `CC number`, `MIDI CC`, or `MIDI` alone with
 * `CC` on the line below; each ends a block. The words before it are the block's title (`VCO 1
 * Parameters`, `MIDI Parameter`: `MIDI` before `Parameter` is a title), or, where they are `Section`
 * and `Parameter` set apart, its section and name columns. `Resolution` after it is an extra column.
 */
export function headerBlocks(words) {
  // (Not a numbered heading, `16.2.5. MIDI Control Change Messages`, nor a sentence.)
  if (!words.length || /^\d+(?:\.\d+)*\.?$/.test(words[0].text) || words.some((w) => /[:,]$|^\d{2,}$/.test(w.text))) return [];
  if (words.some((w) => /^[a-z]/.test(w.text) && w.text !== 'number')) return [];
  const blocks = [];
  let titles = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    const head = w.text === 'CC' || (w.text === 'MIDI' && !/^Parameters?$/.test(next?.text ?? ''));
    if (head) {
      if (!titles.length) return [];
      if ((w.text === 'MIDI' && next?.text === 'CC') || (w.text === 'CC' && next?.text === 'number')) i++;
      const section = titles.length === 2 && titles[0].text === 'Section' ? titles[0] : null;
      const name = section ? titles[1] : titles[0];
      blocks.push({ from: titles[0].x - 6, cc: w.x0, title: section ? '' : titles.map((t) => t.text).join(' ').replace(/\s*\bParameters?$/, ''), ...(section ? { section: section.x, name: name.x } : { name: name.x }) });
      titles = [];
    } else if (blocks.length && !titles.length && w.text === 'Resolution') {
      blocks.at(-1).extra = w.x0;
    } else {
      // Title words set close together are one title; a gap starts the next (`Section`, `Parameter`).
      const prev = titles.at(-1);
      if (prev && w.x0 - prev.x1 < 9) { prev.text += ` ${w.text}`; prev.x1 = w.x1; } else titles.push({ x: w.x0, x1: w.x1, text: w.text });
    }
  }
  if (titles.length && !blocks.length) return [];
  for (const [i, b] of blocks.entries()) b.to = blocks[i + 1]?.from ?? Infinity;
  return blocks;
}

/**
 * The chart on these lines: [{ page, title, cc, name, extra? }], a row a number under a block's CC
 * column. A block's title is its section (`VCO 1`, `LADDER FILTER`), or the section cell last printed
 * (the MiniFreak's, set once for the rows under it). Lines with no number are not rows: a header's
 * second line (`CC`, `Parameters`), a page's running footer, the prose around the chart.
 */
export function readCcChart(lines) {
  const rows = [];
  for (const page of [...new Set(lines.map((l) => l.page))]) {
    let blocks = [];
    let headerY;
    // A block's rows, in order, then the next block's: side by side on the page, one after the other here.
    const flush = () => { for (const b of blocks) rows.push(...b.rows); blocks = []; };
    for (const l of lines.filter((x) => x.page === page)) {
      if (/^Arturia - User Manual/.test(text(l.words.filter((w) => !/^\d+$/.test(w.text))))) continue;   // the running footer
      const found = headerBlocks(l.words);
      // (A header's second line, `Parameter  CC` under `LADDER FILTER  MIDI CC`, is not another.)
      if (headerY !== undefined && l.y - headerY < 15 && l.words.every((w) => /^(?:Parameters?|CC)$/.test(w.text))) continue;
      if (found.length) { flush(); blocks = found.map((b) => ({ ...b, current: b.title, rows: [] })); headerY = l.y; continue; }
      for (const b of blocks) {
        const own = l.words.filter((w) => w.x0 >= b.from && w.x0 < b.to);
        const n = own.find((w) => /^\d{1,3}$/.test(w.text) && w.x0 >= b.cc - 8 && w.x0 <= b.cc + 20);
        if (!n || Number(n.text) > 127) continue;
        const name = text(own.filter((w) => w.x0 < b.cc - 4 && w.x0 >= (b.section !== undefined ? b.name - 4 : b.from)));
        if (b.section !== undefined) {
          const section = text(own.filter((w) => w.x0 < b.name - 4));
          if (section) b.current = section;
        }
        const extra = text(own.filter((w) => w.x0 > n.x1 + 4));
        if (!name) continue;
        b.rows.push({ page, title: b.current, cc: Number(n.text), name, ...(extra ? { extra } : {}) });
      }
    }
    flush();
  }
  return rows;
}
