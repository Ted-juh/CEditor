// Sonicware Lofi-12 XT: its MIDI implementation chart.

export default {
  id: 'sonicware-lofi-12-xt',
  name: 'Sonicware Lofi-12 XT',
  family: 'Lofi-12 XT',
  description: 'Sonicware Lofi-12 XT sampler: every control change its MIDI implementation chart marks recognized.',
  document: { title: 'Lofi-12 XT MIDI implementation chart (v1.5)', file: 'Lofi-12XT_v1_5_manual_MIDI_en.pdf', url: 'https://www.sonicware.co.jp/DL/Lofi-12XT/DOC/Lofi-12XT_v1_5_manual_MIDI_en.pdf' },
  // `Works in PROJECT CH`: the master's, the master effect's, delay and reverb's, the inputs'; the mixer level and the rest a track's (or AUTO).
  channelOf: (group, name) => (/^(?:Global|Reverb\/Delay|Ext|Usb)$/.test(group) || (group === 'Mixer' && !/^MIXER LEVEL$/.test(name)) ? 'projectChannel' : 'channel'),
  variables: { projectChannel: 1 },
  notes: ['The chart puts the master, master effect, delay, reverb and input controllers on the project channel and the track ones on the track\'s (or the AUTO channel): set projectChannel and the channel variable to the instrument\'s.']
};
