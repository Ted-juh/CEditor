// Behringer PRO-800: the MIDI controller table of its Quick Start Guide, V 4.0.

export default {
  id: 'behringer-pro-800',
  name: 'Behringer PRO-800',
  family: 'PRO',
  description: 'Behringer PRO-800 8-voice analog polyphonic synthesizer: every controller of its quick start guide\'s MIDI table, with the values it prints.',
  document: { title: 'PRO-800 Quick Start Guide, V 4.0', file: 'QSG_BE_0718-ABF_PRO-800_WW.pdf', url: 'https://cdn-media.empowertribe.com/d070b1451258414fa134b8f71b75b18c/QSG_BE_0718-ABF_PRO-800_WW.pdf' },
  // CC 49 is printed `OSC A Saw` a second time: oscillator B's run Saw, Tri, Square (51 - 53), so
  // A's is Saw, Tri, Square too. 52 and 53 are printed `OSB B`.
  fix: { 49: { stepped: 'OSC A Tri' }, 52: { stepped: 'OSC B Tri' }, 53: { stepped: 'OSC B Square' } },
  fixNotes: { 49: 'printed OSC A Saw, as 48 is: OSC A Tri', 52: 'printed OSB B Tri', 53: 'printed OSB B Square' },
  pages: [54, 55],
};
