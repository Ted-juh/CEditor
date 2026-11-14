// Yamaha CP5: the MIDI data format (p. 33), the bulk dump blocks (p. 34) and the parameter change
// tables (pp. 35-40) of the CP5/CP50 data list, every table laid out in full: the System (Utility,
// Master EQ, Master Compressor), and the Performance's Common, its parts (each a Part, a Pre-Amplifier,
// a Modulation Effect/Insertion 1 and a Power-Amplifier/Insertion 2 block, 31-34 pp), its Backing Part,
// its A/D (mic) input and its four zones. The data list prints the model ID's second byte, and the
// identity's family code, a byte for each model, and marks what the CP5 alone has: cpFive() takes one
// model's.
const range = (n) => Array.from({ length: n }, (u, i) => i);
const numbered = (n, name) => ({ values: range(n), labels: range(n).map((i) => `${name} ${i + 1}`) });

export const CP5_DOC = { title: 'CP5/CP50 Data List', file: 'cp5cp50_en_dl_c0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/5/325085/cp5cp50_en_dl_c0.pdf' };
// The blocks a part's settings are in, by their address's high byte.
const PART_BLOCKS = { 31: '', 32: ' Pre-Amp', 33: ' Modulation Effect/Insertion 1', 34: ' Power-Amp/Insertion 2' };

/**
 * The CP5 and CP50 alike but for model (the model ID's second byte), family (the identity's), parts
 * (`pp = Part Number`, `CP5: 00 – 03 (HEX) Part 1 – Part 4 (L1, R1, L2, R2)`, `CP50: 00 – 01 (HEX)
 * Part 1 – Part 2 (L, R)`) and absent (what the data list marks `(CP5 only)`).
 */
export const cpFive = ({ id, name, description, model, family, parts, absent }) => ({
  id,
  name,
  family: 'CP',
  description,
  documents: [CP5_DOC],
  read: { formatPages: [33], tablePages: range(6).map((i) => 35 + i), bulk: [{ page: 34, left: 300 }] },
  // `** Model ID CP5: 7F, CP50: 7F`, `** Model ID CP5: 10, CP50: 11`; the identity reply `F0 7E 7F 06 02
  // 43 00 41 dd dd 00 00 00 7F F7`, `dd: Device Number Code CP5: 3FH, 06H CP50: 40H, 06H`.
  header: ['7F', model],
  bulkHeader: ['7F', model, 'bb', 'bb'],
  identityReply: ['F0', '7E', '7F', '06', '02', '43', '00', '41', family, '06', '00', '00', '00', '7F', 'F7'],
  // `zz = 00 – 03: ZoneNo.`
  placeholders: { pp: { values: range(parts.length), labels: parts.map((p, i) => `Part ${i + 1} (${p})`) }, zz: numbered(4, 'Zone') },
  ...(absent ? { absent } : {}),
  pull: { 'PERFORMANCE': { id: 'performance', name: 'Performance Edit Buffer', header: ['0E', '4F', '00'] } },
  // The bulk table's descriptions carry the placeholders' notes: `Part (pp = 00 – 03 (CP5), 00 – 01
  // (CP50): PartNo.)`, `AD Part (CP5 only)`.
  blockName: (blockName) => blockName.replace(/\s*\((?:pp|zz) = [^()]*(?:\([^()]*\)[^()]*)*\)/g, '').replace(/\s*\(CP5 only\)/g, '').replace(/^(Zone|Part) (?=\1 )/, '').trim(),
  tables: {
    'BULK CONTROL': { skip: 'the headers and footers of the bulk dumps, not settings' },
    'SYSTEM': { groupOf: (at, row, block) => block?.name ?? 'System' },
    'PERFORMANCE COMMON': { groupOf: (at, row, block) => `Performance ${block?.name ?? 'Common'}` },
    'PERFORMANCE PART': { groupOf: (at, row, block) => (at.pp !== undefined ? `${at['pp:label']}${PART_BLOCKS[row.address[0]]}` : block?.name ?? 'Part') },
    'PERFORMANCE ZONE': { groupOf: (at) => at['zz:label'] },
  },
  notes: [
    'The CP5/CP50 data list prints the model ID as 7F and a second byte for each model (10 for the CP5, 11 for the CP50), and the identity\'s family code likewise (3F 06, 40 06): this profile takes this model\'s.',
  ],
});

export default cpFive({
  id: 'yamaha-cp5',
  name: 'Yamaha CP5',
  description: 'Yamaha CP5 stage piano: every parameter change table of its data list (System, the Performance with its four parts, Backing Part, A/D input and four zones), identity, and Pull from the Performance edit buffer.',
  model: '10',
  family: '3F',
  parts: ['L1', 'R1', 'L2', 'R2'],
});
