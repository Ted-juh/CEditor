// Erica Synths PĒRKONS HD-01: the MIDI implementation chart of its manual (December 2024).

export default {
  id: 'erica-perkons-hd-01',
  name: 'Erica Synths PĒRKONS HD-01',
  family: 'PĒRKONS',
  description: 'Erica Synths PĒRKONS HD-01 four-voice drum machine and synthesizer: the eight knobs and three switches of each voice, as its manual\'s MIDI implementation chart gives them in SINGLE MIDI CHANNEL mode.',
  document: { title: 'PĒRKONS HD-01 User Manual (December 2024)', file: 'PERKONS_manual_10_26.pdf', url: 'https://www.ericasynths.lv/service/file/download/product_id/1167/file_id/666/ (the manual on https://www.ericasynths.lv/perkons-hd-01-black-2520/)' },
  pages: [35],
  read: 'matrix',
  // What the manual's description of a voice's controls says each switch selects.
  switches: {
    'ALGO SWITCH': 'one of three sound design algorithms',
    'MODE SWITCH': 'one of three operation modes within the algorithm',
    'FILTER SWITCH': 'the VCF mode, highpass (HP), bandpass (BP) or lowpass (LP)',
  },
  inbound: 'the instrument sends these controllers when its configuration setting MIDI CC OUT is on (the configuration settings sheet beside the manual)',
  notes: [
    'The chart is for SINGLE MIDI CHANNEL mode, every voice on the one channel with controllers of its own. In MULTI MIDI CHANNEL mode each voice has a channel of its own and answers to Voice 1\'s controllers; set the channel variable to the voice\'s channel and use the Voice 1 group.',
    'The assignment can be changed in the SYSTEM folder\'s single-midi-cc.json on the SD card; the profile follows the manual\'s chart.',
  ],
};
