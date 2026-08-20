import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readText = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const LIBRARY = JSON.parse(readText('../../dpd/library/yamaha.an1x.json'));
const EMITTED = JSON.parse(readText('../../profiles/test/yamaha-an1x-dpd.ceditor-device.json'));

/**
 * The AN1x Current Voice Scene block, transcribed from the factory Data List
 * ("MIDI Parameter Change Table ( Current Voice Scene Buffer )", MIDI Data Table <1-4>).
 *
 * This is the half of the scene block that was wrong, and it was wrong for one reason: FilterEG
 * Depth at 35h is a TWO-byte parameter (00...FF, -128..+127). The profile declared it one byte, so
 * every parameter after it addressed one byte low — the whole amp envelope, filter keyboard track
 * and filter mod depth wrote into their neighbour. The panel looked wired and moved the wrong knob
 * on the synth, which is the failure mode that reads as "nothing works".
 *
 * Transcribed, not derived: these are the manual's numbers, so a future edit that slides the block
 * again has something to disagree with.
 */
const SCENE_ADDRESSES = [
  [0x33, 1, 'VCF Filter Cutoff'],
  [0x34, 1, 'VCF Filter Resonance'],
  [0x35, 2, 'Filter EG Depth'],       // 00...FF, -128...+127 — the two bytes everything hinged on
  [0x37, 1, 'Filter EG Velocity Sens'],
  [0x38, 1, 'VCF Keyboard Track'],
  [0x39, 1, 'VCF Filter Mod Depth'],
  [0x3a, 1, 'Amp EG Attack Time'],
  [0x3b, 1, 'Amp EG Decay Time'],
  [0x3c, 1, 'Amp EG Sustain Level'],
  [0x3d, 1, 'Amp EG Release Time'],
  [0x3e, 1, 'VCA Feedback Level'],
  [0x3f, 1, 'VCA Volume'],
  [0x40, 1, 'Amp EG Velocity Sens'],
  [0x41, 1, 'VCA Amp Mod Depth'],
  [0x42, 1, 'Variation Dry:Wet'],
  // 43h is the block's Reserve byte; 44h re-anchors on Ctrl Matrix Source 1.
  [0x44, 1, 'Ctrl Matrix Source 1'],
];

const sceneParameters = LIBRARY.scopes.scene.parameters;
const lowByte = (address) => parseInt(String(address).split(' ').at(-1), 16);

test('the scene block addresses what the AN1x Data List says it addresses', () => {
  for (const [low, size, name] of SCENE_ADDRESSES) {
    const matches = sceneParameters.filter((p) => lowByte(p.address) === low);
    assert.equal(matches.length, 1,
      `${matches.length} parameters claim scene address ${low.toString(16)}h, expected exactly one (${name})`);
    const [parameter] = matches;
    assert.ok(parameter.name.startsWith(name),
      `scene ${low.toString(16)}h is "${parameter.name}", the Data List says "${name}"`);
    assert.equal(parameter.size ?? 1, size,
      `scene ${low.toString(16)}h (${name}) is ${size} byte(s) in the Data List`);
  }
});

test('a two-byte scene parameter is encoded MSB then LSB', () => {
  // The Data List spells the pairs "Param N MSB" / "Param N LSB", in that order on the wire.
  const depth = sceneParameters.find((p) => p.id === 'scFegDepth');
  assert.equal(depth.size, 2);
  assert.equal(depth.encoding.type, 'u14');
  assert.deepEqual(depth.range, { min: 0, max: 255 }, 'FilterEG Depth is 00...FF, not a full 14-bit range');
  const emitted = EMITTED.parameters.find((p) => p.id === 'scFegDepth');
  assert.equal(emitted.encoding.type, 'u14-msb-lsb');
});

test('the scene dump layout reads the same bytes the parameters write', () => {
  // A dump offset IS the address low byte for this device — the scene bulk dump is the 116-byte
  // (74h) block starting at 10 10 00. When the two disagree, the panel sends to one byte and fills
  // in from another, and only one of the two directions looks broken.
  for (const dump of LIBRARY.dumps) {
    if (!dump.layout?.length) continue;
    if (!dump.spans?.includes('scene')) continue;
    assert.equal(dump.message.payload.size, 116, `${dump.id}: the scene block is 74h bytes`);
    for (const entry of dump.layout) {
      const id = entry.param.split('.').at(-1);
      const parameter = sceneParameters.find((p) => p.id === id);
      assert.ok(parameter, `${dump.id}: layout names ${id}, which the scene scope does not define`);
      assert.equal(entry.offset, lowByte(parameter.address),
        `${dump.id}: ${id} is read at offset ${entry.offset} and written to ${parameter.address}`);
    }
  }
});

/**
 * Ranges the Data List states as something other than 0..127. Each of these was 0..127 in the
 * profile, which is not merely imprecise: it lets the panel send a value the synth rejects, and it
 * puts the centre detent in the wrong place on every knob bound to one.
 */
const STATED_RANGES = [
  ['scene', 'scVcfResonance', 13, 127],   // 0D...7F, -12...+102
  ['scene', 'scVcfKbdTrack', 32, 127],    // 20...7F, -32...+63
  ['scene', 'scVco2PitchFine', 14, 114],  // 0E...72, -50...+50 cent
  ['scene', 'scVco1PitchModDepth', 1, 255],
  ['scene', 'scVco2PitchModDepth', 1, 255],
  ['scene', 'scVco1PwmDepth', 1, 127],
  ['scene', 'scVco2Wave', 0, 3],          // VCO1 also has a 0..4 list, but only when Osc Sync is on
  ['common', 'vcTempo', 39, 240],         // 27h = follow MIDI clock, 28h...F0h = 40...240 BPM
];

test('ranges match the Data List, including the ones that do not start at zero', () => {
  for (const [scope, id, min, max] of STATED_RANGES) {
    const parameter = LIBRARY.scopes[scope].parameters.find((p) => p.id === id);
    assert.ok(parameter, `${scope}.${id} is missing from the profile`);
    assert.deepEqual(parameter.range, { min, max }, `${scope}.${id}`);
  }
});

/**
 * The AN1x selects voices with Program Change and nothing else.
 *
 * Its MIDI Implementation Chart marks Bank Select (CC 0 / CC 32) neither transmitted NOR
 * recognized, and "Bank" appears nowhere else in the Data List. So the profile's recall is `pc`,
 * a preset selector on an AN1x panel must not offer bank keys, and the 128 User voices — reachable
 * only by bulk dump — are deliberately not a bank, because a bank implies a Program Change that
 * would reach them and there isn't one.
 */
test('a voice is recalled by Program Change alone', () => {
  const { presets } = LIBRARY;
  assert.equal(presets.recall.kind, 'pc', 'the AN1x does not respond to Bank Select');
  assert.equal(presets.banks.length, 1);

  const [bank] = presets.banks;
  assert.equal(bank.role, 'factory');
  assert.equal(bank.writable, false);
  assert.equal(bank.slotCount, 128);
  assert.equal(bank.names.length, 128, 'the Factory-set Voice List is 128 voices');
  assert.equal(bank.names[0], 'Relaxx');
  assert.equal(bank.names[3], 'MajorBrass');
  assert.equal(bank.names[127], 'VirtlScene');
  assert.ok(bank.names.every((name) => name.length <= 10),
    'a voice name is the ten characters at common 00h..09h');
});

test('the voice name is addressable, ten characters at the top of the common block', () => {
  // Common 00h..09h, ASCII 20h...7Fh. Without these the profile can write a patch but cannot say
  // — or read — what it is called, which is the one field a preset browser needs.
  const common = LIBRARY.scopes.common.parameters;
  for (let index = 0; index < 10; index += 1) {
    const parameter = common.find((p) => p.id === `vcNameChar${index + 1}`);
    assert.ok(parameter, `voice name character ${index + 1} is missing`);
    assert.equal(lowByte(parameter.address), index);
    assert.deepEqual(parameter.range, { min: 32, max: 127 });
  }
});
