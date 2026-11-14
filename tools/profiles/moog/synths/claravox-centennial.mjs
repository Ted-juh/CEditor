// Moog Claravox Centennial: the MIDI parameters of its user guide (pp. 55-62 as printed), each a CC
// and an NRPN.
export default {
  id: 'moog-claravox-centennial',
  name: 'Moog Claravox Centennial',
  family: 'Claravox',
  description: 'Moog Claravox Centennial theremin: the MIDI parameter tables of its user guide, the 14-bit settings on their NRPNs and the rest on their CCs.',
  documents: [{ title: 'Claravox Centennial User Guide', file: 'Claravox_Centennial_Web_Manual.pdf', url: 'https://cdn.inmusicbrands.com/Moog/BackOffice/Claravox_Centennial_Web_Manual.pdf' }],
  tables: [{ kind: 'ccnrpn', pages: [56, 57, 58, 59, 60, 61, 62, 63], columns: [['name', 'Parameter'], ['cc', 'MIDI CC#'], ['nrpn', 'MIDI NRPN##'], ['values', 'Range'], ['notes', 'Notes']] }],
  // The guide sets ♯ and ♭ in a font whose signs are not in the PDF's text: `11 = C (D )` is `11 = C♯ (D♭)` on the page.
  labelFix: [[/^([A-G]) \(([A-G]) \)$/, '$1♯ ($2♭)']],
  notes: ['The Quantize (ROOT) names are C♯ (D♭) and so on: the guide\'s ♯ and ♭ are in a font whose signs the PDF\'s text leaves out (`C (D )`), and are restored here.', 'Every row prints a CC and an NRPN. A range of 0 - 16383 is sent on the NRPN, as one 14-bit value; the rest, 0 - 127 or named values, on the CC.'],
};
