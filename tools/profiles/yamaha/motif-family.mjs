// motif-family.mjs — the layout the MOTIF XS and XF, MOTIF-RACK XS, MOX, S90 XS/S70 XS and MO6/MO8
// data lists share with the MOXF's: the same tables at the same addresses (System 00, Master 32-33,
// Performance 30-35, Multi 36-39, Normal Voice 40-42, Drum Voice 46-47), each model with its own
// counts of zones, parts, elements and audio inputs. Every table is laid out in full, as the MOXF's.

import { noteName } from './build-yamaha-profile.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);
export const numbered = (n, name) => ({ values: range(n), labels: range(n).map((i) => `${name} ${i + 1}`) });
const KEYS = { values: range(73), labels: range(73).map(noteName) };

/** `prefix` and what the row stands for: an element, a key, a zone, or the bulk block it is in. */
const under = (prefix) => (at, row, block) => {
  const one = ['ee', 'nn', 'pp', 'n'].find((v) => at[v] !== undefined && !block);
  if (one) return `${prefix} ${at[`${one}:label`]}`;
  if (at.ee !== undefined) return `${prefix} ${at['ee:label']}`;
  return `${prefix} ${block?.name ?? 'Common'}`.trim();
};

/**
 * o: { id, name, family, description, document (or documents), read, zones, perfParts, multiParts, elements,
 * audio: { [first two address bytes or first byte]: placeholders }, placeholdersAt: any others by
 * address, multi: the Multi's bulk label and group name, tables: more per-table settings, noPull and
 * pull: edit buffers left out and added, notes, identity, blockName }.
 */
export function motifLayout(o) {
  const multi = o.multi ?? { label: 'MULTI', group: 'Multi' };
  const pull = {
    'MASTER KEYBOARD': { id: 'master', name: 'Master Edit Buffer', header: ['0E', '7F', '00'] },
    'PERFORMANCE': { id: 'performance', name: 'Performance Edit Buffer', header: ['0E', '4F', '00'] },
    [multi.label]: { id: 'multi', name: `${multi.group} Edit Buffer`, header: ['0E', '5F', '00'] },
    'VOICE (NORMAL)': { id: 'normalVoice', name: 'Normal Voice Edit Buffer', header: ['0E', '0F', '00'] },
    'VOICE (DRUM)': { id: 'drumVoice', name: 'Drum Voice Edit Buffer', header: ['0E', '2F', '00'] },
  };
  for (const k of o.noPull ?? []) delete pull[k];
  Object.assign(pull, o.pull ?? {});
  return {
    id: o.id,
    name: o.name,
    family: o.family ?? 'MOTIF',
    description: o.description,
    documents: o.documents ?? [o.document],
    read: o.read,
    ...(o.noIdentity ? { noIdentity: o.noIdentity } : {}),
    // The Parameter Base Address table: `32 nn 00 Zone`, `31 pp 00 Part 1 – 4`, `37 pp 00 Part 1 – 16`,
    // `41 ee 00 Element Group (ee: 00 – 07)`, `47 ee 00 Element Group (ee: 0 – 72)`, the keys C0 – C6;
    // `00 pp 00`, `35 pp 00`, `39 pp 00` the audio inputs, at 40 and on.
    placeholders: { nn: numbered(o.zones ?? 0, 'Zone'), ee: numbered(o.elements ?? 8, 'Element') },
    placeholdersAt: {
      31: { pp: numbered(o.perfParts ?? 4, 'Part') },
      34: { pp: numbered(o.perfParts ?? 4, 'Arpeggio Part') },
      37: { pp: numbered(o.multiParts ?? 16, 'Part') },
      38: { pp: numbered(o.multiParts ?? 16, 'Arpeggio Part') },
      47: { ee: KEYS },
      48: { ee: KEYS },
      ...(o.audio ?? {}),
      ...(o.placeholdersAt ?? {}),
    },
    pull,
    tables: {
      'BULK CONTROL': { skip: 'the headers and footers of the bulk dumps, not settings' },
      'MODE CHANGE': { group: 'Mode' },
      'PART SET CONTROL for MIX VOICE': { group: 'Mode' },
      'Part Set Control': { group: 'Mode' },
      'SYSTEM': { groupOf: (at, row, block) => (at.nn !== undefined ? `Master ${at['nn:label']}` : at.pp !== undefined || at.n !== undefined ? `System ${at['pp:label'] ?? at['n:label']}` : block?.name ?? 'System') },
      'MASTER KEYBOARD': { groupOf: (at) => (at.nn !== undefined ? `Master ${at['nn:label']}` : 'Master Common') },
      'MASTER': { groupOf: (at) => (at.nn !== undefined ? `Master ${at['nn:label']}` : 'Master Common') },
      'PERFORMANCE COMMON': { groupOf: under('Performance') },
      'PERFORMANCE PART': { groupOf: (at, row, block) => `Performance ${block?.name ?? at['pp:label'] ?? at['n:label'] ?? 'Part'}` },
      [`MULTI COMMON for Pattern, Song`]: { groupOf: under(multi.group) },
      'MULTI COMMON': { groupOf: under(multi.group) },
      'SONG/PATTERN COMMON': { groupOf: under(multi.group) },
      [`MULTI PART for Pattern, Song`]: { groupOf: (at, row, block) => `${multi.group} ${block?.name ?? at['pp:label'] ?? 'Part'}` },
      'MULTI PART': { groupOf: (at, row, block) => `${multi.group} ${block?.name ?? at['pp:label'] ?? 'Part'}` },
      'SONG/PATTERN PART': { groupOf: (at, row, block) => `${multi.group} ${block?.name ?? at['pp:label'] ?? at['n:label'] ?? 'Part'}` },
      'NORMAL VOICE COMMON': { groupOf: under('Voice') },
      'NORMAL VOICE ELEMENT': { groupOf: (at) => `Voice ${at['ee:label']}` },
      'DRUM VOICE COMMON': { groupOf: under('Drum') },
      'DRUM VOICE KEY': { groupOf: (at) => `Drum Key ${at['ee:label']}` },
      ...(o.tables ?? {}),
    },
    ...(o.bulkCorrections ? { bulkCorrections: o.bulkCorrections } : {}),
    ...(o.blockName ? { blockName: o.blockName } : {}),
    // `The Edit Buffer data … will be transmitted/received only in the corresponding Mode`: the requests
    // for the other modes go unanswered, so each is asked once.
    ...(o.inModeOnly ? { collectionRetries: 0 } : {}),
    notes: [
      `Parameter changes at 40-42 (Normal Voice) and 46-47 (Drum Voice) edit the voice in the Voice mode's edit buffer; Pull asks for each edit buffer the Bulk Control table names, whichever mode the instrument is in.${o.inModeOnly ? ' The data list says an edit buffer is sent only in its own mode, so the requests for the others go unanswered; each is asked once.' : ''}`,
      ...(o.notes ?? []),
    ],
  };
}
