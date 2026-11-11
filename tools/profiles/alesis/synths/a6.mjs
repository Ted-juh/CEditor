// Alesis A6 Andromeda: the SYSEX AND NRPN PARAMETER CHART of its MIDI Sysex Specification, sent by the
// specification's MIDI Editing message (opcode 0E).

export default {
  id: 'alesis-a6-andromeda',
  name: 'Alesis A6 Andromeda',
  family: 'Andromeda',
  description: 'Alesis A6 Andromeda analog polysynth: every program and mix parameter its MIDI Sysex Specification\'s chart gives a range, by its MIDI Editing message, and the mode select.',
  document: {
    title: 'A6 Midi Sysex Specification',
    file: 'a6syx.pdf',
    url: 'https://www.alesis.com/rscdn/1571/documents/a6syx.pdf (linked from https://www.alesis.com/products/view/a6-andromeda)',
  },
  // The opcodes' section, kept as printed: what the profile sends and answers to.
  blocks: {
    editing: { start: /^\s*0E - MIDI Editing/, end: /^\s*DEVICE INQUIRY/ },
    modeSelect: { start: /^\s*0D - MIDI Mode Select/, end: /^\s*0E - MIDI Editing/ },
    inquiry: { start: /^DEVICE INQUIRY/, end: /^PROGRAM DATA FORMAT/ },
    programDump: { start: /^\s*00 - MIDI Program Dump\s/, end: /^\s*01 - MIDI Program Dump Request/ },
  },
};
