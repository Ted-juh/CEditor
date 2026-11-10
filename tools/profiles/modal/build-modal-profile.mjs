// build-modal-profile.mjs — a Modal transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the chart:
//   - a row is the controller it prints, sent as a control change on the channel variable; `-` is a
//     number the chart leaves unused;
//   - the newer charts print no values: each is 0 - 127;
//   - the older charts' value column is read as the Behringer builder reads a range: `0 - 55` a range,
//     bands (`0 - 42 = Mono; 43 - 85 = Duo; 86 - 127 = Poly`) a choice, a band's first value sent;
//     `OFF = 0 - ON = 127` a choice; `0 - 48 (-24 OFFSET)` a range shown less the offset; anything
//     else 0 - 127, the printed text in its description;
//   - the wheel, the pedals, the joystick, bank select and the channel mode messages are left out.

import { readRange } from '../behringer/build-behringer-profile.mjs';
import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

/** The wheel, the pedals, the joystick, bank select and the channel mode messages. */
// (`Sustain` alone is the pedal: the envelopes' are `FEG Sustain`, `VCA-EG - Sustain`. `NRPN …` rows are
// the 008's NRPN plumbing, its parameters not listed.)
export const PERFORMANCE = /^(?:Bank (?:Change|Select)|Mod(?:ulation)? Wheel|Sustain(?: Pedal)?|Expression Pedal|Joystick [XY][+-]|All Sound Off|Reset All Controllers|All Notes Off|Omni O(?:n|ff)|Mono Mode|Poly Mode|Local Control|NRPN\b.*|Data Entry(?: MSB| LSB)?)$/i;

export const groupOfName = (name) => {
  const part = /^(\S+(?:\s\d)?)\s+-\s+/.exec(name);
  if (part) return part[1];
  return [
    [/^(?:Osc|OscMod|WavMod|Spread|Morph)/, 'Oscillators'], [/^FEG/, 'Filter Env'], [/^AEG/, 'Amp Env'], [/^MEG/, 'Mod Env'],
    [/^LFO ?(\d)/, (m) => `LFO ${m[1]}`], [/^LFO/, 'LFO'], [/^Mod ?Slot/, 'Mod Matrix'], [/^All E(?:nvelope|G)/, 'Envelopes'],
    [/^(?:Velo|Note|Aftertouch|AftT|Ext|Expr|ModW) (?:Depth|Dest)/, 'Modulation'], [/^Anim/, 'Animator'], [/^Arp/, 'Arp'], [/^(?:Seq|Swing)/, 'Sequencer'],
    [/^(?:Delay|Distortion|FX|Global FX|Reverb|Chorus)/, 'Effects'], [/^(?:Cutoff|Resonance|Reso\b|Filter)/, 'Filter'],
  ].reduce((found, [re, g]) => found ?? (re.test(name) ? (typeof g === 'function' ? g(re.exec(name)) : g) : null), null) ?? 'Global';
};

/**
 * A value cell -> { lo, hi, shownFrom? } for a range (shown from `shownFrom` where it prints an offset),
 * { choices } for named values or bands, or { text } for anything else; {} for none.
 */
export function readValues(text) {
  const t = String(text ?? '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  if (!t || t === '-') return {};
  let m;
  // `OFF = 0 - ON = 127`, `0 = LINEAR - 1 = EXPO`: two named values.
  if ((m = /^([A-Za-z][\w ]*?)\s*=\s*(\d+)\s+-\s+([A-Za-z][\w ]*?)\s*=\s*(\d+)$/.exec(t))) return { choices: [{ value: Number(m[2]), label: m[1] }, { value: Number(m[4]), label: m[3] }] };
  if ((m = /^(\d+)\s*=\s*([A-Za-z][\w ]*?)\s+-\s+(\d+)\s*=\s*([A-Za-z][\w ]*?)$/.exec(t))) return { choices: [{ value: Number(m[1]), label: m[2] }, { value: Number(m[3]), label: m[4] }] };
  // `0 - 48 (-24 OFFSET)`: the range sent, shown less the offset.
  if ((m = /^(\d+)\s*-\s*(\d+)\s*\((-?\d+)\s*OFFSET\)$/i.exec(t))) return { lo: Number(m[1]), hi: Number(m[2]), shownFrom: Number(m[1]) + Number(m[3]) };
  // `0 - 55 (0 - 63 in PW)`: the wider of the two.
  if ((m = /^(\d+)\s*-\s*(\d+)\s*\((\d+)\s*-\s*(\d+)\b[^)]*\)$/.exec(t))) return { lo: Math.min(Number(m[1]), Number(m[3])), hi: Math.max(Number(m[2]), Number(m[4])), text: t };
  const read = readRange(t);
  if (read.lo !== undefined && read.hi <= 127) return read;
  // (Bands that describe a sweep, `0-32 Sine to Triangle`, `64-127 PWM duty 50% - 5%`, are a
  // continuous control in parts, not a choice.)
  if (read.choices && read.choices.every((c) => c.value <= 127) && !read.choices.some((c) => /\bto\b|\d%?\s*-\s*\d/i.test(c.label))) return read;
  return { text: t };
}

export function buildModalProfile(data, layout) {
  const notes = [];
  const left = [];
  const unused = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const recipes = new Map();
  const parameters = [];
  const count = new Map();
  for (const r of data.rows) count.set(r.name, (count.get(r.name) ?? 0) + 1);

  for (const r of data.rows) {
    const cc = Number(r.cc);
    const name = String(r.name ?? '').replace(/\s+/g, ' ').trim();
    if (!name || /^-+$/.test(name)) { unused.push(cc); continue; }
    if (PERFORMANCE.test(name) || layout.leaveOut?.includes(name)) { left.push(`CC ${cc} ${name}`); continue; }
    const label = count.get(r.name) > 1 ? `${name} (CC ${cc})` : name;
    const recipe = { id: `cc${cc}`, kind: 'cc', channel: '$channel', controller: cc, value: '$encodedValue' };
    recipes.set(recipe.id, recipe);
    const group = layout.groupOf?.(name) ?? groupOfName(name);
    const values = readValues(r.values);
    const describe = [];
    if (r.values && (values.text || values.choices || values.shownFrom !== undefined)) describe.push(`Printed: ${String(r.values).replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim() || 'as above'}.`);
    const index = [['joystick', 'Joystick'], ['sequence', 'Sequence'], ['animator', 'Animator']].filter(([k]) => r[k] && r[k] !== '-').map(([k, l]) => `${l} index ${r[k]}`);
    if (index.length) describe.push(`${index.join(', ')}.`);
    const base = {
      id: unique(`${camel(group)}.${camel(label)}`),
      name: label,
      group,
      ...(describe.length ? { description: describe.join(' ') } : {}),
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipe.id,
    };
    if (values.choices) {
      const seen = new Set();
      const choices = values.choices.map(({ value, label: l }) => { let id = camel(l) || `v${value}`; if (seen.has(id)) id = `${id}${value}`; seen.add(id); return { id, label: l, value }; });
      parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(label) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u7' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : choices.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
      continue;
    }
    const lo = values.lo ?? 0;
    const hi = values.hi ?? 127;
    parameters.push({
      ...base,
      type: 'integer',
      range: { min: lo, max: hi },
      default: lo,
      display: { mode: 'number', unit: '', shortLabel: camel(label), ...(values.shownFrom !== undefined ? { min: values.shownFrom, max: values.shownFrom + hi - lo } : {}) },
      normalization: { mode: 'linear' },
      encoding: { type: 'u7' },
      sendPolicy: hi - lo > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
      ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Amount|Depth|Volume|Cutoff|Resonance|Mix|Gain/i.test(label) ? 'Slider' : 'Knob' },
    });
  }
  // A controller the chart gives to two rows (the SKULPTsynth SE's mod slot sources and destinations,
  // both printed 101 - 108): both laid out, and said.
  const byCc = new Map();
  for (const p of parameters) { const c = recipes.get(p.messageRecipe).controller; byCc.set(c, [...(byCc.get(c) ?? []), p.name]); }
  const shared = [...byCc].filter(([, ns]) => ns.length > 1).map(([c, ns]) => `CC ${c}: ${ns.join(', ')}`);
  if (shared.length) notes.push(`Controllers the chart gives to two rows, both laid out: ${shared.join('; ')}. CEditor sends either, and follows neither when the instrument sends it.`);
  if (left.length) notes.push(`Left out, the wheel, the pedals, the joystick, bank select, the NRPN controllers and the channel mode messages: ${left.join(', ')}.`);
  if (unused.length) notes.push(`Numbers the chart marks unused (\`-\`) or leaves blank: ${unused.join(', ')}.`);

  const variables = { channel: 1 };
  const status = 0xb0 + variables.channel - 1;
  const picks = [...new Set([parameters[0], parameters.find((p) => p.type === 'choice'), parameters.at(-1)].filter(Boolean))];
  const tests = picks.map((p) => {
    const r = recipes.get(p.messageRecipe);
    const value = p.type === 'choice' ? p.choices.at(-1).id : p.range.max;
    const wire = p.type === 'choice' ? p.choices.at(-1).value : p.range.max;
    return { name: `${p.group} ${p.name} = ${value} (CC ${r.controller})`, parameter: p.id, value, expectedHex: [status, r.controller, wire].map(hex).join(' ') };
  });

  const doc = data.sources[0];
  const printsValues = data.rows.some((r) => r.values);
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Modal',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `MIDI CC implementation chart (page${layout.pages.length > 1 ? 's' : ''} ${layout.pages.join(', ')} of the PDF) read by tools/profiles/modal/import-modal.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/modal/make-profiles.mjs; edit the layout in tools/profiles/modal/synths/, not this file.',
      'Every parameter is a row of the manual\'s MIDI CC implementation chart, with its printed name, sent as a control change on the channel variable. Nothing here has been sent to a real instrument yet.',
      printsValues
        ? 'The chart prints each controller\'s values: a range is the parameter\'s, bands and named values a choice (a band\'s first value sent), anything else 0 - 127 with the printed text in the description.'
        : 'The chart prints controller numbers only: every value is 0 - 127, and a setting chosen from a list is a number here, not a choice.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-manual\'s-CC-chart',
      realtimeEditing: 'complete-for-the-manual\'s-CC-chart',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these same controllers when its panel is used, where its MIDI settings allow',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.controller - b.controller),
    parameters,
    tests,
  };
}

export { stringifyProfile };
