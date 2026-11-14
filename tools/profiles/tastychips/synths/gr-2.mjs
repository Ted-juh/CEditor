// Tasty Chips GR-2: the MIDI Command Table of its manual (1.8.f, firmware 1.8.0), and the rate
// divisions, mod sources and modulation destinations after it.

import sections from './sections.mjs';

export default {
  id: 'tasty-chips-gr-2',
  name: 'Tasty Chips GR-2',
  family: 'GR',
  description: 'Tasty Chips GR-2 granular synthesizer: every control change and NRPN of its manual\'s MIDI Command Table, with the value names, mod sources, destinations and rate divisions it prints.',
  document: { title: 'GR-2 Manual 1.8.f', file: 'GR-2 Manual 1.8.f.pdf', url: 'https://www.tastychips.nl/downloads/GR-2/UserManual/GR-2%20Manual%201.8.f.pdf', linkedFrom: 'https://www.tastychips.nl/gr-2-support-page/', pages: [132, 153] },
  sections,
  // Rows the table marks as the other model's.
  otherModel: /\(GR-MEGA only\)/,
};
