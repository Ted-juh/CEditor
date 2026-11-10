// import-sonicware.mjs — a Sonicware MIDI chart -> tools/profiles/sonicware/tables/<name>.json
//
//   node tools/profiles/sonicware/import-sonicware.mjs <name> <chart.pdf>
//
// The layout (synths/<name>.mjs) names the chart and where it is downloaded from.
// read-sonicware-chart.mjs reads it, its columns found from the chart's header (`Function
// Transmitted  Recognized  Remarks`). What is committed is the control changes as printed, with the
// chart's file name, SHA-256 and address. Needs poppler's pdftotext.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { documentLines } from '../nord/read-nord-cc.mjs';
import { readChart } from './read-sonicware-chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importDocument(layout, file) {
  const doc = layout.document;
  const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file], { stdio: ['ignore', 'pipe', 'ignore'] }).toString())[1]);
  const lines = documentLines(file, [1, pages]);
  const header = lines.find((l) => l.words.some((w) => w.text === 'Recognized'));
  const x = (t) => header.words.find((w) => w.text === t).x0;
  const rows = readChart(lines, { transmitted: x('Transmitted') + 20, recognized: x('Recognized') + 20, remarks: x('Remarks') });
  return {
    sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
    rows,
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const rows = (items, indent) => (items.length ? `[\n${items.map((x) => `${indent}  ${JSON.stringify(x)}`).join(',\n')}\n${indent}]` : '[]');
  return `{\n  "sources": ${rows(data.sources, '  ')},\n  "rows": ${rows(data.rows, '  ')}\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/sonicware/import-sonicware.mjs <name> <chart.pdf>');
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
