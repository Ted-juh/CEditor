// Nord Stage 2: the MIDI controller list of its user manual.

export default {
  id: 'nord-stage-2',
  name: 'Nord Stage 2',
  family: 'Stage',
  description: 'Nord Stage 2 stage keyboard: every control of its manual\'s MIDI controller list.',
  document: { title: 'Nord Stage 2 User Manual, OS v1.7x, Edition J', file: 'Nord Stage 2 English User Manual v1.7x Edition J.pdf', url: 'https://www.nordkeyboards.com/wt/documents/257/Nord%20Stage%202%20English%20User%20Manual%20v1.7x%20Edition%20J.pdf' },
  pages: [52],
  notes: ['The manual: panel actions are sent, and controllers received, on the Global channel (MIDI Ctrl Change Mode). Set the channel variable to it.'],
};
