// Modor NF-1 (and NF-1m): the MIDI controller list of the NF-1 user manual (version 6, OS017), and the
// preset vowels its formant section prints. Modor's downloads page gives the NF-1m the same manual.

export default {
  id: 'modor-nf-1',
  name: 'Modor NF-1 / NF-1m',
  family: 'NF-1',
  description: 'Modor NF-1 and NF-1m polyphonic synthesizers: every setting of the manual\'s MIDI controller list, with the preset vowels on the formant controllers.',
  document: { title: 'Modor NF-1 user manual, version 6 for firmware OS017', file: 'UsersManualNF-1_v6.pdf', url: 'https://modormusic.com/downloads/UsersManualNF-1_v6.pdf', linkedFrom: 'https://modormusic.com/downloads.html', pages: [71, 74] },
  formants: [31, 31],
};
