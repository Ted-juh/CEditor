// Circuit Rhythm. Novation Circuit Rhythm Programmer's Reference Guide v5.2, its MIDI parameters (pp.
// 3-5): each of the eight sampler parts on its own channel, 1 to 8 ("Send on appropriate channel
// 1-8"), and the effects and global controls on the global channel, which the guide's own note table
// gives as 16.

export default {
  id: 'novation-circuit-rhythm',
  name: 'Novation Circuit Rhythm',
  family: 'Circuit',
  description: 'Novation Circuit Rhythm, its eight sampler parts, effects and global controls, by the control changes and NRPNs of its programmer\'s reference.',
  documents: [
    { title: 'Circuit Rhythm Programmer\'s Reference Guide v5.2', file: 'circuit_rhythm_programmer_s_reference_guide_v5_2.pdf', url: 'https://downloads.novationmusic.com/novation/circuit/circuit-rhythm', pages: '3-5' },
  ],
  parts: [
    { pages: [3], parts: Array.from({ length: 8 }, (u, i) => ({ name: `Part ${i + 1}`, channel: i ? `part${i + 1}Channel` : 'channel', default: i + 1 })), why: '"Send on appropriate channel 1-8"' },
    { pages: [4, 5], parts: [{ name: 'Global', channel: 'globalChannel', default: 16 }], why: 'the guide prints no channel for its effects and global tables; its sample-track note table gives the global channel as 16' },
  ],
  // `These are identical to the parameters in the 'Sampler Parts' section.`
  skip: [[/ \d\. (Tune|Start|Length|Slope|Distortion|HP Filter|LP Filter|Resonance)$/, 'the macro knobs, which the guide says are the sampler parts\' parameters again']],
};
