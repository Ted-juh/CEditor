// Sonicware LIVEN Bass & Beats: its MIDI implementation chart.

export default {
  id: 'sonicware-liven-bass-and-beats',
  name: 'Sonicware LIVEN Bass & Beats',
  family: 'LIVEN',
  description: 'Sonicware LIVEN Bass & Beats groovebox: every control change its MIDI implementation chart marks recognized.',
  document: { title: 'LIVEN Bass & Beats MIDI implementation chart (r1)', file: 'bassandbeats_manual_MIDI_en_r1.pdf', url: 'https://www.sonicware.co.jp/DL/LIVEN_BB/DOC/bassandbeats_manual_MIDI_en_r1.pdf' },
  // `*2 PT.CH`: the pattern's block; `*3 BA.CH / DR.CH`: the bass and drum tracks'.
  channelOf: (group) => (group === 'Pattern' ? 'patternChannel' : 'channel'),
  variables: { patternChannel: 1 },
  notes: ['The chart puts the pattern\'s controllers on the pattern channel (PT.CH) and the track ones on the bass\'s or the drums\' (BA.CH, DR.CH); a track controller names what it does on each (`MEMORY / LEVEL KICK`), the second for the drum track.']
};
