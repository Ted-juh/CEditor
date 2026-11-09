// The Roland V-Synth XT (2005), the V-Synth in a rack: which parts of its address map make up the
// edit buffer, and what to call them.
//
// Source: "V-Synth XT MIDI Implementation", version 1.00, Mar. 24 2005 (maps/v-synth-xt.json says
// which file, with its hash; the importer read the version and not the date). Page numbers below are
// that document's: the address map is pp. 7-16.
//
// The V-Synth prints the same address map, less three blocks; the layout the two share, and what it
// leaves out, is in ../layouts/v-synth.mjs. This file is what is the XT's own: its three blocks
// (System Controller 2 (XT), Patch Controller 2 (XT), Patch Step Modulator), its pages, and the
// slips of its manual.

import { presets, sharedCoverage, sharedNotes, vSynthBlocks } from '../layouts/v-synth.mjs';

export default {
  id: 'roland-v-synth-xt',
  name: 'Roland V-Synth XT',
  family: 'V-Synth',
  map: 'v-synth-xt',
  deviceId: 0x10,
  description: 'Roland V-Synth XT elastic-audio synthesizer module: the setup and system blocks (with the XT\'s knob sets) and '
    + 'Part 1\'s temporary patch — common, MFX, chorus, reverb, controllers, step modulator, sixteen zones of oscillators, '
    + 'envelopes, LFOs and two COSMs, and sixteen arpeggio notes — from the MIDI Implementation.',

  // p6, Identity Reply Message: F0 7E dev 06 02 41 53 01 00 00 00 01 00 00 F7 — family code 53 01,
  // family number 00 00, software revision 00 01 00 00. The message line and the byte table agree,
  // and both are the V-Synth's (owner's manual p158) byte for byte, so the identity reply cannot
  // tell the two apart; see notes.
  identity: { familyCode: ['53', '01'], modelNumber: ['00', '00'] },

  blocks: vSynthBlocks({ xt: true }),

  // p19, "Example of an Exclusive Message and Calculating a Checksum", <Example1> "Setting CHORUS
  // TYPE of PATCH to CHORUS 1 (DT1)": Temporary Patch (Part 1) 10 00 00 00 + Patch Chorus 00 04 00 +
  // Chorus Type 00 00, value 01 — the V-Synth's example, reprinted. The only DT1 parameter write;
  // <Example2>-<Example4> (p19-20) are RQ1s, and the scale-tune message (p20) is a GS DT1 outside
  // this map.
  examples: [
    {
      name: 'Setting CHORUS TYPE of PATCH to CHORUS 1 (DT1)',
      where: 'p19',
      parameter: 'chorus.type',
      value: 1,
      expectedHex: 'F0 41 10 00 53 12 10 00 04 00 01 6B F7',
    },
  ],

  presets,

  coverage: {
    ...sharedCoverage,
    inboundControllers: 'not modelled: what the D Beam, Time Trip Pad, knobs and pedals transmit (Data Transmission, p5-6) is not mapped yet',
  },
  notes: [
    ...sharedNotes,
    'Identity: the V-Synth XT (p6) and the V-Synth (its owner\'s manual p158) print the same Identity Reply, '
      + 'F0 7E dev 06 02 41 53 01 00 00 00 01 00 00 F7 — family code 53 01, family number 00 00, revision 00 01 00 00 — and the same '
      + 'model ID, 00 53; the XT\'s manual even keeps the V-Synth\'s headings ("V-Synth (ModelID = 00H 53H)", "Model ID #2 (V-Synth)", '
      + '"the V-Synth send this message"). Nothing in the reply tells them apart, so either profile matches either instrument; only this '
      + 'map has System Controller 2 (XT), Patch Controller 2 (XT) and Patch Step Modulator.',
    'Printed names kept as printed: "Analog Wavefrom" (Patch Oscillator 00 1E and 00 52; the V-Synth\'s manual spells it right).',
    'Patch Step Modulator (p16) prints "Track Loop Switch" once per track without the track number (00 03, 00 1B, 00 33, 00 4B); '
      + 'they are numbered 1-4 in printed order (stepMod.trackLoopSwitch1 … 4).',
    'p19 <Example2> computes the RQ1 for PATCH MFX of PATCH:003 and writes "117 (sum) ÷ 128" for a sum it has just given as 41; its '
      + 'message, F0 41 10 00 53 11 20 02 02 00 00 00 01 04 57 F7, agrees with the map. p20 <Example4> calls the last part "Temporary '
      + 'Patch (Port 16)".',
    'The Receive Data section (p1) says channel messages are "Not received in Multitimbre mode or Performance mode when the Receive '
      + 'Switch parameter (MULTITIMBRE/MIDI or PERFORM/MIDI) is OFF"; the XT has neither mode, and its receive switches are System '
      + 'Common\'s Part 1-16 Receive Switch (00 0C - 00 2A).',
  ],

  // The manual's own date and version (its head, p1), which the importer read only half of.
  manual: { date: 'Mar. 24, 2005', version: '1.00' },
};
