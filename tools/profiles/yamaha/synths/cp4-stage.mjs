// Yamaha CP4 STAGE: the MIDI data format (pp. 36-37), the bulk dump blocks (p. 37) and the parameter
// change tables (pp. 38-41) of the CP4 STAGE/CP40 STAGE data list, every table laid out in full: the
// System, the Performance and its three parts and four zones. The data list prints the model ID's
// second byte, and the identity's family code, a byte for each model: the CP4 STAGE's here.
const range = (n) => Array.from({ length: n }, (u, i) => i);
const numbered = (n, name) => ({ values: range(n), labels: range(n).map((i) => `${name} ${i + 1}`) });

export const CP4_DOC = { title: 'CP4 STAGE/CP40 STAGE Data List (A0)', file: 'cp4cp40_en_dl_a0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/2/330172/cp4cp40_en_dl_a0.pdf' };
/** The CP4 STAGE and CP40 STAGE alike but for `model` (the model ID's second byte) and `family` (the identity's). */
export const cpStage = ({ id, name, description, model, family }) => ({
  id,
  name,
  family: 'CP',
  description,
  documents: [CP4_DOC],
  read: { formatPages: [36, 37], tablePages: range(4).map((i) => 38 + i), bulk: [{ page: 37, right: 300 }, { page: 37, left: 300 }] },
  // `7F Model ID`, `** Model ID` with `CP4 STAGE: 1A, CP40 STAGE: 1B` beside it; the identity reply
  // `F0 7E 7F 06 02 43 00 41 dd 06 00 00 00 7F F7`, `dd = CP4 STAGE: 49, CP40 STAGE: 4A`.
  header: ['7F', model],
  bulkHeader: ['7F', model, 'bb', 'bb'],
  identityReply: ['F0', '7E', '7F', '06', '02', '43', '00', '41', family, '06', '00', '00', '00', '7F', 'F7'],
  // `37 pp 00 Part 1 – 3`, `3A zz 00 Zone (zz = 00 – 03)`.
  placeholders: { pp: numbered(3, 'Part'), zz: numbered(4, 'Zone') },
  pull: { 'PERFORMANCE': { id: 'performance', name: 'Performance Edit Buffer', header: ['0E', '5F', '00'] } },
  tables: {
    'BULK CONTROL': { skip: 'the headers and footers of the bulk dumps, not settings' },
    'SYSTEM': { groupOf: (at, row, block) => block?.name ?? 'System' },
    'PERFORMANCE COMMON': { groupOf: (at, row, block) => `Performance ${block?.name ?? 'Common'}` },
    'PERFORMANCE PART': { groupOf: (at, row, block) => block?.name ?? `Part ${at.pp + 1}` },
    'PERFORMANCE ZONE': { groupOf: (at) => `Zone ${at.zz + 1}` },
  },
  notes: [
    'The data list prints the model ID as 7F and a second byte for each model (1A for the CP4 STAGE, 1B for the CP40 STAGE), and the identity\'s family code likewise (49 06, 4A 06): this profile takes this model\'s.',
  ],
});

export default cpStage({ id: 'yamaha-cp4-stage', name: 'Yamaha CP4 STAGE', description: 'Yamaha CP4 STAGE stage piano: every parameter change table of its data list (System, the Performance and its three parts and four zones), identity, and Pull from the Performance edit buffer.', model: '1A', family: '49' });
