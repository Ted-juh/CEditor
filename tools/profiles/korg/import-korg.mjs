// import-korg.mjs — a Korg MIDI Implementation text -> tools/profiles/korg/tables/<name>.json
//
//   node tools/profiles/korg/import-korg.mjs <MIDIImp.txt> <name>
//
// Keeps what a profile is made from, as printed: the control changes the instrument recognises and
// the ones it transmits (2-1 and 1-1), its NRPN table, every footnote and list those point to, and
// the Device Inquiry reply. With the document's file name, SHA-256 and URL. This is committed; the
// text file is Korg's copyright and is not. Anyone with the same file can re-run this and diff.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { documentTitle, readFootnotes, readTables } from './read-korg-text.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadLayout(name) {
  return (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
}

/** `10 (16)` -> 16. */
const ccNumber = (cell) => {
  const m = /^([0-9a-f]{2})\s*\(\s*(\d+)\s*\)$/i.exec(cell.trim());
  return m && Number.parseInt(m[1], 16) === Number(m[2]) ? Number(m[2]) : null;
};

/** The control change rows of a channel message table: `Bn | 10 (16) | vv (vv) | AMP EG ATTACK …`. */
function controlChanges(table) {
  const out = [];
  for (const row of table?.rows ?? []) {
    if (!/^Bn$/i.test(row.cells[0] ?? '')) continue;
    const cc = ccNumber(row.cells[1] ?? '');
    if (cc === null) continue;
    out.push({ line: row.line, cc, third: row.cells[2] ?? '', desc: row.cells.at(-1), more: row.more.map((c) => c.at(-1)).filter(Boolean) });
  }
  return out;
}

/** The Program Change row: `Cn | pp (pp) | -- (--) | Program Change (pp=0~99)`. */
function programChange(table) {
  const row = (table?.rows ?? []).find((r) => /^Cn$/i.test(r.cells[0] ?? ''));
  return row ? { line: row.line, desc: row.cells.at(-1) } : null;
}

/** NRPN rows: `| --  10  | VOICE MODE TYPE | 0~4  *3-5 |`. */
function nrpnRows(table) {
  const out = [];
  for (const row of table?.rows ?? []) {
    const m = /^(--|[0-9a-f]{2})\s+([0-9a-f]{2})$/i.exec(row.cells[0] ?? '');
    if (!m) continue;
    out.push({ line: row.line, msb: m[1], lsb: m[2], name: row.cells[1] ?? '', value: row.cells[2] ?? '', more: row.more.map((c) => c.slice(1).join(' ').trim()).filter(Boolean) });
  }
  return out;
}

/** The Device Inquiry reply: each byte and what it is. */
function identityRows(tables) {
  const reply = tables.find((t) => /UNIVERSAL SYSTEM EXCLUSIVE/i.test(t.heading?.title ?? '') && t.rows.some((r) => /Identity Reply/i.test(r.cells.join(' '))));
  return reply ? reply.rows.map((r) => ({ byte: r.cells[0], description: r.cells.slice(1).join(' ').replace(/\s+/g, ' ').trim() })) : [];
}

export function importText(file, layout) {
  const text = readFileSync(file, 'utf8');
  const tables = readTables(text);
  const { marks, notes } = readFootnotes(text);
  const titled = (id) => tables.find((t) => t.heading?.id === id && /CHANNEL MESSAGES/i.test(t.heading.title));
  const transmitted = controlChanges(titled(layout.tables?.transmitted ?? '1-1'));
  const received = controlChanges(titled(layout.tables?.received ?? '2-1'));
  const nrpnTable = tables.find((t) => /\bNRPN\b|Non Registered/i.test(t.heading?.title ?? '') && t.rows.some((r) => /^(--|[0-9a-f]{2})\s+[0-9a-f]{2}$/i.test(r.cells[0] ?? '')));
  const title = documentTitle(text);
  return {
    source: {
      title: layout.document.title,
      printedTitle: title.title,
      revision: title.revision,
      date: title.date,
      file: path.basename(file),
      sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
      url: layout.document.url,
    },
    received,
    transmitted,
    programChange: programChange(titled(layout.tables?.received ?? '2-1')),
    nrpn: nrpnRows(nrpnTable),
    identity: identityRows(tables),
    marks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, v.text])),
    lists: Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, { title: v.title, entries: v.entries, lines: v.lines }])),
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyTranscription(data) {
  const out = ['{', `  "source": ${JSON.stringify(data.source)},`, `  "programChange": ${JSON.stringify(data.programChange)},`];
  for (const key of ['received', 'transmitted', 'nrpn', 'identity']) {
    out.push(`  "${key}": [`);
    data[key].forEach((row, i) => out.push(`    ${JSON.stringify(row)}${i < data[key].length - 1 ? ',' : ''}`));
    out.push('  ],');
  }
  out.push('  "marks": {');
  const marks = Object.entries(data.marks);
  marks.forEach(([k, v], i) => out.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < marks.length - 1 ? ',' : ''}`));
  out.push('  },', '  "lists": {');
  const lists = Object.entries(data.lists);
  lists.forEach(([k, v], i) => out.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < lists.length - 1 ? ',' : ''}`));
  out.push('  }', '}');
  return `${out.join('\n')}\n`;
}

async function main() {
  const [file, name] = process.argv.slice(2);
  if (!file || !name) {
    console.error('usage: node tools/profiles/korg/import-korg.mjs <MIDIImp.txt> <name>');
    process.exitCode = 2;
    return;
  }
  const layout = await loadLayout(name);
  if (path.basename(file) !== layout.document.file) {
    console.error(`${name}'s layout reads ${layout.document.file}, not ${path.basename(file)}`);
    process.exitCode = 2;
    return;
  }
  const data = importText(file, layout);
  const out = path.join(HERE, 'tables', `${name}.json`);
  writeFileSync(out, stringifyTranscription(data));
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${data.received.length} received and ${data.transmitted.length} transmitted controllers, ${data.nrpn.length} NRPNs, ${Object.keys(data.marks).length} marks, ${Object.keys(data.lists).length} lists`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
