// Modal 008: the MIDI CC implementation chart of its user manual.

export default {
  id: 'modal-008',
  name: 'Modal 008',
  family: '008',
  description: 'Modal 008 analog synthesizer (keyboard): every controller of its manual\'s MIDI CC implementation chart, with the values it prints.',
  document: { title: 'MODAL 008 User Manual v1.03', file: 'MODAL008_MANUAL_v1-03.pdf', url: 'https://modalelectronics.com/wp-content/uploads/2025/08/MODAL008_MANUAL_v1-03.pdf' },
  pages: [46, 47, 48],
  // `Function  CC  Values`, two pages to a PDF page, each list's value cell over as many
  // lines as it needs around its row.
  read: { kind: 'anchored', columns: [{ name: 'name', dx: 0 }, { name: 'cc', dx: 190 }, { name: 'values', dx: 240 }], split: 420, offset: 419, first: 1, anchor: { column: 1, test: /^\d{1,3}$/ }, top: 95, bottom: 560 },
};
