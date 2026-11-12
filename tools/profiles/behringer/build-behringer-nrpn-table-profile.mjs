// build-behringer-nrpn-table-profile.mjs — a Behringer manual's NRPN mappings (the PolyEight's), with
// a second table's descriptions for the value lists, and a layout -> a CEditor device profile.
//
// What it takes as settled:
//   - a row is its NRPN, the 14-bit number its HEX column gives, the value 14 bits on data entry
//     (CC 6, then CC 38);
//   - a value list in the description (`Portamento mode (0=speed, 1=time)`) covering the range is a
//     choice; for a row whose description has none, the preset parameter table's list after the
//     same description (`VCO octave selection **Enum Values:** LOW = 0 …`) is;
//   - `0–65535` is 14 bits, 0 - 16383: data entry carries 14, and the preset table gives the same
//     parameters 0 - 16383;
//   - a range the table does not print is the data byte's 0 - 127, and the profile says so.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const slug = (label) => String(label).toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** `(0=speed, 1=time)` or `POLY=0, DOUBLE=1` or `` - `LOW` = 0<br> `` -> [{ value, label }] in order. */
export function readValueList(text) {
  const t = String(text ?? '');
  const first = [...t.matchAll(/(\d+)\s*=\s*([^,()<]+?)\s*(?=,|\)|$)/g)].map((m) => ({ value: Number(m[1]), label: m[2].trim() }));
  const enums = [...t.matchAll(/`?([A-Za-z][\w&]*)`?\s*=\s*(\d+)/g)].map((m) => ({ value: Number(m[2]), label: m[1].replace(/_/g, ' ') }));
  return first.length >= 2 ? first : enums;
}

/** The enum list printed after `description` in the preset table's descriptions, or null. */
export function enumAfter(flow, description) {
  const words = norm(description).split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const m = new RegExp(`${words.join('[^A-Za-z0-9]+')}[^A-Za-z0-9]*(?:\\*\\*)?Enum Values:(?:\\*\\*)?`, 'i').exec(flow);
  if (!m) return null;
  // The items, one after another: `` <br> - `LOW` = 0 ``, `POLY=0,`; the first thing that is not one
  // ends the list.
  const items = [];
  let rest = flow.slice(m.index + m[0].length);
  for (;;) {
    const item = /^\s*(?:<br>\s*)?-?\s*`?([A-Za-z][\w&]*)`?\s*=\s*(\d+)\s*,?/.exec(rest);
    if (!item) break;
    items.push({ value: Number(item[2]), label: item[1].replace(/_/g, ' ') });
    rest = rest.slice(item[0].length);
  }
  return items.length ? items : null;
}

export function buildBehringerNrpnTableProfile(data, layout) {
  const notes = [];
  const fromPreset = [];
  const noRange = [];
  const wide = [];
  const signed = [];
  const twice = [];
  const names = new Set();
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const recipes = new Map();
  const parameters = [];
  for (const r of data.rows) {
    const number = parseInt(r.hex, 16);
    if (number !== Number(r.nrpn)) throw new Error(`NRPN ${r.nrpn}: HEX ${r.hex}`);
    const description = r.description.replace(/\s+/g, ' ').trim();
    // The name: the description without its value list (`(0=speed, 1=time)`, `(0-100, …)`, `(0-3)`).
    let name = description.replace(/\s*\((?:[^()]*=[^()]*|\d+\s*-\s*\d+)\)\s*$/, '').replace(/\s+leve$/, ' level').trim();
    if (names.has(name)) { twice.push(`${name} (NRPN ${number})`); name = `${name} (NRPN ${number})`; }
    names.add(name);
    const range = /^(-?\d+)\s*[–-]\s*(-?\d+)$/.exec(String(r.range ?? '').trim());
    let lo = range ? Number(range[1]) : null;
    let hi = range ? Number(range[2]) : null;
    const describe = [`Printed: ${description}${r.range ? `, ${r.range}` : ''}.`];
    // The values: the description's own list, or the preset table's after the same description.
    const inline = readValueList(/\(([^()]*=[^()]*)\)\s*$/.exec(description)?.[1]);
    const preset = inline.length ? null : enumAfter(data.flow ?? '', description.replace(/\s*\(.*$/, ''));
    let list = inline.length ? inline : preset ?? [];
    if (lo === null && list.length) { lo = list[0].value; hi = list.at(-1).value; }
    const covers = list.length && lo !== null && list.length === hi - lo + 1 && list.every((v, k) => v.value === lo + k);
    if (preset?.length && covers) fromPreset.push(name);
    if (!covers) list = [];
    if (lo === null) { lo = 0; hi = 127; noRange.push(name); describe.push('The NRPN table prints no range: the data byte\'s 0 - 127.'); }
    if (hi > 16383 && lo >= 0) { wide.push(name); describe.push('Sent as 14 bits, 0 - 16383, as data entry carries and the preset table gives it.'); hi = 16383; }
    if (lo < 0) { signed.push(name); describe.push('Signed; the manual does not say how a negative value is carried in the 14 bits, so this is the 14 bits as sent.'); lo = 0; hi = 16383; }
    const msb = number >> 7;
    const lsb = number & 127;
    const recipe = { id: `nrpn${hex(msb)}${hex(lsb)}`, kind: 'nrpn', channel: '$channel', parameterMsb: msb, parameterLsb: lsb, valueResolution: 14, value: '$encodedValue' };
    recipes.set(recipe.id, recipe);
    const group = layout.groupOf(name);
    // Where the manual prints it: the page of its row in the NRPN table.
    const base = { id: unique(`${camel(group)}.${camel(name)}`), name, group, ...(r.page ? { source: { page: r.page } } : {}), description: describe.join(' '), access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: recipe.id };
    if (list.length) {
      const seen = new Set();
      const choices = list.map(({ value, label }) => { const s = slug(label); const id = seen.has(s) ? `${s}_${value}` : s; seen.add(id); return { id, label, value }; });
      parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u14' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : choices.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
    } else {
      parameters.push({ ...base, type: 'integer', range: { min: lo, max: hi }, default: lo, display: { mode: 'number', unit: '', shortLabel: camel(name) }, normalization: { mode: 'linear' }, encoding: { type: 'u14' }, sendPolicy: hi - lo > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: /level|attack|decay|sustain|release|amount|intensity|cutoff|resonance/i.test(name) ? 'Slider' : 'Knob' } });
    }
  }
  if (fromPreset.length) notes.push(`Value lists taken from the preset parameter table, the NRPN table printing none: ${fromPreset.join(', ')}.`);
  if (wide.length) notes.push(`Printed 0–65535 and sent as 14 bits (0 - 16383), which is what data entry carries and what the preset table gives for them: ${wide.join(', ')}.`);
  if (signed.length) notes.push(`Printed -32767–32767 (the preset table: -8192–8191), and laid out as the 14 bits sent, the manual not saying how a negative value is carried: ${signed.join(', ')}.`);
  if (noRange.length) notes.push(`No range printed, and no value list found: the data byte's 0 - 127: ${noRange.join(', ')}.`);
  if (twice.length) notes.push(`Descriptions the table gives two NRPNs, both laid out: ${twice.join(', ')}.`);

  const variables = { channel: 1 };
  const status = 0xb0 + variables.channel - 1;
  const tests = [];
  for (const pick of layout.tests ?? []) {
    const p = parameters.find((q) => q.name === pick.name);
    if (!p) throw new Error(`test parameter not found: ${pick.name}`);
    const value = pick.label !== undefined ? p.choices.find((c) => c.label === pick.label).id : pick.value;
    const wire = typeof value === 'string' ? p.choices.find((c) => c.id === value).value : value;
    const r = recipes.get(p.messageRecipe);
    tests.push({ name: `${p.group} ${p.name} = ${pick.label ?? value}`, parameter: p.id, value, expectedHex: [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, wire >> 7], [0x26, wire & 127]].map(([c, v]) => [status, c, v].map(hex).join(' ')).join('\n') });
  }
  const doc = data.sources[0];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Behringer',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `NRPN mappings and SysEx preset parameters (PDF pages ${layout.pages[0]} - ${layout.pages.at(-1)}) read by tools/profiles/behringer/read-behringer-tables.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/behringer/make-profiles.mjs; edit the layout in tools/profiles/behringer/synths/, not this file.',
      'Every parameter is a row of the manual\'s NRPN mappings, sent as that NRPN with a 14-bit value (CC 6, then CC 38). Nothing here has been sent to a real instrument yet.',
      'Nothing is read back: the manual prints the preset dump\'s structure but no request for it, and gives the PolyEight\'s device ID bytes only as `Device-specific`.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: `complete-for-the-manual's-NRPN-mappings: ${parameters.length} parameters`,
      realtimeEditing: 'complete-for-the-manual\'s-NRPN-mappings',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these NRPNs when its MIDI settings send NRPN',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.parameterMsb - b.parameterMsb || a.parameterLsb - b.parameterLsb),
    parameters,
    tests,
  };
}

export { stringifyProfile };
