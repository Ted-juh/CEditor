// Waldorf Microwave (1989): its System Exclusive Documentation for system software 2.00, a plain-text
// file, laid out in full. Every byte of the sound dump (BPRD) with values is a parameter, sent as a
// Real Time BPR Edit (RTBP, `F0 3E 00 DEV 60 <instrument> <parameter, two nibbles> <value> <CHK> F7`),
// the parameter number being its byte less 5; Pull asks for the sound playing (BPRR).

export default {
  id: 'waldorf-microwave',
  name: 'Waldorf Microwave',
  family: 'Microwave',
  description: 'Waldorf Microwave (1989) wavetable synthesizer, system software 2.00: every sound parameter of its System Exclusive Documentation, sent as a real-time sound edit, with Pull of the sound playing.',
  document: { title: 'Waldorf Microwave System Exclusive Documentation, system software version 2.00 revision 00 (1 March 1994)', file: 'MicrowaveSysex 2_0.txt', url: 'https://downloads.waldorfmusic.com/cloud/index.php/s/weTqE3SkZzocxYe/download (Documentation EN/MicrowaveSysex 2_0.txt in the zip)' },
  // The sound dump's description (`BPRD`), its data from the line `Data:` to the checksum's row, and
  // the Modifier Table under it.
  read: { text: { from: '^BPRD\\s*$', table: { start: '^\\s*Data:', end: 'CHKSUM' }, lists: { modifiers: { start: 'Modifier Table:', end: '^ARPR' } } } },
  messages: {
    equipment: '00',
    edit: '60',
    instrument: 0,
    dataFrom: 5,
    dump: { idm: '42', name: 'Sound Dump (BPRD)', location: 0, size: 180 },
    // `If there are no data bytes in the message (simple request), the checksum will always be 00h.`
    request: { idm: '02', name: 'Sound Dump Request (BPRR), the sound playing', location: [] },
  },
  rows: {
    // Printed `0...15` and without the `+` of every other modifier source, Osc 2's (24) among them,
    // which repeats it: the 2.0 range, 0 - 23, as the rest.
    13: { values: '0...23, see Modifier Table' },
    // Printed `equals 64...+63`, the minus lost.
    14: { values: '0...127, equals -64...+63' },
  },
  marks: { '*': 'New in system software 2.0.', '+': 'Its range as of system software 2.0.' },
  groups: [
    [/^Osc (\d)/, 'Oscillator $1'],
    [/^Wave 1 & 2/, 'Waves'],
    [/^(?:Wave \d|Noise) (?:Volume|Level)/, 'Mixer'],
    [/^Wave (\d)/, 'Wave $1'],
    [/^(Sound Volume|Volume|Panning|Pan )/, 'Amplifier'],
    [/^(Filter|Cutoff|Reson)/, 'Filter'],
    [/^Vol Envel/, 'Volume Envelope'],
    [/^Fltr Envel/, 'Filter Envelope'],
    [/^Wav Envel/, 'Wave Envelope'],
    [/^LFO (\d)/, 'LFO $1'],
    [/^(Glide|Tuning)/, 'Common'],
    [/^Name/, 'Sound'],
  ],
  notes: [
    'The document is for system software 2.00. A Microwave on an earlier version has the same sound dump, but the parameters marked + have narrower ranges there and those marked * do nothing.',
    'The Microwave answers the sound request with the sound playing, edits and all, which in Multi mode is the last instrument\'s selected: the document says to switch to Single (MIDI-Poly) mode before requesting. The edit goes to instrument 1\'s sound (instrument 0), which in Single mode is the sound playing.',
    'The Microwave sends the same edit message (RTBP) when its Overflow Mode is Link and a sound parameter is changed on its panel; CEditor reads those by byte.',
    'Read through this profile, the factory sound sets Waldorf publishes (mwsset1 - 4, 256 sounds from cartridge dumps) predate system software 2.00: bytes 144 and 169 - 174, unused before it, hold what was left there, so the LFO 2 phase shift and the wave and noise level modifiers read as values outside their lists in most of them. 60 of the 256 have characters below 20h in their names (0Ch, 19h - 1Fh), outside the 20h - 7Fh the document gives, read as ?.',
  ],
};
