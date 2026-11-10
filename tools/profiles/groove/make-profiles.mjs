// make-profiles.mjs — build every Groove Synthesis profile from its transcription and layout.
//
//   node tools/profiles/groove/make-profiles.mjs              # write CE/profiles/test/<id>.ceditor-device.json
//   node tools/profiles/groove/make-profiles.mjs --check      # fail if a committed profile is stale
//   node tools/profiles/groove/make-profiles.mjs 3rd-wave      # just one
//
// An instrument is two files: tables/<name>.json (the spec's NRPN table and lists as printed, from
// import-groove.mjs) and synths/<name>.mjs (the layout). Neither needs Groove Synthesis's spec.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCommitted } from '../../scripts/readCommitted.mjs';
import { buildGrooveProfile, stringifyProfile } from './build-groove-profile.mjs';
import { loadLayout } from './import-groove.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
export const PROFILE_DIR = path.join(REPO, 'CE/profiles/test');

export const SYNTHS = readdirSync(path.join(HERE, 'synths')).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, '')).sort();

export async function build(name) {
  const layout = await loadLayout(name);
  const data = JSON.parse(readFileSync(path.join(HERE, 'tables', `${name}.json`), 'utf8'));
  const profile = buildGrooveProfile(data, layout);
  return { name, layout, data, profile, text: stringifyProfile(profile), out: path.join(PROFILE_DIR, `${layout.id}.ceditor-device.json`) };
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const names = args.filter((a) => !a.startsWith('--'));
  let stale = 0;
  for (const name of names.length ? names : SYNTHS) {
    const { profile, text, out } = await build(name);
    const relative = path.relative(REPO, out);
    if (check) {
      if (readCommitted(out) !== text) { stale++; console.error(`Stale: ${relative} — run: node tools/profiles/groove/make-profiles.mjs ${name}`); }
      continue;
    }
    writeFileSync(out, text);
    const choices = profile.parameters.filter((p) => p.type === 'choice').length;
    const nrpns = profile.messageRecipes.filter((r) => r.kind === 'nrpn').length;
    console.log(`Wrote ${relative}: ${profile.parameters.length} parameters (${choices} choices, ${nrpns} NRPNs), ${(text.length / 1024).toFixed(1)} KB`);
  }
  if (check) {
    if (stale) process.exitCode = 1;
    else console.log('Groove Synthesis profiles are up to date.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
