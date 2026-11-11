// import-tastychips.mjs — a Tasty Chips GR manual's MIDI Command Table -> tools/profiles/tastychips/tables/<name>.json
//
//   node tools/profiles/tastychips/import-tastychips.mjs <name> <manual.pdf>
//
// The layout (synths/<name>.mjs) names the manual, where it is linked from, its pages and the
// section labels its table sets between rows. read-gr-table.mjs reads the table and the three after
// it. What is committed is them as printed, with the file's name, SHA-256 and address; the manual
// is not. Needs poppler's pdftotext.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { documentLines } from '../nord/read-nord-cc.mjs';
import { readCommandTable, readIndexTable } from './read-gr-table.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importManual(layout, file) {
  const doc = layout.document;
  const lines = documentLines(file, doc.pages);
  const intro = execFileSync('pdftotext', ['-layout', '-f', String(doc.pages[0]), '-l', String(doc.pages[0] + 1), file, '-'], { encoding: 'utf8' });
  const generated = /Generated from [^\n]*/.exec(intro)?.[0].trim() ?? null;
  return {
    source: { title: doc.title, file: doc.file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url, linkedFrom: doc.linkedFrom, pages: doc.pages, generated },
    rateDivisions: readIndexTable(lines, 'Table 3: Rate divisions'),
    modSources: readIndexTable(lines, 'Table 4: Mod sources'),
    modDestinations: readIndexTable(lines, 'Table 5: Modulation destinations'),
    rows: readCommandTable(lines, { sections: layout.sections }),
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const { source, rows, ...lists } = data;
  const list = (items) => items.map((x) => `    ${JSON.stringify(x)}`).join(',\n');
  return `{\n  "source": ${JSON.stringify(source)},\n${Object.entries(lists).map(([k, v]) => `  ${JSON.stringify(k)}: [\n${list(v)}\n  ]`).join(',\n')},\n  "rows": [\n${list(rows)}\n  ]\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/tastychips/import-tastychips.mjs <name> <manual.pdf>');
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
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.rows.length} rows; ${data.rateDivisions.length} rate divisions, ${data.modSources.length} mod sources, ${data.modDestinations.length} destinations`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
