// KingKORG NEO. KORG KingKORG NEO MIDI Implementation: every setting by SysEx
// PARAMETER CHANGE, an ID and a sub-ID per setting, from TABLE 1 (program) through the blocks it
// nests: two timbres (TABLE 2) with their oscillators (7), envelopes (8) and virtual patches (3, 9),
// the effects (4), the vocoder (5) and the arpeggiator (6).

export default {
  id: 'korg-kingkorg-neo',
  name: 'Korg KingKORG NEO',
  family: 'KingKORG',
  description: 'Korg KingKORG NEO, every setting of its program, timbres, effects, vocoder and arpeggiator by SysEx parameter change.',
  document: {
    title: 'KingKORG NEO MIDI Implementation',
    file: 'KingKORGNEO_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/943/5393/',
  },
  groups: [],
};
