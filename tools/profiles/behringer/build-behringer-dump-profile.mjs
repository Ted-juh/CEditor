// build-behringer-dump-profile.mjs — a Behringer manual's controller, NRPN and preset byte tables (the
// Wave's) and a layout -> a CEditor device profile that writes each parameter and reads the sound
// back.
//
// What it takes as settled:
//   - a preset byte is a parameter, its name the table's notes (`Filter Frequency`), its group the
//     byte's group and menu (`A Analog`); it is sent as the controller whose function is its printed
//     name (`VCF-CUTOFF`, CC 74), or else the NRPN of that name (`UW`, 0:12), its value on CC 6;
//   - a byte with neither is read back and not written (the name, the mod wheel's position);
//   - the NRPNs that are not preset bytes are the instrument's settings and the arpeggiator's;
//   - the edit buffer request reads every byte back, the checksum the data's sum masked to 7 bits.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const slug = (label) => String(label).toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';
const title = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** `0-127`, `0/127`, `40-240` -> [lo, hi]. */
const rangeOf = (text) => { const m = /^(\d+)\s*[-/]\s*(\d+)$/.exec(String(text ?? '').trim()); return m ? [Number(m[1]), Number(m[2])] : null; };

/** A value list the table names: `0=A, 1=B, 2=A+B`, or `(Stop,Play,Rec,Overdub)` for 0 - 3. */
function choicesOf(text, lo, hi) {
  const named = [...String(text ?? '').matchAll(/(\d+)\s*=\s*([^,]+)/g)].map((m) => ({ value: Number(m[1]), label: m[2].trim() }));
  if (named.length === hi - lo + 1) return named;
  const listed = /\(([^()]+,[^()]+)\)/.exec(String(text ?? ''));
  if (listed) {
    const labels = listed[1].split(',').map((s) => s.trim());
    if (labels.length === hi - lo + 1) return labels.map((label, k) => ({ value: lo + k, label }));
  }
  return null;
}

export function buildBehringerDumpProfile(data, layout) {
  const notes = [];
  const corrected = [];
  const left = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const cc = data.rows.filter((r) => r.kind === 'cc');
  const nrpn = data.rows.filter((r) => r.kind === 'nrpn');
  const preset = data.rows.filter((r) => r.kind === 'preset').map((r) => {
    const fix = layout.fix?.[r.byte];
    if (!fix) return r;
    corrected.push(`byte ${r.byte} (${layout.fixNotes?.[r.byte] ?? JSON.stringify(fix)})`);
    return { ...r, ...fix };
  });
  const recipes = new Map();
  const parameters = [];
  const mappings = [];
  const used = new Set();

  const recipeFor = (row) => {
    const recipe = row.kind === 'cc'
      ? { id: `cc${row.cc}`, kind: 'cc', channel: '$channel', controller: Number(row.cc), value: '$encodedValue' }
      : { id: `nrpn${hex(Number(row.msb))}${hex(Number(row.lsb))}`, kind: 'nrpn', channel: '$channel', parameterMsb: Number(row.msb), parameterLsb: Number(row.lsb), valueResolution: 7, value: '$encodedValue' };
    recipes.set(recipe.id, recipe);
    used.add(row);
    return recipe.id;
  };
  const add = ({ group, name, description, range, recipe, choices, readOnly, byte }) => {
    const [lo, hi] = range;
    const base = {
      id: unique(`${camel(group)}.${camel(name)}`), name, group, ...(description ? { description } : {}),
      access: readOnly ? { canRead: true, canWrite: false, realtimeSafe: false, source: 'bulkDump' } : { canRead: byte !== undefined, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      ...(recipe ? { messageRecipe: recipe } : {}),
    };
    let p;
    if (choices) {
      const seen = new Set();
      const list = choices.map(({ value, label }) => { const s = slug(label); const id = seen.has(s) ? `${s}_${value}` : s; seen.add(id); return { id, label, value }; });
      p = { ...base, type: 'choice', default: list[0].id, choices: list, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'enum' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list.length === 2 ? 'ToggleButton' : list.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } };
    } else {
      p = { ...base, type: 'integer', range: { min: lo, max: hi }, default: lo, display: { mode: 'number', unit: '', shortLabel: camel(name) }, normalization: { mode: 'linear' }, encoding: { type: 'u7' }, sendPolicy: hi - lo > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: /Attack|Decay|Sustain|Release|Amount|Volume|Frequency|Resonance/i.test(name) ? 'Slider' : 'Knob' } };
    }
    parameters.push(p);
    if (byte !== undefined) mappings.push({ parameter: p.id, offset: byte });
    return p;
  };

  // The name: 16 ASCII bytes, read back.
  const nameRow = preset.find((r) => /^\d+-\d+$/.test(r.byte) && /NAME/.test(r.name));
  if (nameRow) {
    const [first, last] = rangeOf(nameRow.byte);
    const p = { id: unique('program.name'), name: 'Name', group: 'Program', description: `${last - first + 1} ASCII characters, bytes ${first} - ${last}. Read from the edit buffer; not written, since no controller carries it.`, type: 'text', default: '', display: { mode: 'text', shortLabel: 'name' }, encoding: { type: 'text-ascii', length: last - first + 1, pad: 32 }, access: { canRead: true, canWrite: false, realtimeSafe: false, source: 'bulkDump' }, sendPolicy: { mode: 'onCommit', coalesce: false }, ui: { preferredComponent: 'TextInput' } };
    parameters.push(p);
    mappings.push({ parameter: p.id, offset: first });
  }
  // Every other byte: its controller or NRPN, by its printed name.
  const readOnly = [];
  for (const r of preset) {
    if (!/^\d+$/.test(r.byte)) continue;
    const byte = Number(r.byte);
    const range = rangeOf(r.range);
    if (!range) throw new Error(`byte ${byte}: range not read: ${r.range}`);
    const group = [r.group, title(r.menu)].filter(Boolean).join(' ');
    const name = r.notes.replace(/\s*\(.*\)\s*$/, '').replace(/–/g, '-').trim();
    const viaCc = cc.find((c) => c.function === r.name);
    const viaNrpn = nrpn.find((n) => n.name === r.name);
    const via = viaCc ?? viaNrpn;
    const printed = [`Printed ${r.name}${/\(/.test(r.notes) ? `, ${r.notes}` : ''}; byte ${byte}.`];
    if (!via) {
      readOnly.push(`${group} ${name}`);
      add({ group, name, description: `${printed} Read from the edit buffer; no controller or NRPN is printed for it.`, range, readOnly: true, byte });
      continue;
    }
    const how = viaCc ? `CC ${viaCc.cc}` : `NRPN ${viaNrpn.msb}:${viaNrpn.lsb}`;
    add({ group, name, description: `${printed} Sent as ${how}${r.group ? `, to the group Group Select chooses` : ''}.`, range, recipe: recipeFor(via), byte });
  }
  // The NRPNs that are not preset bytes: the instrument's settings and the arpeggiator / sequencer.
  for (const n of nrpn) {
    if (used.has(n)) continue;
    const range = rangeOf(n.range);
    if (!range || range[1] > 127) { left.push(`NRPN ${n.msb}:${n.lsb} ${n.name} (${n.notes}, ${n.range}: more than a data byte, and the manual does not say how it is split)`); continue; }
    const arp = /^Arp\/Seq - /.test(n.notes);
    const name = n.notes.replace(/^Arp\/Seq - /, '').replace(/\s*\([^()]*\)\s*$/, '').trim();
    add({ group: arp ? 'Arp/Seq' : 'Global', name, description: `Printed ${n.name}${/\(/.test(n.notes) ? `, ${n.notes}` : ''}. Sent as NRPN ${n.msb}:${n.lsb}.`, range, recipe: recipeFor(n), choices: choicesOf(n.notes, ...range) });
  }
  // The controllers that are not preset bytes.
  for (const c of cc) {
    if (used.has(c)) continue;
    if ((layout.leaveOutCc ?? []).includes(Number(c.cc))) { left.push(`CC ${c.cc} ${c.function}`); continue; }
    const range = rangeOf(c.range);
    const name = c.remarks && /^[A-Z ]+$/.test(c.remarks) ? title(c.remarks) : c.function;
    add({ group: 'Global', name, description: `Printed ${c.function}${c.remarks ? `, ${c.remarks}` : ''}. Sent as CC ${c.cc}.`, range, recipe: recipeFor(c), choices: choicesOf(c.remarks, ...range) });
  }
  if (corrected.length) notes.push(`Rows the manual prints wrongly, corrected by the layout: ${corrected.join('; ')}.`);
  if (readOnly.length) notes.push(`Read back and not written, no controller or NRPN being printed for them: Name, ${readOnly.join(', ')}.`);
  if (left.length) notes.push(`Left out: ${left.join('; ')}.`);

  // The edit buffer, requested and read.
  const sx = layout.sysex;
  const dataStart = sx.header.length + sx.dump.length + 1;
  const requests = [{ id: 'requestEditBuffer', name: 'Edit Buffer Sound Parameters Dump Request', kind: 'sysex', template: [...sx.header, ...sx.request, 'F7'], response: { dump: 'editBuffer' }, timeoutMs: 3000, retries: 1 }];
  const dumpDefinitions = [{
    id: 'editBuffer', name: 'Edit Buffer Sound Parameters', kind: 'sysex',
    matcher: { prefix: [...sx.header, ...sx.dump], suffix: ['F7'] },
    payload: { offset: dataStart, size: sx.size },
    checksum: { type: 'sum-7bit', fromOffset: dataStart, toOffset: dataStart + sx.size - 1, byteOffset: dataStart + sx.size },
    completion: { expectedMessages: 1, expectedBytes: dataStart + sx.size + 2 },
    mappings: mappings.sort((a, b) => a.offset - b.offset),
  }];

  const variables = { channel: 1 };
  const status = 0xb0 + variables.channel - 1;
  const tests = [];
  const vector = (p, value, label) => {
    const r = recipes.get(p.messageRecipe);
    const wire = typeof value === 'string' ? p.choices.find((c) => c.id === value).value : value;
    const msgs = r.kind === 'cc' ? [[r.controller, wire]] : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, wire]];
    tests.push({ name: `${p.group} ${p.name} = ${label ?? value}`, parameter: p.id, value, expectedHex: msgs.map(([c, v]) => [status, c, v].map(hex).join(' ')).join('\n') });
  };
  const viaKind = (kind) => parameters.find((p) => p.type === 'integer' && p.messageRecipe && recipes.get(p.messageRecipe).kind === kind && p.range.max >= 3);
  vector(viaKind('cc'), Math.min(100, viaKind('cc').range.max));
  vector(viaKind('nrpn'), 3);
  const choice = parameters.find((p) => p.type === 'choice');
  if (choice) vector(choice, choice.choices.at(-1).id, choice.choices.at(-1).label);
  tests.push({ name: 'Edit buffer request', kind: 'request', request: 'requestEditBuffer', expectedHex: requests[0].template.join(' ') });
  // A dump: the name `TEST WAVE`, every other byte its position's last bits within its range.
  const bytes = new Array(sx.size).fill(0);
  const nameP = parameters.find((p) => p.type === 'text');
  'TEST WAVE'.padEnd(16, ' ').split('').forEach((ch, i) => { bytes[i] = ch.charCodeAt(0); });
  const expectedValues = { [nameP.id]: 'TEST WAVE' };
  for (const m of dumpDefinitions[0].mappings) {
    const p = parameters.find((q) => q.id === m.parameter);
    if (p.type !== 'integer' || p.range.max < 9) continue;
    const v = Math.min(p.range.max, p.range.min + (m.offset % 7) + 1);
    bytes[m.offset] = v;
    if (Object.keys(expectedValues).length < 6) expectedValues[p.id] = v;
  }
  const sum = bytes.reduce((a, b) => a + b, 0) & 0x7f;
  tests.push({ name: 'Edit buffer, read back', kind: 'dumpParse', inputHex: [...sx.header, ...sx.dump, sx.version, ...bytes.map(hex), hex(sum), 'F7'].join(' '), expectedValues });

  const doc = data.sources[0];
  const writable = parameters.filter((p) => p.access.canWrite).length;
  const mapped = mappings.length;
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
    sources: [{ type: 'manual', title: doc.title, notes: `MIDI chapter (pages ${layout.pages[0]} - ${layout.pages.at(-1)}): the controller, NRPN and preset byte tables, read by tools/profiles/behringer/read-behringer-tables.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}; the edit buffer request from its SysEx section. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/behringer/make-profiles.mjs; edit the layout in tools/profiles/behringer/synths/, not this file.',
      'Each sound parameter is a byte of the preset, written as the controller or NRPN the manual prints for it and read back from the edit buffer. Nothing here has been sent to a real instrument yet.',
      'The WAVE takes sound parameters only when PAR-COM (its MIDI settings) is 2 or 3, and sends them when it is 1 or 3.',
      'Group A\'s and group B\'s parameters are sent on the same controllers: the WAVE applies one to the group Group Select (CC 31) chooses, so set it before editing the other group. Pull reads both groups as they are.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: `complete-for-the-manual's-tables: ${writable} parameters`,
      realtimeEditing: 'the controllers and NRPNs, each to the group Group Select chooses',
      editBufferDumpRequest: 'complete',
      editBufferDumpParse: `complete: ${mapped} of ${mapped} preset bytes`,
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these controllers and NRPNs when PAR-COM is 1 or 3',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => (a.kind === b.kind ? (a.controller ?? a.parameterLsb) - (b.controller ?? b.parameterLsb) : a.kind < b.kind ? -1 : 1)),
    requests,
    dumpDefinitions,
    startup: { policy: 'pull', syncDirection: 'pull', sync: [{ request: 'requestEditBuffer' }] },
    parameters,
    tests,
  };
}

export { stringifyProfile };
