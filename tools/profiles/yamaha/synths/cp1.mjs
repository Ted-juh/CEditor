// Yamaha CP1: the MIDI data format (pp. 11-12), the bulk dump blocks (p. 13) and the parameter change
// tables (pp. 14-18) of its data list, every table laid out in full: the System, and the Performance's
// Common, its two layers (each a Part, a Pre-Amp, a Modulation and a Power-Amp block: 31 0p, 1p, 2p
// and 3p, p the layer) and its four Master Keyboard zones. The data list prints only the addresses
// that hold a setting.
const range = (n) => Array.from({ length: n }, (u, i) => i);
const numbered = (n, name) => ({ values: range(n), labels: range(n).map((i) => `${name} ${i + 1}`) });

export default {
  id: 'yamaha-cp1',
  name: 'Yamaha CP1',
  family: 'CP',
  description: 'Yamaha CP1 stage piano: every parameter change table of its data list (System, the Performance with its two layers and four Master Keyboard zones), identity, and Pull from the Performance edit buffer.',
  documents: [{ title: 'CP1 Data List', file: 'cp1_en_dl_d0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/4/314384/cp1_en_dl_d0.pdf' }],
  read: { formatPages: [11, 12], tablePages: range(5).map((i) => 14 + i), bulk: [{ page: 13, left: 300 }] },
  // `F0H 7EH 7FH 06H 02H 43H 00H 41H ddH ddH 00H 00H 00H 01H F7H`, `dd: Device Number Code`, `CP1: 3B 06`.
  identityReply: ['F0', '7E', '7F', '06', '02', '43', '00', '41', '3B', '06', '00', '00', '00', '01', 'F7'],
  // `0p = Layer number 00-01 Layer 1 – 2` (and 1p, 2p, 3p alike); `nn = zone number 00 – 03`.
  placeholders: { p: numbered(2, 'Layer'), nn: numbered(4, 'Zone') },
  pull: { 'PERFORMANCE': { id: 'performance', name: 'Performance Edit Buffer', header: ['0E', '4F', '00'] } },
  tables: {
    'BULK CONTROL': { skip: 'the headers and footers of the bulk dumps, not settings' },
    'SYSTEM': { groupOf: (at, row, block) => block?.name ?? 'System' },
    'PERFORMANCE COMMON': { groupOf: (at, row, block) => `Performance ${block?.name ?? 'Common'}` },
    'PERFORMANCE PART': { groupOf: (at, row, block) => block?.name ?? `Layer ${at.p + 1}` },
    'MASTER KEYBOARD ZONE': { groupOf: (at) => `Zone ${at.nn + 1}` },
  },
};
