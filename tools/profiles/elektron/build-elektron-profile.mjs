// build-elektron-profile.mjs — an Elektron transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the appendix's own columns:
//   - every row with a CC MSB is a parameter on that controller, and one with a CC LSB as well is a
//     14-bit pair (0 - 16383, the MSB sent first); a row with an NRPN and no CC is that NRPN, its
//     value 7 bits on data entry (CC 6); a row with neither is not a parameter;
//   - a value is what the controller carries (0 - 127, or the pair's 0 - 16383): the appendix prints
//     no ranges, and what a value shows is said in the parameter's chapter, in words. Where the
//     appendix names values (the Analog Heat's `0=CB, 1=SA …`), it is a choice of them;
//   - a parameter's channel is the track's (the `channel` variable), or, for the tables the layout
//     names, the FX, performance, CV or MIDI track channel the instrument's MIDI settings assign;
//   - the Analog Keys' CC and NRPN tables (`OSC 1 CC`, `OSC 1 NRPN`) are one table, merged by name;
//   - a row whose table repeats another's controllers to say what they set for one machine (the
//     Analog Rytm's `BD PLASTIC`) is not a parameter: it describes that parameter;
//   - a row on the same controller and channel as one before it (`Chorus Send L/R`, the same as
//     `Chorus Send L`) is the same parameter, named in the notes;
//   - the wheels, pedals and breath controller are left out, by name.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const slug = (label) => String(label).toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';
const titleCase = (s) => String(s).toLowerCase().replace(/(^|[\s/(&-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bLfo(\d*)\b/g, 'LFO$1').replace(/\bFx\b/g, 'FX').replace(/\bCv\b/g, 'CV').replace(/\bEnvf\b/g, 'EnvF').replace(/\bCc\b/g, 'CC').replace(/\bOsc\b/g, 'Osc').replace(/\bVal\b/g, 'Val').replace(/\b(Eq|Vcf|Pst)\b/g, (m) => m.toUpperCase());
const PERFORMANCE = /^(Mod ?wheel|Modulation Wheel|Breath Control(?:ler)?|Sustain(?: Pedal)?|Sostenuto|Pitch ?Bend|Aftertouch)$/i;

/**
 * `0=CB, 1=SA, …`, `0=TRI, 1=SIN 2=SQR`, and the Octatrack's bands (`[0]=Unmuted, [1-127]=Muted`, a
 * band's first value sent) -> [{ value, label }] or null. Bands are a choice only where they cover 0 -
 * 127 (`[0]=C-1, 127=G9` names the ends of a range, not its values).
 */
export function readValueNames(text) {
  const items = [...String(text ?? '').matchAll(/(\[)?(\d+)(?:-(\d+))?\]?\s*=\s*([^,=[\]]+?)\s*(?=,|\s+\[?\d+\]?\s*=|$)/g)]
    .map((m) => ({ value: Number(m[2]), to: Number(m[3] ?? m[2]), band: !!m[1], label: m[4].trim().replace(/\)$/, '') }));
  if (items.length < 2 || new Set(items.map((o) => o.value)).size !== items.length) return null;
  if (items.some((i) => i.band)) {
    const sorted = [...items].sort((a, b) => a.value - b.value);
    if (sorted[0].value !== 0 || sorted.at(-1).to !== 127 || sorted.some((x, k) => k && x.value !== sorted[k - 1].to + 1)) return null;
  }
  return items.map(({ value, label }) => ({ value, label }));
}

export function buildElektronProfile(data, layout) {
  const notes = [];
  const skipped = new Map();
  const skip = (why, what) => { const list = skipped.get(why) ?? []; if (!list.includes(what)) skipped.set(why, [...list, what]); };
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const sectionName = (s) => titleCase(String(s).replace(/^[A-Z]\.\d+\s+/, '').replace(/\s+PARAMETERS$/i, '')) || 'Sound';

  // The Analog Keys' split tables, one table each: the CC table's controller, the NRPN table's number.
  const base = (title) => String(title).replace(/\s+(?:CC|NRPN|NPRN)$/, '');
  const merged = [];
  const corrected = [];
  for (const printed of data.rows) {
    // A row the appendix prints wrongly, corrected by the layout (and named in the notes).
    const fix = typeof layout.fix === 'function' ? layout.fix(printed) : layout.fix?.[`${printed.table} ${printed.name}`];
    const r = fix ? { ...printed, ...fix } : printed;
    if (fix) corrected.push(`${printed.table} ${printed.name} (${Object.entries(fix).map(([k, v]) => `${k} ${v}, printed ${printed[k] ?? 'none'}`).join('; ')})`);
    // A parameter's CC and its NRPN in separate tables (the Analog Keys' `OSC 1 CC` and `OSC 1 NRPN`,
    // the Tonverk's CC table and its NRPN table for audio tracks): one parameter, where the second
    // row brings what the first lacks and contradicts nothing.
    const key = `${base(r.table)}\u0000${r.name}`;
    // (A row that prints neither, a dash in the CC table for a parameter the NRPN table has, is part of it.)
    const empty = (x) => x.cc === undefined && x.nrpn === undefined;
    const into = merged.find((m) => m.key === key && (r.cc === undefined || m.cc === undefined) && (r.nrpn === undefined || m.nrpn === undefined) && (empty(r) ? !empty(m) : empty(m) || (r.cc !== undefined ? m.nrpn !== undefined : m.cc !== undefined)));
    // (Each keeps the page it is printed on: the parameter's source is the row it is sent as.)
    if (into) { for (const k of ['cc', 'ccLsb', 'nrpn', 'values']) if (r[k] !== undefined && into[k] === undefined) { into[k] = r[k]; into.pageOf = { ...into.pageOf, [k]: r.page }; } continue; }
    merged.push({ ...r, table: base(r.table), key });
  }

  // A group is its table's title; a title printed under more than one section is named by both (the
  // Analog Four's `LFO1` of the synth, FX and CV tracks: `FX Track LFO1`). The layout names a table
  // its manual mistitles (the Digitakt II's Euclidean and FX tables, printed `AMP`).
  const sectionsOf = new Map();
  for (const r of merged) sectionsOf.set(r.table, new Set([...(sectionsOf.get(r.table) ?? []), r.section]));
  const groupOf = (r) => {
    if (typeof layout.groupOf === 'function') { const g = layout.groupOf(r); if (g) return g; }
    const named = layout.groups?.[`${r.section} / ${r.table}`];
    if (named) return named;
    // No title (the Analog Heat's one table): the block its name begins with (`VCF Mode`, `DELAY Time`).
    if (!r.table) return /^([A-Z][A-Z0-9]+)\s/.exec(r.name)?.[1].replace(/^(.*)$/, (m) => titleCase(m)) ?? (r.section ? sectionName(r.section) : 'Sound');
    const title = titleCase(r.table).replace(/\s+Parameters$/, '');
    if (sectionsOf.get(r.table).size < 2 || sectionName(r.section) === title) return title;
    return `${sectionName(r.section)} ${title}`;
  };
  const channelOf = (r) => {
    for (const [rule, variable] of layout.channels ?? []) if (typeof rule === 'function' ? rule(r) : rule.test(`${r.section} / ${r.table} / ${r.name}`)) return variable;
    return 'channel';
  };

  // A table that says what another's controllers set for one machine.
  const meanings = new Map();   // `${channel} ${cc}` -> ['BD PLASTIC: Level', …]
  const isMeaning = (r) => layout.meanings && layout.meanings.test(r.section);
  for (const r of merged.filter(isMeaning)) {
    if (r.cc === undefined) continue;
    const k = `${channelOf(r)} ${r.cc}`;
    meanings.set(k, [...(meanings.get(k) ?? []), `${r.table}: ${r.name}`]);
  }

  const recipes = new Map();
  const parameters = [];
  const seen = new Map();   // `${channel} ${signature}` -> name
  const shared = [];
  for (const r of merged) {
    const label = `${r.table ? `${r.table} ` : ''}${r.name}`;
    if (isMeaning(r)) continue;
    if (PERFORMANCE.test(r.name)) { skip('the wheels, pedals and breath controller, which set nothing of the sound', label); continue; }
    if (r.rec === false) { skip('controllers the instrument sends and does not receive', label); continue; }
    if (layout.leaveOut) { const why = layout.leaveOut(r); if (why) { skip(why, label); continue; } }
    const channel = channelOf(r);
    let recipe;
    if (r.cc !== undefined) {
      recipe = { id: `${channel === 'channel' ? '' : `${channel}.`}cc${r.cc}${r.ccLsb !== undefined ? `_${r.ccLsb}` : ''}`, kind: 'cc', channel: `$${channel}`, controller: r.cc, ...(r.ccLsb !== undefined ? { lsbController: r.ccLsb } : {}), value: '$encodedValue' };
    } else if (r.nrpn) {
      recipe = { id: `${channel === 'channel' ? '' : `${channel}.`}nrpn${r.nrpn[0]}_${r.nrpn[1]}`, kind: 'nrpn', channel: `$${channel}`, parameterMsb: r.nrpn[0], parameterLsb: r.nrpn[1], valueResolution: 7, value: '$encodedValue', nullAfterSend: false };
    } else { skip('rows that print neither a controller nor an NRPN', label); continue; }
    const signature = `${channel} ${recipe.id}`;
    if (seen.has(signature)) { shared.push(`${label} (the same as ${seen.get(signature)})`); continue; }
    seen.set(signature, label);
    recipes.set(recipe.id, recipe);
    const group = groupOf(r);
    const name = layout.names?.[label] ?? r.name;
    const describe = [];
    const pair = recipe.kind === 'cc' && recipe.lsbController !== undefined;
    if (pair) describe.push(`14 bits: the MSB on CC ${recipe.controller}, then the LSB on CC ${recipe.lsbController}.`);
    if (recipe.kind === 'nrpn') describe.push(`NRPN ${r.nrpn[0]}:${r.nrpn[1]} (MSB:LSB); the appendix prints no CC for it.`);
    if (r.msbRun) describe.push(`The first of NRPN MSB ${r.msbRun}, one each: the others are the same parameter at MSB ${r.nrpn[0] + 1} on.`);
    const meaning = recipe.kind === 'cc' ? meanings.get(`${channel} ${r.cc}`) : null;
    if (meaning) describe.push(`What it sets depends on the machine: ${meaning.join('; ')}.`);
    const values = readValueNames(r.values);
    if (r.values && !values) describe.push(`Printed: ${r.values}.`);
    // Where the appendix prints it: the page of its row (of the CC table's, or the NRPN table's, row
    // for a parameter merged from both, whichever gives the message it is sent as).
    const page = r.pageOf?.[recipe.kind] ?? r.page;
    const p = {
      id: unique(`${camel(group)}.${camel(name)}`),
      name,
      group,
      ...(page ? { source: { page } } : {}),
      ...(describe.length ? { description: describe.join(' ') } : {}),
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipe.id,
    };
    if (values && !pair) {
      const ids2 = new Set();
      const list = values.map(({ value, label: l }) => { const s = slug(l); const id = ids2.has(s) ? `${s}_${value}` : s; ids2.add(id); return { id, label: l, value }; });
      parameters.push({ ...p, type: 'choice', default: list[0].id, choices: list, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'enum' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
    } else {
      const max = pair ? 16383 : 127;
      parameters.push({ ...p, type: 'integer', range: { min: 0, max }, default: 0, display: { mode: 'number', unit: '', shortLabel: camel(name) }, normalization: { mode: 'linear' }, encoding: { type: pair ? 'u14-msb-lsb' : 'u7' }, sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true }, ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Volume|Send|Depth|Amount/i.test(name) ? 'Slider' : 'Knob' } });
    }
  }

  // Two parameters on one message: sent as printed, but not told apart when the instrument sends it.
  const byMessage = new Map();
  for (const p of parameters) {
    const r = recipes.get(p.messageRecipe);
    const k = `${r.channel} ${r.kind} ${r.kind === 'cc' ? r.controller : `${r.parameterMsb}:${r.parameterLsb}`}`;
    byMessage.set(k, [...(byMessage.get(k) ?? []), p]);
  }
  const clashes = [...byMessage].filter(([, ps]) => ps.length > 1).map(([k, ps]) => `${k.split(' ').slice(1).join(' ').replace(/^cc /, 'CC ').replace(/^nrpn /, 'NRPN ')} on the ${k.split(' ')[0].slice(1)} variable's channel: ${ps.map((x) => `${x.group} ${x.name}`).join(', ')}`);
  if (corrected.length) notes.push(`Rows the appendix prints wrongly, given by the layout: ${corrected.join(', ')}.`);
  if (shared.length) notes.push(`Printed twice on the same controller and channel, laid out once: ${shared.join(', ')}.`);
  if (clashes.length) notes.push(`The appendix gives one controller to more than one parameter; each is sent as printed, but when the instrument sends it CEditor follows neither: ${clashes.join('; ')}.`);
  for (const [why, list] of skipped) notes.push(`Left out, ${why}: ${list.join(', ')}.`);

  const variables = { channel: 1, ...(layout.variables ?? {}) };
  for (const [name, value] of Object.entries(variables)) if (name !== 'channel' && layout.unprinted?.includes(name)) notes.push(`The ${name} variable is ${value} here: the manual prints no default for it; set it to the instrument's ${layout.settingOf?.[name] ?? name} setting.`);
  if (parameters.some((p) => recipes.get(p.messageRecipe).kind === 'nrpn')) notes.push('An NRPN-only parameter is sent as its number (MSB on CC 99, LSB on CC 98) and a 7-bit value on data entry (CC 6), which the appendix does not spell out; not checked against the instrument.');

  const tests = [];
  const pairOf = (wanted) => parameters.find((p) => { const r = recipes.get(p.messageRecipe); return r.kind === 'cc' && p.type !== 'choice' && (r.lsbController !== undefined) === wanted; });
  const ofKind = (kind) => parameters.find((p) => recipes.get(p.messageRecipe).kind === kind);
  const choiceOf = parameters.find((p) => p.type === 'choice');
  for (const p of [...new Set([pairOf(true), pairOf(false), ofKind('nrpn'), choiceOf].filter(Boolean))]) {
    const r = recipes.get(p.messageRecipe);
    const ch = variables[r.channel.slice(1)];
    const status = 0xb0 + ch - 1;
    const choice = p.type === 'choice' ? p.choices.at(-1) : null;
    const value = choice ? choice.value : Math.min(p.range.max, p.range.max > 127 ? 1000 : 100);
    const bytes = r.kind === 'cc'
      ? (r.lsbController !== undefined ? [[r.controller, value >> 7], [r.lsbController, value & 127]] : [[r.controller, value]])
      : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, value]];
    tests.push({ name: `${p.group}: ${p.name} = ${choice ? choice.label : value} (${r.kind === 'cc' ? `CC ${r.controller}` : `NRPN ${r.parameterMsb}:${r.parameterLsb}`}, channel ${ch})`, parameter: p.id, value: choice ? choice.id : value, expectedHex: bytes.map(([cc, v]) => [status, cc, v].map(hex).join(' ')).join('\n') });
  }

  const doc = data.sources[0];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Elektron',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `MIDI appendix read by tools/profiles/elektron/read-elektron-midi.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/elektron/make-profiles.mjs; edit the layout in tools/profiles/elektron/synths/, not this file.',
      'Every parameter is a row of the manual\'s MIDI appendix, with its printed name, sent on the CC it prints (a 14-bit pair where it prints an LSB), or its NRPN where it prints no CC. Nothing here has been sent to a real instrument yet.',
      'The appendix prints no ranges: each parameter takes what its controller carries, 0 - 127 (0 - 16383 for a pair). What a value shows, and the values of a setting chosen from a list, are in the parameter\'s chapter of the manual.',
      `The channel variable is a track's channel (track 1's by default): the parameters go to that track. Set it to the AUTO channel to edit whichever track is active.`,
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-manual\'s-midi-appendix',
      realtimeEditing: 'complete-for-the-manual\'s-midi-appendix',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these same controllers (or NRPNs, as its PARAM OUTPUT setting says) when its knobs are turned',
      verifiedOnHardware: false,
      ...(layout.coverage ?? {}),
    },
    timing: { minDelayBetweenMessagesMs: layout.delayMs ?? 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.channel.localeCompare(b.channel) || a.kind.localeCompare(b.kind) || (a.controller ?? a.parameterMsb * 128 + a.parameterLsb) - (b.controller ?? b.parameterMsb * 128 + b.parameterLsb) || a.id.localeCompare(b.id)),
    parameters,
    tests,
  };
}

export { stringifyProfile };
