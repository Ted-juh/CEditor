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
  effectsTable: 'nautilus-effects',
  object: { code: '01', name: 'Combination' },
  scope: 'A combination: its sixteen timbres, its effects and controllers. The programs its timbres play are edited in Program mode (korg-nautilus).',
  coverageOf: 'a combination',
  description: 'Korg NAUTILUS: the timbres, effects and controllers of a combination by SysEx parameter change, read back from the current combination.',
  document: { ...nautilus.document, object: 'SysExDumps/CombiAndSongTimbreSet.txt' },
  // The table names no message per row. The NAUTILUS's Scene Common is the KRONOS's KARMA Common
  // in its program (Tempo is PID 0, Latch Switch PID 3, the arpeggiator's switch PID 4, where KARMA's
  // Tempo, Latch Switch and KARMA Fx Switch are), so it goes by Scene Parameter Change (6D) as KARMA
  // Common goes by KARMA Parameter Change; the scenes' arpeggiator and drum track rows and the step
  // sequencers go by Arp/Drum Track Parameter Change (6E), by its name.
  functions: [
    { group: /^Scene Common$/, typ: [5], code: '6D', message: 'Scene Parameter Change', checks: [{ name: 'Tempo', pid: 0 }, { name: 'Latch Switch', pid: 3 }, { name: 'Arp Switch', pid: 4 }], why: 'Scene Common takes the KRONOS KARMA Common\'s ids for its own settings (Tempo PID 0, Latch Switch PID 3, the arpeggiator\'s switch PID 4), and KARMA Common goes by KARMA Parameter Change' },
    { group: /^Scene /, code: '6E', message: 'Arp/Drum Track Parameter Change', why: 'the scenes\' arpeggiator and drum track settings, by the message\'s name' },
    { group: /^Step Seq\. /, code: '6E', message: 'Arp/Drum Track Parameter Change', why: 'the drum track\'s step sequencers, by the message\'s name' },
  ],
};
