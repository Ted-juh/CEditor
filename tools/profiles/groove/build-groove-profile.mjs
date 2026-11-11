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
//     ones (`See descrip`: the oscillators' wavetables, the song parts) and the one not settable;
//   - read back (Pull) from the spec's edit buffer data, the reply to its edit buffer request: every
//     NRPN of the program as a record of four bytes (the number's MSB and LSB, the value's), NRPN 0
//     set to each part before that part's Multi settings. A Multi parameter reads part 1's.

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
  const nrpnOf = new Map();
  const multi = new Set();
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
    nrpnOf.set(base.id, r.nrpn);
    if (r.category === 'Multi') multi.add(base.id);
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
  if (layout.editBuffer) notes.push('Pull asks for the program being edited (the edit buffer request, F0 00 02 4A id 06 F7) and reads the reply (Edit buffer data, id 03), every setting in it as its NRPN and value. id is the variable productId: 1 for the 24K and 24M, 2 for the 8M; the instrument takes either in a request and answers with its own. A saved program is read the same way: the program data request (F0 00 02 4A id 05 bank program F7) asks for the one the variables bank (0 - 4) and program (0 - 99) name, and its reply carries the same records after them. A Multi parameter reads part 1\'s value; Edit part (NRPN 0) and the rows left out above are not read.');

  // Pull: the edit buffer, read by NRPN. NRPN 0 itself is not read back: the dump sets it once for
  // each part, so what it last holds is not a setting of the program.
  const bus = layout.editBuffer;
  const variables = { channel: 1, ...(bus ? { productId: 1, bank: 0, program: 0 } : {}) };
  const sysex = (...tail) => ['F0', '00', '02', '4A', '$productId', ...tail];
  const mappings = bus ? parameters.filter((p) => nrpnOf.get(p.id) !== 0).map((p) => ({ parameter: p.id, record: nrpnOf.get(p.id), ...(multi.has(p.id) ? { scope: { record: 0, value: 1 } } : {}) })) : [];
  for (const m of mappings) parameters.find((p) => p.id === m.parameter).access.canRead = true;
  const status = 0xb0;
  const picks = [...new Set([parameters[0], parameters.find((p) => p.type === 'choice' && p.choices.length > 20), parameters.find((p) => p.display.min < 0), parameters.at(-1)].filter(Boolean))];
  const tests = picks.map((p) => {
    const r = recipes.get(p.messageRecipe);
    const value = p.type === 'choice' ? p.choices.at(-1).id : p.range.max;
    const wire = p.type === 'choice' ? p.choices.at(-1).value : p.range.max;
    return { name: `${p.group} ${p.name} = ${value} (NRPN ${r.parameterMsb * 128 + r.parameterLsb})`, parameter: p.id, value, expectedHex: [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, wire >> 7], [0x26, wire & 127]].map(([c, v]) => [status, c, v].map(hex).join(' ')).join('\n') };
  });
  if (bus) {
    // A dump made by hand: part 1, then part 2 with other values, which part 1's reading must not
    // take; a Single parameter, a choice, and a record no parameter reads (NRPN 444).
    const single = parameters.find((p) => !multi.has(p.id) && p.type === 'integer' && p.range.max > 127 && nrpnOf.get(p.id) !== 0);
    const multis = parameters.filter((p) => multi.has(p.id) && p.type === 'integer' && p.range.max >= 127);
    const choice = parameters.find((p) => multi.has(p.id) && p.type === 'choice' && p.choices.length > 3);
    const [a, b] = multis;
    const record = (n, v) => [n >> 7, n & 127, v >> 7, v & 127];
    const valueOf = (p, k) => (p.type === 'choice' ? p.choices[k].value : Math.min(p.range.max, p.range.min + 100 + k));
    const body = [record(0, 1), record(nrpnOf.get(single.id), valueOf(single, 200)), record(nrpnOf.get(a.id), valueOf(a, 0)), record(nrpnOf.get(choice.id), valueOf(choice, 2)), record(444, 5), record(nrpnOf.get(b.id), valueOf(b, 1)),
      record(0, 2), record(nrpnOf.get(a.id), valueOf(a, 7)), record(nrpnOf.get(choice.id), valueOf(choice, 3)), record(nrpnOf.get(b.id), valueOf(b, 9))].flat();
    const expectedValues = { [single.id]: valueOf(single, 200), [a.id]: valueOf(a, 0), [b.id]: valueOf(b, 1), [choice.id]: choice.choices[2].id };
    tests.push({ name: 'Edit buffer program data request', kind: 'request', request: 'requestEditBuffer', expectedHex: sysex('06', 'F7').map((t) => (t === '$productId' ? '01' : t)).join(' ') });
    tests.push({ name: 'Edit buffer data, read back: part 1\'s Multi values, not part 2\'s', kind: 'dumpParse', inputHex: [...sysex('03').map((t) => (t === '$productId' ? 1 : parseInt(t, 16))), ...body, 0xf7].map(hex).join(' '), expectedValues });
    // A saved program: the same records after its bank and slot (bank 2, program 41 here).
    tests.push({ name: 'Program data request (the bank and program variables)', kind: 'request', request: 'requestProgram', expectedHex: sysex('05', '$bank', '$program', 'F7').map((t) => (t.startsWith('$') ? '00' : t)).map((t, k) => (k === 4 ? '01' : t)).join(' ') });
    tests.push({ name: 'Program data, read back: the records after its bank and slot', kind: 'dumpParse', inputHex: [...sysex('02').map((t) => (t === '$productId' ? 1 : parseInt(t, 16))), 2, 41, ...body, 0xf7].map(hex).join(' '), expectedValues });
  }
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
    sources: [{ type: 'manual', title: doc.title, notes: `NRPN parameters and the lists after them (PDF pages ${layout.pages[0]} - ${layout.pages.at(-1)}) read by tools/profiles/groove/read-groove-spec.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}.${bus ? ` The edit buffer request and its reply as its "Importing / Exporting Program Data via MIDI SysEx" prints them (PDF pages ${bus.pages[0]} - ${bus.pages.at(-1)}).` : ''} Not yet checked against the instrument itself.` }],
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
      editBufferDumpRequest: bus ? 'complete: Edit buffer program data request' : 'notImplemented',
      editBufferDumpParse: bus ? `partial: ${mappings.length} of the profile's ${parameters.length} parameters are read from the edit buffer data (all but Edit part), the Multi ones part 1's` : 'notImplemented',
      bankDump: bus ? 'partial: one saved program at a time, by the bank (0 - 4) and program (0 - 99) variables' : 'notImplemented',
      inboundControllers: 'the instrument sends these NRPNs when its MIDI param send includes NRPN',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.parameterMsb - b.parameterMsb || a.parameterLsb - b.parameterLsb),
    ...(bus ? {
      requests: [
        { id: 'requestEditBuffer', name: 'Edit buffer program data request', kind: 'sysex', template: sysex('06', 'F7'), response: { dump: 'editBufferData' }, timeoutMs: 4000, retries: 1 },
        // 05, with the program's sequence: the request every firmware answers (08, without it, is 1.8e's).
        { id: 'requestProgram', name: 'Program data request (the bank and program variables)', kind: 'sysex', template: sysex('05', '$bank', '$program', 'F7'), response: { dump: 'programData' }, timeoutMs: 4000, retries: 1 },
      ],
      dumpDefinitions: [{
        id: 'editBufferData',
        name: 'Edit buffer data',
        kind: 'sysex',
        matcher: { prefix: sysex('03'), suffix: ['F7'] },
        payload: { offset: 6, records: { size: 4, keyAt: 0, keyType: 'u14', valueAt: 2, valueType: 'u14' } },
        completion: { expectedMessages: 1 },
        mappings,
      }, {
        id: 'programData',
        name: 'Program data',
        kind: 'sysex',
        matcher: { prefix: sysex('02'), suffix: ['F7'] },
        // (The bank and slot it was saved in, then the same records.)
        payload: { offset: 8, records: { size: 4, keyAt: 0, keyType: 'u14', valueAt: 2, valueType: 'u14' } },
        completion: { expectedMessages: 1 },
        mappings,
      }],
    } : {}),
    parameters,
    tests,
  };
}

export { stringifyProfile };
