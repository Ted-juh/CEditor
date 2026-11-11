// import-twisted.mjs — a Twisted Electrons web manual's MIDI tables -> tools/profiles/twisted/tables/<name>.json
//
//   node tools/profiles/twisted/import-twisted.mjs <name> <saved page.html | manual.pdf>
//
// (A PDF manual's table is read by read-twisted-pdf.mjs, on the pages the layout names.)
// The layout (synths/<name>.mjs) names the page, its address, the day it was saved and the tables a
// profile is made from. read-twisted-page.mjs reads them. What is committed is them as printed, with
// the saved file's SHA-256; the page is not. A web manual is a live page: the profile records the day
// it was saved, and a page fetched another day may read otherwise (its address carries a cache key).

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { execFileSync } from 'node:child_process';

import { documentLines } from '../nord/read-nord-cc.mjs';
import { paragraphAfter, readTables, textOf } from './read-twisted-page.mjs';
import { readControlRows, readParameterRows } from './read-twisted-pdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importPage(layout, file) {
  const doc = layout.document;
  if (layout.pdf) {
    const { form, pages } = layout.pdf;
    const title = layout.controllerTables[0];
    const table = form === 'control'
      ? readControlRows(documentLines(file, pages), title)
      : readParameterRows(execFileSync('pdftotext', ['-layout', '-f', String(pages[0]), '-l', String(pages[1]), file, '-'], { encoding: 'utf8' }), title);
    return { source: { title: doc.title, file: doc.file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url, pages }, tables: [table] };
  }
  const html = readFileSync(file, 'utf8');
  const wanted = [...layout.controllerTables, ...Object.values(layout.editor ?? {})];
  const tables = readTables(html).filter((t) => wanted.includes(t.title));
  const text = textOf(html);
  // The page's channel routing (`Drum MIDI channel: CH10`) and a stated default channel, as printed.
  const routing = [...text.matchAll(/(?:^|\s|-)\s*([A-Z][A-Za-z]*(?: \d)?) MIDI channel: CH(\d+)/g)].map((m) => ({ target: m[1], channel: Number(m[2]) }));
  const defaultChannel = layout.defaultChannel ? layout.defaultChannel.exec(text) : null;
  return {
    source: { title: doc.title, file: doc.file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url, saved: doc.saved },
    ...(layout.editor ? { protocol: paragraphAfter(html, layout.editor.protocol) } : {}),
    ...(routing.length ? { routing } : {}),
    ...(defaultChannel ? { defaultChannel: { text: defaultChannel[0], channel: Number(defaultChannel[1]) } } : {}),
    tables,
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const { tables, ...rest } = data;
  const head = JSON.stringify(rest, null, 2).replace(/\n}$/, '');
  const table = (t) => `    {"title":${JSON.stringify(t.title)},${t.note ? `"note":${JSON.stringify(t.note)},` : ''}"columns":${JSON.stringify(t.columns)},"rows":[\n${t.rows.map((r) => `      ${JSON.stringify(r)}`).join(',\n')}\n    ]}`;
  return `${head},\n  "tables": [\n${tables.map(table).join(',\n')}\n  ]\n}\n`;
}

async function main() {
  const [name, file] = process.argv.slice(2);
  if (!name || !file) {
    console.error('usage: node tools/profiles/twisted/import-twisted.mjs <name> <saved page.html>');
    process.exitCode = 2;
    return;
  }
  const layout = await loadLayout(name);
  if (path.basename(file) !== layout.document.file) {
    console.error(`${name}'s layout reads ${layout.document.file}`);
    process.exitCode = 2;
    return;
  }
  const data = importPage(layout, file);
  writeFileSync(path.join(HERE, 'tables', `${name}.json`), stringifyTranscription(data));
  console.log(`Wrote tables/${name}.json: ${data.tables.map((t) => `${t.title} (${t.rows.length})`).join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
