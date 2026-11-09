// volca bass. KORG volca bass MIDI Implementation, Revision 0.01 (2013.06.23): the control changes it recognises.

export default {
  id: 'korg-volca-bass',
  name: 'Korg volca bass',
  family: 'volca',
  description: 'Korg volca bass, every control change in its MIDI Implementation.',
  document: {
    title: 'volca bass MIDI Implementation',
    file: 'volca_bass_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/140/2737/',
  },
  descriptions: {
    cc47: 'Printed "EG DECAT/RELEASE"; the volca keys prints the same control as EG DECAY/RELEASE.',
  },
  noIdentity: 'the instrument has no MIDI Out, so it cannot answer a Device Inquiry',
  groups: [
    ['Oscillators', /^(VCO PITCH|OCTAVE)\b/],
    ['LFO', /^LFO\s+/],
    ['Envelope', /^(EG|CUTOFF EG|GATE TIME)\b/],
    ['Controllers', /^(SLIDE TIME|EXPRESSION)$/],
  ],
};
