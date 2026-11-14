// volca keys. KORG volca keys MIDI Implementation, Revision 0.01 (2013.06.23): the control changes it recognises.

export default {
  id: 'korg-volca-keys',
  name: 'Korg volca keys',
  family: 'volca',
  description: 'Korg volca keys, every control change in its MIDI Implementation.',
  document: {
    title: 'volca keys MIDI Implementation',
    file: 'volca_keys_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/138/2739/',
  },
  noIdentity: 'the instrument has no MIDI Out, so it cannot answer a Device Inquiry',
  groups: [
    ['Voice', /^(VOICE|OCTAVE|DETUNE|VCO EG INT)$/],
    ['Filter', /^(CUTOFF|VCF EG INT)$/],
    ['LFO', /^LFO\s+/],
    ['Envelope', /^EG\s+/],
    ['Delay', /^DELAY\s+/],
    ['Controllers', /^(PORTAMENTO|EXPRESSION)$/],
  ],
};
