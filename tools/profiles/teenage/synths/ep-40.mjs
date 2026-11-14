// teenage engineering EP-40 Riddim: the MIDI table of its guide.

export default {
  id: 'te-ep-40',
  name: 'teenage engineering EP-40 Riddim',
  family: 'EP',
  description: "teenage engineering EP-40 Riddim: every control of its guide's MIDI CC map.",
  document: { title: 'EP-40 Riddim guide: system', file: 'ep-40-system.html', url: 'https://teenage.engineering/guides/ep-40/system', saved: '2026-11-10' },
  pages: [1],
  tables: /adjusted with midi control changes/,
  // The guide prints `1-27` for each, the EP-133's same table `1-127`.
  fixRange: { '1-27': '1-127' },
  groupOf: () => 'Global',
};
