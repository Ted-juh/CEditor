// teenage engineering TX-6: the MIDI table of its guide.

export default {
  id: 'te-tx-6',
  name: 'teenage engineering TX-6',
  family: 'TX',
  description: "teenage engineering TX-6 mixer: every control of its guide's table of incoming MIDI control messages, the master on channel 7.",
  document: { title: 'TX-6 guide', file: 'tx-6.html', url: 'https://teenage.engineering/guides/tx-6', saved: '2026-11-10' },
  pages: [1],
  tables: /incoming midi control/,
  // The six channels' controls answer on their channel (1 - 6), the master's on 7.
  channelOf: (printed) => (printed === '7' ? 'masterChannel' : 'channel'),
  variables: { masterChannel: 7 },
  groupOf: (name) => (/^(?:main|aux volume|cue)/.test(name) ? 'Master' : /^synth/.test(name) ? 'Synth' : /^EQ|compressor|filter/.test(name) ? 'EQ' : /send/.test(name) ? 'Sends' : 'Channel'),
  notes: ['The channel variable is the mixer channel\'s (1 - 6) to edit; the master\'s controls are on masterChannel, 7. The guide\'s other table, the controllers the TX-6 sends in controller mode, is not laid out.']
};
