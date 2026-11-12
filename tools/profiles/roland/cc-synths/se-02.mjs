// SE-02 (Roland x Studio Electronics). MIDI Implementation Chart, version 1.00. Page 1 lists the
// numbers ("Patch parameters (refer to next page)"); page 2 names them, CC# and Patch parameter.
// Names are as printed: FLT KEY TRACK 13 and 23 are the panel's keyboard-tracking switches.

export default {
  id: 'roland-se-02',
  name: 'Roland SE-02',
  family: 'Boutique',
  chart: 'se-02',
  description: 'Roland SE-02 (with Studio Electronics), from the Patch parameter list of its MIDI Implementation Chart.',
  extra: [
    { cc: 0, name: 'Bank select (0–3: A, B, C, User)', tx: false, rx: true, marks: [], page: 1, why: 'Chart p1: received only; 0 - 3 select banks A, B, C and User.' },
  ],
  ranges: {
    0: { min: 0, max: 3, why: 'the chart prints "Bank select (0–3: A, B, C, User)"' },
  },
  groups: [
    ['Control', /^CONTROL\s+/],
    ['Cross Mod', /^XMOD\s+/],
    ['Oscillators', /^OSC\s+/],
    ['Mixer', /^MIX\s+/],
    ['Filter', /^FLT\s+/],
    ['LFO', /^LFO\s+/],
    ['Delay', /^DLY\s+/],
    ['Common', /^(MOD SENS|DYNAMICS|AFT SENS 1|AFT SENS 2|BEND RANGE|OCTAVE SHIFT|TRANSPOSE|TRANSPOSE SW|PATCH VOLUME|Bank select)$/],
  ],
  notes: ['Program Change: received only, 0 - 127 (chart, True Number), within the bank CC 0 selects.'],
};
