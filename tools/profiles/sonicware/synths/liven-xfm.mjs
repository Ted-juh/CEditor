// Sonicware LIVEN XFM: its MIDI implementation chart.

export default {
  id: 'sonicware-liven-xfm',
  name: 'Sonicware LIVEN XFM',
  family: 'LIVEN',
  description: 'Sonicware LIVEN XFM FM groovebox: every control change its MIDI implementation chart marks recognized.',
  document: { title: 'LIVEN XFM MIDI implementation chart (r2)', file: 'xfm_manual_MIDI_en_r2.pdf', url: 'https://www.sonicware.co.jp/DL/LIVEN_xfm/DOC/xfm_manual_MIDI_en_r2.pdf' },
  // `*1 PT.CH`: the pattern's block; `*2 T1.CH - T4.CH`: the four tracks'.
  channelOf: (group) => (group === 'Pattern' ? 'patternChannel' : 'channel'),
  variables: { patternChannel: 1 },
  notes: ['The chart puts the pattern\'s controllers on the pattern channel (PT.CH) and a track\'s on its own (T1.CH - T4.CH): set patternChannel and the channel variable to the instrument\'s, which the chart does not print.']
};
