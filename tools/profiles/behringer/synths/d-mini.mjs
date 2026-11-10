// Behringer D MINI: the MIDI controller table of its Quick Start Guide.

export default {
  id: 'behringer-d-mini',
  name: 'Behringer D MINI',
  family: 'D',
  description: 'Behringer D MINI analog mini synthesizer: every controller of its quick start guide\'s MIDI table, with the values it prints.',
  document: { title: 'D MINI Quick Start Guide', file: 'QSG_BE_0722-AAW_D-MINI.pdf', url: 'https://cdn-media.empowertribe.com/2383dfeba762497d820d2940fb8ce0c8/QSG_BE_0722-AAW_D-MINI.pdf' },
  // Voice Mode's last band is printed `112-127`, after `88-112`.
  fix: { 40: (r) => ({ bands: r.bands.map((b) => (/^112\s*-\s*127$/.test(b.range) ? { ...b, range: '113-127' } : b)) }) },
  fixNotes: { 40: 'Voice Mode printed 88-112 then 112-127: 113-127' },
  pages: [47],
};
