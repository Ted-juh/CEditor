// Modal SKULPTsynth SE: the MIDI CC implementation chart of its user manual.

export default {
  id: 'modal-skulptsynth-se',
  name: 'Modal SKULPTsynth SE',
  family: 'SKULPTsynth',
  description: 'Modal SKULPTsynth SE synthesizer: every controller of its manual\'s MIDI CC implementation chart, with the values it prints.',
  document: { title: 'SKULPTsynth SE User Manual v2.1', file: 'SKULPTsynthSE_MANUAL_v2-1.pdf', url: 'https://modalelectronics.com/wp-content/uploads/2025/08/SKULPTsynthSE_MANUAL_v2-1.pdf' },
  pages: [19, 20, 21],
  // `Function  CC  Values`, two pages to a PDF page, each list's value cell over as many
  // lines as it needs around its row.
  read: { kind: 'anchored', columns: [{ name: 'name', dx: 0 }, { name: 'cc', dx: 112 }, { name: 'values', dx: 132 }], split: 420, offset: 419, first: 1, anchor: { column: 1, test: /^\d{1,3}$/ }, top: 95, bottom: 560, halves: { 19: [1] } },
};
