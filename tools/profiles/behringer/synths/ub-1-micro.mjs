// Behringer UB-1 MICRO: the MIDI controller table of its Quick Start Guide.

export default {
  id: 'behringer-ub-1-micro',
  name: 'Behringer UB-1 MICRO',
  family: 'UB',
  description: 'Behringer UB-1 MICRO analog-modelled mini synthesizer: every controller of its quick start guide\'s MIDI table, with the values it prints.',
  document: { title: 'UB-1 MICRO Quick Start Guide', file: 'QSG_BE_0722-ABS_UB-1-MICRO_2025-04-02_Rev.0.pdf', url: 'https://cdn-media.empowertribe.com/e2441bd3e41d45f89d09044dddb6f26c/QSG_BE_0722-ABS_UB-1-MICRO_2025-04-02_Rev.0.pdf' },
  // Bands printed overlapping, each where the next starts: OSC2 Wave's first `0-32` (OSC1's is
  // `0-31`), Arpeggiator Scale's last `87-127` (after `86-106`).
  fix: {
    25: (r) => ({ range: r.range.replace(/^0-32 off/, '0-31 off') }),
    106: (r) => ({ range: r.range.replace(/87-127/, '107-127') }),
  },
  fixNotes: { 25: 'printed 0-32 off, 32-63 sawtooth: 0-31', 106: 'printed 86-106 …, 87-127: 107-127' },
  pages: [40, 41],
};
