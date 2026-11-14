// make-profiles.mjs — build every Tasty Chips profile from its transcription and layout.
//
//   node tools/profiles/tastychips/make-profiles.mjs              # write CE/profiles/test/<id>.ceditor-device.json
//   node tools/profiles/tastychips/make-profiles.mjs --check      # fail if a committed profile is stale
//   node tools/profiles/tastychips/make-profiles.mjs gr-2      # just one
//
// An instrument is two files: tables/<name>.json (the manual's MIDI Command Table as printed, from
// import-tastychips.mjs) and synths/<name>.mjs (the layout). Neither needs Tasty Chips' manual.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCommitted } from '../../scripts/readCommitted.mjs';
import { buildTastyChipsProfile, stringifyProfile } from './build-tastychips-profile.mjs';
import { buildGr1Profile } from './build-gr1-profile.mjs';
import { buildPageProfile } from './build-page-profile.mjs';
import { loadLayout } from './import-tastychips.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
export const PROFILE_DIR = path.join(REPO, 'CE/profiles/test');

export const SYNTHS = readdirSync(path.join(HERE, 'synths')).filter((f) => f.endsWith('.mjs') && f !== 'sections.mjs').map((f) => f.replace(/\.mjs$/, '')).sort();

export async function build(name) {
  const layout = await loadLayout(name);
  const data = JSON.parse(readFileSync(path.join(HERE, 'tables', `${name}.json`), 'utf8'));
  const profile = layout.form === 'gr1' ? buildGr1Profile(data, layout) : layout.form === 'page' ? buildPageProfile(data, layout) : buildTastyChipsProfile(data, layout);
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
      if (readCommitted(out) !== text) { stale++; console.error(`Stale: ${relative} — run: node tools/profiles/tastychips/make-profiles.mjs ${name}`); }
      continue;
    }
    writeFileSync(out, text);
    const choices = profile.parameters.filter((p) => p.type === 'choice').length;
    console.log(`Wrote ${relative}: ${profile.parameters.length} parameters (${choices} choices), ${(text.length / 1024).toFixed(1)} KB`);
  }
  if (check) {
    if (stale) process.exitCode = 1;
    else console.log('Tasty Chips profiles are up to date.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
