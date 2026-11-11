// Black Corporation Kijimi MK2: the MIDI CC chart of its operation manual, 2.0.0.

const SECTIONS = [
  [/^MOD\b/, 'Modulation'], [/^LFO1/, 'LFO 1'], [/^LFO2/, 'LFO 2'], [/^(?:VCO1|OSC1|SUBOSC)/, 'VCO 1'], [/^VCO2/, 'VCO 2'],
  [/^(?:OSC|NOISE)/, 'Oscillators'], [/^VCF/, 'VCF'], [/^ADSR1/, 'ADSR 1'], [/^ADSR2/, 'ADSR 2'], [/^ADSR/, 'ADSR'],
];

export default {
  id: 'black-corporation-kijimi-mk2',
  name: 'Black Corporation Kijimi MK2',
  family: 'Kijimi',
  description: 'Black Corporation Kijimi MK2 eight-voice analog synthesizer: every controller of its manual\'s MIDI CC chart.',
  document: { title: 'KIJIMI MK2 Operation Manual 2.0.0', file: 'kijimi_mk2_manual_2.0.0.eng.pdf', url: 'https://black-corporation.com/m/assets/support/2/kijimi_mk2_manual_2.0.0.eng.pdf' },
  pages: [41, 42, 43, 44],
  groupOf: (name) => SECTIONS.find(([re]) => re.test(name))?.[1] ?? 'Global',
  notes: ['The chart prints no values: every controller is 0 - 127, the switches among them (OSC SYNC, the modulation routings) included.'],
};
