// Nord C2D: the MIDI controller list of its user manual.

export default {
  id: 'nord-c2d',
  name: 'Nord C2D',
  family: 'Organ',
  description: 'Nord C2D combo organ: every control of its manual\'s MIDI controller list, the asterisked ones on the Swell and Great manuals\' channels.',
  document: { title: 'Nord C2D User Manual, OS v1.1x, Edition C', file: 'Nord C2D English User Manual v1.1x edition C.pdf', url: 'https://www.nordkeyboards.com/wt/documents/187/Nord%20C2D%20English%20User%20Manual%20v1.1x%20edition%20C.pdf' },
  pages: [23],
  // The asterisk: "available for both the Swell. Bass and/or Great manuals (on their respective MIDI
  // channels)", which of the three not said; the drawbars are under `Drawbars - Sep. for Swell, Bass
  // and Great MIDI CH`. So the drawbars are laid out on all three, the other asterisked rows on the
  // Swell and the Great.
  manuals: { Swell: 'channel', Great: 'greatChannel', Bass: 'bassChannel' },
  variables: { greatChannel: 2, bassChannel: 3 },
  manualsOf: (row, star) => (/^Drawbar [AB]\d/.test(row.name) ? ['Swell', 'Great', 'Bass'] : star ? ['Swell', 'Great'] : ['Swell']),
  notes: ['The channel variables are the Swell, Great and Bass manuals\' MIDI channels (the System menu); 1, 2 and 3 here, which may not be the instrument\'s. A row without the asterisk is laid out on the Swell channel; the asterisked rows other than the drawbars on the Swell and Great, the asterisk\'s `Bass and/or` not saying for which of them the Bass is meant.'],
};
