// import-asm.mjs — an ASM MIDI spec -> tools/profiles/asm/tables/<name>.json
//
//   node tools/profiles/asm/import-asm.mjs <name> <spec.pdf>
//
// The layout (synths/<name>.mjs) names the document, where it is downloaded from and the pages its
// table is on. read-asm-nrpn.mjs reads the table and its rhythm lists. What is committed is that, as
// printed, with the document's file name, SHA-256 and address: the PDF is ASM's copyright and
// is not. Needs poppler's pdftotext.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readCcChart } from './read-asm-cc.mjs';
import { documentLines, readNrpnSpec, readRhythmLists } from './read-asm-nrpn.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importDocument(layout, file) {
  const doc = layout.document;
  const pages = layout.pages;
  if (layout.read === 'cc') {
    // An owner's manual's CC chart.
    const rows = readCcChart(documentLines(file, [Math.min(...pages), Math.max(...pages)]).filter((l) => pages.includes(l.page)), { leftOnly: layout.leftOnly ?? [] });
    return { sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }], lists: {}, rows };
  }
  const lines = documentLines(file, [Math.min(...pages, ...layout.listPages), Math.max(...pages, ...layout.listPages)]);
  const rows = readNrpnSpec(lines.filter((l) => pages.includes(l.page)));
  const lists = readRhythmLists(lines.filter((l) => layout.listPages.includes(l.page)));
  return {
    sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
    lists,
    rows,
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const rows = (items, indent) => (items.length ? `[\n${items.map((x) => `${indent}  ${JSON.stringify(x)}`).join(',\n')}\n${indent}]` : '[]');
  return `{\n  "sources": ${rows(data.sources, '  ')},\n  "lists": ${JSON.stringify(data.lists)},\n  "rows": ${rows(data.rows, '  ')}\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/asm/import-asm.mjs <name> <spec.pdf>');
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
