// import-vermona.mjs — a Vermona user guide's controller table -> tools/profiles/vermona/tables/<name>.json
//
//   node tools/profiles/vermona/import-vermona.mjs <name> <user guide.pdf>
//
// The layout (synths/<name>.mjs) names the guide, where it is linked from, and which of the two
// forms read-vermona.mjs reads it as. What is committed is the table as printed, with the file's
// name, SHA-256 and address; the guide is not. Needs poppler's pdftotext.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readSwitchTable, readValueTables } from './read-vermona.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importGuide(layout, file) {
  const doc = layout.document;
  const text = execFileSync('pdftotext', ['-layout', ...(doc.pages ? ['-f', String(doc.pages[0]), '-l', String(doc.pages[1])] : []), file, '-'], { encoding: 'utf8' });
  return {
    source: { title: doc.title, file: doc.file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url, linkedFrom: doc.linkedFrom, ...(doc.pages ? { pages: doc.pages } : {}) },
    ...(layout.form === 'switches' ? { switches: readSwitchTable(text) } : { values: readValueTables(text, doc.pages?.[0] ?? 1) }),
  };
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/vermona/import-vermona.mjs <name> <user guide.pdf>');
    process.exitCode = 2;
    return;
  }
  const layout = await loadLayout(name);
  if (path.basename(file) !== layout.document.file) {
    console.error(`${name}'s layout reads ${layout.document.file}`);
    process.exitCode = 2;
    return;
  }
  const data = importGuide(layout, file);
  writeFileSync(path.join(HERE, 'tables', `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote tables/${name}.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
