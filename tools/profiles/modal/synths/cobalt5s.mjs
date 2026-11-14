// Modal Cobalt5S: the MIDI CC implementation chart of its user manual.

export default {
  id: 'modal-cobalt5s',
  name: 'Modal Cobalt5S',
  family: 'Cobalt8',
  description: 'Modal Cobalt5S virtual analog synthesizer: every controller of its manual\'s MIDI CC implementation chart.',
  document: { title: 'COBALT5S User Manual v1', file: 'cobalt5s_MANUAL_v1.pdf', url: 'https://modalelectronics.com/wp-content/uploads/2025/05/cobalt5s_MANUAL_v1.pdf' },
  pages: [32],
  // Four lists of `CC  Function` side by side.
  read: { kind: 'pairs' },
};
