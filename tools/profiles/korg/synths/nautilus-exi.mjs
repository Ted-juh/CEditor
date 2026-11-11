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
  effectsTable: 'nautilus-effects',
  scope: 'A program of an EXi bank: its two EXi slots, each with the settings of every engine it can hold, and its effects and controllers. An HD-1 program is korg-nautilus.',
  coverageOf: 'an EXi program',
  otherLength: 'an HD-1 program, laid out otherwise, comes back under the same header',
  description: 'Korg NAUTILUS: a program of an EXi bank (AL-1, CX-3, STR-1, MS-20EX, PolysixEX, MOD-7, SGX-2, EP-1 in either slot) by SysEx parameter change, its common settings read back from the current program.',
  document: { ...nautilus.document, object: 'SysExDumps/Prog_EXi_Common.txt', engines: 'SysExDumps/Prog_EXi.txt' },
  // The table names no message per row. The NAUTILUS's Scene Common is the KRONOS's KARMA Common
  // in its program (Tempo is PID 0, Latch Switch PID 3, the arpeggiator's switch PID 4, where KARMA's
  // Tempo, Latch Switch and KARMA Fx Switch are), so it goes by Scene Parameter Change (6D) as KARMA
  // Common goes by KARMA Parameter Change; the scenes' arpeggiator and drum track rows and the step
  // sequencers go by Arp/Drum Track Parameter Change (6E), by its name.
  functions: [
    { group: /^Scene Common$/, typ: [0], code: '6D', message: 'Scene Parameter Change', checks: [{ name: 'Tempo', pid: 0 }, { name: 'Latch Switch', pid: 3 }, { name: 'Arp Switch', pid: 4 }], why: 'Scene Common takes the KRONOS KARMA Common\'s ids for its own settings (Tempo PID 0, Latch Switch PID 3, the arpeggiator\'s switch PID 4), and KARMA Common goes by KARMA Parameter Change' },
    { group: /^Scene /, code: '6E', message: 'Arp/Drum Track Parameter Change', why: 'the scenes\' arpeggiator and drum track settings, by the message\'s name' },
    { group: /^Step Seq\. /, code: '6E', message: 'Arp/Drum Track Parameter Change', why: 'the drum track\'s step sequencers, by the message\'s name' },
  ],
  engineSlots: [{ label: 'EXi1', typ: 11 }, { label: 'EXi2', typ: 12 }],
  readOnly: ['Algorithm Type'],
};
