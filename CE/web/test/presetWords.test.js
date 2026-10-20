// presetWords.test.js — a preset slot and a program number on the synth a script talks to: which
// patch each reaches, said in its row, and what recallPreset says of a slot it recalls nothing for,
// in the editor and the plug-in alike.
//
// Both were numbers with nothing beside them: slot 12 on a GAIA did not say it was the 13th User
// Patch, and program 12 did not say that a synth counting from 1 calls it 13. recallPreset for a
// role with no profile answered { ok: false } without a word in both runtimes, and the plug-in said
// nothing of any failure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get } from 'svelte/store';

import { scriptApiForTesting, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { deviceRoleMappings } from '../src/CE_Application/stores/deviceProfiles.js';
import { profileSources } from '../src/CE_Application/stores/deviceProfileStores.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { meaningLine } from '../src/CE_Application/editor/valueRows.js';
import { deviceValueContext } from '../src/CE_Application/editor/valuesContext.js';
import { readPresetSlot, programWords, bankWords, recallNoProfileWords } from '../src/CE_Application/scripting/presetWords.js';

const here = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(here, '..', '..', 'profiles', 'test');
const profile = (file) => JSON.parse(readFileSync(join(PROFILE_DIR, file), 'utf8'));
const GAIA = profile('roland-gaia-sh01.ceditor-device.json');
const AN1X = profile('yamaha-an1x-dpd.ceditor-device.json');

/** A panel whose main synth is `synth` (or none), and the lines `fn` makes the runtime say. */
function withSynth(synth, fn) {
  resetScriptStateForTesting();
  panels.set([{ id: 'p', name: 'P', controls: [], scripting: { modules: ['ce.core', 'ce.device', 'ce.midi'] } }]);
  activePanelId.set('p');
  profileSources.set(synth ? { [synth.id]: { profileId: synth.id, source: JSON.stringify(synth) } } : {});
  deviceRoleMappings.set(synth ? { mainSynth: { role: 'mainSynth', profileId: synth.id, variables: {}, timingOverrides: {} } } : {});
  clearScriptTrace();
  try {
    const result = fn(scriptApiForTesting('', 'preset-script'));
    return { result, lines: get(scriptTrace).filter((t) => t.kind === 'error' || t.kind === 'warn').map((t) => t.message) };
  } finally {
    panels.set([]); profileSources.set({}); deviceRoleMappings.set({});
  }
}

/** The Values context for a main synth `synth` (or none), as the script editor builds it. */
const devicesFor = (synth, library = {}) => deviceValueContext({
  mappings: synth ? { mainSynth: { profileId: synth.id } } : {},
  profiles: synth ? [{ id: synth.id, name: synth.name }] : [],
  sources: synth ? { [synth.id]: { source: JSON.stringify(synth) } } : {},
  library,
});
const rowOf = (src, name, devices) => readStatement(src, 'lua', src.indexOf('(') + 1, { panel: { controls: [] }, devices })
  .calls[0].args.find((a) => a.name === name);

test.after(() => resetScriptStateForTesting());

test('a slot says its bank and place in it, and its name when the profile or the library has one', () => {
  const gaia = { presets: GAIA.presets };
  const twelve = readPresetSlot(12, { profile: gaia });
  assert.deepEqual([twelve.meaning.hint, twelve.problem], ['User Patch 13 of 64', null]);
  assert.equal(readPresetSlot(140, { profile: gaia }).meaning.hint, 'Preset Patch 13 of 64');
  assert.equal(readPresetSlot(0, { profile: { presets: AN1X.presets } }).meaning.hint, 'Preset 1 of 128, "Relaxx"');
  assert.equal(readPresetSlot(3, { profile: gaia, library: { 3: 'My Pad' } }).meaning.hint, 'User Patch 4 of 64, "My Pad" in your library');
  assert.equal(readPresetSlot('12', { profile: gaia }).meaning.hint, 'User Patch 13 of 64', 'text that is a number is one, as the runtime reads it');
  // The dropdown: every slot the banks hold, each by where it is.
  const { choices, choiceNames } = readPresetSlot(12, { profile: gaia }).meaning;
  assert.equal(choices.length, 200);
  assert.deepEqual([choices[0], choiceNames['0'], choiceNames['199']], ['0', 'User Patch 1 of 64', 'Preset PCM Patch 8 of 8']);
});

test('a slot recalling nothing is refused in the runtime\'s words, and the banks are listed', () => {
  const gaia = { presets: GAIA.presets };
  const off = readPresetSlot(300, { profile: gaia });
  assert.deepEqual(off.problem, { severity: 'error', message: 'recallPreset(300): Slot 300 is not inside any preset bank.' });
  assert.equal(off.meaning.hint, 'the banks are User Patch 0–63, USB Memory Patch 64–127, Preset Patch 128–191, Preset PCM Patch 192–199');
  assert.equal(readPresetSlot(-1, { profile: gaia }).problem.message, 'recallPreset(slot): slot must be an integer >= 0.');
  assert.equal(readPresetSlot(5, { profile: { presets: false } }).problem.message, 'recallPreset(5): Profile has no preset model (presets block).');
  assert.equal(readPresetSlot(5, { profile: { presets: null } }).problem, null, 'the document is still loading: nothing claimed');
  assert.deepEqual(readPresetSlot(5, { profile: null }).problem, { severity: 'error', message: recallNoProfileWords(5, 'mainSynth') });
  assert.equal(readPresetSlot(5, { profile: null, known: false }).problem, null, 'with no devices known, nothing is claimed');
});

test('a program number says how a synth counting from 1 shows it, and the slot its bank reaches', () => {
  const presets = GAIA.presets;
  assert.equal(programWords(12, { presets }), 'program 12, which a synth that counts from 1 shows as 13',
    'the GAIA selects every bank with bank select, so a program alone is not one slot');
  assert.equal(programWords(12, { msb: 87, lsb: 0, presets }), 'program 12, which a synth that counts from 1 shows as 13 · slot 12, User Patch 13 of 64');
  assert.equal(programWords(12, { msb: 87, lsb: 64, presets }), 'program 12, which a synth that counts from 1 shows as 13 · slot 140, Preset Patch 13 of 64');
  assert.equal(programWords(0, { presets: AN1X.presets }), 'program 0, which a synth that counts from 1 shows as 1 · slot 0, Preset 1 of 128, "Relaxx"');
  assert.equal(programWords(200, { presets }), null);
  assert.equal(bankWords(87, 32, presets), 'bank 87/32 is USB Memory Patch');
  assert.equal(bankWords(1, 1, presets), null);
  // A bank select byte left out is not sent, so the synth keeps the one it had: a bank told apart by
  // it is not named, by the bank's row or the program's.
  const kept = 'bankLsb is not sent, so the synth keeps the one it last had, and which bank this selects is not known here';
  assert.equal(bankWords(87, undefined, presets), kept);
  assert.equal(bankWords(87, null, presets), kept);
  assert.equal(bankWords(undefined, 64, presets), kept.replace('bankLsb', 'bankMsb'));
  assert.equal(programWords(12, { msb: 87, presets }), 'program 12, which a synth that counts from 1 shows as 13');
  // A bank the profile selects by its MSB alone is reached by the MSB alone.
  const byMsb = { banks: [{ id: 'a', label: 'Bank A', bankMsb: 1, programBase: 0, slotCount: 128, startSlot: 0 }] };
  assert.equal(bankWords(1, undefined, byMsb), 'bank 1 is Bank A');
  assert.match(programWords(5, { msb: 1, presets: byMsb }), / · slot 5, /);
});

test('recallPreset says it recalled nothing for a role with no profile, and recalls a slot that is one', () => {
  assert.deepEqual(withSynth(null, (api) => api.ce.device.recallPreset(12)).lines, [recallNoProfileWords(12, 'mainSynth')]);
  const recalled = withSynth(GAIA, (api) => api.ce.device.recallPreset(12));
  assert.deepEqual([recalled.result.ok, recalled.lines], [true, []]);
  assert.deepEqual(withSynth(GAIA, (api) => api.ce.device.recallPreset(300)).lines, ['recallPreset(300): Slot 300 is not inside any preset bank.']);
});

test('the rows say which patch a slot, a program and a bank reach, and refuse in the runtime\'s words', () => {
  const devices = devicesFor(GAIA);
  const slot = rowOf('ce.device.recallPreset(12)', 'slot', devices);
  assert.deepEqual([slot.kind, slot.editable, meaningLine(slot)], ['presetSlot', 'choice', 'User Patch 13 of 64']);
  const said = withSynth(GAIA, (api) => api.ce.device.recallPreset(300)).lines[0];
  assert.deepEqual(rowOf('ce.device.recallPreset(300)', 'slot', devices).problem, { severity: 'error', message: said });
  const none = withSynth(null, (api) => api.ce.device.recallPreset(12)).lines[0];
  assert.deepEqual(rowOf('ce.device.recallPreset(12)', 'slot', devicesFor(null)).problem, { severity: 'error', message: none });
  assert.equal(meaningLine(rowOf('ce.device.recallPreset(3)', 'slot', devicesFor(GAIA, { [GAIA.id]: { banks: [{ entries: [{ slot: 3, name: 'My Pad' }] }] } }))),
    'User Patch 4 of 64, "My Pad" in your library');

  assert.equal(meaningLine(rowOf('ce.midi.sendProgramChange(1, 12, 87, 0)', 'program', devices)),
    'program 12, which a synth that counts from 1 shows as 13 · slot 12, User Patch 13 of 64');
  assert.equal(meaningLine(rowOf('ce.midi.sendProgramChange(1, 12, 87, 0)', 'bankMsb', devices)), 'bank 87/0 is User Patch');
  // The channel is neither a program nor a bank, and says only its range.
  assert.equal(meaningLine(rowOf('ce.midi.sendProgramChange(1, 12, 87, 0)', 'channel', devices)), '1 to 16');
  assert.equal(meaningLine(rowOf('ce.midi.sendProgramChange(1, 12)', 'program', devicesFor(null))),
    'program 12, which a synth that counts from 1 shows as 13', 'with no profile, the count from 1 is still said');
  // A bank select past 127 is refused as the runtime refuses it, with no bank claimed.
  assert.equal(rowOf('ce.midi.sendProgramChange(1, 12, 200, 0)', 'bankMsb', devices).problem?.severity, 'error');
});

test('the plug-in says what recallPreset recalled nothing for, in the editor\'s words', () => {
  const plugin = readFileSync(fileURLToPath(new URL('../../src/Player/PluginProcessor.h', import.meta.url)), 'utf8');
  assert.ok(plugin.includes('"[script] recallPreset(slot): slot must be an integer >= 0."'), 'a slot that is not one');
  const [lead, tail] = recallNoProfileWords(12, '\u0001').split('\u0001');
  assert.ok(plugin.includes(`"): ${lead.slice('recallPreset(12): '.length)}"`), 'no profile is chosen for the role');
  assert.ok(plugin.includes(`+ "${tail}");`), '…so nothing was recalled');
  assert.ok(plugin.includes('answered->getProperty ("error").toString()'), "else the engine's own reason, which the editor's engine words alike");
});
