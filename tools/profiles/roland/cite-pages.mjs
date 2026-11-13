// cite-pages.mjs — where in Roland's MIDI Implementation each parameter of a hand-made profile is
// printed, read from the reader's map of that document.
//
//   node tools/profiles/roland/cite-pages.mjs <profile.ceditor-device.json> <maps/<synth>.json>           # write
//   node tools/profiles/roland/cite-pages.mjs <profile.ceditor-device.json> <maps/<synth>.json> --check   # verify
//
// The profiles build-profile.mjs writes cite each parameter's table and page as they are built
// (rule 8, tools/profiles/README.md). The GAIA and SH-201 profiles were transcribed by hand and
// checked against the instruments before the reader existed, so they had none. Their documents were
// read since (README.md, "Before trusting the parser"): every address agreed. This gives each
// parameter the table its address falls in and that table's page, by address alone, and changes
// nothing else; a parameter with no address, or one the document does not print, is left as it is.
//
// make-gaia-profile.mjs calls citePages itself, since it writes its profile whole.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addAddress } from './build-profile.mjs';

const clean = (name) => String(name ?? '').replace(/^[■●❍\s]+/, '').trim();

/**
 * Each address the document prints a parameter at, as `{ table, page }`. The offset tables are
 * walked from the first (the model's address map): an entry names the table it is laid out as, with
 * a number or a part in it (`Patch Tone 1`, `Patch Tone (1:Upper)`, `User Patch (A-1)`) or the
 * temporary copy's prefix (`Temporary Patch`), which are taken off until a table answers.
 */
export function pagesByAddress(map) {
  const tables = new Map(map.tables.map((t) => [clean(t.name), t]));
  const top = map.tables.find((t) => t.kind === 'offsets');
  const out = new Map();
  if (!top) return out;
  const tableFor = (name, from) => {
    const n = clean(name);
    const tries = [n, n.replace(/\s*\([^)]*\)$/, ''), n.replace(/\s+\d+$/, ''), n.replace(/^(Temporary|User)\s+/, '').replace(/\s*\([^)]*\)$/, '')];
    for (const t of tries.map((x) => tables.get(x))) if (t && t !== from) return t;
    return null;
  };
  const walk = (table, base, depth) => {
    if (depth > 6) return;
    if (table.kind !== 'offsets') {
      for (const row of table.rows ?? []) {
        if (!row.offset) continue;
        const at = addAddress(base, row.offset);
        if (!out.has(at)) out.set(at, { table: clean(table.name), ...(table.page ? { page: table.page } : {}) });
      }
      return;
    }
    for (const entry of table.entries ?? []) {
      if (!entry.address || entry.gap) continue;
      const next = tableFor(entry.name, table);
      if (next) walk(next, addAddress(base, entry.address), depth + 1);
    }
  };
  walk(top, '00 00 00 00', 0);
  return out;
}

/** The profile with each addressed parameter's `source` from the map; counts of what was cited. */
export function citePages(profile, map) {
  const pages = pagesByAddress(map);
  let cited = 0, unprinted = 0, unaddressed = 0;
  const parameters = profile.parameters.map((p) => {
    if (!p.address) { unaddressed++; return p; }
    const at = pages.get(p.address);
    if (!at) { unprinted++; return p; }
    cited++;
    // `source` goes after `address`, where the generated profiles carry it, keeping the key order otherwise.
    const out = {};
    for (const [k, v] of Object.entries(p)) { if (k === 'source') continue; out[k] = v; if (k === 'address') out.source = at; }
    return out;
  });
  return { profile: { ...profile, parameters }, cited, unprinted, unaddressed };
}

// A file in JSON.stringify's layout is written in it. One laid out by hand (the GAIA demo keeps a
// list of choices one to a line) is not reformatted: a `"source": { ... }` line goes in after each
// cited parameter's `"address"` line, in its indent, and the result must parse to exactly the cited
// profile, or nothing is written.
const standard = (value) => `${JSON.stringify(value, null, 2)}\n`;
function insertSources(text, cited) {
  const lines = text.split('\n');
  let from = lines.findIndex((l) => /^\s*"parameters": \[/.test(l));
  if (from < 0) return null;
  for (const p of cited.parameters) {
    if (!p.source) continue;
    const at = lines.findIndex((l, i) => i > from && l.trim() === `"address": ${JSON.stringify(p.address)},`);
    if (at < 0) return null;
    const indent = lines[at].match(/^\s*/)[0];
    const fields = Object.entries(p.source).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ');
    lines.splice(at + 1, 0, `${indent}"source": { ${fields} },`);
    from = at + 1;
  }
  const out = lines.join('\n');
  try { return JSON.stringify(JSON.parse(out)) === JSON.stringify(cited) ? out : null; } catch { return null; }
}

const stripSources = (text) => text.split('\n').filter((l) => !/^\s*"source": \{ .* \},$/.test(l)).join('\n');

function main() {
  const [profilePath, mapPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!profilePath || !mapPath) {
    console.error('usage: node tools/profiles/roland/cite-pages.mjs <profile.json> <map.json> [--check]');
    process.exit(2);
  }
  const before = readFileSync(profilePath, 'utf8');
  const { profile, cited, unprinted, unaddressed } = citePages(JSON.parse(before), JSON.parse(readFileSync(mapPath, 'utf8')));
  const name = path.basename(profilePath);
  const original = JSON.parse(before);
  const uncited = { ...original, parameters: original.parameters.map(({ source, ...p }) => p) };
  // Laid out as JSON.stringify would, or by hand: then built from the file without its sources.
  const json = standard(original) === before ? standard(profile)
    : insertSources(standard(uncited) === before ? before : stripSources(before), profile);
  if (json == null) {
    console.error(`${name}: its layout could not be kept while citing; not touched.`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    if (json === before) { console.log(`${name}: its pages are cited.`); return; }
    console.error(`${name}: its pages are not cited as ${path.basename(mapPath)} prints them — run node tools/profiles/roland/cite-pages.mjs ${profilePath} ${mapPath}`);
    process.exitCode = 1;
    return;
  }
  writeFileSync(profilePath, json);
  console.log(`${name}: ${cited} parameters cited, ${unprinted} at an address the document does not print, ${unaddressed} with no address.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
