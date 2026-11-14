// Nord C1: the MIDI controller list of its user manual.

export default {
  id: 'nord-c1',
  name: 'Nord C1',
  family: 'Organ',
  description: 'Nord C1 combo organ: every control of its manual\'s MIDI controller list, each on the channels its comment column names.',
  document: { title: 'Nord C1 User Manual, OS v1.0x', file: 'Nord C1 English User Manual v1.0x Edition 1.x.pdf', url: 'https://www.nordkeyboards.com/wt/documents/180/Nord%20C1%20English%20User%20Manual%20v1.0x%20Edition%201.x.pdf' },
  pages: [17],
  // The comment column names the channels a row is on: `Upper, Lower and Bass MIDI channel`.
  manuals: { Upper: 'channel', Lower: 'lowerChannel', Bass: 'bassChannel' },
  variables: { lowerChannel: 2, bassChannel: 3 },
  extraIsChannels: true,
  manualsOf: (row) => ['Upper', 'Lower', 'Bass'].filter((m) => new RegExp(`\\b${m}\\b`).test(row.extra ?? 'Upper')),
  notes: ['The channel variables are the Upper, Lower and Bass MIDI channels (the System menu); 1, 2 and 3 here, which may not be the instrument\'s.'],
};
