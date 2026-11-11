// Twisted Electrons MEGAfm: the MIDI implementation of its PDF manual, linked from the support grid
// of Twisted Electrons' home page.

export default {
  id: 'twisted-electrons-megafm',
  name: 'Twisted Electrons MEGAfm',
  family: 'MEGAfm',
  description: "Twisted Electrons MEGAfm (MEGAfm II) FM synthesizer: every controller its manual's MIDI implementation gives.",
  document: { title: 'MEGAfm user manual', file: 'manual-megafm.pdf', url: 'https://www.twisted-electrons.com/cdn/shop/t/11/assets/manual-megafm.pdf' },
  pdf: { form: 'parameter', pages: [27, 29] },
  controllerTables: ['MIDI Implementation'],
  // The OPERATOR 4 block prints its first row as `Op3 Total Level`; every other row of the block is
  // Op4's, and OPERATOR 3 has its own Op3 Total Level (CC 16).
  notes: ['The VIBRATO block prints its two rows as "Arp Rate" (CC 48) and "Arp Depth" (CC 13), the names of the ARP block\'s; they are laid out as printed, in the VIBRATO group, which says what they are.'],
  renames: [{ section: 'OPERATOR 4', name: 'Op3 Total Level', to: 'Op4 Total Level', why: 'printed "Op3 Total Level" under OPERATOR 4, whose other rows are all Op4\'s; OPERATOR 3 has its own Op3 Total Level (CC 16)' }],
};
