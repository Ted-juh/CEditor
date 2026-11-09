// JU-06A (Boutique). MIDI Implementation Chart, version 1.01, Sep. 5, 2019. The document's second
// chart is what the JU-06A sends as a controller, not what it receives.

export default {
  id: 'roland-ju-06a',
  name: 'Roland JU-06A',
  family: 'Boutique',
  chart: 'ju-06a',
  description: 'Roland Boutique JU-06A (JUNO-60 and JUNO-106 models), from the control changes in its MIDI Implementation Chart.',
  groups: [
    ['LFO', /^LFO\s+/],
    ['DCO', /^DCO\s+/],
    ['HPF', /^HPF\s+/],
    ['VCF', /^VCF\s+/],
    ['VCA', /^VCA\s+/],
    ['ENV', /^ENV\s+/],
    ['Delay', /^DELAY\s+/],
    ['Chorus', /^CHORUS\s+/],
    ['Performance', /^(MODULATION|PORTAMENTO SW|PORTAMENTO TIME|EXPRESSION PEDAL|HOLD|BEND RANGE|TEMPO SYNC)$/],
    ['Common', /^POLY\b/],
  ],
  presets: {
    banks: [{ id: 'patch', label: 'Patch', role: 'user', writable: false, startSlot: 0, slotCount: 64, programBase: 0 }],
    recall: { kind: 'pc' },
  },
};
