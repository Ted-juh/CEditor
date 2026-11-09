// SYSTEM-1 (AIRA). MIDI Implementation Chart, version 1.10, Jul. 25, 2014.
//
// The chart prints OSC1 TYPE for both CC 46 and CC 61. Every other oscillator control comes in a
// pair, OSC1 at one number and OSC2 at another (RANGE 47/62, MOD 60/63, COLOR 50/55), so CC 61 is
// most likely OSC2 TYPE — but that is an inference, and the parameter keeps the printed name with
// its number until an instrument settles it.

export default {
  id: 'roland-system-1',
  name: 'Roland SYSTEM-1',
  family: 'AIRA',
  chart: 'system-1',
  description: 'Roland AIRA SYSTEM-1, from the control changes in its MIDI Implementation Chart.',
  names: {
    5: { name: 'PORTAMENTO', why: 'printed "PORTAMNETO", a misprint' },
  },
  descriptions: {
    61: 'Printed as OSC1 TYPE, the same name as CC 46. By the chart\'s other oscillator pairs (RANGE 47/62, MOD 60/63, COLOR 50/55) this is probably OSC2 TYPE; unconfirmed.',
  },
  groups: [
    ['Oscillator 1', /^OSC1\s+/],
    ['Oscillator 2', /^OSC2\s+/],
    ['Mixer', /^MIXER\s+/],
    ['Pitch', /^PITCH\s+/],
    ['Filter', /^(FILTER\s+|LPF CUTOFF$|HPF CUTOFF$|RESO$)/],
    ['Amp', /^AMP\s+/],
    ['LFO', /^LFO\s+/],
    ['Effects', /^(DELAY|DELAY TIME|REVERB)$/],
    ['Performance', /^(MOD|PORTAMENTO|PEDAL CONTROL|PEDAL HOLD|LEGATO|TEMPO SYNC|MONO)$/],
  ],
  presets: {
    banks: [{ id: 'patch', label: 'Patch', role: 'user', writable: false, startSlot: 0, slotCount: 8, programBase: 0 }],
    recall: { kind: 'pc' },
  },
  notes: ['Program Change: received only, 0 - 7 (chart, True Number).'],
};
