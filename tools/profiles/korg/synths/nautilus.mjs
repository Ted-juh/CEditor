// NAUTILUS. Korg's NAUTILUS MIDI Implementation archive (NAUTILUS_MIDIimp.zip, 2022.09.22), the same
// form as the KRONOS's: an HD-1 program, every row of SysExDumps/Prog_HD-1.txt with a parameter id
// but the scenes and the step sequencers, sent by Parameter Change (function 43, under the
// NAUTILUS's own header F0 42 3g 00 01 5D) and read back from the Current Object Dump of the program.

export default {
  id: 'korg-nautilus',
  name: 'Korg NAUTILUS',
  family: 'NAUTILUS',
  format: 'kronos',
  effectsTable: 'nautilus-effects',
  scope: 'An HD-1 program only: a program of an EXi bank is laid out in Prog_EXi_Common.txt and Prog_EXi.txt, not here.',
  coverageOf: 'an HD-1 program',
  otherLength: 'a program of an EXi bank, laid out otherwise, comes back under the same header',
  description: 'Korg NAUTILUS: the oscillators, filters, envelopes, effects and controllers of an HD-1 program by SysEx parameter change, read back from the current program.',
  document: {
    title: 'NAUTILUS MIDI Implementation',
    archive: 'NAUTILUS_MIDIimp.zip',
    archiveDate: '2022-09-22',
    url: 'https://www.korg.com/us/support/download/manual/0/873/4923/',
    object: 'SysExDumps/Prog_HD-1.txt',
    messages: 'NAUTILUS_MIDI_SysEx.txt',
    effects: 'SysExDumps/Effect.txt',
    implementation: 'NAUTILUS_MIDI_MIDI_Implentaion.txt',
  },
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
};
