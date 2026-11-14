// import-groove.mjs — Groove Synthesis's 3rd Wave MIDI spec -> tools/profiles/groove/tables/<name>.json
//
//   node tools/profiles/groove/import-groove.mjs <name> <spec.pdf>
//
// The layout (synths/<name>.mjs) names the spec, where it is downloaded from, the pages of its NRPN
// table and of the value lists after it. read-groove-spec.mjs reads them. What is committed is them as
// printed, with the file's name, SHA-256 and address. Needs poppler's pdftotext.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { documentLines } from '../nord/read-nord-cc.mjs';
import { readNrpnTable, readValueLists } from './read-groove-spec.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importDocument(layout, file) {
  const doc = layout.document;
  const { table, lists } = layout.read;
  const lines = documentLines(file, [table.pages[0], lists.pages.at(-1)]);
  const text = (l) => l.words.map((w) => w.text).join(' ');
  // The table: from under its header to the first list's heading.
  const own = lines.filter((l) => table.pages.includes(l.page));
  const start = own.findIndex((l) => table.header.test(text(l)));
  const end = own.findIndex((l, i) => i > start && lists.headings.some((h) => text(l).startsWith(h)));
  return {
    sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
    nrpn: readNrpnTable(own.slice(start + 1, end < 0 ? undefined : end), table.columns),
    lists: readValueLists(lines.filter((l) => lists.pages.includes(l.page)), lists.headings),
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const rows = (items, indent) => (items.length ? `[\n${items.map((x) => `${indent}  ${JSON.stringify(x)}`).join(',\n')}\n${indent}]` : '[]');
  const lists = Object.entries(data.lists).map(([k, v]) => `    ${JSON.stringify(k)}: ${rows(v, '    ')}`).join(',\n');
  return `{\n  "sources": ${rows(data.sources, '  ')},\n  "nrpn": ${rows(data.nrpn, '  ')},\n  "lists": {\n${lists}\n  }\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/groove/import-groove.mjs <name> <spec.pdf>');
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
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.nrpn.length} NRPNs, lists ${Object.entries(data.lists).map(([k, v]) => `${k}: ${v.length}`).join('; ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
