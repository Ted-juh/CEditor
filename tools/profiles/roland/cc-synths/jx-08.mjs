// JX-08 (Boutique). The MIDI Implementation Chart in the JX-08 Reference Manual (version 1.00,
// Oct. 13, 2021), p62-63.
//
// Two misprints in the chart, kept visible rather than guessed at: DCO-1 RANGE is printed for both
// CC 20 and CC 47, and PORTAMENTO TIME for both CC 5 (received only, the general MIDI controller)
// and CC 117 (sent and received, the patch parameter). Each keeps its printed name with its number.

export default {
  id: 'roland-jx-08',
  name: 'Roland JX-08',
  family: 'Boutique',
  chart: 'jx-08',
  description: 'Roland Boutique JX-08 (JX-8P model), from the control changes in the MIDI Implementation Chart of its Reference Manual.',
  documentTitle: 'Reference Manual, MIDI Implementation Chart',
  names: {
    21: { name: 'DCO-1 ENV MOD', why: 'printed "DCO-1 ENEV MOD", a misprint of ENV (CC 63 is DCO-2 ENV)' },
  },
  groups: [
    ['DCO-1', /^DCO-1\s+/],
    ['DCO-2', /^DCO-2\s+/],
    ['DCO', /^DCO\s+/],
    ['Mixer', /^MIXER\s+/],
    ['VCF', /^(VCF|FILTER)\s+/],
    ['LFO', /^LFO\s+/],
    ['Envelope 1', /^(ENV1|ENVELOPE1)\s+/],
    ['Envelope 2', /^ENVELOPE2\s+/],
    ['Amp', /^AMP\s+/],
    ['Performance', /^(Modulation Wheel|Expression|Hold Pedal|PORTAMENTO TIME|PORTAMENTO SW|BEND PITCH|PATTERN PART LEVEL|Reverb Send Level|SOLO\/POLY\/UNISON)$/],
  ],
};
