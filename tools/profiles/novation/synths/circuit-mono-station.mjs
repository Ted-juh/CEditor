// Circuit Mono Station. Novation Circuit Mono Station MIDI Parameters v1 (pp. 1-3): the synth's
// control changes. The document says to send oscillator 1's and 2's on their assigned channels (1 and
// 2 by default); its parameters are the synth's, sent here on the profile's channel.

export default {
  id: 'novation-circuit-mono-station',
  name: 'Novation Circuit Mono Station',
  family: 'Circuit',
  description: 'Novation Circuit Mono Station, every control change in its MIDI parameters document.',
  documents: [
    { title: 'Circuit Mono Station MIDI Parameters v1', file: 'circuit-mono-station-midi-parameters-v1.pdf', url: 'https://downloads.novationmusic.com/novation/circuit/circuit-monostation', pages: '1-3', valuePages: '2-3' },
  ],
  prefixSection: true,
};
