// Yamaha YC88/YC73: the MIDI data format of their owner's manual (pp. 63-64) and the MIDI Data Table
// (YC88/YC73) of the YC88/YC73/YC61 V2.00 supplementary manual (bulk dump blocks p. 18, parameter
// change tables pp. 19-22), which supersedes the owner's manual's.
const range = (n) => Array.from({ length: n }, (u, i) => i);
const numbered = (n, name) => ({ values: range(n), labels: range(n).map((i) => `${name} ${i + 1}`) });

export const YC_SUPPLEMENT = { title: 'YC88/YC73/YC61 Supplementary Manual V2.00 (E0)', file: 'YC88_YC73_YC61_supplementary_manual_En_v200_E0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/9/1382649/YC88_YC73_YC61_supplementary_manual_En_v200_E0.pdf' };

export function ycLayout({ id, name, description, manual, bulkPage, tablePages, identityReply, noIdentity }) {
  return {
    id,
    name,
    family: 'YC',
    description,
    // The tables from the supplement (document 1), the data format from the owner's manual (0).
    documents: [manual, YC_SUPPLEMENT],
    read: { doc: 1, formatDoc: 0, formatPages: [63, 64], tablePages, bulk: [{ page: bulkPage, right: 300 }, { page: bulkPage, left: 300 }] },
    ...(identityReply ? { identityReply } : { noIdentity }),
    // The Parameter Base Address table: `4A zz 00 Zone (zz: 00 – 03)`, `50 1p 00 Part (p: 0 – 1 (0: UPPER,
    // 1: LOWER))`, `60 0s 00 Section (s: 0 – 1 (0: A, 1: B))`.
    placeholders: { zz: numbered(4, 'Zone'), p: { values: [0, 1], labels: ['Upper', 'Lower'] }, s: { values: [0, 1], labels: ['Key A', 'Key B'] } },
    // The Bulk Control table's `0E 7F 00 Current Sound Buffer`.
    pull: { 'Live Set Sound': { id: 'currentSound', name: 'Current Sound Buffer', header: ['0E', '7F', '00'] } },
    tables: {
      // The data list titles its first table `MIDI PARAMETER CHANGE TABLE (BULK CONTROL)` over two
      // lines the reader takes as `PARAMETER CHANGE TABLE`, and the rest with section headings it does
      // not take, so every table runs on under that one: rows are named by what they stand for.
      'PARAMETER CHANGE TABLE': { groupOf: (at, row, block) => (at.zz !== undefined ? `Zone ${at.zz + 1}` : at.p !== undefined ? `Organ ${at['p:label']}` : at.s !== undefined ? at['s:label'] : row.address[0] === '50' ? 'Organ' : row.address[0] === '46' ? 'Live Set Sound Common' : block?.name ?? 'System') },
    },
    notes: [
      'The bulk dump table prints the Live Set Sound Common as 1 byte (46 00 00), the owner\'s manual\'s too, where its parameter change table runs to 46 00 40: those settings are not read back, and a Common block of another size is let pass.',
    ],
  };
}

export default ycLayout({
  id: 'yamaha-yc88-yc73',
  name: 'Yamaha YC88/YC73',
  description: 'Yamaha YC88/YC73 stage keyboard: every parameter change table of its V2.00 data list (System, the Live Set Sound with its zones and sections), and Pull from the current sound.',
  manual: { title: 'YC88/YC73 Owner\'s Manual (B0)', file: 'VDJ8720_YC88_YC73_owners_manual_En_B0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/5/1376845/VDJ8720_YC88_YC73_owners_manual_En_B0.pdf' },
  bulkPage: 18,
  tablePages: [19, 20, 21, 22],
  noIdentity: 'the owner\'s manual prints the identity reply with the family bytes as `dd dd`, a code for each model',
});
