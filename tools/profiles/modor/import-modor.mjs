// import-modor.mjs — a Modor user manual's MIDI chapter -> tools/profiles/modor/tables/<name>.json
//
//   node tools/profiles/modor/import-modor.mjs <name> <manual.pdf>
//
// The layout (synths/<name>.mjs) names the manual, where it is linked from, and the pages of its
// controller list (and of the NF-1's formant table, the DR-2's NRPN table). read-modor-manual.mjs
// reads them. What is committed is what was read, as printed, with the file's name, SHA-256 and
// address; the manual is not. Needs poppler's pdftotext.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { documentWords, readControllerList, readFormantTable, readNrpnTable } from './read-modor-manual.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

const layoutText = (file, pages) => execFileSync('pdftotext', ['-layout', '-f', String(pages[0]), '-l', String(pages[1]), file, '-'], { encoding: 'utf8' });

export function importManual(layout, file) {
  const doc = layout.document;
  const { rows, notes } = readControllerList(documentWords(file, doc.pages));
  return {
    source: { title: doc.title, file: doc.file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url, linkedFrom: doc.linkedFrom, pages: doc.pages },
    notes,
    ...(layout.formants ? { formants: readFormantTable(layoutText(file, layout.formants)) } : {}),
    ...(layout.nrpn ? { nrpn: readNrpnTable(layoutText(file, layout.nrpn)) } : {}),
    rows,
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const { rows, ...rest } = data;
  return `{\n${Object.entries(rest).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`).join('')}  "rows": [\n${rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/modor/import-modor.mjs <name> <manual.pdf>');
    process.exitCode = 2;
    return;
  }
  const layout = await loadLayout(name);
  if (path.basename(file) !== layout.document.file) {
    console.error(`${name}'s layout reads ${layout.document.file}`);
    process.exitCode = 2;
    return;
  }
  const data = importManual(layout, file);
  const out = path.join(HERE, 'tables', `${name}.json`);
  writeFileSync(out, stringifyTranscription(data));
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.rows.length} rows (${data.rows.filter((r) => r.received).length} received)${data.nrpn ? `, ${data.nrpn.parameters.length} NRPN parameters for ${data.nrpn.instruments.length} instruments` : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
