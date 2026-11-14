// Modal Argon8X: the MIDI CC implementation chart of its user manual.

export default {
  id: 'modal-argon8x',
  name: 'Modal Argon8X',
  family: 'Argon8',
  description: 'Modal Argon8X wavetable synthesizer (61 keys): every controller of its manual\'s MIDI CC implementation chart.',
  document: { title: 'ARGON8X User Manual v3', file: 'argon8X_MANUAL_v3.pdf', url: 'https://modalelectronics.com/wp-content/uploads/2025/05/argon8X_MANUAL_v3.pdf' },
  pages: [34],
  // Four lists of `CC  Function` side by side.
  read: { kind: 'pairs' },
};
