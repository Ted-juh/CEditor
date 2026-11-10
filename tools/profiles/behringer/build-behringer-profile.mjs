// build-behringer-profile.mjs — a Behringer transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the table's own columns:
//   - a row naming a parameter of the instrument (its name, or the PRO-800's coarse, fine or stepped
//     column) is that controller; a row naming only the MIDI standard's meaning (the PRO-800's and
//     JN-80's `MIDI standard` column) is not a setting of the instrument;
//   - the wheels, pedals, bank select, NRPN and RPN controllers and the channel mode messages are left
//     out, by name, and so are the controllers that change the instrument's MIDI channels;
//   - the values are as printed: a range (`0 - 99`) is the parameter's range; bands (`0-63 off;
//     64-127 on`, or a band a line, `0-12  Voice Mode – Poly`) and named values (`0 = Off  64 = On`)
//     are a choice, a band's first value sent; anything else is a number 0 - 127, the printed text in
//     its description;
//   - a pair the guide names (`VCO 1 Frequency MSB (use with CC 36)`, `VCO 1 Frequency LSB`) is one
//     14-bit parameter, the MSB sent first.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const slug = (label) => String(label).toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';
const clean = (s) => String(s ?? '').replace(/"/g, ' ').replace(/_\s+/g, '_').replace(/\s+—(?=\s)/g, '').replace(/\s*[—–-]\s*$/, '').replace(/\s+/g, ' ').trim();
const STANDARD = /^(?:Mod(?:ulation)?\s*Wheel(?:\s+MSB|\s+LSB)?|Modulation|Breath(?:\s+Controller)?|Sustain(?:\s+pedal)?|Damper.*|Expression|Bank\s*sel(?:ect)?.*|NRPN.*|RPN.*|All\s+(?:sounds?|notes)\s+off|Reset\s+All.*|Local.*|Omni.*|Mono Mode|Poly Mode|Soft Pedal.*|Sostenuto.*|Hold 2|Legato Footswitch|Main volume|Volume|Foot (?:Pedal|Controller)|Pitch\s*bend|Aftertouch|High Resolution Velocity Prefix|Portamento CC Control|General Purpose.*|Undefined.*|Sound Controller.*|Effect \d Depth|Effect Controller.*|Balance|Pan)$/i;
const MIDI_SETUP = /^MIDI (?:Tx|Rx) Channel$/i;

/**
 * A range cell -> { lo, hi } for a plain range, { choices } for bands (`0-63 off; 64-127 on`) or
 * named values (`0 = Off 64 = On`), or { text } for anything else.
 */
export function readRange(text) {
  const t = clean(text).replace(/–/g, '-');
  if (!t) return {};
  const plain = /^(\d+)\s*-\s*(\d+)$/.exec(t);
  if (plain) return { lo: Number(plain[1]), hi: Number(plain[2]) };
  // Named values: `0 = Off 64 = On`.
  // (Not a band's end: `0-64 = off / 65 – 127 = on` is two bands.)
  const named = [...t.matchAll(/(?<![\d-]\s*)(\d+)\s*=\s*([^=]+?)(?=\s+\d+\s*=|$)/g)].map((m) => ({ value: Number(m[1]), label: clean(m[2]).replace(/[,;/]$/, '').trim() }));
  if (named.length >= 2 && named.every((n, k) => k === 0 || n.value > named[k - 1].value) && named.every((n) => n.label)) return { choices: named };
  // Bands: `a-b label` in order, each starting after the last ends.
  const runs = [...t.matchAll(/(\d+)\s*-\s*(\d+)\s*=?/g)];
  if (runs.length >= 2) {
    // (A label's own sign stays: the UB-1 Micro's octaves, `0-25 -2, 26-51, -1`.)
    const bands = runs.map((m, k) => ({ from: Number(m[1]), to: Number(m[2]), label: clean(t.slice(m.index + m[0].length, runs[k + 1]?.index ?? t.length)).replace(/^[\s,;=]+|^-(?!\d)\s*|[\s,;/]+$/g, '').trim() }));
    if (bands.every((b) => b.label) && bands.every((b, k) => b.from <= b.to && (k === 0 || b.from > bands[k - 1].to))) return { choices: bands.map((b) => ({ value: b.from, label: b.label })) };
    return { text: t, unsure: true };
  }
  return { text: t };
}

/** Value bands printed a line each (`0-12  Voice Mode – Poly`) -> { name, choices } or null. */
export function readBands(bands) {
  const items = bands.map((b) => ({ ...readRange(b.range), label: clean(b.name) }));
  if (items.some((i) => i.lo === undefined && !/^\d+$/.test(clean(bands[items.indexOf(i)].range)))) return null;
  const list = items.map((i, k) => ({ value: i.lo ?? Number(clean(bands[k].range)), to: i.hi ?? Number(clean(bands[k].range)), label: i.label }));
  if (!list.every((b, k) => k === 0 || b.value > list[k - 1].to)) return null;
  // Their common first words are the parameter (`Voice Mode`), the rest each value's name.
  const words = list.map((b) => b.label.split(' '));
  let n = 0;
  while (words.every((w) => w.length > n + 1 && w[n] === words[0][n])) n++;
  const name = words[0].slice(0, n).join(' ').replace(/\s*[–-]$/, '');
  return { name, choices: list.map((b, k) => ({ value: b.value, label: words[k].slice(n).join(' ').replace(/^[–-]\s*/, '') || b.label })) };
}

export function buildBehringerProfile(data, layout) {
  const notes = [];
  const skipped = new Map();
  const skip = (why, what) => { const list = skipped.get(why) ?? []; if (!list.includes(what)) skipped.set(why, [...list, what]); };
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const corrected = [];
  // A row the guide prints wrongly, corrected by the layout: a patch, or a function of the row.
  const rows = data.rows.map((r) => {
    const fix = layout.fix?.[r.cc];
    if (!fix) return r;
    const patch = typeof fix === 'function' ? fix(r) : fix;
    corrected.push(`CC ${r.cc} (${layout.fixNotes?.[r.cc] ?? Object.entries(patch).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(', ')})`);
    return { ...r, ...patch };
  });
  const misprintedHex = rows.filter((r) => r.hex && /^[0-9A-F]{1,2}$/.test(r.hex) && parseInt(r.hex, 16) !== r.cc).map((r) => `CC ${r.cc} printed ${r.hex}`);
  // The pairs the guide names: `… MSB (use with CC 36)`.
  const lsbOf = new Map();
  for (const r of rows) { const m = /^(.*?)\s+MSB\s*\(use with CC (\d+)\)$/i.exec(clean(r.name)); if (m) lsbOf.set(r.cc, { name: m[1], lsb: Number(m[2]) }); }
  const lsbs = new Set([...lsbOf.values()].map((p) => p.lsb));

  const recipes = new Map();
  const parameters = [];
  const unclean = [];
  const spelling = new Map();
  for (const r of rows) {
    const own = clean(r.name ?? r.stepped ?? (r.fine ? `${clean(r.fine)} Fine` : ''));
    const label = `CC ${r.cc}${own ? ` ${own}` : r.standard ? ` ${clean(r.standard)}` : ''}`;
    if (lsbs.has(r.cc)) continue;   // the fine half of a pair, sent with its MSB
    // The row's own name and range lead its bands where they are the first of them (the AKS Mini's
    // `0-12 Voice Mode – Poly`), not where they are the whole range (the Pro-VS Mini's `FX Engine 0 – 127`).
    const ownRange = readRange(r.range);
    const leads = r.bands && r.name && ownRange.hi !== undefined && ownRange.hi < (readRange(r.bands[0].range).lo ?? -1);
    const fromBands = r.bands ? readBands([...(leads ? [{ name: r.name, range: r.range }] : []), ...r.bands]) : null;
    if (!own && !fromBands) { skip('controllers that only have their MIDI standard meaning here', label); continue; }
    let name = fromBands && (!r.name || leads) ? (fromBands.name || own) : own;
    // A value note printed in the name: `Ring Modulation on/off (0-64 = off / 65 – 127 = on)`.
    let rangeText = r.range;
    const inName = /^(.*?)\s*\(([^()]*\d[^()]*=[^()]*)\)$/.exec(name);
    if (inName && !rangeText) { name = inName[1]; rangeText = inName[2].replace(/\s*\/\s*/g, ' '); }
    const pair = lsbOf.get(r.cc);
    if (pair) name = pair.name;
    if (layout.rename) name = layout.rename(name);
    if (STANDARD.test(name)) { skip('the wheels, pedals, bank select, NRPN and RPN controllers and the channel mode messages', label); continue; }
    if (MIDI_SETUP.test(name)) { skip('controllers that change the instrument\'s MIDI channels', label); continue; }
    if (layout.leaveOut?.[r.cc]) { skip(layout.leaveOut[r.cc], label); continue; }
    const recipe = { id: `cc${r.cc}${pair ? `_${pair.lsb}` : ''}`, kind: 'cc', channel: '$channel', controller: r.cc, ...(pair ? { lsbController: pair.lsb } : {}), value: '$encodedValue' };
    recipes.set(recipe.id, recipe);
    const values = fromBands ? { choices: fromBands.choices } : readRange(rangeText);
    const describe = [];
    if (pair) describe.push(`14 bits: the MSB on CC ${r.cc}, then the LSB on CC ${pair.lsb}.`);
    if (values.text) describe.push(`Printed: ${values.text}.`);
    if (values.unsure) unclean.push(name);
    // A group is the block a name begins with (`VCF`, `OSC 1`, `DCA_`, `Aux/`), `LFO1` and `LFO 1` alike.
    // (Spelt as it first is: the UB-1 Micro's `OSC1 Wave` and `Osc 1 Fine Tune` are one group.)
    const found = layout.groupOf?.(name) ?? (/^([A-Z][A-Za-z]*(?:\s?\d)?)(?=[\s_/]|$)/.exec(name)?.[1]?.replace(/([A-Za-z])(\d)$/, '$1 $2') ?? 'Sound');
    const group = spelling.get(found.toLowerCase()) ?? (spelling.set(found.toLowerCase(), found), found);
    const base = { id: unique(`${camel(group)}.${camel(name)}`), name, group, ...(describe.length ? { description: describe.join(' ') } : {}), access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: recipe.id };
    if (values.choices && !pair) {
      const seen = new Set();
      const list = values.choices.map(({ value, label: l }) => { const s = slug(l); const id = seen.has(s) ? `${s}_${value}` : s; seen.add(id); return { id, label: l, value }; });
      parameters.push({ ...base, type: 'choice', default: list[0].id, choices: list, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'enum' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list.length === 2 ? 'ToggleButton' : list.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
    } else {
      const max = pair ? 16383 : values.hi !== undefined && values.hi <= 127 ? values.hi : 127;
      const min = !pair && values.lo !== undefined && values.hi !== undefined && values.hi <= 127 ? values.lo : 0;
      if (values.hi > 127) base.description = [base.description, `Printed: ${rangeText}.`].filter(Boolean).join(' ');
      parameters.push({ ...base, type: 'integer', range: { min, max }, default: min, display: { mode: 'number', unit: '', shortLabel: camel(name) }, normalization: { mode: 'linear' }, encoding: { type: pair ? 'u14-msb-lsb' : 'u7' }, sendPolicy: max - min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Amount|Volume|Cutoff|Resonance/i.test(name) ? 'Slider' : 'Knob' } });
    }
  }
  if (corrected.length) notes.push(`Rows the guide prints wrongly, given by the layout: ${corrected.join(', ')}.`);
  if (misprintedHex.length) notes.push(`Hex column misprints, the decimal taken: ${misprintedHex.join(', ')}.`);
  for (const [why, list] of skipped) notes.push(`Left out, ${why}: ${list.join(', ')}.`);
  if (unclean.length) notes.push(`Value bands that do not read cleanly (out of order or overlapping), left a number with the printed text: ${unclean.join(', ')}.`);

  const variables = { channel: 1, ...(layout.variables ?? {}) };
  const tests = [];
  const status = 0xb0 + variables.channel - 1;
  for (const p of [...new Set([parameters.find((p) => p.type === 'choice'), parameters.find((p) => recipes.get(p.messageRecipe).lsbController !== undefined), parameters.find((p) => p.type === 'integer' && p.range.max > 1)].filter(Boolean))]) {
    const r = recipes.get(p.messageRecipe);
    const choice = p.type === 'choice' ? p.choices.at(-1) : null;
    const value = choice ? choice.value : Math.min(p.range.max, p.range.max > 127 ? 1000 : 100);
    const bytes = r.lsbController !== undefined ? [[r.controller, value >> 7], [r.lsbController, value & 127]] : [[r.controller, value]];
    tests.push({ name: `${p.name} = ${choice ? choice.label : value} (CC ${r.controller})`, parameter: p.id, value: choice ? choice.id : value, expectedHex: bytes.map(([cc, v]) => [status, cc, v].map(hex).join(' ')).join('\n') });
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
    sources: [{ type: 'manual', title: doc.title, notes: `MIDI controller table (page${layout.pages.length > 1 ? 's' : ''} ${layout.pages.join(', ')}) read by tools/profiles/behringer/read-behringer-cc.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/behringer/make-profiles.mjs; edit the layout in tools/profiles/behringer/synths/, not this file.',
      'Every parameter is a row of the guide\'s MIDI controller table, with its printed name, sent as a control change on the channel variable. Nothing here has been sent to a real instrument yet.',
      'Ranges are as printed (`0 - 99`): the guide does not say whether a range is the controller\'s values or what the panel shows for them.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-guide\'s-controller-table',
      realtimeEditing: 'complete-for-the-guide\'s-controller-table',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these same controllers when its MIDI settings allow',
      verifiedOnHardware: false,
      ...(layout.coverage ?? {}),
    },
    timing: { minDelayBetweenMessagesMs: layout.delayMs ?? 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.controller - b.controller),
    parameters,
    tests,
  };
}

export { stringifyProfile };
