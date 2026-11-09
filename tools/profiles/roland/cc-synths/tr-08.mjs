// TR-08 (Boutique). MIDI Implementation Chart, version 1.00, Aug. 8, 2017. The chart's Control
// Change rows are spans (20-29, 46-63, 71, 80-88); the Control change list beside them names all 38.

export default {
  id: 'roland-tr-08',
  name: 'Roland TR-08',
  family: 'Boutique',
  chart: 'tr-08',
  description: 'Roland Boutique TR-08 (TR-808 model), from its MIDI Implementation Chart\'s Control change list.',
  groups: [
    ...['BD', 'SD', 'LT', 'MT', 'HT', 'RS', 'CP', 'CH', 'OH', 'CY', 'CB'].map((inst) => [inst, new RegExp(`^${inst}\\s+`)]),
    ['Common', /^ACCENT$/],
  ],
};
