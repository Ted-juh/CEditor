// Modal CRAFTsynth 2.0: the MIDI CC implementation chart of its user manual.

export default {
  id: 'modal-craftsynth-2',
  name: 'Modal CRAFTsynth 2.0',
  family: 'CRAFTsynth',
  description: 'Modal CRAFTsynth 2.0 monophonic synthesizer: every controller of its manual\'s MIDI CC implementation chart, with the values it prints.',
  document: { title: 'CRAFTsynth 2.0 User Manual v1.4', file: 'CRAFTsynth_II_MANUAL_v1_4.pdf', url: 'https://modalelectronics.com/wp-content/uploads/2025/08/CRAFTsynth_II_MANUAL_v1_4.pdf' },
  pages: [21, 22],
  // `Function  CC  Values`, two pages to a PDF page, each list's value cell over as many
  // lines as it needs around its row.
  read: { kind: 'anchored', columns: [{ name: 'name', dx: 0 }, { name: 'cc', dx: 112 }, { name: 'values', dx: 132 }], split: 420, offset: 419, first: 1, anchor: { column: 1, test: /^\d{1,3}$/ }, top: 95, bottom: 560 },
};
