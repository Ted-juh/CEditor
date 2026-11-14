// Expressive E Osmose: the MIDI implementation chart of its sound engine, firmware 2.3.

export default {
  id: 'expressive-e-osmose',
  name: 'Expressive E Osmose',
  family: 'Osmose',
  description: 'Expressive E Osmose (and Osmose CE) sound engine: the controllers its MIDI implementation chart marks recognized, the macros, gains and global effects, on the MPE master channel.',
  document: { title: 'Osmose MIDI Implementation Chart v.2.0, firmware 2.3.x rev. A (2026-07)', file: 'Osmose_MIDIImplementationChart_v2.3.x_A.pdf', url: 'https://expressive-e.s3.us-east-1.amazonaws.com/CLA-Osmose/Osmose_MIDIImplementationChart_v2.3.x_A.pdf (linked from the help center\'s "Osmose sound engine MIDI Implementation Chart")' },
  pages: [2, 3],
  groupOf: (name) => (/^Macro/.test(name) ? 'Macros' : /FX|Compressor/.test(name) ? 'Effects' : 'Levels'),
  notes: [
    'The chart is for USB MIDI port 2, the sound engine port, and every controller here answers on the master channel (channel 1, the MPE master): the channel variable.',
    'The macros\' destinations are set per preset, so what each one changes depends on the preset loaded.',
  ],
};
