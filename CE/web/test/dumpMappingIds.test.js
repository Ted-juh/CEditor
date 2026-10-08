// Every dump mapping must name the parameter it fills — the one the profile's own parameter list
// calls by that id, and only once per dump.
//
// The AN1x's Scene 2 dump named no Scene 2 parameter. The emitter wrote the parameter list with
// `scene2.scPolyMode` for the second scene and the dump mappings with the prefix stripped, so all
// 111 of the Scene 2 mappings read into and wrote from Scene 1, and the voiceCommon dump mapped
// Free-EG tracks 2-4 onto track 1: 840 mappings onto 264 ids, 192 of them four times over. Every id
// still existed, so nothing refused the profile; a Scene 2 read just moved Scene 1's controls, and
// every built dump wrote Scene 1's values into Scene 2.
//
// Nothing caught it because the AN1x dump checks read the layout from the DPD source, where the ids
// are right, and the checks that read an emitted file asked only whether a mapped id exists. This
// reads the file the engine actually loads, and asks which parameter each offset lands on.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { resolveProfile } from '../../dpd/tools/dpd.mjs';
import { buildLegacyProfile } from '../../dpd/emit-legacy-core.mjs';
import { buildLegacyProfile as buildLegacyProfileInApp } from '../src/CE_Application/generated/dpd/emit-legacy-core.mjs';

const at = (path) => fileURLToPath(new URL(path, import.meta.url));
const PROFILE_DIR = at('../../profiles/test/');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const FILES = readdirSync(PROFILE_DIR).filter((name) => name.endsWith('.ceditor-device.json')).sort();
const DPD_MAP = read(at('../src/CE_Application/generated/dpdProfileMap.json'));

// A parameter read from two offsets of one dump is not something any shipped profile does: every
// multi-byte value is one mapping with a wide codec. If a profile ever needs it, name the dump and
// the parameter here, with the reason, rather than loosening the rule.
const INTENDED_REPEATS = new Set([/* 'profile-id/dumpId/parameterId' */]);

const mappingProblems = (profile) => {
  const ids = new Set((profile.parameters ?? []).map((p) => p.id));
  const problems = [];
  for (const dump of profile.dumpDefinitions ?? []) {
    const offsetsById = new Map();
    for (const mapping of dump.mappings ?? []) {
      if (!ids.has(mapping.parameter))
        problems.push(`${dump.id}: offset ${mapping.offset} maps "${mapping.parameter}", which the profile does not define`);
      const offsets = offsetsById.get(mapping.parameter) ?? [];
      offsets.push(mapping.offset);
      offsetsById.set(mapping.parameter, offsets);
    }
    for (const [id, offsets] of offsetsById) {
      if (offsets.length > 1 && !INTENDED_REPEATS.has(`${profile.id}/${dump.id}/${id}`))
        problems.push(`${dump.id}: "${id}" is mapped at ${offsets.length} offsets (${offsets.join(', ')})`);
    }
  }
  return problems;
};

test('every shipped dump mapping names a parameter the profile defines, once per dump', () => {
  let checked = 0;
  for (const name of FILES) {
    const profile = read(PROFILE_DIR + name);
    if (!profile.dumpDefinitions?.length) continue;
    checked += 1;
    const problems = mappingProblems(profile);
    assert.deepEqual(problems.slice(0, 10), [], `${name}: ${problems.length} problem(s)`);
  }
  assert.ok(checked >= 3, 'expected several shipped profiles with dumps');
});

test('the AN1x Scene 2 dump reads and writes Scene 2, offset for offset', () => {
  const profile = read(PROFILE_DIR + 'yamaha-an1x-dpd.ceditor-device.json');
  const dump = (id) => profile.dumpDefinitions.find((d) => d.id === id);
  const scene1 = dump('scene1').mappings;
  const scene2 = dump('scene2').mappings;
  assert.equal(scene2.length, 111);
  assert.equal(scene2.length, scene1.length);
  const scene1ByOffset = new Map(scene1.map((m) => [m.offset, m.parameter]));
  for (const m of scene2) {
    assert.ok(m.parameter.startsWith('scene2.'), `scene2 offset ${m.offset} maps ${m.parameter}`);
    assert.equal(m.parameter, `scene2.${scene1ByOffset.get(m.offset)}`, `scene2 offset ${m.offset}`);
  }
  // Scene 1 stays flat: every panel binds `scPolyMode`, not `scene1.scPolyMode`.
  assert.ok(scene1.every((m) => !m.parameter.includes('.')));

  // The user-voice dump carries both scenes; each must land in its own.
  const user = dump('userVoice').mappings;
  assert.equal(user.filter((m) => m.parameter.startsWith('scene2.')).length, 111);

  // voiceCommon carries four Free-EG tracks; tracks 2-4 must not fold onto track 1.
  const common = dump('voiceCommon').mappings;
  const tracks = new Set(common.map((m) => m.parameter.match(/^(fegTrack\d)\./)?.[1]).filter(Boolean));
  assert.deepEqual([...tracks].sort(), ['fegTrack2', 'fegTrack3', 'fegTrack4']);
});

test('each DPD-built profile is what its generator emits today', () => {
  // A fix to the emitter does nothing for the shipped file until somebody re-runs emit-legacy.mjs,
  // and the in-app Designer saves through the bundled copy of the emitter, which emit-library.mjs
  // has to re-copy. Both paths are checked against the file the engine loads.
  for (const [legacyId, entry] of Object.entries(DPD_MAP)) {
    const shipped = read(`${PROFILE_DIR}${legacyId}.ceditor-device.json`);
    const resolved = resolveProfile(entry.dpdSource);
    assert.deepEqual(buildLegacyProfile(resolved, { legacyId }), shipped,
      `${legacyId} is stale — re-run node CE/dpd/tools/emit-legacy.mjs ${entry.dpdSource}`);
    assert.deepEqual(buildLegacyProfileInApp(resolved, { legacyId }).dumpDefinitions, shipped.dumpDefinitions,
      `${legacyId}: the Designer's copy of the emitter disagrees — re-run node CE/dpd/tools/emit-library.mjs`);
  }
});
