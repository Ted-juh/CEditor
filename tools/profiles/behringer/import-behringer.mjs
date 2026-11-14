// import-behringer.mjs — a Behringer guide or manual -> tools/profiles/behringer/tables/<name>.json
//
//   node tools/profiles/behringer/import-behringer.mjs <name> <guide.pdf>
//
// The layout (synths/<name>.mjs) names the document, where it is downloaded from and the pages its
// controller table is on. read-behringer-cc.mjs reads the table. What is committed is that, as
// printed, with the document's file name, SHA-256 and address: the PDF is Behringer's copyright and
// is not. Needs poppler's pdftotext.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { documentLines, readCcTables } from './read-behringer-cc.mjs';
import { readAnchoredRows, readLineTables } from './read-behringer-tables.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importDocument(layout, file) {
  const doc = layout.document;
  const pages = layout.pages;
  const lines = documentLines(file, [Math.min(...pages), Math.max(...pages)]).filter((l) => pages.includes(l.page));
  // A manual whose tables are a row a line (the Wave's controllers, NRPNs and preset bytes), or a
  // guide's controller table.
  if (layout.anchored) {
    // Tables of rows anchored on a number, cells set around it (the PolyEight's): the parameters'
    // table, and a second table kept as the flow of one column (its descriptions, with the value
    // lists after them).
    const { rows: spec, flow } = layout.anchored;
    const rows = readAnchoredRows(lines.filter((l) => spec.pages.includes(l.page)), spec.read);
    const flowRows = readAnchoredRows(lines.filter((l) => flow.pages.includes(l.page)), flow.read);
    return {
      sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
      rows,
      flow: flowRows.map((r) => r[flow.column] ?? '').join(' ').replace(/\s+/g, ' ').trim(),
    };
  }
  const rows = layout.tables ? readLineTables(lines, layout.tables) : readCcTables(lines, layout.read ?? {});
  // An NRPN table beside the controllers (the JN-80's): the words in its region, rows anchored on its
  // MSB column, a name or a note over as many lines as it needs.
  const nrpn = layout.nrpnTable;
  const nrpns = nrpn ? readAnchoredRows(lines.filter((l) => l.y > nrpn.top).map((l) => ({ ...l, words: l.words.filter((w) => w.x0 >= nrpn.left) })).filter((l) => l.words.length), nrpn.read) : null;
  return {
    sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
    rows,
    ...(nrpns ? { nrpns: nrpns.map(({ side, ...r }) => r) } : {}),
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const rows = (items, indent) => (items.length ? `[\n${items.map((x) => `${indent}  ${JSON.stringify(x)}`).join(',\n')}\n${indent}]` : '[]');
  return `{\n  "sources": ${rows(data.sources, '  ')},\n  "rows": ${rows(data.rows, '  ')}${data.nrpns ? `,\n  "nrpns": ${rows(data.nrpns, '  ')}` : ''}${data.flow !== undefined ? `,\n  "flow": ${JSON.stringify(data.flow)}` : ''}\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/behringer/import-behringer.mjs <name> <guide.pdf>');
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
