// Peak. Novation Peak User Guide 1.2, its MIDI parameters list (pp. 40-43), with the parameters the
// Summit and Peak 2.1 firmware added (its addendum, p. 18). Single channel: the Peak listens on one.

const GROUPS = [
  ['Patch', /^Patch\b/],
  ['Voice', /^(Voice|Glide)\b/],
  ['Oscillators', /^(Osc(illator)?\s*\d|Osc Common)\b/],
  ['Mixer', /^(Mixer|Ring|Noise Level)\b/],
  ['Filter', /^Filter\b/],
  ['Envelopes', /^(Amp|Mod) Envelope\b/],
  ['LFOs', /^LFO\s*\d|^LFO\d/],
  ['Effects', /^(Effects|Distortion|Delay|Reverb|Chorus|Lo-Fi|Chorus\/Phaser\/Flanger)\b/],
  ['Arpeggiator', /^Arp\b/],
  ['Animate', /^Animate\b/],
  ['Mod Matrix', /^Mod Matrix\b/],
  ['FX Mod Matrix', /^FX Mod\b/],
];

export default {
  id: 'novation-peak',
  name: 'Novation Peak',
  family: 'Peak',
  description: 'Novation Peak, every control change and NRPN in its user guide\'s MIDI parameters list and the 2.1 addendum.',
  documents: [
    { title: 'Peak User Guide 1.2', file: 'Peak 1.2 Manual - English.pdf', url: 'https://downloads.novationmusic.com/novation/synthesisers/peak', pages: '40-43' },
    { title: 'Summit and Peak Firmware Update - Version 2.1 Addendum', file: 'summit_peak_2.1_firmware_update_addendum_v1_english_en.pdf', url: 'https://downloads.novationmusic.com/novation/synthesisers/peak', pages: 18 },
  ],
  groupOf: (name, section) => GROUPS.find(([, re]) => re.test(name))?.[0] ?? (section || 'Voice'),
};
