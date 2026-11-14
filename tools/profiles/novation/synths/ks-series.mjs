// KS series (KS4, KS5, KS Rack). Novation KS series user manual, its MIDI Controller List and MIDI NRPN
// List (appendix, pp. 62-64), in the manual's own key: `***` a value centred on 64. Its packed controllers
// (several settings in one value's bits, p. 65) are left out.

import { STATION_GROUPS } from './k-station.mjs';

export default {
  id: 'novation-ks-series',
  name: 'Novation KS series',
  family: 'Station',
  description: 'Novation KS4, KS5 and KS Rack, every control change and NRPN in its manual\'s MIDI lists that is one setting.',
  documents: [
    { title: 'KS Series User Manual', file: 'english102.pdf', url: 'https://downloads.novationmusic.com/novation/synthesisers-legacy/ks-rack', controllerList: '62-65' },
  ],
  noIdentity: 'the manual prints no Device Inquiry reply',
  notes: ['The instrument sends and reads only the NRPN LSB; the manual says to assume an MSB of 0, which CEditor sends.'],
  groupOf: (name) => STATION_GROUPS.find(([, re]) => re.test(name))?.[0] ?? 'Voice',
};
