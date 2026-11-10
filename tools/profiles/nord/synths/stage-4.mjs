// Nord Stage 4: the MIDI controller list of its user manual.

export default {
  id: 'nord-stage-4',
  name: 'Nord Stage 4',
  family: 'Stage',
  description: 'Nord Stage 4 stage keyboard: every control of its manual\'s MIDI controller list, its NRPNs among them.',
  document: { title: 'Nord Stage 4 User Manual, OS v1.6x, Edition N', file: 'Nord Stage 4 User Manual v1.6X-Edition-N.pdf', url: 'https://www.nordkeyboards.com/wt/documents/951/Nord%20Stage%204%20User%20Manual%20v1.6X-Edition-N.pdf' },
  pages: [68, 69],
  notes: ['The manual: CC and NRPN messages are sent and received on the Global channel (MIDI menu, CTRL); the NRPNs need the menu\'s TYPE set to CC & NRPN. Set the channel variable to the Global channel.'],
};
