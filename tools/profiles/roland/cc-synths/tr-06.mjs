// TR-06 (Boutique). MIDI Implementation Chart, version 1.00, July 28, 2020. The chart's Control
// Change row is the span 9-113; the "*2 Control change list" beside it names the 42 used.

export default {
  id: 'roland-tr-06',
  name: 'Roland TR-06',
  family: 'Boutique',
  chart: 'tr-06',
  description: 'Roland Boutique TR-06 (TR-606 model), from its MIDI Implementation Chart\'s Control change list.',
  groups: [
    ...['BD', 'SD', 'LT', 'HT', 'CH', 'OH', 'CY'].map((inst) => [inst, new RegExp(`^${inst}\\s+`)]),
    ['Effects', /^(OD DRIVE|DELAY TIME|DELAY DEPTH|MIX IN LEVEL|MIX IN DELAY)$/],
    ['Common', /^(SHUFFLE|ACC LEVEL|MASTER PROB\.)$/],
  ],
  notes: ['Instruments are played by note number; the chart\'s *1 table lists them (BD 36, SD 38, LT 47, HT 50, CY 49, OH 46, CH 42).'],
};
