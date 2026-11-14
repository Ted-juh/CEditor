// Nord Wave: the MIDI controller list of its user manual.

export default {
  id: 'nord-wave',
  name: 'Nord Wave',
  family: 'Wave',
  description: 'Nord Wave (2007) synthesizer: every control of its manual\'s MIDI controller list.',
  document: { title: 'Nord Wave User Manual, OS v2.x, Edition 2.0', file: 'Nord Wave English User Manual v2.x Edition 2.0.pdf', url: 'https://www.nordkeyboards.com/wt/documents/289/Nord%20Wave%20English%20User%20Manual%20v2.x%20Edition%202.0.pdf' },
  pages: [61],
  notes: ['The manual: an on/off button is 0 off and 127 on; a button that steps through settings starts at 0 and goes up in equal steps. Each Slot, A and B, has its MIDI channel; set the channel variable to the one to edit.', 'The list\'s third column, the General MIDI name of each controller number, is kept in the descriptions.'],
};
