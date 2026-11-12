// MiniNova. Novation MiniNova Extended CC & NRPN Map, Version 0002 (pp. 1-9): every parameter with its
// CC or NRPN, the value sent (Input Range) and what it shows (Mapped Range), and value names in the
// remarks.

export default {
  id: 'novation-mininova',
  name: 'Novation MiniNova',
  family: 'Nova',
  description: 'Novation MiniNova, every control change and NRPN in its Extended CC & NRPN Map.',
  documents: [
    { title: 'MiniNova Extended CC & NRPN Map, Version 0002', file: 'mininova-cc-nprn-chart.pdf', url: 'https://downloads.novationmusic.com/novation/synthesisers/mininova', pages: '1-9', valuePages: '8-9' },
  ],
  prefixSection: true,
  // The map's MIDI section lists MIDI's own controllers beside the sound's: how an NRPN is sent (data
  // entry, increment, decrement, the NRPN numbers), bank select, and the performance controllers.
  skip: [
    [/^MIDI (?:Data Entry|Data Increment|Data Decrement|NPRN) /, 'MIDI\'s own controllers, which carry the NRPNs this profile sends'],
    [/^MIDI Bank LSB$/, 'bank select'],
    [/^MIDI (?:Modulation|Breath Controlller|Expression Controller|Sustain Pedal)$/, 'the performance controllers'],
  ],
};
