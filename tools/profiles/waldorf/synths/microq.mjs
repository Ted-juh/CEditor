// Waldorf micro Q (Omega, lite, keyboard): the controller chart of its User's Manual (pp. 151 - 155),
// every sound parameter it reaches. Its SysEx format is not among the documents Waldorf publishes, so
// there is no Pull.

export default {
  id: 'waldorf-microq',
  name: 'Waldorf micro Q',
  family: 'Q',
  description: 'Waldorf micro Q (Omega, lite and keyboard) synthesizer: every sound parameter of its manual\'s controller chart, as control changes.',
  document: { title: 'microQ Omega/lite/Keyboard User’s Manual', file: 'mq_all_engl_web.pdf', url: 'https://downloads.waldorfmusic.com/cloud/index.php/s/JMY3JkFqw9os9n9/download (Documentation EN/mq_all_engl_web.pdf in the zip)' },
  read: { chart: [151, 152, 153, 154, 155] },
  // `16, 28, 40…112 Osc 1 Octave 128’…1/2’`: nine octaves, 16 to 112 by 12.
  choices: Object.fromEntries([27, 35, 42].map((cc) => [cc, ["128'", "64'", "32'", "16'", "8'", "4'", "2'", "1'", "1/2'"].map((label, k) => ({ value: 16 + 12 * k, label }))])),
  groups: [
    [/^Osc (\d)/, 'Oscillator $1'],
    [/^(Ringmod|N\/E|Sync|Pitchmod)/, 'Oscillators'],
    [/^Glide/, 'Glide'],
    [/^Filter (\d)/, 'Filter $1'],
    [/^Routing/, 'Filters'],
    [/^Amp /, 'Amplifier'],
    [/^FX (\d)/, 'Effect $1'],
    [/^LFO (\d)/, 'LFO $1'],
    [/^FE /, 'Filter Envelope'],
    [/^AE /, 'Amplifier Envelope'],
    [/^E3 /, 'Envelope 3'],
    [/^E4 /, 'Envelope 4'],
    [/^Arp /, 'Arpeggiator'],
  ],
  notes: [
    'The Glide Mode (CC 51) and the filter types (CC 68, 79) are numbers here: the manual lists their values in its chapters, not beside the chart.',
  ],
};
