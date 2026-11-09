// make-profiles.mjs — build every Roland profile that has a map and a layout.
//
//   node tools/profiles/roland/make-profiles.mjs            # write CE/profiles/test/<id>.ceditor-device.json
//   node tools/profiles/roland/make-profiles.mjs --check    # fail if a committed profile is stale
//   node tools/profiles/roland/make-profiles.mjs jd-xi      # just one
//
// A synth is two files: maps/<name>.json (the manual's address map, from import-manual.mjs) and
// synths/<name>.mjs (the layout). Neither needs the PDF, so this runs anywhere.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readCommitted } from '../../scripts/readCommitted.mjs';
import { buildProfile, stringifyProfile } from './build-profile.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
export const PROFILE_DIR = path.join(REPO, 'CE/profiles/test');

export const SYNTHS = readdirSync(path.join(HERE, 'synths')).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, '')).sort();

export async function loadSynth(name) {
  const synth = (await import(pathToFileURL(path.join(HERE, 'synths', `${name}.mjs`)).href)).default;
  const map = JSON.parse(readFileSync(path.join(HERE, 'maps', `${synth.map}.json`), 'utf8'));
  return { synth, map };
}

export async function build(name) {
  const { synth, map } = await loadSynth(name);
  const profile = buildProfile(map, synth);
  return { synth, profile, text: stringifyProfile(profile), out: path.join(PROFILE_DIR, `${synth.id}.ceditor-device.json`) };
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
      if (readCommitted(out) !== text) { stale++; console.error(`Stale: ${relative} — run: node tools/profiles/roland/make-profiles.mjs ${name}`); }
      continue;
    }
    writeFileSync(out, text);
    const groups = new Set(profile.parameters.map((p) => p.group)).size;
    console.log(`Wrote ${relative}: ${profile.parameters.length} parameters in ${groups} groups, `
      + `${profile.dumpDefinitions.length} dumps, ${(text.length / 1024 / 1024).toFixed(2)} MB`);
  }
  if (check) {
    if (stale) process.exitCode = 1;
    else console.log('Roland profiles are up to date.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
