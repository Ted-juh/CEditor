// Nord Drum 3P: the MIDI controller list of its user manual.

export default {
  id: 'nord-drum-3p',
  name: 'Nord Drum 3P',
  family: 'Drum',
  description: 'Nord Drum 3P drum synthesizer: every control of its manual\'s MIDI CC list.',
  document: { title: 'Nord Drum 3P User Manual, OS v1.x, Edition C', file: 'Nord Drum 3P English User Manual v1.x Edition C.pdf', url: 'https://www.nordkeyboards.com/wt/documents/97/Nord%20Drum%203P%20English%20User%20Manual%20v1.x%20Edition%20C.pdf' },
  pages: [15],
  notes: ['The manual: a control has the same controller on every drum channel, sent on the Global MIDI channel to the channel selected (Channel Select, CC 70). Set the channel variable to the Global MIDI channel.', 'Tone Pitch is two controllers, MSB and LSB, laid out as printed.'],
};
