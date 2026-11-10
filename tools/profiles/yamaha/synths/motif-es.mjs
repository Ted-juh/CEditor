// Yamaha MOTIF ES6/ES7/ES8: the MIDI data format (p. 66), the bulk dump blocks (p. 68) and the
// parameter change tables (pp. 69-85) of its data list, laid out in full (motif-family.mjs). The
// MOTIF XS's tables at the same addresses, with four elements a voice, three Plug-in Parts beside the
// Performance's four and the Mix's sixteen (pp 60-62), the A/D Parts at 34 and 38 (pp 40-44), and the
// Plug-in Voice at 4C. esLayout is what the S90 ES and the MOTIF-RACK ES share with it.
import { motifLayout, numbered } from '../motif-family.mjs';
import { noteName } from '../build-yamaha-profile.mjs';

const range = (n) => Array.from({ length: n }, (u, i) => i);
const KEYS = { values: range(73), labels: range(73).map(noteName) };
// `pp = part number`: `00 – 03 Part 1 – 4`, `60 Part Plug-in 1` … `62 Part Plug-in 3`; the Mix's
// `00 – 0F Part 1 – 16`; `40 – 44 AD Part`. (The Mix's `10 – 1F Multi Plug-in Board Part (Not included
// in the Mixing setup)` is not laid out.)
// (The MOTIF-RACK ES has two Plug-in Parts, 60 and 61.)
const parts = (n, plugins) => ({ values: [...range(n), ...range(plugins).map((i) => 0x60 + i)], labels: [...numbered(n, 'Part').labels, ...numbered(plugins, 'Plug-in Part').labels] });
const inputs = (name) => ({ values: range(5).map((i) => 0x40 + i), labels: numbered(5, name).labels });

/**
 * o: motifLayout's, with multi (the Multi's bulk label and group), input (what the A/D parts are
 * called) and plugins (how many Plug-in Parts: 3, the MOTIF-RACK ES's 2).
 */
export function esLayout(o) {
  const multi = o.multi ?? { label: 'MULTI', group: 'Multi' };
  return motifLayout({
    zones: 4,
    elements: 4,
    ...o,
    multi,
    placeholdersAt: {
      31: { pp: parts(4, o.plugins ?? 3) },
      34: { pp: inputs(o.input ?? 'A/D Part') },
      37: { pp: parts(16, o.plugins ?? 3) },
      38: { pp: inputs(o.input ?? 'A/D Part') },
      // `ee = Element Number (00 – 48: C0 – C6)`: the drum keys, over the four groups 47-4A.
      49: { ee: KEYS },
      '4A': { ee: KEYS },
      ...(o.placeholdersAt ?? {}),
    },
    pull: { 'VOICE (PLUG-IN)': { id: 'pluginVoice', name: 'Plug-in Voice Edit Buffer', header: ['0E', '1F', '00'] }, ...(o.pull ?? {}) },
    noIdentity: o.noIdentity ?? 'the data list prints the identity request as received only, and no reply',
    // A table the layout also sets keeps these settings beside its own.
    tables: Object.fromEntries(Object.entries({
      ...Object.fromEntries(Object.keys(o.tables ?? {}).map((k) => [k, {}])),
      'PLUG-IN VOICE': { groupOf: (at, row, block) => `Plug-in Voice ${block?.name ?? 'Common'}` },
      [`${multi.label} COMMON for Pattern, Song`]: { groupOf: (at, row, block) => `${multi.group} ${block?.name ?? 'Common'}` },
      [`${multi.label} PART for Pattern, Song`]: { groupOf: (at, row, block) => `${multi.group} ${block?.name ?? at['pp:label'] ?? 'Part'}` },
      'DRUM VOICE KEY': { groupOf: (at) => `Drum Key ${at['ee:label']}` },
    }).map(([k, v]) => [k, { ...v, ...(o.tables?.[k] ?? {}) }])),
    // The Multi's Plug-in Parts print their last block `37 44 00`; the Performance's are 31 60 … 31 62.
    bulkCorrections: { 'Plug-in 3 Part 37 44 00': { seriesLast: '62' }, ...(o.bulkCorrections ?? {}) },
    // The Plug-in Voice's note (`* Receives the Plug-in Bulk Dump of the CS6x … Dump Request.`) is set
    // in the block column, and its last words run into two blocks' descriptions (the MOTIF's into
    // `* Receives the Plug-in Bulk Dump Common`, `MOTIF and complies with Reverb`). The MOTIF-RACK ES
    // prints its two Plug-in Parts in full, the first under its label (`PLUG-IN PART Plug-in 1 Part`).
    blockName: (name) => name.replace(/^\*.*\bDump\s+/, '').replace(/^.*\bcomplies with\s+/, '').replace(/^((Dump|Request\.)\s+)+/, '').replace(/^PLUG-IN PART\s+/, ''),
    notes: ['The Plug-in Voice (4C) and the Plug-in Parts edit what a PLG board installed in the slot holds; without one their messages go unanswered.', ...(o.notes ?? [])],
  });
}

export default esLayout({
  id: 'yamaha-motif-es',
  name: 'Yamaha MOTIF ES',
  description: 'Yamaha MOTIF ES6/ES7/ES8 workstation: every parameter change table of its data list (System, Master, Performance, Normal Voice with its elements, Drum Voice with its keys, Plug-in Voice, Mix), and Pull from the edit buffers.',
  document: { title: 'MOTIF ES6/MOTIF ES7/MOTIF ES8 Data List', file: 'motifese2.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/0/333990/motifese2.pdf' },
  read: { formatPages: [66], tablePages: range(17).map((i) => 69 + i), bulk: [{ page: 68, right: 310 }, { page: 68, left: 310 }] },
  multi: { label: 'MIX', group: 'Mix' },
});
