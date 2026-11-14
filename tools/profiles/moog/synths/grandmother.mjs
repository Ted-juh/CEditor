// Moog Grandmother: the MIDI documentation of its manual, version 2 (p. 43), and the value tables it
// points to: the clock divisions beside it, and tables 2 and 3 on p. 44.
export default {
  id: 'moog-grandmother',
  name: 'Moog Grandmother',
  family: 'Grandmother',
  description: 'Moog Grandmother semi-modular analog synthesizer: the MIDI CC table of its manual, with the value tables it points to.',
  documents: [{ title: 'Grandmother Manual, Version 2', file: 'Grandmother_Manual_Version_2.pdf', url: 'https://cdn.inmusicbrands.com/Moog/Grandmother/Grandmother_Manual_Version_2.pdf' }],
  tables: [{ kind: 'cc', pages: [43], columns: [['name', 'FUNCTION'], ['cc', 'CC#'], ['values', { x: 285 }]], options: { right: 520, end: /^ADDITIONAL/ } }],
  valueTables: [
    { title: 'the Grandmother Clock Divisions table', for: [90], pages: [{ page: 43, right: 280 }], columns: [['label', 'GRANDMOTHER CLOCK DIVISIONS'], ['value', 'CC 90 VALUE']] },
    { title: 'the Grandmother Clock Divisions table', for: [90], pages: [{ page: 43, left: 280 }], columns: [['label', 'CLOCK DIVISIONS (Continued)'], ['value', 'CC 90 VALUES']] },
    { title: 'Table 2', for: [107, 108], pages: [{ page: 44, right: 300 }], columns: [['label', 'BEND RANGE (SEMITONES)'], ['value', 'CC 107 / CC108 VALUE']] },
    { title: 'Table 3', for: [119], pages: [{ page: 44, left: 300 }], columns: [['label', 'KEYBOARD TRANSPOSE (SEMITONES)'], ['value', 'CC 119 VALUE']] },
  ],
};
