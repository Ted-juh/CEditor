// import-erica.mjs — an Erica Synths manual -> tools/profiles/erica/tables/<name>.json
//
//   node tools/profiles/erica/import-erica.mjs <name> <manual.pdf>
//
// The layout (synths/<name>.mjs) names the manual, where it is downloaded from, the pages its MIDI
// chart is on and its shape (`matrix`, the PĒRKONS's voices side by side; `lists`, the LXR-02's CC
// and NRPN lists); read-erica-charts.mjs reads it. What is committed is the chart as printed, with
// the manual's file name, SHA-256 and address. Needs poppler's pdftotext.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { documentLines } from '../nord/read-nord-cc.mjs';
import { readFunctionLists, readVoiceMatrix } from './read-erica-charts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importDocument(layout, file) {
  const doc = layout.document;
  const pages = layout.pages;
  const lines = documentLines(file, [Math.min(...pages), Math.max(...pages)]).filter((l) => pages.includes(l.page));
  return {
    sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
    rows: layout.read === 'matrix' ? readVoiceMatrix(lines) : readFunctionLists(lines),
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
    console.error('usage: node tools/profiles/erica/import-erica.mjs <name> <manual.pdf>');
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
