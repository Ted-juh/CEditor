// SH-4d. The MIDI implementation chart in the SH-4d Owner's Manual (version 2.00), p240.
//
// Chart note *2: "Channel Key Pressure and all Control Change messages except for CC#0 and CC#32
// are recognized depending on settings of MATRIX" — what a controller does to the sound can be
// re-routed on the instrument, so these are the default assignments.

export default {
  id: 'roland-sh-4d',
  name: 'Roland SH-4d',
  family: 'SH',
  chart: 'sh-4d',
  description: 'Roland SH-4d, from the control changes in the MIDI implementation chart of its Owner\'s Manual. One part; the instrument\'s other parts listen on their own channels.',
  documentTitle: 'Owner\'s Manual, MIDI implementation chart',
  manual: { model: 'SH-4d', version: '2.00' },
  groups: [
    ['LFO', /^LFO\s+/],
    ['Pitch', /^PITCH$/],
    ['Filter', /^FILTER\s+/],
    ['Amp', /^AMP\s+/],
    ['Oscillator', /^TIMBRE$/],
    ['Sliders', /^SLIDER\s+/],
    ['Performance', /^(Modulation Wheel|Hold Pedal|Porta Sw|Sostenuto|Portamento Control)$/],
  ],
};
