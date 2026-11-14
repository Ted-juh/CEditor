// import-alesis.mjs — the Alesis A6 Andromeda's MIDI Sysex Specification -> tools/profiles/alesis/tables/<name>.json
//
//   node tools/profiles/alesis/import-alesis.mjs <name> <a6syx.pdf>
//
// The layout (synths/<name>.mjs) names the document, where it is downloaded from, and the blocks of
// its opcodes' section a profile is made from. read-a6-chart.mjs reads them and the parameter chart.
// What is committed is them as printed, with the file's name, SHA-256 and address; the PDF is not.
// Needs poppler's pdftotext.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { block, readChart } from './read-a6-chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importText(layout, text, file) {
  const doc = layout.document;
  const chart = readChart(text);
  const printed = /^\s*A6 Midi Sysex Specification\s*\n\s*(\d+\/\d+\/\d+)/.exec(text);
  return {
    source: { title: doc.title, file: doc.file, printed: printed ? printed[1] : null, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url },
    blocks: Object.fromEntries(Object.entries(layout.blocks).map(([key, { start, end }]) => [key, block(text, start, end)])),
    chart,
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const { chart, ...rest } = data;
  const head = JSON.stringify(rest, null, 2).replace(/\n}$/, '');
  const { rows, ...about } = chart;
  return `${head},\n  "chart": ${JSON.stringify(about).replace(/}$/, '')},"rows":[\n${rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]}\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/alesis/import-alesis.mjs <name> <a6syx.pdf>');
    process.exitCode = 2;
    return;
  }
  const layout = await loadLayout(name);
  if (path.basename(file) !== layout.document.file) {
    console.error(`${name}'s layout reads ${layout.document.file}`);
    process.exitCode = 2;
    return;
  }
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const data = importText(layout, text, file);
  const out = path.join(HERE, 'tables', `${name}.json`);
  writeFileSync(out, stringifyTranscription(data));
  const unread = data.chart.unread.length ? `; ${data.chart.unread.length} lines not read: ${data.chart.unread.join(' / ')}` : '';
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.chart.rows.length} chart rows (PDF pages ${data.chart.pages.join(' - ')})${unread}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
