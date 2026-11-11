// build-kronos-profile.mjs — a KRONOS object table's transcription (tables/<name>.json, from
// import-kronos.mjs) and a layout (synths/<name>.mjs) -> a CEditor device profile.
//
// What the archive says, and nothing it does not:
//
//   - every row with a parameter id is a parameter, sent by Parameter Change (function 43,
//     `F0 42 3g 68 43 TYP SOC SUB PID IDX valueH valueM valueL F7`), its value 21 bits, two's
//     complement, high byte first (*4; the voice model's file: "21-bit signed value, MSB first");
//     the KARMA rows by KARMA Parameter Change (6D) and the Drum Track rows by Drum Track Parameter
//     Change (6E), the same message under another function code: the table prints no message per
//     row, and their ids are the program's own (layout.functions says so, and every id is then
//     unique, which the builder checks);
//     a PID above 126 takes the message's second form, `7F PIDH PIDL` (the instrument still receives
//     it);
//   - its range is the row's data(hex): `00~7F` is 0~127, and a range whose first value is the larger
//     (`9D~63`, `FF39~00C7`) is two's complement over its bytes, -99~+99 and -199~+199;
//   - it is a choice where the row names both of two values (`00~01 | Off~On`), with the names as
//     printed: the value column is 19 characters wide, and a name it cuts short keeps its cut, shown
//     with an ellipsis; and where its ends are the ends of a list the archive prints in full (the
//     voice model's AMS sources: `00~30 | Off~Tempo` is sources 0~48, Off to Tempo);
//   - it is read back from the Current Object Dump of the program (function 75) at the row's offset
//     and bits, in Korg's 8-in-7 packing (*3);
//   - rows the archive marks as working some other way are left out, each with its reason, and so is
//     what it does not say: see `leftOut` below.

import { pack8to7 } from '../../../CE/dpd/codecs.mjs';
import { camel } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const VALUE_WIDTH = 19;     // the value column's width: a cell that fills it may be cut short

/** `9D~63` -> -99~99 over one byte; `FF39~00C7` -> -199~199 over two; `00~7F, FF` keeps `FF` aside. */
export function readData(cell) {
  if (/\(fixed\)$/.test(cell)) return { fixed: true };
  const m = /^([0-9A-F]+)~([0-9A-F]+)((?:\s*,\s*[0-9A-F]+)*)$/.exec(cell);
  if (!m) return null;
  const [, lo, hi, extra] = m;
  if (lo.length !== hi.length || lo.length % 2) return { cut: true };   // `80000000~7FFF`: the column's end
  const bytes = lo.length / 2;
  let min = Number.parseInt(lo, 16);
  const max = Number.parseInt(hi, 16);
  const signed = min > max;
  if (signed) min -= 2 ** (bytes * 8);
  return { min, max, bytes, signed, extra: extra ? extra.split(',').map((s) => s.trim()).filter(Boolean) : [] };
}

/** The bit column: blank is the whole byte, `6` one bit, `5~0` bits 0 to 5. */
export function readBits(cell) {
  if (!cell) return { from: 0, bits: 8 };
  const m = /^(\d)(?:~(\d))?$/.exec(cell);
  if (!m) throw new Error(`bit "${cell}"`);
  const top = Number(m[1]);
  const from = m[2] === undefined ? top : Number(m[2]);
  return { from, bits: top - from + 1 };
}

/** The value column's two ends, `Off~On`; a cell as wide as the column may be cut, and says so. */
export function readLabels(cell) {
  const parts = cell.split('~');
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return null;
  const cut = cell.length >= VALUE_WIDTH;
  return [parts[0].trim(), `${parts[1].trim()}${cut ? '…' : ''}`];
}

const numberLabel = (label, n) => label.replace(/^\+/, '') === String(n);

/** Why a row the archive marks with a note is left out, or null when the note is understood. */
function noteReason(note) {
  if (!note || /bypass, Invert Value/.test(note)) return null;
  if (/Chain (To|Level)/.test(note)) return 'shares its parameter id with Chain To (`* Chain To`), and the archive does not say which value of it turns the chain off';
  if (/SUB = \(Assign >> 7\)/.test(note)) return 'its parameter change takes SUB from the value (`SUB = (Assign >> 7) & 0x01, Value = Assign & 0x7f`), which one message template cannot';
  if (/binary param change/.test(note)) return 'a 16-byte UUID, sent by Parameter Change (binary), function 44';
  if (/Big Endian/.test(note)) return 'a 32-bit value in four bytes with an id each (`* Big Endian`), wider than a 21-bit parameter change';
  throw new Error(`a note this builder does not know: "${note}"`);
}

export function buildKronosProfile(data, layout) {
  checkMessages(data, layout);
  const parameters = [];
  const recipes = new Map();
  const mappings = [];
  const leftOut = new Map();   // reason -> [names]
  const notReadBack = new Map();
  const fixed = [];
  const ids = new Set();
  const leave = (map, why, label) => map.set(why, [...(map.get(why) ?? []), label]);
  const ams = data.voiceModel.amsSources ?? [];

  // A name printed for several settings of one group is numbered in the order printed: the chord pads'
  // eight notes, the 32 GE real-time parameters.
  const rows = data.rows;
  const named = (row) => {
    const rename = (layout.renames ?? []).find((r) => r.group.test(row.group) && r.name === row.name && r.pid === row.id[3]);
    return rename ? rename.to : row.name;
  };
  const keyOf = (row) => `${row.group}\u0000${named(row)}`;
  const counts = new Map();
  for (const row of rows) if (row.id && row.name) counts.set(keyOf(row), (counts.get(keyOf(row)) ?? 0) + 1);
  const seen = new Map();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.id || !row.name) continue;
    const key = keyOf(row);
    const nth = (seen.get(key) ?? 0) + 1;
    seen.set(key, nth);
    const leaf = counts.get(key) > 1 ? `${named(row)} ${nth}` : named(row);
    const label = `${row.group} ${leaf}`;
    const read = readData(row.data);
    if (read?.fixed) { fixed.push(label); continue; }
    const why = noteReason(row.note) ?? (!row.data ? 'no range printed (data(hex) is blank)' : !read ? `data printed "${row.data}"` : read.cut ? 'its data(hex) cell is cut short' : null);
    if (why) { leave(leftOut, why, label); continue; }
    // A row with an id and no name after this one is a further byte of its value, with its own id.
    if (rows[i + 1]?.id && !rows[i + 1].name && rows[i + 1].ofs !== row.ofs) { leave(leftOut, 'its value spreads over bytes with ids of their own', label); continue; }

    const bits = readBits(row.bit);
    if (read.bytes > 1 && row.bit) throw new Error(`${label}: bits of a value over ${read.bytes} bytes`);
    if (read.bytes === 1 && (read.signed ? read.max - read.min : read.max) >= 2 ** bits.bits) throw new Error(`${label}: ${row.data} does not fit bits ${row.bit}`);
    const [typ, soc, sub, pid, idx] = row.id;
    const idBytes = pid < 127 ? [typ, soc, sub, pid, idx] : [typ, soc, sub, 0x7f, (pid >> 7) & 0x7f, pid & 0x7f, idx];
    const fn = (layout.functions ?? []).find((f) => f.group.test(row.group))?.code ?? '43';
    const recipeId = `${fn === '43' ? 'pc' : `pc${fn}_`}${idBytes.map(hex).join('')}`;
    if (recipes.has(recipeId)) throw new Error(`${label}: parameter id ${idBytes.map(hex).join(' ')} twice for function ${fn}`);

    const labels = readLabels(row.value);
    const inverted = /bypass, Invert Value/.test(row.note ?? '');
    let choices = null;
    if (labels && read.min === 0 && read.max === 1 && !labels.every((l, n) => numberLabel(l, n))) {
      // `* -> bypass, Invert Value`: the switch is sent as its effect's bypass, On as 0.
      choices = labels.map((l, n) => ({ id: camel(l.replace('…', '')) || `v${n}`, label: l, value: inverted ? 1 - n : n }));
    } else if (labels && read.min === 0 && !read.signed && ams[read.min]?.label === labels[0] && ams[read.max]?.label === labels[1]) {
      const used = new Set();
      choices = ams.slice(0, read.max + 1).map((s) => {
        const id = used.has(camel(s.label)) ? `${camel(s.label)}${s.value}` : camel(s.label);
        used.add(id);
        return { id, label: s.label, value: s.value };
      });
    }
    if (inverted && !choices) throw new Error(`${label}: a bypass switch that is not Off~On`);
    const extra = read.extra.length ? ` ${read.extra.join(', ')} (${labels ? row.value.split(',').slice(1).join(',').trim() : ''}) is not offered: the archive does not say what value the parameter change takes for it.` : '';
    const shown = labels && !choices && !(numberLabel(labels[0], read.min) && numberLabel(labels[1], read.max)) ? `Shown as ${row.value}.` : '';
    const description = [`Parameter id ${idBytes.map(hex).join(' ')}; offset ${row.ofs}${row.bit ? `, bit ${row.bit}` : ''}.`, shown, extra.trim(), inverted ? 'Sent as its effect\'s bypass, On as 0 (`* -> bypass, Invert Value`).' : ''].filter(Boolean).join(' ');

    let id = `${camel(row.group)}.${camel(leaf) || 'value'}`;
    for (let n = 2; ids.has(id); n++) id = `${camel(row.group)}.${camel(leaf) || 'value'}${n}`;
    ids.add(id);
    const base = { id, name: label, group: row.group, description, access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: recipeId };
    const parameter = choices
      ? {
        ...base,
        type: 'choice',
        default: choices.find((c) => c.value === (inverted ? 1 : 0))?.id ?? choices[0].id,
        choices,
        display: { mode: 'choice', shortLabel: camel(leaf) },
        normalization: { mode: 'choiceIndex' },
        encoding: { type: 'enum' },
        sendPolicy: { mode: 'onCommit', coalesce: true },
        ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : 'Combobox' },
      }
      : {
        ...base,
        type: 'integer',
        range: { min: read.min, max: read.max },
        default: read.min <= 0 && read.max >= 0 ? 0 : read.min,
        display: { mode: 'number', unit: '', shortLabel: camel(leaf) },
        normalization: { mode: 'linear' },
        encoding: { type: 's21-msb-lsb' },
        sendPolicy: read.max - read.min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
        ui: { preferredComponent: /\b(Level|Time|Intensity|Amount|Depth|Send)\b/.test(leaf) ? 'Slider' : 'Knob' },
      };
    parameters.push(parameter);
    // A choice's value is one byte of the three, the low one: the template carries the two above it.
    recipes.set(recipeId, { id: recipeId, kind: 'sysex', template: ['F0', '42', '$deviceId', '68', fn, ...idBytes.map(hex), ...(choices ? ['00', '00'] : []), '$encodedValue', 'F7'] });

    if (read.bytes > 1) { leave(notReadBack, 'a value over two bytes: the archive marks only the KARMA Start Seed\'s bytes `Big Endian` and does not say the order of the others', label); continue; }
    if (read.extra.length) { leave(notReadBack, `a value the dump may hold as ${read.extra.join(', ')}, which the parameter does not offer`, label); continue; }
    const codec = { type: 'bitfields', ...(read.signed ? { signed: true } : {}), parts: [{ at: 0, from: bits.from, bits: bits.bits, shift: 0 }], ...(inverted ? { map: [[0, 1], [1, 0]] } : {}) };
    mappings.push({ parameter: parameter.id, offset: row.ofs, codec, read, bits });
    parameter.access.canRead = true;
  }

  return shell(data, layout, parameters, recipes, mappings, leftOut, notReadBack, fixed);
}

/** What the builder relies on, checked against the archive's own words so a new release cannot slip by. */
function checkMessages(data, layout) {
  const has = (lines, re, what) => {
    if (!(lines ?? []).some((l) => re.test(l))) throw new Error(`KRONOS archive: ${what} no longer reads as expected`);
  };
  const m = data.messages;
  has(m.parameterChange, /^\s*43\s+Function/, 'Parameter Change (function 43)');
  has(m.parameterChange, /^\s*valueH\s+Value\s+\(bit14-20\)/, 'the parameter change\'s value, high byte first');
  // The KARMA and Drum Track parameter changes: the same five id bytes and value as function 43.
  for (const f of layout.functions ?? []) {
    has(m[f.code], new RegExp(`^\\[${f.code}\\] ${f.message}\\b`), `${f.message} (function ${f.code})`);
    const fields = (lines) => lines.map((l) => /^\s+(\S+)\s{2,}/.exec(l)?.[1]).filter(Boolean).join(' ');
    if (fields(m[f.code]).replace(f.code, '43') !== fields(m.parameterChange.slice(0, m.parameterChange.findIndex((l) => /End of Excl/.test(l)) + 1))) {
      throw new Error(`KRONOS archive: ${f.message} is no longer laid out as Parameter Change`);
    }
  }
  has(m.parameterChange, /^\s*7F\s+part of parameter id/, 'the second form of the parameter id');
  has(data.voiceModel.messageFormats, /21-bit signed value, MSB first/, 'the voice model\'s value format');
  has(data.voiceModel.messageFormats, /7F pp pp: \(14-bit, MSB first\)/, 'the voice model\'s long parameter id');
  has(m.value, /21-bit 2's complement/, 'footnote *4');
  has(m.currentObjectDumpRequest, /^\s*74\s+Function/, 'Current Object Dump Request (function 74)');
  has(m.currentObjectDump, /^\s*version\s+obj's version number/, 'the Current Object Dump\'s version byte');
  has(m.objects, new RegExp(`obj = 00 : Program \\(.*${data.source.file.replace('.', '\\.')}`), 'object 00 as the program');
  has(m.packing, /0GFEDCBA/, 'the 8-in-7 packing');
  has(m.packing, /sysExSize = binarySize \+ \(binarySize\+6\)\/7/, 'the packed size');
}

function shell(data, layout, parameters, recipes, mappings, leftOut, notReadBack, fixed) {
  const object = data.object;
  const packed = object.size + Math.floor((object.size + 6) / 7);
  const prefix = ['F0', '42', '$deviceId', '68', '75', '00', hex(object.objectVersion)];
  const request = ['F0', '42', '$deviceId', '68', '74', '00', 'F7'];

  // The Device Inquiry reply: `F0,7E,0g,06,02,42,68,00,mm,00,…`, a member code per model.
  const reply = data.identity?.reply ?? [];
  if (reply.slice(0, 8).join(' ') !== 'F0 7E 0g 06 02 42 68 00' || reply[8] !== 'mm') throw new Error('KRONOS: the Device Inquiry reply no longer reads F0,7E,0g,06,02,42,68,00,mm');
  const members = data.identity.members.map((m) => `${m.model.replace(/\s+/g, ' ')} ${m.code}H`);

  const byId = new Map(parameters.map((p) => [p.id, p]));
  const recipeOf = (p) => recipes.get(p.messageRecipe);
  // A choice's byte is the low one of three; its template carries the two above it.
  const wireOf = (p, value) => (p.type === 'choice' ? [hex(p.choices.find((c) => c.id === value).value)] : [(value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f].map((b) => hex(b & 0x7f)));
  const vector = (p, value) => ({
    name: `${p.name} = ${p.type === 'choice' ? p.choices.find((c) => c.id === value).label : value} (parameter change)`,
    parameter: p.id,
    value,
    expectedHex: recipeOf(p).template.flatMap((t) => (t === '$deviceId' ? ['30'] : t === '$encodedValue' ? wireOf(p, value) : [t])).join(' '),
  });
  const integers = parameters.filter((p) => p.type === 'integer');
  const picks = [
    [integers.find((p) => p.range.min === -99), (p) => p.range.min],
    [integers.find((p) => p.range.min <= -5000), (p) => p.range.min],
    [integers.find((p) => p.range.max > 16383), (p) => p.range.max],
    [parameters.find((p) => p.description.includes('bypass')), (p) => p.choices[0].id],
    [parameters.find((p) => p.type === 'choice' && p.choices.length > 2), (p) => p.choices.at(-1).id],
    [parameters.find((p) => recipeOf(p).template[8] === '7F'), (p) => (p.type === 'choice' ? p.choices.at(-1).id : p.range.max)],
  ].filter(([p]) => p);

  // A dump to read back: every field it reads at a value its parameter takes, and a few at values
  // that touch the sign, a bit field and the inverted switch.
  const payload = new Array(object.size).fill(0);
  const place = (m, raw) => {
    const mask = (1 << m.bits.bits) - 1;
    payload[m.offset] = (payload[m.offset] & ~(mask << m.bits.from)) | ((raw & mask) << m.bits.from);
  };
  for (const m of mappings) place(m, m.codec.map ? 0 : m.read.min);
  const expected = {};
  const dumpPicks = [
    mappings.find((m) => m.codec.signed && m.read.min === -99),
    mappings.find((m) => m.bits.bits < 8 && m.bits.from > 0 && !m.codec.map && byId.get(m.parameter).type === 'integer'),
    mappings.find((m) => m.codec.map),
    mappings.find((m) => byId.get(m.parameter).type === 'choice' && byId.get(m.parameter).choices.length > 2),
  ].filter(Boolean);
  for (const m of dumpPicks) {
    const p = byId.get(m.parameter);
    if (m.codec.map) { place(m, 1); expected[p.id] = p.choices.find((c) => c.value === 0).id; }
    else if (p.type === 'choice') { place(m, p.choices.at(-1).value); expected[p.id] = p.choices.at(-1).id; }
    else { const v = m.read.signed ? m.read.min + 1 : m.read.max; place(m, v); expected[p.id] = v; }
  }
  const wire = pack8to7(payload, 'msb-low-first', 7);
  if (wire.length !== packed) throw new Error(`KRONOS: packed ${wire.length} bytes, *3 says ${packed}`);

  const summary = (map) => [...map].map(([why, labels]) => `${labels.length} ${labels.length === 1 ? 'setting' : 'settings'} (${[...new Set(labels.map((l) => l.replace(/ \d+$/, '')))].slice(0, 6).join('; ')}${labels.length > 6 ? '; …' : ''}): ${why}`);
  const source = data.source;
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Korg',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [
      {
        type: 'manual',
        title: `${source.title}: ${object.title}, ${source.printed}, object version ${object.objectVersion}`,
        notes: `Rows read by tools/profiles/korg/read-kronos-table.mjs from ${source.file} (sha256 ${source.sha256}) in ${source.archive} of ${source.archiveDate}, ${source.url}. Not yet checked against the instrument itself.`,
      },
      ...data.files.map((f) => ({ type: 'manual', title: `${source.title}: ${f.file}${f.printed ? ` (${f.printed})` : ''}`, notes: `${f.file} (sha256 ${f.sha256}) in ${source.archive}.` })),
    ],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/korg/make-profiles.mjs; edit the layout in tools/profiles/korg/synths/, not this file.',
      `Every row of ${source.file} with a parameter id is a parameter, named by its group and its name as printed, and sent by Parameter Change (function 43): F0 42 3g 68 43 TYP SOC SUB PID IDX and the value as 21 bits, two's complement, high byte first ("21-bit signed value, MSB first"). Nothing here has been sent to a real instrument yet.`,
      ...(layout.functions ?? []).map((f) => `The rows of the groups ${f.group.source.replace(/^\^/, '')}… are sent by ${f.message} (function ${f.code}), the same message under another function code. The table prints no message per row; these rows' ids are the program's own (TYP 0 PID 0 is the program's Oscillator Mode, KARMA Tempo and the drum track's Pattern Bank), and sent this way every id in the table is unique. A reading, not tried on an instrument.`),
      'An HD-1 program only: the KRONOS takes program parameters in Program mode ("Which parameters are currently available for editing depends on the instrument\'s mode"), and a program of an EXi bank is laid out in Prog_EXi_Common.txt and Prog_EXi.txt, not here. The effects\' own parameters, which depend on the effect type (Effect.txt), are not here either.',
      'A range whose first value is the larger (9D~63) is two\'s complement over its bytes, -99~+99. A choice is a row naming both of two values, or a row whose ends are the ends of the voice model\'s AMS source list (Off~Tempo, sources 0~48). The value column is 19 characters wide; a name it cuts short keeps its cut, with an ellipsis. Other value names are in each parameter\'s description.',
      ...(parameters.some((p) => recipeOf(p).template[8] === '7F') ? ['A parameter id above 126 takes the message\'s second form, 7F PIDH PIDL, which the archive calls deprecated and says the instrument still receives.'] : []),
      ...(layout.renames ?? []).map((r) => `"${r.name}" as "${r.to}": ${r.why}.`),
      `${fixed.length} rows with an id print a fixed value (\`10(fixed)\`, \`00(fixed)\`: ${[...new Set(fixed.map((l) => l.replace(/ \d+$/, '')))].slice(0, 3).join('; ')}; …) and are not settings.`,
      ...summary(leftOut).map((s) => `Left out: ${s}.`),
      `Pull: Current Object Dump Request (function 74) for object 00, the program, answered by a Current Object Dump (function 75) carrying object version ${object.objectVersion} and ${object.size} bytes in Korg's 8-in-7 packing (*3: ${packed} bytes). ${mappings.length} parameters are read back at their rows' offsets and bits. A program of an EXi bank is laid out otherwise, and its dump is not this length, so it does not match.`,
      ...summary(notReadBack).map((s) => `Sent and not read back: ${s}.`),
      'The exclusive header carries the global MIDI channel as 3g; the profile\'s deviceId variable is that byte, 30H for channel 1.',
      `Identity: the Device Inquiry reply (KRONOS_MIDI_Implementation.pdf) is F0 7E 0g 06 02 42 68 00 mm 00 and the system version; the family 68 00 is checked, not the member code mm, which is one per model: ${members.join(', ')}.`,
      'No preset recall yet: the implementation\'s Bank Select footnote is not read.',
    ],
    variables: { channel: 1, deviceId: 0x30 },
    identity: { manufacturerId: ['42'], familyCode: ['68', '00'], timeoutMs: 1000, retries: 0 },
    coverage: {
      singleParameterWrite: `partial: ${parameters.length} settings of an HD-1 program; what is left out is in the notes`,
      realtimeEditing: `partial: ${parameters.length} settings of an HD-1 program by parameter change`,
      editBufferDumpRequest: 'complete: Current Object Dump Request (function 74), object 00',
      editBufferDumpParse: `partial: ${mappings.length} of the profile's ${parameters.length} parameters are read from the current program`,
      bankDump: 'notImplemented',
      inboundControllers: 'the KRONOS also transmits Parameter Change (function 43) when edited on it; not tried on an instrument',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()],
    parameters,
    requests: [
      { id: 'identityRequest', name: 'Identity Request', kind: 'sysex', template: ['F0', '7E', '7F', '06', '01', 'F7'], response: { kind: 'identity' }, timeoutMs: 1000, retries: 0 },
      { id: 'requestCurrentProgram', name: 'Current Object Dump Request (Program)', kind: 'sysex', template: request, response: { dump: 'currentProgramDump' }, timeoutMs: 3000, retries: 1 },
    ],
    startup: { policy: 'pull', syncDirection: 'pull', sync: [{ request: 'identityRequest' }, { request: 'requestCurrentProgram' }] },
    tests: [
      { name: 'Universal Identity Request', kind: 'identityRequest', expectedHex: 'F0 7E 7F 06 01 F7' },
      ...picks.map(([p, value]) => vector(p, value(p))),
      { name: 'Current Object Dump Request (Program)', kind: 'request', request: 'requestCurrentProgram', expectedHex: request.map((t) => (t === '$deviceId' ? '30' : t)).join(' ') },
      { name: 'Current Object Dump (Program), read back', kind: 'dumpParse', inputHex: [...prefix.map((t) => (t === '$deviceId' ? '30' : t)), ...wire.map(hex), 'F7'].join(' '), expectedValues: expected },
    ],
    dumpDefinitions: [{
      id: 'currentProgramDump',
      name: `Current Object Dump (${object.title})`,
      kind: 'sysex',
      matcher: { prefix, suffix: ['F7'] },
      payload: { offset: prefix.length, size: object.size, pack: { type: 'packed8to7', packOrder: 'msb-low-first', groupSize: 7 } },
      // Exactly this long: a program of an EXi bank comes back under the same header, longer.
      completion: { expectedMessages: 1, expectedBytes: prefix.length + packed + 1, maxBytes: prefix.length + packed + 1 },
      mappings: mappings.map(({ parameter, offset, codec }) => ({ parameter, offset, codec })),
    }],
  };
}
