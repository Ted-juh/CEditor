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

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCommitted } from '../../readCommitted.mjs';
// The OWNER'S MANUAL's effect parameter table, which the MIDI implementation does not contain.
// Imported rather than re-transcribed: it is one table, and two copies of it would agree until one
// was edited. The panel reads it for the knob CAPTIONS; this file reads it for the RANGES.
import { EFFECT_PARAMETER_RANGES } from '../../gaia-panel/effect-parameters.mjs';

import {
  BLOCK_SIZES, BLOCKS, MODEL, PATCH_ARPEGGIO_COMMON, PATCH_ARPEGGIO_PATTERN, PATCH_COMMON,
  PATCH_DELAY, PATCH_DISTORTION, PATCH_FLANGER, PATCH_REVERB, PATCH_TONE, TEMPORARY_PATCH,
  USER_PATCH_A1,
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

/**
 * The MFX container, and why every effect parameter needed its range narrowed.
 *
 * The MIDI implementation declares each effect slot as four nibbles over 12768..52768, displayed
 * -20000..+20000. That is Roland's generic MFX container, not the parameter's own range: the span
 * is 40000 and the centre is 32768, so `displayed = stored - 32768`.
 *
 * A four-nibble field declared 12768..52768 CANNOT be carrying a raw 0-127 byte — 0 would sit below
 * its own declared minimum. The offset encoding is the only self-consistent reading of the address
 * map, and it is why the ranges below can be applied from the owner's manual without a hardware
 * reading first.
 *
 * What it fixes: DIST Drive is 0-127, so a knob bound to the container swept forty thousand steps
 * for a hundred and twenty-eight values — a third of one percent of its travel did anything at all.
 * That is the difference between a panel you can play and one you can only look at.
 */
const MFX_CENTRE = 32768;

/**
 * The manual's range for each effect slot, folded across the types that share it.
 *
 * One address serves every type of its block — `distortion.parameter2` is the distortion TYPE
 * (1-6) under DIST and Bit Down (0-127) under BIT CRASH — and a profile parameter carries one
 * range. So slots whose meaning changes take the UNION, which is the widest range that can never
 * refuse a legal value. Twelve of the sixteen need no union at all: every type agrees.
 *
 * Slots 5 and up keep the container range. The owner's manual documents four parameters per type
 * because the instrument reaches four, and narrowing an address on no evidence would be inventing
 * a limit rather than recording one.
 */
function mfxRangeFor(block, slot) {
  const perType = EFFECT_PARAMETER_RANGES[block];
  if (!perType || slot < 1 || slot > 4) return null;

  let min = Infinity;
  let max = -Infinity;
  const units = new Set();
  for (const ranges of Object.values(perType)) {
    const range = ranges[slot - 1];
    if (!range) return null;
    // A selector's `values` are the displayed numbers themselves; a choice list (REVERB Type) is
    // indexed from zero, because that is what the wire carries for a named option.
    const numeric = Array.isArray(range.values)
      ? (range.values.every((v) => typeof v === 'number') ? range.values : range.values.map((unused, i) => i))
      : [range.min, range.max];
    min = Math.min(min, ...numeric);
    max = Math.max(max, ...numeric);
    units.add(range.unit ?? '');
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  // Only when every type agrees. A slot that is dB under one type and cents under another has no
  // single unit, and printing one would label two thirds of the cases wrong.
  const unit = units.size === 1 ? [...units][0] : '';
  return { min: MFX_CENTRE + min, max: MFX_CENTRE + max, displayMin: min, displayMax: max, unit };
}

/** `MFX Parameter 7` / `Delay Parameter 3` -> 7 / 3, or 0 for a row that is not one. */
function mfxSlotOf(name) {
  const match = /Parameter (\d+)$/.exec(String(name ?? ''));
  return match ? Number(match[1]) : 0;
}

/**
 * Every block the synth will answer an RQ1 for: one row, driving the REQUEST, the DUMP DEFINITION
 * that parses the reply, and the startup sync list.
 *
 * One table rather than three lists, because the failure mode of three lists is a request for a
 * dump that does not exist — which is not a warning. `buildDumpRequests` emitting a `bulkDump`
 * response naming a dump `buildDumpDefinitions` never emitted makes DeviceProfileEngine reject the
 * WHOLE profile at load, silently, and the 793-parameter GAIA drops out of the device list. It has
 * happened once already this session; a shared table is what makes it unrepresentable.
 */
const BLOCK_DUMPS = [
  { dump: 'common', name: 'Patch Common', block: 'common', sizeKey: 'common' },
  { dump: 'tone1', name: 'Patch Tone 1', block: 'tone1', sizeKey: 'tone' },
  { dump: 'tone2', name: 'Patch Tone 2', block: 'tone2', sizeKey: 'tone' },
  { dump: 'tone3', name: 'Patch Tone 3', block: 'tone3', sizeKey: 'tone' },
  { dump: 'distortion', name: 'Patch Distortion', block: 'distortion', sizeKey: 'distortion' },
  { dump: 'flanger', name: 'Patch Flanger', block: 'flanger', sizeKey: 'flanger' },
  { dump: 'delay', name: 'Patch Delay', block: 'delay', sizeKey: 'delay' },
  { dump: 'reverb', name: 'Patch Reverb', block: 'reverb', sizeKey: 'reverb' },
  { dump: 'arpeggioCommon', name: 'Patch Arpeggio Common', block: 'arpeggioCommon', sizeKey: 'arpeggioCommon' },
  // The sixteen pattern lanes. They were requestable one DT1 at a time and nothing could READ them
  // back, so a step grid could write a pattern and never show the one already in the synth.
  ...Array.from({ length: 16 }, (unused, index) => ({
    dump: `arpPattern${index + 1}`,
    name: `Patch Arpeggio Pattern (Note ${index + 1})`,
    block: `arpeggioPattern${index + 1}`,
    sizeKey: 'arpeggioPattern',
  })),
];

/** `requestCommon`, `requestTone1`, `requestArpPattern16` — derived from the dump id, once. */
const requestIdFor = (dump) => `request${dump[0].toUpperCase()}${dump.slice(1)}`;

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
export function addressFor(blockOffset, paramOffset) {
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

/**
 * The messages the GAIA SENDS that the editor never sends to it.
 *
 * A synth's own panel does not have to echo the editor's write path. Everything here is written as
 * a DT1 to an address, but turning the physical CUTOFF knob transmits a CC — 102, 103 and 104 for
 * tones 1, 2 and 3 — and nothing derived from the write path can recognise those. So the profile
 * has to say it, and this is the only place that knows.
 *
 * Not a new idea: the DPD authoring schema has always had an `rxLive` wire direction, and
 * `CE/dpd/library/roland.gaia.json` declares exactly this as {msg:'cc', cc:102, ccStride:1}. This
 * profile is generated from the address map rather than from DPD, so it needs its own statement of
 * the same fact. Keyed by section.leaf, applied per tone.
 */
const TONE_INBOUND = {
  'filter.cutoff': (tone) => [{ kind: 'cc', controller: 101 + tone }],
};

function buildParameter(entry, { idPrefix, group, blockOffset, inbound }) {
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
    ...(inbound?.length ? { inbound } : {}),
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
    // `nibbled` with a `nibbles` count, which is what BOTH engines read — DeviceProfileEngine.cpp
    // matches the string "nibbled" and calls propInt(encoding, "nibbles"), and the JS engine now
    // mirrors it. This emitted the DPD schema's authoring vocabulary instead, {type: 'nibbles',
    // count: N}, which matches no branch in either: C++ fell through to "Unsupported numeric
    // encoder" and refused to send, and JS fell through to a single u7 byte. 622 of this
    // profile's parameters — the whole envelope, LFO and filter section — could not be sent at
    // all on the desktop build. roland-sh-201 already used the runtime vocabulary; this profile
    // was the outlier.
    encoding: entry.nibbles ? { type: 'nibbled', nibbles: entry.nibbles } : { type: 'u7' },
    sendPolicy: continuous
      ? { mode: 'continuous', coalesce: true, minIntervalMs: 20, sendFinalOnRelease: true }
      : { mode: 'onCommit', coalesce: true },
  };
}

/**
 * The 12 Patch Name bytes are one name, not twelve numbers. Collapse them.
 *
 * `type: 'text'`, which is what BOTH engines branch on — and what this said instead was
 * `type: 'patchName'`, a word that appears in no branch of either. Falling through to the numeric
 * path, a write tried to parse "INIT PATCH  " as a number and a read returned the ASCII code of
 * the first letter as the patch's name. It has never worked in either direction, in either engine,
 * and nothing noticed because no golden vector covered it. There is one now.
 *
 * roland-sh-201 spells the codec `text-ascii`; both engines alias plain `ascii` to it, but writing
 * the alias in one profile and the canonical name in the other is how a codec quietly acquires two
 * spellings and then three.
 */
function patchNameParameter() {
  return {
    id: 'common.patchName',
    name: 'Patch Name',
    group: 'Patch Common',
    type: 'text',
    address: addressFor(BLOCKS.common, '00 00'),
    length: 12,
    default: 'INIT PATCH  ',
    display: { mode: 'text', shortLabel: 'Name' },
    encoding: { type: 'text-ascii', length: 12, pad: 32 },
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

/**
 * An RQ1 read as a device-request TEMPLATE.
 *
 * A device request is not a message recipe, and that is the whole point of this function. The
 * engine's compileDeviceRequest walks a flat token list where every token is either a literal hex
 * byte or a `$variable` worth exactly one byte — there is no $address, no $size, no $checksum, and
 * no messageRecipe. These nine requests referenced `messageRecipe: 'rq1'` and carried address/size
 * fields instead, which the engine cannot use: its validator rejects a request with no template as
 * an ERROR, loadFromJson refuses the whole profile, and loadInternalTestProfiles discards the
 * message — so the entire 793-parameter profile vanished from the device list with nothing said.
 * It was the only profile of the nine that failed, and therefore the only one nobody could pick.
 *
 * Address and size are constants per request, so the checksum is a constant too and is baked in
 * here by the same arithmetic the runtime uses.
 */
function rq1Template(address, size) {
  const body = [...parseBytes(address), ...parseBytes(size)];
  return [
    'F0', MODEL.manufacturer, '$deviceId', ...MODEL.modelId, MODEL.rq1,
    ...formatBytes(body).split(' '),
    formatBytes([rolandChecksum(body)]),
    'F7',
  ];
}

/**
 * How far `address` sits past `base`, in bytes.
 *
 * Roland addresses are four 7-BIT digits, so this is base-128 arithmetic and not the subtraction
 * of two 32-bit numbers. Distortion is the block that proves it: its size is 00 00 01 01, which is
 * 129 and not 257, and the parameter at 10 00 05 00 is 128 bytes past 10 00 04 00 rather than 256.
 * Getting this wrong puts every parameter in the block at the wrong payload offset — the dump
 * parses, reports success, and fills the panel with the neighbouring value.
 */
const flatSize = (hex) => parseBytes(hex).reduce((total, byte) => total * 128 + byte, 0);

function addressDelta(base, address) {
  return flatSize(address) - flatSize(base);
}

/**
 * The dumps the synth sends back, and where each parameter sits inside one.
 *
 * Derived from the PARAMETERS rather than re-transcribed from the manual, because the alternative
 * is two copies of the same offsets that agree until one is edited. A parameter's address already
 * says where it lives; a dump of a block is that block's bytes in address order, so the payload
 * offset IS the address delta. Written out by hand, the arpeggio lanes alone would be 528 rows
 * whose only content is `n`.
 *
 * The byte layout, which the offsets below are relative to:
 *
 *   F0 41 dd 00 00 41 12 aa bb cc dd  <size bytes>  sum F7
 *   0  1  2  3  4  5  6  7  8  9  10  11 ...        ^   ^
 *
 * so payload.offset is 11, the checksum covers the address and data (offsets 7 .. 10+size) and
 * never the header, and the whole message is 11 + size + 2 bytes.
 */
function buildDumpDefinitions(parameters) {
  const byBlock = new Map(BLOCK_DUMPS.map((row) => [row.dump, []]));
  const bases = BLOCK_DUMPS.map((row) => ({ ...row, base: addressFor(BLOCKS[row.block], '00 00') }));

  for (const parameter of parameters) {
    if (!parameter.address) continue; // master.volume is CC 7 — it is not in any dump
    // The block a parameter belongs to is the one whose base it sits at or past, by less than that
    // block's size. Checking the size and not just the next base is what catches a parameter that
    // has fallen into the gap between two blocks rather than filing it under the earlier one.
    let owner = null;
    for (const row of bases) {
      const delta = addressDelta(row.base, parameter.address);
      if (delta < 0) continue;
      if (delta >= flatSize(BLOCK_SIZES[row.sizeKey])) continue;
      owner = { row, delta };
      break;
    }
    if (!owner) throw new Error(`${parameter.id} at ${parameter.address} is inside no dumpable block`);
    byBlock.get(owner.row.dump).push({ parameter: parameter.id, offset: owner.delta });
  }

  return bases.map((row) => {
    const size = flatSize(BLOCK_SIZES[row.sizeKey]);
    const mappings = byBlock.get(row.dump);
    if (mappings.length === 0) throw new Error(`dump ${row.dump} would carry no parameters`);
    return {
      id: row.dump,
      name: row.name,
      kind: 'sysex',
      // A DT1 addressed at this block's base. The address is part of the MATCHER rather than a
      // field to read afterwards, so a Tone 2 reply can never be applied as Tone 1's.
      matcher: {
        prefix: ['F0', MODEL.manufacturer, '$deviceId', ...MODEL.modelId, MODEL.dt1,
          ...row.base.split(' ')],
        suffix: ['F7'],
      },
      payload: { offset: 11, size },
      checksum: { type: 'roland-7bit', fromOffset: 7, toOffset: 10 + size, byteOffset: 11 + size },
      completion: { expectedMessages: 1, expectedBytes: 11 + size + 2 },
      requestRecipe: requestIdFor(row.dump),
      mappings,
    };
  });
}

/**
 * The preset banks, from the Bank Select table on p6 of the MIDI implementation.
 *
 * No patch NAMES. The MIDI implementation lists the banks and their program ranges and never
 * prints the factory patch names, so none are invented — a catalogue of plausible-looking names
 * would display confidently wrong titles for all 64 preset slots.
 *
 * The front panel numbers each bank A-1 .. H-8 (eight groups of eight). That is a display
 * convention over the same program numbers, not a second address, so it is not modelled as one.
 */
function buildPresets() {
  const bank = (id, label, role, startSlot, slotCount, bankMsb, bankLsb) => ({
    id, label, role, writable: role === 'user', startSlot, slotCount, programBase: 0, bankMsb, bankLsb,
  });
  return {
    banks: [
      bank('user', 'User Patch', 'user', 0, 64, 87, 0),
      bank('usb', 'USB Memory Patch', 'user', 64, 64, 87, 32),
      bank('preset', 'Preset Patch', 'factory', 128, 64, 87, 64),
      bank('preset-pcm', 'Preset PCM Patch', 'factory', 192, 8, 88, 64),
    ],
    // Bank Select MSB, LSB, then the Program Change — the GAIA has four banks, so a bare PC would
    // recall whichever one it happened to be sitting in.
    recall: { kind: 'bankPc' },
  };
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
      const { section, leaf } = splitName(entry.name);
      const SECTION_LABEL = { osc: 'OSC', filter: 'Filter', amp: 'Amp', lfo: 'LFO', modLfo: 'Mod LFO' };
      parameters.push(buildParameter(entry, {
        idPrefix: `tone${tone}`,
        // Grouped per tone AND per section, so a panel can lay out "Tone 2 · Filter" as a block
        // without inspecting parameter ids.
        group: `Tone ${tone} · ${SECTION_LABEL[section] ?? 'Misc'}`,
        blockOffset: BLOCKS[`tone${tone}`],
        inbound: TONE_INBOUND[`${section}.${leaf}`]?.(tone),
      }));
    }
  }

  for (const { block, prefix, group, table } of EXTRA_BLOCKS) {
    for (const entry of table) {
      // The owner's manual's range, where it has one. The address map carries the CONTAINER, which
      // is all the MIDI implementation prints; narrowing it here keeps each document's contribution
      // separate — address-map.mjs stays a transcription of the one manual, and the overlay is
      // visibly from the other.
      const narrowed = mfxRangeFor(block, mfxSlotOf(entry.name));
      parameters.push(buildParameter(narrowed ? { ...entry, ...narrowed } : entry,
        { idPrefix: prefix, group, blockOffset: BLOCKS[block] }));
    }
  }

  // The arpeggio pattern: sixteen lanes of thirty-two steps. 528 addresses, emitted the same way
  // the three tones are — one table against sixteen bases — because that is what it is.
  for (let note = 1; note <= 16; note++) {
    for (const entry of PATCH_ARPEGGIO_PATTERN) {
      parameters.push(buildParameter(entry, {
        idPrefix: `arpPattern.note${note}`,
        group: `Arpeggio Pattern · Note ${note}`,
        blockOffset: BLOCKS[`arpeggioPattern${note}`],
      }));
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
      // No requestDeviceId: the engine then addresses the inquiry to 0x7F, the Universal Device
      // Inquiry's ALL CALL, which every instrument answers whatever its own device number is.
      // This said '$deviceId' (0x10) and worked only because the GAIA it was tested against
      // happened to be set to device 17 — its reply carried 0x10 in the same byte. Any GAIA on a
      // different device number would have gone silent, and Test would have blamed the cable.
      manufacturerId: [MODEL.manufacturer],
      familyCode: ['41', '02'],
      modelNumber: ['00', '00'],
      // NO revision, deliberately. DeviceProfileEngine compares revision byte-for-byte when the
      // profile declares one, and reports it either way — so declaring it turns a firmware version
      // into part of the instrument's identity. A real SH-01 answered
      //   F0 7E 10 06 02 41 41 02 00 00 00 03 00 01 F7
      // whose manufacturer, family and model match this profile exactly and whose revision is
      // 00 03 00 01. Pinning 00 03 00 00 made that unit "the wrong instrument". Manufacturer,
      // family and model say WHICH synth; revision says which firmware, and an editor that refuses
      // to talk to a synth for having been updated is wrong about what identity means.
      timeoutMs: 1000,
      retries: 0,
    },
    coverage: {
      // Honest about what is and is not built. Every block the manual prints an address map for is
      // transcribed, including all sixteen arpeggio pattern lanes, and each one's reply is parsed
      // back into its parameters. Saying "broad" here would be the same lie the 15-parameter
      // profile told by omission.
      singleParameterWrite: 'complete-for-every-block-in-the-address-map',
      editBufferDumpRequest: 'block-rq1-per-block',
      // 792 of the 793 parameters are mapped into a dump. The one that is not is Master Volume,
      // which is CC 7 and has no address to appear at.
      editBufferDumpParse: 'complete-for-every-block-in-the-address-map',
      // The USER PATCH area at 20 nn 00 00 is addressable and this profile does not request it.
      // Requesting all 64 slots is 64 x 26 round trips and a librarian's job, not an editor's.
      bankDump: 'notImplemented',
      patchNameEdit: 'complete-single-dt1-write',
      realtimeEditing: 'complete-for-transcribed-blocks',
      notTranscribed: [],
      // The arpeggio pattern IS here now — sixteen lanes at 00 0D 00 .. 00 1C 00, each an original
      // note plus thirty-two step slots, 528 addresses. An earlier draft left them out on the
      // grounds that "they are addresses, not controls". That was backwards: they are exactly what
      // a step grid writes, and leaving them out is what made a graphical arpeggiator impossible
      // to wire. Whether a given editor drives them one DT1 at a time or with a block dump is a
      // panel's decision; the profile's job is to know where they live.
      //
      // The one gap that remains, stated rather than papered over: the effect parameters are named
      // as the manual names them ("Flanger Parameter 3"). What each one DOES depends on the
      // selected type, and that mapping — including which three become the front panel's
      // CONTROL 1/2/3 — is in the owner's manual, not the MIDI implementation. Renaming them from
      // a guess would be worse than leaving them factual.
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
      //
      // The response is `bulkDump` naming the definition that parses it, NOT `dt1` with an
      // address. `dt1` said only "a reply will arrive at this address" and stopped there: the
      // request went out, the synth answered with the whole block, and every byte of it was
      // dropped. That is what made this an editor that could only write — you could not open it on
      // a patch already in the machine. The dump ids come from the same table as the definitions.
      ...BLOCK_DUMPS.map((row) => ({
        id: requestIdFor(row.dump),
        name: `Request ${row.block}`,
        kind: 'sysex',
        template: rq1Template(addressFor(BLOCKS[row.block], '00 00'), BLOCK_SIZES[row.sizeKey]),
        address: addressFor(BLOCKS[row.block], '00 00'),
        size: BLOCK_SIZES[row.sizeKey],
        response: { kind: 'bulkDump', dump: row.dump },
        timeoutMs: 1000,
        retries: 1,
      })),
    ],
    startup: {
      policy: 'pull',
      syncDirection: 'pull',
      // Every block, including the sixteen arpeggio lanes. A partial pull is worse than an obvious
      // one: the panel would open showing the synth's real filter next to a step grid holding
      // whatever the profile's defaults are, with nothing on screen saying which half is live.
      sync: [
        { request: 'identityRequest' },
        ...BLOCK_DUMPS.map((row) => ({ request: requestIdFor(row.dump) })),
      ],
    },
    parameters,
    tests: buildTests(deviceId, parameters),
    dumpDefinitions: buildDumpDefinitions(parameters),
    presets: buildPresets(),
  };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const out = path.resolve(REPO, args.find((a) => !a.startsWith('--')) ?? DEFAULT_OUT);
  const json = `${JSON.stringify(buildProfile(), null, 2)}\n`;

  if (check) {
    if (readCommitted(out) === json) { console.log('Gaia profile is up to date.'); return; }
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
