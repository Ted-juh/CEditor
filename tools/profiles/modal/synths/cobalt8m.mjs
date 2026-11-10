// Modal Cobalt8M: the MIDI CC implementation chart of its user manual.

export default {
  id: 'modal-cobalt8m',
  name: 'Modal Cobalt8M',
  family: 'Cobalt8',
  description: 'Modal Cobalt8M virtual analog synthesizer module: every controller of its manual\'s MIDI CC implementation chart.',
  document: { title: 'COBALT8M User Manual v2', file: 'cobalt8M_MANUAL_v2.pdf', url: 'https://modalelectronics.com/wp-content/uploads/2025/05/cobalt8M_MANUAL_v2.pdf' },
  pages: [33],
  // Four lists of `CC  Function` side by side.
  read: { kind: 'pairs' },
};
