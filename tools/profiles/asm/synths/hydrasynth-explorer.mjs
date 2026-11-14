// ASM Hydrasynth Explorer: the MIDI CC chart of its owner's manual (sorted by module).

export default {
  id: 'asm-hydrasynth-explorer',
  name: 'ASM Hydrasynth Explorer',
  family: 'Hydrasynth',
  description: 'ASM Hydrasynth Explorer portable 8-voice wave-morphing synthesizer: every controller of its owner\'s manual\'s MIDI CC chart.',
  document: { title: "Hydrasynth Explorer Owner's Manual 2.2.0", file: 'Hydrasynth_Explorer_Owners_Manual_2.2.0.pdf', url: 'https://www.mecldata.com/download/asm/Hydrasynth_Explorer_Owners_Manual_2.2.0.pdf' },
  read: 'cc',
  // The chart runs onto page 95, whose right-hand table is the chart again, sorted by number.
  pages: [94, 95],
  leftOnly: [95],
  notes: ["Its NRPN specification, published for the Keyboard and Desktop at firmware 1.5, is not taken to be the Explorer's: this is its manual's chart."],
};
