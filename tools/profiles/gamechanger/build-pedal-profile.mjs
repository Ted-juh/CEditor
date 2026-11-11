// build-pedal-profile.mjs — a Gamechanger Audio pedal's CC table (tables/<name>.json, from
// read-pedal-cc.mjs) and its layout (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the table:
//   - the band form (AUTO pedals, Motor Pedal): a row is CC n, its LSB n + 32, as the header says
//     (`CC[n] = MSB, CC[n+32] = LSB`). A row whose bands are sweeps (`[0...127] = [0...1]`, `[min MOD
//     ...max MOD]`) is a 14-bit value over both, its range what the 14-bit column prints, shown as the
//     sweep's numbers where they are numbers. A row whose bands name one value each (`[0...42] =
//     FAST, …`) is a choice, a band's first 7-bit value sent on CC n alone, as the 7-bit column
//     allows; the two columns must name the same values;
//   - the address form (Bigsby): a row is its controller; an `X MSB` row and an `X LSB` row 32 above it
//     are one 14-bit value; `0-63 – OFF, 64-127 - ON` is a choice; `0-127` the byte.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const SEPARATOR = /\[(\d+)\.\.\.\s*(\d+)\]\s*=\s*/g;

/** `[0...42] = FAST, [43...84] = SLOW` -> [{ from: 0, to: 42, label: 'FAST' }, …]. */
export function bandsOf(cell) {
  const marks = [...String(cell).matchAll(SEPARATOR)];
  return marks.map((m, k) => ({
    from: Number(m[1]), to: Number(m[2]),
    label: cell.slice(m.index + m[0].length, marks[k + 1]?.index ?? cell.length).trim().replace(/,$/, '').trim(),
  }));
}

const isSweep = (label) => /\.\.|…/.test(label);
const numbersOf = (label) => /^\[(-?\d+)\.\.\.(-?\d+)\]$/.exec(label)?.slice(1).map(Number) ?? null;
const unbracket = (label) => label.replace(/^\[(.*)\]$/, '$1');

/** `0-63 – normal, 64-127 - invert` -> [{ from: 0, label: 'normal' }, …], or null. */
export function rangeBandsOf(range) {
  const bands = [...String(range).matchAll(/(\d+)\s*-\s*(\d+)\s*[–-]\s*([A-Za-z][\w ]*?)(?=,|$)/g)].map((m) => ({ from: Number(m[1]), to: Number(m[2]), label: m[3].trim() }));
  return bands.length >= 2 ? bands : null;
}

export function buildPedalProfile(data, layout) {
  const recipes = new Map();
  const parameters = [];
  const notes = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const access = { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' };
  const continuous = { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true };
  const recipe = (cc, lsb) => {
    const id = lsb == null ? `cc${cc}` : `cc${cc}pair`;
    recipes.set(id, lsb == null ? { id, kind: 'cc', channel: '$channel', controller: cc } : { id, kind: 'cc', channel: '$channel', controller: cc, lsbController: lsb, value: '$encodedValue' });
    return id;
  };
  const choice = (base, bands) => {
    const seen = new Set();
    const choices = bands.map((b) => { let id = camel(unbracket(b.label).replace(/^-/, 'minus ').replace(/^\+/, 'plus ')) || `v${b.from}`; if (/^\d/.test(id)) id = `v${id}`; if (seen.has(id)) id = `${id}${b.from}`; seen.add(id); return { id, label: unbracket(b.label), value: b.from }; });
    parameters.push({ ...base, group: 'Switches', type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(base.name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u7' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : 'Combobox' } });
  };
  const fourteen = (base, range, shown, def) => parameters.push({ ...base, group: 'Controls', type: 'integer', range, default: def ?? range.min, display: { mode: 'number', unit: '', shortLabel: camel(base.name), ...(shown ?? {}) }, normalization: { mode: 'linear' }, encoding: { type: 'u14-msb-lsb' }, sendPolicy: continuous, ui: { preferredComponent: 'Knob' } });

  for (const row of data.bands ?? []) {
    const msb = bandsOf(row.msb);
    const pair = bandsOf(row.pair);
    // A name with a note in brackets (`MIDI NOTE ONLY MODE (disable instrument input pitchtracker e.g. for
    // vocoding)`) is the name before it; the note stays in the description.
    const name = /^(.*?)\s*\(([^)]*)\)$/.exec(row.name)?.[2].split(' ').length > 3 ? row.name.replace(/\s*\([^)]*\)$/, '') : row.name;
    const base = { id: unique(`pedal.${camel(name)}`), name, description: `CC ${row.cc} (LSB CC ${row.cc + 32}), page ${row.page}: ${row.name}. 7 bits: ${row.msb}. 14 bits: ${row.pair}.`, access };
    // The columns print the same sweep with its dots spaced differently (`[min MOD ..max MOD]`).
    const same = (a, b) => a.replace(/\s*\.{2,}\s*/g, '...') === b.replace(/\s*\.{2,}\s*/g, '...');
    if (msb.length !== pair.length || msb.some((b, k) => !same(b.label, pair[k].label))) throw new Error(`${row.name}: the 7-bit and 14-bit columns name different values`);
    if (msb.some((b) => isSweep(b.label))) {
      const numbers = msb.map((b) => numbersOf(b.label));
      const shown = numbers.every(Boolean) ? { min: numbers[0][0], max: numbers.at(-1)[1] } : null;
      // A bipolar sweep (`[-1...0], [0...1]`) rests at its middle: the 14-bit band that starts at 0.
      const zero = shown && shown.min < 0 && shown.max > 0 ? pair[numbers.findIndex((n) => n[0] === 0)]?.from : undefined;
      fourteen({ ...base, messageRecipe: recipe(row.cc, row.cc + 32) }, { min: pair[0].from, max: pair.at(-1).to }, shown, zero);
    } else {
      choice({ ...base, messageRecipe: recipe(row.cc) }, msb);
    }
  }

  const rows = data.addresses ?? [];
  const paired = new Set();
  for (const row of rows) {
    if (paired.has(row)) continue;
    const msbName = /^(.*) MSB$/.exec(row.name)?.[1];
    const lsb = msbName && rows.find((r) => r.name === `${msbName} LSB` && r.cc === row.cc + 32);
    // A pair whose name another row also has (`EXP out override value`, CC 105) is named for its bits.
    const name = lsb ? (rows.some((r) => r.name === msbName) ? `${msbName} (14 bits)` : msbName) : row.name;
    const base = { id: unique(`pedal.${camel(name)}`), name, description: `${lsb ? `CC ${row.cc} (MSB) and CC ${lsb.cc} (LSB)` : `CC ${row.cc}`}, page ${row.page}: ${lsb ? `${row.name} and ${lsb.name}, ${row.range} each` : `${row.name}, ${row.range}`}.`, access };
    if (lsb) {
      paired.add(lsb);
      fourteen({ ...base, messageRecipe: recipe(row.cc, lsb.cc) }, { min: 0, max: 16383 });
      continue;
    }
    if (/ LSB$/.test(row.name)) throw new Error(`${row.name} has no MSB row 32 below it`);
    const bands = rangeBandsOf(row.range);
    if (bands) { choice({ ...base, messageRecipe: recipe(row.cc) }, bands); continue; }
    const m = /^(\d+)\s*-\s*(\d+)(?:\s*\((-?\d+)\s*(\w+)\s*-\s*(-?\d+)\s*\w+\))?$/.exec(row.range);
    if (!m) throw new Error(`${row.name}: range not read: ${row.range}`);
    parameters.push({ ...base, messageRecipe: recipe(row.cc), group: 'Controls', type: 'integer', range: { min: Number(m[1]), max: Number(m[2]) }, default: Number(m[1]), display: { mode: 'number', unit: m[4] ?? '', shortLabel: camel(name), ...(m[3] != null ? { min: Number(m[3]), max: Number(m[5]) } : {}) }, normalization: { mode: 'linear' }, encoding: { type: 'u7' }, sendPolicy: continuous, ui: { preferredComponent: 'Knob' } });
  }

  const sentOf = (p, value) => {
    const r = recipes.get(p.messageRecipe);
    if (r.lsbController == null) return [0xb0, r.controller, p.type === 'choice' ? p.choices.find((c) => c.id === value).value : value].map(hex).join(' ');
    return [[0xb0, r.controller, value >> 7], [0xb0, r.lsbController, value & 127]].map((m) => m.map(hex).join(' ')).join('\n');
  };
  const picks = [parameters.find((p) => recipes.get(p.messageRecipe).lsbController != null), parameters.find((p) => p.type === 'choice' && p.choices.length > 2) ?? parameters.find((p) => p.type === 'choice'), parameters.find((p) => p.type === 'integer' && recipes.get(p.messageRecipe).lsbController == null)].filter(Boolean);
  const tests = picks.map((p) => { const value = p.type === 'choice' ? p.choices.at(-1).id : Math.floor((p.range.min + p.range.max) * 3 / 4); return { name: `${p.name} = ${value}`, parameter: p.id, value, expectedHex: sentOf(p, value) }; });

  const doc = data.source;
  notes.push(
    'Generated by tools/profiles/gamechanger/make-profiles.mjs; edit the layout in tools/profiles/gamechanger/synths/, not this file.',
    data.bands
      ? 'Every parameter is a row of the document\'s MIDI CC table, on the channel variable. A row whose values sweep is sent in 14 bits, CC n and then its LSB, CC n + 32, as the table\'s header gives them; a row whose values are named one each is a choice, sent as its band\'s first 7-bit value on CC n alone, which the table\'s 7-bit column allows. Nothing here has been sent to a real pedal yet.'
      : 'Every parameter is a row of the document\'s CC map, on the channel variable; an MSB row and the LSB row 32 above it are one 14-bit value, the MSB sent first. Nothing here has been sent to a real pedal yet.',
    ...(layout.notes ?? []),
  );
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Gamechanger Audio',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `The ${data.bands ? 'MIDI CC table' : 'CC map'} (PDF page ${doc.pages[0]}${doc.pages[1] !== doc.pages[0] ? ` - ${doc.pages[1]}` : ''}), read by tools/profiles/gamechanger/read-pedal-cc.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}, linked from ${doc.linkedFrom}. Not yet checked against the pedal itself.` }],
    testedWith: [],
    authoringNotes: notes,
    variables: { channel: 1 },
    coverage: {
      singleParameterWrite: `complete-for-the-CC-table: ${parameters.length} parameters`,
      realtimeEditing: 'complete-for-the-CC-table',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented: the document prints no dump',
      bankDump: 'notImplemented',
      inboundControllers: 'none: the document prints nothing the pedal sends',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()],
    parameters,
    tests,
  };
}

export { stringifyProfile };
