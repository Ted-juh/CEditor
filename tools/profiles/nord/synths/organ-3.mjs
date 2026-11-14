// Nord Organ 3: the MIDI controller list of its user manual.

export default {
  id: 'nord-organ-3',
  name: 'Nord Organ 3',
  family: 'Organ',
  description: 'Nord Organ 3 combo organ: every control of its manual\'s MIDI controller list, the drawbars on the Upper and Lower manuals\' channels and the bass pedal\'s on the Pedal channel.',
  document: { title: 'Nord Organ 3 User Manual, OS v1.0x, Edition C', file: 'Nord Organ 3 User Manual v1.0x Edition C.pdf', url: 'https://www.nordkeyboards.com/wt/documents/862/Nord%20Organ%203%20User%20Manual%20v1.0x%20Edition%20C.pdf' },
  pages: [33],
  // The asterisk: "available for both the Upper, Lower and Pedal manuals (on their respective MIDI
  // channels)". The nine drawbars are the Upper's and Lower's; the two marked `Bass Pedal` are the
  // pedal's (on its channel, the controllers of drawbars 1 and 2).
  manuals: { Upper: 'channel', Lower: 'lowerChannel', Pedal: 'pedalChannel' },
  variables: { lowerChannel: 2, pedalChannel: 3 },
  manualsOf: (row, star) => (!star ? ['Upper'] : /^Bass Pedal/.test(row.name) ? ['Pedal'] : ['Upper', 'Lower']),
  notes: ['The channel variables are the Upper, Lower and Pedal manuals\' MIDI channels (the System menu); 1, 2 and 3 here, which may not be the instrument\'s. A row without the asterisk is laid out on the Upper channel.'],
};
