// Yamaha CP88/CP73: the data list in the V2.00 supplementary manual (format pp. 20-21, bulk dump
// blocks p. 21, parameter change tables pp. 22-25), which supersedes the owner's manual's. Every
// table laid out: the System and the Live Set Sound with its four zones and its Piano, E.Piano and
// Sub sections.
const range = (n) => Array.from({ length: n }, (u, i) => i);
const numbered = (n, name) => ({ values: range(n), labels: range(n).map((i) => `${name} ${i + 1}`) });

export default {
  id: 'yamaha-cp88-cp73',
  name: 'Yamaha CP88/CP73',
  family: 'CP',
  description: 'Yamaha CP88/CP73 stage piano: every parameter change table of its V2.00 data list (System, the Live Set Sound with its zones and its Piano, E.Piano and Sub sections), and Pull from the current sound.',
  documents: [{ title: 'CP88/CP73 Supplementary Manual V2.00 (H0)', file: 'CP88_CP73_supplementary_manual_En_v200_H0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/7/1243337/CP88_CP73_supplementary_manual_En_v200_H0.pdf' }],
  read: { formatPages: [20, 21], tablePages: range(4).map((i) => 22 + i), bulk: [{ page: 21, right: 300 }, { page: 21, left: 300 }] },
  // `4A zz 00 Zone 1 – 4`; `50 0p 00`, `50 1p 00`, `50 2p 00`: the Piano, E.Piano and Sub sections, as
  // the bulk dump table names them.
  placeholders: { zz: numbered(4, 'Zone'), p: { values: [0, 1, 2], labels: ['Piano', 'E.Piano', 'Sub'] } },
  pull: { 'Live Set Sound': { id: 'currentSound', name: 'Current Sound Buffer', header: ['0E', '7F', '00'] } },
  noIdentity: 'the data list prints the identity reply with the family bytes as `dd dd`, a code for each model (59 06 for the CP73, 5A 06 for the CP88)',
  tables: {
    // The data list titles only its first table `MIDI PARAMETER CHANGE TABLE (BULK CONTROL)`, and the
    // rest with a section heading the reader does not take (`SYSTEM`, `LIVE SET SOUND`), so every
    // table runs on under that one: its rows are named by the bulk dump block they fall in.
    'BULK CONTROL': { groupOf: (at, row, block) => (at.zz !== undefined ? `Zone ${at.zz + 1}` : at.p !== undefined ? `${at['p:label']} ${/Specific/.test(block?.name ?? '') ? 'Specific' : /Additional/.test(block?.name ?? '') ? 'Additional' : 'Common'}` : row.address[0] === '46' ? `Live Set Sound ${block?.name ?? 'Common'}` : block?.name ?? 'System') },
  },
};
