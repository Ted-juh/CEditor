// Twisted Electrons BlastBeats: the drum and synth voice controller tables of its web manual, each on
// the channel its MIDI Channel Routing gives that target.

export default {
  id: 'twisted-electrons-blastbeats',
  name: 'Twisted Electrons BlastBeats',
  family: 'BlastBeats',
  description: 'Twisted Electrons BlastBeats FM drum machine and synth: every drum and synth voice controller of its manual, the drums on channel 10 and the four synths on 1 - 4.',
  document: { title: 'BlastBeats manual (web page)', file: 'te-manual-blastbeats.html', url: 'https://www.twisted-electrons.com/pages/manual-blastbeats', saved: '2026-11-11' },
  controllerTables: ['Drum Voice MIDI CC', 'Synth Voice MIDI CC'],
  // The targets of the page's MIDI Channel Routing (`Drum MIDI channel: CH10`, `Synth 1 MIDI channel:
  // CH1` …) each table's rows are sent to.
  channels: { 'Drum Voice MIDI CC': [/^Drum$/], 'Synth Voice MIDI CC': [/^Synth \d$/] },
};
