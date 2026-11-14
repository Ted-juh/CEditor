// microKORG S. microKORG S MIDI Implementation, Revision 1.01 (2026.06.22): every setting by SysEx
// PARAMETER CHANGE, from TABLE 1 (program), TABLE 2 (each of the two timbres) and TABLE 3 (the
// vocoder), each row with its Param ID.

export default {
  id: 'korg-microkorg-s',
  name: 'Korg microKORG S',
  family: 'microKORG',
  description: 'Korg microKORG S, every setting of its program, timbres and vocoder by SysEx parameter change.',
  document: {
    title: 'microKORG S MIDI Implementation',
    file: 'microKORG_S_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/716/5696/',
  },
  tableNames: { 'TABLE 3 : VOCODER PARAMETER': 'Vocoder' },
  // The vocoder's sixteen channel levels and pans follow LFO 2 with no section row of their own.
  sections: [[/^CH (LEVEL|PAN)\b/, 'CHANNEL']],
  // Its NRPNs (arpeggio, patches, vocoder bands) reach settings the parameter change reaches in full,
  // printed in an older notation (`00~3F/40~7F:OFF/ON`).
  skip: [[/./, 'the NRPNs repeat settings the SysEx parameter change reaches in full']],
  groups: [
    ['Controllers', /^Pitch Modulation Depth$/],
  ],
};
