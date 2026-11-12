// Modor DR-2: the MIDI controller list of its user manual (version 6, OS014), and the NRPNs that set
// the parameters the list does not give a controller.

export default {
  id: 'modor-dr-2',
  name: 'Modor DR-2',
  family: 'DR-2',
  description: 'Modor DR-2 drum synthesizer: the controllers of its six drums, and every other drum parameter by NRPN.',
  document: { title: 'Modor DR-2 user manual, version 6 for firmware OS014', file: 'UsersManualDR-2.pdf', url: 'https://modormusic.com/downloads/UsersManualDR-2.pdf', linkedFrom: 'https://modormusic.com/downloads.html', pages: [93, 97] },
  nrpn: [91, 92],
  // The one controller that is not a drum's: CC 95 turns the sequencer's tracks on and off.
  otherGroup: 'Sequencer',
  // The NRPN parameters the controller list also gives each drum (`Drum A Pitch Env Decay` is NRPN
  // 0, …): a correspondence by name, written down here; the rest are laid out as NRPNs.
  alsoControllers: { 0: 'Pitch Env Decay', 3: 'Amp Decay', 4: 'Pitch Env Curve', 7: 'Amp Curve', 9: 'Volume', 10: 'Pan', 11: 'Pitch', 12: 'Pitch Env Amount', 13: 'X', 14: 'Y', 15: 'Z', 16: 'T' },
};
