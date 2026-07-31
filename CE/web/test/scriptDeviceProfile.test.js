// scriptDeviceProfile.test.js — the device profile DOCUMENT, which ce.device could not read.
//
// The module could ask what parameters a synth has, read and write their values, define new ones,
// and request and apply dumps. What it could not do was read the profile itself: the variables every
// recipe interpolates, the timing it is throttled by, what the profile claims it can do, or what
// messages it can build. `profile()` answered from the catalogue row — an id, a name, and the live
// session — and the authored JSON behind it was unreachable.
//
// Two of those are not cosmetic. `variables` holds `channel` and `deviceId`, which every recipe
// substitutes into every message the panel sends; a rig with two units of the same synth cannot be
// addressed at all without them. And `coverage` is how a script decides whether to write one
// parameter or send a whole edit buffer.
//
// The audit at the bottom is the part with the longest life: it holds the module to the profiles
// the app actually ships, so the next field a profile grows is a decision rather than a silence.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get } from 'svelte/store';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { deviceRoleMappings } from '../src/CE_Application/stores/deviceProfiles.js';
import { profileSources } from '../src/CE_Application/stores/deviceProfileStores.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { MEMBER_BY_ID, moduleMemberMap } from '../src/CE_Application/scripting/panelApi.js';

const here = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(here, '..', '..', 'profiles', 'test');

/** Every profile the app ships, parsed. The audit is held against these, not against a fixture. */
const SHIPPED = readdirSync(PROFILE_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, profile: JSON.parse(readFileSync(join(PROFILE_DIR, f), 'utf8')) }));

/** A panel with one role mapped to a real shipped profile. */
function withDevice(file, fn, { variables, timingOverrides } = {}) {
  const { profile } = SHIPPED.find((p) => p.file === file);
  panels.set([{ id: 'p', name: 'P', controls: [], scripting: { modules: ['ce.core', 'ce.device'] } }]);
  activePanelId.set('p');
  profileSources.set({ [profile.id]: { profileId: profile.id, source: JSON.stringify(profile) } });
  deviceRoleMappings.set({
    mainSynth: {
      role: 'mainSynth', profileId: profile.id,
      midiDestination: { id: 'out1', name: 'Out 1' }, midiInput: { id: 'in1', name: 'In 1' },
      syncDirection: 'pull',
      variables: variables ?? {}, timingOverrides: timingOverrides ?? {},
    },
  });
  clearScriptTrace();
  try {
    return fn(scriptApiForTesting('', 'device-script').ce.device, profile);
  } finally {
    panels.set([]); profileSources.set({}); deviceRoleMappings.set({});
  }
}

const said = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
const withVars = SHIPPED.find((p) => p.profile.variables?.deviceId !== undefined).file;

/* ------------------------------------------------------------------- reading the document */

test('variables read as the profile declares them', () => {
  withDevice(withVars, (d, profile) => {
    const v = d.variables();
    assert.deepEqual(v, profile.variables, 'with no override, the profile IS the answer');
    assert.ok('deviceId' in v, 'the value every recipe substitutes into every message');
  });
});

test('this project overrides the profile, and the profile is left alone', () => {
  // The precedence the send path uses. A profile is a shared document: two panels driving two units
  // of the same synth must sit on different device ids without either editing it.
  withDevice(withVars, (d, profile) => {
    assert.notEqual(profile.variables.deviceId, 17, 'the fixture would not prove anything otherwise');
    assert.equal(d.variables().deviceId, 17, 'the override wins');
    assert.equal(d.variables().channel, profile.variables.channel, 'and the rest still comes from the profile');
  }, { variables: { deviceId: 17 } });
});

test('setVariable writes the override, not the profile', () => {
  withDevice(withVars, (d, profile) => {
    const before = JSON.stringify(get(profileSources)[profile.id].source);
    assert.equal(d.setVariable('deviceId', 17), true);
    assert.equal(d.variables().deviceId, 17);
    assert.equal(get(deviceRoleMappings).mainSynth.variables.deviceId, 17, 'on the mapping');
    assert.equal(JSON.stringify(get(profileSources)[profile.id].source), before,
      'the shared profile document must not have been touched');
  });
});

test('a variable that is not a number, or has no name, is refused and says why', () => {
  withDevice(withVars, (d) => {
    assert.equal(d.setVariable('deviceId', 'seventeen'), false);
    assert.match(said(), /needs a number/);
    assert.equal(d.setVariable('', 3), false);
    assert.match(said(), /a name is required/);
    // …and clamped to a data byte. Individual uses narrow further — a channel is 1..16.
    assert.equal(d.setVariable('deviceId', 999), true);
    assert.equal(d.variables().deviceId, 127);
  });
});

test('writing the value it already holds is success, not a second write', () => {
  withDevice(withVars, (d) => {
    assert.equal(d.setVariable('deviceId', 17), true);
    assert.equal(d.setVariable('deviceId', 17), true);
    assert.match(said(), /already that way/);
  });
});

test('timing reads and overrides the same way', () => {
  const file = SHIPPED.find((p) => p.profile.timing?.minDelayBetweenMessagesMs !== undefined).file;
  withDevice(file, (d, profile) => {
    assert.equal(d.timing().minDelayBetweenMessagesMs, profile.timing.minDelayBetweenMessagesMs);
    assert.equal(d.setTiming('minDelayBetweenMessagesMs', 40), true);
    assert.equal(d.timing().minDelayBetweenMessagesMs, 40);
    assert.equal(get(deviceRoleMappings).mainSynth.timingOverrides.minDelayBetweenMessagesMs, 40);
  });
});

/* ------------------------------------------------------------------- what a profile claims */

test('coverage answers in the profile\'s own words, not as a boolean', () => {
  // The design decision this pins. Real profiles say "complete", "partial" and "notImplemented" —
  // and also "filter-block-rq1" and "broad-with-packed-text-and-requests". A can() returning
  // true/false would be a guess presented as a fact, and wrong for the ones that describe
  // themselves in prose.
  const withCoverage = SHIPPED.filter((p) => p.profile.coverage);
  assert.ok(withCoverage.length >= 2, 'the fixtures must actually carry coverage');

  const words = new Set(withCoverage.flatMap((p) => Object.values(p.profile.coverage)).map(String));
  assert.ok([...words].some((w) => !['complete', 'partial', 'notImplemented'].includes(w)),
    'if every profile answered from a fixed vocabulary, a boolean WOULD be safe — and they do not');

  const { file, profile } = withCoverage[0];
  withDevice(file, (d) => {
    assert.deepEqual(d.coverage(), profile.coverage, 'no feature gives the whole map');
    const [feature, value] = Object.entries(profile.coverage)[0];
    assert.equal(d.coverage(feature), value);
    assert.equal(d.coverage(feature.toUpperCase()), value, 'matched case-insensitively, as paths are');
    assert.equal(d.coverage('teleportation'), undefined, 'a feature it does not describe');
  });
});

test('recipes and requests list what the profile can build', () => {
  const file = SHIPPED.find((p) => (p.profile.requests ?? []).length > 0).file;
  withDevice(file, (d, profile) => {
    assert.deepEqual(d.recipes(), profile.messageRecipes.map((r) => r.id));
    assert.deepEqual(d.requests(), profile.requests.map((r) => r.id));
  });
  // A profile with no requests answers with an empty list rather than nothing: "none" is an answer.
  const noRequests = SHIPPED.find((p) => !(p.profile.requests ?? []).length).file;
  withDevice(noRequests, (d) => assert.deepEqual(d.requests(), []));
});

test('profile() reports the document, not just the catalogue row', () => {
  withDevice(withVars, (d, profile) => {
    const p = d.profile();
    assert.equal(p.id, profile.id);
    assert.equal(p.manufacturer, profile.manufacturer ?? '');
    assert.equal(p.family, profile.family ?? '');
    assert.equal(p.version, profile.profileVersion ?? '');
  });
});

test('nothing back when no profile is mapped, rather than an empty object', () => {
  panels.set([{ id: 'p', name: 'P', controls: [], scripting: { modules: ['ce.core', 'ce.device'] } }]);
  activePanelId.set('p');
  deviceRoleMappings.set({});
  try {
    const d = scriptApiForTesting('', 'device-script').ce.device;
    // `null`, the same thing profile() has always answered with when nothing is mapped — and what
    // the Lua boundary turns into nil, because wasmoon cannot be handed a null (scriptLuaBridge).
    assert.equal(d.variables(), null);
    assert.equal(d.timing(), null);
    assert.equal(d.coverage(), null);
    // A list, though: "this profile can build nothing" and "there is no profile" both answer with
    // an empty list rather than nil, so a caller can iterate without a guard either way.
    assert.deepEqual(d.recipes(), []);
    assert.equal(d.setVariable('deviceId', 1), false);
    assert.match(said(), /no device profile is mapped/);
  } finally { panels.set([]); deviceRoleMappings.set({}); }
});

/* ------------------------------------------------------------- the audit, kept honest */

/**
 * What a shipped profile may contain and no verb reaches.
 *
 * The same shape as componentCoverage.test.js, and for the same reason: a gap has no symptom. Each
 * exemption is a decision written down, and the list is checked against the profiles themselves so
 * a name left here after its key went away cannot excuse the next real one.
 */
const EXEMPT = {
  id: 'profile().id', name: 'profile().name', manufacturer: 'profile().manufacturer',
  family: 'profile().family', profileVersion: 'profile().version',
  status: 'profile().status', trust: 'profile().trust',
  parameters: 'parameters(), parameter(), defineParameter()',
  dumpDefinitions: 'defineDump(), requestDump(), applyDump(), sendDump(), buildDump()',
  // Authoring and provenance: what the profile editor is for, not what a panel drives.
  schemaVersion: 'the document format — a build-time fact',
  minCEditorVersion: 'ditto',
  tests: 'test vectors, run by the profile editor',
  sources: 'where the authoring information came from',
  testedWith: 'provenance, read by nothing in the app',
  dpdSource: 'the import this profile was generated from',
  authoringNotes: 'notes to the profile author',
  description: 'prose about the device',
  identity: 'the sysex identity handshake — the session performs it, a script does not',
  startup: 'what to send on connect, performed by the session',
  ui: 'how the profile editor lays itself out',
  presetBrowser: 'the preset list, driven by ce.device dumps rather than described here',
};

test('every key a shipped profile carries has a verb, or a reason', () => {
  const reachable = new Set(['variables', 'timing', 'coverage', 'messageRecipes', 'requests']);
  const undecided = new Set();
  for (const { profile } of SHIPPED) {
    for (const key of Object.keys(profile)) {
      if (reachable.has(key) || EXEMPT[key]) continue;
      undecided.add(key);
    }
  }
  assert.deepEqual([...undecided], [],
    'device profile keys a script cannot reach and nothing explains:\n  '
    + `${[...undecided].join('\n  ')}\n\nGive each a verb, or add it to EXEMPT with a reason.`);
});

test('nothing is exempt from a key no shipped profile has', () => {
  const real = new Set(SHIPPED.flatMap(({ profile }) => Object.keys(profile)));
  assert.deepEqual(Object.keys(EXEMPT).filter((k) => !real.has(k)), [],
    'EXEMPT names a profile key nothing ships');
});

test('the seven new members are declared and reachable by both spellings', () => {
  const map = moduleMemberMap('ce.device');
  for (const [short, id] of Object.entries({
    variables: 'deviceVariables', setVariable: 'deviceSetVariable',
    timing: 'deviceTiming', setTiming: 'deviceSetTiming',
    coverage: 'deviceCoverage', recipes: 'deviceRecipes', requests: 'deviceRequests',
  })) {
    assert.equal(map[short], id, `ce.device.${short} is not declared`);
    assert.ok(MEMBER_BY_ID[id], `${id} has no member descriptor`);
    // §1: a bare global `variables` or `timing` is exactly the collision the naming rule warns
    // about, so every flat alias here keeps the device prefix.
    assert.match(id, /^device/, `${id} does not keep the device prefix flat`);
  }
});
