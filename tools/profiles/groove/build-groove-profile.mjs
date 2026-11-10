// build-groove-profile.mjs — the 3rd Wave's transcription (tables/<name>.json) and its layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the spec:
//   - a row is its NRPN (MSB = number / 128, LSB = number % 128), the value 14 bits on data entry,
//     MSB on CC 6 and LSB on CC 38, as the spec's "Transmitted NRPN messages" prints them;
//   - its range as printed; the values its description lists (`0: velocity off`, `0=last`, `0 =
//     exponential`) a choice where they cover the range one value each; `-127 to 127` in a
//     description whose range is that many values wide, the range shown so;
//   - a mod slot's source and destination, and the pitch wheel's, a choice of the spec's lists;
//   - a Multi parameter is the parts being edited (NRPN 0, a bitmap of the four), laid out once;
//   - left out, and named: the program name's 32 characters, the deprecated rows, the bit-packed
//     ones (`See descrip`: the oscillators' wavetables, the song parts) and the one not settable.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

/** `0: velocity off`, `0=last`, `0 = exponential,`, `0: 0000: no parts enabled` -> [{ value, label }]. */
export function valuesIn(text) {
  return [...String(text).matchAll(/(?:^|\|\s*|\(|,\s*)(-?\d+)\s*[:=]\s*([^|]+?)\s*(?=\||,\s*-?\d+\s*[:=]|\)\s*$|$)/g)]
    .map((m) => ({ value: Number(m[1]), label: m[2].replace(/[,.\s]+$/, '').trim() }))
    .filter((v) => v.label && !/^-?\d+(?:\s+to\s+-?\d+)?$/.test(v.label));
}

export const groupOfName = (name) => [
  [/^Arp/i, 'Arpeggiator'], [/^LFO ?#?(\d)/i, (m) => `LFO ${m[1]}`], [/^Osc(?:illator)? ?#?(\d)/i, (m) => `Oscillator ${m[1]}`], [/^Wave (?:env|surfer)/i, 'Wave Envelope'],
  [/^(?:LPF|SVF|Filter)/i, 'Filter'], [/^Amp/i, 'Amp'], [/^Envelope ?#?(\d)/i, (m) => `Envelope ${m[1]}`], [/^Env/i, 'Envelopes'], [/^Effects? ?#?(\d)/i, (m) => `Effect ${m[1]}`],
  [/^Mod ?#?\d|^Mod (?:wheel|slot)/i, 'Mod Matrix'], [/^(?:Keyboard velocity|Pressure|Footswitch|Pitch wheel|Pitch bend)/i, 'Controllers'], [/^Unison/i, 'Unison'], [/^Glide/i, 'Glide'],
  [/^Seq/i, 'Sequencer'], [/^MIDI|^MPE/i, 'MIDI'], [/^(?:Keyboard split|Parts? |Count keyboard)/i, 'Parts'], [/^Metronome/i, 'Metronome'], [/^(?:Desktop|8M)/i, 'Panel'],
].reduce((found, [re, g]) => found ?? (re.test(name) ? (typeof g === 'function' ? g(re.exec(name)) : g) : null), null) ?? 'Global';

export function buildGrooveProfile(data, layout) {
  const notes = [];
  const left = { name: [], deprecated: [], packed: [], unsettable: [] };
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const recipes = new Map();
  const parameters = [];
  const lists = { source: data.lists['Mod Source values'], destination: data.lists['Mod destination values'] };
  const widened = [];
  for (const r of data.nrpn) {
    const lines = r.description.split(' | ');
    const title = lines[0];
    if (r.category === 'Not') { left.unsettable.push(`${r.nrpn}`); continue; }
    if (/^Program name character/.test(title)) { left.name.push(r.nrpn); continue; }
    // (The spec writes the marker in capitals: `replaces deprecated nrpn 75` is the row that replaces one.)
    if (/DEPRECATED/.test(r.description)) { left.deprecated.push(`${r.nrpn} ${title.replace(/\s*[-(]\s*DEPRECATED.*$/i, '')}`); continue; }
    const range = /^(-?\d+)\s*-\s*(-?\d+)\b/.exec(r.range);
    if (!range) { left.packed.push(`${r.nrpn} ${title.replace(/[:\s-]+$/, '').replace(/\s+-\s+0[0-9a-z ]+$/, '')}`); continue; }
    let [lo, hi] = [Number(range[1]), Number(range[2])];
    // The name: the title, its lines up to the first value joined, cut where it turns to explaining
    // (`Parts enabled, keyboard section 1, bitmap of parts that are enabled …`).
    const prose = lines.slice(0, Math.max(1, lines.findIndex((l) => /^-?\d+\s*[:=]/.test(l)))).join(' ');
    const name = layout.names?.[r.nrpn] ?? prose.split(/:\s|\.\s|, bitmap| - bitmap| \(|,? [-+]?\d+ to [-+]?\d+|, (?:the|gain|set|active|amount) /)[0].replace(/[:,.\s]+$/, '');
    const msb = r.nrpn >> 7;
    const lsb = r.nrpn & 127;
    const recipe = { id: `nrpn${hex(msb)}${hex(lsb)}`, kind: 'nrpn', channel: '$channel', parameterMsb: msb, parameterLsb: lsb, valueResolution: 14, value: '$encodedValue' };
    recipes.set(recipe.id, recipe);
    const group = layout.groupOf?.(name) ?? groupOfName(name);
    const describe = [`NRPN ${r.nrpn} (${r.category === 'Multi' ? 'the parts being edited, NRPN 0' : r.category}): ${r.description.replace(/ \| /g, '; ')}${/\d/.test(r.range) ? ` [${r.range}]` : ''}.`];
    // The values: the spec's mod source and destination lists, or the description's own.
    let values = /\bsource\b/i.test(title) && /^Mod/i.test(title) ? lists.source : /\bdestination\b/i.test(title) ? lists.destination : valuesIn([r.range.replace(/^-?\d+\s*-\s*-?\d+\s*/, ''), ...lines.slice(1), title.includes(':') ? '' : ''].join(' | '));
    if (values === lists.source && lists.source.at(-1).value > hi) { widened.push(`${r.nrpn}`); hi = lists.source.at(-1).value; }
    const covers = values.length && values.length === hi - lo + 1 && values.every((v, k) => v.value === lo + k);
    const base = { id: unique(`${camel(group)}.${camel(name)}`), name, group, description: describe.join(' '), access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: recipe.id };
    if (covers) {
      const seen = new Set();
      const choices = values.map(({ value, label }) => { let id = camel(label) || `v${value}`; if (seen.has(id)) id = `${id}${value}`; seen.add(id); return { id, label, value }; });
      parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u14' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : choices.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
      continue;
    }
    // `LPF envelope amount, -127 to 127` over 0 - 254: the range shown so.
    const signed = [...r.description.matchAll(/(-\d+) to \+?(-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]).find(([a, b]) => b - a === hi - lo);
    parameters.push({
      ...base,
      type: 'integer',
      range: { min: lo, max: hi },
      default: signed ? lo - signed[0] : lo,
      display: { mode: 'number', unit: '', shortLabel: camel(name), ...(signed ? { min: signed[0], max: signed[1] } : {}) },
      normalization: { mode: 'linear' },
      encoding: { type: 'u14' },
      sendPolicy: hi - lo > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
      ui: { preferredComponent: /level|attack|decay|sustain|release|amount|cutoff|resonance|volume|depth/i.test(name) ? 'Slider' : 'Knob' },
    });
  }
  if (widened.length) notes.push(`The mod slots' sources (NRPN ${widened[0]} - ${widened.at(-1)}) print a range of 0 - 26 and the spec's list of mod sources has 30 (to MIDI Breath Control, 29): laid out as the list.`);
  if (left.name.length) notes.push(`Left out, the program name, a character an NRPN: NRPN ${left.name[0]} - ${left.name.at(-1)}.`);
  if (left.deprecated.length) notes.push(`Left out, rows the spec marks deprecated: ${left.deprecated.join(', ')}.`);
  if (left.packed.length) notes.push(`Left out, rows whose value packs two fields (\`See descrip\`): ${left.packed.join(', ')}.`);
  if (left.unsettable.length) notes.push(`Left out, NRPN ${left.unsettable.join(', ')}: not settable, used internally for saving presets via SysEx.`);

  const variables = { channel: 1 };
  const status = 0xb0;
  const picks = [...new Set([parameters[0], parameters.find((p) => p.type === 'choice' && p.choices.length > 20), parameters.find((p) => p.display.min < 0), parameters.at(-1)].filter(Boolean))];
  const tests = picks.map((p) => {
    const r = recipes.get(p.messageRecipe);
    const value = p.type === 'choice' ? p.choices.at(-1).id : p.range.max;
    const wire = p.type === 'choice' ? p.choices.at(-1).value : p.range.max;
    return { name: `${p.group} ${p.name} = ${value} (NRPN ${r.parameterMsb * 128 + r.parameterLsb})`, parameter: p.id, value, expectedHex: [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, wire >> 7], [0x26, wire & 127]].map(([c, v]) => [status, c, v].map(hex).join(' ')).join('\n') };
  });
  const doc = data.sources[0];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Groove Synthesis',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `NRPN parameters and the lists after them (PDF pages ${layout.pages[0]} - ${layout.pages.at(-1)}) read by tools/profiles/groove/read-groove-spec.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/groove/make-profiles.mjs; edit the layout in tools/profiles/groove/synths/, not this file.',
      'Every parameter is a row of the spec\'s NRPN table, sent as that NRPN with a 14-bit value (CC 99, CC 98, CC 6, CC 38). The instrument\'s MIDI param receive must include NRPN. Nothing here has been sent to a real instrument yet.',
      'A Multi parameter has a value for each of a program\'s four parts; it is sent to the parts NRPN 0 (Edit part, a bitmap: 1 part 1, 2 part 2, 3 both …) selects, so set that first. With the global setting MIDI include part in NRPN on, part 2\'s are 1000 higher, part 3\'s 2000 and part 4\'s 3000; this profile does not lay those out.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-spec\'s-NRPN-table',
      realtimeEditing: 'complete-for-the-spec\'s-NRPN-table',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these NRPNs when its MIDI param send includes NRPN',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.parameterMsb - b.parameterMsb || a.parameterLsb - b.parameterLsb),
    parameters,
    tests,
  };
}

export { stringifyProfile };
