// build-te-profile.mjs — a teenage engineering transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the guide's table:
//   - a row is its controller, on the channel variable; where the table's channel column is a range
//     (`1-16`, `1 - 4 *`) that is the track's channel, the variable set to the track to edit; a fixed
//     channel other than the first (the TX-6's master, 7) is a variable of its own;
//   - a run of controllers (`54 - 57  patch fx parameters 1 - 4`) is a parameter each;
//   - `0 - 127`, `0-15` a range; `≥ 64 = muted` and `< 64 = synth, ≥ 64 = drum` a choice of two,
//     sent at 0 and 127; `≥ 64` alone an action, sent as 127; anything else 0 - 127 with the
//     printed text in its description;
//   - the sustain pedal, the wheel and the channel mode messages are left out, and a second row on a
//     controller already laid out (the OP-Z's next and previous pattern, values of its pattern
//     select) is named, not laid out.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

export const PERFORMANCE = /^(?:sustain pedal.*|mod(?:ulation)? wheel|all notes off|all sound off|reset all controllers)$/i;

/** A controller cell and its name -> [{ cc, name }]: one, or a run, a name for each. */
export function controllersOf(cc, name) {
  const run = /^(\d+)\s*-\s*(\d+)$/.exec(cc);
  if (!run) return [{ cc: Number(cc), name }];
  const [from, to] = [Number(run[1]), Number(run[2])];
  const numbered = /^(.*?)s?\s+(\d+)\s*-\s*(\d+)$/.exec(name);
  return Array.from({ length: to - from + 1 }, (u, k) => ({ cc: from + k, name: numbered && Number(numbered[3]) - Number(numbered[2]) === to - from ? `${numbered[1]} ${Number(numbered[2]) + k}` : `${name} ${k + 1}` }));
}

/** A range cell -> { lo, hi } | { choices } | { action } | { text } | {}. */
export function readRange(text) {
  const t = String(text ?? '').replace(/[–—]/g, '-').trim();
  let m;
  if (!t || t === '-') return {};
  if ((m = /^(\d+)\s*-\s*(\d+)$/.exec(t))) return { lo: Number(m[1]), hi: Number(m[2]) };
  if ((m = /^≥\s*64\s*=\s*(.+)$/.exec(t))) return { choices: [{ value: 0, label: 'off' }, { value: 127, label: m[1].trim() }] };
  if ((m = /^<\s*64\s*=\s*([^,]+),\s*≥\s*64\s*=\s*(.+)$/.exec(t))) return { choices: [{ value: 0, label: m[1].trim() }, { value: 127, label: m[2].trim() }] };
  if (/^≥\s*64$/.test(t)) return { action: true };
  // `on / off`: a switch, off at 0.
  if ((m = /^(\w+)\s*\/\s*(\w+)$/.exec(t)) && !/\d/.test(t)) {
    const [a, b] = [m[1], m[2]];
    const off = b === 'off' ? b : a;
    const on = b === 'off' ? a : b;
    return { choices: [{ value: 0, label: off }, { value: 127, label: on }] };
  }
  return { text: t };
}

export function buildTeProfile(data, layout) {
  const notes = [];
  const left = [];
  const omitted = [];
  const twice = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const recipes = new Map();
  const parameters = [];
  const variables = { channel: 1, ...(layout.variables ?? {}) };
  const fixes = layout.fixRange ?? {};
  const fixed = [];

  for (const r of data.rows) {
    for (const { cc, name } of controllersOf(r.cc, r.name)) {
      if (PERFORMANCE.test(name)) { left.push(`CC ${cc} ${name}`); continue; }
      if (layout.leaveOut?.includes(name)) { omitted.push(`CC ${cc} ${name}`); continue; }
      // The channel: the layout's variable for a fixed channel, the channel variable otherwise.
      const variable = layout.channelOf?.(r.channel) ?? 'channel';
      const id = `cc${cc}${variable === 'channel' ? '' : variable.replace(/Channel$/, '').replace(/^./, (c) => c.toUpperCase())}`;
      if (recipes.has(id)) { twice.push(`${name} (CC ${cc}, ${r.range})`); continue; }
      const recipe = { id, kind: 'cc', channel: `$${variable}`, controller: cc, value: '$encodedValue' };
      recipes.set(id, recipe);
      const printed = r.range;
      if (fixes[printed]) fixed.push(`${name}: ${printed} as ${fixes[printed]}`);
      const range = readRange(fixes[printed] ?? printed);
      const label = name.replace(/\s*\/\s*/g, ' / ');
      const group = layout.groupOf?.(label) ?? 'Global';
      const describe = [`CC ${cc}${r.channel ? `, channel ${r.channel}` : ''}${printed ? `: ${printed}` : ''}.`];
      if (range.action) describe.push('An action: sent as 127.');
      // Where the page prints it: the table, by the heading a reader finds it under (read-te-guide.mjs).
      const base = { id: unique(`${camel(group)}.${camel(label)}`), name: label, group, ...(r.heading ? { source: { table: r.heading } } : {}), description: describe.join(' '), access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: id };
      if (range.choices || range.action) {
        const choices = range.action ? [{ id: 'trigger', label: 'trigger', value: 127 }] : range.choices.map((c) => ({ id: camel(c.label) || `v${c.value}`, label: c.label, value: c.value }));
        parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(label) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u7' }, sendPolicy: { mode: 'onCommit', coalesce: false }, ui: { preferredComponent: range.action ? 'Button' : 'ToggleButton' } });
        continue;
      }
      const lo = range.lo ?? 0;
      const hi = range.hi ?? 127;
      parameters.push({
        ...base,
        type: 'integer',
        range: { min: lo, max: hi },
        default: lo,
        display: { mode: 'number', unit: '', shortLabel: camel(label) },
        normalization: { mode: 'linear' },
        encoding: { type: 'u7' },
        sendPolicy: hi - lo > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
        ui: { preferredComponent: /volume|level|gain|send|amount|depth|attack|decay|sustain|release|cutoff|resonance|eq/i.test(label) ? 'Slider' : 'Knob' },
      });
    }
  }
  if (fixed.length) notes.push(`Ranges read as the layout says, not as printed: ${fixed.join('; ')}.`);
  if (twice.length) notes.push(`Rows on a controller already laid out, named here, not laid out: ${twice.join(', ')}.`);
  if (omitted.length) notes.push(`Left out by the layout (see its comment): ${omitted.join(', ')}.`);
  if (left.length) notes.push(`Left out, the sustain pedal, the wheel and the channel mode messages: ${left.join(', ')}.`);

  const picks = [...new Set([parameters[0], parameters.find((p) => p.type === 'choice'), parameters.at(-1)].filter(Boolean))];
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
    manufacturer: 'teenage engineering',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `The guide's MIDI table, read by tools/profiles/teenage/read-te-guide.mjs from the page ${doc.url} as saved on ${doc.saved} (sha256 ${doc.sha256}). A guide is a live page: a later one may differ. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/teenage/make-profiles.mjs; edit the layout in tools/profiles/teenage/synths/, not this file.',
      'Every parameter is a row of the guide\'s table of incoming MIDI control changes, with its printed name, sent as that controller. Nothing here has been sent to a real instrument yet.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-guide\'s-MIDI-table',
      realtimeEditing: 'complete-for-the-guide\'s-MIDI-table',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'not described by the guide',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.channel.localeCompare(b.channel) || a.controller - b.controller),
    parameters,
    tests,
  };
}

export { stringifyProfile };
