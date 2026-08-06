// make-gaia-profile.mjs — build a full Roland GAIA SH-01 device profile from the address map.
//
//   node tools/scripts/qa/roland-gaia/make-gaia-profile.mjs [outFile]
//   node tools/scripts/qa/roland-gaia/make-gaia-profile.mjs --check
//
// Why this exists: the profile that shipped as `roland-gaia` has fifteen parameters, all of them
// Tone 1's filter section, with ids like `filter.cutoff` that have no tone dimension at all. It is
// a demo of the profile format, not an editor for the synth — and nothing said so, because a
// profile with fifteen correct parameters looks exactly like a profile with a hundred and sixty
// until you go looking for the ninety-fifth.
//
// The GAIA has THREE tone layers. They are the same 62-byte block at a 0x0100 stride, so the fix
// is not to write the map out three times — it is to emit it three times against three bases, and
// to put the tone in the parameter id where a panel can see it (`tone2.filter.cutoff`). That is
// what makes "show tone 1, 2 and 3 at once" a layout decision rather than a profile rewrite.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BLOCK_SIZES, BLOCKS, MODEL, PATCH_ARPEGGIO_COMMON, PATCH_COMMON, PATCH_DELAY, PATCH_DISTORTION,
  PATCH_FLANGER, PATCH_REVERB, PATCH_TONE, TEMPORARY_PATCH, USER_PATCH_A1,
} from './address-map.mjs';

/**
 * The blocks that are not tones and not Patch Common: each is one table emitted once, against its
 * own base. Kept as data so adding a block is a row here rather than another loop below.
 */
const EXTRA_BLOCKS = [
  { block: 'distortion', prefix: 'distortion', group: 'Effects · Distortion', table: PATCH_DISTORTION },
  { block: 'flanger', prefix: 'flanger', group: 'Effects · Flanger', table: PATCH_FLANGER },
  { block: 'delay', prefix: 'delay', group: 'Effects · Delay', table: PATCH_DELAY },
  { block: 'reverb', prefix: 'reverb', group: 'Effects · Reverb', table: PATCH_REVERB },
  { block: 'arpeggioCommon', prefix: 'arp', group: 'Arpeggio', table: PATCH_ARPEGGIO_COMMON },
];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
// A NEW file, deliberately. `roland-gaia.ceditor-device.json` is a fifteen-parameter demo of the
// profile format whose golden SysEx vectors are keyed to ids like `filter.mode`; overwriting it
// would silently invalidate those and dpdMergeOnDrop.test.js with them. The demo stays a demo.
const DEFAULT_OUT = path.join(REPO, 'CE/profiles/test/roland-gaia-sh01.ceditor-device.json');

/* ------------------------------------------------------------------ addressing */

const parseBytes = (hex) => hex.trim().split(/\s+/).map((b) => parseInt(b, 16));
const formatBytes = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

/**
 * Roland addresses are four 7-BIT bytes: each byte carries 0..0x7F and overflow carries into the
 * one to its left. Adding block and parameter offsets with ordinary 8-bit arithmetic works for
 * every offset in this map and would break the moment one crossed 0x80, which is the kind of bug
 * that only appears on the parameter nobody tested.
 */
function addressFor(blockOffset, paramOffset) {
  const bytes = parseBytes(TEMPORARY_PATCH);
  const block = parseBytes(blockOffset);   // 3 bytes, right-aligned into bytes 1..3
  const param = parseBytes(paramOffset);   // 2 bytes, right-aligned into bytes 2..3

  const sum = [...bytes];
  block.forEach((value, i) => { sum[i + 1] += value; });
  param.forEach((value, i) => { sum[i + 2] += value; });

  for (let i = sum.length - 1; i > 0; i--) {
    if (sum[i] > 0x7f) { sum[i - 1] += Math.floor(sum[i] / 0x80); sum[i] %= 0x80; }
  }
  return formatBytes(sum);
}

/** A block inside user patch slot `n` (0 = A-1, 1 = A-2, ... 63 = H-8). */
function addressForUserPatch(slot, blockOffset) {
  const bytes = parseBytes(USER_PATCH_A1);
  bytes[1] += slot;
  const block = parseBytes(blockOffset);
  block.forEach((value, i) => { bytes[i + 1] += value; });
  for (let i = bytes.length - 1; i > 0; i--) {
    if (bytes[i] > 0x7f) { bytes[i - 1] += Math.floor(bytes[i] / 0x80); bytes[i] %= 0x80; }
  }
  return formatBytes(bytes);
}

/* ------------------------------------------------------------------ naming */

/** "FILTER Env Attack Time" -> { section: 'filter', leaf: 'envAttackTime' } */
function splitName(name) {
  const SECTIONS = [
    ['Modulation LFO ', 'modLfo'],
    ['OSC ', 'osc'], ['FILTER ', 'filter'], ['AMP ', 'amp'], ['LFO ', 'lfo'],
    // Effect and arpeggio tables repeat their block's name in every row ("Distortion Type",
    // "Flanger Parameter 3", "Arpeggio Grid"). The block is already in the id prefix, so strip it
    // rather than emit distortion.distortionType.
    ['Distortion ', ''], ['Flanger ', ''], ['Delay ', ''], ['Reverb ', ''],
    ['Arpeggio ', ''], ['MFX ', ''],
  ];
  for (const [prefix, section] of SECTIONS) {
    if (name.startsWith(prefix)) return { section, leaf: camel(name.slice(prefix.length)) };
  }
  return { section: '', leaf: camel(name) };
}

const camel = (s) => s
  .replace(/[^A-Za-z0-9 ]/g, ' ')
  .trim()
  .split(/\s+/)
  .map((word, i) => (i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()))
  .join('');

const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'v';

/* ------------------------------------------------------------------ parameters */

/** Choose the component a generated panel should reach for. The GAIA is a knob-and-slider synth. */
function preferredComponent(entry) {
  if (entry.labels) {
    if (entry.labels.length === 2 && entry.labels[0] === 'OFF') return 'ToggleButton';
    return entry.labels.length <= 5 ? 'RadioButtonGroup' : 'Combobox';
  }
  // Envelope times and levels read as faders on the hardware; everything else is a knob.
  return /Env |Level$|Time$/.test(entry.name) ? 'Slider' : 'Knob';
}

function buildParameter(entry, { idPrefix, group, blockOffset }) {
  const { section, leaf } = splitName(entry.name);
  const id = [idPrefix, section, leaf].filter(Boolean).join('.');
  const address = addressFor(blockOffset, entry.offset);

  const base = {
    id,
    name: entry.name,
    group,
    address,
    access: { canRead: true, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
    messageRecipe: 'dt1',
    ui: { preferredComponent: preferredComponent(entry) },
  };

  if (entry.labels) {
    const choices = entry.labels.map((label, value) => ({ id: slug(label), label, value: entry.min + value }));
    return {
      ...base,
      type: 'choice',
      default: choices[0].id,
      choices,
      display: { mode: 'choice', shortLabel: leaf },
      normalization: { mode: 'choiceIndex' },
      encoding: { type: 'enum' },
      sendPolicy: { mode: 'onCommit', coalesce: true },
    };
  }

  // Bipolar and offset parameters: the wire range and the range a human reads are different, and
  // the profile has to carry both or every value on screen is wrong by a constant.
  const bipolar = 'displayMin' in entry && (entry.displayMin !== entry.min || entry.displayMax !== entry.max);
  const continuous = entry.max - entry.min > 8;

  return {
    ...base,
    type: bipolar && entry.displayMin < 0 ? 'bipolar' : 'integer',
    ...(entry.note ? { description: entry.note } : {}),
    range: { min: entry.min, max: entry.max },
    default: bipolar ? Math.round((entry.min + entry.max) / 2) : entry.min,
    display: {
      mode: 'number',
      unit: entry.unit && entry.unit !== 'ASCII' ? entry.unit : '',
      shortLabel: leaf,
      ...(bipolar ? { min: entry.displayMin, max: entry.displayMax } : {}),
    },
    normalization: { mode: 'linear' },
    encoding: entry.nibbles ? { type: 'nibbles', count: entry.nibbles } : { type: 'u7' },
    sendPolicy: continuous
      ? { mode: 'continuous', coalesce: true, minIntervalMs: 20, sendFinalOnRelease: true }
      : { mode: 'onCommit', coalesce: true },
  };
}

/** The 12 Patch Name bytes are one name, not twelve numbers. Collapse them. */
function patchNameParameter() {
  return {
    id: 'common.patchName',
    name: 'Patch Name',
    group: 'Patch Common',
    type: 'patchName',
    address: addressFor(BLOCKS.common, '00 00'),
    length: 12,
    default: 'INIT PATCH  ',
    display: { mode: 'text', shortLabel: 'Name' },
    encoding: { type: 'ascii', length: 12, pad: 32 },
    access: { canRead: true, canWrite: true, realtimeSafe: false, source: 'singleParameter' },
    sendPolicy: { mode: 'onCommit', coalesce: false },
    messageRecipe: 'dt1',
    ui: { preferredComponent: 'TextInput' },
  };
}

/**
 * Roland's 7-bit checksum: sum the address and data bytes, and pick the value that brings the
 * total to a multiple of 128. Computed here so the golden vectors below are derived from the same
 * arithmetic the runtime has to perform, rather than pasted from somewhere and trusted.
 */
function rolandChecksum(bytes) {
  const sum = bytes.reduce((total, byte) => total + byte, 0);
  return (128 - (sum % 128)) % 128;
}

/** An RQ1 read, as the exact bytes that should appear on the wire. */
function rq1Hex(deviceId, address, size) {
  const body = [...parseBytes(address), ...parseBytes(size)];
  return formatBytes([0xf0, 0x41, deviceId, 0x00, 0x00, 0x41, 0x11, ...body, rolandChecksum(body), 0xf7]);
}

/** A DT1 write, as the exact bytes that should appear on the wire. */
function dt1Hex(deviceId, address, value) {
  const addr = parseBytes(address);
  const body = [...addr, value];
  return formatBytes([0xf0, 0x41, deviceId, 0x00, 0x00, 0x41, 0x12, ...body, rolandChecksum(body), 0xf7]);
}

/**
 * Golden vectors. The one that matters is the tone triple: the same parameter on all three tones
 * differs only in address byte 2, and its checksum therefore differs too — so three vectors that
 * pass prove the stride and the checksum together, which is the pair most likely to be wrong.
 */
function buildTests(deviceId, parameters) {
  const byId = new Map(parameters.map((p) => [p.id, p]));
  const vectors = [
    { name: 'Universal Identity Request', kind: 'identityRequest', expectedHex: `F0 7E ${formatBytes([deviceId])} 06 01 F7` },
    // The manual's Example 2, verbatim: RQ1 for REVERB in USER PATCH A-2. It is the only vector
    // here that addresses a user patch rather than the edit buffer, and it is worth keeping for
    // exactly that reason — it exercises the 20 nn 00 00 base and a size the manual states, so a
    // mistake in either would show up against a printed answer rather than against our own.
    {
      name: 'Reverb block request in User Patch A-2 (manual Example 2)',
      kind: 'rq1',
      address: addressForUserPatch(1, BLOCKS.reverb),
      size: BLOCK_SIZES.reverb,
      expectedHex: rq1Hex(deviceId, addressForUserPatch(1, BLOCKS.reverb), BLOCK_SIZES.reverb),
    },
  ];

  for (const [id, value, label] of [
    ['tone1.filter.cutoff', 64, 'Tone 1 Filter Cutoff 64'],
    ['tone2.filter.cutoff', 64, 'Tone 2 Filter Cutoff 64 (same value, +0x0100 address)'],
    ['tone3.filter.cutoff', 64, 'Tone 3 Filter Cutoff 64 (same value, +0x0200 address)'],
    ['tone1.osc.wave', 6, 'Tone 1 OSC Wave = SUPER-SAW'],
    ['tone3.amp.pan', 0, 'Tone 3 AMP Pan hard left (wire 0 = L64)'],
    ['common.patchLevel', 127, 'Patch Level 127'],
  ]) {
    const parameter = byId.get(id);
    if (!parameter) throw new Error(`golden vector references a parameter that does not exist: ${id}`);
    vectors.push({ name: label, parameter: id, value, expectedHex: dt1Hex(deviceId, parameter.address, value) });
  }
  return vectors;
}

export function buildProfile() {
  const parameters = [patchNameParameter()];

  for (const entry of PATCH_COMMON) {
    if (/^Patch Name \d+$/.test(entry.name)) continue; // folded into common.patchName
    parameters.push(buildParameter(entry, { idPrefix: 'common', group: 'Patch Common', blockOffset: BLOCKS.common }));
  }

  for (const tone of [1, 2, 3]) {
    for (const entry of PATCH_TONE) {
      const { section } = splitName(entry.name);
      const SECTION_LABEL = { osc: 'OSC', filter: 'Filter', amp: 'Amp', lfo: 'LFO', modLfo: 'Mod LFO' };
      parameters.push(buildParameter(entry, {
        idPrefix: `tone${tone}`,
        // Grouped per tone AND per section, so a panel can lay out "Tone 2 · Filter" as a block
        // without inspecting parameter ids.
        group: `Tone ${tone} · ${SECTION_LABEL[section] ?? 'Misc'}`,
        blockOffset: BLOCKS[`tone${tone}`],
      }));
    }
  }

  for (const { block, prefix, group, table } of EXTRA_BLOCKS) {
    for (const entry of table) {
      parameters.push(buildParameter(entry, { idPrefix: prefix, group, blockOffset: BLOCKS[block] }));
    }
  }

  // Master Volume is CC 7, not a SysEx address — carried over from the demo profile, where it was
  // the one parameter that did not go through DT1. Dropping it would have been a silent regression.
  parameters.push({
    id: 'master.volume',
    name: 'Master Volume',
    group: 'Global',
    type: 'integer',
    range: { min: 0, max: 127 },
    default: 100,
    display: { mode: 'number', unit: '', shortLabel: 'Volume' },
    normalization: { mode: 'linear' },
    encoding: { type: 'u7' },
    access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'controlChange' },
    sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 20, sendFinalOnRelease: true },
    messageRecipe: 'volumeCc',
    ui: { preferredComponent: 'Slider' },
  });

  const deviceId = 16;

  return {
    schemaVersion: 1,
    profileVersion: '1.0.0',
    minCEditorVersion: '0.9.0',
    id: 'roland-gaia-sh01',
    name: 'Roland GAIA SH-01 (full)',
    manufacturer: 'Roland',
    family: 'SH',
    status: 'experimental',
    trust: 'local',
    // `sources`, not `source` — the shape the other profiles already use, and the shape
    // scriptDeviceProfile.test.js already has a reason on file for. Adding a near-duplicate key
    // would have meant a second exemption saying the same thing.
    sources: [{
      type: 'manual',
      title: 'Roland SH-01 GAIA MIDI Implementation (v1.01, Sep 2010)',
      notes: 'Section 3 Parameter Address Map, transcribed in full for Patch Common and Patch Tone. '
        + 'Model ID 00 00 41, DT1=12 / RQ1=11, roland-7bit checksum. Temporary Patch 10 00 00 00; '
        + 'Tone 1/2/3 at block offsets 00 01 00 / 00 02 00 / 00 03 00. Verified against the manual\'s '
        + 'own Example 1: F0 41 10 00 00 41 12 10 00 01 00 06 69 F7.',
    }],
    variables: { deviceId, channel: 1 },
    identity: {
      requestDeviceId: '$deviceId',
      manufacturerId: [MODEL.manufacturer],
      familyCode: ['41', '02'],
      modelNumber: ['00', '00'],
      revision: ['00', '03', '00', '00'],
      timeoutMs: 1000,
      retries: 0,
    },
    coverage: {
      // Honest about what is and is not built. The Patch Common + three Tone blocks are complete
      // against the manual; the effects and arpeggio blocks are not transcribed yet, and neither
      // is bulk dump parsing. Saying "broad" here would be the same lie the 15-parameter profile
      // told by omission.
      singleParameterWrite: 'complete-for-every-block-the-front-panel-reaches',
      editBufferDumpRequest: 'block-rq1-per-block',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      patchNameEdit: 'complete-single-dt1-write',
      realtimeEditing: 'complete-for-transcribed-blocks',
      notTranscribed: ['Patch Arpeggio Pattern (Note 1-16)'],
      // Two honest gaps, both stated rather than papered over:
      //
      //  - The Arpeggio PATTERN blocks (00 0D 00 .. 00 1C 00) are sixteen notes x an original note
      //    plus thirty-two steps: 528 values of step-sequencer data. They are addresses, not
      //    controls — a panel drives them with an Arpeggiator component and a dump, not with 528
      //    knobs — so they are deliberately not expanded into parameters.
      //
      //  - The effect parameters are named as the manual names them ("Flanger Parameter 3"). What
      //    each one DOES depends on the selected type, and that mapping — including which three
      //    become the front panel's CONTROL 1/2/3 — is in the owner's manual, not the MIDI
      //    implementation. Renaming them from a guess would be worse than leaving them factual.
      effectParameterMeanings: 'type-dependent; not documented in the MIDI implementation',
    },
    timing: { minDelayBetweenMessagesMs: 20 },
    messageRecipes: [
      {
        id: 'dt1',
        kind: 'sysex',
        template: ['F0', MODEL.manufacturer, '$deviceId', ...MODEL.modelId, MODEL.dt1, '$address', '$encodedValue', '$checksum', 'F7'],
        checksum: { type: 'roland-7bit', from: '$address', to: '$encodedValue' },
        delayAfterMs: 20,
      },
      {
        id: 'rq1',
        kind: 'sysex',
        template: ['F0', MODEL.manufacturer, '$deviceId', ...MODEL.modelId, MODEL.rq1, '$address', '$size', '$checksum', 'F7'],
        checksum: { type: 'roland-7bit', from: '$address', to: '$size' },
        delayAfterMs: 20,
      },
      { id: 'volumeCc', kind: 'cc', channel: '$channel', controller: 7, value: '$encodedValue' },
    ],
    requests: [
      {
        id: 'identityRequest',
        name: 'Identity Request',
        kind: 'sysex',
        template: ['F0', '7E', '$deviceId', '06', '01', 'F7'],
        response: { kind: 'identity' },
        timeoutMs: 1000,
        retries: 0,
      },
      // One request per block, because that is how the synth answers: RQ1 with the block base and
      // its total size. Sizes come from BLOCK_SIZES, which is transcribed from the manual rather
      // than computed from the last offset — the two disagree for Distortion.
      ...[
        ['common', 'common'], ['tone1', 'tone'], ['tone2', 'tone'], ['tone3', 'tone'],
        ['distortion', 'distortion'], ['flanger', 'flanger'], ['delay', 'delay'],
        ['reverb', 'reverb'], ['arpeggioCommon', 'arpeggioCommon'],
      ]
        .map(([block, sizeKey]) => ({
          id: `request${block[0].toUpperCase()}${block.slice(1)}`,
          name: `Request ${block}`,
          kind: 'sysex',
          messageRecipe: 'rq1',
          address: addressFor(BLOCKS[block], '00 00'),
          size: BLOCK_SIZES[sizeKey],
          response: { kind: 'dt1', address: addressFor(BLOCKS[block], '00 00') },
          timeoutMs: 1000,
          retries: 1,
        })),
    ],
    startup: {
      policy: 'pull',
      syncDirection: 'pull',
      sync: [
        { request: 'identityRequest' },
        { request: 'requestCommon' },
        { request: 'requestTone1' }, { request: 'requestTone2' }, { request: 'requestTone3' },
        { request: 'requestDistortion' }, { request: 'requestFlanger' },
        { request: 'requestDelay' }, { request: 'requestReverb' },
        { request: 'requestArpeggioCommon' },
      ],
    },
    parameters,
    tests: buildTests(deviceId, parameters),
  };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const out = path.resolve(REPO, args.find((a) => !a.startsWith('--')) ?? DEFAULT_OUT);
  const json = `${JSON.stringify(buildProfile(), null, 2)}\n`;

  if (check) {
    let current = null;
    try { current = readFileSync(out, 'utf8'); } catch { /* missing counts as stale */ }
    if (current === json) { console.log('Gaia profile is up to date.'); return; }
    console.error(`Stale: ${path.relative(REPO, out)} — run: node tools/scripts/qa/roland-gaia/make-gaia-profile.mjs`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, json);
  const profile = JSON.parse(json);
  console.log(`Wrote ${path.relative(REPO, out)}`);
  const groups = new Map();
  for (const parameter of profile.parameters) groups.set(parameter.group, (groups.get(parameter.group) ?? 0) + 1);
  console.log(`  ${profile.parameters.length} parameters across ${groups.size} groups`);
  console.log(`  common ${PATCH_COMMON.length - 11}, tone 3 x ${PATCH_TONE.length}, effects ${PATCH_DISTORTION.length + PATCH_FLANGER.length + PATCH_DELAY.length + PATCH_REVERB.length}, arpeggio ${PATCH_ARPEGGIO_COMMON.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
