// build-hammond-profile.mjs — a Hammond manual's transcription (tables/<name>.json) and its layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the appendix:
//   - a row is its NRPN, on the Upper channel (the examples' `x = Upper channel`): the codes print
//     its LSB then its MSB (`Bx 62 01 63 00` for `01 00`); a value of one byte goes out on data entry
//     MSB (CC 6) alone, as the examples send it, one of two bytes as its two 7-bit bytes on CC 6 and
//     CC 38 (Master Tune `032E - 0338 - 0342` is 430 - 440 - 450: 03H x 128 + 38H = 440);
//   - every row's NRPN is its SysEx address's last two bytes (`01 00` at `00 01 00`), so where a row's
//     NRPN is not (Vibrato On Swell's `09 04`, which is Vibrato Mode's; EQ Tone Control's `30` for a
//     section `3p`), the address is taken, and the profile says so;
//   - a placeholder in the codes is each value the notes under the tables give it (`“n” means Zone
//     number. 1=0, 2=1, 3=2`; `“p” means Section number. Organ=0, Extra Voice=1`), a row for each;
//   - the data: a range (`00 - 0F`, `3A - 40 - 46`), a pair with names (`00, 01 (Off/On)`), a list
//     of names (`00: B-Type 1` …), `same as above` and `same as FS Tip mode` as the row they name. A
//     list that names every value of its range, one each, is a choice; a range whose shown values
//     are integers as wide as it (`(1 - 16)` over `00 - 0F`, `(-6 - 0 - 6)` over `3A - 40 - 46`) is
//     shown so; anything else is a number, its printed data in its description;
//   - the drawbars, which have no NRPN, by the Drawbar Data List 2's controller for each (Upper 12 -
//     20, Lower 21 - 29, Pedal 33 and 35), each level the first value of its band;
//   - left out, and named: the rows without an NRPN (the names, the Display settings), the Leslie
//     cabinet's (21) NRPNs (the instrument switches to them itself when a Leslie is connected).

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const RANGE = /^([0-9A-F]{2,4})\s*-\s*([0-9A-F]{2,4})(?:\s*-\s*([0-9A-F]{2,4}))?(?:\s*\((.*)\))?$/;
const PAIR = /^([0-9A-F]{2}),\s*([0-9A-F]{2})\s*\((.*)\)$/;
const ITEM = /^([0-9A-F]{2})(?:\s*-\s*([0-9A-F]{2}))?\s*:\s*(.*)$/;

/** A printed value: two hex digits a byte; four, two 7-bit bytes (`0338` is 3 x 128 + 56). */
export const valueOf = (h) => (h.length === 4 ? parseInt(h.slice(0, 2), 16) * 128 + parseInt(h.slice(2), 16) : parseInt(h, 16));

/** A row's data -> { min, max, center?, shown?, choices?, text }, or null where it is not a range. */
export function readData(data) {
  const [head = '', ...items] = data;
  const pair = PAIR.exec(head);
  if (pair) {
    const labels = pair[3].split(/\s*\/\s*|,\s*/).map((s) => s.trim()).filter(Boolean);
    const [a, b] = [valueOf(pair[1]), valueOf(pair[2])];
    if (labels.length === 2) return { min: Math.min(a, b), max: Math.max(a, b), choices: [{ value: a, label: labels[0] }, { value: b, label: labels[1] }], text: head };
    return { min: Math.min(a, b), max: Math.max(a, b), text: head };
  }
  const m = RANGE.exec(head.replace(/\s+/g, ' ').trim());
  if (!m) return null;
  const [min, mid, max] = [valueOf(m[1]), m[3] ? valueOf(m[2]) : null, valueOf(m[3] ?? m[2])];
  const out = { min, max, ...(mid != null ? { center: mid } : {}), text: [head, ...items].join('; ') };
  // `(1 - 16)`, `(-6 - 0 - +6)`, `(0 - 24 semitones)`: integers as wide as the range.
  const shown = m[4] && /^\s*([-+]?\d+)\s*-\s*(?:[-+]?\d+\s*-\s*)?([-+]?\d+)\s*([A-Za-z% ]*)$/.exec(m[4]);
  if (shown && Number(shown[2]) - Number(shown[1]) === max - min) out.shown = { min: Number(shown[1]), max: Number(shown[2]), unit: shown[3].trim() };
  const listed = items.map((t) => ITEM.exec(t)).filter(Boolean);
  if (listed.length && listed.every((l) => !l[2])) {
    const values = listed.map((l) => ({ value: parseInt(l[1], 16), label: l[3].trim() })).sort((a, b) => a.value - b.value);
    const lo = Math.min(min, values[0].value);
    const hi = Math.max(max, values.at(-1).value);
    if (values.length === hi - lo + 1 && values.every((v, k) => v.value === lo + k)) {
      out.choices = values;
      if (hi !== max || lo !== min) out.listedBeyond = { min: lo, max: hi };
    }
  }
  return out;
}

export function buildHammondProfile(data, layout) {
  const notes = [];
  const corrected = [];
  const left = { noNrpn: [], noRange: [], leslie21: 0 };
  const recipes = new Map();
  const parameters = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const beyond = [];
  const noShown = [];

  // Rows as printed, each in the category printed on it or the one above it; a category the layout
  // says goes on over the next row's line (`Upper` / `Registration`) joined. `same as …` resolved to
  // the row it names.
  let current = null;
  let start = 0;
  const rows = data.rows.map((r) => ({ ...r }));
  rows.forEach((r, k) => {
    if (r.category && layout.categoryContinues?.test(r.category) && current) {
      current = `${current} ${r.category}`;
      for (let j = start; j < k; j++) rows[j].category = current;    // (its first row's too)
    } else if (r.category) { current = r.category; start = k; }
    r.category = current;
  });
  const dataOf = (r, k) => {
    const first = (r.data[0] ?? '').trim();
    if (/^same as above$/i.test(first)) return dataOf(rows[k - 1], k - 1);
    const named = /^same as (.+)$/i.exec(first);
    if (named) { const at = rows.findIndex((x) => x.name.toLowerCase() === named[1].toLowerCase()); return at >= 0 ? dataOf(rows[at], at) : r.data; }
    return r.data;
  };

  // Each row, and each value of its placeholder (`4n` is 40H, 41H, 42H for zones 1 - 3): its NRPN as
  // printed and as its SysEx address's last two bytes.
  const entries = [];
  rows.forEach((r, k) => {
    const leslie = r.table === 'Leslie';
    const [lsb, msb] = r.codes;
    const [a1, a2, a3, length] = r.codes.slice(leslie ? 4 : 2);
    if (leslie && r.codes[2] !== '--') left.leslie21++;
    if (lsb === '--' || msb === '--') {
      if (r.table !== 'Patch' || !/Registration$/.test(r.category ?? '')) left.noNrpn.push(`${r.category ? `${r.category} ` : ''}${r.name}`);
      return;
    }
    const ph = Object.entries(data.placeholders).find(([c]) => r.codes.some((x) => x.endsWith(c)));
    const groupBase = r.category ?? r.table;
    const expansions = ph
      ? ph[1].values.map((v) => ({ at: (code) => (code.endsWith(ph[0]) ? hex(parseInt(code[0], 16) * 16 + v.value) : code), label: ph[1].name === 'Zone' && !/Zone$/.test(groupBase) ? `Zone ${v.label}` : v.label }))
      : [{ at: (c) => c, label: null }];
    for (const e of expansions) entries.push({ r, k, e, leslie, length, address: [a1, e.at(a2), e.at(a3)], printed: [e.at(lsb), e.at(msb)], fromAddress: [e.at(a2), e.at(a3)], groupBase });
  });
  // Every row's NRPN is its address's last two bytes; where the two differ, the one no other row
  // has is taken (Vibrato On Swell prints Vibrato Mode's NRPN; the SKX's Balance prints Volume's
  // address), and where neither or both are another row's, the row is left out.
  const key = ([l, m]) => `${l} ${m}`;
  const agreed = new Set(entries.filter((x) => key(x.printed) === key(x.fromAddress)).map((x) => key(x.printed)));
  const conflicted = [];
  for (const x of entries) {
    if (key(x.printed) === key(x.fromAddress)) { x.nrpn = x.printed; continue; }
    const [pFree, aFree] = [!agreed.has(key(x.printed)), !agreed.has(key(x.fromAddress))];
    const what = `${x.r.name}${x.e.label ? ` (${x.e.label})` : ''}: NRPN printed ${x.r.codes.slice(0, 2).join(' ')}${x.e.label ? ` (${key(x.printed)})` : ''}, SysEx address ${x.r.codes.slice(x.leslie ? 4 : 2, x.leslie ? 7 : 5).join(' ')}${x.e.label ? ` (${key(x.fromAddress)})` : ''}`;
    if (pFree && !aFree) { x.nrpn = x.printed; corrected.push(`${what}: the NRPN taken, the address being another row's`); }
    else if (aFree && !pFree) { x.nrpn = x.fromAddress; corrected.push(`${what}: the address taken, the NRPN being another row's`); }
    else { conflicted.push(`${what} (${pFree ? 'neither' : 'both'} another row's)`); continue; }
    agreed.add(key(x.nrpn));
  }
  for (const x of entries.filter((y) => y.nrpn)) {
    const { r, k, e, leslie, length, address, groupBase } = x;
    const [nl, nm] = x.nrpn;
    const d = readData(dataOf(r, k));
    const [pl, pm] = [parseInt(nl, 16), parseInt(nm, 16)];
    const two = length === '02';
    const recipe = { id: `nrpn${nm}${nl}`, kind: 'nrpn', channel: '$channel', parameterMsb: pm, parameterLsb: pl, valueResolution: two ? 14 : 7, value: '$encodedValue' };
    recipes.set(recipe.id, recipe);
    const group = e.label ? `${groupBase} ${e.label}` : groupBase;
    const range = d ?? (leslie ? { min: 0, max: 127, text: '' } : null);
    if (!range) { left.noRange.push(`${r.name} (${r.data.join('; ') || 'no data printed'})`); continue; }
    if (leslie && !d) noShown.push(r.name);
    const base = {
      id: unique(`${camel(group)}.${camel(r.name)}`),
      name: r.name,
      group,
      description: `${r.table} parameters, page ${r.page}: NRPN LSB ${nl}, MSB ${nm}; SysEx address ${address.join(' ')}, ${two ? 'two bytes' : 'one byte'}; data ${range.text || 'not printed'}${r.default ? `; default ${r.default} (${r.description ?? ''})` : ''}${r.load ? `; ${r.table === 'Patch' ? 'loaded with' : 'load'} ${r.load}` : ''}.`,
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipe.id,
    };
    const def = r.default && /^[0-9A-F]{2,4}$/.test(r.default) ? valueOf(r.default) : range.center ?? range.min;
    if (range.listedBeyond) beyond.push(`${r.name} (printed ${range.text.split(';')[0]}, listed ${hex(range.listedBeyond.min)} - ${hex(range.listedBeyond.max)})`);
    if (range.choices) {
      const seen = new Set();
      const choices = range.choices.map(({ value, label }) => { let id = camel(label) || `v${value}`; if (seen.has(id)) id = `${id}${value}`; seen.add(id); return { id, label, value }; });
      parameters.push({ ...base, type: 'choice', default: (choices.find((c) => c.value === def) ?? choices[0]).id, choices, display: { mode: 'choice', shortLabel: camel(r.name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u7' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : choices.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
      continue;
    }
    parameters.push({
      ...base,
      type: 'integer',
      range: { min: range.min, max: range.max },
      default: Math.min(range.max, Math.max(range.min, def)),
      display: { mode: 'number', unit: range.shown?.unit ?? '', shortLabel: camel(r.name), ...(range.shown ? { min: range.shown.min, max: range.shown.max } : {}) },
      normalization: { mode: 'linear' },
      encoding: { type: two ? 'u14' : 'u7' },
      sendPolicy: range.max - range.min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
      ui: { preferredComponent: range.max - range.min > 16 ? 'Knob' : 'Combobox' },
    });
  }

  // The drawbars, by the Drawbar Data List 2: the Upper and Lower rows' last address byte the
  // drawbar (00 - 08, 16´ to 1´), the Pedal's the part's drawbars in order (16´ and 8´).
  const levels = (data.drawbars?.levels ?? []).map((h) => parseInt(h, 16));
  const drawbarRows = rows.filter((r) => r.table === 'Patch' && /Registration$/.test(r.category ?? ''));
  for (const r of drawbarRows) {
    const part = /^(Upper|Lower|Pedal)/.exec(r.category)?.[1];
    const list = data.drawbars.parts.find((p) => p.part === part);
    const index = parseInt(r.codes.at(-2), 16);
    const controllers = part === 'Pedal' ? list.controllers.filter((c) => c != null) : list.controllers;
    const controller = controllers[index];
    if (controller == null || levels.length !== 9) { left.noNrpn.push(`${r.category} ${r.name}`); continue; }
    const id = `cc${hex(controller)}`;
    recipes.set(id, { id, kind: 'cc', channel: '$channel', controller });
    const footage = r.name.replace(/´$/, '').trim();
    parameters.push({
      id: unique(`drawbars.${camel(`${part} ${footage}`.replace(/\//g, ' '))}`),
      name: `${part} ${r.name}`,
      group: 'Drawbars',
      description: `Drawbar Data List 2: controller ${controller} (${hex(controller)}H), each level the first value of its band (${levels.map(hex).join(', ')}); the patch table's ${r.category} ${r.name} (SysEx address ${r.codes.slice(2, 5).join(' ')}, no NRPN).`,
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: id,
      type: 'choice',
      default: 'level0',
      choices: levels.map((value, k) => ({ id: `level${k}`, label: String(k), value })),
      display: { mode: 'choice', shortLabel: camel(`${part} ${footage}`) },
      normalization: { mode: 'choiceIndex' },
      encoding: { type: 'u7' },
      sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true },
      ui: { preferredComponent: 'Slider' },
    });
  }

  // The examples: an NRPN one is sent as printed (in the profile's order: 99, 98, 6, then 38), the
  // drawbar one as its controller.
  const tests = [];
  const status = 0xb0;
  for (const ex of data.examples.filter((x) => /via NRPN/.test(x.text))) {
    const m = /Bx ((?:[0-9A-F]{2} ?)+)/.exec(ex.text);
    if (!m) continue;
    const pairs = {};
    const bytes = m[1].trim().split(' ');
    for (let i = 0; i + 1 < bytes.length; i += 2) pairs[bytes[i]] = parseInt(bytes[i + 1], 16);
    const recipe = [...recipes.values()].find((x) => x.kind === 'nrpn' && x.parameterMsb === pairs['63'] && x.parameterLsb === pairs['62']);
    const p = recipe && parameters.find((x) => x.messageRecipe === recipe.id);
    if (!p) { notes.push(`The example "${ex.text}" names no parameter laid out here.`); continue; }
    const wire = recipe.valueResolution === 14 ? pairs['06'] * 128 + (pairs['26'] ?? 0) : pairs['06'];
    const value = p.type === 'choice' ? p.choices.find((c) => c.value === wire)?.id : wire;
    const lines = [[0x63, recipe.parameterMsb], [0x62, recipe.parameterLsb], ...(recipe.valueResolution === 14 ? [[0x06, wire >> 7], [0x26, wire & 127]] : [[0x06, wire]])];
    tests.push({ name: `The manual's example (page ${ex.page}): ${ex.text.split(' … ')[0]}`, parameter: p.id, value, expectedHex: lines.map(([c, v]) => [status, c, v].map(hex).join(' ')).join('\n') });
  }
  const twoByte = parameters.find((p) => p.encoding.type === 'u14');
  if (twoByte) tests.push({ name: `${twoByte.name} = ${twoByte.range.max} (two 7-bit bytes on CC 6 and CC 38)`, parameter: twoByte.id, value: twoByte.range.max, expectedHex: [[0x63, recipes.get(twoByte.messageRecipe).parameterMsb], [0x62, recipes.get(twoByte.messageRecipe).parameterLsb], [0x06, twoByte.range.max >> 7], [0x26, twoByte.range.max & 127]].map(([c, v]) => [status, c, v].map(hex).join(' ')).join('\n') });
  const lower8 = parameters.find((p) => p.messageRecipe === 'cc17');
  if (lower8) tests.push({ name: 'Drawbar Data List 2\'s example: Set Lower 8´ to level 7 (Bx 17 70)', parameter: lower8.id, value: 'level7', expectedHex: 'B0 17 70' });

  const doc = data.source;
  notes.unshift(
    'Generated by tools/profiles/hammond/make-profiles.mjs; edit the layout in tools/profiles/hammond/synths/, not this file.',
    'Every parameter but the drawbars is a row of the MIDI INFORMATION appendix\'s Global, Patch and Leslie tables, sent as its NRPN on the Upper channel (the channel variable), as the appendix\'s examples are: CC 99 its MSB, CC 98 its LSB (the table prints the LSB first), then the value on CC 6, and for a two-byte value its second 7-bit byte on CC 38. The global setting TRx. NRPN must be On (it is by default). Nothing here has been sent to a real instrument yet.',
    'The drawbars are the Drawbar Data List 2\'s controllers on the same channel, each level sent as the first value of its band; the drawbar list 1 (one controller per manual, CC 80 - 82, a value per drawbar and level) is not laid out.',
    'Not by SysEx: the Data Set message (F0 55 dd 10 <model> 13 <address> <data> F7) needs the device ID\'s byte, and the manual gives the setting (1 - 32) but not the byte it sends; and its examples print other models\' IDs.',
  );
  if (corrected.length) notes.push(`Every row's NRPN is the last two bytes of its SysEx address, but for these, where of the two the one no other row has is taken: ${corrected.join('; ')}.`);
  if (conflicted.length) notes.push(`Left out, rows whose printed NRPN and SysEx address differ with nothing to choose between them: ${conflicted.join('; ')}.`);
  if (beyond.length) notes.push(`Laid out as the values the row lists, which go past the range it prints: ${beyond.join('; ')}.`);
  if (noShown.length) notes.push(`The Leslie cabinet's rows print no data; each is laid out 0 - 127: ${noShown.join(', ')}.`);
  if (left.leslie21) notes.push(`Not laid out, the Leslie rows' second NRPN (NRPN (21), ${left.leslie21} rows): "NRPN OR/21 is switched automatically by Leslie speaker is disconnected/connected".`);
  if (left.noNrpn.length) notes.push(`Left out, rows with no NRPN: ${left.noNrpn.join(', ')}.`);
  if (left.noRange.length) notes.push(`Left out, rows whose data is not a range or a pair: ${left.noRange.join('; ')}.`);
  const model = data.identity.model?.[0];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Hammond',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `The MIDI INFORMATION appendix (PDF pages ${doc.pages[0]} - ${doc.pages[1]}): its parameter tables, their examples and the Drawbar Data List 2, read by tools/profiles/hammond/read-hammond-tables.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}, linked from ${doc.linkedFrom}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: notes,
    variables: { channel: 1 },
    ...(data.identity.family && data.identity.member ? { identity: { manufacturerId: ['55'], familyCode: data.identity.family, modelNumber: data.identity.member, timeoutMs: 1000, retries: 0 } } : {}),
    coverage: {
      singleParameterWrite: `complete-for-the-appendix's-NRPN-rows: ${parameters.length} parameters${model ? ` (model ID ${model})` : ''}`,
      realtimeEditing: 'complete-for-the-appendix\'s-NRPN-rows',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented: the dumps are packets of nibblized data whose layout the manual does not print',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these NRPNs and the drawbar controllers when TRx. NRPN and TRx. Drawbar Regi. are on',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()],
    parameters,
    tests,
  };
}

export { stringifyProfile };
