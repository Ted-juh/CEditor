// build-black-profile.mjs — a Black Corporation transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the chart:
//   - a row is its controller, a control change; its name is the chart's less the control's kind
//     (`SLIDER`, `POT`, `KNOB`, `BUTTON`, `SWITCH`, which the description keeps), the Xerxes's
//     underscores read as spaces; its group the layout's, by that name and its layer;
//   - the values are the chart's where it prints them: `0-127` a range, `0-64-127` a range centred on
//     64, bands (`0-64 / 65-127`, `0-21/22-42/…`) a choice, each band's first value sent, named as
//     the layout says from the manual's own description of the control (`Off`/`On` for a switch the
//     manual says nothing else about); where the chart prints none, 0 - 127;
//   - a row is on the channel of the block it is under (the Xerxes's `CHANNEL 2`), the channel
//     variable otherwise;
//   - the wheel, the pedal, bank select and CC 74 (the MPE controllers' slide, whose destination the
//     CC74 REPLACE setting chooses) are left out.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

export const PERFORMANCE = /^(?:BANK SELECT|MOD(?:ULATION)? WHEEL|SUSTAIN PEDAL)$/i;
const KIND = /^(SLIDER|POT|KNOB|BUTTON|SWITCH)[ _]/;

/** A printed name -> { kind, name }: `SLIDER VCF HPF A` -> { kind: 'SLIDER', name: 'VCF HPF A' }. */
export function bareName(printed) {
  const kind = KIND.exec(printed)?.[1] ?? null;
  const name = (kind ? printed.slice(kind.length + 1) : printed).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return { kind, name };
}

/**
 * A range cell -> { lo, hi } (`0-127`), { lo, hi, centre } (`0-64-127`), { bands: [[from, to], …] }
 * (`0-64 / 65-127`, `0-21/22-42/…`), or {} where none is printed.
 */
export function readRange(text) {
  const t = String(text ?? '').replace(/\s+/g, '');
  if (!t) return {};
  let m;
  if ((m = /^(\d+)-(\d+)$/.exec(t))) return { lo: Number(m[1]), hi: Number(m[2]) };
  if ((m = /^(\d+)-(\d+)-(\d+)$/.exec(t))) return { lo: Number(m[1]), hi: Number(m[3]), centre: Number(m[2]) };
  const bands = t.split('/').map((b) => /^(\d+)-(\d+)$/.exec(b)).map((b) => b && [Number(b[1]), Number(b[2])]);
  if (bands.length >= 2 && bands.every((b, k) => b && b[0] <= b[1] && (k === 0 || b[0] === bands[k - 1][1] + 1))) return { bands };
  throw new Error(`a range the builder does not read: ${text}`);
}

export function buildBlackProfile(data, layout) {
  const notes = [];
  const left = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const recipes = new Map();
  const parameters = [];
  const variables = { channel: 1, ...(layout.variables ?? {}) };
  // A name the chart prints on two controllers is told apart by its number.
  const printed = new Map();
  for (const r of data.rows) printed.set(`${r.layer ?? ''}|${r.name}`, (printed.get(`${r.layer ?? ''}|${r.name}`) ?? 0) + 1);
  const twice = new Map();
  for (const r of data.rows) {
    if (PERFORMANCE.test(r.name)) { left.push(`CC ${r.cc} ${r.name}`); continue; }
    if (r.cc === 74) { left.push(`CC 74 ${r.name}`); continue; }
    const { kind, name: bare } = bareName(r.name);
    const layer = r.layer ? r.layer[0] + r.layer.slice(1).toLowerCase() : null;
    const group = layout.groupOf(bare, layer);
    const repeated = printed.get(`${r.layer ?? ''}|${r.name}`) > 1;
    if (repeated) { const k = `${r.name}${r.layer ? ` (${r.layer})` : ''}`; twice.set(k, [...(twice.get(k) ?? []), r.cc]); }
    const name = repeated ? `${bare} (CC ${r.cc})` : bare;
    const variable = (r.block && layout.channelOf?.(r.block)) || 'channel';
    const id = `cc${r.cc}${variable === 'channel' ? '' : variable.replace(/Channel$/, '').replace(/^./, (c) => c.toUpperCase())}`;
    if (recipes.has(id)) throw new Error(`${layout.id}: CC ${r.cc} twice on ${variable}`);
    recipes.set(id, { id, kind: 'cc', channel: `$${variable}`, controller: r.cc, value: '$encodedValue' });
    const range = readRange(r.range);
    const describe = [`Printed: CC${r.cc}${r.range ? `  ${r.range}` : ''}  ${r.name}${r.layer ? `  ${r.layer}` : ''}.`];
    if (variable !== 'channel') describe.push(`Sent on ${variable}, the chart's ${r.block}.`);
    if (!r.range) describe.push('The chart prints no values for it: 0 - 127.');
    const base = { id: unique(`${camel(group)}.${camel(name.toLowerCase())}`), name, group, access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: id };
    if (range.bands) {
      const labels = layout.labels?.[r.name] ?? (range.bands.length === 2 ? ['Off', 'On'] : null);
      if (!labels || labels.length !== range.bands.length) throw new Error(`${layout.id}: ${r.name} has ${range.bands.length} bands and ${labels?.length ?? 'no'} labels`);
      const seen = new Set();
      const choices = labels.map((l, k) => { let cid = camel(l.toLowerCase().replace(/′/g, 'ft').replace(/⅓/g, ' 1 3').replace(/⅔/g, ' 2 3')) || `v${k}`; if (seen.has(cid)) cid = `${cid}${k}`; seen.add(cid); return { id: cid, label: l, value: range.bands[k][0] }; });
      describe.push(`Each setting sends the first value of its band (${range.bands.map((b, k) => `${labels[k]} ${b[0]}-${b[1]}`).join(', ')}).`);
      parameters.push({ ...base, description: describe.join(' '), type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(name.toLowerCase()) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u7' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : choices.length <= 6 ? 'RadioButtonGroup' : 'Combobox' } });
      continue;
    }
    const lo = range.lo ?? 0;
    const hi = range.hi ?? 127;
    if (range.centre !== undefined) describe.push(`Centred on ${range.centre}: shown ${lo - range.centre} - ${hi - range.centre}.`);
    parameters.push({
      ...base,
      description: describe.join(' '),
      type: 'integer',
      range: { min: lo, max: hi },
      default: range.centre ?? lo,
      display: { mode: 'number', unit: '', shortLabel: camel(name.toLowerCase()), ...(range.centre !== undefined ? { min: lo - range.centre, max: hi - range.centre } : {}) },
      normalization: { mode: 'linear' },
      encoding: { type: 'u7' },
      sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true },
      ui: { preferredComponent: kind === 'SLIDER' ? 'Slider' : 'Knob' },
    });
  }
  if (twice.size) notes.push(`Names the chart prints on more than one controller, each laid out and named with its number: ${[...twice].map(([n, ccs]) => `${n}, CC ${ccs.join(' and ')}`).join('; ')}.`);
  if (left.length) notes.push(`Left out, the wheel, the pedal, bank select and CC 74, the MPE controllers' slide (whose destination the CC74 REPLACE setting chooses): ${left.join(', ')}.`);

  const picks = [...new Set([parameters[0], parameters.find((p) => p.type === 'choice'), parameters.find((p) => p.display.min !== undefined), parameters.find((p) => recipes.get(p.messageRecipe).channel !== '$channel'), parameters.at(-1)].filter(Boolean))];
  const tests = picks.map((p) => {
    const r = recipes.get(p.messageRecipe);
    const status = 0xb0 + variables[r.channel.slice(1)] - 1;
    const value = p.type === 'choice' ? p.choices.at(-1).id : p.range.max;
    const wire = p.type === 'choice' ? p.choices.at(-1).value : p.range.max;
    return { name: `${p.group} ${p.name} = ${value} (CC ${r.controller})`, parameter: p.id, value, expectedHex: [status, r.controller, wire].map(hex).join(' ') };
  });
  const doc = data.sources[0];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Black Corporation',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `MIDI CC chart (pages ${layout.pages.join(', ')} of the PDF) read by tools/profiles/blackcorp/import-black.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/blackcorp/make-profiles.mjs; edit the layout in tools/profiles/blackcorp/synths/, not this file.',
      'Every parameter is a row of the manual\'s MIDI CC chart, sent as a control change. Its name is the chart\'s less the kind of control (SLIDER, POT, KNOB, BUTTON, SWITCH), which its description keeps. Nothing here has been sent to a real instrument yet.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-MIDI-CC-chart',
      realtimeEditing: 'complete-for-the-MIDI-CC-chart',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these same controllers when its panel is used, where its MIDI settings allow',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.channel.localeCompare(b.channel) || a.controller - b.controller),
    parameters,
    tests,
  };
}

export { stringifyProfile };
