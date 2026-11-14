// Modal Carbon8: the MIDI CC implementation chart of its user manual.

export default {
  id: 'modal-carbon8',
  name: 'Modal Carbon8',
  family: 'Carbon8',
  description: 'Modal Carbon8 synthesizer (keyboard): every controller of its manual\'s MIDI CC implementation chart.',
  document: { title: 'CARBON8 User Manual v1', file: 'carbon8_manual_v1.pdf', url: 'https://modalelectronics.com/wp-content/uploads/2025/05/carbon8_manual_v1.pdf' },
  pages: [30, 31],
  // Four lists of `CC  Function` side by side, two to a page; the second page's right half is text
  // on MPE, clipped off.
  read: { kind: 'pairs', clip: { 31: [0, 420] } },
};
