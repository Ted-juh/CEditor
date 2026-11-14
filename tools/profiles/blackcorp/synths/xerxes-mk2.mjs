// Black Corporation Xerxes MK2: the MIDI CC chart of its operation manual, 1.1.1.

const SECTIONS = [
  [/^LFO2/, 'LFO 2'], [/^LFO/, 'LFO'], [/^OSC1/, 'Oscillator 1'], [/^OSC2/, 'Oscillator 2'], [/^NOISE/, 'Noise'],
  [/^MMF/, 'Filter'], [/^VCF ?ENV/, 'Filter Envelope'], [/^VCA ?ENV/, 'Amp Envelope'], [/^DINAMIC/, 'Dynamics'],
  [/^GLIDE/, 'Glide'], [/^(?:TUNING|DRIFT)/, 'Tuning'],
];

export default {
  id: 'black-corporation-xerxes-mk2',
  name: 'Black Corporation Xerxes MK2',
  family: 'Xerxes',
  description: 'Black Corporation Xerxes MK2 eight-voice polyphonic synthesizer: every controller of its manual\'s MIDI CC chart, its pots on the chart\'s CHANNEL 1 and its buttons on CHANNEL 2.',
  document: { title: 'XERXES MK2 Operation Manual 1.1.1', file: 'xerxes_mk2_manual_1.1.1_eng.pdf', url: 'https://black-corporation.com/m/assets/support/1/xerxes_mk2_manual_1.1.1_eng.pdf' },
  pages: [38, 39, 40],
  groupOf: (name) => SECTIONS.find(([re]) => re.test(name))?.[1] ?? 'Global',
  channelOf: (block) => (block === 'CHANNEL 2' ? 'secondChannel' : 'channel'),
  variables: { secondChannel: 2 },
  notes: [
    'The chart sets the pots under CHANNEL 1 and the buttons under CHANNEL 2, the same controller numbers on both, and says no more: whether those are channels 1 and 2 or the instrument\'s MIDI channel and the one after it, the manual does not say. The pots are sent on the channel variable (1), the buttons on secondChannel (2); set both to what the instrument answers on.',
    'The chart prints no values: every controller is 0 - 127, the buttons included. The names are the chart\'s, its underscores read as spaces and its spelling kept (DINAMIC).',
  ],
};
