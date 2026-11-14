// NAUTILUS Global. The same archive as synths/nautilus.mjs: every row of SysExDumps/Global.txt (object 03, Global) with
// a parameter id, sent by Parameter Change in Global mode and read back from the Current Object Dump of
// Global.

import nautilus from './nautilus.mjs';

export default {
  id: 'korg-nautilus-global',
  name: 'Korg NAUTILUS Global',
  family: 'NAUTILUS',
  format: 'kronos',
  object: { code: '03', name: 'Global' },
  keepRowsWithId: true,
  scope: 'Global: tuning, curves, the controllers\' assignments and polarities, the user scales, the audio inputs and the MIDI settings.',
  coverageOf: 'Global',
  description: 'Korg NAUTILUS: its Global settings (tuning, curves, controller assignments, user scales, audio inputs, MIDI) by SysEx parameter change, read back from Global.',
  document: { ...nautilus.document, object: 'SysExDumps/Global.txt' },
  functions: [],
};
