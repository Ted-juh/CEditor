// NAUTILUS. Korg's NAUTILUS MIDI Implementation archive (NAUTILUS_MIDIimp.zip, 2022.09.22), the same
// form as the KRONOS's: an HD-1 program, every row of SysExDumps/Prog_HD-1.txt with a parameter id
// but the scenes and the step sequencers, sent by Parameter Change (function 43, under the
// NAUTILUS's own header F0 42 3g 00 01 5D) and read back from the Current Object Dump of the program.

export default {
  id: 'korg-nautilus',
  name: 'Korg NAUTILUS',
  family: 'NAUTILUS',
  format: 'kronos',
  description: 'Korg NAUTILUS: the oscillators, filters, envelopes, effects and controllers of an HD-1 program by SysEx parameter change, read back from the current program.',
  document: {
    title: 'NAUTILUS MIDI Implementation',
    archive: 'NAUTILUS_MIDIimp.zip',
    archiveDate: '2022-09-22',
    url: 'https://www.korg.com/us/support/download/manual/0/873/4923/',
    object: 'SysExDumps/Prog_HD-1.txt',
    messages: 'NAUTILUS_MIDI_SysEx.txt',
    implementation: 'NAUTILUS_MIDI_MIDI_Implentaion.txt',
  },
  // The archive has a Scene Parameter Change (6D) and an Arp/Drum Track Parameter Change (6E), laid out
  // as Parameter Change, and names neither for any row.
  citedMessages: ['6D', '6E'],
  functions: [],
  leaveOut: [
    {
      group: /^Scene /,
      label: 'the scenes',
      why: 'the scenes\' rows (their arpeggiator and drum track settings among them) share ids with X-Y Control\'s and the program\'s own (Scene Common and Scene 1; Scenes 2 to 4 are Scene 1\'s settings again), so they do not go by Parameter Change; whether they go by Scene Parameter Change (6D) or Arp/Drum Track Parameter Change (6E) the archive does not say, and either makes every id unique',
    },
    {
      group: /^Step Seq\. /,
      label: 'the step sequencers',
      why: 'the step sequencers\' ids are unique under Parameter Change (43) and under Arp/Drum Track Parameter Change (6E) alike, and the archive does not say which message they go by',
    },
  ],
};
