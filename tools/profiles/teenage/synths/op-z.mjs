// teenage engineering OP-Z: the MIDI table of its guide.

export default {
  id: 'te-op-z',
  name: 'teenage engineering OP-Z',
  family: 'OP',
  description: "teenage engineering OP-Z: every control of its guide's incoming MIDI table, the per-track parameters on the track's channel.",
  document: { title: 'OP-Z guide: midi', file: 'op-z-midi.html', url: 'https://teenage.engineering/guides/op-z/midi', saved: '2026-11-10' },
  pages: [1],
  // The incoming table: the per-track parameters (absolute; the relative controllers, 32 - 49, are
  // encoder steps, not laid out), system and track. Its UI rows (active track, parameter page) say
  // what the screen shows.
  tables: /^(?:relative|\/)$/,
  leaveOut: ['active track', 'parameter page', 'TRACK GAIN (RELATIVE)'],
  groupOf: (name) => (/^(?:parameter|filter|envelope|lfo|fx|pan|volume|portamento|note style)/i.test(name) ? 'Track' : /^(?:TRACK|quantize|note length)/i.test(name) ? 'Track Steps' : 'System'),
  notes: ['The channel variable is the track\'s: each of the OP-Z\'s 16 tracks has its own channel (1 - 16 by default), and its parameters answer on it. Set it to the track to edit; the rows marked `any` answer on every channel.', 'The guide prints a second set of controllers, 32 - 49, that step the same parameters up or down (1, 127); they are not laid out.']
};
