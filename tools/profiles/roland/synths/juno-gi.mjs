// The Roland JUNO-Gi: which parts of its address map make up the edit buffer, and what to call them.
//
// Source: "JUNO-Gi MIDI Implementation", version 1.00, June 1 2010 (maps/juno-gi.json says which
// file, with its hash). Page numbers below are that document's.
//
// The JUNO-Gi is not the JUNO-Di with a recorder: it has a model ID of its own (00 00 4C) and an
// address map of its own (p10), built around Live Sets rather than Performances:
//
//   01 00 00 00  Setup                 four "Sides", each a sound mode, a Live Set, a Studio Set
//   02 00 00 00  System                common, mastering (a three-band EQ), controller
//   04 00 00 00  Solo Synth            a two-oscillator monophonic synth: one block, neither a
//                                      temporary area nor a memory
//   10 00 00 00  Temporary Live Set    common, MFX 1 and 2, chorus, reverb, four Layers each with a
//                                      Tone Offset block, controller (arpeggio, chord, split)
//   18 00 00 00  Temporary Studio Set  common, chorus, reverb, and for each of sixteen parts a MIDI
//                                      block, a Part block and a Tone Offset block
//   20 00 00 00  User Live Set (0001 - 0256)
//
// There is no temporary tone. A layer or a part names its tone by Bank Select and program number
// (Tone Bank Select MSB/LSB, Tone Program Number) and adjusts it with a Tone Offset block — an
// offset to the preset's own cutoff, envelopes, LFOs, with TONE meaning "as the tone has it" — but
// the tone's own parameters are not in the address map. So the edit buffer is the two temporary
// sets, the Setup, the System and the Solo Synth, and every block of them is laid out here.

// Nothing of the JUNO-DS family's layout applies; only its bank-table helpers are borrowed.
import { banks, bankRun } from '../layouts/juno-ds-family.mjs';

const N4 = [1, 2, 3, 4];
const N16 = Array.from({ length: 16 }, (unused, i) => i + 1);
const LIVE = 'Temporary Live Set';
const STUDIO = 'Temporary Studio Set';

// `Part Mono/Poly (MONO ON/POLY ON)`: the bracket names the MIDI messages, as (CC# n) does elsewhere.
const PART_STRIP = /^Part\s+|\s*\(MONO ON\/POLY ON\)/g;

/** 1-based, three digits as the manual's NUMBER column prints them (001 - 128, 1281 - 1298). */
const number = (n) => String(n).padStart(3, '0');

export default {
  id: 'roland-juno-gi',
  name: 'Roland JUNO-Gi',
  family: 'JUNO',
  map: 'juno-gi',
  deviceId: 0x10,
  description: 'Roland JUNO-Gi mobile synthesizer with digital recorder: the temporary Live Set (common, effects, four '
    + 'layers with their tone offsets, controller), the temporary Studio Set (common, effects, and every part\'s MIDI, '
    + 'Part and Tone Offset blocks) and the Solo Synth, from the temporary (edit-buffer) area of the MIDI Implementation.',

  // p9, Identity Reply Message (JUNO-Gi): F0 7E dev 06 02 41 4C 02 00 00 00 03 00 00 F7 — family
  // code 4C 02, family number 00 00. The status line and the byte table agree.
  identity: { familyCode: ['4C', '02'], modelNumber: ['00', '00'] },

  blocks: [
    { id: 'setup', table: 'Setup', path: ['Setup'], group: 'Setup', system: true },
    { id: 'system', table: 'System Common', path: ['System', 'System Common'], group: 'System', system: true },
    { id: 'systemMastering', table: 'System Mastering', path: ['System', 'System Mastering'], group: 'System · Mastering', system: true },
    { id: 'systemController', table: 'System Controller', path: ['System', 'System Controller'], group: 'System · Controller', system: true },

    { id: 'liveSet', table: 'Live Set Common', path: [LIVE, 'Live Set Common'], group: 'Live Set · Common', strip: /^Live Set\s+/ },
    { id: 'liveSet.mfx1', table: 'Live Set Common MFX', path: [LIVE, 'Live Set Common MFX1'], group: 'Live Set · MFX 1', strip: /^MFX\s+/ },
    { id: 'liveSet.mfx2', table: 'Live Set Common MFX', path: [LIVE, 'Live Set Common MFX2'], group: 'Live Set · MFX 2', strip: /^MFX\s+/ },
    { id: 'liveSet.chorus', table: 'Live Set Common Chorus', path: [LIVE, 'Live Set Common Chorus'], group: 'Live Set · Chorus', strip: /^Chorus\s+/ },
    { id: 'liveSet.reverb', table: 'Live Set Common Reverb', path: [LIVE, 'Live Set Common Reverb'], group: 'Live Set · Reverb', strip: /^Reverb\s+/ },
    ...N4.map((n) => ({
      id: `liveSet.layer${n}`, table: 'Live Set Layer', path: [LIVE, `Live Set Layer (Layer ${n})`], group: `Live Set · Layer ${n}`, strip: /^Layer\s+/,
    })),
    ...N4.map((n) => ({
      id: `liveSet.layer${n}.toneOffset`, table: 'Live Set Tone Offset', path: [LIVE, `Live Set Tone Offset (Layer ${n})`], group: `Live Set · Layer ${n} · Tone Offset`, strip: /^Layer\s+/,
    })),
    { id: 'liveSet.controller', table: 'Live Set Controller', path: [LIVE, 'Live Set Controller'], group: 'Live Set · Controller' },

    // Read before the Studio Set: the manual does not say whether the Temporary Studio Set answers
    // while the instrument is in Live mode, and if it does not, the startup read stops there.
    { id: 'soloSynth', table: 'Solo Synth', path: ['Solo Synth'], group: 'Solo Synth' },

    { id: 'studioSet', table: 'Studio Set Common', path: [STUDIO, 'Studio Set Common'], group: 'Studio Set · Common', strip: /^Studio Set\s+/ },
    { id: 'studioSet.chorus', table: 'Studio Set Common Chorus', path: [STUDIO, 'Studio Set Common Chorus'], group: 'Studio Set · Chorus', strip: /^Chorus\s+/ },
    { id: 'studioSet.reverb', table: 'Studio Set Common Reverb', path: [STUDIO, 'Studio Set Common Reverb'], group: 'Studio Set · Reverb', strip: /^Reverb\s+/ },
    ...N16.map((n) => ({
      id: `studioSet.midi${n}`, table: 'Studio Set MIDI', path: [STUDIO, `Studio Set MIDI (Channel ${n})`], group: `Studio Set · MIDI Ch ${n}`,
    })),
    ...N16.map((n) => ({
      id: `studioSet.part${n}`, table: 'Studio Set Part', path: [STUDIO, `Studio Set Part (Part ${n})`], group: `Studio Set · Part ${n}`, strip: PART_STRIP,
    })),
    ...N16.map((n) => ({
      id: `studioSet.part${n}.toneOffset`, table: 'Studio Set Tone Offset', path: [STUDIO, `Studio Set Tone Offset (Part ${n})`], group: `Studio Set · Part ${n} · Tone Offset`, strip: /^Part\s+/,
    })),

  ],

  // p22, "Example of an Exclusive Message and Calculating a Checksum": Chorus Type of the Live Set
  // Common set to DELAY (02) — the manual's only DT1 parameter write. (The Scale Tune message beside
  // it is a GS DT1, model 42, outside this address map.)
  examples: [
    {
      name: 'Setting CHORUS TYPE of LIVE SET COMMON to DELAY (DT1)',
      where: 'p22',
      parameter: 'liveSet.chorus.type',
      value: 2,
      expectedHex: 'F0 41 10 00 00 4C 12 10 00 04 00 02 6A F7',
    },
  ],

  // p1, the Live Set Bank Select table (MSB 84). The table elides Preset Live Set LSB 66-73 with ":"
  // between LSB 65 (129 - 256) and LSB 74 (1281 - 1298); the numbering closes on it, so each is 128
  // and the last 18. The Special Live Sets (LSB 75) are 81.
  presets: {
    banks: banks([
      ['user-live-set-1', 'User Live Set 001-128', 'user', 84, 0, 128],
      ['user-live-set-2', 'User Live Set 129-256', 'user', 84, 1, 128],
      ...bankRun('preset-live-set', (i) => `Preset Live Set ${number(i * 128 + 1)}-${number(Math.min(i * 128 + 128, 1298))}`, 'factory', 84, 64, 74, 128, 18),
      ['special-live-set', 'Special Live Set 001-081', 'factory', 84, 75, 81],
    ]),
    recall: { kind: 'bankPc' },
  },

  coverage: {
    effectParameterMeanings: 'type-dependent: MFX, chorus and reverb parameters are Roland\'s 4-nibble container '
      + '(12768-52768, shown -20000..+20000); what each slot does depends on the selected type, which the MIDI Implementation does not list',
    inboundControllers: 'not modelled: what the front panel transmits as CC is not mapped yet',
    tones: 'not in the address map: layers and parts select preset tones by Bank Select and offset them (Tone Offset blocks, laid out); the tones\' own parameters are not addressable',
    notModelled: 'the User Live Sets (20 00 00 00 to 21 7F 00 00); nothing else in the map is left out',
  },
  notes: [
    'Every block of the temporary area is laid out: the Temporary Live Set (10 00 00 00) and Temporary Studio Set (18 00 00 00) whole, '
      + 'the Setup (01 00 00 00), the System (02 00 00 00: common, mastering, controller) and the Solo Synth (04 00 00 00). Only the '
      + '256 User Live Sets (20 00 00 00 to 21 7F 00 00, the Temporary Live Set\'s layout each) are left out, as memories, not edit buffer.',
    'There is no temporary tone, so nothing for noPull: the map has no tone parameters at all. A Live Set layer or a Studio Set part '
      + 'names a preset tone by Bank Select (Tone Bank Select MSB/LSB, Tone Program Number: MSB 87 LSB 0-6 tones, 86 rhythms, 0-63 and 121 GM, '
      + '120 GM rhythms; p1) and its Tone Offset block adjusts it, TONE meaning the tone\'s own value.',
    'Presets list the Live Sets (Bank Select MSB 84, p1), recalled on the profile\'s channel, which must be the Live Set Main Channel '
      + '(System Common 02 00 00 0B) for a Live Set to change. Tones (MSB 86/87, p1) are chosen per Studio Set part on other channels and are not listed.',
    'Rows the manual prints with a range and no name (p12-17) are laid out under their offset: Live Set Common 00 39-00 40, '
      + 'Live Set Layer 00 2F-00 30 (two OFF/ON switches between Receive Modulation and Receive Expression, where the Studio Set Part '
      + 'has Receive Volume and Receive Pan) and 00 3A-00 41, Live Set Controller 00 1B-00 22, Studio Set Common 00 10 and 00 28-00 37.',
    'The Studio Set has MFX settings and no MFX: its Common has MFX1-3 Control Channel and an MFX Structure (1-16), and each part an '
      + 'Output MFX Select (MFX1-MFX3), but its offset table (p10) lists Common, Chorus (00 04 00) and Reverb (00 06 00) and no MFX block, '
      + 'where the Live Set\'s lists MFX1 at 00 02 00 and MFX2 at 00 08 00. Nothing is laid out at the Studio Set\'s 00 02 00.',
    'The Setup prints "Live Mode Octave Shift" and "Live Mode Keyboard Range Lower/Upper" without the "Side n" the rows around them carry; '
      + 'they are numbered 1-4 in printed order, which is Side 1-4. Both Tone Offset tables print "TVF Cutoff Velocty Sens" (sic).',
  ],
};
