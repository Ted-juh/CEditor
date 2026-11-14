// Moog Subharmonicon: the MIDI CC messages of its manual (pp. 41-43).
export default {
  id: 'moog-subharmonicon',
  name: 'Moog Subharmonicon',
  family: 'Subharmonicon',
  description: 'Moog Subharmonicon semi-modular polyrhythmic analog synthesizer: the MIDI CC table of its manual.',
  documents: [{ title: 'Subharmonicon Manual', file: 'Subharmonicon_Manual AMZ.pdf', url: 'https://cdn.inmusicbrands.com/Moog/Subharmonicon/Subharmonicon_Manual%20AMZ.pdf' }],
  tables: [{ kind: 'cc', pages: [41, 42, 43], columns: [['name', 'Parameter'], ['cc', 'MIDI CC#'], ['default', 'Default'], ['values', 'Range'], ['notes', 'Remarks']] }],
};
