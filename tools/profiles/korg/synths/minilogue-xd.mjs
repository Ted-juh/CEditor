// minilogue xd. KORG minilogue xd MIDI Implementation, Revision 1.01 (2020.2.10): the control
// changes it recognises (2-1), the ones it sends (1-1), and its NRPNs (*3).

export default {
  id: 'korg-minilogue-xd',
  name: 'Korg minilogue xd',
  family: 'logue',
  description: 'Korg minilogue xd, every control change and NRPN in its MIDI Implementation.',
  document: {
    title: 'minilogue xd MIDI Implementation',
    file: 'minilogue_xd__MIDIImp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/811/4440/',
  },
  // REVERB SUB TYPE (CC 90) points at *6-14; its footnote is printed as *5-14, between *6-13 and
  // *6-15, and the received table has no other *5-14.
  markFor: { '6-14': '5-14' },
  markWhy: { '6-14': 'printed between *6-13 and *6-15 as *5-14, a number the receive table uses for nothing else' },
  notes: [
    'MOD FX SUB TYPE (CC 96) depends on MOD FX TYPE, and MULTI SUB TYPE SELECT (CC 103) on MULTI TYPE, so both are numbers with their lists in the description. The document\'s transmitted values for the USER sub types end at 128, which is not a MIDI value.',
  ],
  groups: [
    ['Oscillator 1', /^VCO 1\s+/],
    ['Oscillator 2', /^VCO 2\s+/],
    ['Oscillators', /^(CROSS MOD DEPTH|SYNC|RING)$/],
    ['Multi Engine', /^(MULTI\s+|VPM PARAM|USER PARAM)/],
    ['Filter', /^(CUTOFF|RESONANCE)\b/],
    ['Amp Envelope', /^AMP EG\s+/],
    ['Envelope', /^EG\s+/],
    ['LFO', /^LFO\s+/],
    ['Effects', /^(MOD FX|DELAY|REVERB)\s+/],
    ['Voice', /^(VOICE MODE|PORTAMENTO MODE|PORTAMENTO BPM SYNC|PROGRAM LEVEL|Program Transpose|MICRO TUNING|SCALE KEY|PROGRAM TUNING|AMP VELOCITY|BEND RANGE)\b/],
    ['Controllers', /^(Modulation[12]|PORTAMENTO$|DAMPER|JOYSTICK|CV IN)/],
    ['Global', /^MASTER VOLUME$/],
  ],
};
