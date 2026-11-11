// NAUTILUS EXi program. The same archive as synths/nautilus.mjs: a program of an EXi bank, every row of
// SysExDumps/Prog_EXi_Common.txt with a parameter id but the scenes and step sequencers, read back from
// the program's dump, and every EXi engine's own settings from SysExDumps/Prog_EXi.txt for both slots,
// sent by Parameter Change and not read back.

import nautilus from './nautilus.mjs';

export default {
  id: 'korg-nautilus-exi',
  name: 'Korg NAUTILUS EXi Program',
  family: 'NAUTILUS',
  format: 'kronos',
  scope: 'A program of an EXi bank: its two EXi slots, each with the settings of every engine it can hold, and its effects and controllers. An HD-1 program is korg-nautilus.',
  coverageOf: 'an EXi program',
  otherLength: 'an HD-1 program, laid out otherwise, comes back under the same header',
  description: 'Korg NAUTILUS: a program of an EXi bank (AL-1, CX-3, STR-1, MS-20EX, PolysixEX, MOD-7, SGX-2, EP-1 in either slot) by SysEx parameter change, its common settings read back from the current program.',
  document: { ...nautilus.document, object: 'SysExDumps/Prog_EXi_Common.txt', engines: 'SysExDumps/Prog_EXi.txt' },
  citedMessages: nautilus.citedMessages,
  functions: [],
  leaveOut: nautilus.leaveOut,
  engineSlots: [{ label: 'EXi1', typ: 11 }, { label: 'EXi2', typ: 12 }],
  readOnly: ['Algorithm Type'],
};
