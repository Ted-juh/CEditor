// teenage engineering OP-XY: the MIDI table of its guide.

export default {
  id: 'te-op-xy',
  name: 'teenage engineering OP-XY',
  family: 'OP',
  description: "teenage engineering OP-XY: every control of its guide's MIDI CC reference table.",
  document: { title: 'OP–XY guide: midi reference', file: 'op-xy-midi-references.html', url: 'https://teenage.engineering/guides/op-xy/midi-references', saved: '2026-11-10' },
  pages: [1],
  tables: /CCs control which parameter/,
  groupOf: (name) => (/^track/.test(name) ? 'Track' : /scene|project/.test(name) ? 'Scenes' : 'Global'),
  notes: ['The track rows answer on the track\'s channel (1 - 16); set the channel variable to the track to edit.']
};
