// from-legacy.mjs — the DPD conversion of the generated device profiles, run from the command line.
//
//   node CE/dpd/tools/from-legacy.mjs --check                          every profile converts and emits back
//   node CE/dpd/tools/from-legacy.mjs <profile id>... [--out <dir>]    write those models, to look at
//
// The Device Profile Designer converts a generated profile when it opens one
// (../from-legacy-core.mjs, which says what the conversion is and what its gate checks), so no
// converted model is stored: the profile stays the one source. This runs that gate over every
// profile, as CE/web/test/dpdConvertedModels.test.js does, and fails if any profile does not convert,
// its model does not validate, or it emits anything else.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { legacyToDpd, compareEmission } from '../from-legacy-core.mjs';
import { validateProfile } from './validate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILES = join(HERE, '..', '..', 'profiles', 'test');
const LIBRARY = join(HERE, '..', 'library');

/** The hand-made models' ids, which a converted model must not take. */
export const handMadeIds = () => new Set(readdirSync(LIBRARY).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));

/** Every engine profile but those made from a DPD model in the first place. */
export function generatedProfiles() {
  return readdirSync(PROFILES).filter((f) => f.endsWith('.ceditor-device.json')).sort()
    .map((f) => JSON.parse(readFileSync(join(PROFILES, f), 'utf8')))
    .filter((p) => !p.dpdSource);
}

/** One profile through the conversion and the gate: [] when it holds, else what does not. */
export async function checkProfile(legacy, handMade = handMadeIds()) {
  const { localCompileParameter } = await import('../../web/src/CE_Application/stores/deviceProfileLocalEngine.js');
  const { model, why } = legacyToDpd(legacy, { handMade });
  if (!model) return [`does not convert: ${why}`];
  const problems = compareEmission(legacy, model, localCompileParameter);
  const validation = validateProfile(model);
  for (const e of Array.isArray(validation) ? validation : (validation.errors ?? [])) problems.push(`validation: ${e}`);
  return problems;
}

async function main(argv) {
  const handMade = handMadeIds();
  if (argv.includes('--check')) {
    let failed = 0;
    const profiles = generatedProfiles();
    for (const legacy of profiles) {
      const problems = await checkProfile(legacy, handMade);
      if (problems.length) { failed += 1; console.log(`${legacy.id}: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` (+${problems.length - 3})` : ''}`); }
    }
    console.log(failed ? `${failed} of ${profiles.length} profiles do not convert to a DPD model that emits them back.` : `All ${profiles.length} generated profiles convert to DPD models that emit them back.`);
    if (failed) process.exit(1);
    return;
  }
  const outAt = argv.indexOf('--out');
  const out = outAt >= 0 ? argv[outAt + 1] : '.';
  const ids = argv.filter((a, k) => !a.startsWith('--') && argv[k - 1] !== '--out');
  if (!ids.length) { console.error('usage: from-legacy.mjs --check | <profile id>... [--out <dir>]'); process.exit(2); }
  mkdirSync(out, { recursive: true });
  for (const id of ids) {
    const legacy = JSON.parse(readFileSync(join(PROFILES, `${id}.ceditor-device.json`), 'utf8'));
    const { model, why } = legacyToDpd(legacy, { handMade });
    if (!model) { console.log(`${id}: does not convert: ${why}`); continue; }
    const file = join(out, `${model.id}.json`);
    writeFileSync(file, `${JSON.stringify(model, null, 2)}\n`);
    console.log(`${id} -> ${file}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.stack ?? e.message); process.exit(1); });
}
