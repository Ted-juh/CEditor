// Circuit Tracks. Novation Circuit Tracks Programmer's Reference Guide v3, its MIDI parameters (pp.
// 3-12): the synth table is played on channel 1 for Synth 1 and channel 2 for Synth 2, the drum
// table on channel 10 and the project table on channel 16, each a channel variable here.

export default {
  id: 'novation-circuit-tracks',
  name: 'Novation Circuit Tracks',
  family: 'Circuit',
  description: 'Novation Circuit Tracks, both synths, the drums and the project, by the control changes and NRPNs of its programmer\'s reference.',
  documents: [
    { title: 'Circuit Tracks Programmer\'s Reference Guide v3', file: 'circuit_tracks_programmer_s_reference_guide_v3.pdf', url: 'https://downloads.novationmusic.com/novation/circuit/circuit-tracks', pages: '3-12' },
  ],
  parts: [
    { pages: [3, 4, 5, 6, 7, 8], parts: [{ name: 'Synth 1', channel: 'channel', default: 1 }, { name: 'Synth 2', channel: 'synth2Channel', default: 2 }], why: '"Send messages on MIDI Channel 1 for Synth 1 and Channel 2 for Synth" 2' },
    { pages: [11], parts: [{ name: 'Drums', channel: 'drumChannel', default: 10 }], why: '"Messages on MIDI Channel 10"' },
    { pages: [12], parts: [{ name: 'Project', channel: 'projectChannel', default: 16 }], why: '"Send messages on MIDI Channel 16"' },
  ],
  skip: [[/^Audio [12] /, 'the audio table on p. 9, for which the guide prints no channel']],
};
