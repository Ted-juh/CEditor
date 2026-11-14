// Modal Argon8M: the MIDI CC implementation chart of its user manual.

export default {
  id: 'modal-argon8m',
  name: 'Modal Argon8M',
  family: 'Argon8',
  description: 'Modal Argon8M wavetable synthesizer module: every controller of its manual\'s MIDI CC implementation chart.',
  document: { title: 'ARGON8M User Manual v3', file: 'argon8M_MANUAL_v3.pdf', url: 'https://modalelectronics.com/wp-content/uploads/2025/05/argon8M_MANUAL_v3.pdf' },
  pages: [34],
  // Four lists of `CC  Function` side by side.
  read: { kind: 'pairs' },
};
