// Black Corporation Ise-Nin: the MIDI CC chart of its operation manual, 1.1.4.

const SECTIONS = [
  [/^(?:VCO MOD|PWM MOD)/, 'Modulation'], [/^LFO/, 'LFO'], [/^VCO1/, 'VCO 1'], [/^VCO2/, 'VCO 2'], [/^MIX$/, 'Mixer'],
  [/^(?:HPF|VCF)/, 'VCF'], [/^VCA/, 'VCA'], [/^ENV1/, 'Env 1'], [/^ENV2/, 'Env 2'], [/^ARP/, 'Arpeggio'], [/^PORTAMENTO/, 'Portamento'], [/^MASTER TUNE/, 'Tuning'],
];

export default {
  id: 'black-corporation-ise-nin',
  name: 'Black Corporation Ise-Nin',
  family: 'Ise-Nin',
  description: 'Black Corporation Ise-Nin eight-voice analog synthesizer: every controller of its manual\'s MIDI CC chart, its Upper and Lower layers each with its own.',
  document: { title: 'ISE-NIN Operation Manual 1.1.4', file: 'ise-nin_manual_1.1.4_eng_04dc875.pdf', url: 'https://black-corporation.com/m/assets/support/3/ise-nin_manual_1.1.4_eng_04dc875.pdf' },
  pages: [42, 43, 44, 45],
  // The chart's LAYER column: a control of the Upper or the Lower layer, or of both where it is blank.
  groupOf: (name, layer) => {
    const section = SECTIONS.find(([re]) => re.test(name))?.[1] ?? 'Global';
    return layer ? `${layer} ${section === 'Global' ? 'Panel' : section}` : section;
  },
  notes: ['The chart prints no values: every controller is 0 - 127, the buttons included. The Upper and Lower layers answer on the one channel, each control of a layer on a controller of its own, as the chart\'s LAYER column says.'],
};
