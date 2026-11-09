// The Roland V-Synth (2003): which parts of its address map make up the edit buffer, and what to
// call them.
//
// Source: the V-Synth Owner's Manual (maps/v-synth.json says which file, with its hash), whose
// "MIDI Implementation" chapter (pp. 153-170, the chart on p171) is dated Nov. 20, 2002, version
// 1.00, at its head (p153). The map was read from the whole owner's manual, so page numbers below
// are the owner's manual's: the address map is pp. 159-167.
//
// The V-Synth XT prints the same address map with three blocks more; the layout the two share, and
// what it leaves out, is in ../layouts/v-synth.mjs. This file is what is the V-Synth's own.

import { presets, sharedCoverage, sharedNotes, vSynthBlocks } from '../layouts/v-synth.mjs';

export default {
  id: 'roland-v-synth',
  name: 'Roland V-Synth',
  family: 'V-Synth',
  map: 'v-synth',
  deviceId: 0x10,
  description: 'Roland V-Synth (2003) elastic-audio synthesizer: the setup and system blocks and Part 1\'s temporary patch — '
    + 'common, MFX, chorus, reverb, controller, sixteen zones of oscillators, envelopes, LFOs and two COSMs, and sixteen '
    + 'arpeggio notes — from the MIDI Implementation chapter of the owner\'s manual.',

  // p158, Identity Reply Message: F0 7E dev 06 02 41 53 01 00 00 00 01 00 00 F7 — family code
  // 53 01, family number 00 00, software revision 00 01 00 00. The message line and the byte table
  // agree. The V-Synth XT's manual (p6) prints the same reply byte for byte, revision included, so
  // the identity reply cannot tell the two apart; see notes.
  identity: { familyCode: ['53', '01'], modelNumber: ['00', '00'] },

  blocks: vSynthBlocks({ xt: false }),

  // p169, "Example of an Exclusive Message and Calculating a Checksum", <Example1> "Setting CHORUS
  // TYPE of PATCH to CHORUS 1 (DT1)": Temporary Patch (Part 1) 10 00 00 00 + Patch Chorus 00 04 00 +
  // Chorus Type 00 00, value 01. The manual's only DT1 parameter write; <Example2>-<Example4>
  // (p169-170) are RQ1s, and the scale-tune message (p170) is a GS DT1 outside this map.
  examples: [
    {
      name: 'Setting CHORUS TYPE of PATCH to CHORUS 1 (DT1)',
      where: 'p169',
      parameter: 'chorus.type',
      value: 1,
      expectedHex: 'F0 41 10 00 53 12 10 00 04 00 01 6B F7',
    },
  ],

  presets,

  coverage: {
    ...sharedCoverage,
    inboundControllers: 'not modelled: what the D Beam, Time Trip Pad, knobs and pedals transmit (Data Transmission, p157-158) is not mapped yet',
  },
  notes: [
    ...sharedNotes,
    'Identity: the V-Synth (owner\'s manual p158) and the V-Synth XT (its MIDI Implementation p6) print the same Identity Reply, '
      + 'F0 7E dev 06 02 41 53 01 00 00 00 01 00 00 F7 — family code 53 01, family number 00 00, revision 00 01 00 00 — and the same '
      + 'model ID, 00 53. Nothing in the reply tells them apart, so either profile matches either instrument; the XT\'s address map has '
      + 'three blocks this one has not (System Controller 2 (XT), Patch Controller 2 (XT), Patch Step Modulator).',
    'The address map is the V-Synth XT\'s less those three blocks, with a reserved byte at Patch Common 00 0C (the XT\'s Patch Category), '
      + 'Patch Oscillator ending at 00 78 (00 00 00 79; the XT adds a detune and a sub-oscillator per OSC), Analog Waveform 0 - 8, '
      + 'Matrix Control Dest 0 - 77 and COSM Type 0 - 15 (the XT: 0 - 13, 0 - 78, 0 - 16).',
    'p169 <Example2> computes the RQ1 for PATCH MFX of PATCH:003 and writes "117 (sum) ÷ 128" for a sum it has just given as 41; its '
      + 'message, F0 41 10 00 53 11 20 02 02 00 00 00 01 04 57 F7, agrees with the map. p170 <Example4> calls the last part "Temporary '
      + 'Patch (Port 16)".',
    'The Receive Data section (p153) says channel messages are "Not received in Multitimbre mode or Performance mode when the Receive '
      + 'Switch parameter (MULTITIMBRE/MIDI or PERFORM/MIDI) is OFF"; the V-Synth has neither mode, and its receive switches are System '
      + 'Common\'s Part 1-16 Receive Switch (00 0C - 00 2A).',
  ],

  // The MIDI Implementation chapter's own date and version (p153); the map's cover fields are the
  // owner's manual's, which carry none.
  manual: { model: 'V-Synth', date: 'Nov. 20, 2002', version: '1.00' },
};
