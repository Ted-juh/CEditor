// Arturia MicroFreak: the CC chart of its user manual (Appendix D).

export default {
  id: 'arturia-microfreak',
  name: 'Arturia MicroFreak',
  family: 'Freak',
  description: 'Arturia MicroFreak hybrid synthesizer: every controller of its manual\'s CC chart (Appendix D).',
  document: { title: 'MicroFreak User Manual 5.0.1', file: 'microfreak_Manual_5_0_1_EN.pdf', url: 'https://dl.arturia.net/products/microfreak/manual/microfreak_Manual_5_0_1_EN.pdf' },
  // The chart has no sections: a row's group is the block its name begins with.
  groupOf: (name) => [[/^Oscillator/, 'Oscillator'], [/^Filter/, 'Filter'], [/^Cycling env/i, 'Cycling Env'], [/^Envelope/, 'Envelope'], [/^ARP\/SEQ/, 'Arp/Seq'], [/^LFO/, 'LFO']].find(([re]) => re.test(name))?.[1] ?? name.split(' ')[0],
  notes: ['Oscillator Wave (CC 10) chooses within the oscillator type CC 9 selects; for the Speech oscillator the manual\'s Appendix A prints which values choose which category of words. That is not laid out.'],
  pages: [146, 147],
};
