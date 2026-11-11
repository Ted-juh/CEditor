// build-tastychips-profile.mjs — a GR manual's transcription (tables/<name>.json) and its layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the manual:
//   - a row numbered 0 - 127 is that control change; one above 127 ("NRPN-only (> 127)") that NRPN
//     (MSB the number / 128, LSB the rest), its value on data entry MSB (CC 6) as the 7-bit value the
//     table prints ("you can use the normal 7 bit MIDI values, but also use 14 bit values"), or as a
//     14-bit value on CC 6 and CC 38 where its range goes past 127 (`0–16383`, `0–1000 ms`);
//   - the range: values named one each (`0: disable, 1: enable, 2: enable & focus`), bands (`<64:
//     OFF, ≥64: ON`, a band's first value sent) and the manual's own tables (`See Mod sources table`,
//     `See Mod destinations table`, the rate divisions for `rate division index`) a choice; a range
//     of numbers (`0–63`) that range; anything else (`0 Hz – 20 kHz`, `−1.0 … 0.0 … +1.0`, nothing
//     printed) 0 - 127, the printed range and curve in its description;
//   - its name the Description column (`Enable & focus layer`), the Name column (`ENA PART NR`) in its
//     description; its group the section the table sets it in;
//   - left out, and named: MIDI's own messages (bank change, data entry, NRPN and RPN selection, the
//     channel mode messages), the performance controllers (mod wheel, sustain, MPE timbre), actions
//     (`Toggle (value ignored)`), and rows the table marks as the other model's.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const MIDI_OWN = /^(?:BANK CHANGE|NRPN VAL (?:MSB|LSB)|NRPN PAR (?:MSB|LSB)|RPN PAR (?:MSB|LSB)|ALL SOUND OFF|RESET CCS|LOCAL KEY OFF|ALL NOTES OFF|OMNI (?:OFF|ON)|MONO MODE|POLY MODE)$/;
const PERFORMANCE = /^(?:MOD WHEEL(?: LSB)?|SUSTAIN|MPE TIMBRE (?:MSB|LSB))$/;
const ACTION = /^Toggle \(value ignored\)|^Trigger\b/;

/** `0: disable, 1: enable`, `0: OFF, ≥1: ON`, `<64: OFF, ≥64: ON` -> [{ value, label, band }], or []. */
export function namedValues(range) {
  const body = String(range).replace(/^[^:]*?only:\s*/, '');
  return body.split(/,\s*(?=[<≥]?-?\d+\s*:)/).map((part) => {
    const m = /^([<≥])?(-?\d+)\s*:\s*(.+?)\s*$/.exec(part.trim());
    return m ? { value: m[1] === '<' ? 0 : Number(m[2]), label: m[3], band: Boolean(m[1]) } : null;
  });
}

/** A row's values -> { min, max, choices? , kind } where kind says how it was read. */
export function valuesOf(row, lists) {
  const range = row.range ?? '';
  if (/^See Mod sources table/.test(range)) {
    const minus = /minus LFO1–4/.test(range);
    return { kind: 'mod sources', choices: lists.modSources.filter((s) => !minus || !/^LFO[1-4]$/.test(s.cells[0])).map((s) => ({ value: s.index, label: s.cells[0] })) };
  }
  if (/^See Mod destinations table/.test(range)) return { kind: 'mod destinations', choices: lists.modDestinations.map((d) => ({ value: d.index, label: d.cells[0] })) };
  const division = /^0–(\d+) \(rate division index/.exec(range);
  if (division) return { kind: 'rate divisions', choices: lists.rateDivisions.filter((d) => d.index <= Number(division[1])).map((d) => ({ value: d.index, label: `${d.cells[0]} ${d.cells[1]}` })) };
  const named = namedValues(range);
  if (named.length >= 2 && named.every(Boolean)) {
    const values = named.map((n) => n.value);
    const contiguous = values.every((v, k) => v === values[0] + k);
    const banded = named.some((n) => n.band) && values.every((v, k) => k === 0 || v > values[k - 1]);
    if (contiguous || banded) return { kind: banded ? 'bands' : 'named values', choices: named.map(({ value, label }) => ({ value, label })) };
  }
  const span = /^(-?\d+)\s*[–-]\s*(-?\d+)(?:\s*$|\s*\(|\s+(?:ms|steps?)\b)/.exec(range);
  if (span) return { kind: 'range', min: Number(span[1]), max: Number(span[2]) };
  if (/^0, ≥1$/.test(range)) return { kind: 'range', min: 0, max: 1 };
  return { kind: 'printed', min: 0, max: 127 };
}

export function buildTastyChipsProfile(data, layout) {
  const notes = [];
  const left = { midi: [], performance: [], action: [], other: [] };
  const recipes = [];
  const parameters = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const counts = {};
  const cut = [];
  for (const r of data.rows) {
    const label = `${r.cc} ${r.name}`;
    if (MIDI_OWN.test(r.name) || /^Unused$/.test(r.range)) { left.midi.push(label); continue; }
    if (PERFORMANCE.test(r.name)) { left.performance.push(label); continue; }
    if (ACTION.test(r.range)) { left.action.push(label); continue; }
    if (layout.otherModel?.test(r.description)) { left.other.push(label); continue; }
    const values = valuesOf(r, data);
    counts[values.kind] = (counts[values.kind] ?? 0) + 1;
    const nrpn = r.cc > 127;
    // A control change carries 0 - 127: a list longer than that is laid out as far as it reaches.
    if (!nrpn && values.choices?.some((c) => c.value > 127)) {
      const past = values.choices.filter((c) => c.value > 127);
      cut.push(`CC ${r.cc} ${r.name} (${values.kind} ${past[0].value} - ${past.at(-1).value}, ${past[0].label} to ${past.at(-1).label})`);
      values.choices = values.choices.filter((c) => c.value <= 127);
    }
    const max = values.choices ? Math.max(...values.choices.map((c) => c.value)) : values.max;
    const wide = nrpn && max > 127;
    if (!nrpn && max > 127) throw new Error(`CC ${r.cc} ${r.name}: values past 127 (${r.range})`);
    const recipe = nrpn
      ? { id: `nrpn${hex(r.cc >> 7)}${hex(r.cc & 127)}`, kind: 'nrpn', channel: '$channel', parameterMsb: r.cc >> 7, parameterLsb: r.cc & 127, valueResolution: wide ? 14 : 7, value: '$encodedValue' }
      : { id: `cc${hex(r.cc)}`, kind: 'cc', channel: '$channel', controller: r.cc };
    recipes.push(recipe);
    const name = r.description || r.name;
    const group = r.section && r.section !== 'NRPN-only (> 127)' ? r.section : nrpn ? 'NRPN only' : 'Control changes';
    const base = {
      id: unique(`${camel(group)}.${camel(name)}`),
      name,
      group,
      description: `${nrpn ? `NRPN ${r.cc}` : `CC ${r.cc}`} (page ${r.page}): ${r.name}; range ${r.range || 'not printed'}${r.curve ? `; curve ${r.curve}` : ''}${values.kind === 'printed' ? '; sent as 0 - 127' : ''}.`,
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipe.id,
    };
    if (values.choices) {
      const seen = new Set();
      const choices = values.choices.map(({ value, label }) => { let id = camel(label) || `v${value}`; if (seen.has(id)) id = `${id}${value}`; seen.add(id); return { id, label, value }; });
      parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: wide ? 'u14' : 'u7' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : choices.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
      continue;
    }
    parameters.push({
      ...base,
      type: 'integer',
      range: { min: values.min, max: values.max },
      default: values.min,
      display: { mode: 'number', unit: '', shortLabel: camel(name) },
      normalization: { mode: 'linear' },
      encoding: { type: wide ? 'u14' : 'u7' },
      sendPolicy: values.max - values.min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
      ui: { preferredComponent: values.max - values.min === 1 ? 'ToggleButton' : values.max - values.min > 16 ? 'Knob' : 'Combobox' },
    });
  }

  const status = 0xb0;
  const lines = (r, wire) => (r.kind === 'cc' ? [[r.controller, wire]] : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], ...(r.valueResolution === 14 ? [[0x06, wire >> 7], [0x26, wire & 127]] : [[0x06, wire]])]).map(([c, v]) => [status, c, v].map(hex).join(' ')).join('\n');
  const send = (p, value, wire) => ({ name: `${p.name} = ${value}`, parameter: p.id, value, expectedHex: lines(recipes.find((x) => x.id === p.messageRecipe), wire) });
  const tests = [];
  const pick = (f) => parameters.find(f);
  for (const p of [pick((x) => x.type === 'choice' && /named values/.test(x.description) === false && x.choices.length === 3), pick((x) => x.type === 'choice' && x.choices.length > 20), pick((x) => x.messageRecipe.startsWith('nrpn') && x.encoding.type === 'u14'), pick((x) => x.messageRecipe.startsWith('nrpn') && x.encoding.type === 'u7' && x.type === 'integer')].filter(Boolean)) {
    if (p.type === 'choice') tests.push(send(p, p.choices.at(-1).id, p.choices.at(-1).value));
    else tests.push(send(p, p.range.max, p.range.max));
  }

  const doc = data.source;
  notes.push(
    'Generated by tools/profiles/tastychips/make-profiles.mjs; edit the layout in tools/profiles/tastychips/synths/, not this file.',
    `Every parameter is a row of the manual's MIDI Command Table ("${doc.generated}"), on the channel variable: a row numbered 0 - 127 its control change, one above 127 its NRPN (CC 99, CC 98, then the value on CC 6, and on CC 38 too where its range goes past 127). Nothing here has been sent to a real instrument yet.`,
    'An NRPN-only row\'s value is the 7-bit value its range prints, on CC 6 alone: the manual says NRPNs take "the normal 7 bit MIDI values, but also use 14 bit values if necessary", and does not say how a row\'s printed range maps onto 14 bits. A range past 127 (the scan positions\' 0–16383, the sequencer slew\'s 0–1000 ms) is sent as 14 bits, as printed. The controllers 0 - 127 are also NRPNs with 14-bit values, the manual says; this profile sends them as control changes.',
    `How each row's values were read: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}. A row read as "printed" has a range that is not numbers (a unit, a sweep, nothing): it is sent 0 - 127, and its description carries what is printed.`,
    'The manual\'s NRPN example ("parameter 2 (sample position) … 16181") is the GR-1\'s: in this table, 2 is Pitchbend range. It is not used as a vector.',
  );
  if (cut.length) notes.push(`A control change reaches 0 - 127, so these lists stop there; the values past it are not reachable by the controller: ${cut.join('; ')}.`);
  if (left.midi.length) notes.push(`Left out, MIDI's own messages: ${left.midi.join(', ')}.`);
  if (left.performance.length) notes.push(`Left out, the performance controllers: ${left.performance.join(', ')}.`);
  if (left.action.length) notes.push(`Left out, actions, which take any value: ${left.action.join(', ')}.`);
  if (left.other.length) notes.push(`Left out, rows the table marks for the other model: ${left.other.join(', ')}.`);
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
    sources: [{ type: 'manual', title: doc.title, notes: `The MIDI Command Table and the rate divisions, mod sources and modulation destinations tables after it (PDF pages ${doc.pages[0]} - ${doc.pages[1]}), read by tools/profiles/tastychips/read-gr-table.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}, linked from ${doc.linkedFrom}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: notes,
    variables: { channel: 1 },
    coverage: {
      singleParameterWrite: `complete-for-the-MIDI-Command-Table: ${parameters.length} of its ${data.rows.length} rows`,
      realtimeEditing: 'complete-for-the-MIDI-Command-Table',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented: the manual prints no SysEx',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument\'s controllers and NRPNs, as the table gives them',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: recipes,
    parameters,
    tests,
  };
}

export { stringifyProfile };
