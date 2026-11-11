// KRONOS combination. The same archive as synths/kronos.mjs: every row of CombiAndSongTimbreSet.txt
// (object 01, Combination; Version 1.01, Jan 7 2015) with a parameter id, sent by Parameter Change
// in Combination mode and read back from the Current Object Dump of the combination.

import kronos from './kronos.mjs';

export default {
  id: 'korg-kronos-combination',
  name: 'Korg KRONOS Combination',
  family: 'KRONOS',
  format: 'kronos',
  effectsTable: 'kronos-effects',
  object: { code: '01', name: 'Combination' },
  scope: 'A combination: its sixteen timbres, its four KARMA modules, its effects and controllers. The programs its timbres play are edited in Program mode (korg-kronos).',
  coverageOf: 'a combination',
  description: 'Korg KRONOS, KRONOS 2 and KRONOS 3: every setting of a combination (sixteen timbres, four KARMA modules, effects) by SysEx parameter change, read back from the current combination.',
  document: { ...kronos.document, object: 'CombiAndSongTimbreSet.txt' },
  functions: kronos.functions,
};
