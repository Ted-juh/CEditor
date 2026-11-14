// monologue. KORG monologue MIDI Implementation, Revision 1.00 (2019.02.19): the control changes it
// recognises (2-1) and the ones it sends (1-1). No NRPNs, and no bank select: 100 programs.

export default {
  id: 'korg-monologue',
  name: 'Korg monologue',
  family: 'logue',
  description: 'Korg monologue, every control change in its MIDI Implementation.',
  document: {
    title: 'monologue MIDI Implementation',
    file: 'monologue_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/733/4231/',
  },
  // The monologue has one envelope, whose attack and decay the controller list calls AMP EG and the
  // program dump calls EG; and one LFO, whose wave the dump calls its type.
  dumpNames: { 'AMP EG ATTACK': 'EG ATTACK', 'AMP EG DECAY': 'EG DECAY', 'LFO WAVE': 'LFO TYPE' },
  groups: [
    ['Oscillator 1', /^VCO 1\s+/],
    ['Oscillator 2', /^VCO 2\s+/],
    ['Oscillators', /^SYNC\/RING$/],
    ['Filter', /^(CUTOFF|RESONANCE|DRIVE)$/],
    ['Envelope', /^(AMP EG|EG)\s+/],
    ['LFO', /^LFO\s+/],
  ],
};
