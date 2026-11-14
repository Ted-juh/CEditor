// Radikal Technologies Delta CEP A / A2: the MIDI controller table of the shared manual (version 2).

export default {
  id: 'radikal-delta-cep-a',
  name: 'Radikal Technologies Delta CEP A / A2',
  family: 'Delta CEP',
  description: 'Radikal Technologies Delta CEP A and A2 swarm-oscillator synthesizers: every sound parameter of the manual\'s MIDI controller table, with its range and neutral value.',
  document: { title: 'DELTA CEP A2 manual (US/UK, version 2)', file: 'DELTA_CEP_A2_US_UK-1.pdf', url: 'https://www.radikaltechnologies.com/wp-content/uploads/2023/09/DELTA_CEP_A2_US_UK-1.pdf', linkedFrom: 'https://www.radikaltechnologies.com/delta-cep-a-a2-version-2-new-manuals/', pages: [54, 55] },
  // The text layer loses the `ff` ligature, set apart at the page's foot: `VCF Cuto` is VCF Cutoff.
  ligatures: { Cuto: 'Cutoff' },
};
