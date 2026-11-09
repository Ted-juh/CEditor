// import-yamaha.mjs — a Yamaha data list's MIDI data tables -> tools/profiles/yamaha/tables/<name>.json
//
//   node tools/profiles/yamaha/import-yamaha.mjs <name> <data-list.pdf>
//
// The layout (synths/<name>.mjs) names the document, where it is downloaded from, and the pages of
// the instrument's data format, its parameter-change tables and its bulk dump block table.
// read-yamaha-pdf.mjs reads them. What is committed is the rows as printed, with the document's
// file name, SHA-256 and address: the PDF is Yamaha's copyright and is not. Needs poppler's pdftotext.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { pagesText, readBulkBlocks, readFormat, readParameterTables } from './read-yamaha-pdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importDocuments(layout, files) {
  const sources = layout.documents.map((doc, index) => ({
    title: doc.title,
    file: path.basename(files[index]),
    sha256: createHash('sha256').update(readFileSync(files[index])).digest('hex'),
    url: doc.url,
  }));
  const r = layout.read;
  const file = files[r.doc ?? 0];
  const format = readFormat(pagesText(file, r.formatPages));
  const tables = readParameterTables(file, r.tablePages);
  const bulk = r.bulk ? readBulkBlocks(file, r.bulk.page, r.bulk) : [];
  return { sources, format, tables, bulk };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const list = (items, indent) => (items.length ? `[\n${items.map((x) => `${indent}  ${JSON.stringify(x)}`).join(',\n')}\n${indent}]` : '[]');
  const table = (t) => `    {\n      "title": ${JSON.stringify(t.title)},\n      "notes": ${JSON.stringify(t.notes)},\n      "page": ${t.page},\n      "rows": ${list(t.rows, '      ')}\n    }`;
  return `{\n  "sources": ${list(data.sources, '  ')},\n  "format": ${JSON.stringify(data.format)},\n  "tables": [\n${data.tables.map(table).join(',\n')}\n  ],\n  "bulk": ${list(data.bulk, '  ')}\n}\n`;
}

async function main() {
  const [name, ...files] = process.argv.slice(2);
  if (!name || !files.length) {
    console.error('usage: node tools/profiles/yamaha/import-yamaha.mjs <name> <data-list.pdf>');
    process.exitCode = 2;
    return;
  }
  const layout = await loadLayout(name);
  const wanted = layout.documents.map((d) => d.file);
  if (files.length !== wanted.length || files.some((f, i) => path.basename(f) !== wanted[i])) {
    console.error(`${name}'s layout reads ${wanted.join(', ')}, in that order`);
    process.exitCode = 2;
    return;
  }
  const data = importDocuments(layout, files);
  const out = path.join(HERE, 'tables', `${name}.json`);
  writeFileSync(out, stringifyTranscription(data));
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.tables.length} tables, ${data.tables.reduce((n, t) => n + t.rows.length, 0)} rows, ${data.bulk.length} bulk blocks`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
