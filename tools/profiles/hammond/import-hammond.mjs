// import-hammond.mjs — a Hammond owner's manual's MIDI INFORMATION appendix -> tools/profiles/hammond/tables/<name>.json
//
//   node tools/profiles/hammond/import-hammond.mjs <name> <owner's manual.pdf>
//
// The layout (synths/<name>.mjs) names the manual, where it is linked from and the appendix's pages.
// read-hammond-tables.mjs reads its parameter tables, the examples under them, what their
// placeholders stand for, the Drawbar Data List 2 and the Identity Reply. What is committed is that,
// as printed, with the file's name, SHA-256 and address; the manual is not. Needs poppler's pdftotext.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { documentLines } from '../nord/read-nord-cc.mjs';
import { readDrawbarList, readExamples, readIdentity, readPlaceholders, readTables } from './read-hammond-tables.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importManual(layout, file) {
  const doc = layout.document;
  const lines = documentLines(file, doc.pages);
  return {
    source: { title: doc.title, file: doc.file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url, linkedFrom: doc.linkedFrom, pages: doc.pages },
    identity: readIdentity(lines),
    placeholders: readPlaceholders(lines),
    drawbars: readDrawbarList(lines),
    examples: readExamples(lines),
    rows: readTables(lines),
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const { rows, examples, ...rest } = data;
  const list = (items) => items.map((x) => `    ${JSON.stringify(x)}`).join(',\n');
  return `${JSON.stringify(rest, null, 2).replace(/\n}$/, '')},\n  "examples": [\n${list(examples)}\n  ],\n  "rows": [\n${list(rows)}\n  ]\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/hammond/import-hammond.mjs <name> <owner\'s manual.pdf>');
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
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.rows.length} rows, ${data.examples.length} examples, identity ${JSON.stringify(data.identity)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
