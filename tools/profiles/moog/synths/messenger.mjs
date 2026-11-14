// Moog Messenger: the MIDI CC tables of its manual (pp. 35-37 as printed).
export default {
  id: 'moog-messenger',
  name: 'Moog Messenger',
  family: 'Messenger',
  description: 'Moog Messenger monophonic analog synthesizer: the MIDI CC tables of its manual.',
  documents: [{ title: 'Messenger User Manual (2025-06-18)', file: 'Messenger_Manual_20250618.pdf', url: 'https://cdn.inmusicbrands.com/Moog/Messenger/Messenger_Manual_20250618.pdf' }],
  tables: [{ kind: 'cc', pages: [35, 36, 37], columns: [['name', 'PARAMETERS'], ['cc', 'CC # (MSB)'], ['lsb', 'CC # (LSB)'], ['values', 'VALUES']] }],
  skip: [[/^MPE 3rd Dimension/, 'switched by an MPE Activation message (RPN 6), not by this controller'], [/^Data Entry$/, 'MIDI\'s data entry controller']],
};
