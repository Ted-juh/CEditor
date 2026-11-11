// Twisted Electrons deton8: the MIDI CC Reference of its web manual.

export default {
  id: 'twisted-electrons-deton8',
  name: 'Twisted Electrons deton8',
  family: 'deton8',
  description: 'Twisted Electrons deton8 drum machine: every controller of its manual\'s MIDI CC Reference, each voice\'s on its own controller.',
  document: { title: 'deton8 manual (web page)', file: 'manual-deton8-index.html', url: 'https://www.twisted-electrons.com/cdn/shop/t/11/assets/manual-deton8-index.html', saved: '2026-11-11' },
  controllerTables: ['MIDI CC Reference'],
  // `By default, Deton8 listens on MIDI channel 10`: the channel variable's default.
  defaultChannel: /By default, Deton8 listens on MIDI channel (\d+)/,
};
