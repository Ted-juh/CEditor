// Waldorf Streichfett string synthesizer: the controller chart of its Reference Manual (p. 21), every
// sound parameter it reaches. The chart prints no controller ranges; each is a controller's, 0 - 127.
// The values it names are printed beside them (`0 = Base, 1 = Both, 2 = 8va`).

export default {
  id: 'waldorf-streichfett',
  name: 'Waldorf Streichfett',
  family: 'Streichfett',
  description: 'Waldorf Streichfett string synthesizer: every sound parameter of its manual\'s controller chart, as control changes.',
  document: { title: 'Streichfett Reference Manual', file: 'Streichfett_Manual_EN.pdf', url: 'https://downloads.waldorfmusic.com/cloud/index.php/s/BppCqf8X5knMwyC/download' },
  read: { chart: [21] },
  groups: [
    [/^String/, 'Strings'],
    [/^Crescendo/, 'Strings'],
    [/^Solo/, 'Solo'],
    [/^FX/, 'Effects'],
    [/^Balance/, 'Mixer'],
  ],
  // `2 = 8va`: the superscript `va` is set a line above, and read before the 8.
  fix: { 70: { value: '0 = Base, 1 = Both, 2 = 8va' } },
};
