// KRONOS drum kit. The same archive as synths/kronos.mjs: every row of DrumKit.txt (object 04,
// Drum Kit) with an id: a note's eight velocity zones filled in from Zone1, and its 128 notes from
// Note1, each by the stride the table's printed first and last rows give; sent by Drum Kit Parameter
// Change (53: VSP, note, PID) and read back from the Current Object Dump of the drum kit.

import kronos from './kronos.mjs';

export default {
  id: 'korg-kronos-drum-kit',
  name: 'Korg KRONOS Drum Kit',
  family: 'KRONOS',
  format: 'kronos',
  object: { code: '04', name: 'Drum Kit' },
  scope: 'A drum kit: for each of its 128 notes, eight velocity zones of a drum sample, the splits between them and the note\'s common settings.',
  coverageOf: 'a drum kit',
  description: 'Korg KRONOS, KRONOS 2 and KRONOS 3: a drum kit, 128 notes of eight velocity zones each, by SysEx parameter change, read back from the current drum kit.',
  document: { ...kronos.document, object: 'DrumKit.txt' },
  message: { code: '53', name: 'Drum Kit Parameter Change', fields: [{ key: 'VSP', printed: 'VSP' }, { key: 'note', printed: 'note' }, { key: 'PID', printed: 'PID' }] },
  repeats: [
    { prefix: 'Note1 Zone1 DS', exact: true, make: (n) => `Note1 Zone${n} DS`, count: 8, key: 'VSP' },
    { prefix: 'Note1 ', make: (n) => `Note${n} `, count: 128, key: 'note' },
  ],
};
