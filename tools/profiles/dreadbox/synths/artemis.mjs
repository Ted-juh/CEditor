// Dreadbox Artemis: its CC list, published beside the manual.

export default {
  id: 'dreadbox-artemis',
  name: 'Dreadbox Artemis',
  family: 'Artemis',
  description: 'Dreadbox Artemis polyphonic synthesizer: every controller of its CC list, its values spread over 0 - 127 as the list says.',
  document: { title: 'Artemis CC List', file: 'Artemis-CC-LIST.pdf', url: 'https://dreadbox-fx.com/wp-content/uploads/2025/08/Artemis-CC-LIST.pdf' },
  pages: [1, 2, 3],
  // `CC  PARAMETER  VALUE`, a long value over two or three lines.
  read: { columns: [{ name: 'cc', dx: 0 }, { name: 'name', dx: 55 }, { name: 'value', dx: 200 }], first: 0, skip: /^(?:CC PARAMETER VALUE|CC LIST)$/ },
  spreads: true,
  notes: ['The list: "All the values either numerical or enumerated are split in the whole CC range of 0-127." A range (`0 - 100`) is 0 - 127 shown as printed; a list of settings is a choice, each sent at the middle of its equal share of 0 - 127.', 'The list: CC 31 (Selector) chooses whether the controllers after it set a parameter\'s value or one of its modulation amounts (mod wheel, velocity, aftertouch, CC74, key track); for a modulation amount, 0 is -100, 64 is 0 and 127 is +100.'],
};
