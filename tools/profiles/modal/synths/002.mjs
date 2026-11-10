// Modal 002: the MIDI CC implementation chart of its user manual.

export default {
  id: 'modal-002',
  name: 'Modal 002',
  family: '002',
  description: 'Modal 002 hybrid synthesizer (keyboard): every controller of its manual\'s MIDI CC implementation chart, with the values it prints.',
  document: { title: 'MODAL 002 User Manual v1.03', file: 'MODAL002_MANUAL_v1-03.pdf', url: 'https://modalelectronics.com/wp-content/uploads/2025/08/MODAL002_MANUAL_v1-03.pdf' },
  pages: [47, 48, 49],
  // `Function  CC  Joystick Index  Sequence Index  Animator Index  Values`, two pages to a PDF page, each list's value cell over as many
  // lines as it needs around its row.
  read: { kind: 'anchored', columns: [{ name: 'name', dx: 0 }, { name: 'cc', dx: 113 }, { name: 'joystick', dx: 150 }, { name: 'sequence', dx: 203 }, { name: 'animator', dx: 256 }, { name: 'values', dx: 300 }], split: 420, offset: 419, first: 1, anchor: { column: 1, test: /^\d{1,3}$/ }, top: 95, bottom: 560 },
};
