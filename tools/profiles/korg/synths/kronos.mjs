// KRONOS. Korg's KRONOS MIDI Implementation archive (KRONOS_MIDIimp.zip, 2025-07-24): an HD-1
// program, every row of Prog_HD-1.txt (Version 1.01, Jan 7 2015) with a parameter id, sent by
// Parameter Change (function 43) and read back from the Current Object Dump of the program.

export default {
  id: 'korg-kronos',
  name: 'Korg KRONOS',
  family: 'KRONOS',
  format: 'kronos',
  effectsTable: 'kronos-effects',
  scope: 'An HD-1 program only: a program of an EXi bank is laid out in Prog_EXi_Common.txt and Prog_EXi.txt, not here.',
  coverageOf: 'an HD-1 program',
  otherLength: 'a program of an EXi bank, laid out otherwise, comes back under the same header',
  description: 'Korg KRONOS, KRONOS 2 and KRONOS 3: every setting of an HD-1 program by SysEx parameter change, read back from the current program.',
  document: {
    title: 'KRONOS MIDI Implementation',
    archive: 'KRONOS_MIDIimp.zip',
    archiveDate: '2025-07-24',
    url: 'https://www.korg.com/us/support/download/manual/0/988/5480/',
    object: 'Prog_HD-1.txt',
    messages: 'KRONOS_MIDI_SysEx.txt',
    voiceModel: 'SysExParams/VoiceModels/HD-1.txt',
    effects: 'Effect.txt',
    implementation: 'KRONOS_MIDI_Implementation.pdf',
  },
  // The table prints no message per row. Its KARMA rows' ids and its Drum Track rows' ids are the
  // program's own (TYP 0 PID 0 is Oscillator Mode, KARMA Tempo and Pattern Bank), and the archive has
  // a parameter change for each of the two: sent by those, every id is unique.
  functions: [
    { group: /^KARMA /, code: '6D', message: 'KARMA Parameter Change' },
    { group: /^Drum Track/, code: '6E', message: 'Drum Track Parameter Change' },
  ],
  // Two settings of one block printed under one name: the voice model's own list tells them apart.
  renames: [
    {
      group: /^OSC[12] Mod\.Mixer[12]$/,
      name: 'Amount A',
      pid: 10,
      to: 'Offset Amount',
      why: 'the AMS Mixer prints "Amount A" twice, for parameter 2 (-99~+99) and parameter 10 (-199~+199); the voice model\'s list (SysExParams/VoiceModels/HD-1.txt) calls parameter 10 "Offset: Amount", beside "Offset: Offset"',
    },
  ],
};
