// NTS-1 digital kit mkII. KORG NTS-1 mkII digital kit MIDI Implementation, Version 1.00
// (2024.03.18): the control changes it recognises (2-1) and the ones it sends (1-1), and its NRPNs.
//
// Its finer settings are pairs of controllers named alike, `EG ATTACK (MSB)` on 16 and `(LSB)` on
// 48, paired by name and not by the usual distance of 32. The document does not say how many of the
// LSB's bits count, so the coarse controller is the parameter and the fine one is left out.

export default {
  id: 'korg-nts-1-mk2',
  name: 'Korg NTS-1 mkII',
  family: 'NTS',
  description: 'Korg NTS-1 digital kit mkII, every control change and NRPN in its MIDI Implementation.',
  document: {
    title: 'NTS-1 digital kit mkII MIDI Implementation',
    file: 'NTS-1mkII_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/933/5210/',
  },
  coarseOfPairs: true,
  markFixes: {
    '5-5': { printed: 'TAPE BPM DOUBLING', read: 'TAPE BPM, DOUBLING', why: 'thirteen ranges are printed for what the missing comma makes twelve names' },
  },
  // The program dump calls the effect knobs by their section: MOD FX A for MOD A.
  dumpNames: {
    'MOD A': 'MOD FX A', 'MOD B': 'MOD FX B',
    'DELAY A': 'DELAY FX A', 'DELAY B': 'DELAY FX B', 'DELAY MIX': 'DELAY FX MIX',
    'REVERB A': 'REVERB FX A', 'REVERB B': 'REVERB FX B', 'REVERB MIX': 'REVERB FX MIX',
  },
  groups: [
    ['Oscillator', /^OSC\s+/],
    ['Filter', /^FILTER\s+/],
    ['Envelope', /^EG\s+/],
    ['Tremolo', /^TREMOLO\s+/],
    ['Modulation', /^MOD\s+/],
    ['Delay', /^DELAY\s+/],
    ['Reverb', /^REVERB\s+/],
    ['Arpeggiator', /^ARP\s+/],
    ['Global', /^MASTER VOLUME$/],
  ],
  // Korg's own sample programs for the instrument (NTS-1_digital_kit_mkII_sample_programs.nts1mkii,
  // from its download page) hold twelve programs of 504 bytes, 'PROG' at 0 and 'PRED' at 500 - 503.
  sizeEvidence: 'Korg\'s own sample programs for the instrument agree: each is 504 bytes, \'PRED\' at 500 - 503 where the table prints 501 - 504.',
};
