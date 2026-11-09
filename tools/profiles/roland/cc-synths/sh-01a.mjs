// SH-01A (Boutique). MIDI Implementation Chart, version 1.00, Aug. 8, 2017. The chart's Control
// Change rows give spans (1, 3, 5, 11, 12-31, 64, 65, 71-87) and point to the "Control change
// list" printed beside them, which names 42 of them; the span 71-87 includes 84, which the list
// does not name.

export default {
  id: 'roland-sh-01a',
  name: 'Roland SH-01A',
  family: 'Boutique',
  chart: 'sh-01a',
  description: 'Roland Boutique SH-01A (SH-101 model), from its MIDI Implementation Chart\'s Control change list.',
  names: {
    31: { name: 'PORTAMENTO MODE', why: 'printed "PORTAMENT MODE", a misprint' },
  },
  groups: [
    ['LFO', /^LFO\s+/],
    ['VCO', /^(VCO\s+|TUNE$|NOISE MODE$)/],
    ['VCF', /^VCF\s+/],
    ['VCA', /^VCA\s+/],
    ['ENV', /^ENV\s+/],
    ['Chord', /^CHORD\s+/],
    ['Performance', /^(MODULATION|PORTAMENTO|PORTAMENTO TIME|PORTAMENTO MODE|EXPRESSION PEDAL|HOLD|TRANSPOSE SW|ASSIGN MODE)$/],
  ],
  presets: {
    banks: [{ id: 'patch', label: 'Patch', role: 'user', writable: false, startSlot: 0, slotCount: 64, programBase: 0 }],
    recall: { kind: 'pc' },
  },
};
