// Moog Minitaur: the MIDI CC table of its manual (pp. 21-24 as printed, two to a sheet), the LFO
// clock divider table beside it, and the firmware v2.1 addendum's corrections (p. 18 of the PDF).
import { SECTION_TABLE, SECTIONS } from './sirin.mjs';

export default {
  id: 'moog-minitaur',
  name: 'Moog Minitaur',
  family: 'Minitaur',
  description: 'Moog Minitaur analog bass synthesizer: the MIDI CC table of its manual, with the corrections its v2.1 addendum prints.',
  documents: [{ title: 'Minitaur Manual (with the Firmware v2.1 Addendum)', file: 'Minitaur_Manual.pdf', url: 'https://cdn.inmusicbrands.com/Moog/Minitaur/Minitaur_Manual.pdf' }],
  tables: [{ ...SECTION_TABLE, pages: [{ page: 12, left: 390 }, { page: 13, right: 390 }], options: { merged: [['107', '108']] } }],
  valueTables: [{ title: 'MIDI CC values for the LFO clock divider', for: [86], pages: [{ page: 13, left: 390 }], columns: [['label', 'TIME VALUE'], ['division', 'DIVISION'], ['value', 'VALUE']] }],
  sections: SECTIONS,
  // CORRECTIONS TO THE MANUAL, in the Firmware v2.1 Addendum (p. 18 of the PDF), as printed there.
  corrections: {
    73: { values: '0-42(LEGATO ON), 43-85(LEGATO OFF), 86-127(EG RESET)', why: 'the v2.1 addendum\'s correction: "86-127(EG RESET) [was incorrectly given as 85-127 in manual]"' },
    91: { values: '0-42(LOW) 43-85(HIGH) 86-127(LAST)', why: 'the v2.1 addendum\'s correction: "86-127(LAST) [was incorrectly given as 87-127 in manual]"' },
  },
};
