// Arturia MiniFreak: the MIDI implementation chart of its user manual (16.2.5).

export default {
  id: 'arturia-minifreak',
  name: 'Arturia MiniFreak',
  family: 'Freak',
  description: 'Arturia MiniFreak polyphonic hybrid synthesizer: every controller of its manual\'s MIDI implementation chart.',
  document: { title: 'MiniFreak User Manual 4.0.1', file: 'minifreak_Manual_4_0_1_EN.pdf', url: 'https://dl.arturia.net/products/minifreak/manual/minifreak_Manual_4_0_1_EN.pdf' },
  // The chart sets Glide's section cell blank under Pedals' Sustain; Glide is a front-panel knob.
  regroup: { 5: 'Glide' },
  pages: [121, 122],
};
