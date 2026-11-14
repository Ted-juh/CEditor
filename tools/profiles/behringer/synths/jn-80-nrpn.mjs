// Behringer JN-80, NRPN: the JN-80's quick start guide read for its NRPN table as well as its
// controllers. The twenty parameters the NRPN table gives are sent as those NRPNs at 12 bits; every
// other controller as in the JN-80 profile. Built from the JN-80's transcription.

import jn80 from './jn-80.mjs';

export default {
  ...jn80,
  id: 'behringer-jn-80-nrpn',
  name: 'Behringer JN-80 (NRPN, 12-bit)',
  description: 'Behringer JN-80 8-voice analog polyphonic synthesizer: its quick start guide\'s controllers, with the twenty its NRPN table gives sent as those NRPNs at 12 bits (0 - 4095).',
  transcription: 'jn-80',
  nrpn: true,
  notes: [
    'The twenty parameters of the guide\'s NRPN table (`The JN-80 responds to and transmits the following MIDI NRPNs`) are sent as those NRPNs, 0 - 4095, the number on CC 99 and 98 and the value on CC 6 and 38 (the guide\'s `NRPN Data MSB` and `LSB`): the value\'s high 7 bits on CC 6, as data entry carries 14 bits. The guide does not say how the 12 bits are split, so that is the MIDI convention, not the guide. Every other parameter is the controller the JN-80 profile sends.',
    'The JN-80 profile is the same instrument at 7 bits on every controller; use one or the other.',
  ],
};
