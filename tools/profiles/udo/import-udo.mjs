// import-udo.mjs — a UDO manual -> tools/profiles/udo/tables/<name>.json
//
//   node tools/profiles/udo/import-udo.mjs <name> <manual.pdf>
//
// The layout (synths/<name>.mjs) names the manual, where it is downloaded from and where its MIDI
// specification's two tables are: `CC #  Value Range  Parameter Name` and `NRPN  NRPN MSB  NRPN LSB
// Value Range  Parameter Name`, a value list over several lines around its row, the manual's
// navigation down the left of every page. Both are read by the Behringer anchored-row reader. What is
// committed is the tables as printed, with the manual's file name, SHA-256 and address. Needs
// poppler's pdftotext.

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

/**
 * One table's rows on its pages, the navigation column dropped. `until`: the heading the table ends
 * at, on its last page (the RPN table under the Super 6's controllers).
 */
function readTable(lines, { pages, until, ...read }) {
  const text = (l) => l.words.map((w) => w.text).join(' ');
  const end = until ? lines.find((l) => l.page === pages.at(-1) && until.test(text(l))) : null;
  const own = lines.filter((l) => pages.includes(l.page) && !(end && l.page === end.page && l.y >= end.y));
  return readAnchoredRows(own, read).map(({ side, nav, ...r }) => r);
}

export function importDocument(layout, file) {
  const doc = layout.document;
  const pages = [...layout.read.cc.pages, ...layout.read.nrpn.pages];
  const lines = documentLines(file, [Math.min(...pages), Math.max(...pages)]);
  return {
    sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
    cc: readTable(lines, layout.read.cc),
    nrpn: readTable(lines, layout.read.nrpn),
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const rows = (items, indent) => (items.length ? `[\n${items.map((x) => `${indent}  ${JSON.stringify(x)}`).join(',\n')}\n${indent}]` : '[]');
  return `{\n  "sources": ${rows(data.sources, '  ')},\n  "cc": ${rows(data.cc, '  ')},\n  "nrpn": ${rows(data.nrpn, '  ')}\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/udo/import-udo.mjs <name> <manual.pdf>');
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
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.cc.length} controllers, ${data.nrpn.length} NRPNs`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
