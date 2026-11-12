// build-gr1-profile.mjs — the GR-1 manual's MIDI Command table (tables/gr-1.json, from
// read-gr1-table.mjs) and its layout (synths/gr-1.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the table and the "Precision MIDI" page after it:
//   - a CC row numbered 0 - 127 is its control change; one above 127 its NRPN (CC 99, CC 98, the
//     value on CC 6), as the page says ("the GR-1's large modulation matrix … also uses CC's that are
//     only available as NRPN"); its value the 7-bit value its range prints, as for the GR-2;
//   - a run of numbers (`140-143`) beside `Scan part 1..4` is a row for each part;
//   - values named one each over the whole range (`0:SINE, 1:RAND, 2:SAW, 3:SQR`) or as bands (`0:OFF,
//     >0:ON`) are a choice, a band's first value sent; a list that stops short (`5:CUTOFF, ..`) is
//     not, and the range is sent with the list in its description;
//   - a sweep printed in numbers (`-1.0 .. +1.0`) on a linear row is shown so; `Part number = value
//     + 1` and `… multiplier - 1` are shown one up;
//   - left out, and named: the messages that are not settings (pitch bend, program change, the notes,
//     the timing messages), MIDI's own controllers, the performance ones, and the actions.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const MIDI_OWN = /^(?:NRPN (?:value|Par) (?:MSB|LSB)|RPN Par (?:MSB|LSB)|All sound off|OMNI (?:off|on))$/;
const PERFORMANCE = /^(?:MOD wheel(?: LSB)?|Sustain pedal|Note pressure LSB|MPE timbre LSB)$/;

/** `0:SINE, 1:RAND`, `0:OFF, >0:ON`, `0: OFF, >=1: ON` -> [{ value, label, band }], or null; `5:CUTOFF, ..` -> null. */
export function namedValues(description) {
  if (/\.\.\s*$/.test(description)) return null;
  const parts = String(description).split(/,\s*/);
  const out = parts.map((part) => {
    const m = /^(>=|>)?(\d+)\s*:\s*(\S.*)$/.exec(part.trim());
    return m ? { value: m[1] === '>' ? Number(m[2]) + 1 : Number(m[2]), label: m[3].trim(), band: Boolean(m[1]) } : null;
  });
  return out.length >= 2 && out.every(Boolean) ? out : null;
}

/** `0 - 127`, `0–3`, `0..31`, `0-1(+)` -> { min, max }, or null (`-`). */
export function spanOf(value) {
  const m = /^(\d+)\s*(?:[–-]|\.\.)\s*(\d+)/.exec(String(value).trim());
  return m ? { min: Number(m[1]), max: Number(m[2]) } : null;
}

export function buildGr1Profile(data, layout) {
  const recipes = new Map();
  const parameters = [];
  const left = { message: [], own: [], performance: [], action: [] };
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const shortened = [];
  const rows = [];
  for (const row of data.rows) {
    const run = /^(\d+)-(\d+)$/.exec(row.cc);
    const parts = /^(.*?)\s*1\.\.(\d+)$/.exec(row.name);
    if (run && parts && Number(run[2]) - Number(run[1]) + 1 === Number(parts[2])) {
      for (let k = 0; k < Number(parts[2]); k++) rows.push({ ...row, cc: Number(run[1]) + k, name: `${parts[1]} ${k + 1}` });
    } else rows.push({ ...row, cc: /^\d+$/.test(row.cc) ? Number(row.cc) : null });
  }
  for (const row of rows) {
    const label = `${row.name}${row.cc != null ? ` (${row.cc})` : ''}`;
    if (row.msg !== 'CC') { left.message.push(label); continue; }
    if (MIDI_OWN.test(row.name)) { left.own.push(label); continue; }
    if (PERFORMANCE.test(row.name)) { left.performance.push(label); continue; }
    const span = spanOf(row.value);
    if (!span || /^REC\b/.test(row.name)) { left.action.push(label); continue; }
    const nrpn = row.cc > 127;
    const id = nrpn ? `nrpn${hex(row.cc >> 7)}${hex(row.cc & 127)}` : `cc${hex(row.cc)}`;
    recipes.set(id, nrpn ? { id, kind: 'nrpn', channel: '$channel', parameterMsb: row.cc >> 7, parameterLsb: row.cc & 127, valueResolution: 7, value: '$encodedValue' } : { id, kind: 'cc', channel: '$channel', controller: row.cc });
    const group = nrpn ? 'NRPN only' : 'Control changes';
    const base = {
      id: unique(`${camel(group)}.${camel(row.name)}`), name: row.name, group, source: { page: row.page },
      description: `${nrpn ? 'NRPN' : 'CC'} ${row.cc} (page ${row.page}): ${row.name}; ${row.value}${row.description ? `; ${row.description}` : ''}${row.curve && row.curve !== '-' ? ` (curve: ${row.curve})` : ''}.`,
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: id,
    };
    const named = row.description ? namedValues(row.description) : null;
    const contiguous = named && named.every((n, k) => n.value === span.min + k) && named.length === span.max - span.min + 1;
    const banded = named && named.some((n) => n.band) && named.every((n, k) => k === 0 || n.value > named[k - 1].value);
    if (named && (contiguous || banded)) {
      const seen = new Set();
      const choices = named.map(({ value, label: l }) => { let cid = camel(l) || `v${value}`; if (/^\d/.test(cid)) cid = `v${cid}`; if (seen.has(cid)) cid = `${cid}${value}`; seen.add(cid); return { id: cid, label: l, value }; });
      parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(row.name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u7' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : 'Combobox' } });
      continue;
    }
    // What the range reads as: a sweep in numbers on a linear row, or a count from one.
    const sweep = /^([-+]?\d+(?:\.\d+)?)\s*(?:x\s*)?\.\.\s*([-+]?\d+(?:\.\d+)?)/.exec(row.description ?? '');
    const linear = /^linear$/i.test(row.curve ?? '');
    const oneUp = /Part number = value \+ 1|(?:multiplier|divider) - 1$/.test(row.description ?? '');
    const shown = oneUp ? { min: span.min + 1, max: span.max + 1 } : sweep && linear && span.max === 127 ? { min: Number(sweep[1]), max: Number(sweep[2]) } : null;
    if (oneUp) shortened.push(row.name);
    const wide = span.max - span.min > 16;
    parameters.push({
      ...base, type: 'integer', range: span, default: span.min,
      display: { mode: 'number', unit: '', shortLabel: camel(row.name), ...(shown ?? {}) }, normalization: { mode: 'linear' }, encoding: { type: 'u7' },
      sendPolicy: wide ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
      ui: { preferredComponent: wide ? 'Knob' : span.max - span.min === 1 ? 'ToggleButton' : 'Combobox' },
    });
  }

  const sentOf = (p, value) => {
    const r = recipes.get(p.messageRecipe);
    const v = p.type === 'choice' ? p.choices.find((c) => c.id === value).value : value;
    return r.kind === 'cc' ? ['B0', hex(r.controller), hex(v)].join(' ') : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, v]].map(([c, x]) => ['B0', hex(c), hex(x)].join(' ')).join('\n');
  };
  const picks = [parameters.find((p) => p.type === 'choice' && p.choices.length > 2), parameters.find((p) => p.display.min === -1 && p.group === 'Control changes'), parameters.find((p) => p.group === 'NRPN only' && p.type === 'integer'), parameters.find((p) => p.group === 'NRPN only' && p.type === 'choice')].filter(Boolean);
  const tests = picks.map((p) => { const value = p.type === 'choice' ? p.choices.at(-1).id : p.range.max; return { name: `${p.name} = ${value}`, parameter: p.id, value, expectedHex: sentOf(p, value) }; });

  const doc = data.source;
  const notes = [
    'Generated by tools/profiles/tastychips/make-profiles.mjs; edit the layout in tools/profiles/tastychips/synths/, not this file.',
    'Every parameter is a CC row of the manual\'s MIDI Command table, on the channel variable: a row numbered 0 - 127 its control change, one above 127 its NRPN (CC 99, CC 98, then the value on CC 6), the manual\'s "Precision MIDI" page saying the modulation matrix "also uses CC\'s that are only available as NRPN". Nothing here has been sent to a real instrument yet.',
    'An NRPN-only row\'s value is the 7-bit value its range prints, on CC 6 alone: the page says NRPNs take "the normal 7 bit MIDI values, but also use 14 bit values if necessary", and does not say how a printed range maps onto 14 bits. The controllers 0 - 127 with a range of 0 - 127 are also NRPNs with 14-bit values, the page says; this profile sends them as control changes.',
    'A destination list printed only as far as `5:CUTOFF, ..` (the LFO and CV destinations, 0 - 10) is not a choice: the range is sent as a number, the list in its description.',
    ...(shortened.length ? [`Shown one up, as the description says the value is the number less one: ${shortened.join(', ')}.`] : []),
    `Left out, and named: the messages that are not settings, ${left.message.join(', ')}; MIDI's own controllers, ${left.own.join(', ')}; the performance controllers, ${left.performance.join(', ')}; and the actions, ${left.action.join(', ')}.`,
    ...(layout.notes ?? []),
  ];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Tasty Chips',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `The MIDI Command table (PDF pages ${doc.pages[0]} - ${doc.pages[1]}), read by tools/profiles/tastychips/read-gr1-table.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}, linked from ${doc.linkedFrom}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: notes,
    variables: { channel: 1 },
    coverage: {
      singleParameterWrite: `complete-for-the-MIDI-Command-table: ${parameters.length} parameters`,
      realtimeEditing: 'complete-for-the-MIDI-Command-table',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented: the manual prints no dump',
      bankDump: 'notImplemented',
      inboundControllers: 'notImplemented: the GR-1 can send its controls as control changes or NRPNs (its MIDI settings)',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()],
    parameters,
    tests,
  };
}

export { stringifyProfile };
