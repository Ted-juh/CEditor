// Nord Lead A1: the MIDI controller list of its user manual.

export default {
  id: 'nord-lead-a1',
  name: 'Nord Lead A1',
  family: 'Lead',
  description: 'Nord Lead A1 four-slot virtual analog synthesizer: every control of its manual\'s MIDI controller list.',
  document: { title: 'Nord Lead A1 User Manual, OS v1.3x, Edition F', file: 'Nord Lead A1 English User Manual v1.3x Edition F.pdf', url: 'https://www.nordkeyboards.com/wt/documents/88/Nord%20Lead%20A1%20English%20User%20Manual%20v1.3x%20Edition%20F.pdf' },
  pages: [34],
  notes: ['The manual: panel controls send their controllers on the Global MIDI channel, to and from the Slot in focus (the Slot buttons; Slot Focus is CC 119); a Slot\'s own MIDI channel reaches that Slot only. Set the channel variable to whichever is to be edited.', 'The manual: an on/off button is 0 off and 127 on; a button that steps through settings starts at 0 and goes up in equal steps.'],
};
