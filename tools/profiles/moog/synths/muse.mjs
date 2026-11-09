// Moog Muse: Appendix A, MIDI CC, of its manual (pp. 120-122).
export default {
  id: 'moog-muse',
  name: 'Moog Muse',
  family: 'Muse',
  description: 'Moog Muse bitimbral analog polysynth: the MIDI CC appendix of its manual.',
  documents: [{ title: 'Muse Manual 1.4.0', file: 'Muse_Manual-1.4.0.pdf', url: 'https://cdn.inmusicbrands.com/Moog/Muse/Muse_Manual-1.4.0.pdf' }],
  tables: [{ kind: 'cc', pages: [120, 121, 122], columns: [['cc', 'MIDI CC'], ['name', 'MUSE CONTROL'], ['values', 'RANGE']] }],
  notes: ['The appendix does not say which timbre a controller edits; the profile sends on one channel, the channel variable.'],
};
