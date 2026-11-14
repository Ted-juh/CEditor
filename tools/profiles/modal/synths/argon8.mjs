// Modal Argon8: the MIDI CC implementation chart of its user manual.

export default {
  id: 'modal-argon8',
  name: 'Modal Argon8',
  family: 'Argon8',
  description: 'Modal Argon8 wavetable synthesizer (keyboard): every controller of its manual\'s MIDI CC implementation chart.',
  document: { title: 'ARGON8 User Manual v3', file: 'argon8_MANUAL_v3.pdf', url: 'https://modalelectronics.com/wp-content/uploads/2025/05/argon8_MANUAL_v3.pdf' },
  pages: [34],
  // Four lists of `CC  Function` side by side.
  read: { kind: 'pairs' },
};
