// make-cc-profiles.mjs — build every Roland profile whose MIDI is a Control Change list.
//
//   node tools/profiles/roland/make-cc-profiles.mjs            # write CE/profiles/test/<id>.ceditor-device.json
//   node tools/profiles/roland/make-cc-profiles.mjs --check    # fail if a committed profile is stale
//   node tools/profiles/roland/make-cc-profiles.mjs jp-08      # just one
//
// A synth is two files: charts/<name>.json (the manual's Control Change list, from
// import-cc-chart.mjs) and cc-synths/<name>.mjs (the layout). Neither needs the PDF.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readCommitted } from '../../scripts/readCommitted.mjs';
import { stringifyProfile } from './build-profile.mjs';
import { buildCcProfile } from './build-cc-profile.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
export const PROFILE_DIR = path.join(REPO, 'CE/profiles/test');

export const CC_SYNTHS = readdirSync(path.join(HERE, 'cc-synths')).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, '')).sort();

export async function loadCcSynth(name) {
  const synth = (await import(pathToFileURL(path.join(HERE, 'cc-synths', `${name}.mjs`)).href)).default;
  const chart = JSON.parse(readFileSync(path.join(HERE, 'charts', `${synth.chart}.json`), 'utf8'));
  return { synth, chart };
}

export async function buildCc(name) {
  const { synth, chart } = await loadCcSynth(name);
  const profile = buildCcProfile(chart, synth);
  return { synth, chart, profile, text: stringifyProfile(profile), out: path.join(PROFILE_DIR, `${synth.id}.ceditor-device.json`) };
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const names = args.filter((a) => !a.startsWith('--'));
  let stale = 0;
  for (const name of names.length ? names : CC_SYNTHS) {
    const { profile, text, out } = await buildCc(name);
    const relative = path.relative(REPO, out);
    if (check) {
      if (readCommitted(out) !== text) { stale++; console.error(`Stale: ${relative} — run: node tools/profiles/roland/make-cc-profiles.mjs ${name}`); }
      continue;
    }
    writeFileSync(out, text);
    const groups = new Set(profile.parameters.map((p) => p.group)).size;
    console.log(`Wrote ${relative}: ${profile.parameters.length} parameters in ${groups} groups, ${(text.length / 1024).toFixed(1)} KB`);
  }
  if (check) {
    if (stale) process.exitCode = 1;
    else console.log('Roland Control Change profiles are up to date.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
