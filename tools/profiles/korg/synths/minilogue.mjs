// minilogue. KORG minilogue MIDI Implementation, Revision 1.10 (2016.07.10): the control changes it
// recognises (2-1) and the ones it sends (1-1). No NRPNs.

export default {
  id: 'korg-minilogue',
  name: 'Korg minilogue',
  family: 'logue',
  description: 'Korg minilogue, every control change in its MIDI Implementation.',
  document: {
    title: 'minilogue MIDI Implementation',
    file: 'minilogue_MIDIimp_rev.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/544/2890/',
  },
  groups: [
    ['Oscillator 1', /^VCO 1\s+/],
    ['Oscillator 2', /^VCO 2\s+/],
    ['Oscillators', /^(SYNC|RING|NOISE LEVEL)$/],
    ['Filter', /^(CUTOFF|RESONANCE)\b/],
    ['Amp Envelope', /^AMP EG\s+/],
    ['Envelope', /^EG\s+/],
    ['LFO', /^LFO\s+/],
    ['Delay', /^DELAY\s+/],
    ['Voice', /^VOICE MODE\b/],
  ],
};
