// build-waldorf-profile.mjs — a Waldorf transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the specification's own words:
//   - every sound data row with a range is a parameter, sent as a Sound Parameter Change to the Sound
//     mode edit buffer (`F0 3E <id> <dev> 20 00 <HH> <PP> <value> F7`, HH PP the row's index in two
//     7-bit bytes), and read back from the sound dump at the same index; `reserved` rows are not;
//   - its value column says what each value shows: `see 4.4` is that list's names, a choice; a list
//     of names as long as the range (`off,on`, `parallel,serial`) a choice; a range of numbers as wide
//     as the data range (`52..76 -12..+12`) what the values show; anything else a number, with the
//     column said;
//   - a byte the spec prints as bit fields with their lists (`0uuu000a`, `uuu: off, dual, 3 …`, `a:
//     Poly, Mono`) is a choice of every combination; one whose fields have no lists to enumerate (an
//     arpeggiator step's `0sssgaaa`) is left out, named in the notes;
//   - an effect parameter (`see 5`) means what its effect type says: a number 0 - 127, its meaning
//     for each type in its description; the effect type is a choice of the types the unit has;
//   - the name, a character a row, is one text parameter, read back and not written;
//   - Pull asks for the edit buffer's sound dump; its checksum is the sum the spec prints, and 7F,
//     which it says is always accepted, is taken too.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const slug = (label) => String(label).toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';
const SHOWN = /^([+-]?\d+)\.\.([+-]?\d+)$/;

/** Every combination of a bit-field byte's fields (`0uuu000a` with `uuu:` and `a:` lists): [{ value, label }]. */
export function bitFieldChoices(pattern, list) {
  const parts = [];
  for (const item of list.items) {
    if (item.part) parts.push({ name: item.part, items: [] });
    else if (parts.length) parts.at(-1).items.push(item);
  }
  // Each field's place in the byte: its letters in the pattern, high bit first.
  const fields = parts.map((p) => {
    const letter = p.name[0];
    const at = pattern.indexOf(letter);
    const width = pattern.split('').filter((c) => c === letter).length;
    return { ...p, shift: pattern.length - at - width, width };
  });
  if (!fields.length || fields.some((f) => f.shift < 0 || !f.items.length || f.items.some((i) => i.from !== i.to))) return null;
  let out = [{ value: 0, labels: [] }];
  for (const f of fields) out = out.flatMap((o) => f.items.map((i) => ({ value: o.value | (i.from << f.shift), labels: [...o.labels, i.label] })));
  return out.map((o) => ({ value: o.value, label: o.labels.join(', ') })).sort((a, b) => a.value - b.value);
}

/**
 * A value column that names every value in order: `off,on`, `Poly/Mono`, `normal/dual/unisono`, and
 * numbers among the names counted out (`off,1-5`, `off,user,1..15`) -> [{ value, label }], or null
 * where it does not count out the range.
 */
export function listed(value, lo, hi) {
  const sep = value.includes(',') ? ',' : value.includes('/') && !/\d\/\d/.test(value) ? '/' : null;
  if (!sep) return null;
  const out = [];
  for (const item of value.split(sep).map((x) => x.trim())) {
    const run = /^(\d+)\s*(?:-|\.\.)\s*(\d+)$/.exec(item);
    if (run) for (let n = Number(run[1]); n <= Number(run[2]); n++) out.push(String(n));
    else if (item) out.push(item);
    else return null;
  }
  return out.length === hi - lo + 1 ? out.map((label, k) => ({ value: lo + k, label })) : null;
}

export function buildWaldorfProfile(data, layout) {
  const notes = [];
  const skipped = new Map();
  const skip = (why, what) => { const list = skipped.get(why) ?? []; if (!list.includes(what)) skipped.set(why, [...list, what]); };
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const equipment = data.format.equipmentId;
  const recipe = { id: 'soundParameterChange', kind: 'sysex', template: ['F0', '3E', equipment, '$deviceId', '20', '00', '$address', '$encodedValue', 'F7'] };
  const groupOf = (name) => {
    for (const [re, group] of layout.groups ?? []) { const m = re.exec(name); if (m) return group.replace(/\$(\d)/g, (s, k) => m[Number(k)]); }
    return 'Sound';
  };
  // What each effect parameter means for each type, by its index (`130 146 0..127 0..127 Speed`: the
  // first unit's index, then the second's).
  const effectMeaning = new Map();
  for (const e of data.effects) {
    for (const r of e.rows) {
      for (const index of r.indices) {
        const list = effectMeaning.get(index) ?? [];
        list.push(`${e.type}: ${r.name}${r.value && r.value !== `${r.range[0]}..${r.range[1]}` ? ` (${r.value})` : ''}`);
        effectMeaning.set(index, list);
      }
    }
  }
  const parameters = [];
  const placed = [];   // { parameter, index }
  const rows = data.sound.map((r) => ({ ...r, ...(layout.rows?.[r.index] ?? {}), ...(layout.rows?.[r.index] ? { unsure: false, corrected: true } : {}) }));
  const corrected = rows.filter((r) => r.corrected).map((r) => `${r.index} ${r.name}`);

  // The name, a character a row: the Blofeld's `Name Char`, the Microwave 2's `Name 1` … `Name 16`.
  const nameRows = rows.filter((r) => r.range && String(r.value ?? '').trim() === 'ASCII' && /^Name( Char| \d+)$/i.test(r.name));
  // A row printing a byte's bit fields (`0sssgaaa Arp Pattern Step/Glide/Accent 1`) heads a run of
  // the same byte numbered on, whose value column goes on to say what the fields mean (`sss=0:
  // normal`); the run is all of a kind.
  const BITS = /^0[a-z0]{7}$/;
  const stem = (name) => name.replace(/\s*\d+$/, '');
  const bitRuns = new Set(rows.filter((r) => BITS.test(String(r.value ?? '').trim()) && !/^see /.test(r.value)).map((r) => stem(r.name)));
  for (const row of rows) {
    if (!row.range) continue;
    const label = `${row.index} ${row.name}`;
    // (A row whose value ran into its name, `aaa>0: accent -96..+96 Arp Pattern Step/Glide/Accent 12`,
    // ends with the run's name all the same.)
    const run = [...bitRuns].find((s) => stem(row.name) === s || stem(row.name).endsWith(` ${s}`));
    if (run) { skip('a byte of bit fields whose fields have no lists to enumerate', `${row.index} ${run} ${row.name.match(/\d+$/)?.[0] ?? ''}`.trim()); continue; }
    if (row.unsure) { skip('a row whose value and name the specification runs together, not split', label); continue; }
    if (layout.leaveOut?.[row.index]) { skip(layout.leaveOut[row.index], label); continue; }
    if (nameRows.includes(row)) continue;
    const name = layout.names?.[row.index] ?? row.name;
    const group = groupOf(name);
    const value = String(row.value ?? '').trim();
    const [lo, hi] = row.range;
    const base = {
      id: unique(`${camel(group)}.${camel(name)}`),
      name,
      group,
      address: `${hex(row.index >> 7)} ${hex(row.index & 127)}`,
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipe.id,
    };
    const describe = [];
    let choices = layout.choices?.[row.index] ?? null;
    let shown = null;
    const list = /^see (?:List )?(\d+\.\d+)$/.exec(value);
    if (!choices && list) {
      const l = data.lists[list[1]];
      if (!l) { skip('a value list the specification does not print', `${label} (see ${list[1]})`); continue; }
      if (l.items.some((i) => i.part)) {
        choices = /^0[a-z0]{7}$/.test(l.notes ?? '') ? bitFieldChoices(l.notes, l) : null;
        if (!choices) { skip('a byte of bit fields whose fields have no lists to enumerate', label); continue; }
        describe.push(`One byte, ${l.notes}: ${l.title}, every combination.`);
      } else if (l.items.every((i) => i.from === i.to)) {
        const labelOf = layout.listLabels?.[list[1]] ?? ((x) => x);
        choices = l.items.filter((i) => i.from >= lo && i.from <= hi).map((i) => ({ value: i.from, label: labelOf(i.label) }));
      } else {
        // A list of runs (`0..1 1280 bars`): what a value shows only under another setting (an LFO's
        // speed, when it is clocked). A number, the list said.
        describe.push(`${l.title} (${list[1]}) when it applies: ${l.items.map((i) => `${i.from}${i.to !== i.from ? `-${i.to}` : ''} ${i.label}`).join(', ')}.`);
      }
    } else if (!choices && value === 'see 5') {
      if (/Type$/.test(name)) {
        const unit = /Effect (\d)/.exec(name)?.[1];
        const types = data.lists['5.1']?.items ?? [];
        choices = types.filter((t) => new RegExp(`\\bFX${unit}\\b`).test(t.label)).map((t) => ({ value: t.from, label: t.label.replace(/,\s*see \d+\.\d+/, '').replace(/\s*\bFX\d\b/g, '').trim() }));
        if (types.some((t) => t.marked)) describe.push('The specification says the values of the Delay, Clocked Delay and Reverb types are likely to change in a future version.');
      } else {
        const meaning = effectMeaning.get(row.index);
        describe.push(meaning ? `What it sets depends on the effect type: ${meaning.join('; ')}; nothing for the other types.` : 'What it sets depends on the effect type; no type uses it.');
      }
    } else if (!choices && /^0[a-z0]{7}$/.test(value)) {
      skip('a byte of bit fields whose fields have no lists to enumerate', label);
      continue;
    } else if (!choices && listed(value, lo, hi)) {
      const items = listed(value, lo, hi);
      if (items.length <= 32) choices = items;
      else describe.push(`Printed: ${value}.`);
    } else if (!choices) {
      const m = SHOWN.exec(value);
      // `F1 64..F2 63` (a balance), `left 64..right 63` (a pan; the Microwave 2's `left
      // 64-center-right 63`): -64 to +63, named at the ends.
      const ends = /^(\S+) 64(?:\.\.|-center-)(\S+) 63$/.exec(value);
      if (m && Number(m[2]) - Number(m[1]) === hi - lo) shown = { min: Number(m[1]), max: Number(m[2]) };
      else if (ends && hi - lo === 127) { shown = { min: -64, max: 63 }; describe.push(`${ends[1]} 64 at the low end, ${ends[2]} 63 at the high.`); }
      else if (value && value !== `${lo}..${hi}`) describe.push(`Printed: ${value}.`);
    }
    if (row.notes) describe.push(row.notes);
    let p;
    if (choices) {
      const seen = new Set();
      const listed = choices.map(({ value: v, label: l }) => { const s = slug(l); const id = seen.has(s) ? `${s}_${v}` : s; seen.add(id); return { id, label: l, value: v }; });
      p = { ...base, ...(describe.length ? { description: describe.join(' ') } : {}), type: 'choice', default: listed[0].id, choices: listed, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'enum' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: listed.length === 2 ? 'ToggleButton' : listed.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } };
    } else {
      const bipolar = shown && shown.min < 0 && shown.max > 0;
      p = {
        ...base,
        ...(describe.length ? { description: describe.join(' ') } : {}),
        type: bipolar ? 'bipolar' : 'integer',
        range: { min: lo, max: hi },
        default: bipolar ? lo - shown.min : lo,
        display: { mode: 'number', unit: '', shortLabel: camel(name), ...(shown ? { min: shown.min, max: shown.max } : {}) },
        normalization: { mode: 'linear' },
        encoding: { type: 'u7' },
        sendPolicy: hi - lo > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
        ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Rate|Amount|Volume|Cutoff|Resonance/i.test(name) ? 'Slider' : 'Knob' },
      };
    }
    parameters.push(p);
    placed.push({ parameter: p, index: row.index });
  }
  // The name: a character a row, one text parameter.
  if (nameRows.length) {
    const first = nameRows[0].index;
    const p = { id: unique('sound.name'), name: 'Name', group: groupOf('Name'), description: `${nameRows.length} characters, one per index from ${first}, ${nameRows[0].range.join(' – ')} (ASCII). Read from the sound dump; not written, since a parameter change carries one character.`, type: 'text', default: '', address: `${hex(first >> 7)} ${hex(first & 127)}`, display: { mode: 'text', shortLabel: 'name' }, encoding: { type: 'text-ascii', length: nameRows.length, pad: 32 }, access: { canRead: true, canWrite: false, realtimeSafe: false, source: 'bulkDump' }, sendPolicy: { mode: 'onCommit', coalesce: false }, messageRecipe: recipe.id, ui: { preferredComponent: 'TextInput' } };
    parameters.push(p);
    placed.push({ parameter: p, index: first });
  }

  // Pull: the Sound mode edit buffer's sound dump, `F0 3E <id> <dev> 10 <BB NN> <data> <CHK> F7`.
  const sd = data.format.soundData;
  const size = sd.to - sd.from + 1;
  const location = data.format.editBuffer;
  const prefix = ['F0', '3E', equipment, '$deviceId', '10', ...location];
  // The checksum: over the data (the Blofeld's `SDATA & 7Fh`) or over the location and data (the
  // Microwave 2's `(BB+NN+SDATA)&7Fh`), at the index the spec prints.
  const over = data.format.checksum.over;
  const dump = {
    id: 'soundEditBuffer',
    name: 'Sound Mode Edit Buffer',
    kind: 'sysex',
    matcher: { prefix, suffix: ['F7'] },
    payload: { offset: sd.from, size },
    checksum: { type: 'sum-7bit', fromOffset: over.includes('BB') ? sd.from - 2 : sd.from, toOffset: sd.to, byteOffset: data.format.checksum.at, alsoAccept: ['7F'] },
    completion: { expectedMessages: 1, expectedBytes: data.format.checksum.at + 2 },
    mappings: placed.map((x) => ({ parameter: x.parameter.id, offset: x.index })),
  };
  for (const x of placed) { x.parameter.access.canRead = true; if (x.parameter.access.source !== 'bulkDump') x.parameter.access.source = 'singleParameter'; }
  // The request's checksum, (BB+NN) & 7F (the Microwave 2's; see the layout's notes).
  const requestSum = hex((parseInt(location[0], 16) + parseInt(location[1], 16)) & 0x7f);
  const requests = [{ id: 'requestSoundEditBuffer', name: 'Sound request (Sound Mode Edit Buffer)', kind: 'sysex', template: ['F0', '3E', equipment, '$deviceId', '00', ...location, requestSum, 'F7'], response: { dump: dump.id }, timeoutMs: 3000, retries: 1 }];

  if (corrected.length) notes.push(`Rows the reader could not split, given by the layout: ${corrected.join(', ')}.`);
  for (const [why, list] of skipped) notes.push(`Left out, ${why}: ${list.join(', ')}.`);
  notes.push(`Pull: ${requests[0].name}. ${placed.length} of ${parameters.length} parameters are read back.`);

  const variables = { deviceId: 0, ...(layout.variables ?? {}) };
  const tests = [];
  const pick = [...new Set([parameters.find((p) => p.type === 'choice'), parameters.find((p) => p.type === 'bipolar'), parameters.find((p) => p.type === 'integer' && p.range.max > 1)].filter(Boolean))];
  for (const p of pick) {
    const choice = p.type === 'choice' ? p.choices.at(-1) : null;
    const v = choice ? choice.value : Math.min(p.range.max, Math.max(p.range.min, 100));
    tests.push({ name: `${p.group}: ${p.name} = ${choice ? choice.label : v}`, parameter: p.id, value: choice ? choice.id : v, expectedHex: ['F0', '3E', equipment, hex(variables.deviceId), '20', '00', p.address, hex(v), 'F7'].join(' ') });
  }
  tests.push({ name: requests[0].name, kind: 'request', request: requests[0].id, expectedHex: requests[0].template.map((b) => (b === '$deviceId' ? hex(variables.deviceId) : b)).join(' ') });
  // A dump made by hand from the table: every value at its lowest, but one choice at its last and one
  // number at its highest, the name `INIT`, the checksum worked out.
  {
    const bytes = new Array(size).fill(0);
    const expected = {};
    for (const x of placed) {
      const p = x.parameter;
      if (p.type === 'text') { 'INIT'.padEnd(p.encoding.length, ' ').split('').forEach((c, k) => { bytes[x.index + k] = c.charCodeAt(0); }); expected[p.id] = 'INIT'; continue; }
      bytes[x.index] = p.type === 'choice' ? p.choices[0].value : p.range.min;
    }
    const c = placed.find((x) => x.parameter.type === 'choice' && x.parameter.choices.length > 2);
    const n = placed.find((x) => x.parameter.type === 'integer' && x.parameter.range.max > 1);
    if (c) { bytes[c.index] = c.parameter.choices.at(-1).value; expected[c.parameter.id] = c.parameter.choices.at(-1).id; }
    if (n) { bytes[n.index] = n.parameter.range.max; expected[n.parameter.id] = n.parameter.range.max; }
    const head = prefix.map((b) => (b === '$deviceId' ? variables.deviceId : parseInt(b, 16)));
    const summed = over.includes('BB') ? [...location.map((b) => parseInt(b, 16)), ...bytes] : bytes;
    const sum = summed.reduce((t, b) => t + b, 0) & 0x7f;
    tests.push({ name: `${dump.name}, read back`, kind: 'dumpParse', inputHex: [...head, ...bytes, sum, 0xf7].map(hex).join(' '), expectedValues: expected });
  }

  const id = data.format.identity;
  // (The layout may decline it: the Microwave 2's member code is a bitmask of the hardware fitted.)
  const identity = id?.member && !layout.noIdentity ? { requestDeviceId: '7F', manufacturerId: ['3E'], familyCode: id.family, modelNumber: id.member, timeoutMs: 1000, retries: 0 } : null;
  const doc = data.sources[0];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Waldorf',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `Sound data table, value lists, effect parameters and messages read by tools/profiles/waldorf/read-waldorf-sysex.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/waldorf/make-profiles.mjs; edit the layout in tools/profiles/waldorf/synths/, not this file.',
      'Every parameter is a row of the specification\'s sound data table, with its printed name. Nothing here has been sent to a real instrument yet.',
      `Sound parameter change: F0 3E ${equipment} <dev> 20 00 <HH> <PP> <value> F7, HH PP the parameter's index (its offset in the sound dump) in two 7-bit bytes, to the Sound mode edit buffer. <dev> is the deviceId variable, the instrument's Device ID (0 unless set otherwise); its dumps are matched by it too.`,
      identity ? `Identity: the reply the specification prints, family ${id.family.join(' ')}, member ${id.member.join(' ')} (${id.memberName}).` : `No identity check: ${layout.noIdentity ?? 'the specification prints no identity reply'}.`,
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    ...(identity ? { identity } : {}),
    coverage: {
      singleParameterWrite: 'complete-for-the-specification\'s-sound-data-table',
      realtimeEditing: 'complete-for-the-specification\'s-sound-data-table',
      editBufferDumpRequest: 'complete: the Sound mode edit buffer',
      editBufferDumpParse: `complete: ${placed.length} of ${parameters.length} parameters`,
      bankDump: 'notImplemented',
      inboundControllers: 'sound parameter changes the instrument sends are read by index; its control changes are not mapped',
      verifiedOnHardware: false,
      ...(layout.coverage ?? {}),
    },
    timing: { minDelayBetweenMessagesMs: layout.delayMs ?? 0 },
    messageRecipes: [recipe],
    parameters,
    tests,
    requests,
    dumpDefinitions: [dump],
    startup: { policy: 'pull', syncDirection: 'pull', sync: requests.map((r) => ({ request: r.id })) },
  };
}

export { stringifyProfile };

/**
 * A manual's controller chart (tables/<name>.json with `controllers`) and a layout -> a profile of
 * control changes. Every row with a range is a parameter on its controller. A value column naming
 * every value is a choice; names fewer than a 0 - 127 controller's values take a band each, the
 * first value of it sent (`off, on`: 0 and 64); a range of numbers as wide as the controller's what
 * its values show; anything else a number, the column said. A controller the manual marks `*`
 * changes no setting of the sound (the wheels, pedals, volume, the channel mode messages), and one
 * printed `- not used -` is none: neither is laid out.
 */
export function buildWaldorfCcProfile(data, layout) {
  const notes = [];
  const skipped = new Map();
  const skip = (why, what) => { const list = skipped.get(why) ?? []; if (!list.includes(what)) skipped.set(why, [...list, what]); };
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const groupOf = (name) => {
    for (const [re, group] of layout.groups ?? []) { const m = re.exec(name); if (m) return group.replace(/\$(\d)/g, (s, k) => m[Number(k)]); }
    return 'Sound';
  };
  const parameters = [];
  const recipes = [];
  // `0…127`, and the Streichfett's and Rocket's `0...127`, alike.
  const dots = (s) => String(s).replace(/…|\.{3}/g, '..').replace(/’/g, "'").trim();
  // The performance and channel mode controllers, which change no setting of the sound: the micro Q
  // marks them `*`, the Streichfett and Rocket print them unmarked.
  const PERFORMANCE = /^(Modulation Wheel|Breath Control|Foot Control|Channel Volume|Sustain Pedal|Sostenuto|All Sound Off|Reset All Control|Local Control|All Notes Off|Omni Mode|Poly Mode|Mono Mode)/;
  // A cell the reader takes apart wrongly, given by the layout (the Streichfett's `8va`).
  const fixed = data.controllers.filter((r) => layout.fix?.[r.controller]);
  if (fixed.length) notes.push(`Cells the reader could not read as printed, given by the layout: ${fixed.map((r) => `CC ${r.controller} ${r.name}`).join(', ')}.`);
  for (const printed of data.controllers) {
    const row = { ...printed, ...(layout.fix?.[printed.controller] ?? {}) };
    const label = `CC ${row.controller} ${row.name}`;
    // The chart may print no range (the Streichfett's): a controller's, 0 - 127.
    row.range ??= '0…127';
    if (/not used/.test(row.range)) { skip('controllers the manual prints `- not used -`', label); continue; }
    if (/\*$/.test(row.name)) { skip('controllers the manual marks `*`, which change no setting of the sound', label); continue; }
    if (PERFORMANCE.test(row.name)) { skip('performance and channel mode controllers, which change no setting of the sound', label); continue; }
    if (layout.leaveOut?.[row.controller]) { skip(layout.leaveOut[row.controller], label); continue; }
    const name = layout.names?.[row.controller] ?? row.name;
    const group = groupOf(name);
    const range = /^(\d+)\.\.(\d+)$/.exec(dots(row.range));
    let choices = layout.choices?.[row.controller] ?? null;
    if (!range && !choices) { skip('a controller range the reader does not take', `${label} (${row.range})`); continue; }
    const [lo, hi] = range ? [Number(range[1]), Number(range[2])] : [Math.min(...choices.map((c) => c.value)), Math.max(...choices.map((c) => c.value))];
    const value = dots(row.value);
    const describe = [];
    let shown = null;
    // `0 = Off, 64 = On`, `0: Saw, 1: Pulse`: the values printed beside the names.
    const numbered = value.split(/\s*,\s*/).map((x) => /^(\d+)\s*[:=]\s*(.+)$/.exec(x));
    if (!choices && numbered.length >= 2 && numbered.every(Boolean)) choices = numbered.map((m) => ({ value: Number(m[1]), label: m[2] }));
    if (!choices) {
      const items = listed(value.replace(/,\s+/g, ','), lo, hi);
      const names = value.includes(',') || value.includes('/') ? value.split(/\s*[,/]\s*/) : null;
      const m = /^([+-]?\d+)\.\.([+-]?\d+)(?:\s+(\w+))?$/.exec(value);
      // `L64..R63`, `L64..center..R63`, `F1 64..mid..F2 63`: -64 to +63.
      const ends = /^(L|F1 )64\.\.(?:\w+\.\.)?(R|F2 )63$/.exec(value);
      if (items && items.length <= 32) choices = items;
      else if (names && names.length >= 2 && names.length < hi - lo + 1 && lo === 0 && hi === 127 && names.every((n) => n && !/\d\.\./.test(n))) {
        const band = 128 / names.length;
        choices = names.map((n, k) => ({ value: Math.round(k * band), label: n }));
        describe.push('Each name takes a band of values; the first value of it is sent.');
      } else if (m && Number(m[2]) - Number(m[1]) === hi - lo) { if (Number(m[1]) !== lo) shown = { min: Number(m[1]), max: Number(m[2]), ...(m[3] ? { unit: m[3] } : {}) }; }
      else if (ends && hi - lo === 127) shown = { min: -64, max: 63 };
      else if (value && value !== `${lo}..${hi}`) describe.push(`Printed: ${row.value}.`);
    }
    const recipe = { id: `cc${row.controller}`, kind: 'cc', channel: '$channel', controller: row.controller, value: '$encodedValue' };
    if (!recipes.some((r) => r.id === recipe.id)) recipes.push(recipe);
    const base = { id: unique(`${camel(group)}.${camel(name)}`), name, group, ...(describe.length ? { description: describe.join(' ') } : {}), access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: recipe.id };
    if (choices) {
      const seen = new Set();
      const list = choices.map(({ value: v, label: l }) => { const s = slug(l); const id = seen.has(s) ? `${s}_${v}` : s; seen.add(id); return { id, label: l, value: v }; });
      parameters.push({ ...base, type: 'choice', default: list[0].id, choices: list, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'enum' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list.length === 2 ? 'ToggleButton' : list.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
    } else {
      const bipolar = shown && shown.min < 0 && shown.max > 0;
      parameters.push({ ...base, type: bipolar ? 'bipolar' : 'integer', range: { min: lo, max: hi }, default: bipolar ? lo - shown.min : lo, display: { mode: 'number', unit: '', shortLabel: camel(name), ...(shown ? { min: shown.min, max: shown.max } : {}) }, normalization: { mode: 'linear' }, encoding: { type: 'u7' }, sendPolicy: hi - lo > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Rate|Amount|Volume|Cutoff|Resonance/i.test(name) ? 'Slider' : 'Knob' } });
    }
  }
  for (const [why, list] of skipped) notes.push(`Left out, ${why}: ${list.join(', ')}.`);
  const variables = { channel: 1, ...(layout.variables ?? {}) };
  const tests = [];
  for (const p of [parameters.find((x) => x.type === 'choice'), parameters.find((x) => x.type === 'bipolar'), parameters.find((x) => x.type === 'integer' && x.range.max > 1)].filter(Boolean)) {
    const choice = p.type === 'choice' ? p.choices.at(-1) : null;
    const v = choice ? choice.value : Math.min(p.range.max, Math.max(p.range.min, 100));
    const cc = recipes.find((r) => r.id === p.messageRecipe).controller;
    tests.push({ name: `${p.name} = ${choice ? choice.label : v} (CC ${cc})`, parameter: p.id, value: choice ? choice.id : v, expectedHex: ['B0', hex(cc), hex(v)].join(' ') });
  }
  const doc = data.sources[0];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Waldorf',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `Controller chart (pages ${layout.read.chart.join(', ')}) read by tools/profiles/waldorf/read-waldorf-cc.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/waldorf/make-profiles.mjs; edit the layout in tools/profiles/waldorf/synths/, not this file.',
      'Every parameter is a row of the manual\'s controller chart, with its printed name, sent as a control change on the channel variable. Nothing here has been sent to a real instrument yet.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-manual\'s-controller-chart',
      realtimeEditing: 'complete-for-the-manual\'s-controller-chart',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these same controllers when its MIDI settings allow',
      verifiedOnHardware: false,
      ...(layout.coverage ?? {}),
    },
    timing: { minDelayBetweenMessagesMs: layout.delayMs ?? 0 },
    messageRecipes: recipes,
    parameters,
    tests,
  };
}
