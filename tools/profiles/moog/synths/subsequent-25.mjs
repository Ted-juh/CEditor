// Moog Subsequent 25: the MIDI CC table of its manual (pp. 46-49 as printed).
export const MSB_LSB_TABLE = { kind: 'cc', columns: [['name', 'Parameter'], ['cc', 'CC Number (MSB)'], ['lsb', 'CC Number (LSB)'], ['values', 'Values']] };

export default {
  id: 'moog-subsequent-25',
  name: 'Moog Subsequent 25',
  family: 'Subsequent',
  description: 'Moog Subsequent 25 paraphonic analog synthesizer: the MIDI CC table of its manual.',
  documents: [{ title: 'Subsequent 25 Manual', file: 'Subsequent_25_Manual_Web.pdf', url: 'https://cdn.inmusicbrands.com/Moog/Subsequent25/Subsequent_25_Manual_Web.pdf' }],
  tables: [{ ...MSB_LSB_TABLE, pages: [45, 46, 47, 48] }],
  notes: ['When the LFO is synced, its rate (CC 3) selects a clock division instead; the manual\'s table of those is not a setting of its own and is not read.'],
};
