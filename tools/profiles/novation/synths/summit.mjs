// Summit. Novation Summit User Guide 1.1, its MIDI parameters list (pp. 47-49), with the parameters
// the Summit and Peak 2.1 firmware added (its addendum, p. 18). The list is a part's: the profile edits
// the part on its channel. Its mod matrix rows print no NRPN numbers, and are left out.

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
  id: 'novation-summit',
  name: 'Novation Summit',
  family: 'Peak',
  description: 'Novation Summit, a part\'s every control change and NRPN in its user guide\'s MIDI parameters list and the 2.1 addendum.',
  documents: [
    { title: 'Summit User Guide 1.1', file: 'Summit User Guide 1.1 EN.pdf', url: 'https://downloads.novationmusic.com/novation/synthesisers/summit', pages: '47-49' },
    { title: 'Summit and Peak Firmware Update - Version 2.1 Addendum', file: 'summit_peak_2.1_firmware_update_addendum_v1_english_en.pdf', url: 'https://downloads.novationmusic.com/novation/synthesisers/summit', pages: 18 },
  ],
  groupOf: (name, section) => GROUPS.find(([, re]) => re.test(name))?.[0] ?? (section || 'Voice'),
};
