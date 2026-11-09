// extract-text.mjs — a Roland MIDI Implementation PDF as text, one column after another.
//
//   node tools/profiles/roland/extract-text.mjs <document.pdf> [out.txt]
//
// Needs poppler's `pdftotext` and `pdfinfo` on PATH (`apt-get install poppler-utils`, or the
// poppler build for Windows). Nothing here ships: it is the first step of turning a manual into an
// address map, and the map, not the PDF, is what gets committed. The PDFs are Roland's copyright
// and stay out of the repository.
//
// Why per column: Roland typesets these documents two ways. The older ones (SH-01, SH-201) run one
// table across the full page width; the newer ones (JD-Xi onwards) set the page in two columns, each
// holding a table eighty characters wide in a smaller font. pdftotext's -layout keeps both columns
// on one line of output for the second kind, so a table that runs down the left column and carries
// on at the top of the right one comes out interleaved with whatever sits beside it. Cropping each
// half and extracting it on its own gives the reading order back.
//
// Which kind a page is gets decided per page, from the full-width extraction: a table border
// (`+-----`) that STARTS past the middle of the line can only belong to a right-hand column.

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`${command} could not run (${result.error.message}); install poppler-utils`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

/**
 * Every page's size. pdftotext measures -x/-y from the page's MEDIA box, so that is the box halved —
 * checked the hard way: halving the crop box instead (the XV-5080's owner's manual crops every page
 * to 123 - 719 of an 842-point sheet) lost the SD-90 a tenth of its rows. Where the gutter is not at
 * the middle, splitAtGutter below is what copes.
 */
function pageGeometry(pdf) {
  const pages = Number(/^Pages:\s+(\d+)/m.exec(run('pdfinfo', [pdf]))?.[1] ?? 0);
  if (!pages) throw new Error(`pdfinfo did not report a page count for ${pdf}`);
  const info = run('pdfinfo', ['-f', '1', '-l', String(pages), '-box', pdf]);
  const boxes = new Map();
  for (const match of info.matchAll(/^Page\s+(\d+)\s+(MediaBox|CropBox):\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/gm)) {
    const [, page, kind, x0, y0, x1, y1] = match;
    const entry = boxes.get(Number(page)) ?? {};
    entry[kind] = { width: Number(x1) - Number(x0), height: Number(y1) - Number(y0) };
    boxes.set(Number(page), entry);
  }
  const sizes = Array.from({ length: pages }, (unused, i) => {
    const entry = boxes.get(i + 1) ?? {};
    const box = entry.MediaBox ?? entry.CropBox;
    if (!box) throw new Error(`pdfinfo did not report a box for page ${i + 1} of ${pdf}`);
    return box;
  });
  return { pages, sizes };
}

/** A border that starts this far into a full-width line belongs to a second column. */
const RIGHT_COLUMN_START = 60;

export function isTwoColumn(fullPageText) {
  // Any table border, separator or addressed row that starts past the middle. Every occurrence on
  // the line counts, not just the first: on the JD-XA's p17 the right column's only border shares a
  // line with the left column's, so the first match on every line sat at column 0.
  // Addressed rows may carry the `#` packet mark (`|#   00 2D |`), and a continuation row has only
  // its bit pattern (`|          | 0000 dddd |`) — the JD-XA's p18 right column is nothing else.
  const TABLE_MARK = /\+-{20,}|\|-{10,}|\|#?\s+(?:[0-9A-F]{2} ){1,3}[0-9A-F]{2}\s*\||\| [0a-h]{4} [0a-h]{4} \|/g;
  for (const raw of fullPageText.split('\n')) {
    // The SH-201's document draws its borders with em dashes; normalise before looking.
    const line = raw.replace(/[‒-―−]/g, '-');
    for (const match of line.matchAll(TABLE_MARK)) if (match.index >= RIGHT_COLUMN_START) return true;
    // A left-column table with PROSE beside it (the JD-XA's p19, whose right column is the
    // supplementary notes): an 80-character table line, closed, and more text after a gap.
    if (/^\s{0,6}[|+].{70,84}[|+]\s{3,}\S/.test(line)) return true;
  }
  return false;
}

/** Table rows that start with `|` and stop without one: what a crop through a table leaves. */
function truncatedRows(text) {
  let count = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/[‒-―−]/g, '-').trim();
    if (/^\|\s+(?:[0-9A-F]{2} )+[0-9A-F]{2}\s*\|/.test(line) && !/[|+]$/.test(line)) count++;
  }
  return count;
}

/**
 * Split a two-column page at the character column where its right-hand tables begin: the most
 * common start of a border, separator or addressed row past the middle of the line.
 */
function splitAtGutter(fullPageText) {
  const MARK = /\+-{20,}|\|-{10,}|\|#?\s+(?:[0-9A-F]{2} ){1,3}[0-9A-F]{2}\s*\|/g;
  const lines = fullPageText.split('\n');
  const starts = new Map();
  for (const raw of lines) {
    const line = raw.replace(/[‒-―−]/g, '-');
    for (const match of line.matchAll(MARK)) {
      if (match.index < RIGHT_COLUMN_START) continue;
      // Back up over the spaces of the gutter itself, to the column the right-hand text starts in.
      starts.set(match.index, (starts.get(match.index) ?? 0) + 1);
      break;
    }
  }
  if (!starts.size) return fullPageText;
  const gutter = [...starts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const left = lines.map((line) => line.slice(0, gutter).replace(/\s+$/, ''));
  const right = lines.map((line) => line.slice(gutter));
  return `${left.join('\n')}\n${right.join('\n')}`;
}

/** The whole document, each page's columns in reading order, separated by a form feed per page. */
export function extractText(pdf) {
  const { pages, sizes } = pageGeometry(pdf);
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const { width, height } = sizes[page - 1];
    const range = ['-f', String(page), '-l', String(page)];
    // pdftotext ends each page with its own form feed; strip it, so the one between pages here is
    // the only one and a page number counted from them is the manual's page number.
    const page_ = (args) => run('pdftotext', args).replace(/\f/g, '');
    const full = page_(['-layout', ...range, pdf, '-']);
    if (!isTwoColumn(full)) { out.push(full); continue; }
    const half = Math.ceil(width / 2);
    const crop = (x) => ['-x', String(x), '-y', '0', '-W', String(half), '-H', String(Math.ceil(height))];
    const left = page_(['-layout', ...range, ...crop(0), pdf, '-']);
    const right = page_(['-layout', ...range, ...crop(Math.floor(width / 2)), pdf, '-']);
    // Cropping at the middle assumes the gutter is there. Where it is not (the XV-5080's owner's
    // manual sets its left column wider), the crop cuts the left column's rows before their closing
    // `|`. Then the page is split where the right column's tables actually start, by character
    // column in the full-width text.
    // Only when it does better: on the SD-90 and the 2001 FANTOM the crop is right and the
    // character split is not, so whichever leaves fewer rows cut short wins, the crop on a tie.
    const cropped = `${left}\n${right}`;
    if (truncatedRows(left) <= 3) { out.push(cropped); continue; }
    const split = splitAtGutter(full);
    out.push(truncatedRows(split) < truncatedRows(cropped) ? split : cropped);
  }
  return out.join('\f\n');
}

function main() {
  const [pdf, outFile] = process.argv.slice(2);
  if (!pdf) {
    console.error('usage: node tools/profiles/roland/extract-text.mjs <document.pdf> [out.txt]');
    process.exitCode = 2;
    return;
  }
  const text = extractText(pdf);
  if (outFile) writeFileSync(outFile, text);
  else process.stdout.write(text);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
