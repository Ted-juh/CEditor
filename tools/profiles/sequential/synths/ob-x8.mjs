// Oberheim OB-X8. OB-X8 Manual V2.2, OB-X8 MIDI Implementation (PDF pages 131-133): Control NRPN
// Data, printed name first and in capitals, as the Prophet-5's Rev4 document prints it; this
// chapter was made from that one. Every program parameter is in it, despite its heading ("not
// saved as part of a program", copied with the rest); there is no global table.
//
// Names are kept as printed. `PAGE 2` is the panel's second function of a control.

export default {
  id: 'oberheim-ob-x8',
  name: 'Oberheim OB-X8',
  manufacturer: 'Oberheim',
  family: 'OB',
  description: "Oberheim OB-X8, every parameter in its manual's NRPN table.",
  document: {
    title: 'OB-X8 Manual',
    version: '2.2',
    file: 'OB-X8-Manual-V2_2.pdf',
    url: 'https://oberheim.com/wp-content/uploads/2023/09/OB-X8-Manual-V2_2.pdf',
  },
  tables: [
    { id: 'control', header: /Name\s+NRPN\s+Range/g, fields: ['name', 'nrpn', 'range'], pages: [131, 133] },
  ],
  skip: [
    [/^PROGRAM NAME CHAR\b/i, 'the program name, one character per NRPN; CEditor cannot edit text over NRPN yet'],
  ],
  // No identity. The Device Inquiry reply (p124) prints the family code as 0011 0011 (33H), as the
  // Prophet-5's document does for the Prophet-5; every other SysEx message here addresses the
  // OB-X8 as 0011 0001 (31H).
  //
  // No preset recall. Bank Select received is "1 - 5 select user banks 1 - 5; 6 - 9 select factory
  // banks 1 - 4" and transmitted "1 - 5" (p115-117), and the Program Change line counts "0-39 for
  // Programs 0-7 within Group 1" up to Group 11's 80-87: the Prophet-5's lines, which disagree
  // with themselves the same way.
  notes: [
    'No identity check: the manual\'s Device Inquiry reply prints the OB-X8\'s family code as 33H (as the Prophet-5\'s document does for the Prophet-5), where every other SysEx message in the chapter uses 31H. Which one the instrument sends has not been checked.',
    'No preset recall: the manual\'s Bank Select and Program Change lines disagree with each other (banks "1 - 5" and "6 - 9", programs "0-39 for Programs 0-7 within Group 1", up to 87).',
    'Two split rows print a second NRPN under the first (1090 under 1122, 1092 under 1123), for the other half of the split by their names, without saying which is which; each is kept on the first number only.',
  ],
  names: {
    86: { name: 'ARP NUMBER OF TRANSPOSE INTERVALS', why: 'printed hyphenated across two lines, "TRANS-" and "POSE".' },
  },
  descriptions: {
    15: 'The manual prints the range as 0-66; kept as printed.',
    48: 'The manual prints 0-27, where LFO 1 MOD 1 RAMP UP (NRPN 43) is 0-127; kept as printed.',
    56: 'The manual prints the same name for NRPN 56 and 57; which destination each is has not been checked.',
    57: 'The manual prints the same name for NRPN 56 and 57; which destination each is has not been checked.',
    94: 'The manual prints the range as 0-1207; kept as printed.',
    1122: 'The manual prints NRPN 1090 under this one, presumably the other half of the split; it is not offered.',
    1123: 'The manual prints NRPN 1092 under this one, presumably the other half of the split; it is not offered.',
  },
  groups: [
    ['Oscillator $1', /^(?:PAGE 2 )?OSC ([12])\s+/],
    ['Oscillators', /^(?:PAGE 2 )?(OSC\s+|VOICE DETUNE)/],
    ['Mixer', /^(?:PAGE 2 )?NOISE\s+/],
    ['Portamento', /^(?:PAGE 2 )?PORTA(?:MENTO)?\s+/],
    ['Filter Envelope', /^FILTER ENV\s+/],
    ['Amp Envelope', /^VOL(?:UME)? ENV\s+/],
    ['Envelopes', /^(ENVELOPE TYPE|PAGE 2 PEDAL RELEASE)$/],
    ['Filter', /^(?:PAGE 2 )?FILTER\s+/],
    // The panel's one LFO; the Mod Box has the other.
    ['LFO 1', /^(?:PAGE 2 )?LFO ?1?\s+/],
    ['Mod Box', /^MOD ?BOX\s+/],
    ['Aftertouch', /^PRESSURE\s+/],
    ['Arpeggiator', /^ARP\s+/],
    ['Chord', /^PAGE 2 CHORD\s+/],
    ['Split', /^SPLIT\s+/],
    ['Voice', /^(?:PAGE 2 )?(UNISON|PROGRAM VOLUME|PAN|VINTAGE)\b/],
  ],
};
