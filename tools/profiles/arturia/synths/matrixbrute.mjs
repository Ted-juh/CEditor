// Arturia MatrixBrute: the MIDI continuous controller assignments of its user manual (7.1).

export default {
  id: 'arturia-matrixbrute',
  name: 'Arturia MatrixBrute',
  family: 'Brute',
  description: 'Arturia MatrixBrute analog synthesizer: every controller of its manual\'s MIDI continuous controller assignments.',
  document: { title: 'MatrixBrute User Manual 2.0.3', file: 'matrixbrute_Manual_2_0_3_EN.pdf', url: 'https://dl.arturia.net/products/matrixbrute/manual/matrixbrute_Manual_2_0_3_EN.pdf' },
  pages: [55, 56, 57, 58],
  // The chart heads the second envelope's block `ENV 2 (VCF)` and its velocity row `Velo / VCF`; the
  // manual's own text calls it ENV 2 (VCA) throughout ("Velo/VCA (ENV 2 only)", "ENV 2 (VCA) controls
  // the overall volume level"), and an independent transcription reads it so too.
  corrections: Object.fromEntries([[95, 'Velo / VCA'], [105, 'Attack'], [106, 'Decay'], [29, 'Sustain'], [107, 'Release']].map(([cc, name]) => [cc, { name, title: 'ENV 2 (VCA)', because: cc === 95 ? 'the manual\'s text calls it Velo/VCA, on ENV 2 only' : 'the manual\'s text calls the second envelope ENV 2 (VCA)' }])),
};
