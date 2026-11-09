// volca nubass. KORG volca nubass MIDI Implementation, Revision 1.00: the control changes it recognises.

export default {
  id: 'korg-volca-nubass',
  name: 'Korg volca nubass',
  family: 'volca',
  description: 'Korg volca nubass, every control change in its MIDI Implementation.',
  document: {
    title: 'volca nubass MIDI Implementation',
    file: 'volca_nubass_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/820/5700/',
  },
  noIdentity: 'the instrument has no MIDI Out, so it cannot answer a Device Inquiry',
  groups: [
    ['VTO', /^VTO\s+/],
    ['VCF', /^VCF\s+/],
    ['LFO', /^LFO\s+/],
  ],
};
