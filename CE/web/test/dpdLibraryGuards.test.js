// Guards on the DPD library itself, independent of any one device.
//
// Both of these exist because of the same failure: an AN1x audit found the app running one address
// map while the library file held another, and found a profile the tooling had never once
// validated. verify.mjs runs 135 checks and passes them whatever any library profile says — it
// exercises the machinery, not the data — so nothing was reading these files end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateProfile } from '../../dpd/tools/validate.mjs';

const at = (path) => fileURLToPath(new URL(path, import.meta.url));
const LIBRARY_DIR = at('../../dpd/library/');
const profiles = readdirSync(LIBRARY_DIR).filter((name) => name.endsWith('.json'));

test('every library profile passes the validator', () => {
  assert.ok(profiles.length >= 2, 'the library should not be empty');
  for (const name of profiles) {
    const profile = JSON.parse(readFileSync(LIBRARY_DIR + name, 'utf8'));
    const result = validateProfile(profile);
    const errors = Array.isArray(result) ? result : (result.errors ?? []);
    assert.deepEqual(errors, [], `${name}`);
    assert.equal(result.ok ?? true, true, `${name}`);
  }
});

test('every library profile agrees with the copy the app bundles', () => {
  // emit-library.mjs bundles the library into the web app. Nothing re-runs it on a library edit, so
  // the two can drift silently — and when they do, the tests read the source file, the app reads the
  // bundle, and a fix looks applied while the running app still sends the old bytes.
  const bundled = JSON.parse(readFileSync(at('../src/CE_Application/generated/dpd/dpdLibrary.json'), 'utf8'));
  for (const name of profiles) {
    const profile = JSON.parse(readFileSync(LIBRARY_DIR + name, 'utf8'));
    const copy = bundled[profile.id];
    assert.ok(copy, `${profile.id} is in the library but not in the bundle — re-run emit-library.mjs`);
    assert.deepEqual(copy, profile,
      `${profile.id} differs between CE/dpd/library and the bundled copy — re-run emit-library.mjs`);
  }
});

test('a DPD-backed profile ships the runtime map the app looks up', () => {
  // dpdProfileMap registers a legacy profile id as DPD-backed. If the matching runtime map is not
  // generated and wired into deviceAddress.js, the app takes the DPD path and then finds nothing —
  // which surfaces to the user as "unresolved profile", not as a missing build step.
  const map = JSON.parse(readFileSync(at('../src/CE_Application/generated/dpdProfileMap.json'), 'utf8'));
  const wiring = readFileSync(at('../src/CE_Application/utils/deviceAddress.js'), 'utf8');
  const generated = readdirSync(at('../src/CE_Application/generated/'));

  for (const entry of Object.values(map)) {
    const source = entry?.dpdSource ?? entry;
    if (typeof source !== 'string') continue;
    assert.ok(generated.includes(`${source}.runtime.json`),
      `${source} is registered as DPD-backed but has no runtime map — run emit-runtime.mjs ${source}`);
    assert.ok(wiring.includes(`'${source}'`),
      `${source}.runtime.json exists but deviceAddress.js does not list it in RUNTIMES`);
  }
});
