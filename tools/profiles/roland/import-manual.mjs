// import-manual.mjs — a Roland MIDI Implementation PDF -> tools/profiles/roland/maps/<synth>.json
//
//   node tools/profiles/roland/import-manual.mjs <document.pdf> <synth> [--url <where it came from>]
//
// The map is what gets committed; the PDF is Roland's copyright and does not. So the map carries
// enough to find and check the exact document it was read from: the file name, its SHA-256, the
// model, date and version printed on its first page, and the URL when one is given. Anyone with the
// same PDF can re-run this and diff the result — which is the whole check on the transcription.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractText } from './extract-text.mjs';
import { checkTables, parseAddressMap } from './parse-address-map.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `Model: JD-Xi` / `Date: May 1, 2015` / `Version: 1.00`, from the document's own header. */
export function documentHeader(text) {
  const firstPage = text.split('\f')[0];
  const field = (label) => new RegExp(`^\\s*${label}\\s*:?\\s+(.+?)(?:\\s{3,}|$)`, 'mi').exec(firstPage)?.[1]?.trim() ?? null;
  return { model: field('Model'), date: field('Date'), version: field('Version') };
}

/**
 * The largest single message the instrument sends: "Data larger than 256 bytes will be divided into
 * packets of 256 bytes or less". 256 in nearly every Roland manual; 128 in the MC-09's and VR-09's.
 * A block bigger than this arrives as several DT1s, so the generator requests it in pieces no
 * bigger than this. Null when the manual does not say, and the generator then assumes 128, the
 * smallest any of them states.
 */
export function packetSize(text) {
  const match = /larger\s+than\s+(\d+)\s+bytes\s+(?:will|must)\s+be\s+divided\s+into\s+packets\s+of\s+(\d+)/i.exec(text.replace(/\s+/g, ' '));
  return match ? Number(match[2]) : null;
}

/** One table header per line, one row per line: a re-import that changes one row changes one line. */
export function stringifyMap(map) {
  const { tables, ...head } = map;
  const lines = ['{'];
  for (const [key, value] of Object.entries(head)) lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  lines.push('  "tables": [');
  tables.forEach((table, i) => {
    const { rows, entries, ...rest } = table;
    lines.push(`    ${JSON.stringify(rest).slice(0, -1)},`);
    for (const [name, list] of [['entries', entries], ['rows', rows]]) {
      lines.push(`     ${JSON.stringify(name)}: [`);
      list.forEach((item, j) => lines.push(`      ${JSON.stringify(item)}${j < list.length - 1 ? ',' : ''}`));
      lines.push(`     ]${name === 'entries' ? ',' : ''}`);
    }
    lines.push(`    }${i < tables.length - 1 ? ',' : ''}`);
  });
  lines.push('  ]');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const [pdf, synth] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--url');
  const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
  if (!pdf || !synth) {
    console.error('usage: node tools/profiles/roland/import-manual.mjs <document.pdf> <synth> [--url <url>]');
    process.exitCode = 2;
    return;
  }

  const text = extractText(pdf);
  const parsed = parseAddressMap(text);
  const issues = checkTables(parsed.tables);
  const header = documentHeader(text);
  const map = {
    source: {
      ...header,
      file: path.basename(pdf),
      sha256: createHash('sha256').update(readFileSync(pdf)).digest('hex'),
      pages: text.split('\f').length,
      packetSize: packetSize(text),
      ...(url ? { url } : {}),
      reader: 'tools/profiles/roland/parse-address-map.mjs',
    },
    modelId: parsed.modelId,
    ...(parsed.modelIdFrom ? { modelIdFrom: parsed.modelIdFrom } : {}),
    issues,
    tables: parsed.tables,
  };

  const out = path.join(HERE, 'maps', `${synth}.json`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, stringifyMap(map));
  const parameters = parsed.tables.reduce((n, t) => n + t.rows.filter((r) => !r.gap && !r.reserved).length, 0);
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${header.model ?? '?'} ${header.version ?? ''} (${header.date ?? 'undated'}), `
    + `model id ${parsed.modelId}, ${parsed.tables.length} tables, ${parameters} parameter rows`);
  if (issues.length) {
    console.log(`${issues.length} issue(s) recorded in the map:`);
    for (const issue of issues) console.log(`  - ${issue}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
