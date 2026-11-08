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

function pageGeometry(pdf) {
  const info = run('pdfinfo', ['-box', pdf]);
  const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0);
  const box = /MediaBox:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(info);
  if (!pages || !box) throw new Error(`pdfinfo did not report pages and a media box for ${pdf}`);
  return { pages, width: Number(box[3]) - Number(box[1]), height: Number(box[4]) - Number(box[2]) };
}

/** A border that starts this far into a full-width line belongs to a second column. */
const RIGHT_COLUMN_START = 60;

export function isTwoColumn(fullPageText) {
  for (const line of fullPageText.split('\n')) {
    // The SH-201's document draws its borders with em dashes; normalise before looking.
    const at = line.replace(/[‒-―−]/g, '-').search(/\+-{20,}/);
    if (at >= RIGHT_COLUMN_START) return true;
  }
  return false;
}

/** The whole document, each page's columns in reading order, separated by a form feed per page. */
export function extractText(pdf) {
  const { pages, width, height } = pageGeometry(pdf);
  const out = [];
  for (let page = 1; page <= pages; page++) {
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
    out.push(`${left}\n${right}`);
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
