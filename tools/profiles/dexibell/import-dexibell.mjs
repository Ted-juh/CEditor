// import-dexibell.mjs — a Dexibell MIDI Implementation -> tools/profiles/dexibell/tables/<name>.json
//
//   node tools/profiles/dexibell/import-dexibell.mjs <name> <MIDI Implementation.pdf>
//
// The layout (synths/<name>.mjs) names the document and where it is linked from. read-dexibell-midi.mjs
// reads its blocks; the "Received data" ones are kept (the "Transmitted data" repeats them). What is
// committed is them as printed, with the file's name, SHA-256 and address; the PDF is not. Needs
// poppler's pdftotext.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { documentLines } from '../nord/read-nord-cc.mjs';
import { readBlocks } from './read-dexibell-midi.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importDocument(layout, file) {
  const doc = layout.document;
  const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[1]);
  const blocks = readBlocks(documentLines(file, [1, pages]));
  const received = blocks.filter((b) => b.section === 'received').map(({ section, ...b }) => b);
  return { source: { title: doc.title, file: doc.file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url, linkedFrom: doc.linkedFrom, pages: [1, Math.max(...received.map((b) => b.page))] }, blocks: received };
}

export function stringifyTranscription(data) {
  return `{\n  "source": ${JSON.stringify(data.source)},\n  "blocks": [\n${data.blocks.map((b) => `    ${JSON.stringify(b)}`).join(',\n')}\n  ]\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/dexibell/import-dexibell.mjs <name> <MIDI Implementation.pdf>');
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
  writeFileSync(path.join(HERE, 'tables', `${name}.json`), stringifyTranscription(data));
  console.log(`Wrote tables/${name}.json: ${data.blocks.length} received blocks, pages ${data.source.pages.join(' - ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
