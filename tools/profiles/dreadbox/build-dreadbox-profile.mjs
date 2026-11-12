// build-dreadbox-profile.mjs — a Dreadbox transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the list:
//   - a row is the controller it prints, sent as a control change on the channel variable;
//   - the Nymphes's values are the controller's own: `0-127` a range, `0-5` with `Poly/Uni-A/…` in
//     its notes a choice of those, one value each;
//   - the Artemis's are what its screen shows, each "split in the whole CC range of 0-127", as its
//     list says: `0 - 100` is 0 - 127 shown 0 - 100, `SINE / TRI / SAW` a choice, each sent at the
//     middle of its equal share of 0 - 127; the Murmux Adept's (`[0 - 99]`, `[SINE, TRI, SAW]`) are
//     taken the same way, its manual not saying, and its profile says so;
//   - the wheel, the pedals, bank select and the channel mode messages are left out.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

export const PERFORMANCE = /^(?:Bank Select|Mod ?Wheel|MODWHEEL|Sustain(?: Pedal)?|Expression(?: Pedal)?|All (?:Sounds?|Notes?|Noise) off|Reset All Controllers)$/i;

/** A row's group, by how its name begins. */
export const groupOfName = (name) => [
  [/^Mod Source/i, 'Mod Source'], [/^(?:LPF|HPF|Filter|Resonance|Cutoff)/i, 'Filter'], [/^(?:LFO ?1|Polyphonic LFO)/i, 'LFO 1'], [/^(?:LFO ?2|LFO B)/i, 'LFO 2'], [/^LFO/i, 'LFO'],
  [/^(?:AMP|VCA|Amplifier)/i, 'Amp'], [/^(?:OSC|VCO|Sub|Noise|Pulse|Detune|Chord|Master Spread|Spread)/i, 'Oscillator'], [/^(?:Reverb|Delay|BBD|Distortion|Modulations?|Drive)/i, 'Effects'],
  [/^(?:EG|Envelope)/i, 'Envelope'], [/^Sequencer/i, 'Sequencer'],
].find(([re]) => re.test(name))?.[1] ?? 'Global';

/** n settings spread over 0 - 127: the middle of each one's equal share. */
export const spread = (n) => Array.from({ length: n }, (u, k) => Math.floor(((k + 0.5) * 128) / n));

/**
 * A value cell (and the notes beside it) -> { lo, hi } (the controller's own range), { shown: [a, b] }
 * (0 - 127 shown as a - b), { labels, spread } (settings spread over 0 - 127), { labels, from }
 * (settings one value each from `from`), or { text }.
 */
export function readValue(value, notes, { spreads }) {
  const v = String(value ?? '').replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim();
  const n = String(notes ?? '').replace(/\s+/g, ' ').trim();
  let m;
  if ((m = /^(-?\d+)\s*-\s*(-?\d+)$/.exec(v))) {
    const [lo, hi] = [Number(m[1]), Number(m[2])];
    // (`0-5` with `Poly/Uni-A/Uni-B/TRI/DUO/MONO` beside it: a setting for each value.)
    const labels = n.split(/\s*[/,]\s*/).filter(Boolean);
    if (!spreads && lo === 0 && labels.length === hi - lo + 1) return { labels, from: lo };
    if (!spreads) return lo >= 0 && hi <= 127 ? { lo, hi } : { text: v };
    return { shown: [lo, hi] };
  }
  // `SINE / TRI / SAW`, `SINE, TRI, SAW`: settings.
  const labels = v.split(/\s*[/,]\s*/).filter(Boolean);
  if (labels.length >= 2 && labels.every((l) => /^[A-Za-z0-9+&.\- ]+$/.test(l) && l.length <= 20)) return spreads ? { labels, spread: true } : { labels, from: 0 };
  return v ? { text: v } : {};
}

export function buildDreadboxProfile(data, layout) {
  const notes = [];
  const left = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const recipes = new Map();
  const parameters = [];
  for (const r of data.rows) {
    const cc = Number(r.cc);
    const name = String(r.name ?? '').replace(/\s+/g, ' ').trim();
    if (PERFORMANCE.test(name)) { left.push(`CC ${cc} ${name}`); continue; }
    const recipe = { id: `cc${cc}`, kind: 'cc', channel: '$channel', controller: cc, value: '$encodedValue' };
    recipes.set(recipe.id, recipe);
    const group = layout.groupOf?.(name) ?? groupOfName(name);
    // (`(POLY)` beside the Murmux Adept's values: answers per voice, by polyphonic aftertouch.)
    const poly = /\(POLY\)/.test(r.value ?? '');
    const value = readValue(String(r.value ?? '').replace(/\(POLY\)/, ''), r.notes, { spreads: !!layout.spreads });
    const describe = [`Printed: ${[r.value, r.notes].filter(Boolean).join(' ')}.`];
    if (poly) describe.push('The manual marks it POLY: per voice, by polyphonic aftertouch or MPE.');
    const base = { id: unique(`${camel(group)}.${camel(name)}`), name, group, source: { page: r.page }, description: describe.join(' '), access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: recipe.id };
    if (value.labels) {
      const values = value.spread ? spread(value.labels.length) : value.labels.map((l, k) => value.from + k);
      const seen = new Set();
      const choices = value.labels.map((l, k) => { let id = camel(l.toLowerCase()) || `v${k}`; if (seen.has(id)) id = `${id}${k}`; seen.add(id); return { id, label: l, value: values[k] }; });
      parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u7' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : choices.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
      continue;
    }
    const lo = value.lo ?? 0;
    const hi = value.hi ?? 127;
    parameters.push({
      ...base,
      type: 'integer',
      range: { min: lo, max: hi },
      default: lo,
      display: { mode: 'number', unit: '', shortLabel: camel(name), ...(value.shown ? { min: value.shown[0], max: value.shown[1] } : {}) },
      normalization: { mode: 'linear' },
      encoding: { type: 'u7' },
      sendPolicy: hi - lo > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
      ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Amount|Depth|Mix|Cutoff|Reson/i.test(name) ? 'Slider' : 'Knob' },
    });
  }
  const byCc = new Map();
  for (const p of parameters) { const c = recipes.get(p.messageRecipe).controller; byCc.set(c, [...(byCc.get(c) ?? []), p.name]); }
  const shared = [...byCc].filter(([, ns]) => ns.length > 1).map(([c, ns]) => `CC ${c}: ${ns.join(', ')}`);
  if (shared.length) notes.push(`Controllers the list gives to two rows, both laid out: ${shared.join('; ')}.`);
  if (left.length) notes.push(`Left out, the wheel, the pedals, bank select and the channel mode messages: ${left.join(', ')}.`);

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
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Dreadbox',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [
      { type: 'manual', title: doc.title, notes: `CC list (page${layout.pages.length > 1 ? 's' : ''} ${layout.pages.join(', ')} of the PDF) read by tools/profiles/dreadbox/import-dreadbox.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}.${layout.ownCopy ? ` ${layout.ownCopy.read}` : ''} Not yet checked against the instrument itself.` },
      // (Where the file read is not Dreadbox's own: Dreadbox's copy, and how the two were compared.)
      ...(layout.ownCopy ? [{ type: 'manual', title: layout.ownCopy.title, notes: `Dreadbox's own copy: ${layout.ownCopy.file} (sha256 ${layout.ownCopy.sha256}), ${layout.ownCopy.url}. ${layout.ownCopy.compared}` }] : []),
    ],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/dreadbox/make-profiles.mjs; edit the layout in tools/profiles/dreadbox/synths/, not this file.',
      'Every parameter is a row of the CC list, with its printed name, sent as a control change on the channel variable. Nothing here has been sent to a real instrument yet.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-CC-list',
      realtimeEditing: 'complete-for-the-CC-list',
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
