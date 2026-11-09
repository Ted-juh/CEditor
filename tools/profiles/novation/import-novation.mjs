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
import { readControllerList } from './read-novation-cclist.mjs';
import { pagesText, readMessage, readPatchFormat } from './read-novation-sysex.mjs';
import { readValueTables } from './read-novation-values.mjs';

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
  const valueTables = [];
  let patch = null;
  let controllerList = null;
  layout.documents.forEach((doc, index) => {
    const file = files[index];
    const pages = doc.pages ? pageList(doc.pages) : [];
    sources.push({ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url, pages: doc.pages ?? doc.controllerList });
    for (const row of readTables(file, pages, { columnStarts: doc.columnStarts ?? null })) rows.push({ doc: index, ...row });
    // The value tables the rows point to (`See Osc Waveform Table`), where the layout names their pages.
    if (doc.valuePages) for (const t of readValueTables(file, pageList(doc.valuePages))) valueTables.push({ doc: index, ...t });
    // An older manual's MIDI Controller List and NRPN List (the K-Station's, the KS series').
    if (doc.controllerList) controllerList = { doc: index, ...readControllerList(file, pageList(doc.controllerList)) };
    // The patch dump, where the layout names the pages of its messages and its format.
    if (doc.patch) {
      const messages = pagesText(file, pageList(doc.patch.messagePages));
      patch = {
        doc: index,
        requestTitle: doc.patch.request,
        replyTitle: doc.patch.reply,
        request: readMessage(messages, doc.patch.request),
        reply: readMessage(messages, doc.patch.reply),
        format: readPatchFormat(pagesText(file, pageList(doc.patch.formatPages))),
      };
    }
  });
  return { sources, rows, ...(valueTables.length ? { valueTables } : {}), ...(patch ? { patch } : {}), ...(controllerList ? { controllerList } : {}) };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const list = (items, indent) => (items.length ? `[\n${items.map((x) => `${indent}  ${JSON.stringify(x)}`).join(',\n')}\n${indent}]` : '[]');
  const sections = [
    `  "sources": ${list(data.sources, '  ')}`,
    `  "rows": ${list(data.rows, '  ')}`,
    ...(data.valueTables ? [`  "valueTables": ${list(data.valueTables, '  ')}`] : []),
    ...(data.controllerList ? [`  "controllerList": {\n    "doc": ${data.controllerList.doc},\n    "controllers": ${list(data.controllerList.controllers, '    ')},\n    "nrpns": ${list(data.controllerList.nrpns, '    ')}\n  }`] : []),
    ...(data.patch ? [`  "patch": {\n${['doc', 'requestTitle', 'replyTitle', 'request', 'reply'].map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(data.patch[k])},\n`).join('')}    "format": ${list(data.patch.format, '    ')}\n  }`] : []),
  ];
  return `{\n${sections.join(',\n')}\n}\n`;
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
