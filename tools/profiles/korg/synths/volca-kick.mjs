// volca kick. KORG volca kick MIDI Implementation, Revision 1.00 (2016.07.25): the control changes it recognises.

export default {
  id: 'korg-volca-kick',
  name: 'Korg volca kick',
  family: 'volca',
  description: 'Korg volca kick, every control change in its MIDI Implementation.',
  document: {
    title: 'volca kick MIDI Implementation',
    file: 'volca_kick_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/726/3441/',
  },
  noIdentity: 'the instrument has no MIDI Out, so it cannot answer a Device Inquiry',
  groups: [
    ['Pulse', /^PULSE\s+/],
    ['Amp', /^(AMP\s+|DRIVE|TONE|ACCENT)/],
    ['Resonator', /^RESONATOR\s+/],
  ],
};
