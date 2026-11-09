// build-yamaha-profile.mjs — a Yamaha transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What the data list says, and nothing it does not:
//
//   - every row of a MIDI PARAMETER CHANGE TABLE that prints a data range is a parameter, sent as
//     the parameter change the data format prints (F0 43 1n 7F 1C <model> <address> <data> F7) at
//     the row's address; `reserved` rows are not;
//   - the description column says what each value shows, in order. A list of names exactly as long
//     as the range (`00 – 04` beside `OFF, AMP, FILTER, PITCH, OSC`) is a choice; a range of numbers
//     as long as the data range (`28 – 58` beside `-24 – +24 (semitones)`) is the values shown; a
//     range in parts (`00 – 0F, 7F` beside `1 – 16, off`) is matched part for part. Anything else
//     is a number, and the description is said;
//   - a value over several bytes is read as the description says it is split: `1st bit 3-0 : bit
//     15-12` is four nibbles, `1st bit 6-0 : bit 13-7` two 7-bit halves;
//   - a name printed one character a row (`Voice Name1` … `Voice Name10`, `32 – 126 (ASCII)`) is one
//     text parameter, read from the bulk dump and not written: a parameter change carries one
//     parameter, and the data list does not say ten characters may go in one;
//   - an address byte printed as a placeholder (`31 op 00`) is expanded over the values the table's
//     note gives it (`op = operator number 00 – 03 (hex) OP1 – OP4`);
//   - Pull asks for each bulk dump block the BULK DUMP table lists, at its Bulk Header's address
//     where it has one, and reads every parameter whose address falls in a block back from it; the
//     checksum is the one the data format prints, over the model ID, address and data.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const clean = (s) => String(s ?? '').replace(/[—−]/g, '–').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const slug = (label) => label.toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';

/** `00 – 7F` -> [[0, 127]]; `00 – 0F, 7F` -> [[0, 15], [127, 127]]; `00, 20 – 7E` -> [[0, 0], [32, 126]]. */
export function readHexRange(text) {
  const parts = clean(text).split(/\s*,\s*/).filter(Boolean);
  if (!parts.length) return null;
  const out = [];
  for (const p of parts) {
    const m = /^([0-9A-F]{2})(?:\s*[–-]\s*([0-9A-F]{2}))?$/.exec(p);
    if (!m) return null;
    const from = parseInt(m[1], 16);
    const to = m[2] ? parseInt(m[2], 16) : from;
    if (to < from) return null;
    out.push([from, to]);
  }
  return out;
}

/** A description split at its commas, leaving those inside brackets alone. */
export function splitList(text) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of clean(text)) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(current.trim()); current = ''; } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** `-24 – +24 (semitones)`, `ALGO 1 – 12`, `-48 (-4 octave) – +48 (+4 octave)` -> { min, max, unit }. */
export function readShownRange(text) {
  const t = clean(text);
  const unit = /\((semitones?|cent|cents|dB|%|Hz|ms|octave)\)\s*$/i.exec(t)?.[1];
  const bare = t.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const m = /^(?:[A-Za-z.]+\s+)?([+-]?\d+)\s*(?:dB|%|cent|Hz|ms)?\s*–\s*([+-]?\d+)\s*(?:dB|%|cent|Hz|ms)?$/.exec(bare);
  if (!m) return null;
  return { min: Number(m[1]), max: Number(m[2]), ...(unit ? { unit: unit.toLowerCase() } : {}) };
}

/**
 * What a one-byte row's values are: { choices } | { shown, unit } | {} (a plain number), from its
 * data range in parts and its description.
 */
export function readValues(parts, description) {
  const width = (p) => p[1] - p[0] + 1;
  const items = splitList(description);
  if (parts.length === 1) {
    const [from, to] = parts[0];
    const shown = readShownRange(description);
    if (shown && shown.max - shown.min === to - from) {
      return shown.min === from && shown.max === to ? (shown.unit ? { unit: shown.unit } : {}) : { shown: { min: shown.min, max: shown.max }, ...(shown.unit ? { unit: shown.unit } : {}) };
    }
    const named = items.length === width(parts[0]) && items.length >= 2 && items.every((x) => x && !/\d\s*–\s*[+-]?\d/.test(x));
    if (named) return { choices: items.map((label, i) => ({ value: from + i, label })) };
    return {};
  }
  // Part for part: `00 – 0F, 7F` beside `1 – 16, off`.
  if (items.length !== parts.length) return {};
  const choices = [];
  for (const [i, [from, to]] of parts.entries()) {
    if (from === to) { choices.push({ value: from, label: items[i] }); continue; }
    const shown = readShownRange(items[i]);
    if (!shown || shown.max - shown.min !== to - from) return {};
    for (let v = from; v <= to; v++) choices.push({ value: v, label: String(shown.min + (v - from)) });
  }
  return { choices };
}

const titleOf = (title) => (/\(([^)]*)\)\s*$/.exec(title)?.[1] ?? title).trim();
const titleCase = (s) => (s === s.toUpperCase() ? s.replace(/\w\S*/g, (w) => (/^(TG|EG|LFO|OP|SYSTEM)$/.test(w) && w !== 'SYSTEM' ? w : w[0] + w.slice(1).toLowerCase())) : s.replace(/\b([A-Z]{3,})\b/g, (w) => (/^(EG|LFO|TG)$/.test(w) ? w : w[0] + w.slice(1).toLowerCase())));

/** `op = operator number` / `00 – 03 (hex)` / `OP1 – OP4` -> { key: 'op', values: [0..3], labels: ['OP1'..'OP4'] }. */
export function readPlaceholders(notes) {
  const out = {};
  const text = (notes ?? []).map(clean);
  text.forEach((n, i) => {
    const m = /^([0-9a-z]{1,2})\s*=\s*(.+)$/.exec(n);
    if (!m) return;
    const range = text.slice(i + 1).map((x) => /^([0-9A-F]{2})\s*–\s*([0-9A-F]{2})\s*\(hex\)/i.exec(x)).find(Boolean);
    if (!range) return;
    const [from, to] = [parseInt(range[1], 16), parseInt(range[2], 16)];
    const labels = text.slice(i + 1).map((x) => /^([A-Za-z]+)\s*(\d+)\s*–\s*[A-Za-z]+\s*(\d+)$/.exec(x)).find(Boolean);
    const values = Array.from({ length: to - from + 1 }, (u, k) => from + k);
    out[m[1]] = { what: m[2], values, labels: values.map((v, k) => (labels ? `${labels[1]}${Number(labels[2]) + k}` : `${m[2]} ${v + 1}`)) };
  });
  return out;
}

export function buildYamahaProfile(data, layout) {
  const notes = [];
  const parameters = [];
  const ids = new Set();
  const skipped = new Map();
  const skip = (why, what) => skipped.set(why, [...(skipped.get(why) ?? []), what]);
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const model = layout.modelId ?? data.format.modelId;
  const group = data.format.group ?? ['7F', '1C'];
  const recipe = { id: 'parameterChange', kind: 'sysex', template: ['F0', '43', '$deviceId', ...group, model, '$address', '$encodedValue', 'F7'] };
  const placed = [];   // { parameter, address: [H, M, L], width }

  for (const table of data.tables) {
    const title = titleOf(table.title);
    const holders = { ...readPlaceholders(table.notes), ...(layout.placeholders?.[title] ?? {}) };
    const own = layout.tables?.[title] ?? {};
    if (own.skip) { skip(own.skip, title); continue; }
    // Rows once each, or once per value of a placeholder in their address.
    const holderKey = table.rows.flatMap((r) => r.address).find((b) => holders[b]);
    const instances = holderKey ? holders[holderKey].values.map((v, i) => ({ key: holderKey, value: v, label: holders[holderKey].labels[i] })) : [null];
    for (const inst of instances) {
      const groupName = inst ? inst.label : own.group ?? titleCase(title);
      const rows = table.rows;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const address = row.address.map((b) => (inst && b === inst.key ? hex(inst.value) : b));
        if (address.some((b) => !/^[0-9A-F]{2}$/.test(b))) { skip('an address byte printed as a placeholder its table does not explain', `${title}: ${row.name} (${row.address.join(' ')})`); continue; }
        let name = clean(row.name);
        const label = `${groupName}: ${name} (${address.join(' ')})`;
        if (/^reserved$/i.test(name) || !row.range.length) { continue; }
        if (inst) name = /^OP\b/.test(name) && /^OP\d/.test(inst.label) ? name.replace(/^OP\b/, inst.label) : `${inst.label} ${name}`;
        const description = clean(row.description);
        const describe = [];
        // A name printed a character a row.
        const charRow = (r) => /^(.*?Name)\s*(\d+)$/.exec(clean(r.name)) && /ASCII/.test(r.description) && r.size === 1;
        if (charRow(row)) {
          const base = /^(.*?Name)\s*\d+$/.exec(name)[1];
          let n = 1;
          while (rows[i + n] && charRow(rows[i + n]) && /^(.*?Name)\s*\d+$/.exec(clean(rows[i + n].name))[1] === /^(.*?Name)\s*\d+$/.exec(clean(row.name))[1]) n++;
          i += n - 1;
          const p = {
            id: unique(`${camel(groupName)}.${camel(base)}`),
            name: base,
            group: groupName,
            description: `${n} characters, one per address from ${address.join(' ')}, ${description}. Read from the bulk dump; not written, since a parameter change carries one character.`,
            type: 'text',
            default: '',
            address: address.join(' '),
            display: { mode: 'text', shortLabel: camel(base) },
            encoding: { type: 'text-ascii', length: n, pad: 32 },
            access: { canRead: false, canWrite: false, realtimeSafe: false, source: 'bulkDump' },
            sendPolicy: { mode: 'onCommit', coalesce: false },
            messageRecipe: recipe.id,
            ui: { preferredComponent: 'TextInput' },
          };
          parameters.push(p);
          placed.push({ parameter: p, address: address.map((b) => parseInt(b, 16)), width: n });
          continue;
        }
        let read;
        let encoding = { type: 'u7' };
        let width = 1;
        if (row.size === 1) {
          const parts = readHexRange(row.range[0]);
          if (!parts) { skip('a data range not read', `${label}: ${row.range.join('; ')}`); continue; }
          const values = readValues(parts, description);
          if (values.choices) read = { choices: values.choices };
          else if (parts.length > 1) { skip('a data range in parts its description does not match', `${label}: ${row.range[0]} / ${description}`); continue; } else read = { min: parts[0][0], max: parts[0][1], ...values };
        } else {
          // Several bytes, split as the description says.
          const bounds = row.range.map((r) => readHexRange(r)?.[0]);
          if (bounds.length !== row.size || bounds.some((b) => !b)) { skip(`a value over ${row.size} bytes whose ranges are not printed one a byte`, label); continue; }
          if (row.size === 4 && /bit 3-0\s*:\s*bit 15-?\s*12/.test(description)) {
            encoding = { type: 'nibbled', nibbles: 4 };
            read = { min: bounds.reduce((n, b) => (n << 4) | b[0], 0), max: bounds.reduce((n, b) => (n << 4) | b[1], 0) };
          } else if (row.size === 2 && /bit 6-0\s*:\s*bit 13-7/.test(description)) {
            encoding = { type: 'u14-msb-lsb' };
            read = { min: (bounds[0][0] << 7) | bounds[1][0], max: (bounds[0][1] << 7) | bounds[1][1] };
            const shown = readShownRange(description.replace(/1st bit.*$/, ''));
            if (shown && shown.min >= read.min && shown.max <= read.max) read = { min: shown.min, max: shown.max };
            name = name.replace(/^(.*?)\s+MSB\s+\1\s+LSB$/, '$1');
          } else { skip(`a value over ${row.size} bytes split in a way not read`, label); continue; }
          width = row.size;
          describe.push(`${row.size} bytes: ${description.replace(/^.*?(1st bit)/, '$1')}.`);
          const shownText = description.replace(/\s*1st bit.*$/, '');
          if (shownText) describe.push(`Printed: ${shownText}.`);
        }
        if (row.notes) describe.push(clean(row.notes).replace(/([^.])$/, '$1.'));
        const base = {
          id: unique(`${camel(groupName)}.${camel(name)}`),
          name,
          group: groupName,
          address: address.join(' '),
          access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
          messageRecipe: recipe.id,
        };
        let p;
        if (read.choices) {
          const seen = new Set();
          const list = read.choices.map(({ value, label: l }) => { const s = slug(l); const id = seen.has(s) ? `${s}_${value}` : s; seen.add(id); return { id, label: l, value }; });
          p = { ...base, ...(describe.length ? { description: describe.join(' ') } : {}), type: 'choice', default: list[0].id, choices: list, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'enum' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list.length === 2 ? 'ToggleButton' : list.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } };
        } else {
          const same = readShownRange(description);
          if (row.size === 1 && description && !read.shown && !(same && same.min === read.min && same.max === read.max)) describe.push(`Printed: ${description}.`);
          if (read.unit) describe.push(`In ${read.unit}.`);
          const bipolar = read.shown && read.shown.min < 0 && read.shown.max > 0;
          const zero = bipolar ? read.min - read.shown.min : null;
          p = {
            ...base,
            ...(describe.length ? { description: describe.join(' ') } : {}),
            type: bipolar ? 'bipolar' : 'integer',
            range: { min: read.min, max: read.max },
            default: zero ?? read.min,
            display: { mode: 'number', unit: read.unit === 'semitones' ? 'st' : '', shortLabel: camel(name), ...(read.shown ? { min: read.shown.min, max: read.shown.max } : {}) },
            normalization: { mode: 'linear' },
            encoding,
            sendPolicy: read.max - read.min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
            ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Rate|Depth|Time|Volume/i.test(name) ? 'Slider' : 'Knob' },
          };
        }
        parameters.push(p);
        placed.push({ parameter: p, address: address.map((b) => parseInt(b, 16)), width });
      }
    }
  }

  // Pull: the bulk dump blocks.
  const requests = [];
  const dumpDefinitions = [];
  const read = new Set();
  const expandBlock = (b) => {
    // A block whose address a placeholder table starts at is one block per value (`Operator 1` …).
    const [H, M, L] = b.address.map((x) => parseInt(x, 16));
    const table = data.tables.find((t) => t.rows[0] && parseInt(t.rows[0].address[0], 16) === H && /^[0-9a-z]{2}$/.test(t.rows[0].address[1]) && !/^[0-9A-F]{2}$/.test(t.rows[0].address[1]));
    const holders = table ? readPlaceholders(table.notes) : {};
    const key = table?.rows[0].address[1];
    if (key && holders[key]) return holders[key].values.map((v, i) => ({ ...b, name: `${b.name.replace(/\s*\d+$/, '')} ${holders[key].labels[i]}`.trim(), at: [H, v, L] }));
    return [{ ...b, at: [H, M, L] }];
  };
  // `COMMON Voice Common`, `Operator Operator 1`: the block column and its description run together.
  const blockName = (n) => clean(n).replace(/^([A-Z]+)\s+(.*)$/, (m, a, rest) => (rest.toUpperCase().includes(a) ? rest : m)).replace(/\b(\w+)\s+\1\b/g, '$1');
  const blocks = data.bulk.map((b) => ({ ...b, name: blockName(b.name) })).flatMap(expandBlock);
  const dumpFor = (b, collection) => {
    const size = b.bytes - 4;
    const id = `bulk${b.at.map(hex).join('')}`;
    const mappings = size > 0 ? placed.filter((x) => x.address[0] === b.at[0] && x.address[1] === b.at[1] && x.address[2] >= b.at[2] && x.address[2] + x.width <= b.at[2] + size)
      .map((x) => { read.add(x.parameter); return { parameter: x.parameter.id, offset: x.address[2] - b.at[2], ...(x.parameter.encoding.type !== 'u7' && x.parameter.type !== 'choice' && x.parameter.type !== 'text' ? { codec: { type: x.parameter.encoding.type === 'nibbled' ? 'nibbled' : x.parameter.encoding.type, ...(x.parameter.encoding.nibbles ? { nibbles: x.parameter.encoding.nibbles } : {}) } } : {}) }; }) : [];
    const bc = b.bytes;
    return {
      id,
      name: b.name,
      kind: 'sysex',
      matcher: { prefix: ['F0', '43', '00', ...group, hex(bc >> 7), hex(bc & 127), model, ...b.at.map(hex)], suffix: ['F7'] },
      payload: { offset: 11, size },
      checksum: { type: 'roland-7bit', fromOffset: 7, toOffset: 10 + size, byteOffset: 11 + size },
      completion: { expectedMessages: collection ? collection.count : 1, expectedBytes: 13 + size, ...(collection ? { collectionId: collection.id } : {}) },
      mappings,
    };
  };
  // A Bulk Header begins a collection that runs to its Bulk Footer; a block outside one is asked for alone.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (/Bulk Header/i.test(b.name)) {
      let j = i;
      while (j < blocks.length && !/Bulk Footer/i.test(blocks[j].name)) j++;
      const members = blocks.slice(i, j + 1);
      const collection = { id: layout.pullName ?? 'editBuffer', count: members.length };
      for (const m of members) dumpDefinitions.push(dumpFor(m, collection));
      requests.push({ id: `request${(layout.pullName ?? 'editBuffer').replace(/^./, (c) => c.toUpperCase())}`, name: `Bulk dump request (${members.slice(1, -1).map((m) => m.name).join(', ')})`, kind: 'sysex', template: ['F0', '43', '20', ...group, model, ...b.at.map(hex), 'F7'], response: { kind: 'bulkDump', collectionId: collection.id }, timeoutMs: 3000, retries: 1 });
      i = j;
    } else {
      const d = dumpFor(b, null);
      dumpDefinitions.push(d);
      requests.push({ id: `request${camel(b.name).replace(/^./, (c) => c.toUpperCase())}`, name: `Bulk dump request (${b.name})`, kind: 'sysex', template: ['F0', '43', '20', ...group, model, ...b.at.map(hex), 'F7'], response: { dump: d.id }, timeoutMs: 3000, retries: 1 });
    }
  }
  for (const p of read) { p.access.canRead = true; if (p.access.source !== 'bulkDump') p.access.source = 'singleParameter'; }
  const unread = parameters.filter((p) => !read.has(p));

  for (const [why, list] of skipped) notes.push(`Left out, ${why}: ${list.join(', ')}.`);
  if (requests.length) notes.push(`Pull: ${requests.map((r) => r.name).join('; ')}. ${read.size} of ${parameters.length} parameters are read back${unread.length ? `; not in any block: ${unread.map((p) => p.name).join(', ')}` : ''}.`);

  const variables = { channel: 1, deviceId: 16, ...(layout.variables ?? {}) };
  const tests = [];
  const pick = [parameters.find((p) => p.type === 'choice'), parameters.find((p) => p.type === 'integer' && p.range.max > 1), parameters.find((p) => p.encoding.type === 'u14-msb-lsb' && p.type !== 'choice')].filter(Boolean);
  const valueBytes = (p, v) => (p.encoding.type === 'u14-msb-lsb' ? [v >> 7, v & 127] : p.encoding.type === 'nibbled' ? [3, 2, 1, 0].map((s) => (v >> (s * 4)) & 15) : [v]);
  for (const p of pick) {
    const choice = p.type === 'choice' ? p.choices.at(-1) : null;
    const v = choice ? choice.value : Math.min(p.range.max, Math.max(p.range.min, 100));
    tests.push({ name: `${p.group}: ${p.name} = ${choice ? choice.label : v}`, parameter: p.id, value: choice ? choice.id : v, expectedHex: ['F0', '43', hex(variables.deviceId), ...group, model, p.address, ...valueBytes(p, v).map(hex), 'F7'].join(' ') });
  }
  for (const r of requests) tests.push({ name: r.name, kind: 'request', request: r.id, expectedHex: r.template.join(' ') });
  // A dump made by hand from the block's own layout, its checksum worked out: every mapped value at
  // its lowest, but one choice at its last value and one number at its highest.
  const rich = [...dumpDefinitions].sort((a, b) => b.mappings.length - a.mappings.length)[0];
  if (rich?.mappings.length) {
    const data = new Array(rich.payload.size).fill(0);
    const expected = {};
    const byId = new Map(parameters.map((p) => [p.id, p]));
    const set = (m, v) => { valueBytes(byId.get(m.parameter), v).forEach((b, k) => { data[m.offset + k] = b; }); };
    for (const m of rich.mappings) {
      const p = byId.get(m.parameter);
      if (p.type === 'text') { 'INIT'.padEnd(p.encoding.length, ' ').split('').forEach((c, k) => { data[m.offset + k] = c.charCodeAt(0); }); expected[p.id] = 'INIT'; continue; }
      set(m, p.type === 'choice' ? p.choices[0].value : p.range.min);
    }
    const c = rich.mappings.map((m) => byId.get(m.parameter)).find((p) => p.type === 'choice');
    const n = rich.mappings.map((m) => byId.get(m.parameter)).find((p) => p.type !== 'choice' && p.type !== 'text');
    if (c) { set(rich.mappings.find((m) => m.parameter === c.id), c.choices.at(-1).value); expected[c.id] = c.choices.at(-1).id; }
    if (n) { set(rich.mappings.find((m) => m.parameter === n.id), n.range.max); expected[n.id] = n.range.max; }
    const head = rich.matcher.prefix.map((b) => parseInt(b, 16));
    const summed = [...head.slice(7), ...data];
    const sum = (128 - (summed.reduce((t, b) => t + b, 0) % 128)) % 128;
    tests.push({ name: `${rich.name}, read back`, kind: 'dumpParse', inputHex: [...head, ...data, sum, 0xf7].map(hex).join(' '), expectedValues: expected });
  }

  const reply = data.format.identityReply ?? [];
  const identity = reply.length >= 10 ? { requestDeviceId: '7F', manufacturerId: [reply[5]], familyCode: reply.slice(6, 8), modelNumber: reply.slice(8, 10), timeoutMs: 1000, retries: 0 } : null;
  const profile = {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Yamaha',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: data.sources.map((s) => ({
      type: 'manual',
      title: s.title,
      notes: `MIDI data format (pages ${layout.read.formatPages.join(', ')}) and data tables (pages ${layout.read.tablePages.join(', ')}) read by tools/profiles/yamaha/read-yamaha-pdf.mjs from ${s.file} (sha256 ${s.sha256}), ${s.url}. Not yet checked against the instrument itself.`,
    })),
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/yamaha/make-profiles.mjs; edit the layout in tools/profiles/yamaha/synths/, not this file.',
      'Every parameter is a row of the data list\'s MIDI parameter change tables, with its printed name. Nothing here has been sent to a real instrument yet.',
      `Parameter change: F0 43 1n ${group.join(' ')} ${model} <address> <data> F7, n the device number (the deviceId variable is 1n, 10H for device number 1); bulk dumps are asked for with 2n and answered with 0n, both taken as device number 1.`,
      identity ? `Identity: the reply the data list prints, ${reply.join(' ')}.` : 'No identity check: the data list prints no identity reply.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    ...(identity ? { identity } : {}),
    coverage: {
      singleParameterWrite: 'complete-for-the-data-list\'s-parameter-change-tables',
      realtimeEditing: 'complete-for-the-data-list\'s-parameter-change-tables',
      editBufferDumpRequest: requests.length ? 'complete: every bulk dump block the data list lists' : 'notImplemented',
      editBufferDumpParse: requests.length ? `${unread.length ? 'partial' : 'complete'}: ${read.size} of ${parameters.length} parameters` : 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'parameter changes the instrument sends are read by address; its control changes are not mapped',
      verifiedOnHardware: false,
      ...(layout.coverage ?? {}),
    },
    timing: { minDelayBetweenMessagesMs: layout.delayMs ?? 0 },
    messageRecipes: [recipe],
    parameters,
    tests,
    ...(requests.length ? { requests, dumpDefinitions, startup: { policy: 'pull', syncDirection: 'pull', sync: requests.map((r) => ({ request: r.id })) } } : {}),
  };
  return profile;
}

export { stringifyProfile };
