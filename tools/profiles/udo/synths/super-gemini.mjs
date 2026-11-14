// UDO Super Gemini: the MIDI specifications of its owner's manual (the Super Gemini's and Super 8's).

const CC = [{ name: 'nav', dx: 0 }, { name: 'cc', dx: 160 }, { name: 'range', dx: 203 }, { name: 'name', dx: 330 }];
const NRPN = [{ name: 'nav', dx: 0 }, { name: 'nrpn', dx: 160 }, { name: 'msb', dx: 203 }, { name: 'lsb', dx: 268 }, { name: 'range', dx: 332 }, { name: 'name', dx: 445 }];

export default {
  id: 'udo-super-gemini',
  name: 'UDO Super Gemini',
  family: 'Super',
  description: 'UDO Super Gemini bi-timbral polysynth: every parameter of its manual\'s MIDI specifications, as its 14-bit NRPN where it has one, as its controller where not, for each of its two layers.',
  document: { title: 'UDO Super Gemini & Super 8 Owner\'s Manual', file: '66e3ffcd302ab7007da33da0_UDO_SuperGemini-Super8_Manual.pdf', url: 'https://cdn.prod.website-files.com/641dd1a703957e750da6b5e3/66e3ffcd302ab7007da33da0_UDO_SuperGemini-Super8_Manual.pdf' },
  pages: [116, 117, 118, 119, 120, 121, 122, 124, 125, 126, 127, 128],
  // The manual: the base MIDI channel is the upper layer's, the one above it the lower layer's.
  layers: { Upper: 'channel', Lower: 'lowerChannel' },
  variables: { lowerChannel: 2 },
  notes: ['The channel variable is the base MIDI channel, the upper layer\'s; lowerChannel, the one above it, the lower layer\'s (the manual: "if you set the base MIDI channel to 5, MIDI channel 5 will be assigned to the upper layer and MIDI channel 6 to the lower layer"). Every parameter is laid out for each.'],
  rename: { 'Lower Layer Detune (Super Gemini) Layer Detune (Super 8)': 'Lower Layer Detune' },
  leaveOut: ['Performance Detune (Super 8: Receive only)'],
  read: {
    cc: { pages: [116, 117, 118, 119, 120, 121, 122], columns: CC, first: 1, anchor: { column: 1, test: /^\d{1,3}$/ }, skip: /CC#\s*Value Range|Continuous Controller Messages|table below|mapped to the|or received|\(see pages?/ },
    nrpn: { pages: [124, 125, 126, 127, 128], columns: NRPN, first: 1, anchor: { column: 1, test: /^\d{4}$/ }, skip: /NRPN (?:MSB|Value)|\(CC#? ?9[89]\)|(?:Global|Patch-Related) Parameters|Non-Registered|table below|are mapped|These messages|configuration in/ },
  },
};
