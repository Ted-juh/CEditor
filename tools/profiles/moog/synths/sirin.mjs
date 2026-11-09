// Moog Sirin: the MIDI CC table of its manual, v2.1 (pp. 22-23 as printed), and the LFO clock
// divider table it points to.
export const SECTION_TABLE = { kind: 'cc', columns: [['section', 'SECTION'], ['name', 'CONTROL/ PARAMETER'], ['function', 'FUNCTION'], ['cc', 'CC'], ['values', 'VALUE/RANGE']] };
export const SECTIONS = { 'RESPONSE KEYBD': 'Keyboard Response', 'RESPONSE WHEEL MOD': 'Mod Wheel Response', 'PITCH WHEEL RESPONSE': 'Pitch Wheel Response', '(SEE NOTE 1) CONTROL': 'Control', 'MOD(MODULATION)': 'Modulation' };
// BEND UP and BEND DOWN print one list of values between them, set across both rows.
export const BEND = { 107: 'bend', 108: 'bend' };

export default {
  id: 'moog-sirin',
  name: 'Moog Sirin',
  family: 'Sirin',
  description: 'Moog Sirin analog synthesizer module: the MIDI CC table of its manual, with the LFO clock divider table it points to.',
  documents: [{ title: 'Sirin User Manual v2.1', file: 'Sirin_Manual_2_1.pdf', url: 'https://cdn.inmusicbrands.com/Moog/Sirin/Sirin_Manual_2_1.pdf' }],
  tables: [{ ...SECTION_TABLE, pages: [26, 27], options: { merged: [['107', '108']] } }],
  valueTables: [{ title: 'MIDI CC values for the LFO clock divider', for: [86], pages: [28], columns: [['label', 'TIME VALUE'], ['division', 'DIVISION'], ['value', 'VALUE']] }],
  sections: SECTIONS,
};
