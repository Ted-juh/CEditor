// JD-08 (Boutique). The MIDI Implementation Chart in the JD-08 Reference Manual (version 1.00,
// Oct. 13, 2021), p59-61.

export default {
  id: 'roland-jd-08',
  name: 'Roland JD-08',
  family: 'Boutique',
  chart: 'jd-08',
  description: 'Roland Boutique JD-08 (JD-800 model), from the control changes in the MIDI Implementation Chart of its Reference Manual.',
  documentTitle: 'Reference Manual, MIDI Implementation Chart',
  names: {
    9: { name: 'TVF RESONANCE', why: 'printed "TVF RESONANSE", a misprint' },
  },
  ranges: {
    72: { min: 0, max: 108, why: 'the chart prints "(RX: 0-108)": the instrument receives 0 - 108 on this controller' },
  },
  groups: [
    ['LFO 1', /^LFO1\s+/],
    ['LFO 2', /^LFO2\s+/],
    ['Pitch Envelope', /^PITCH ENVELOPE\s+/],
    ['Filter Envelope', /^FILTER ENVELOPE\s+/],
    ['Amp Envelope', /^AMP ENVELOPE\s+/],
    ['Pitch', /^PITCH\s+/],
    ['WG', /^(WG\s+|WAVEFORM$)/],
    ['TVF', /^TVF\s+/],
    ['TVA', /^TVA\s+/],
    ['Effects', /^FX B\s+/],
    ['Tone Palette', /^TONE PALETTE\s+/],
    ['Performance', /^(Modulation Wheel|EXPRESSION|HOLD PEDAL|SOSTENUTO PEDAL|PORTAMENTO TIME|PORTAMENTO|PORTAMENTO MODE|BENDER RANGE UP|BENDER RANGE DOWN|PART LEVEL|LEVEL|LAYER|ACTIVE|SOLO|LEGATO|UNISON)$/],
  ],
};
