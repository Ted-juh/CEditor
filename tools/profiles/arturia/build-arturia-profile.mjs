// build-arturia-profile.mjs — an Arturia transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the chart:
//   - a row is that controller, sent as a control change on the channel variable, under its block's
//     title or section (`VCO 1`, `LADDER FILTER`, `Analog Filter`);
//   - the chart prints no values, so each takes the controller's 0 - 127;
//   - the MatrixBrute's `7-bit/14-bit` rows are sent as 7 bits: the chart does not print the
//     controller their fine half would go on;
//   - the wheels, ribbon and pedals are left out, by name.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const PERFORMANCE = /^(?:Mod(?:ulation)? Wheel|Sustain Pedal|Expr\.? Pedal \d|Exp \d|Ribbon)$/i;
// (`Sustain` and `Modulation` alone are a pedal and a wheel only under Pedals, MIDI or WHEELS: an
// envelope's Sustain is not.)
const performance = (r) => PERFORMANCE.test(r.name) || (/^(?:Sustain|Modulation)$/.test(r.name) && /^(?:Pedals|MIDI|WHEELS)$/i.test(r.title));

export function buildArturiaProfile(data, layout) {
  const notes = [];
  const left = [];
  const regrouped = [];
  const corrected = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const recipes = new Map();
  const parameters = [];
  const fourteen = [];
  for (const r of data.rows) {
    // A row the chart misprints, which the layout corrects from the manual's own text.
    const fix = layout.corrections?.[r.cc];
    const name = fix?.name ?? r.name;
    if (performance(r)) { left.push(`CC ${r.cc} ${name}`); continue; }
    // The block a row is printed under, or the layout's group for a chart that has none (the
    // MicroFreak's), or for a row it puts under the wrong one.
    let group = fix?.title ?? (r.title || layout.groupOf?.(name) || 'Sound');
    if (fix) corrected.push(`CC ${r.cc} (printed ${r.title ? `${r.title}: ` : ''}${r.name}; ${fix.because})`);
    if (layout.regroup?.[r.cc]) { regrouped.push(`CC ${r.cc} ${name} (printed under ${group})`); group = layout.regroup[r.cc]; }
    const recipe = { id: `cc${r.cc}`, kind: 'cc', channel: '$channel', controller: r.cc, value: '$encodedValue' };
    recipes.set(recipe.id, recipe);
    const describe = [];
    if (r.extra === '7-bit/14-bit') { fourteen.push(`CC ${r.cc}`); describe.push('The manual gives it 7 or 14 bits; sent here as 7.'); }
    parameters.push({
      id: unique(`${camel(group)}.${camel(name)}`),
      name,
      group,
      // Where the manual prints it: the page of its row in the chart.
      ...(r.page ? { source: { page: r.page } } : {}),
      ...(describe.length ? { description: describe.join(' ') } : {}),
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipe.id,
      type: 'integer',
      range: { min: 0, max: 127 },
      default: 0,
      display: { mode: 'number', unit: '', shortLabel: camel(name) },
      normalization: { mode: 'linear' },
      encoding: { type: 'u7' },
      sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true },
      ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Amount|Amt|Volume|Cutoff|Resonance|Mix/i.test(name) ? 'Slider' : 'Knob' },
    });
  }
  // Two rows on one controller that are both laid out (none are, once the pedals are left out).
  const byCc = new Map();
  for (const p of parameters) { const cc = recipes.get(p.messageRecipe).controller; byCc.set(cc, [...(byCc.get(cc) ?? []), p]); }
  const shared = [...byCc].filter(([, ps]) => ps.length > 1).map(([cc, ps]) => `CC ${cc}: ${ps.map((p) => `${p.group} ${p.name}`).join(', ')}`);
  if (shared.length) notes.push(`Controllers the chart gives to two rows, both laid out: ${shared.join('; ')}. CEditor sends either, and follows neither when the instrument sends it.`);
  // A pedal on a knob's controller (the MatrixBrute's expression pedals on CC 3 and 4, as its macro
  // knobs M4 and M3 are): the knob is laid out, the pedal not.
  const withPedal = data.rows.filter((r) => performance(r) && byCc.has(r.cc)).map((r) => `CC ${r.cc} (${r.name}; ${byCc.get(r.cc).map((p) => `${p.group} ${p.name}`).join(', ')})`);
  if (withPedal.length) notes.push(`Controllers the chart gives to a pedal or wheel and to a knob, laid out as the knob: ${withPedal.join(', ')}.`);
  if (regrouped.length) notes.push(`Rows grouped by the layout, not where the chart prints them: ${regrouped.join(', ')}.`);
  if (corrected.length) notes.push(`Rows the chart misprints, corrected by the layout from the manual's own text: ${corrected.join('; ')}.`);
  if (fourteen.length) notes.push(`The chart gives ${fourteen.sort((a, b) => Number(a.slice(3)) - Number(b.slice(3))).join(', ')} as 7-bit/14-bit and prints no fine controller for them; they are sent as 7 bits.`);
  if (left.length) notes.push(`Left out, the wheels, ribbon and pedals: ${left.join(', ')}.`);

  const variables = { channel: 1 };
  const status = 0xb0 + variables.channel - 1;
  const tests = parameters.filter((p, i) => i === 0 || i === parameters.length - 1 || p.name === layout.testName).map((p) => {
    const r = recipes.get(p.messageRecipe);
    return { name: `${p.group} ${p.name} = 100 (CC ${r.controller})`, parameter: p.id, value: 100, expectedHex: [status, r.controller, 100].map(hex).join(' ') };
  });

  const doc = data.sources[0];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Arturia',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `MIDI CC chart (page${layout.pages.length > 1 ? 's' : ''} ${layout.pages.join(', ')} of the PDF) read by tools/profiles/arturia/read-arturia-cc.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/arturia/make-profiles.mjs; edit the layout in tools/profiles/arturia/synths/, not this file.',
      'Every parameter is a row of the manual\'s MIDI CC chart, with its printed name, sent as a control change on the channel variable. Nothing here has been sent to a real instrument yet.',
      'The chart prints controller numbers only: every value is the controller\'s 0 - 127, and a setting chosen from a list (a waveform, an oscillator type) is a number here, not a choice.',
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
      inboundControllers: 'the instrument sends these same controllers when its knobs are turned, where its MIDI settings allow',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.controller - b.controller),
    parameters,
    tests,
  };
}

export { stringifyProfile };
