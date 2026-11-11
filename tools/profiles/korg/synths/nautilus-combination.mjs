// NAUTILUS combination. The same archive as synths/nautilus.mjs: every row of
// SysExDumps/CombiAndSongTimbreSet.txt (object 01, Combination) with a parameter id but the scenes and
// the step sequencers, sent by Parameter Change in Combination mode and read back from the Current
// Object Dump of the combination.

import nautilus from './nautilus.mjs';

export default {
  id: 'korg-nautilus-combination',
  name: 'Korg NAUTILUS Combination',
  family: 'NAUTILUS',
  format: 'kronos',
  object: { code: '01', name: 'Combination' },
  scope: 'A combination: its sixteen timbres, its effects and controllers. The programs its timbres play are edited in Program mode (korg-nautilus).',
  coverageOf: 'a combination',
  description: 'Korg NAUTILUS: the timbres, effects and controllers of a combination by SysEx parameter change, read back from the current combination.',
  document: { ...nautilus.document, object: 'SysExDumps/CombiAndSongTimbreSet.txt' },
  citedMessages: nautilus.citedMessages,
  functions: [],
  // In a combination the scenes have ids of their own (TYP 5, 7 and 8), so nothing rules out any of
  // the three messages; the program's reason (its scenes' ids clash) does not hold here.
  leaveOut: [
    {
      group: /^Scene /,
      label: 'the scenes',
      why: 'the scenes\' rows (their arpeggiator and drum track settings among them) have ids unique under Parameter Change (43), Scene Parameter Change (6D) and Arp/Drum Track Parameter Change (6E) alike, and the archive names no message for them',
    },
    nautilus.leaveOut.find((l) => l.label === 'the step sequencers'),
  ],
};
