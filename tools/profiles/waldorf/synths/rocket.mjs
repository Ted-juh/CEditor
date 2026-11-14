// Waldorf Rocket: the controller chart of its manual (p. 34), every sound parameter it reaches, on
// the standard controllers (the `Ctrl #` column; the `Alt Ctrl #` assignment, selected by SysEx, is
// in the transcription and not laid out).

export default {
  id: 'waldorf-rocket',
  name: 'Waldorf Rocket',
  family: 'Rocket',
  description: 'Waldorf Rocket synthesizer: every sound parameter of its manual\'s controller chart, as control changes on its standard controller numbers.',
  document: { title: 'Rocket User’s Manual', file: 'Rocket_Manual.pdf', url: 'https://downloads.waldorfmusic.com/cloud/index.php/s/zPyonKEbNXiyiZ6/download (Documentation EN/Rocket_Manual.pdf in the zip)' },
  read: { chart: [34] },
  groups: [
    [/^Osc/, 'Oscillator'],
    [/^(Cutoff|Resonance|Env Mod|Keytrack)/, 'Filter'],
    [/^(LFO|Vibrato)/, 'LFO'],
    [/^ENV/, 'Envelope'],
    [/^Glide/, 'Glide'],
    [/^Arp/, 'Arpeggiator'],
  ],
  notes: ['The Rocket can be switched to an alternative controller assignment by SysEx (its manual\'s `Alt Ctrl #` column, to drive another Waldorf synthesizer); this profile uses the standard one.'],
};
