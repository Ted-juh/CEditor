// NTS-1 digital kit (the first). KORG NTS-1 digital kit MIDI Implementation, Version 1.00
// (2021.10.04): the control changes it recognises (2-1) and the ones it sends (1-1). It has no NRPNs
// and no program dump; its SysEx is for the user oscillator and effect slots.

export default {
  id: 'korg-nts-1',
  name: 'Korg NTS-1',
  family: 'NTS',
  description: 'Korg NTS-1 digital kit (the first), every control change in its MIDI Implementation.',
  document: {
    title: 'NTS-1 digital kit MIDI Implementation',
    file: 'NTS-1_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/832/4831/',
  },
  groups: [
    ['Oscillator', /^OSCILLATOR\s+/],
    ['Filter', /^FILTER\s+/],
    ['Envelope', /^EG\s+/],
    ['Tremolo', /^TREMOLO\s+/],
    ['Modulation', /^MOD FX\s+/],
    ['Delay', /^DELAY FX\s+/],
    ['Reverb', /^REVERB FX\s+/],
    ['Arpeggiator', /^ARP\s+/],
  ],
};
