// Moog Taurus 3: the MIDI CC messages of its manual (pp. 51-52 as printed).
export default {
  id: 'moog-taurus-3',
  name: 'Moog Taurus 3',
  family: 'Taurus',
  description: 'Moog Taurus 3 analog bass pedal synthesizer: the MIDI CC table of its manual.',
  documents: [{ title: 'Taurus 3 User\'s Manual', file: 'Taurus_3_Manual.pdf', url: 'https://cdn.inmusicbrands.com/Moog/BackOffice/Taurus_3_Manual.pdf' }],
  tables: [{ kind: 'cc', pages: [49, 50, 51], columns: [['section', 'SECTION'], ['name', 'CONTROL'], ['function', 'FUNCTION'], ['cc', 'CC'], ['values', 'VALUE/RANGE']], options: { end: /MIDI Implementation Chart/ } }],
  joined: { cc68: 'LFO WAVE' },
};
