// import-te.mjs — a teenage engineering guide page -> tools/profiles/teenage/tables/<name>.json
//
//   node tools/profiles/teenage/import-te.mjs <name> <page.html>
//
// The layout (synths/<name>.mjs) names the guide page, where it is (a page of teenage.engineering's
// guides, saved as HTML: `curl -sSL <url> -o <file>`), and which of its tables to read.
// read-te-guide.mjs reads them. What is committed is the tables as printed, with the page's address,
// the day it was saved and its SHA-256: a guide is a live page, and changes.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { pageCells, readTables } from './read-te-guide.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

export function importDocument(layout, file) {
  const doc = layout.document;
  const tables = readTables(pageCells(readFileSync(file, 'utf8'))).filter((t) => layout.tables.test(t.caption));
  return {
    sources: [{ title: doc.title, file: path.basename(file), saved: doc.saved, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
    rows: tables.flatMap((t) => t.rows.map((r) => ({ table: t.caption, ...r }))),
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
    console.error('usage: node tools/profiles/teenage/import-te.mjs <name> <page.html>');
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
