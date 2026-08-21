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

test('the voice name is one text field, not ten knobs', () => {
  // Common 00h..09h, ASCII 20h...7Fh. It IS ten bytes, but it is ONE value: the parameter change
  // carries all ten data bytes at 10 00 00 and the dump reads them with the same text-ascii codec.
  // Modelled as ten one-byte parameters it gave the panel ten knobs where a name field belongs and
  // gave the librarian nothing to read — the bytes were addressable and the name was not.
  const name = LIBRARY.scopes.common.parameters.find((p) => p.id === 'vcName');
  assert.ok(name, 'the common block has no name parameter');
  assert.equal(lowByte(name.address), 0);
  assert.equal(name.valueType, 'text');
  assert.equal(name.size, 10);
  assert.deepEqual(name.encoding, { type: 'text-ascii', length: 10, pad: 32 });
  assert.equal(name.default, 'InitNormal');
  assert.equal(LIBRARY.scopes.common.parameters.filter((p) => /^vcNameChar/.test(p.id)).length, 0,
    'the per-character parameters should be gone, not shadowed');

  // …and it survives the emitter, with the length and pad the engine's text encoder reads.
  const emitted = EMITTED.parameters.find((p) => p.id === 'vcName');
  assert.equal(emitted.type, 'text');
  assert.equal(emitted.display.mode, 'text');
  assert.equal(emitted.encoding.length, 10);
  assert.equal(emitted.encoding.pad, 32);
  assert.equal(emitted.normalization, undefined, 'a string has no 0..1 position');
  assert.equal(emitted.messageRecipe, 'dt1');

  // Both dumps that contain a Voice Common block read it as one field at offset 0.
  for (const id of ['voiceCommon', 'userVoice']) {
    const dump = LIBRARY.dumps.find((d) => d.id === id);
    const entries = dump.layout.filter((e) => e.param.endsWith('.vcName'));
    assert.equal(entries.length, 1, `${id} should map the name once`);
    assert.equal(entries[0].offset, 0);
  }
});

test('a voice name round-trips through the dump as a string', async () => {
  const { resolveProfile } = await import('../../dpd/tools/dpd.mjs');
  const { assembleDump, parseDump } = await import('../../dpd/dumps.mjs');
  const resolved = resolveProfile('yamaha.an1x');

  for (const id of ['voiceCommon', 'userVoice']) {
    const dump = LIBRARY.dumps.find((d) => d.id === id);
    const bytes = assembleDump(dump, { 'common.vcName': 'BassMonstr' }, resolved);
    assert.equal(bytes.slice(9, 19).map((b) => String.fromCharCode(b)).join(''), 'BassMonstr',
      `${id}: the name should be ten ASCII bytes at the top of the payload`);
    assert.equal(parseDump(dump, bytes, resolved).valuesById['common.vcName'], 'BassMonstr', id);
  }

  // Shorter than ten pads with spaces and comes back trimmed, which is what a librarian shows.
  const dump = LIBRARY.dumps.find((d) => d.id === 'voiceCommon');
  const short = assembleDump(dump, { 'common.vcName': 'Soar' }, resolved);
  assert.deepEqual(short.slice(9, 19), [83, 111, 97, 114, 32, 32, 32, 32, 32, 32]);
  assert.equal(parseDump(dump, short, resolved).valuesById['common.vcName'], 'Soar');
});

/**
 * The MODE2 Control Change map, transcribed from the Data List p12.
 *
 * Two lists live on that page: "* TRANSMITTED CONTROL NUMBERS" / "* RECEIVED CONTROL NUMBER" for
 * normal mode, and below them "In addition, the following CONTROL NUMBERs will be
 * transmitted/received when Control Change Mode 2 is selected".
 *
 * The profile had every number from 50 upward shifted down — by 9, then 10, then 11 — which put
 * Brightness on CC 64 (the sustain pedal) and Amp EG Decay on CC 65 (the portamento switch). A knob
 * drag on either latched notes on the instrument. Nothing about the parameter list looked wrong:
 * all 75 names were right, and the numbers were dense and plausible.
 */
const CONTROL_NUMBERS = {
  1: 'Modulation', 3: 'Scene Select', 4: 'Foot Controller', 5: 'Portamento Time',
  7: 'Main Volume', 8: 'Layer Mode', 9: 'Poly/Mono Mode', 10: 'Panpot', 11: 'Expression',
  12: 'Ribbon Z Controller', 13: 'Ribbon X Controller', 14: 'LFO Reset Mode', 15: 'LFO1 Wave',
  16: 'LFO1 Speed', 17: 'LFO2 Speed', 18: 'VCO1 Pitch Mod Depth', 19: 'VCF Filter Mod Depth',
  20: 'LFO1 Delay', 21: 'VCO1 Pitch Coarse Tune', 22: 'VCO Sync Pitch', 23: 'VCO Sync Pitch Depth',
  24: 'VCO Sync Pitch Source', 25: 'PEG Depth', 26: 'PEG Switch', 27: 'PEG Decay',
  28: 'PEG Sustain Level', 29: 'Filter EG Release', 30: 'VCF Cutoff Keyboard Track',
  31: 'Amp EG Sustain Level', 33: 'VCO Algorithm', 34: 'VCO Sync Pitch Mod Switch', 35: 'FM Depth',
  36: 'FM Source1', 37: 'FM Source2', 39: 'Mixer Noise Level',
  50: 'VCO1 Wave Type', 51: 'VCO2 Wave Type', 52: 'VCO2 Pitch Coarse Tune',
  53: 'VCO2 Pitch Fine Tune', 54: 'VCO2 Edge', 55: 'VCO2 Pulse Width', 56: 'VCO2 PWM Depth',
  57: 'VCO2 Pitch Mod Depth', 58: 'VCF HPF Cutoff', 59: 'VCF Filter Type',
  60: 'Filter EG Velocity Sens', 61: 'Amp EG Velocity Sens', 62: 'VCA Volume',
  63: 'VCA Feedback Level', 64: 'Sustain Switch', 65: 'Portamento Switch',
  68: 'Mixer VCO1 Level', 69: 'Mixer VCO2 Level', 70: 'Ring Modulator Level',
  71: 'Harmonic Content (VCF Resonance)', 72: 'Release Time (Amp EG Release)',
  73: 'Attack Time (Amp EG Attack)', 74: 'Brightness (VCF Cutoff)', 75: 'Decay Time (Amp EG Decay)',
  76: 'VCO1 Edge', 77: 'VCO1 Pitch Fine Tune', 78: 'VCO1 Pulse Width', 79: 'VCO1 PWM Depth',
  80: 'VCA Amp Mod Depth', 81: 'Filter EG Depth', 82: 'Filter EG Attack', 83: 'Filter EG Decay',
  85: 'Portamento Mode', 86: 'VCO1 PWM Source', 87: 'VCO2 PWM Source',
  90: 'Arpeggio/Step Seq Switch', 91: 'Reverb Depth', 93: 'Chorus (Variation) Depth',
  94: 'Delay Depth',
};

const ccParameters = LIBRARY.scopes.mode2cc.parameters;

test('every Control Change carries the number the Data List gives it', () => {
  const byNumber = new Map();
  for (const parameter of ccParameters) {
    const numbers = new Set(parameter.wires.map((w) => w.cc));
    assert.equal(numbers.size, 1, `${parameter.id} spreads across CCs ${[...numbers].join(', ')}`);
    const [number] = numbers;
    assert.ok(!byNumber.has(number),
      `CC ${number} is claimed by both ${byNumber.get(number)} and ${parameter.name}`);
    byNumber.set(number, parameter.name);
    assert.equal(parameter.name, CONTROL_NUMBERS[number],
      `CC ${number} is "${parameter.name}" in the profile and "${CONTROL_NUMBERS[number]}" in the Data List`);
    assert.ok(parameter.id.startsWith(`cc${number}-`),
      `${parameter.id} encodes a CC number its wires do not use`);
  }
  assert.deepEqual([...byNumber.keys()].sort((a, b) => a - b),
    Object.keys(CONTROL_NUMBERS).map(Number).sort((a, b) => a - b));
});

test('the two pedal CCs belong to the pedals', () => {
  // The specific collision that made this audible: CC 64 latches notes on and never releases them,
  // so a Brightness drag past halfway left the AN1x sustaining until something cleared it.
  for (const [number, expected] of [[64, 'Sustain Switch'], [65, 'Portamento Switch']]) {
    const owners = ccParameters.filter((p) => p.wires.some((w) => w.cc === number));
    assert.equal(owners.length, 1, `CC ${number} has ${owners.length} owners`);
    assert.equal(owners[0].name, expected);
    assert.equal(owners[0].valueType, 'enum', `CC ${number} is a switch, not a dial`);
    assert.deepEqual(owners[0].enum.map((e) => e.wire), [0, 127],
      'p12: v = 0-63:OFF, 64-127:ON');
  }
});

test('a CC the AN1x never sends is not decoded inbound', () => {
  // p19's chart marks 5, 10, 11, 65 and 91, 93, 94 as x (transmitted) / o (recognized): the
  // instrument accepts them but never originates them, so an rxLive wire there can never fire.
  const receiveOnly = new Set([5, 10, 11, 65, 91, 93, 94]);
  for (const parameter of ccParameters) {
    const number = parameter.wires[0].cc;
    const live = parameter.wires.some((w) => w.dir === 'rxLive');
    assert.equal(live, !receiveOnly.has(number),
      `CC ${number} (${parameter.name}) ${live ? 'has' : 'lacks'} an rxLive wire`);
  }
});

test('the bulk-dump checksum is the one the Data List defines', async () => {
  // p13 (3-5-4): "The Check sum is the value that results in a value of 0 for the lower 7 bits when
  // the Byte Count, Start Address, Data and Check sum itself are added." Asserted as that property
  // rather than by algorithm name, because assemble and parse share whichever function is named —
  // dumpRoundTrip agreed with itself the whole time the algorithm was the wrong one.
  const { resolveProfile } = await import('../../dpd/tools/dpd.mjs');
  const { assembleDump } = await import('../../dpd/dumps.mjs');
  const resolved = resolveProfile('yamaha.an1x');

  for (const dump of LIBRARY.dumps) {
    if (!dump.layout?.length) continue;
    assert.equal(dump.message.checksum.type, 'roland-7bit', `${dump.id}`);
    const bytes = assembleDump(dump, {}, resolved);
    const { fromOffset, byteOffset } = dump.message.checksum;
    const span = bytes.slice(fromOffset, byteOffset + 1);   // byte count .. data .. checksum itself
    assert.equal(span.reduce((sum, b) => sum + b, 0) % 128, 0,
      `${dump.id}: byte count + address + data + checksum must be 0 in the low 7 bits`);
    assert.equal(bytes[0], 0xf0);
    assert.equal(bytes.at(-1), 0xf7);
  }
});

/**
 * The Data List gives a default for every parameter. The profile carried none, and the emitter
 * filled the hole with range.min — which for a bipolar parameter is the extreme, not the centre.
 * An init/reset built from those fallbacks wrote -100 cent master tune, -12 dB into all three EQ
 * bands and a shut filter.
 */
const STATED_DEFAULTS = [
  ['system', 'sysMasterTune', 512],        // 200h = +0 cent
  ['system', 'sysKbdVelocityCurve', 'wide'],
  ['system', 'sysMidiLocal', 'on'],
  ['common', 'vcTempo', 120],              // 78h
  ['common', 'arpSceneSwitch', 'both'],    // 03h — unreachable while this was a 0..2 slider
  ['common', 'eqLowGain', 64],             // 40h = +0 dB, not the -12 dB the fallback produced
  ['common', 'eqMidGain', 64],
  ['common', 'eqHighGain', 64],
  ['scene', 'scVcfCutoff', 127],           // 7Fh
  ['scene', 'scVcfResonance', 25],         // 19h = +0
  ['scene', 'scFegDepth', 148],            // 94h = +20
  ['scene', 'scPegSwitch', 'both'],        // 03h
];

test('defaults are the values the Data List prints, not the bottom of the range', () => {
  for (const [scope, id, expected] of STATED_DEFAULTS) {
    const parameter = LIBRARY.scopes[scope].parameters.find((p) => p.id === id);
    assert.ok(parameter, `${scope}.${id} is missing`);
    assert.equal(parameter.default, expected, `${scope}.${id}`);
  }
  const emitted = EMITTED.parameters.find((p) => p.id === 'sysMasterTune');
  assert.equal(emitted.default, 512, 'the emitter must prefer the profile default over range.min');
});

test('every default a parameter declares is a value that parameter can hold', () => {
  for (const [scopeName, scope] of Object.entries(LIBRARY.scopes)) {
    for (const parameter of scope.parameters) {
      if (parameter.default === undefined) continue;
      const where = `${scopeName}.${parameter.id}`;
      if (parameter.enum) {
        assert.ok(parameter.enum.some((e) => e.id === parameter.default),
          `${where}: default "${parameter.default}" is not one of its members`);
      } else if (parameter.valueType === 'text') {
        assert.equal(typeof parameter.default, 'string', `${where}: a text default is a string`);
        assert.ok(parameter.default.length <= parameter.encoding.length,
          `${where}: default "${parameter.default}" is longer than the field`);
      } else {
        assert.ok(parameter.default >= parameter.range.min && parameter.default <= parameter.range.max,
          `${where}: default ${parameter.default} is outside ${parameter.range.min}..${parameter.range.max}`);
      }
    }
  }
});

/**
 * Enums whose wire codes do not start at zero. The AN1x has several, and a member list numbered
 * from 0 sends an undocumented byte for every position while making the factory default
 * unreachable — a defect that survives every count-based check.
 */
test('enum members carry the Data List\'s own codes, including the ones that start at 1', () => {
  const cases = [
    ['scene', 'scPegSwitch', [1, 2, 3]],              // VCO1(1), VCO2(2), both(3)
    ['scene', 'scSyncPitchModSwitch', [1, 2, 3]],     // master(1), slave(2), both(3)
    ['common', 'arpSceneSwitch', [1, 2, 3]],          // Scene1(1), Scene2(2), both(3)
    ['common', 'vcSceneSelect', [1, 2, 3]],           // Scene1(1), Scene2(2), Scene Ctrl(3)
  ];
  for (const [scope, id, wires] of cases) {
    const parameter = LIBRARY.scopes[scope].parameters.find((p) => p.id === id);
    assert.equal(parameter.valueType, 'enum', `${scope}.${id}`);
    assert.deepEqual(parameter.enum.map((e) => e.wire), wires, `${scope}.${id}`);
  }
  // 7Fh means "off" for the four channel settings — it is not the 128th channel.
  const channels = LIBRARY.scopes.system.parameters.find((p) => p.id === 'sysRxChannel1');
  assert.equal(channels.enum.length, 17);
  assert.deepEqual(channels.enum.at(-1), { id: 'off', label: 'Off', wire: 127 });
});

test('the effect type lists are as long as the Effect Type List says', () => {
  // p6. The parameter table gives all three the same 00...0D range, which is right for exactly one
  // of them; the remaining bytes select nothing on the hardware.
  const lengths = { vcVariType: 14, vcDlyType: 5, vcRevType: 8 };
  for (const [id, count] of Object.entries(lengths)) {
    const parameter = LIBRARY.scopes.common.parameters.find((p) => p.id === id);
    assert.equal(parameter.valueType, 'enum', id);
    assert.equal(parameter.enum.length, count, id);
    assert.deepEqual(parameter.enum.map((e) => e.wire), [...Array(count).keys()], id);
  }
});

test('the control matrix can reach every destination the manual lists', () => {
  // p10's Control Matrix List numbers its destinations 0..45 and ends at VarEF D:W. The parameter
  // table says "00...24 off(0)...Vari-Ef Dry:Wet(24)", but 24h is FEG Depth in that list — the
  // table's 24 is a misprint for 2D, and taking it literally hid the only effect destination.
  for (let n = 1; n <= 16; n += 1) {
    const parameter = LIBRARY.scopes.scene.parameters.find((p) => p.id === `scCmParam${n}`);
    assert.equal(parameter.enum.length, 46, `scCmParam${n}`);
    assert.equal(parameter.enum.at(-1).label, 'VarEF D:W');
    assert.equal(parameter.enum.at(-1).wire, 45);
  }
  const track = LIBRARY.scopes.common.parameters.find((p) => p.id === 'fegTrkParam1');
  assert.equal(track.enum.length, 57, 'the Free EG track list runs 0..56 and there the table agrees');
});

/**
 * The blocks the Data List documents and the profile used to ignore: the step sequencer, the Free
 * EG curve, the Scene Ctrl buffer, and byte framing for all eight bulk dumps.
 *
 * These are transcriptions and arithmetic, both checkable. The arithmetic is what settles the one
 * place the manual contradicts itself: it labels the last Free EG point of tracks 3 and 4
 * "Data128", but the addresses it prints run each track to 192 points, and its own 668h total for
 * the Common block only balances at 192 (104 named bytes + 4 x 192 x 2 = 1640).
 */
const BLOCK_SIZES = {
  system: [0x00, 0x00, 0x00, 28],        // "Total size 1C"
  voiceCommon: [0x10, 0x00, 0x00, 1640], // "TOTAL SIZE 668"
  scene1: [0x10, 0x10, 0x00, 116],       // "Total size 74 : Scene 1, 2 Edit Buffer"
  scene2: [0x10, 0x11, 0x00, 116],
  sceneCtrl: [0x10, 0x12, 0x00, 68],     // "Total size 44 : Scene Ctrl Buffer"
  stepSeq: [0x10, 0x0e, 0x00, 70],       // "TOAL SIZE 46"
  userVoice: [0x11, null, 0x00, 1942],   // "TOTAL SIZE 796", mm = 00...7F
  userPattern: [0x01, null, 0x00, 70],   // "TOTAL SIZE 46", mm = 00...7F
};

test('every bulk dump carries the Data List\'s address, byte count and checksum span', () => {
  assert.equal(LIBRARY.dumps.length, 8, 'p13: "The following eight types of data are transmitted/received"');
  for (const dump of LIBRARY.dumps) {
    const [high, mid, low, size] = BLOCK_SIZES[dump.id];
    const prefix = dump.message.matcher.prefix;
    const where = `dump ${dump.id}`;

    // F0 43 0n 5C <byte count MSB> <LSB> <address x3>, then data, checksum, F7.
    assert.deepEqual(prefix.slice(0, 4), ['F0', '43', '00', '$modelId'], where);
    assert.equal(parseInt(prefix[4], 16) * 128 + parseInt(prefix[5], 16), size,
      `${where}: the byte count in the header must be the payload size`);
    assert.equal(parseInt(prefix[6], 16), high, where);
    assert.equal(prefix[7], mid === null ? '$slot' : mid.toString(16).padStart(2, '0').toUpperCase(), where);
    assert.equal(parseInt(prefix[8], 16), low, where);

    assert.equal(dump.message.payload.offset, 9, where);
    assert.equal(dump.message.payload.size, size, where);
    assert.equal(dump.message.checksum.type, 'roland-7bit', where);
    assert.equal(dump.message.checksum.fromOffset, 4, `${where}: the span starts at the byte count`);
    assert.equal(dump.message.checksum.toOffset, 9 + size - 1, `${where}: and ends at the last data byte`);
    assert.equal(dump.message.checksum.byteOffset, 9 + size, where);
    assert.equal(dump.message.completion.bytes, 9 + size + 2, `${where}: payload + checksum + F7`);
    assert.ok(dump.layout?.length, `${where}: has no byte map`);
  }
});

test('every bulk dump can be asked for', () => {
  // p13 (3-5-5) DUMP REQUEST: F0 43 2n 5C <address x3> F7, one per block. The profile used to carry
  // a single address-less request shape, which every dump pointed at — so no dump could be
  // requested and nothing said so.
  const shapes = Object.fromEntries(LIBRARY.messageShapes.map((s) => [s.id, s]));
  for (const dump of LIBRARY.dumps) {
    const shape = shapes[dump.requestShape];
    assert.ok(shape, `${dump.id} names request shape ${dump.requestShape}, which does not exist`);
    const [high, mid, low] = BLOCK_SIZES[dump.id];
    assert.deepEqual(shape.template.slice(0, 4), ['F0', '43', '20', '$modelId'], shape.id);
    assert.equal(parseInt(shape.template[4], 16), high, shape.id);
    assert.equal(shape.template[5], mid === null ? '$slot' : mid.toString(16).padStart(2, '0').toUpperCase(), shape.id);
    assert.equal(parseInt(shape.template[6], 16), low, shape.id);
    assert.equal(shape.template[7], 'F7', shape.id);
  }
  // …and the engine has to find it: what it reads is `requests`, not the dumpDefinition's
  // requestRecipe, which nothing in the codebase looks at.
  const requests = Object.fromEntries(EMITTED.requests.map((r) => [r.id, r]));
  for (const dump of LIBRARY.dumps) {
    const request = requests[dump.requestShape];
    assert.ok(request, `${dump.requestShape} is not in the emitted requests array`);
    assert.deepEqual(request.response, { kind: 'bulkDump', dump: dump.id });
  }
});

test('every block maps end to end, with no gap and no overlap', () => {
  // A hole in a block is a byte the panel cannot write and a dump cannot decode; an overlap is two
  // controls fighting over one byte. Both are silent.
  const BLOCKS = { system: 28, common: 104, scene: 116, sceneCtrl: 68, stepSeq: 70, fegTrack: 384 };
  for (const [scopeName, size] of Object.entries(BLOCKS)) {
    const owner = new Map();
    for (const parameter of LIBRARY.scopes[scopeName].parameters) {
      const bytes = parameter.address.split(' ').map((b) => parseInt(b, 16));
      const start = (bytes[0] << 14) | (bytes[1] << 7) | bytes[2];
      for (let i = 0; i < (parameter.size ?? 1); i += 1) {
        assert.ok(!owner.has(start + i),
          `${scopeName}: ${parameter.id} and ${owner.get(start + i)} both claim byte ${start + i}`);
        owner.set(start + i, parameter.id);
      }
    }
    assert.equal(owner.size, size, `${scopeName} is ${size} bytes`);
    for (let i = 0; i < size; i += 1) assert.ok(owner.has(i), `${scopeName}: byte ${i} is unmapped`);
  }
});

test('the Free EG is four tracks of 192 points, whatever the manual labels them', () => {
  const scope = LIBRARY.scopes.fegTrack;
  assert.equal(scope.instances, 4);
  assert.equal(scope.base, '10 00 68');
  assert.equal(scope.stride, '00 03 00');   // 384 bytes per track, 7 bits per address byte
  assert.equal(scope.parameters.length, 192);
  for (const point of scope.parameters) {
    assert.equal(point.size, 2, 'each point is an MSB/LSB pair');
    assert.deepEqual(point.range, { min: 0, max: 255 });
  }
  // The arithmetic that settles it: 104 named Common bytes + 4 x 192 x 2 = 1640 = 668h, the total
  // the Data List prints for the Common block.
  const named = LIBRARY.scopes.common.parameters
    .reduce((total, p) => total + (p.size ?? 1), 0);   // vcName counts once, for ten bytes
  assert.equal(named + 4 * 192 * 2, 1640);
  const voiceCommon = LIBRARY.dumps.find((d) => d.id === 'voiceCommon');
  assert.equal(voiceCommon.layout.length, LIBRARY.scopes.common.parameters.length + 768);
  assert.equal(voiceCommon.layout.at(-1).offset, 104 + 3 * 384 + 191 * 2);
  assert.equal(voiceCommon.layout.at(-1).offset + 1, 1639, 'the last curve byte is the last byte of the block');
});

test('the step sequencer is modelled, all 70 bytes of it', () => {
  const step = LIBRARY.scopes.stepSeq;
  assert.equal(step.base, '10 0E 00');
  assert.equal(step.parameters.length, 70);
  const byId = Object.fromEntries(step.parameters.map((p) => [p.id, p]));
  // Sixteen of each, and the four arrays sit where the Data List puts them.
  for (let n = 1; n <= 16; n += 1) {
    assert.equal(lowByte(byId[`ssNote${n}`].address), 0x05 + n);
    assert.equal(lowByte(byId[`ssVelocity${n}`].address), 0x15 + n);
    assert.equal(lowByte(byId[`ssGateTime${n}`].address), 0x25 + n);
    assert.equal(lowByte(byId[`ssCtrlValue${n}`].address), 0x35 + n);
  }
  // The Data List prints step 8's gate time at "1d", between 2c and 2e. It is 2d.
  assert.equal(lowByte(byId.ssGateTime8.address), 0x2d);
  assert.equal(byId.ssNote1.default, 60, 'C3 (3Ch)');
  assert.equal(byId.ssVelocity1.default, 100);
  assert.equal(byId.ssGateTime1.default, 60, '94% (3Ch)');
  assert.deepEqual(byId.ssLength.range, { min: 1, max: 16 });
  // The User Patterns are the same 70 bytes at a different address, so the pattern dump reuses them.
  const pattern = LIBRARY.dumps.find((d) => d.id === 'userPattern');
  assert.equal(pattern.layout.length, 70);
  assert.ok(pattern.layout.every((e) => e.param.startsWith('stepSeq.')));
});

test('the Scene Ctrl buffer is a scene without its control matrix', () => {
  const ctrl = LIBRARY.scopes.sceneCtrl;
  assert.equal(ctrl.base, '10 12 00');
  const highest = Math.max(...ctrl.parameters.map((p) => lowByte(p.address)));
  assert.equal(highest, 0x43, 'the control matrix starts at 44h and is not part of this buffer');
  const sceneUpTo43 = sceneParameters.filter((p) => lowByte(p.address) <= 0x43);
  assert.equal(ctrl.parameters.length, sceneUpTo43.length);
});

test('an effect parameter is bounded by what its effect accepts', () => {
  // Every one of these was 0..16383 — the capacity of a two-byte encoding, not a range the AN1x
  // accepts. The Effect Parameter List (p6-p7) gives a Value column per parameter per type.
  const byId = Object.fromEntries(LIBRARY.scopes.common.parameters.map((p) => [p.id, p]));
  // The eight reverb types share one parameter list, so these are exact rather than a union.
  const reverb = [[0, 69], [0, 14], [0, 10], [0, 999], [1, 127], [0, 52], [34, 60]];
  reverb.forEach(([min, max], index) => {
    assert.deepEqual(byId[`vcRevParam${index + 1}`].range, { min, max }, `vcRevParam${index + 1}`);
  });
  assert.deepEqual(byId.vcDlyParam1.range, { min: 0, max: 6599 }, 'the longest delay time on offer');
  assert.deepEqual(byId.vcDlyParam7.range, { min: 34, max: 60 }, 'always the LPF, in all three types that have it');
  assert.deepEqual(byId.vcVariParam4.range, { min: 0, max: 500 });
  for (const id of Object.keys(byId)) {
    if (!/^vc(Vari|Dly|Rev)Param\d$/.test(id)) continue;
    assert.ok(byId[id].range.max <= 6599, `${id} is still unbounded`);
    assert.ok(byId[id].note?.includes('Data List'), `${id} has no citation`);
  }
});
