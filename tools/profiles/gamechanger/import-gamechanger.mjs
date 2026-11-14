// import-gamechanger.mjs — Gamechanger Audio's MIDI documents -> tools/profiles/gamechanger/tables/<name>.json
//
//   node tools/profiles/gamechanger/import-gamechanger.mjs <name> <folder holding the layout's PDFs>
//
// The layout (synths/<name>.mjs) names each document, where it is linked from, what is read from it
// and on which pages: a Motor Synth's NRPN map and MIDI SysEx pages (read-motor-maps.mjs), or a
// pedal's CC table (read-pedal-cc.mjs, the layout's `form`). What is committed is what was read, as
// printed, with each file's name, SHA-256 and address; the PDFs are not. Needs poppler's pdftotext.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { documentLines } from '../nord/read-nord-cc.mjs';
import { readNrpnMap, readSysex } from './read-motor-maps.mjs';
import { readAddressTable, readBandTable } from './read-pedal-cc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SYSEX_HEADINGS = ['GENERAL INFO REQUEST', 'GENERAL INFO RESPONSE', 'GLOBAL PARAMETER REQUEST', 'GLOBAL PARAMETER DUMP', 'SOUND PARAMETER REQUEST', 'SOUND PARAMETER DUMP'];

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

const pageCount = (pdf) => Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }))[1]);

export function importDocuments(layout, folder) {
  const out = { sources: [], nrpn: [], sysex: {} };
  for (const doc of layout.documents) {
    const pdf = path.join(folder, doc.file);
    const pages = doc.pages ?? [1, pageCount(pdf)];
    if (!out.sources.some((s) => s.file === doc.file)) out.sources.push({ title: doc.title, file: doc.file, sha256: createHash('sha256').update(readFileSync(pdf)).digest('hex'), url: doc.url, linkedFrom: doc.linkedFrom });
    const source = out.sources.find((s) => s.file === doc.file);
    source[`${doc.read}Pages`] = pages;
    if (doc.read === 'nrpn') out.nrpn = readNrpnMap(documentLines(pdf, pages));
    if (doc.read === 'sysex') out.sysex = readSysex(execFileSync('pdftotext', ['-layout', '-f', String(pages[0]), '-l', String(pages[1]), pdf, '-'], { encoding: 'utf8' }), SYSEX_HEADINGS);
  }
  return out;
}

/** A pedal's CC table: { source, bands } (the band form) or { source, addresses } (the Bigsby's). */
export function importPedal(layout, folder) {
  const doc = layout.document;
  const pdf = path.join(folder, doc.file);
  const lines = documentLines(pdf, doc.pages);
  const source = { title: doc.title, file: doc.file, sha256: createHash('sha256').update(readFileSync(pdf)).digest('hex'), url: doc.url, linkedFrom: doc.linkedFrom, pages: doc.pages };
  return layout.form === 'bands' ? { source, bands: readBandTable(lines, { numberLine: layout.numberLine }) } : { source, addresses: readAddressTable(lines) };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  if (data.source) {
    const key = data.bands ? 'bands' : 'addresses';
    return `{\n  "source": ${JSON.stringify(data.source)},\n  "${key}": [\n${data[key].map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]\n}\n`;
  }
  const rows = (items, indent) => (items.length ? `[\n${items.map((x) => `${indent}  ${JSON.stringify(x)}`).join(',\n')}\n${indent}]` : '[]');
  const sysex = Object.entries(data.sysex).map(([k, v]) => `    ${JSON.stringify(k)}: ${rows(v, '    ')}`).join(',\n');
  return `{\n  "sources": ${rows(data.sources, '  ')},\n  "nrpn": ${rows(data.nrpn, '  ')},\n  "sysex": {\n${sysex}\n  }\n}\n`;
}

async function main() {
  const [name, folder] = process.argv.slice(2);
  if (!name || !folder) {
    console.error('usage: node tools/profiles/gamechanger/import-gamechanger.mjs <name> <folder holding the layout\'s PDFs>');
    process.exitCode = 2;
    return;
  }
  const layout = await loadLayout(name);
  const out = path.join(HERE, 'tables', `${name}.json`);
  if (layout.form) {
    const pedal = importPedal(layout, folder);
    writeFileSync(out, stringifyTranscription(pedal));
    console.log(`Wrote ${path.relative(process.cwd(), out)}: ${(pedal.bands ?? pedal.addresses).length} rows`);
    return;
  }
  const data = importDocuments(layout, folder);
  writeFileSync(out, stringifyTranscription(data));
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.nrpn.length} NRPN rows, SysEx ${Object.entries(data.sysex).map(([k, v]) => `${k} (${v.length})`).join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
