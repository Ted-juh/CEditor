// Nord Stage 2 EX: the MIDI controller list of its user manual.

export default {
  id: 'nord-stage-2-ex',
  name: 'Nord Stage 2 EX',
  family: 'Stage',
  description: 'Nord Stage 2 EX stage keyboard: every control of its manual\'s MIDI controller list.',
  document: { title: 'Nord Stage 2 EX User Manual, OS v2.x, Edition B', file: 'Nord Stage 2 EX English User Manual v2.X Edition B.pdf', url: 'https://www.nordkeyboards.com/wt/documents/173/Nord%20Stage%202%20EX%20English%20User%20Manual%20v2.X%20Edition%20B.pdf' },
  pages: [52],
  notes: ['The Stage 2\'s manual: panel actions are sent, and controllers received, on the Global channel (MIDI Ctrl Change Mode). Set the channel variable to it.'],
};
