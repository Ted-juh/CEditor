// Moog Little Phatty Stage II: the MIDI CC table of its manual (pp. 55-56 as printed) and the value
// tables on p. 57 it points to.
export const PHATTY_TABLE = { kind: 'cc', columns: [['section', 'SECTION'], ['name', 'CONTROL/PARAMETER'], ['function', 'FUNCTION'], ['cc', 'CC'], ['values', 'VALUE/RANGE']] };
// Rows of one section with one name: the function column says which is which.
export const PHATTY_NAMES = {
  cc9: 'OSC 1 WAVE', cc11: 'OSC 2 WAVE', cc75: 'OSC 2 OCTAVE',
  cc23: 'FILTER EG ATTACK', cc24: 'FILTER EG DECAY', cc25: 'FILTER EG SUSTAIN', cc26: 'FILTER EG RELEASE',
  cc28: 'VOLUME EG ATTACK', cc29: 'VOLUME EG DECAY', cc30: 'VOLUME EG SUSTAIN', cc31: 'VOLUME EG RELEASE',
};
export const PHATTY_NOTES = [
  'Ten rows print a name another row of their section has (WAVE, OCTAVE, ATTACK …); each is named here from its function column (`Sets the waveform of oscillator 2`, `Adjusts the filter envelope attack time`).',
  'The Arpeggiator Clock Rate is two controllers, CC 4 in steps of 3 BPM and CC 36 in tenths (the table\'s note 2); the profile has CC 4.',
];

export default {
  id: 'moog-little-phatty',
  name: 'Moog Little Phatty',
  family: 'Phatty',
  description: 'Moog Little Phatty Stage II analog synthesizer: the MIDI CC table of its manual, with the value tables it points to.',
  documents: [{ title: 'LP Stage II User\'s Manual', file: 'Little_Phatty_Manual.pdf', url: 'https://cdn.inmusicbrands.com/Moog/LittlePhatty/Little_Phatty_Manual.pdf' }],
  tables: [{ ...PHATTY_TABLE, pages: [54, 55] }],
  valueTables: [
    { title: 'MIDI CC values for the LFO and Arpeggiator Clock Divider', for: [103, 115], pages: [56], columns: [['label', 'TIME VALUE'], ['division', 'CLOCK DIVIDER (LP DISPLAY)'], ['value', 'VALUE']], options: { end: /^MIDI CC values for the LFO/ } },
    { title: 'MIDI CC values for Filter Velocity Sensitivity', for: [110], pages: [56], columns: [['label', 'FILTER VELOCITY SENSITIVITY'], ['value', 'VALUE']], options: { end: /^MIDI CC values for Filter/ } },
  ],
  names: PHATTY_NAMES,
  notes: PHATTY_NOTES,
};
