// Layer 2 importer: Cakewalk .ins -> native DPD JSON.
// .ins carries only names + CC maps + bank-select method (no SysEx/packing/checksums/dumps),
// so the result lands as completeness 'structural-only' with a "what came through / what needs
// you" summary. Run: node CE/dpd/tools/import-ins.mjs [path.ins]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProfile } from './validate.mjs';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function parseIns(text) {
  const top = { '.patch names': {}, '.note names': {}, '.controller names': {}, '.instrument definitions': {} };
  let section = null, sub = null;
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.replace(/;.*$/, '').trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (top[lower] !== undefined) { section = lower; sub = null; continue; }
    const m = line.match(/^\[(.+)\]$/);
    if (m) { sub = m[1]; if (section) top[section][sub] = {}; continue; }
    const kv = line.match(/^([^=]+)=(.*)$/);
    if (kv && section && sub) top[section][sub][kv[1].trim()] = kv[2].trim();
  }
  return {
    patchSets: top['.patch names'],
    noteSets: top['.note names'],
    controllerSets: top['.controller names'],
    instruments: top['.instrument definitions'],
  };
}

export function insToProfile(parsed, instrumentName) {
  const inst = parsed.instruments[instrumentName];
  if (!inst) throw new Error(`instrument '${instrumentName}' not found`);
  const ctrlSet = parsed.controllerSets[inst['Control']] ?? {};
  const patchRef = inst['Patch[*]'] || Object.values(inst).find((v) => parsed.patchSets[v]);
  const keyRef = inst['Key[*]'];
  const patches = parsed.patchSets[patchRef] ?? {};
  const drums = parsed.noteSets[keyRef] ?? {};

  const parameters = Object.entries(ctrlSet).map(([cc, label]) => ({
    id: slug(label), name: label, group: 'Imported', valueType: 'continuous',
    range: { min: 0, max: 127 }, encoding: { type: 'u7' },
    access: { read: false, write: true },
    wires: [{ dir: 'write', msg: 'cc', cc: Number(cc) }],
    ui: { preferredComponent: 'Slider' },
  }));

  const profile = {
    schemaVersion: 1,
    id: 'imported.' + slug(instrumentName),
    version: '1.0.0',
    kind: 'model',
    label: instrumentName,
    scopes: { global: { kind: 'global', label: 'Controllers', instances: 1, parameters } },
    imported: {
      bankSelectMethod: inst['BankSelMethod'] ?? null,
      presets: Object.entries(patches).map(([pc, name]) => ({ pc: Number(pc), name })),
      drumKeys: Object.entries(drums).map(([note, name]) => ({ note: Number(note), name })),
    },
    provenance: {
      source: 'imported', verifiedRoundTrip: false, verifiedFullDump: false,
      verifiedOnHardware: null, confirmations: 0, contributors: [], importedFrom: 'cakewalk-ins',
    },
    completeness: 'structural-only',
  };

  const summary = {
    cameThrough: [
      `${parameters.length} controller names → parameters (CC)`,
      `${profile.imported.presets.length} patch names`,
      `${profile.imported.drumKeys.length} drum keys`,
      `bank-select method ${profile.imported.bankSelectMethod}`,
    ],
    needsYou: [
      'SysEx addresses (not present in .ins)',
      'bit-packing / value encodings',
      'checksums',
      'patch/bank dump layouts',
    ],
  };
  return { profile, summary };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('import-ins.mjs')) {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = process.argv[2] ?? join(here, '..', 'samples', 'sample.ins');
  const parsed = parseIns(readFileSync(path, 'utf8'));
  const names = Object.keys(parsed.instruments);
  const { profile, summary } = insToProfile(parsed, names[0]);
  const { ok, errors } = validateProfile(profile);

  const outDir = join(here, '..', 'build');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${profile.id}.json`);
  writeFileSync(outFile, JSON.stringify(profile, null, 2));

  console.log(`Imported '${names[0]}' from ${basename(path)} → ${outFile}`);
  console.log(`  validates: ${ok}${errors.length ? ' :: ' + errors.join('; ') : ''}`);
  console.log(`  completeness: ${profile.completeness} · source: ${profile.provenance.importedFrom}`);
  console.log('  what came through: ' + summary.cameThrough.join(' · '));
  console.log('  what needs you:    ' + summary.needsYou.join(' · '));
  process.exit(ok ? 0 : 1);
}
