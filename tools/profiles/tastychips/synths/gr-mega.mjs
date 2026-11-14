// Tasty Chips GR-MEGA: the MIDI Command Table of its manual (1.8.d, firmware 1.8.0), and the rate
// divisions, mod sources and modulation destinations after it.

import sections from './sections.mjs';

export default {
  id: 'tasty-chips-gr-mega',
  name: 'Tasty Chips GR-MEGA',
  family: 'GR',
  description: 'Tasty Chips GR-MEGA granular synthesizer: every control change and NRPN of its manual\'s MIDI Command Table, with the value names, mod sources, destinations and rate divisions it prints.',
  document: { title: 'GR-Mega Manual 1.8.d', file: 'GR-Mega Manual 1.8.d.pdf', url: 'https://www.tastychips.nl/downloads/GR-MEGA/UserManual/GR-Mega%20Manual%201.8.d.pdf', linkedFrom: 'https://www.tastychips.nl/gr-mega-support-page/', pages: [141, 161] },
  sections,
};
