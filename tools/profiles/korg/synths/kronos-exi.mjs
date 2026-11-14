// KRONOS EXi program. The same archive as synths/kronos.mjs: a program of an EXi bank, every row of
// Prog_EXi_Common.txt with a parameter id, read back from the program's dump, and every EXi engine's
// own settings from Prog_EXi.txt for both slots, sent by Parameter Change and not read back.

import kronos from './kronos.mjs';

export default {
  id: 'korg-kronos-exi',
  name: 'Korg KRONOS EXi Program',
  family: 'KRONOS',
  format: 'kronos',
  effectsTable: 'kronos-effects',
  scope: 'A program of an EXi bank: its two EXi slots, each with the settings of every engine it can hold, and its effects, KARMA and controllers. An HD-1 program is korg-kronos.',
  coverageOf: 'an EXi program',
  otherLength: 'an HD-1 program, laid out otherwise, comes back under the same header',
  description: 'Korg KRONOS, KRONOS 2 and KRONOS 3: a program of an EXi bank (AL-1, CX-3, STR-1, MS-20EX, PolysixEX, MOD-7, SGX-2, EP-1 in either slot) by SysEx parameter change, its common settings read back from the current program.',
  document: { ...kronos.document, object: 'Prog_EXi_Common.txt', engines: 'Prog_EXi.txt' },
  functions: kronos.functions,
  engineSlots: [{ label: 'EXi1', typ: 11 }, { label: 'EXi2', typ: 12 }],
  readOnly: ['Algorithm Type'],
};
