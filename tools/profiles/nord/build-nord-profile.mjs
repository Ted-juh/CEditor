// build-nord-profile.mjs — a Nord transcription (tables/<name>.json) and a layout (synths/<name>.mjs)
// -> a CEditor device profile.
//
// What it takes as settled, from the list:
//   - a row is the controller it prints, sent as a control change; or, printed `2:22`, the NRPN
//     whose MSB (CC 99) and LSB (CC 98) those are, its value on CC 38 (data entry LSB) with CC 6 at
//     0, as the Stage 4's, Electro 7's, Piano 6's and Grand 2's manuals say it is;
//   - `2:32-34` under `Piano Type/Model/Variation` is three NRPNs, one for each name; a cell the
//     builder cannot read as one message (`59, 65`, `16-24`, `3:4:x:x`, a run under one name) is
//     left out and named;
//   - the list prints no values: each takes 0 - 127, but for a value list in the name
//     (`Rotary Speaker Control (0 = Slow, 64 = Stop. 127 = Fast)`), which is a choice;
//   - on the organs, a row is on the channel of each manual the layout or the list gives it (the
//     asterisk, the C1's comment column), a parameter for each;
//   - the pedals, the wheel and bank select are left out, by name.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** The pedals, the wheel and bank select: performance, not the panel. */
export const PERFORMANCE = /^(?:Bank Select\b.*|Sustain(?: Pedal)?|Sostenuto(?: Pedal)?|Soft Pedal|Pedal (?:Sustain|Latch|Soft)|(?:Volume\/)?Ctrl Pedal(?: \(.*\))?|Control Pedal(?: \(Expression\))?|Volume Pedal(?: \(.*\))?|Mod(?:ulation)? Wheel|Wheel\/Pedal Morph.*|(?:Organ )?Swell(?: Pedal)?|Rotor Speed Pedal|KB Gate Pedal)$/i;

// A row's group by how its name begins, longest first; the layout's groupOf goes before these.
const PREFIXES = [
  'Sample Synth', 'Effect Mod 1', 'Effect Mod 2', 'B3 Percussion', 'Rotary Speaker', 'Rotary/Amp Sim', 'Speaker/Comp', 'Spkr/Comp',
  'Amp/EQ', 'Amp/Comp', 'Amp/Spkr', 'AmpSim', 'Amp Env', 'Amp Envelope', 'Amplifier Envelope', 'Filt Env', 'Filter Env', 'Filter Envelope',
  'Mod Env', 'Modulation Envelope', 'Osc Mod Env', 'Mod 1', 'Mod 2', 'Effect 1', 'Effect 2', 'Effects 1', 'Effects 2', 'LFO 1', 'LFO 2', 'LFO1', 'LFO2',
  'Osc 1', 'Osc 2', 'Arp/Gate', 'Arg/Gate', 'Bass Pedal', 'Layer', 'Organ', 'Piano', 'Synth', 'Clav', 'Delay', 'Reverb', 'Compressor', 'Rotary', 'Rotor',
  'EQ', 'Eq', 'Effects', 'FX', 'Arpeggio', 'Arp', 'LFO', 'Oscillator', 'Osc', 'Filter', 'Filt', 'Drawbar', 'Perc', 'Vibrato', 'Vib', 'Tone', 'Noise',
  'Click', 'Dist', 'Echo', 'Part', 'Bass', 'Modulation', 'Drive', 'Amp', 'Mod Envelope', 'Osx', 'Samp', 'Tube Amp', 'Portamento', 'Chorus',
].sort((a, b) => b.length - a.length);
const SAME = { Filt: 'Filter', 'Filt Env': 'Filter Env', 'Filter Envelope': 'Filter Env', Eq: 'EQ', LFO1: 'LFO 1', LFO2: 'LFO 2', 'Effects 1': 'Effect 1', 'Effects 2': 'Effect 2', 'Arg/Gate': 'Arp/Gate', 'Amp Envelope': 'Amp Env', 'Amplifier Envelope': 'Amp Env', 'Modulation Envelope': 'Mod Env', 'Mod Envelope': 'Mod Env', Osx: 'Osc', Samp: 'Sample', Vib: 'Vibrato', 'Rotary Speaker': 'Rotary', Arpeggio: 'Arp', Oscillator: 'Osc' };
export const groupOfName = (name) => {
  // (`Drawbar1`, `LFO1/Arp On/Off`: a number or a slash straight after the prefix.)
  const prefix = PREFIXES.find((p) => name === p || (name.startsWith(p) && /^[ /\d]/.test(name.slice(p.length))));
  return prefix ? SAME[prefix] ?? prefix : 'Global';
};

/** A row's number column -> the messages it names: [{ kind, controller } | { kind, msb, lsb }], or a reason it is left out. */
export function messagesOf(value, name) {
  let m;
  if ((m = /^(\d{1,3})$/.exec(value)) && Number(m[1]) <= 127) return { messages: [{ kind: 'cc', controller: Number(m[1]) }], names: [name] };
  if ((m = /^(\d{1,3}):(\d{1,3})$/.exec(value))) return { messages: [{ kind: 'nrpn', msb: Number(m[1]), lsb: Number(m[2]) }], names: [name] };
  if ((m = /^(\d{1,3}):(\d{1,3})-(\d{1,3})$/.exec(value))) {
    const [msb, from, to] = m.slice(1).map(Number);
    // (`Piano Type/Model/Variation  2:32-34`: a name for each, the first's words before its last its section.)
    const parts = name.split('/');
    if (parts.length !== to - from + 1) return { reason: `${to - from + 1} NRPNs (${value}) under one name` };
    const section = parts[0].split(' ').slice(0, -1).join(' ');
    return { messages: parts.map((p, k) => ({ kind: 'nrpn', msb, lsb: from + k })), names: parts.map((p, k) => (k ? `${section} ${p}`.trim() : p)) };
  }
  if (/^\d+, \d+$/.test(value)) return { reason: `two controllers (${value}), the list not saying which does what` };
  if (/^\d+-\d+$/.test(value)) return { reason: `a run of controllers (${value})` };
  if (/x/.test(value)) return { reason: `an NRPN with its value bytes (${value}), not explained` };
  return { reason: `not a controller or NRPN (${value})` };
}

/** `(0 = Slow, 64 = Stop. 127 = Fast)` at the end of a name -> [{ value, label }], or null. */
export function valuesInName(name) {
  const inner = /\(([^()]*=[^()]*)\)\s*$/.exec(name)?.[1];
  if (!inner) return null;
  const items = [...inner.matchAll(/(\d+)\s*=\s*([A-Za-z][\w ]*?)\s*(?=[,.]\s*\d|$)/g)].map((m) => ({ value: Number(m[1]), label: m[2] }));
  return items.length >= 2 ? items : null;
}

export function buildNordProfile(data, layout) {
  const notes = [];
  const left = [];
  const unread = [];
  const renamed = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const recipes = new Map();
  const parameters = [];
  const variables = { channel: 1, ...(layout.variables ?? {}) };
  // The manuals of an organ: { Upper: 'channel', Lower: 'lowerChannel', … }; one, `channel`, otherwise.
  const manuals = layout.manuals ?? null;
  const fixes = layout.fix ?? {};

  // Names printed twice: told apart by the heading over them (`Drawbars - Preset 1/Lower`), or by the number.
  const count = new Map();
  for (const r of data.rows) count.set(r.name, (count.get(r.name) ?? 0) + 1);

  for (const r of data.rows) {
    const star = /\s*\*$/.test(r.name);
    let name = r.name.replace(/\s*\*$/, '');
    if (fixes[r.name]) { renamed.push(`${r.name} (printed) as ${fixes[r.name]}`); name = fixes[r.name]; }
    if (PERFORMANCE.test(name) || layout.leaveOut?.includes(r.name)) { left.push(`${r.value} ${r.name}`); continue; }
    const read = messagesOf(r.value, name);
    if (read.reason) { unread.push(`${r.name} (${read.reason})`); continue; }
    if (count.get(r.name) > 1 && read.names.length === 1) {
      const part = r.heading ? r.heading.split(' - ').at(-1) : null;
      read.names = [`${name} (${part ?? (read.messages[0].kind === 'cc' ? `CC ${read.messages[0].controller}` : `NRPN ${r.value}`)})`];
    }
    const values = valuesInName(name);
    // Each manual the row is on (an organ's), or the one channel.
    const on = manuals ? (layout.manualsOf?.(r, star) ?? [Object.keys(manuals)[0]]) : [null];
    for (const manual of on) {
      const variable = manual ? manuals[manual] : 'channel';
      read.messages.forEach((msg, k) => {
        const label = read.names[k].replace(/\s*\(([^()]*=[^()]*)\)\s*$/, '').replace(/\s+/g, ' ').trim();
        const suffix = variable === 'channel' ? '' : capital(variable.replace(/Channel$/, ''));
        const recipe = msg.kind === 'cc'
          ? { id: `cc${msg.controller}${suffix}`, kind: 'cc', channel: `$${variable}`, controller: msg.controller, value: '$encodedValue' }
          : { id: `nrpn${hex(msg.msb)}${hex(msg.lsb)}${suffix}`, kind: 'nrpn', channel: `$${variable}`, parameterMsb: msg.msb, parameterLsb: msg.lsb, valueResolution: 14, value: '$encodedValue' };
        recipes.set(recipe.id, recipe);
        // The group: the manual, on an organ's rows that are on more than the first; the heading
        // (the Lead 3's sections); the layout's; how the name begins.
        const heading = r.heading && layout.headingsAreGroups ? r.heading.replace(/\s+parameters$/i, '').replace(/^(.)/, (c) => c.toUpperCase()) : null;
        const group = (manual && (on.length > 1 || manual !== Object.keys(manuals)[0]) ? manual : null) ?? heading ?? layout.groupOf?.(label) ?? groupOfName(label);
        const describe = [];
        if (msg.kind === 'nrpn') describe.push(`NRPN ${msg.msb}:${msg.lsb}: CC 99 = ${msg.msb}, CC 98 = ${msg.lsb}, the value on CC 38 (data entry LSB) with CC 6 at 0, as the manual says.`);
        if (manual) describe.push(`On the ${manual} manual's channel.`);
        if (r.extra && !layout.extraIsChannels && !/^(?:Undefined|-)$/.test(r.extra)) describe.push(`Printed beside it: ${r.extra}.`);
        if (read.names[k] !== label) describe.push(`Printed: ${read.names[k]}.`);
        const base = {
          id: unique(`${camel(group)}.${camel(label)}`),
          name: label,
          group,
          // Where the manual prints it: the page of its row in the list (for each manual it is on).
          ...(r.page ? { source: { page: r.page } } : {}),
          ...(describe.length ? { description: describe.join(' ') } : {}),
          access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
          messageRecipe: recipe.id,
        };
        const encoding = { type: msg.kind === 'nrpn' ? 'u14' : 'u7' };
        if (values) {
          const choices = values.map(({ value, label: l }) => ({ id: camel(l), label: l, value }));
          parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(label) }, normalization: { mode: 'choiceIndex' }, encoding, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : 'RadioButtonGroup' } });
        } else {
          parameters.push({
            ...base,
            type: 'integer',
            range: { min: 0, max: 127 },
            default: 0,
            display: { mode: 'number', unit: '', shortLabel: camel(label) },
            normalization: { mode: 'linear' },
            encoding,
            sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true },
            ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Amount|Amt|Volume|Freq|Resonance|Mix|Drawbar|Dry\/Wet|Gain/i.test(label) ? 'Slider' : 'Knob' },
          });
        }
      });
    }
  }

  // A message two laid-out rows share (the Electro 7's NRPN 3:20, the Wave 2's CC 94).
  const byRecipe = new Map();
  for (const p of parameters) byRecipe.set(p.messageRecipe, [...(byRecipe.get(p.messageRecipe) ?? []), p]);
  const label = (r) => (r.kind === 'cc' ? `CC ${r.controller}` : `NRPN ${r.parameterMsb}:${r.parameterLsb}`) + (r.channel === '$channel' ? '' : ` (${r.channel.slice(1)})`);
  const shared = [...byRecipe].filter(([, ps]) => ps.length > 1).map(([id, ps]) => `${label(recipes.get(id))}: ${ps.map((p) => p.name).join(', ')}`);
  if (shared.length) notes.push(`Messages the list gives to two rows, both laid out: ${shared.join('; ')}. CEditor sends either, and follows neither when the instrument sends it.`);
  if (renamed.length) notes.push(`Names corrected by the layout: ${renamed.join(', ')}.`);
  if (unread.length) notes.push(`Rows left out, their number column not one message the builder can send: ${unread.join('; ')}.`);
  if (left.length) notes.push(`Left out, the pedals, the wheel and bank select: ${left.join(', ')}.`);

  const tests = [];
  const firstNrpn = parameters.find((p) => recipes.get(p.messageRecipe).kind === 'nrpn');
  const picks = [...new Set([parameters[0], firstNrpn, parameters.at(-1), ...(layout.tests ?? []).map((n) => parameters.find((p) => p.name === n))].filter(Boolean))];
  for (const p of picks) {
    const r = recipes.get(p.messageRecipe);
    const status = 0xb0 + variables[r.channel.slice(1)] - 1;
    const value = p.type === 'choice' ? p.choices.at(-1).id : 100;
    const wire = p.type === 'choice' ? p.choices.at(-1).value : 100;
    const expectedHex = r.kind === 'cc'
      ? [status, r.controller, wire].map(hex).join(' ')
      : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, wire >> 7], [0x26, wire & 127]].map(([c, v]) => [status, c, v].map(hex).join(' ')).join('\n');
    tests.push({ name: `${p.group} ${p.name} = ${value} (${label(r)})`, parameter: p.id, value, expectedHex });
  }

  const doc = data.sources[0];
  const nrpns = [...recipes.values()].some((r) => r.kind === 'nrpn');
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Nord',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `MIDI controller list (page${layout.pages.length > 1 ? 's' : ''} ${layout.pages.join(', ')} of the PDF) read by tools/profiles/nord/read-nord-cc.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/nord/make-profiles.mjs; edit the layout in tools/profiles/nord/synths/, not this file.',
      `Every parameter is a row of the manual's MIDI controller list, with its printed name, sent as the control change${nrpns ? ' or NRPN' : ''} it prints${manuals ? ' on the channel of each manual it is on' : ' on the channel variable'}. Nothing here has been sent to a real instrument yet.`,
      'The list prints controller numbers only: every value is 0 - 127, and a setting chosen from a list (a model, a waveform, an effect type) is a number here, not a choice.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-manual\'s-MIDI-controller-list',
      realtimeEditing: 'complete-for-the-manual\'s-MIDI-controller-list',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these same messages when its panel is used, where its MIDI settings allow',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'cc' ? -1 : 1) || a.channel.localeCompare(b.channel) || (a.controller ?? 0) - (b.controller ?? 0) || (a.parameterMsb ?? 0) - (b.parameterMsb ?? 0) || (a.parameterLsb ?? 0) - (b.parameterLsb ?? 0)),
    parameters,
    tests,
  };
}

export { stringifyProfile };
