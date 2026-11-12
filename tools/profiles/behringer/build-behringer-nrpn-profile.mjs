// build-behringer-nrpn-profile.mjs — a Behringer manual's NRPN table whose rows are also the bytes of
// its program dump (the DeepMind 12's) and a layout -> a CEditor device profile that writes every
// parameter and reads the sound back.
//
// What it takes as settled, from each row:
//   - it is its NRPN, the value 14 bits on data entry (CC 6, then CC 38), as the manual's NRPN
//     sequence shows (`B0 63 aa 62 bb 06 cc 26 dd`);
//   - its value is the range printed; a list in its notes (`Sine (0), Triangle (1) …`) covering the
//     range is a choice; `-128 (0) to +127 (255)`, `20 bpm (0) to 275 bpm (255)`, `1 to 6 Octaves`
//     are shown on that scale;
//   - a run (`FX 1 Params`, LSB `39 - 50`) is a parameter for each NRPN in it;
//   - the program name (a run of ASCII bytes) is read back and not written;
//   - its 14-bit number is its byte in the program data, which the edit buffer dump carries packed
//     seven bytes in eight.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const slug = (label) => String(label).toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';
const runOf = (text) => { const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(text ?? '').trim()); return m ? [Number(m[1]), Number(m[2])] : [Number(text), Number(text)]; };

/** A row's notes -> { choices } (a list covering lo - hi), { display } (a scale), or {}. */
export function readNotes(notes, lo, hi) {
  const text = String(notes ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return {};
  // `Label (n), Label (n), …` (or `n (Label), …`), every value from lo to hi once.
  const pairs = [...text.matchAll(/([^,().]+?)\s*\(\s*(\d+)\s*\)/g)].map((m) => ({ value: Number(m[2]), label: m[1].replace(/^[\s,.]+/, '').trim() }));
  const reversed = [...text.matchAll(/(\d+)\s*\(\s*([^()]+?)\s*\)/g)].map((m) => ({ value: Number(m[1]), label: m[2].trim() }));
  const covers = (list) => list.length === hi - lo + 1 && list.every((p, k) => p.value === lo + k && p.label && !/^[+-]?\d+%?$/.test(p.label));
  if (covers(pairs)) return { choices: pairs };
  if (covers(reversed)) return { choices: reversed };
  // A scale: `-128 (0) to +127 (255)`, `-48 (80) ... 0 ( 128)`, `Bipolar step value -127 (1) to +127 (255)`.
  const ends = [...text.matchAll(/([+-]?\d+)\s*(?:%|bpm)?\s*\(\s*(\d+)\s*\)/g)].map((m) => ({ shown: Number(m[1]), value: Number(m[2]) }));
  if (ends.length >= 2 && ends[1].value !== ends[0].value) {
    const slope = (ends[1].shown - ends[0].shown) / (ends[1].value - ends[0].value);
    if (slope === 1) return { display: { min: ends[0].shown - (ends[0].value - lo), max: ends[0].shown + (hi - ends[0].value) } };
  }
  // `1 to 6 Octaves` for 0 - 5.
  const span = /^(\d+) to (\d+)\b/.exec(text);
  if (span && Number(span[2]) - Number(span[1]) === hi - lo) return { display: { min: Number(span[1]), max: Number(span[2]) } };
  return {};
}

export function buildBehringerNrpnProfile(data, layout) {
  const notes = [];
  const corrected = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const recipes = new Map();
  const parameters = [];
  const mappings = [];
  const byteCodec = { type: 'bitfields', parts: [{ at: 0, from: 0, bits: 8, shift: 0 }] };
  for (const printed of data.rows) {
    const [first] = runOf(printed.number);
    const fix = layout.fix?.[first];
    const r = fix ? { ...printed, ...fix } : printed;
    if (fix) corrected.push(`${first} (${layout.fixNotes?.[first] ?? JSON.stringify(fix)})`);
    const [n0, n1] = runOf(r.number);
    const [lsb0] = runOf(r.lsb);
    const msb = Number(r.msb);
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(String(r.range ?? '').trim());
    if (!range) throw new Error(`NRPN ${r.number} ${r.name}: range not read: ${r.range}`);
    const [lo, hi] = [Number(range[1]), Number(range[2])];
    const group = layout.groupOf(r.name);
    // Where the manual prints it: the page of its row (a run's, for each NRPN of the run).
    const source = printed.page ? { source: { page: printed.page } } : {};
    // The program name: ASCII bytes, read back only.
    if (/Program Name/.test(r.name)) {
      const length = n1 - n0;   // `16(+1) char`: the last is the terminating null
      const p = { id: unique('program.name'), name: 'Program Name', group, ...source, description: `${length} ASCII characters, NRPN ${msb}:${lsb0} on. Read from the edit buffer; not written, a character being an NRPN of its own.`, type: 'text', default: '', display: { mode: 'text', shortLabel: 'name' }, encoding: { type: 'text-ascii', length, pad: 32 }, access: { canRead: true, canWrite: false, realtimeSafe: false, source: 'bulkDump' }, sendPolicy: { mode: 'onCommit', coalesce: false }, ui: { preferredComponent: 'TextInput' } };
      parameters.push(p);
      mappings.push({ parameter: p.id, offset: n0 });
      continue;
    }
    const value = layout.values?.[n0] ? { choices: layout.values[n0]() } : readNotes(r.notes, lo, hi);
    for (let number = n0; number <= n1; number++) {
      const k = number - n0;
      const name = n1 > n0 ? `${r.name.replace(/s$/, '')} ${k + 1}` : r.name;
      const nMsb = number >> 7;
      const nLsb = number & 127;
      if (nMsb !== msb && n1 === n0) throw new Error(`NRPN ${r.number}: MSB ${msb} is not ${nMsb}`);
      const recipe = { id: `nrpn${hex(nMsb)}${hex(nLsb)}`, kind: 'nrpn', channel: '$channel', parameterMsb: nMsb, parameterLsb: nLsb, valueResolution: 14, value: '$encodedValue' };
      recipes.set(recipe.id, recipe);
      const describe = [r.notes && !value.choices ? `Printed: ${r.notes.replace(/\s+/g, ' ')}.` : null, layout.values?.[n0] ? `Values as printed: ${r.notes}.` : null].filter(Boolean);
      const base = { id: unique(`${camel(group)}.${camel(name)}`), name, group, ...source, ...(describe.length ? { description: describe.join(' ') } : {}), access: { canRead: true, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: recipe.id };
      let p;
      if (value.choices) {
        const seen = new Set();
        const list = value.choices.map(({ value: v, label }) => { const s = slug(label); const id = seen.has(s) ? `${s}_${v}` : s; seen.add(id); return { id, label, value: v }; });
        p = { ...base, type: 'choice', default: list[0].id, choices: list, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u14' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list.length === 2 ? 'ToggleButton' : list.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } };
      } else {
        p = { ...base, type: 'integer', range: { min: lo, max: hi }, default: lo, display: { mode: 'number', unit: '', shortLabel: camel(name), ...(value.display ?? {}) }, normalization: { mode: 'linear' }, encoding: { type: 'u14' }, sendPolicy: hi - lo > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Depth|Frequency|Resonance|Gain/i.test(name) ? 'Slider' : 'Knob' } };
      }
      parameters.push(p);
      mappings.push({ parameter: p.id, offset: number, codec: byteCodec });
    }
  }
  if (corrected.length) notes.push(`Rows the manual prints wrongly, corrected by the layout: ${corrected.join('; ')}.`);

  const sx = layout.sysex;
  const dataStart = sx.header.length + sx.dump.length;
  // (Seven bytes in eight: 278 bytes carry 243, the 242 the table lists and one it does not.)
  const size = Math.floor(sx.packedBytes / 8) * 7 + Math.max(0, (sx.packedBytes % 8) - 1);
  const requests = [{ id: 'requestEditBuffer', name: 'Edit Buffer Dump Request', kind: 'sysex', template: [...sx.header, ...sx.request, 'F7'], response: { dump: 'editBuffer' }, timeoutMs: 3000, retries: 1 }];
  const dumpDefinitions = [{
    id: 'editBuffer', name: 'Edit Buffer Dump', kind: 'sysex',
    matcher: { prefix: [...sx.header, ...sx.dump], suffix: ['F7'] },
    payload: { offset: dataStart, size, pack: { type: 'packed8to7', packOrder: 'msb-low-first', groupSize: 7 } },
    completion: { expectedMessages: 1, expectedBytes: dataStart + sx.packedBytes + 1 },
    mappings: mappings.sort((a, b) => a.offset - b.offset),
  }];

  const variables = { channel: 1, ...(layout.variables ?? {}) };
  const status = 0xb0 + variables.channel - 1;
  const tests = [];
  const vector = (p, value) => {
    const r = recipes.get(p.messageRecipe);
    const wire = typeof value === 'string' ? p.choices.find((c) => c.id === value).value : value;
    tests.push({ name: `${p.group} ${p.name} = ${typeof value === 'string' ? p.choices.find((c) => c.id === value).label : value}`, parameter: p.id, value, expectedHex: [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, wire >> 7], [0x26, wire & 127]].map(([c, v]) => [status, c, v].map(hex).join(' ')).join('\n') });
  };
  const wide = parameters.find((p) => p.type === 'integer' && p.range.max === 255 && recipes.get(p.messageRecipe)?.parameterMsb === 1);
  vector(wide, 200);
  const choice = parameters.find((p) => p.type === 'choice' && p.choices.length > 3);
  vector(choice, choice.choices.at(-1).id);
  const resolve = (t) => t.replaceAll('$deviceId', hex(variables.deviceId ?? 0));
  tests.push({ name: 'Edit buffer request', kind: 'request', request: 'requestEditBuffer', expectedHex: requests[0].template.map(resolve).join(' ') });
  // A dump: the name `TEST DEEPMIND`, each other byte a value within its parameter's range.
  const bytes = new Array(size).fill(0);
  const nameP = parameters.find((p) => p.type === 'text');
  const nameAt = mappings.find((m) => m.parameter === nameP.id).offset;
  'TEST DEEPMIND'.padEnd(16, ' ').split('').forEach((ch, i) => { bytes[nameAt + i] = ch.charCodeAt(0); });
  const expectedValues = { [nameP.id]: 'TEST DEEPMIND' };
  for (const m of mappings) {
    const p = parameters.find((q) => q.id === m.parameter);
    if (p.type === 'text') continue;
    const v = p.type === 'choice' ? p.choices.at(-1).value : Math.min(p.range.max, 130 + (m.offset % 120));
    bytes[m.offset] = v;
    if ([0, 39, 83, 156, 241].includes(m.offset)) expectedValues[p.id] = p.type === 'choice' ? p.choices.at(-1).id : v;
  }
  const packed = [];
  for (let i = 0; i < bytes.length; i += 7) {
    const group = bytes.slice(i, i + 7);
    packed.push(group.reduce((top, b, k) => top | ((b >> 7) << k), 0), ...group.map((b) => b & 0x7f));
  }
  tests.push({ name: 'Edit buffer, read back', kind: 'dumpParse', inputHex: [...sx.header.map(resolve), ...sx.dump, ...packed.map(hex), 'F7'].join(' '), expectedValues });

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
    sources: [{ type: 'manual', title: doc.title, notes: `NRPN table (pages ${layout.pages[0]} - ${layout.pages.at(-1)}) read by tools/profiles/behringer/read-behringer-tables.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}; the edit buffer request and dump from its SysEx chapter. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/behringer/make-profiles.mjs; edit the layout in tools/profiles/behringer/synths/, not this file.',
      'Every parameter is a row of the manual\'s NRPN table, sent as that NRPN with a 14-bit value (CC 6, then CC 38), and read back from the edit buffer, where it is the byte its 14-bit number gives. Nothing here has been sent to a real instrument yet.',
      'The manual says 242 bytes are packed into 278; 278 bytes carry 243, so 243 are unpacked and the last, which the table does not list, is not read. The packing (`Packed MS bit`) is read with the top bit of the first byte of seven in the lowest bit of the eighth, as Korg\'s identical diagram is; the manual\'s diagram does not number the bits.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: `complete-for-the-manual's-NRPN-table: ${parameters.filter((p) => p.access.canWrite).length} parameters`,
      realtimeEditing: 'complete-for-the-manual\'s-NRPN-table',
      editBufferDumpRequest: 'complete',
      editBufferDumpParse: `complete: ${mappings.length} of ${mappings.length} parameters`,
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these NRPNs when its MIDI Control mode is NRPN',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.parameterMsb - b.parameterMsb || a.parameterLsb - b.parameterLsb),
    requests,
    dumpDefinitions,
    startup: { policy: 'pull', syncDirection: 'pull', sync: [{ request: 'requestEditBuffer' }] },
    parameters,
    tests,
  };
}

export { stringifyProfile };
