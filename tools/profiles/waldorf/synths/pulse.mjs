// Waldorf Pulse and Pulse Plus (operating system 2.0): the controller assignments (appendix B, pp.
// 58 - 60) and the program dump (appendix C, pp. 61 - 63) of its User's Manual, and the modulation
// sources and destinations its tables refer to (Tables 1 and 3, pp. 30 - 31). Every sound parameter is
// edited by its control change and read back from the program dump, where the two name it alike.

export default {
  id: 'waldorf-pulse',
  name: 'Waldorf Pulse',
  family: 'Pulse',
  description: 'Waldorf Pulse and Pulse Plus analog synthesizer (OS 2.0): every sound parameter as its control change, read back from the program dump.',
  document: { title: 'User’s Manual Pulse • PulsePlus, version 2.0', file: 'Manual_v2_0_eng.pdf', url: 'https://downloads.waldorfmusic.com/cloud/index.php/s/jibbSd97dbx2zXf/download (Documentation EN/Manual_v2_0_eng.pdf in the zip)' },
  read: {
    numbered: {
      controllers: { pages: [58, 59, 60], stop: '^\\(C\\)' },
      dump: { pages: [61, 62, 63], stop: '^Program Bulk Dump' },
      lists: {
        sources: { page: 30, start: '^0 Off', end: '^Table 1:' },
        destinations: { page: 31, start: '^0 Pitch$', end: '^Table 3:' },
      },
    },
  },
  // `see Table`: a modulation source (Table 1) or destination (Table 3).
  listOf: (name) => (/Destination$/.test(name) ? 'destinations' : /Source$/.test(name) ? 'sources' : null),
  // The program dump: `F0 3E 0B <dev> 00 <program> <bytes 6 - 74> <checksum> F7`, the checksum over
  // bytes 6 - 74, and asked for by program number (`F0 3E 0B <dev> 40 <program> F7`).
  programDump: { model: '0B', from: 6, to: 74 },
  groups: [
    [/^Osc(\d)/, 'Oscillator $1'],
    [/^(Noise|External)/, 'Mixer'],
    [/^LFO(\d)/, 'LFO $1'],
    [/^Env(\d)/, 'Envelope $1'],
    [/^Cutoff|^Resonance/, 'Filter'],
    [/^(Volume|Panning)/, 'Amplifier'],
    [/^(Portamento|Pitchbend|Pitch Mod)/, 'Pitch'],
    [/^Mod Unit (\d)/, 'Modulation $1'],
    [/^CV 2/, 'CV'],
    [/^Arpeggiator/, 'Arpeggiator'],
  ],
  // The table prints Cutoff Mod Source at byte 65 and Cutoff Mod Amount at 66. In the 125 programs of
  // the sound sets Waldorf publishes for the Pulse, byte 66 is 0 - 15 in every one and byte 65 is
  // spread around 64, as an amount is; and the dump puts an amount before its source everywhere else
  // (Pitch Mod Amount 39, Source 40). The two are the other way round.
  dumpCorrections: {
    65: { name: 'Cutoff Mod Amount', printed: 'Cutoff Mod Source' },
    66: { name: 'Cutoff Mod Source', printed: 'Cutoff Mod Amount' },
  },
  dumpCorrectionsBecause: 'In all 125 programs of the sound sets Waldorf publishes for the Pulse, byte 66 holds 0 - 15 and byte 65 values spread around 64, as an amount does; and the dump puts an amount before its source everywhere else (Pitch Mod Amount 39, Pitch Mod Source 40).',
  notes: [
    'The Pulse has no request for its edit buffer: Pull asks for a stored program, the program variable (0 for P.1 … 98 for P.99, 99 for P.rn), so what comes back is that program as stored. A program dump sent from the panel (Shift + Dump, Program Dump) is the current program, edits and all, and is read back as it arrives.',
    'The panel\'s Controller Dump, and its request ($4B), send the current program as these control changes, which CEditor follows as they come.',
    'Read through this profile, Waldorf\'s published Pulse sound sets hold a few values the manual does not list: Portamento Mode 2 or 3 in 12 of 125 programs (it names normal and fingered), Arpeggiator Range above 9 in 5, Arpeggiator Mode 15 in 4. A Pull of such a program shows the number.',
  ],
  variables: { program: 0 },
};
