// import-waldorf.mjs — a Waldorf SysEx specification -> tools/profiles/waldorf/tables/<name>.json
//
//   node tools/profiles/waldorf/import-waldorf.mjs <name> <spec.pdf>
//
// The layout (synths/<name>.mjs) names the document and where it is downloaded from.
// read-waldorf-sysex.mjs reads its sound data table, value lists, effect parameters and messages.
// What is committed is that, as printed, with the document's file name, SHA-256 and address: the PDF
// is Waldorf's copyright and is not. Needs poppler's pdftotext.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readControllerChart, readNumberedList, readNumberedTable } from './read-waldorf-cc.mjs';
import { documentLines, readEffects, readFormat, readLists, readSoundTable } from './read-waldorf-sysex.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importDocument(layout, file) {
  const doc = layout.document;
  // A manual's controller assignments and program dump, read without headings, and the lists they
  // refer to (the Pulse's appendices B and C, Tables 1 and 3).
  if (layout.read?.numbered) {
    const r = layout.read.numbered;
    return {
      sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
      controllers: readNumberedTable(file, r.controllers.pages, new RegExp(r.controllers.stop)).map(({ number, ...row }) => ({ controller: number, ...row })),
      dump: readNumberedTable(file, r.dump.pages, new RegExp(r.dump.stop)),
      lists: Object.fromEntries(Object.entries(r.lists ?? {}).map(([k, l]) => [k, readNumberedList(file, l.page, new RegExp(l.start), new RegExp(l.end))])),
    };
  }
  // A manual's controller chart (the micro Q's), not a SysEx specification.
  if (layout.read?.chart) {
    return {
      sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
      controllers: readControllerChart(file, layout.read.chart),
    };
  }
  const lines = documentLines(file);
  const layoutText = execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const r = layout.read ?? {};
  return {
    sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
    format: readFormat(layoutText),
    sound: readSoundTable(lines, r.soundHeading ? new RegExp(r.soundHeading) : undefined),
    lists: {
      ...readLists(lines, ...(r.lists ? [new RegExp(r.lists[0]), new RegExp(r.lists[1])] : [])),
      // The effect types (`5.1 Effect Types`), heading the effects' own parameter lists.
      ...Object.fromEntries(Object.entries(readLists(lines, /^5\.\s+Effects/, /^6\.\s/)).filter(([k]) => k === '5.1')),
    },
    effects: readEffects(lines),
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const rows = (items, indent) => (items.length ? `[\n${items.map((x) => `${indent}  ${JSON.stringify(x)}`).join(',\n')}\n${indent}]` : '[]');
  if (data.controllers) {
    const more = data.dump ? `,\n  "dump": ${rows(data.dump, '  ')},\n  "lists": {\n${Object.entries(data.lists).map(([k, v]) => `    ${JSON.stringify(k)}: ${rows(v, '    ')}`).join(',\n')}\n  }` : '';
    return `{\n  "sources": ${rows(data.sources, '  ')},\n  "controllers": ${rows(data.controllers, '  ')}${more}\n}\n`;
  }
  const lists = Object.entries(data.lists).map(([k, v]) => `    ${JSON.stringify(k)}: { "title": ${JSON.stringify(v.title)}, ${v.notes ? `"notes": ${JSON.stringify(v.notes)}, ` : ''}"items": ${rows(v.items, '    ')} }`).join(',\n');
  const effects = data.effects.map((e) => `    { "type": ${JSON.stringify(e.type)}, "rows": ${rows(e.rows, '    ')} }`).join(',\n');
  return `{\n  "sources": ${rows(data.sources, '  ')},\n  "format": ${JSON.stringify(data.format)},\n  "sound": ${rows(data.sound, '  ')},\n  "lists": {\n${lists}\n  },\n  "effects": [\n${effects}\n  ]\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/waldorf/import-waldorf.mjs <name> <spec.pdf>');
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
  console.log(data.controllers ? `Wrote ${path.relative(process.cwd(), out)}: ${data.controllers.length} controllers` : `Wrote ${path.relative(process.cwd(), out)}: ${data.sound.length} sound rows, ${Object.keys(data.lists).length} value lists, ${data.effects.length} effect types`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
