// Sonicware CyDrums: its MIDI implementation chart.

export default {
  id: 'sonicware-cydrums',
  name: 'Sonicware CyDrums',
  family: 'CyDrums',
  description: 'Sonicware CyDrums drum machine (V2): every control change its MIDI implementation chart marks recognized.',
  document: { title: 'CyDrums V2 MIDI implementation chart', file: 'CyDrums_V2_manual_MIDI_en.pdf', url: 'https://www.sonicware.co.jp/DL/CyDrums/DOC/CyDrums_V2_manual_MIDI_en.pdf' },
  // `Works in PROJECT CH`: the pattern and master's and the external inputs'; the rest a track's (or AUTO).
  channelOf: (group) => (/^(?:Pattern\/Master|Ext)$/.test(group) ? 'projectChannel' : 'channel'),
  variables: { projectChannel: 1 },
  notes: ['The chart puts the pattern, master and external input controllers on the project channel and the rest on the track\'s (or the AUTO channel): set projectChannel and the channel variable to the instrument\'s.']
};
