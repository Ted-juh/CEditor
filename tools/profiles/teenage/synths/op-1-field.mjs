// teenage engineering OP-1 field: the MIDI table of its guide.

export default {
  id: 'te-op-1-field',
  name: 'teenage engineering OP-1 field',
  family: 'OP',
  description: "teenage engineering OP-1 field: every control of its guide's table of incoming MIDI control changes.",
  document: { title: 'OP-1 field guide', file: 'op-1-field.html', url: 'https://teenage.engineering/guides/op-1', saved: '2026-11-10' },
  pages: [1],
  tables: /incoming midi control change/,
  groupOf: (name) => (/^mixer/.test(name) ? 'Mixer' : /^synth|^drum/.test(name) ? 'Sound' : /^patch fx/.test(name) ? 'Patch FX' : /^patch lfo/.test(name) ? 'Patch LFO' : /^master/.test(name) ? 'Master' : /^tape/.test(name) ? 'Tape' : 'Global'),
  notes: ['The mixer rows answer on the channels of the four mixer tracks (`1 - 4 *`); the rest on any. A synth and a drum sound share controllers 46 - 53: the guide names both, and the profile both in one name.']
};
