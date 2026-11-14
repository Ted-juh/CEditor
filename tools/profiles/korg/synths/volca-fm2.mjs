// volca fm2. KORG volca fm2 MIDI Implementation, Revision 1.00 (2022.11.17): the control changes it recognises.

export default {
  id: 'korg-volca-fm2',
  name: 'Korg volca fm2',
  family: 'volca',
  description: 'Korg volca fm2, every control change in its MIDI Implementation.',
  document: {
    title: 'volca fm2 MIDI Implementation',
    file: 'volca_fm2_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/892/4952/',
  },
  groups: [
    ['Operators', /^(MODULATOR|CARRIER)\s+/],
    ['LFO', /^LFO\s+/],
    ['Arpeggiator', /^ARP\s+/],
    ['Effects', /^(REVERB|CHORUS)\s+/],
    ['Voice', /^(OCTAVE|VELOCITY|ALGTM)$/],
  ],
};
