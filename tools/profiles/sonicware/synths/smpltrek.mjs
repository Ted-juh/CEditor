// Sonicware SmplTrek: its MIDI implementation chart.

export default {
  id: 'sonicware-smpltrek',
  name: 'Sonicware SmplTrek',
  family: 'SmplTrek',
  description: 'Sonicware SmplTrek sampler: every control change its MIDI implementation chart marks recognized.',
  document: { title: 'SmplTrek MIDI implementation chart (v2)', file: 'SmplTrek_v2_manual_MIDI_en.pdf', url: 'https://www.sonicware.co.jp/DL/SmplTrek/DOC/SmplTrek_v2_manual_MIDI_en.pdf' },
  // `※1 PROJECT CHANNEL`, `※2 TRACK CHANNEL`.
  channelOf: (group) => (group === 'Project' ? 'projectChannel' : 'channel'),
  variables: { projectChannel: 1 },
  notes: ['The chart puts the project\'s controllers on the project channel and a track\'s on its own: set projectChannel and the channel variable to the instrument\'s.']
};
