// build-udo-profile.mjs — a UDO transcription (tables/<name>.json) and a layout (synths/<name>.mjs)
// -> a CEditor device profile.
//
// What it takes as settled, from the manual's MIDI specifications:
//   - a parameter the NRPN table gives is sent as that NRPN, its MSB and LSB as printed (checked
//     against the NRPN's number), with a 14-bit value, 0 - 16383; the manual: "When MIDI CC Receive
//     is enabled, the Super 6 will always respond to both parameter changes sent in 7 and 14 bit
//     resolution";
//   - every other row of the CC table is that controller: `0-127` a range, `0 = Triangle  21 =
//     Square …` a choice of the values printed;
//   - an NRPN's value list printing its two ends (`0 = MIDI Channel 1 … 15 = MIDI Channel 16`) is a
//     range, shown as its labels number it;
//   - on the Super Gemini, each layer has its channel (the base channel and the one above it), and
//     a parameter for each;
//   - the wheel and lever, the ribbon, the pedals, bank select, data entry, the NRPN and RPN
//     controllers and the channel mode messages are left out.

import { readRange } from '../behringer/build-behringer-profile.mjs';
import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const PERFORMANCE = /^(?:Bank Select|Modulation Lever|Mod(?:ulation)? Wheel|Foot Controller|Expression|Sustain Pedal|Sostenuto.*|Soft Pedal|Data Entry.*|LSB for Control.*|Data (?:Increment|Decrement)|(?:Non-)?Registered Parameter Number.*|All Sound Off|Reset All Controllers|Local Control.*|All Notes Off|Omni Mode O(?:n|ff)|Mono Mode.*|Poly Mode.*|Breath Controller|Ribbon (?:Coarse|Fine))$/i;

export const groupOfName = (name) => [
  [/^LFO 1|^DDS LFO 1/, 'LFO 1'], [/^LFO 2|^DDS LFO 2/, 'LFO 2'], [/^(?:DDS|Oscillator|PW|PWM|Cross Mod|Super Mode|Wave)/, 'Oscillators'], [/^VCF|^HPF/, 'Filter'], [/^VCA/, 'Amplifier'],
  [/^Envelope 1/, 'Envelope 1'], [/^Envelope 2/, 'Envelope 2'], [/^(?:Delay|Chorus)/, 'Effects'], [/^Arp/, 'Arpeggiator'], [/^Seq/, 'Sequencer'], [/^MIDI/, 'MIDI'],
].find(([re]) => re.test(name))?.[1] ?? 'Global';

/** A value cell -> { lo, hi, shown? } or { choices } or {}. */
export function readValues(text) {
  const t = String(text ?? '').replace(/[’']/g, '\'').replace(/\s+/g, ' ').trim();
  if (!t || t === '-') return {};
  const read = readRange(t);
  if (read.lo !== undefined) return read;
  if (read.choices) {
    // `0 = MIDI Channel 1  15 = MIDI Channel 16`: two ends, numbered as their labels say.
    const [a, b] = read.choices;
    const ends = read.choices.length === 2 && /(\d+)$/.exec(a.label) && /(\d+)$/.exec(b.label);
    if (ends && a.label.replace(/\d+$/, '') === b.label.replace(/\d+$/, '') && Number(ends[1]) - Number(/(\d+)$/.exec(a.label)[1]) === b.value - a.value && b.value - a.value > 1) {
      return { lo: a.value, hi: b.value, shown: [Number(/(\d+)$/.exec(a.label)[1]), Number(/(\d+)$/.exec(b.label)[1])] };
    }
    return { choices: read.choices };
  }
  return { text: t };
}

export function buildUdoProfile(data, layout) {
  const notes = [];
  const left = [];
  const both = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const recipes = new Map();
  const parameters = [];
  const variables = { channel: 1, ...(layout.variables ?? {}) };
  const layers = layout.layers ?? null;

  // The rows, NRPNs first: [{ name, kind, … , values }].
  const rows = [];
  const byName = new Map();
  // (A row the manual names for each model, `Lower Layer Detune (Super Gemini) Layer Detune (Super
  // 8)`, is named by the layout for its own.)
  const named = (r) => ({ ...r, name: layout.rename?.[r.name] ?? r.name });
  // (A row for the other model the manual covers, `Performance Detune (Super 8: Receive only)` on
  // the Super Gemini.)
  const other = [];
  const mine = (r) => { if (layout.leaveOut?.includes(r.name)) { other.push(r.name); return false; } return true; };
  for (const r of data.nrpn.map(named).filter(mine)) {
    if (!r.name || r.name === '-') continue;
    if (PERFORMANCE.test(r.name)) { left.push(`NRPN ${r.nrpn} ${r.name}`); continue; }
    const number = Number(r.nrpn);
    const msb = parseInt(r.msb, 16);
    const lsb = parseInt(r.lsb, 16);
    if (msb * 128 + lsb !== number) throw new Error(`NRPN ${number}: printed ${r.msb} ${r.lsb}`);
    const row = { name: r.name, kind: 'nrpn', number, msb, lsb, values: readValues(r.range), printed: r.range, global: number >= 2048, page: r.page };
    rows.push(row);
    byName.set(norm(r.name), row);
  }
  for (const r of data.cc.map(named).filter(mine)) {
    if (!r.name || r.name === '-') continue;
    const cc = Number(r.cc);
    if (PERFORMANCE.test(r.name)) { left.push(`CC ${cc} ${r.name}`); continue; }
    const nrpn = byName.get(norm(r.name));
    if (nrpn) { both.push(`${r.name} (CC ${cc}, NRPN ${nrpn.number})`); nrpn.cc = cc; continue; }
    rows.push({ name: r.name, kind: 'cc', cc, values: readValues(r.range), printed: r.range, page: r.page });
  }

  for (const row of rows) {
    for (const layer of layers && !row.global ? Object.keys(layers) : [null]) {
      const variable = layer ? layers[layer] : 'channel';
      const suffix = variable === 'channel' ? '' : variable.replace(/Channel$/, '').replace(/^./, (c) => c.toUpperCase());
      const recipe = row.kind === 'nrpn'
        ? { id: `nrpn${hex(row.msb)}${hex(row.lsb)}${suffix}`, kind: 'nrpn', channel: `$${variable}`, parameterMsb: row.msb, parameterLsb: row.lsb, valueResolution: 14, value: '$encodedValue' }
        : { id: `cc${row.cc}${suffix}`, kind: 'cc', channel: `$${variable}`, controller: row.cc, value: '$encodedValue' };
      recipes.set(recipe.id, recipe);
      const group = `${layer ? `${layer} ` : ''}${row.global ? 'Global Settings' : (layout.groupOf?.(row.name) ?? groupOfName(row.name))}`;
      const describe = [];
      if (row.kind === 'nrpn') describe.push(`NRPN ${row.number} (CC 99 = ${hex(row.msb)}H, CC 98 = ${hex(row.lsb)}H), 14 bits${row.cc !== undefined ? `; also CC ${row.cc} at 7 bits` : ''}.`);
      if (row.values.text || row.values.choices || row.values.shown) describe.push(`Printed: ${row.printed}.`);
      if (layer) describe.push(`On the ${layer.toLowerCase()} layer's channel.`);
      const base = { id: unique(`${camel(group)}.${camel(row.name)}`), name: row.name, group, source: { page: row.page }, description: describe.join(' '), access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: recipe.id };
      const encoding = { type: row.kind === 'nrpn' ? 'u14' : 'u7' };
      if (row.values.choices) {
        const seen = new Set();
        const choices = row.values.choices.map(({ value, label }) => { let id = camel(label) || `v${value}`; if (seen.has(id)) id = `${id}${value}`; seen.add(id); return { id, label, value }; });
        parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(row.name) }, normalization: { mode: 'choiceIndex' }, encoding, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : choices.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
        continue;
      }
      const lo = row.values.lo ?? 0;
      const hi = row.values.hi ?? (row.kind === 'nrpn' ? 16383 : 127);
      parameters.push({
        ...base,
        type: 'integer',
        range: { min: lo, max: hi },
        default: lo,
        display: { mode: 'number', unit: '', shortLabel: camel(row.name), ...(row.values.shown ? { min: row.values.shown[0], max: row.values.shown[1] } : {}) },
        normalization: { mode: 'linear' },
        encoding,
        sendPolicy: hi - lo > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
        ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Amount|Cutoff|Resonance|Mix|Feedback/i.test(row.name) ? 'Slider' : 'Knob' },
      });
    }
  }
  if (other.length) notes.push(`Left out, the other model's: ${[...new Set(other)].join(', ')}.`);
  if (both.length) notes.push(`Parameters both tables give, laid out as the NRPN (14 bits): ${both.join(', ')}.`);
  if (left.length) notes.push(`Left out, the lever and wheel, the ribbon, the pedals, bank select, data entry, the NRPN and RPN controllers and the channel mode messages: ${left.join(', ')}.`);

  const tests = [];
  const picks = [...new Set([parameters.find((p) => recipes.get(p.messageRecipe).kind === 'nrpn'), parameters.find((p) => p.type === 'choice'), parameters.at(-1)].filter(Boolean))];
  for (const p of picks) {
    const r = recipes.get(p.messageRecipe);
    const status = 0xb0 + variables[r.channel.slice(1)] - 1;
    const value = p.type === 'choice' ? p.choices.at(-1).id : p.range.max;
    const wire = p.type === 'choice' ? p.choices.at(-1).value : p.range.max;
    const expectedHex = r.kind === 'cc' ? [status, r.controller, wire].map(hex).join(' ') : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, wire >> 7], [0x26, wire & 127]].map(([c, v]) => [status, c, v].map(hex).join(' ')).join('\n');
    tests.push({ name: `${p.group} ${p.name} = ${value}`, parameter: p.id, value, expectedHex });
  }
  const doc = data.sources[0];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'UDO',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `MIDI specifications, continuous controllers and NRPNs (PDF pages ${layout.pages[0]} - ${layout.pages.at(-1)}), read by tools/profiles/udo/import-udo.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/udo/make-profiles.mjs; edit the layout in tools/profiles/udo/synths/, not this file.',
      'Every parameter is a row of the manual\'s NRPN table (sent as that NRPN, 14 bits) or, where it has none, of its continuous controller table (sent as that controller, with the values it prints). Nothing here has been sent to a real instrument yet.',
      'The instrument\'s TX/RX setting must have MIDI CC Receive on; the manual: with it on, it "will always respond to both parameter changes sent in 7 and 14 bit resolution".',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-manual\'s-MIDI-specifications',
      realtimeEditing: 'complete-for-the-manual\'s-MIDI-specifications',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these same messages when its panel is used, where its TX/RX setting allows',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'cc' ? -1 : 1) || a.channel.localeCompare(b.channel) || (a.controller ?? 0) - (b.controller ?? 0) || (a.parameterMsb ?? 0) - (b.parameterMsb ?? 0) || (a.parameterLsb ?? 0) - (b.parameterLsb ?? 0)),
    parameters,
    tests,
  };
}

export { stringifyProfile };
