// KRONOS Global. The same archive as synths/kronos.mjs: every row of Global.txt (object 03, Global) with
// a parameter id, sent by Parameter Change in Global mode and read back from the Current Object Dump of
// Global.

import kronos from './kronos.mjs';

export default {
  id: 'korg-kronos-global',
  name: 'Korg KRONOS Global',
  family: 'KRONOS',
  format: 'kronos',
  object: { code: '03', name: 'Global' },
  keepRowsWithId: true,
  scope: 'Global: tuning, curves, the controllers\' assignments and polarities, the user scales, the audio inputs and the MIDI settings.',
  coverageOf: 'Global',
  description: 'Korg KRONOS: its Global settings (tuning, curves, controller assignments, user scales, audio inputs, MIDI) by SysEx parameter change, read back from Global.',
  document: { ...kronos.document, object: 'Global.txt' },
  functions: kronos.functions,
};
