// KRONOS wave sequence. The same archive as synths/kronos.mjs: every row of WaveSequence.txt
// (object 05, Wave Seq) with an id, its 64 steps filled in from Step1 by the stride the table's printed
// first and last rows of Step2 and Step64 give, sent by Wave Seq Parameter Change (55: step, PID) and
// read back from the Current Object Dump of the wave sequence.

import kronos from './kronos.mjs';

export default {
  id: 'korg-kronos-wave-sequence',
  name: 'Korg KRONOS Wave Sequence',
  family: 'KRONOS',
  format: 'kronos',
  object: { code: '05', name: 'Wave Seq' },
  scope: 'A wave sequence: its common settings and its 64 steps.',
  coverageOf: 'a wave sequence',
  description: 'Korg KRONOS, KRONOS 2 and KRONOS 3: a wave sequence, its common settings and 64 steps, by SysEx parameter change, read back from the current wave sequence.',
  document: { ...kronos.document, object: 'WaveSequence.txt' },
  message: { code: '55', name: 'Wave Seq Parameter Change', fields: [{ key: 'IDX', printed: 'step' }, { key: 'PID', printed: 'PID' }] },
  repeats: [{ prefix: 'Step1', exact: true, make: (n) => `Step${n}`, count: 64, key: 'IDX' }],
};
