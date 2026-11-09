// volca beats. KORG volca beats MIDI Implementation, Revision 0.01 (2013.06.23): the control changes it recognises.

export default {
  id: 'korg-volca-beats',
  name: 'Korg volca beats',
  family: 'volca',
  description: 'Korg volca beats, every control change in its MIDI Implementation.',
  document: {
    title: 'volca beats MIDI Implementation',
    file: 'volca_beats_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/141/2738/',
  },
  noIdentity: 'the instrument has no MIDI Out, so it cannot answer a Device Inquiry',
  groups: [
    ['Part Levels', /^PART LEVEL\b/],
    ['PCM Speed', /^PCM SPEED\b/],
    ['Decay', /^DECAY\b|^HAT GRAIN$/],
    ['Stutter', /^STUTTER\s+/],
  ],
};
