// import-kodamo.mjs — the MASK1 manual's MIDI implementation -> tools/profiles/kodamo/tables/<name>.json
//
//   node tools/profiles/kodamo/import-kodamo.mjs <name> <manual.pdf>
//
// The layout (synths/<name>.mjs) names the manual, where it is linked from and the pages.
// read-kodamo-manual.mjs reads the controllers. What is committed is them as printed, with the file's
// name, SHA-256 and address; the manual is not. Needs poppler's pdftotext.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readControllers } from './read-kodamo-manual.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importManual(layout, file) {
  const doc = layout.document;
  const text = execFileSync('pdftotext', ['-layout', '-f', String(doc.pages[0]), '-l', String(doc.pages[1]), file, '-'], { encoding: 'utf8' });
  return {
    source: { title: doc.title, file: doc.file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url, linkedFrom: doc.linkedFrom, pages: doc.pages },
    rows: readControllers(text, doc.pages[0]),
  };
}

export function stringifyTranscription(data) {
  return `{\n  "source": ${JSON.stringify(data.source)},\n  "rows": [\n${data.rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/kodamo/import-kodamo.mjs <name> <manual.pdf>');
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
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.rows.length} controllers`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
