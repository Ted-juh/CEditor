// K-Station. Novation K-Station user manual, its MIDI Controller List and MIDI NRPN List (appendix,
// pp. 44-46), in the manual's own key: `***` a value centred on 64. Its packed controllers (several
// settings in one value's bits, p. 47) are left out.

// The K-Station's and KS series' lists name their settings alike; the KS series' layout uses these too.
export const STATION_GROUPS = [
  ['Controllers', /^(MODWHEEL|BREATH CONTROL|EXPRESSION PEDAL|SUSTAIN|FOOTSWITCH|VOLUME$|PART VOLUME)/],
  ['Filter', /^FILTER\b/],
  ['Mixer', /^(OSC\s?\d LEVEL|NOISE (LEVEL|LFO)|RING|OSC 1\*2 RINGMOD|EXTERNAL INPUT$|AUDIO INPUT LFO|MIX MODULATION|OSC\d (LFO\d|A\/D ENV) LEVEL MOD)/],
  ['Oscillators', /^(OSC|INDIVIDUAL OSCILLATOR|PREGLIDE|FIXED NOTE|NOISE TYPE)/],
  ['Envelopes', /ENVELOPE\b/],
  ['LFOs', /LFO/],
  ['Modulation', /^AMPLITUDE (MODWHEEL|AFTERTOUCH|BREATH)/],
  ['Arpeggiator', /^ARP/],
  ['Vocoder', /VOCODER/],
  ['Effects', /\b(DELAY|REVERB|CHORUS|PAN|EQ|DISTORTION)\b/],
  ['FM', /^FM\b/],
  ['Part', /^(PART|PERFORMANCE|CATEGORY|DRUM)/],
  ['Global', /^(MIDI|MASTER|VELOCITY CURVE|EXTERNAL INPUT (RANGE|TRIM|TRIGGER)|GLOBAL|PARAMETER|MENU|KEYBOARD|NON MEMU)/],
];

export default {
  id: 'novation-k-station',
  name: 'Novation K-Station',
  family: 'Station',
  description: 'Novation K-Station, every control change and NRPN in its manual\'s MIDI lists that is one setting.',
  documents: [
    { title: 'K-Station User Manual', file: 'english94.pdf', url: 'https://downloads.novationmusic.com/novation/synthesisers-legacy/k-station', controllerList: '44-47' },
  ],
  noIdentity: 'the manual prints no Device Inquiry reply',
  notes: ['The instrument sends and reads only the NRPN LSB; the manual says to assume an MSB of 0, which CEditor sends.'],
  groupOf: (name) => STATION_GROUPS.find(([, re]) => re.test(name))?.[0] ?? 'Voice',
};
