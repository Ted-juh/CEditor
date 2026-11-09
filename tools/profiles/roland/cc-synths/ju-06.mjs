// JU-06 (Boutique). MIDI Implementation Chart, version 1.01, Aug. 03, 2016. The document's second
// chart is the JU-06's controller mode, which sends the JUNO-106's own controller numbers.

export default {
  id: 'roland-ju-06',
  name: 'Roland JU-06',
  family: 'Boutique',
  chart: 'ju-06',
  description: 'Roland Boutique JU-06 (JUNO-106 model), from the control changes in its MIDI Implementation Chart.',
  groups: [
    ['LFO', /^LFO\s+/],
    ['DCO', /^DCO\s+/],
    ['HPF', /^HPF\s+/],
    ['VCF', /^VCF\s+/],
    ['VCA', /^VCA\s+/],
    ['ENV', /^ENV\s+/],
    ['Delay', /^DELAY\s+/],
    ['Chorus', /^CHORUS\s+/],
    ['Performance', /^(MODULATION|PORTAMENTO|PORTAMENTO TIME|EXPRESSION PEDAL|HOLD|BEND RANGE|ASSIGN MODE)$/],
  ],
  presets: {
    banks: [{ id: 'patch', label: 'Patch', role: 'user', writable: false, startSlot: 0, slotCount: 64, programBase: 0 }],
    recall: { kind: 'pc' },
  },
};
