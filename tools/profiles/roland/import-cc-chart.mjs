// import-cc-chart.mjs — a Roland manual's Control Change list -> tools/profiles/roland/charts/<name>.json
//
//   node tools/profiles/roland/import-cc-chart.mjs <document.pdf> <name> --format chart|list|hex
//        [--chart <n>] [--url <where it came from>]
//
// For the instruments whose MIDI is control changes alone (read-cc-list.mjs has the four ways Roland
// prints the list). As with the address maps, the PDF is Roland's copyright and is not committed;
// the transcription is, with the file's name, SHA-256 and the page it was read from, so anyone with
// the same PDF can re-run this and diff.
//
// `--chart n` picks the nth chart when a document prints more than one (the JP-08's second chart is
// its Control Mode, the JU-06A's its JUNO-106 mode). With `--format list` or `hex` the chart is still
// read, for what it says each number does on the wire and as the check on the list.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { documentPages, readCharts, readHexList, readList } from './read-cc-list.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `Model: JP-08`, `Date: Aug. 03, 2016`, `Version 1.01`, from the chart's own page. */
export function chartHeader(text) {
  const field = (label) => new RegExp(`${label}\\s*[:：.]?\\s*(\\S(?:.*?\\S)?)(?:\\s{3,}|$)`, 'mi').exec(text)?.[1]?.trim() ?? null;
  const model = field('Model');
  return {
    model: model?.replace(/\s*MIDI Implementation Chart.*$/i, '').trim() ?? null,
    date: field('Date'),
    version: field('Version'),
  };
}

/**
 * The rows a profile is built from, and what the document says about each. A chart row naming
 * several numbers (`0, 32 Bank select`, `6, 38 Data Entry`) is a controller pair, not a parameter,
 * and is left to the layout.
 */
export function importChart(pdf, { format = 'chart', chart: chartIndex = 0 } = {}) {
  const pages = documentPages(pdf);
  const charts = readCharts(pages);
  const chart = charts[chartIndex];
  if (!chart) throw new Error(`${path.basename(pdf)}: no chart ${chartIndex} (found ${charts.length})`);
  const issues = [];

  const onWire = new Map();
  for (const row of chart.rows) for (const n of row.numbers) onWire.set(n, { tx: row.tx, rx: row.rx, marks: row.marks });

  let rows;
  if (format === 'chart') {
    rows = chart.rows.filter((row) => row.numbers.length === 1 && row.name)
      .map((row) => ({ cc: row.numbers[0], name: row.name, tx: row.tx, rx: row.rx, marks: row.marks, page: row.page }));
    const spans = chart.rows.filter((row) => row.numbers.length > 1 && row.name);
    for (const row of spans) issues.push(`p${row.page}: ${row.numbers.join(', ')} ${row.name} names more than one number, left to the layout`);
  } else {
    const listed = format === 'hex' ? readHexList(pages) : { rows: readList(pages), issues: [] };
    issues.push(...listed.issues);
    rows = listed.rows.map((row) => {
      const wire = onWire.get(row.numbers[0]) ?? chart.whole;
      return {
        cc: row.numbers[0],
        name: row.name,
        tx: wire?.tx ?? null,
        rx: wire?.rx ?? null,
        marks: [...new Set([...(wire?.marks ?? []), ...row.marks])],
        page: row.page,
        ...(row.gaps ? { gaps: true } : {}),
      };
    });
    // The two tables are on the same pages and must agree.
    const named = new Set(rows.map((r) => r.cc));
    const counted = new Set(chart.numbers);
    if (counted.size) {
      for (const n of named) if (!counted.has(n)) issues.push(`CC ${n} is named in the list but not in the chart's Control Change rows`);
      const spanned = new Set(chart.spanned);
      for (const n of counted) {
        if (named.has(n) || spanned.has(n) || chart.rows.some((r) => r.name && r.numbers.length === 1 && r.numbers[0] === n)) continue;
        issues.push(`CC ${n} is in the chart's Control Change rows but the list does not name it`);
      }
    }
  }

  const seen = new Map();
  for (const row of rows) {
    if (seen.has(row.cc)) issues.push(`CC ${row.cc} is listed twice: "${seen.get(row.cc)}" and "${row.name}"`);
    seen.set(row.cc, row.name);
  }
  rows.sort((a, b) => a.cc - b.cc);
  const byName = new Map();
  for (const row of rows) byName.set(row.name.toUpperCase(), [...(byName.get(row.name.toUpperCase()) ?? []), row.cc]);
  for (const [name, numbers] of byName) if (numbers.length > 1) issues.push(`"${name}" is printed for CC ${numbers.join(' and ')}`);

  return {
    source: {
      ...chartHeader(pages[chart.page - 1]),
      file: path.basename(pdf),
      sha256: createHash('sha256').update(readFileSync(pdf)).digest('hex'),
      pages: pages.length,
      chartPage: chart.page,
    },
    format,
    chart: {
      numbers: [...new Set(chart.numbers)].sort((a, b) => a - b),
      spans: chart.rows.filter((row) => row.numbers.length > 1).map((row) => ({ numbers: row.numbers, name: row.name, tx: row.tx, rx: row.rx })),
      ...(chart.whole ? { whole: chart.whole } : {}),
      notes: chart.notes,
    },
    issues,
    rows,
  };
}

/** One row per line, so a re-import that changes one row changes one line. */
export function stringifyChart(chart) {
  const { rows, ...head } = chart;
  const lines = ['{'];
  for (const [key, value] of Object.entries(head)) lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  lines.push('  "rows": [');
  rows.forEach((row, i) => lines.push(`    ${JSON.stringify(row)}${i < rows.length - 1 ? ',' : ''}`));
  lines.push('  ]');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const positional = args.filter((a, i) => !a.startsWith('--') && !['--url', '--format', '--chart'].includes(args[i - 1]));
  const [pdf, name] = positional;
  if (!pdf || !name) {
    console.error('usage: node tools/profiles/roland/import-cc-chart.mjs <document.pdf> <name> --format chart|list|hex [--chart n] [--url <url>]');
    process.exitCode = 2;
    return;
  }
  const chart = importChart(pdf, { format: option('--format') ?? 'chart', chart: Number(option('--chart') ?? 0) });
  const url = option('--url');
  if (url) chart.source.url = url;
  const dir = path.join(HERE, 'charts');
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${name}.json`);
  writeFileSync(out, stringifyChart(chart));
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${chart.rows.length} controllers from p${chart.source.chartPage}`
    + `${chart.issues.length ? `, ${chart.issues.length} issue(s):` : ''}`);
  for (const issue of chart.issues) console.log(`  ${issue}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
