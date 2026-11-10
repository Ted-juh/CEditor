// import-dreadbox.mjs — a Dreadbox manual -> tools/profiles/dreadbox/tables/<name>.json
//
//   node tools/profiles/dreadbox/import-dreadbox.mjs <name> <manual.pdf>
//
// The layout (synths/<name>.mjs) names the manual (or CC list), where it is downloaded from, the
// pages its CC list is on and the columns the list is set in: `PARAMETER  CC#  VALUE  NOTES` (the
// Nymphes), `CC  PARAMETER  VALUE` (the Artemis), `PARAMETERS  VALUE` under a number (the Murmux
// Adept), a value over as many lines as it needs, read by the Behringer anchored-row reader
// (read-behringer-tables.mjs). What is committed is the list as printed, with the document's file
// name, SHA-256 and address. Needs poppler's pdftotext.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readAnchoredRows } from '../behringer/read-behringer-tables.mjs';
import { documentLines } from '../nord/read-nord-cc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

/** The list's rows: [{ page, cc, name, value, notes? }] as printed. */
export function readChart(lines, read) {
  // (`skip` drops a page's prose lines, the Artemis's note on its Selector; `bottom` stops above a
  // folio.)
  const kept = lines.filter((l) => l.y < (read.bottom ?? Infinity));
  return readAnchoredRows(kept, read).map(({ side, ...r }) => r);
}

export function importDocument(layout, file) {
  const doc = layout.document;
  const pages = layout.pages;
  const lines = documentLines(file, [Math.min(...pages), Math.max(...pages)]).filter((l) => pages.includes(l.page));
  return {
    sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
    rows: readChart(lines, layout.read),
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const rows = (items, indent) => (items.length ? `[\n${items.map((x) => `${indent}  ${JSON.stringify(x)}`).join(',\n')}\n${indent}]` : '[]');
  return `{\n  "sources": ${rows(data.sources, '  ')},\n  "rows": ${rows(data.rows, '  ')}\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/dreadbox/import-dreadbox.mjs <name> <manual.pdf>');
    process.exitCode = 2;
    return;
  }
  const layout = await loadLayout(name);
  if (path.basename(file) !== layout.document.file) {
    console.error(`${name}'s layout reads ${layout.document.file}`);
    process.exitCode = 2;
    return;
  }
  const data = importDocument(layout, file);
  const out = path.join(HERE, 'tables', `${name}.json`);
  writeFileSync(out, stringifyTranscription(data));
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.rows.length} rows`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
