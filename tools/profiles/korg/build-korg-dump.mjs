// build-korg-dump.mjs — Pull for a Korg profile: the current program dump the document prints,
// read back into the profile's own parameters.
//
// Every logue-family document prints the program dump byte by byte (`TABLE 2 : PROGRAM PARAMETER`),
// and asks for it with CURRENT PROGRAM DATA DUMP REQUEST. The dump is Korg's 8-in-7 packing (NOTE 1:
// each group of seven bytes behind one byte holding their top bits, data byte k's in bit k), which
// the engines unpack before reading a field. What a field is, as printed:
//
//   - a whole byte, or bits of one (`52 | 4~5 | 0~3 | VCO 1 OCTAVE`), several settings to a byte;
//   - a 10-bit value in two places, its top bits in one byte and its bottom bits in another, named
//     by the bits each holds (`20 | 0~7 | VCO 1 PITCH (bit2~9)`, `52 | 0~1 | VCO 1 PITCH (bit0~1)`);
//   - a table placed in the program table a block at a time (the PS-3300's TABLE 2, once for each of
//     its three PSU-3301 units), its fields named for the block;
//   - a value over two bytes marked H and L (the minilogue xd, the prologue, the miniKORG 700Sm).
//     The xd and prologue print H first, the 700Sm L first; the prologue's own TEMPO settles which is
//     which: 300~6000 printed `H:0~7` then `L:0~4`, and only the top bits of a 13-bit value fit in
//     five. The 700Sm, printing L first, agrees. So the first byte is the low eight bits and the
//     second the rest, whatever the letters say.
//
// A field reaches a parameter by name. A controller parameter (0 - 127) is read as the top seven
// bits of a wider field, the value its controller sends; a choice, by matching the field's printed
// names to the choice's. A field that matches no parameter, or whose values cannot be matched, is
// left out and said so.

import { pack8to7 } from '../../../CE/dpd/codecs.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
// `#` stays: the PS-3300's TEMPERAMENT ADJUST C and C# are two settings.
const key = (name) => String(name ?? '').toUpperCase().replace(/[^A-Z0-9+'()#]/g, '');
/** Two printings of one value's name: `2-POLE` and `2 POLE`, `ON/OFF` and `ON-OFF`. */
const labelKey = (label) => String(label ?? '').toUpperCase().replace(/[\s\-_./]/g, '');

/** `0~7` -> [0, 7]; `0` -> [0, 0]; `` -> the whole byte. */
function bitSpan(cell) {
  const s = String(cell ?? '').replace(/^[HL]\s*:\s*/i, '').trim();
  if (!s) return [0, 7];
  const m = /^(\d)\s*(?:~\s*(\d))?$/.exec(s);
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
}

/** `VCO 1 PITCH (bit2~9)  *note P1,P2` / `SYNC   0,1=Off,On` -> name, the value bits it holds, labels, notes. */
export function describeField(desc) {
  const notes = [...String(desc).matchAll(/\*note\s+((?:[A-Z]\d+(?:-\d+)?\s*,?\s*)+)/gi)].flatMap((m) => m[1].split(/[\s,]+/).filter(Boolean).map((n) => n.toUpperCase()));
  let text = String(desc).replace(/\*note\s+(?:[A-Z]\d+(?:-\d+)?\s*,?\s*)+/gi, '').trim();
  let labels = null;
  const inline = /\s{2,}(\d+\s*[~,]\s*\d+(?:\s*,\s*\d+)*)\s*=\s*(.+)$/.exec(text);
  if (inline) {
    text = text.slice(0, inline.index).trim();
    const values = /~/.test(inline[1]) ? (() => { const [a, b] = inline[1].split('~').map((x) => Number(x)); return Array.from({ length: b - a + 1 }, (u, i) => a + i); })() : inline[1].split(',').map((x) => Number(x));
    const names = inline[2].split(',').map((x) => x.trim()).filter(Boolean);
    labels = names.length === values.length && !names.some((n) => /~/.test(n)) ? values.map((value, i) => ({ value, label: names[i] })) : null;
  }
  const bits = /\s*\(bit\s*(\d+)\s*~\s*(\d+)\)\s*$/i.exec(text);
  if (bits) text = text.slice(0, bits.index).trim();
  // What the name says about its values, printed after it: `PORTAMENTO 0~127`, `BEND RANGE (+) OFF~+12Note`.
  const shown = /\s{2,}\S*[~=]\S*.*$/.exec(text) ?? /\s+[-+\d,]*\d+\s*~\s*\S+.*$/.exec(text);
  if (shown) text = text.slice(0, shown.index).trim();
  return { name: text.replace(/\s+/g, ' '), valueBits: bits ? [Number(bits[1]), Number(bits[2])] : null, labels, notes };
}

/** The program table as fields: one per printed setting, in offset order, until the table restarts its offsets (a sub-structure follows). */
export function programFields(rows, { block: wanted = null, tables = {} } = {}) {
  const fields = [];
  let last = -1;
  // A block of settings printed once for several copies (the prologue's `80~205 | TIMBRE 1
  // PARAMETERS`, then `+0`, `+1`, … from its start; `206~331 | TIMBRE 2 PARAMETERS (same as
  // TIMBRE1)`). Only the block the layout names is read.
  let block = null;
  for (const row of rows ?? []) {
    const first = row.cells[0] ?? '';
    const span = /^(\d+)\s*~\s*(\d+)$/.exec(first);
    const title = /\b(TIMBRE\s*\d+)\s+PARAMETERS\b/i.exec(row.cells.slice(1).join(' '))?.[1]?.replace(/\s+/g, ' ').toUpperCase();
    if (span && title) {
      block = { base: Number(span[1]), read: !!wanted && title === wanted.toUpperCase() };
      last = Number(span[2]);
      continue;
    }
    // A table placed here (the PS-3300's `64~255 | … | PSU-3301 RIGHT PARAMTER  TABLE 2`): its fields,
    // counted from this block's start and named for it, `PSU-3301 RIGHT : VCO WAVE`.
    const placed = span ? /^(.*?)\s+PARAM\w*\s+TABLE\s+(\d+)\s*$/i.exec(row.cells.at(-1) ?? '') : null;
    if (placed && tables[placed[2]]) {
      for (const f of programFields(tables[placed[2]].rows)) {
        fields.push({ ...f, offset: Number(span[1]) + f.offset, name: `${placed[1].trim()} : ${f.name}`, ...(f.high ? { high: { ...f.high, offset: Number(span[1]) + f.high.offset } } : {}) });
      }
      last = Number(span[2]);
      continue;
    }
    const relative = /^\+\s*(\d+)$/.exec(first);
    let offset;
    if (relative) {
      if (!block?.read) continue;
      offset = block.base + Number(relative[1]);
    } else {
      offset = /^\d+$/.test(first) ? Number(first) : null;
      if (offset === null) { if (span) last = Number(span[2]); continue; }
      if (offset < last) break;
      last = offset;
      block = null;
    }
    for (const cells of [row.cells, ...(row.more ?? [])]) {
      const span = bitSpan(cells[1]);
      const described = describeField(cells[3] ?? '');
      const part = /^([HL])\s*:/i.exec(cells[1] ?? '')?.[1]?.toUpperCase() ?? null;
      if (!span) continue;
      // The second byte of a two-byte value, printed after the first with no name of its own: the
      // xd prints H then L, the miniKORG 700Sm L then H. Either way the later byte holds the high bits.
      if (part && !described.name && fields.at(-1)?.part && fields.at(-1).part !== part) {
        fields.at(-1).high = { offset, from: span[0], bits: span[1] - span[0] + 1 };
        continue;
      }
      if (!described.name || /^Reserved$/i.test(described.name)) continue;
      fields.push({ offset, from: span[0], bits: span[1] - span[0] + 1, part, range: (cells[2] ?? '').trim(), ...described });
    }
  }
  return fields;
}

/** Fields that are one setting (the two halves of a 10-bit value) put together: parts, how many bits, the largest value. */
export function settings(fields) {
  const byName = new Map();
  for (const field of fields) {
    const k = key(field.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(field);
  }
  const out = [];
  for (const [k, list] of byName) {
    const base = Math.min(...list.map((f) => f.offset));
    const parts = [];
    let width = 0;
    for (const f of list) {
      const shift = f.valueBits ? f.valueBits[0] : 0;
      parts.push({ at: f.offset - base, from: f.from, bits: f.bits, shift });
      width = Math.max(width, shift + f.bits);
      if (f.high) {
        parts.push({ at: f.high.offset - base, from: f.high.from, bits: f.high.bits, shift: 8 });
        width = Math.max(width, 8 + f.high.bits);
      }
    }
    const printed = list.find((f) => f.range)?.range ?? '';
    const r = /^(\d+)\s*~\s*(\d+)$/.exec(printed.replace(/\s+/g, ''));
    const list01 = /^\d+(,\d+)+$/.test(printed.replace(/\s+/g, '')) ? printed.split(',').map(Number) : null;
    const max = r ? Number(r[2]) : list01 ? Math.max(...list01) : 2 ** Math.min(width, 16) - 1;
    out.push({ key: k, name: list[0].name, offset: base, parts: parts.sort((a, b) => b.shift - a.shift), width, max, labels: list.find((f) => f.labels)?.labels ?? null, notes: [...new Set(list.flatMap((f) => f.notes))], twoBytes: list.some((f) => f.high) });
  }
  return out;
}

/** `F0,42,3g,` `00,01,51` `0001 0000 (10)` -> F0 42 $deviceId 00 01 51 10, until the data or EOX. */
function headerTokens(rows) {
  const out = [];
  for (const row of rows ?? []) {
    const cell = row.cells[0] ?? '';
    if (/\((?:dd|F7)\)\s*$/i.test(cell)) break;              // the data, or EOX
    const paren = /\(([0-9a-f]{2})\)\s*$/i.exec(cell);
    if (paren) { out.push(paren[1].toUpperCase()); continue; }
    for (const t of cell.split(',').map((x) => x.trim()).filter(Boolean)) out.push(/^3g$/i.test(t) ? '$deviceId' : t.toUpperCase());
  }
  return out;
}

/** Read a field into a parameter, or say why not. */
function codecFor(setting, parameter, lists) {
  if (parameter.type === 'choice') {
    const printed = setting.labels ?? setting.notes.map((n) => lists[n]).find((l) => l?.entries?.length && l.entries.every((e) => e.from === e.to))?.entries.map((e) => ({ value: e.from, label: e.label }));
    if (!printed?.length) return { why: 'the dump prints no names for its values' };
    const twice = printed.find((e, i) => printed.findIndex((x) => x.value === e.value) !== i);
    if (twice) return { why: `the dump's list prints the value ${twice.value} twice` };
    const map = [];
    for (const { value, label } of printed) {
      const choice = parameter.choices.find((c) => labelKey(c.label) === labelKey(label));
      if (!choice) return { why: `the dump names a value "${label}" the parameter has no choice for` };
      map.push([value, choice.value]);
    }
    return { codec: { type: 'bitfields', parts: setting.parts, map } };
  }
  const { min, max } = parameter.range;
  if (min === 0 && max === setting.max) return { codec: { type: 'bitfields', parts: setting.parts } };
  if (min === 0 && max === 127 && setting.max > 127) {
    const shiftRight = Math.round(Math.log2((setting.max + 1) / 128));
    return { codec: { type: 'bitfields', parts: setting.parts, shiftRight, max: 127 } };
  }
  return { why: `the dump holds ${setting.max === 2 ** setting.width - 1 ? `${setting.width} bits` : `0 - ${setting.max}`} where the parameter is ${min} - ${max}` };
}

/** The value of each part of a setting, for a test dump: spread `raw` over its parts. */
function place(payload, offset, parts, raw) {
  for (const p of parts) {
    const v = (raw >> p.shift) & ((1 << p.bits) - 1);
    payload[offset + p.at] = (payload[offset + p.at] & ~(((1 << p.bits) - 1) << p.from)) | (v << p.from);
  }
}

/** Requests, the dump definition, the mappings and a dump vector, added to a built profile. */
export function addPull(profile, data, layout, notes) {
  const dump = data.programDump;
  if (!dump?.size || layout.pull === false) return;
  const requestTokens = [...headerTokens(dump.request), 'F7'];
  const prefix = headerTokens(dump.dump);
  const byName = new Map(profile.parameters.map((p) => [key(layout.dumpNames?.[p.name] ?? p.name), p]));
  const mappings = [];
  const unmapped = [];
  const unread = [];
  const used = new Set();
  for (const setting of settings(programFields(dump.table, { block: layout.dumpBlock, tables: dump.tables }))) {
    const parameter = byName.get(setting.key);
    if (!parameter) { unread.push(setting.name); continue; }
    const { codec, why } = codecFor(setting, parameter, data.lists);
    used.add(parameter.id);
    if (!codec) { unmapped.push(`${parameter.name} (${why})`); continue; }
    mappings.push({ parameter: parameter.id, offset: setting.offset, codec, setting });
  }
  if (!mappings.length) return;
  for (const m of mappings) {
    const p = profile.parameters.find((x) => x.id === m.parameter);
    p.access = { ...p.access, canRead: true };
  }
  const prefixLength = prefix.length;
  profile.variables = { ...profile.variables, deviceId: 0x30 };
  profile.requests = [
    ...(profile.requests ?? []),
    { id: 'requestCurrentProgram', name: 'Current Program Data Dump Request', kind: 'sysex', template: requestTokens, response: { dump: 'currentProgramDump' }, timeoutMs: 2000, retries: 1 },
  ];
  profile.dumpDefinitions = [{
    id: 'currentProgramDump',
    name: 'Current Program Data Dump',
    kind: 'sysex',
    matcher: { prefix, suffix: ['F7'] },
    payload: { offset: prefixLength, size: dump.size.unpacked, pack: { type: 'packed8to7', packOrder: 'msb-low-first', groupSize: 7 } },
    completion: { expectedMessages: 1, expectedBytes: prefixLength + dump.size.packed + 1 },
    mappings: mappings.map(({ parameter, offset, codec }) => ({ parameter, offset, codec })),
  }];
  profile.startup = { policy: 'pull', syncDirection: 'pull', sync: [...(profile.requests.some((r) => r.id === 'identityRequest') ? [{ request: 'identityRequest' }] : []), { request: 'requestCurrentProgram' }] };
  profile.coverage = {
    ...profile.coverage,
    editBufferDumpRequest: 'complete: CURRENT PROGRAM DATA DUMP REQUEST',
    editBufferDumpParse: `partial: ${mappings.length} of the profile's ${profile.parameters.length} parameters are read from the program dump`,
  };

  // A dump to read back: a few settings at values chosen to touch every part of them, packed as the
  // instrument packs it. What they must read as is worked out here from the same parts; the tests
  // beside the profiles check a minilogue dump placed by hand against the document.
  const payload = new Array(dump.size.unpacked).fill(0);
  // Every listed setting holds a value its list names, as a real program would; one that holds a
  // value its list does not name fails the whole read, in both engines.
  for (const m of mappings) if (m.codec.map) place(payload, m.offset, m.setting.parts, m.codec.map[0][0]);
  const expected = {};
  const picks = [
    mappings.find((m) => m.setting.parts.length > 1 && !m.codec.map),
    mappings.find((m) => m.setting.twoBytes),
    mappings.find((m) => m.codec.map),
    mappings.find((m) => m.codec.map && m.setting.parts[0].from > 0),
    mappings.find((m) => !m.codec.map && m.setting.parts.length === 1),
  ].filter(Boolean);
  for (const m of [...new Set(picks)]) {
    const parameter = profile.parameters.find((x) => x.id === m.parameter);
    if (m.codec.map) {
      const [dumpValue, wire] = m.codec.map.at(-1);
      place(payload, m.offset, m.setting.parts, dumpValue);
      expected[m.parameter] = parameter.choices.find((c) => c.value === wire).id;
    } else {
      const raw = Math.min(m.setting.max, 725);
      place(payload, m.offset, m.setting.parts, raw);
      expected[m.parameter] = m.codec.shiftRight !== undefined ? Math.min(raw >> m.codec.shiftRight, m.codec.max ?? Infinity) : raw;
    }
  }
  const wire = pack8to7(payload, 'msb-low-first', 7);
  const head = prefix.map((t) => (t === '$deviceId' ? 0x30 : Number.parseInt(t, 16)));
  profile.tests.push(
    { name: 'Current Program Data Dump Request', kind: 'request', request: 'requestCurrentProgram', expectedHex: requestTokens.map((t) => (t === '$deviceId' ? '30' : t)).join(' ') },
    { name: 'Current Program Data Dump, read back', kind: 'dumpParse', inputHex: [...head, ...wire, 0xf7].map(hex).join(' '), expectedValues: expected },
  );

  notes.push(`Pull: CURRENT PROGRAM DATA DUMP REQUEST, answered by the current program in Korg's 8-in-7 packing (${dump.size.printed}). ${mappings.length} parameter(s) are read back from it by the program table's offsets; a controller parameter reads the top seven bits of its 10-bit field, the value its controller sends.`);
  if (mappings.some((m) => m.setting.twoBytes)) notes.push('Two-byte values are read low byte first, the earlier byte holding the low eight bits: the prologue document\'s own TEMPO settles it (300~6000 as H:0~7 then L:0~4), and the miniKORG 700Sm\'s document, which prints L first, agrees.');
  notes.push('The exclusive header carries the global MIDI channel as 3g; the profile\'s deviceId variable is that byte, 30H for channel 1.');
  if (unmapped.length) notes.push(`In the program dump but not read back: ${unmapped.join('; ')}.`);
  const notInDump = profile.parameters.filter((p) => !used.has(p.id) && p.access.canWrite).map((p) => p.name);
  if (notInDump.length) notes.push(`Not found under its own name in the program dump, so not read back: ${notInDump.join(', ')}.`);
  if (unread.length) notes.push(`In the program dump with no parameter of the same name here: ${unread.join(', ')}.`);
}
