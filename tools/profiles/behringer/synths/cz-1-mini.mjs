// Behringer CZ-1 MINI: the MIDI controller table of its Manual.

export default {
  id: 'behringer-cz-1-mini',
  name: 'Behringer CZ-1 MINI',
  family: 'CZ',
  description: 'Behringer CZ-1 MINI phase distortion synthesizer: every controller of its manual\'s MIDI table, with the values it prints.',
  document: { title: 'CZ-1 MINI Manual', file: 'Manual_BE_0718-ACK_CZ-1-MINI_WW.pdf', url: 'https://cdn-media.empowertribe.com/c188d499282940259ac0587832796ccb/Manual_BE_0718-ACK_CZ-1-MINI_WW.pdf' },
  // Every sound parameter is printed `Param …`.
  rename: (name) => name.replace(/^Param\s+/, ''),
  // CC 14 drops the line's number its neighbours print (`DCO 1 WF1`, `DCO 1 DCW`, and `DCO 1 WF2
  // lineOffset` at CC 17).
  fix: { 14: { name: 'Param DCO 1 WF2' } },
  fixNotes: { 14: 'printed DCO WF2, between DCO 1 WF1 and DCO 1 DCW: DCO 1 WF2' },
  pages: [57, 58, 59],
};
