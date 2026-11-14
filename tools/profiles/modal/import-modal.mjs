// import-modal.mjs — a Modal manual -> tools/profiles/modal/tables/<name>.json
//
//   node tools/profiles/modal/import-modal.mjs <name> <manual.pdf>
//
// The layout (synths/<name>.mjs) names the manual, where it is downloaded from, the pages its MIDI CC
// chart is on and how the chart is set. Two shapes: the newer instruments' four lists side by side,
// `CC  Function`, read by the Nord reader (read-nord-cc.mjs, the number first); the older ones'
// `Function  CC  …  Values`, a value cell over as many lines as it needs around its row, read by
// the Behringer anchored-row reader (read-behringer-tables.mjs). What is committed is the chart as
// printed, with the manual's file name, SHA-256 and address. Needs poppler's pdftotext.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readAnchoredRows } from '../behringer/read-behringer-tables.mjs';
import { documentLines, readControllerList } from '../nord/read-nord-cc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

/** The chart's rows: [{ page, name, cc, values?, … }] as printed. */
export function readChart(lines, read) {
  // (`clip`: the part of a page the chart is on, where something else shares it: the Carbon8's MPE text.
  // `bottom`: where the chart ends, the folio under it not a row's.)
  const clipped = lines.filter((l) => l.y < (read.bottom ?? Infinity)).map((l) => {
    const [x0, x1] = read.clip?.[l.page] ?? [-Infinity, Infinity];
    return { ...l, words: l.words.filter((w) => w.x0 >= x0 && w.x0 < x1) };
  }).filter((l) => l.words.length);
  if (read.kind === 'pairs') return readControllerList(clipped).map((r) => ({ page: r.page, name: r.name, cc: r.value }));
  // (`halves`: the half pages the chart is on, where the other holds prose: the SKULPTsynth SE's page 19.)
  const rows = readAnchoredRows(clipped, read).filter((r) => !read.halves || (read.halves[r.page] ?? [0, 1]).includes(r.side));
  return rows.map(({ side, ...r }) => r);
}

export function importDocument(layout, file) {
  const doc = layout.document;
  const pages = layout.pages;
  const lines = documentLines(file, [Math.min(...pages), Math.max(...pages)]).filter((l) => pages.includes(l.page));
  return {
    sources: [{ title: doc.title, file: path.basename(file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), url: doc.url }],
    rows: readChart(lines, layout.read),
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
    console.error('usage: node tools/profiles/modal/import-modal.mjs <name> <manual.pdf>');
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
