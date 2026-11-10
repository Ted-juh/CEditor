// Modal Carbon8X: the MIDI CC implementation chart of its user manual.

export default {
  id: 'modal-carbon8x',
  name: 'Modal Carbon8X',
  family: 'Carbon8',
  description: 'Modal Carbon8X synthesizer (61 keys): every controller of its manual\'s MIDI CC implementation chart.',
  document: { title: 'CARBON8X User Manual v1', file: 'carbon8X_MANUAL_v1.pdf', url: 'https://modalelectronics.com/wp-content/uploads/2025/05/carbon8X_MANUAL_v1.pdf' },
  pages: [30, 31],
  // Four lists of `CC  Function` side by side, two to a page; the second page's right half is text
  // on MPE, clipped off.
  read: { kind: 'pairs', clip: { 31: [0, 420] } },
};
