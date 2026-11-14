// Behringer PRO-VS MINI: the MIDI controller table of its Quick Start Guide.

export default {
  id: 'behringer-pro-vs-mini',
  name: 'Behringer PRO-VS MINI',
  family: 'PRO',
  description: 'Behringer PRO-VS MINI vector synthesizer: every controller of its quick start guide\'s MIDI table, with the values it prints.',
  document: { title: 'PRO-VS MINI Quick Start Guide', file: 'QSG_BE_0722-ABF_PRO-VS-MINI_WW.pdf', url: 'https://cdn-media.empowertribe.com/07c681beb5724cb797eff24a67095bc7/QSG_BE_0722-ABF_PRO-VS-MINI_WW.pdf' },
  // The last row repeats the one above it: the four voices' coarse tunings are A, B, C, D, as their
  // fine tunings are (111 - 114).
  fix: { 118: { name: 'Voice D Coarse Tuning' } },
  fixNotes: { 118: 'printed Voice C Coarse Tuning, as 117 is: Voice D' },
  pages: [86],
};
