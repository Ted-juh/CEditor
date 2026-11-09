// import-moog.mjs — a Moog manual's MIDI CC (and NRPN) tables -> tools/profiles/moog/tables/<name>.json
//
//   node tools/profiles/moog/import-moog.mjs <name> <manual.pdf> [<addendum.pdf> …]
//
// The layout (synths/<name>.mjs) names each document, where it is downloaded from, and its tables:
// their pages and their column headings as printed. read-moog-pdf.mjs reads the rows. What is
// committed is the rows as printed, with each document's file name, SHA-256 and address: the PDFs
// are Moog's copyright and are not. Needs poppler's pdftotext.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readTable } from './read-moog-pdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

const pageNumbers = (pages) => pages.map((p) => (typeof p === 'object' ? p.page : p));

export function importDocuments(layout, files) {
  const sources = layout.documents.map((doc, index) => ({
    title: doc.title,
    file: path.basename(files[index]),
    sha256: createHash('sha256').update(readFileSync(files[index])).digest('hex'),
    url: doc.url,
  }));
  const read = (t) => readTable(files[t.doc ?? 0], t.pages, t.columns, t.options ?? {}).map((r) => ({ doc: t.doc ?? 0, ...r }));
  const tables = (layout.tables ?? []).map((t) => ({ doc: t.doc ?? 0, kind: t.kind ?? 'cc', pages: pageNumbers(t.pages), rows: read(t) }));
  const valueTables = (layout.valueTables ?? []).map((t) => ({ doc: t.doc ?? 0, title: t.title, for: t.for, pages: pageNumbers(t.pages), rows: read({ ...t, options: { anchor: 'value', ...(t.options ?? {}) } }) }));
  return { sources, tables, ...(valueTables.length ? { valueTables } : {}) };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const list = (items, indent) => (items.length ? `[\n${items.map((x) => `${indent}  ${JSON.stringify(x)}`).join(',\n')}\n${indent}]` : '[]');
  const tableText = (t, keys) => `{\n${keys.map((k) => `      ${JSON.stringify(k)}: ${JSON.stringify(t[k])},\n`).join('')}      "rows": ${list(t.rows, '      ')}\n    }`;
  const sections = [
    `  "sources": ${list(data.sources, '  ')}`,
    `  "tables": [\n${data.tables.map((t) => `    ${tableText(t, ['doc', 'kind', 'pages'])}`).join(',\n')}\n  ]`,
    ...(data.valueTables ? [`  "valueTables": [\n${data.valueTables.map((t) => `    ${tableText(t, ['doc', 'title', 'for', 'pages'])}`).join(',\n')}\n  ]`] : []),
  ];
  return `{\n${sections.join(',\n')}\n}\n`;
}

async function main() {
  const [name, ...files] = process.argv.slice(2);
  if (!name || !files.length) {
    console.error('usage: node tools/profiles/moog/import-moog.mjs <name> <manual.pdf> [<addendum.pdf> …]');
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
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.tables.map((t) => `${t.rows.length} ${t.kind} rows`).join(', ')}${data.valueTables ? `, ${data.valueTables.length} value table(s)` : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
