// Moog Slim Phatty: the MIDI CC table of its manual and the value tables it points to, set as the
// Little Phatty's.
import { PHATTY_NAMES, PHATTY_NOTES, PHATTY_TABLE } from './little-phatty.mjs';

export default {
  id: 'moog-slim-phatty',
  name: 'Moog Slim Phatty',
  family: 'Phatty',
  description: 'Moog Slim Phatty analog synthesizer module: the MIDI CC table of its manual, with the value tables it points to.',
  documents: [{ title: 'Slim Phatty User\'s Manual', file: 'Slim_Phatty_Manual.pdf', url: 'https://cdn.inmusicbrands.com/Moog/SlimPhatty/Slim_Phatty_Manual.pdf' }],
  tables: [{ ...PHATTY_TABLE, pages: [53, 54] }],
  valueTables: [
    { title: 'MIDI CC values for the LFO and Arpeggiator Clock Divider', for: [103, 115], pages: [55], columns: [['label', 'TIME VALUE'], ['division', 'CLOCK DIVIDER (SP DISPLAY)'], ['value', 'VALUE']], options: { end: /^MIDI CC values for the LFO/ } },
    { title: 'MIDI CC values for Filter Velocity Sensitivity', for: [110], pages: [55], columns: [['label', 'FILTER VELOCITY SENSITIVITY'], ['value', 'VALUE']], options: { end: /^MIDI CC values for Filter/ } },
  ],
  names: PHATTY_NAMES,
  notes: PHATTY_NOTES,
};
