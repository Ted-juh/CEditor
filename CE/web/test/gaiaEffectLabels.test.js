// gaiaEffectLabels.test.js — the four effect knobs, and the names nobody has yet.
//
// THE SITUATION. The GAIA's EFFECTS section is SELECT CONTROL, CONTROL 1/2/3 and LEVEL: five knobs
// whose meaning changes with the selected effect type. The MIDI implementation names the addresses
// "Distortion Parameter 1..32" and never says which of those CONTROL 1 turns for DIST as opposed to
// for BIT CRASH. That mapping is in the owner's manual, which this repo does not have.
//
// So effect-parameters.mjs ships with the TYPE keys filled in — those come from the profile's own
// choice lists and are not guesses — and the leaves empty. A wrong label is worse than a generic
// one: PARAM 3 makes you check the manual, "DEPTH" makes you not check it.
//
// This file's job is to make sure the machinery around that hole is CORRECT WHILE DORMANT. A
// generated script that only appears once the table is filled is a script nobody runs and nobody
// tests, so every test below fills the table itself and drives the result.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EFFECT_PARAMETER_NAMES, anyEffectHasNames, effectHasNames, effectLabelScript,
  effectParameterLabel, genericParameterLabel,
} from '../../../tools/scripts/gaia-panel/effect-parameters.mjs';
import { buildGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';
import { KNOB_GESTURES, effectProbeScript } from '../../../tools/scripts/gaia-panel/effect-probe.mjs';
import { controlNamed, idOf, loadScript, mountPanel, moveChannel } from './support/gaiaScriptHarness.mjs';
import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const filled = {
  distortion: {
    DIST: ['DRIVE', 'TONE', '', 'LEVEL'],
    FUZZ: ['', '', '', ''],
  },
};

const blocks = {
  distortion: {
    captionIds: ['cap1', 'cap2', 'cap3', 'cap4'],
    typeControlId: 'typeCtl',
    labelByValue: { 0: 'OFF', 1: 'DIST', 2: 'FUZZ', 3: 'BIT CRASH' },
  },
};

/* ------------------------------------------------------------------ the table as it ships */

test('the table has every effect type the machine has, and no names', () => {
  // The keys are the assertion. They are the profile's own choice labels, so a type added or
  // renamed in the address map without being reflected here is a hole nobody would notice.
  assert.deepEqual(Object.keys(EFFECT_PARAMETER_NAMES), ['distortion', 'flanger', 'delay', 'reverb']);
  assert.deepEqual(Object.keys(EFFECT_PARAMETER_NAMES.distortion), ['DIST', 'FUZZ', 'BIT CRASH']);
  assert.deepEqual(Object.keys(EFFECT_PARAMETER_NAMES.flanger), ['FLANGER', 'PHASER', 'PITCH SHIFTER']);
  assert.deepEqual(Object.keys(EFFECT_PARAMETER_NAMES.delay), ['DELAY', 'PANNING DELAY']);
  assert.deepEqual(Object.keys(EFFECT_PARAMETER_NAMES.reverb), ['REVERB']);
  assert.equal(anyEffectHasNames(), false, 'a name here would have to have come from somewhere');
});

test('OFF is not a type anything can be named for', () => {
  // An effect that is off has no knobs to name, and inventing labels for a block that is not
  // running is the same defect one level down.
  for (const types of Object.values(EFFECT_PARAMETER_NAMES)) {
    assert.ok(!('OFF' in types));
  }
});

test('the table matches the profile about which types exist', () => {
  // The one thing that can rot: a type renamed in the address map leaves a key here that no wire
  // value ever selects, so its names would silently never appear. Checked against the PROFILE
  // rather than the panel, because the type selectors are custom LED columns and carry their
  // options inside the component rather than in a Value.rows list.
  const profile = JSON.parse(readFileSync(
    path.join(REPO, 'CE/profiles/test/roland-gaia-sh01.ceditor-device.json'), 'utf8'));
  const byId = new Map(profile.parameters.map((p) => [p.id, p]));

  for (const [effect, types] of Object.entries(EFFECT_PARAMETER_NAMES)) {
    const parameter = byId.get(`${effect}.type`);
    assert.ok(parameter, `the profile has no ${effect}.type`);
    const printed = (parameter.choices ?? []).map((c) => String(c.label).toUpperCase());
    for (const type of Object.keys(types)) {
      assert.ok(printed.includes(type), `${effect} has no type "${type}" — the table has gone stale`);
    }
    // And the other direction: a type the machine has that the table forgot would be a hole with
    // no name and no way to notice.
    for (const label of printed) {
      if (label === 'OFF') continue;
      assert.ok(label in types, `${effect} type "${label}" is missing from the names table`);
    }
  }
});

/* ------------------------------------------------------------------ the fallback */

test('an unnamed parameter reads PARAM n', () => {
  assert.equal(effectParameterLabel('distortion', 'DIST', 2), genericParameterLabel(2));
  assert.equal(effectParameterLabel('distortion', 'DIST', 2), 'PARAM 3');
});

test('the fallback is per parameter, not per type', () => {
  // A manual entry that names CONTROL 1 and 2 and says nothing about 3 and 4 should give two real
  // names and two honest generic ones, rather than being refused wholesale for being incomplete.
  assert.equal(effectParameterLabel('distortion', 'DIST', 0, filled), 'DRIVE');
  assert.equal(effectParameterLabel('distortion', 'DIST', 2, filled), 'PARAM 3');
  assert.equal(effectParameterLabel('distortion', 'DIST', 3, filled), 'LEVEL');
});

test('a type nobody has touched is entirely generic', () => {
  assert.equal(effectHasNames('flanger', filled), false);
  assert.equal(effectParameterLabel('flanger', 'PHASER', 0, filled), 'PARAM 1');
});

/* ------------------------------------------------------------------ the generated script */

test('an empty table emits no script at all', () => {
  // The panel must not carry a dead script waiting for a manual. Asserted against the real table,
  // so this starts failing the moment anyone fills it in — at which point the panel gains a script
  // and the tests below are the ones that matter.
  assert.equal(effectLabelScript(blocks), null);
  assert.equal((buildGaiaPanel().scripts ?? []).some((s) => s.id === 'gaia_effect_parameter_labels'), false);
});

/** Run the generated script with fake host verbs and report what it set. */
function runScript(source, initialType) {
  const sets = [];
  let type = initialType;
  let watcher = null;
  const scope = {
    get: (path) => (path === 'typeCtl' ? type : undefined),
    set: (path, value) => sets.push([path, value]),
    watch: (path, fn) => { watcher = { path, fn }; },
  };
  const factory = new Function(...Object.keys(scope), `${source}\nreturn { onPanelLoad };`);
  factory(...Object.values(scope)).onPanelLoad();
  return {
    sets,
    watchPath: watcher?.path,
    select(next) { type = next; sets.length = 0; watcher.fn(); return [...sets]; },
  };
}

test('the script names the captions for the selected type', () => {
  const run = runScript(effectLabelScript(blocks, filled), 1);
  assert.deepEqual(run.sets, [
    ['cap1.text.content', 'DRIVE'],
    ['cap2.text.content', 'TONE'],
    ['cap3.text.content', 'PARAM 3'],
    ['cap4.text.content', 'LEVEL'],
  ]);
});

test('changing the type renames the captions', () => {
  const run = runScript(effectLabelScript(blocks, filled), 1);
  assert.deepEqual(run.select(2).map(([, name]) => name), ['PARAM 1', 'PARAM 2', 'PARAM 3', 'PARAM 4'],
    'FUZZ has no names, so its knobs go back to generic rather than keeping DIST\'s');
});

test('turning the effect off falls back to generic, it does not keep the last type\'s names', () => {
  const run = runScript(effectLabelScript(blocks, filled), 1);
  assert.deepEqual(run.select(0).map(([, name]) => name), ['PARAM 1', 'PARAM 2', 'PARAM 3', 'PARAM 4']);
});

test('the script keys on the wire value, not on the printed label', () => {
  // Matching label text at runtime would mean the script carrying its own copy of the choice list
  // and agreeing with the profile about capitalisation forever.
  const source = effectLabelScript(blocks, filled);
  assert.ok(source.includes('"1"'), 'the table should be keyed by the wire value');
  assert.ok(!source.includes('"DIST"'), 'no label matching should survive into the script');
});

test('the script watches the type control by id, because names here contain dots', () => {
  // Every bound control on this panel is named after its parameter — "distortion.type" — and the
  // script path syntax splits on dots, so a name would resolve to a control called "distortion".
  const run = runScript(effectLabelScript(blocks, filled), 1);
  assert.equal(run.watchPath, 'typeCtl.value');
});

test('the generated script is valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(effectLabelScript(blocks, filled)));
});

/* ------------------------------------------------------------------ the panel while it waits */

test('the effect boxes print the caveat, and the captions are addressable', () => {
  // Two halves of "correct while dormant": the panel says why the knobs are called PARAM n, where
  // someone looking at the knobs will read it — and the captions carry names, so filling the table
  // in is genuinely the only step.
  const panel = buildGaiaPanel();
  const names = new Set(panel.controls.map((c) => c._children?.Core?.name));
  for (const effect of ['distortion', 'flanger', 'delay', 'reverb']) {
    assert.ok(names.has(`${effect}.type`), `${effect} has no type selector`);
    for (let i = 1; i <= 4; i += 1) {
      assert.ok(names.has(`${effect}.parameter${i}.caption`),
        `${effect} parameter ${i} has no addressable caption`);
    }
  }

  const caveats = panel.controls.filter((c) =>
    String(c._children?.Text?.content ?? '').includes('meaning depends on TYPE'));
  assert.equal(caveats.length, 4, 'each effect box should carry the caveat');
});

/* ------------------------------------------------------------------ against the REAL runtime */
//
// The tests above run the script with fake verbs, and that is why it shipped broken: the stub's
// `get` answered from a map keyed by control id, so a script reading a path the real runtime
// resolves to nothing looked exactly like one that works. `${effect}.type` is a CustomComponent —
// no `Value` section at all — and `value` is a shorthand that pointed straight at it.
//
// These drive panelRuntime itself, against the real generated panel.

test('the script relabels the REAL panel when a type is selected', () => {
  const built = buildGaiaPanel();
  const view = mountPanel(built);
  const typeControl = controlNamed(built, 'distortion.type');
  const captionIds = [1, 2, 3, 4].map((i) => idOf(controlNamed(built, `distortion.parameter${i}.caption`)));

  const source = effectLabelScript({
    distortion: { captionIds, typeControlId: idOf(typeControl), labelByValue: { 0: 'OFF', 1: 'DIST', 2: 'FUZZ' } },
  }, filled);
  assert.ok(source, 'a filled table should emit a script');

  const captions = () => captionIds.map((id) =>
    view.controls().find((c) => c._children?.Core?.id === id)?._children?.Text?.content);

  // A panel opens on a saved patch, so the type is already selected before the script loads.
  moveChannel(idOf(typeControl), { value: 1 });
  const run = loadScript(source);
  run.onPanelLoad();
  assert.deepEqual(captions(), ['DRIVE', 'TONE', 'PARAM 3', 'LEVEL'],
    'onPanelLoad must name the knobs for the type already selected');

  moveChannel(idOf(typeControl), { value: 2 });
  run.settle();
  assert.deepEqual(captions(), ['PARAM 1', 'PARAM 2', 'PARAM 3', 'PARAM 4'],
    'FUZZ has no names, so its knobs go generic rather than keeping DIST\'s');

  moveChannel(idOf(typeControl), { value: 1 });
  run.settle();
  assert.deepEqual(captions(), ['DRIVE', 'TONE', 'PARAM 3', 'LEVEL'], 'and back again');
});

test('the type selector is READABLE at all — the read that used to answer undefined', () => {
  // The narrowest statement of the bug, so a regression names itself rather than showing up as
  // captions that are merely wrong.
  const built = buildGaiaPanel();
  mountPanel(built);
  const typeControl = controlNamed(built, 'distortion.type');
  const api = scriptApiForTesting('', 'fx-read');

  assert.notEqual(api.get(idOf(typeControl)), undefined,
    'get(id) on an LED column must not be undefined — every caption depends on it');
  moveChannel(idOf(typeControl), { value: 3 });
  assert.equal(api.get(idOf(typeControl)), 3);
  assert.equal(api.get(`${idOf(typeControl)}.value`), 3, 'and by the explicit spelling too');
});

/* ------------------------------------------------------------------ the probe */
//
// The other half of the missing table. The MIDI implementation gives 32 slots per effect block, all
// called "MFX Parameter n"; which SLOT each knob drives is a fact about the hardware, and asking the
// hardware is more trustworthy than a transcription. What the manual is still needed for is the
// NAMES — the probe narrows the question, it does not answer it.

test('the probe ships DISABLED, because it is a diagnostic and not a feature', () => {
  const panel = buildGaiaPanel();
  const probe = (panel.scripts ?? []).find((s) => s.id === 'gaia_effect_probe');
  assert.ok(probe, 'the panel should carry the probe');
  assert.equal(probe.enabled, false, 'a panel must not run three console actions on every load');
  assert.equal(probe.event, 'onPanelLoad');
});

test('the probe knows the GAIA reaches four parameters with two knobs', () => {
  // The thing a procedure written from the address map alone gets wrong. There is no CONTROL 2
  // knob: it is SHIFT held down on CONTROL 1. Telling someone to "turn CONTROL 2" sends them
  // looking for a control the instrument does not have.
  assert.deepEqual(KNOB_GESTURES.map((g) => g.label), ['CONTROL 1', 'CONTROL 2', 'CONTROL 3', 'LEVEL']);
  assert.match(KNOB_GESTURES[1].how, /SHIFT.*CONTROL 1/);
  assert.match(KNOB_GESTURES[2].how, /SHIFT.*LEVEL/);
  assert.equal(KNOB_GESTURES[0].how, 'turn the CONTROL 1 knob');
  assert.equal(KNOB_GESTURES[3].how, 'turn the LEVEL knob');
});

test('the probe reads the WHOLE block, not just the four the panel shows', () => {
  // The assumption it exists to test. layout.mjs displays MFX Parameter 1..4 on the belief that
  // those are the four the knobs drive, and nothing establishes that. A probe that only looked at
  // the first four could not tell "this knob drives slot 17" from "this knob does nothing".
  const source = effectProbeScript({
    distortion: { requestId: 'requestDistortion', parameterPrefix: 'distortion.parameter', slots: 32 },
  });
  assert.match(source, /"slots": 32/);
  assert.match(source, /OUTSIDE the four the panel shows/,
    'and it has to SAY so when a knob lands outside them');
});

test('the probe addresses the profile\'s real request and parameter ids', () => {
  const profile = JSON.parse(readFileSync(
    path.join(REPO, 'CE/profiles/test/roland-gaia-sh01.ceditor-device.json'), 'utf8'));
  const requests = new Set(profile.requests.map((r) => r.id));
  const parameters = new Set(profile.parameters.map((p) => p.id));

  const panel = buildGaiaPanel();
  const source = (panel.scripts ?? []).find((s) => s.id === 'gaia_effect_probe').source;
  const table = JSON.parse(source.match(/var BLOCKS = (\{[\s\S]*?\n\});/)[1]);

  for (const [effect, block] of Object.entries(table)) {
    assert.ok(requests.has(block.request), `${effect}: no request called ${block.request}`);
    assert.ok(block.slots > 0, `${effect}: no slot count`);
    for (let slot = 1; slot <= block.slots; slot += 1) {
      assert.ok(parameters.has(`${block.prefix}${slot}`),
        `${effect}: the profile has no ${block.prefix}${slot}`);
    }
  }
  assert.deepEqual(Object.keys(table), ['distortion', 'flanger', 'delay', 'reverb']);
  // Counted from the profile, not assumed: distortion is 32 slots and the other three are 20. A
  // hardcoded 32 would have the probe reading twelve addresses the flanger does not have.
  assert.deepEqual(Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.slots])),
    { distortion: 32, flanger: 20, delay: 20, reverb: 20 });
});

test('the generated probe is valid JavaScript', () => {
  const panel = buildGaiaPanel();
  const source = (panel.scripts ?? []).find((s) => s.id === 'gaia_effect_probe').source;
  assert.doesNotThrow(() => new Function(source));
});
