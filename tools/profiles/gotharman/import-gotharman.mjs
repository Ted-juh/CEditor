// import-gotharman.mjs — a Gotharman user manual's MIDI parameter list -> tools/profiles/gotharman/tables/<name>.json
//
//   node tools/profiles/gotharman/import-gotharman.mjs <name> <manual.pdf>
//
// The layout (synths/<name>.mjs) names the manual, where it is linked from, its pages and its form:
// the Anamono's parameter list (`nrpn`, read from the PDF's word positions) or an LD instrument's list
// of parameters controllable by CC (`cc`, from pdftotext's layout). read-gotharman-manual.mjs reads
// them. What is committed is what was read, as printed, with the file's name, SHA-256 and address;
// the manual is not. Needs poppler's pdftotext.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { documentLines } from '../nord/read-nord-cc.mjs';
import { readCcList, readParameterList } from './read-gotharman-manual.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importManual(layout, file) {
  const doc = layout.document;
  const rows = layout.form === 'nrpn'
    ? readParameterList(documentLines(file, doc.pages))
    : readCcList(execFileSync('pdftotext', ['-layout', '-f', String(doc.pages[0]), '-l', String(doc.pages[1]), file, '-'], { encoding: 'utf8' }), doc.pages[0]);
  return { source: { title: doc.title, file: doc.file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url, linkedFrom: doc.linkedFrom, pages: doc.pages }, rows };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  return `{\n  "source": ${JSON.stringify(data.source)},\n  "rows": [\n${data.rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/gotharman/import-gotharman.mjs <name> <manual.pdf>');
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
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.rows.length} rows`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
