// microKORG (2002). micro KORG MIDI Implementation, Revision 1.4 (2002.06.27), with the Owner's Manual:
// the Implementation names the 41 panel knobs and switches (*3, assignable) and prints its NRPNs (*2),
// but gives the knobs no numbers; the Owner's Manual's "Messages transmitted and received by the
// microKORG" (p. 56) gives each its factory control change and the values it sends and takes, in
// synth and in vocoder programs.

export default {
  id: 'korg-microkorg',
  name: 'Korg microKORG',
  family: 'microKORG',
  description: 'Korg microKORG (2002), its panel knobs on their factory control changes and its NRPNs, in synth and vocoder programs.',
  document: {
    title: 'micro KORG MIDI Implementation',
    file: 'microKORG_MIDIimp.TXT',
    url: 'https://www.korg.com/us/support/download/manual/0/104/2700/',
  },
  ownersManual: {
    title: "microKORG Owner's Manual",
    file: 'microKORG_OM_E2.pdf',
    url: 'https://www.korg.com/us/support/download/manual/0/104/1616/',
    pdfPage: 62,
    printedPage: 56,
  },
  hexValues: true,
  // The knob table's sections, as the panel prints them; Pitch and Mixer name their knobs alone.
  sectionNames: {
    PITCH: 'Pitch', OSC1: 'OSC 1', OSC2: 'OSC 2', AudioIn1: 'Audio In 1', MIXER: 'Mixer', FILTER: 'Filter', AMP: 'Amp',
    EG1: 'EG 1', EG2: 'EG 2', LFO1: 'LFO 1', LFO2: 'LFO 2', PATCH1: 'Patch 1', PATCH2: 'Patch 2', PATCH3: 'Patch 3',
    PATCH4: 'Patch 4', 'MOD FX': 'Mod FX', 'DELAY FX': 'Delay FX',
  },
  unprefixed: ['PITCH', 'MIXER'],
  switchGroup: 'Timbre',
  groups: [
    ['Arpeggiator', /^Arpeggio\s+/],
    ['Patch', /^Patch\s*\d/],
    ['Vocoder', /^Vocoder\s+/],
  ],
};
