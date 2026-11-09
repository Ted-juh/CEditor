// prologue (8 and 16). KORG prologue MIDI Implementation, Revision 1.01 (2020.2.10): the control
// changes it recognises (2-1) and the ones it sends (1-1). The two models share the document; the
// controllers it marks as recognised by the prologue-16 only say so.

export default {
  id: 'korg-prologue',
  name: 'Korg prologue',
  family: 'logue',
  description: 'Korg prologue-8 and prologue-16, every control change in their MIDI Implementation.',
  document: {
    title: 'prologue MIDI Implementation',
    file: 'prologue_MIDIImp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/778/4066/',
  },
  notes: [
    'MOD EFFECT SUB TYPE (CC 96), DELAY/REVERB SUB TYPE (CC 97) and MULTI SUB TYPE SELECT (CC 103) depend on the type chosen beside them, so they are numbers with their lists in the description.',
  ],
  groups: [
    ['Oscillator 1', /^VCO 1\s+/],
    ['Oscillator 2', /^VCO 2\s+/],
    ['Oscillators', /^(CROSS MOD DEPTH|RING-SYNC|PITCH EG(?: INT)?)$/],
    ['Multi Engine', /^MULTI\s+/],
    ['Filter', /^CUTOFF\b|^RESONANCE$/],
    ['Amp Envelope', /^AMP EG\s+/],
    ['Envelope', /^EG\s+/],
    ['LFO', /^LFO\s+/],
    ['Effects', /^(MOD EFFECT|DELAY\/REVERB)\s+/],
    ['Timbre', /^(TIMBRE|VOICE SPREAD)\b/],
    ['Voice', /^VOICE MODE\b/],
    ['Controllers', /^(PORTAMENTO|DAMPER)$/],
  ],
};
