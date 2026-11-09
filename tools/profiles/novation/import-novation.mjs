// import-novation.mjs — a Novation user guide's (or programmer's reference's) MIDI parameter table
// -> tools/profiles/novation/tables/<name>.json
//
//   node tools/profiles/novation/import-novation.mjs <name> <guide.pdf> [<addendum.pdf> …]
//
// The layout (synths/<name>.mjs) names each document, its pages and where its download page is;
// read-novation-pdf.mjs reads the rows. What is committed is the rows as printed, with each
// document's file name, SHA-256 and address: the PDFs are Novation's copyright and are not.
// Needs poppler's pdftotext.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readTables } from './read-novation-pdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

const pageList = (spec) => (Array.isArray(spec) ? spec : [spec]).flatMap((p) => {
  const m = /^(\d+)-(\d+)$/.exec(String(p));
  return m ? Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (u, i) => Number(m[1]) + i) : [Number(p)];
});

export function importDocuments(layout, files) {
  const sources = [];
  const rows = [];
  layout.documents.forEach((doc, index) => {
    const file = files[index];
    const pages = pageList(doc.pages);
    sources.push({ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url, pages: doc.pages });
    for (const row of readTables(file, pages, { columnStarts: doc.columnStarts ?? null })) rows.push({ doc: index, ...row });
  });
  return { sources, rows };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  return `${['{', '  "sources": [', ...data.sources.map((s, i) => `    ${JSON.stringify(s)}${i < data.sources.length - 1 ? ',' : ''}`), '  ],', '  "rows": [',
    ...data.rows.map((r, i) => `    ${JSON.stringify(r)}${i < data.rows.length - 1 ? ',' : ''}`), '  ]', '}'].join('\n')}\n`;
}

async function main() {
  const [name, ...files] = process.argv.slice(2);
  if (!name || !files.length) {
    console.error('usage: node tools/profiles/novation/import-novation.mjs <name> <guide.pdf> [<addendum.pdf> …]');
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
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.rows.length} rows from ${data.sources.length} document(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
