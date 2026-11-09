// import-manual.mjs — a Sequential manual's NRPN tables -> tools/profiles/sequential/tables/<name>.json
//
//   node tools/profiles/sequential/import-manual.mjs <manual.pdf> <name>
//
// The layout (synths/<name>.mjs) says where the tables are: which pages, what their header reads,
// and the order of their columns. This reads them and writes the transcription, with the document's
// name, SHA-256 and URL. The transcription is committed; the PDF is Sequential's copyright and is
// not. Anyone with the same PDF can re-run this and diff.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { documentPages, readTables } from './read-nrpn-tables.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

/**
 * What the tables say about themselves, so a misread shows: the dump positions the older manuals
 * print before each NRPN count up with no gaps; layer B is layer A plus one fixed offset; a range
 * runs upwards; an NRPN is printed once per table.
 */
export function checkTables(tables) {
  const issues = [];
  for (const table of tables) {
    // Dump positions: printed in NRPN order, not their own (the Tetra's), so each sequence (a table
    // holding globals then voices restarts at 0) is checked as a set: no position twice.
    const sequences = [];
    for (const r of table.rows) {
      const n = Number.parseInt(r.param, 10);
      if (!Number.isInteger(n)) continue;
      if (n === 0 || !sequences.length) sequences.push(new Map());
      const seq = sequences.at(-1);
      if (seq.has(n)) issues.push(`${table.id}: dump position ${n} is printed for NRPN ${seq.get(n)} and ${r.nrpn}`);
      seq.set(n, r.nrpn);
    }
    const offsets = new Map();
    for (const r of table.rows) {
      if (!r.nrpnB || /^(N\/A|[Xx])$/.test(r.nrpnB) || !r.nrpn || r.nrpn === 'x') continue;
      const d = Number.parseInt(r.nrpnB, 10) - Number.parseInt(r.nrpn, 10);
      offsets.set(d, [...(offsets.get(d) ?? []), r.nrpn]);
    }
    if (offsets.size > 1) {
      const [usual] = [...offsets].sort((a, b) => b[1].length - a[1].length)[0];
      for (const [d, at] of offsets) if (d !== usual) issues.push(`${table.id}: layer B is A + ${d} at NRPN ${at.join(', ')}, not + ${usual}`);
    }
    const seen = new Set();
    for (const r of table.rows) {
      const m = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(r.range ?? '');
      if (m && Number(m[2]) < Number(m[1])) issues.push(`${table.id}: NRPN ${r.nrpn} has the range ${r.range}`);
      if (r.nrpn && r.nrpn !== 'x') {
        if (seen.has(r.nrpn)) issues.push(`${table.id}: NRPN ${r.nrpn} is printed twice`);
        seen.add(r.nrpn);
      }
    }
  }
  return issues;
}

export function importTables(pdf, layout) {
  const pages = documentPages(pdf);
  const tables = layout.tables.map((table) => {
    const rows = readTables(pages, table).map(({ page, column, more, footnotes, ...fields }) => ({ page, column, ...fields, more, ...(footnotes ? { footnotes } : {}) }));
    return { id: table.id, header: table.header.source, fields: table.fields, pages: table.pages, rows };
  });
  const issues = checkTables(tables);
  return {
    issues,
    source: {
      title: layout.document.title,
      version: layout.document.version ?? null,
      file: path.basename(pdf),
      sha256: createHash('sha256').update(readFileSync(pdf)).digest('hex'),
      pages: pages.length,
      url: layout.document.url,
    },
    tables,
  };
}

/** One row per line: a re-import that changes one row changes one line. */
export function stringifyTables(data) {
  const lines = ['{', `  "source": ${JSON.stringify(data.source)},`, `  "issues": ${JSON.stringify(data.issues ?? [])},`, '  "tables": ['];
  data.tables.forEach((table, t) => {
    const { rows, ...head } = table;
    lines.push(`    ${JSON.stringify(head).slice(0, -1)},"rows":[`);
    rows.forEach((row, i) => lines.push(`      ${JSON.stringify(row)}${i < rows.length - 1 ? ',' : ''}`));
    lines.push(`    ]}${t < data.tables.length - 1 ? ',' : ''}`);
  });
  lines.push('  ]', '}');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const [pdf, name] = process.argv.slice(2);
  if (!pdf || !name) {
    console.error('usage: node tools/profiles/sequential/import-manual.mjs <manual.pdf> <name>');
    process.exitCode = 2;
    return;
  }
  const layout = await loadLayout(name);
  if (path.basename(pdf) !== layout.document.file) {
    console.error(`${name}'s layout reads ${layout.document.file}, not ${path.basename(pdf)}`);
    process.exitCode = 2;
    return;
  }
  const data = importTables(pdf, layout);
  const out = path.join(HERE, 'tables', `${name}.json`);
  writeFileSync(out, stringifyTables(data));
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.tables.map((t) => `${t.id} ${t.rows.length}`).join(', ')} rows`
    + `${data.issues.length ? `, ${data.issues.length} issue(s):` : ''}`);
  for (const issue of data.issues) console.log(`  ${issue}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
