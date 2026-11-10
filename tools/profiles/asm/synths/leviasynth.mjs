// ASM Leviasynth: the MIDI CC chart of its owner's manual (sorted by module).

export default {
  id: 'asm-leviasynth',
  name: 'ASM Leviasynth',
  family: 'Leviasynth',
  description: 'ASM Leviasynth keyboard 16-voice synthesizer: every controller of its owner\'s manual\'s MIDI CC chart.',
  document: { title: "Leviasynth Keyboard Owner's Manual 1.2.1", file: 'Leviasynth_Keyboard_Owners_Manual_1.2.1.pdf', url: 'https://www.mecldata.com/download/asm/Leviasynth_Keyboard_Owners_Manual_1.2.1.pdf' },
  read: 'cc',
  pages: [170, 171],
  notes: ["The manual names NRPN as a Param TX/RX choice and does not list the NRPNs."],
};
