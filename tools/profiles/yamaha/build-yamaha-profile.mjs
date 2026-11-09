// build-yamaha-profile.mjs — a Yamaha transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What the data list says, and nothing it does not:
//
//   - every row of a MIDI PARAMETER CHANGE TABLE that prints a data range is a parameter, sent as
//     the parameter change the data format prints (F0 43 1n 7F 1C <model> <address> <data> F7; the
//     MX's F0 43 1n 7F 17 <address> <data> F7) at the row's address; `reserved` rows are not;
//   - the description column says what each value shows, in order. A list of names exactly as long
//     as the range (`00 – 04` beside `OFF, AMP, FILTER, PITCH, OSC`) is a choice; a range of numbers
//     as long as the data range (`28 – 58` beside `-24 – +24 (semitones)`) is the values shown; a
//     range in parts (`00 – 0F, 7F` beside `1 – 16, off`) is matched part for part. Anything else
//     is a number, and the description is said;
//   - a value over several bytes is read as the description says it is split: `1st bit 3-0 : bit
//     15-12` is four nibbles, `1st bit 6-0 : bit 13-7` two 7-bit halves; two bytes printed as a high
//     and a low range are two 7-bit halves when the description counts out exactly the values
//     between (`00 – 02` over `05 – 2C` beside `5 ... 300`);
//   - a name printed one character a row (`Voice Name1` … `Voice Name10`, `32 – 126 (ASCII)`) is one
//     text parameter, read from the bulk dump and not written: a parameter change carries one
//     parameter, and the data list does not say ten characters may go in one;
//   - an address byte printed as a placeholder (`31 op 00`) is expanded over the values the table's
//     note gives it (`op = operator number 00 – 03 (hex) OP1 – OP4`);
//   - Pull asks for each bulk dump block the BULK DUMP table lists, at its Bulk Header's address
//     where it has one, and reads every parameter whose address falls in a block back from it; the
//     checksum is the one the data format prints, over the model ID, address and data. A series
//     printed first and last (`Part 1` … `Part 4`) is a block for each; a header printed `0E mm nn`
//     is asked for at the edit buffer the layout picks from the Bulk Control table; the byte count is
//     what the data list says it counts (from the model ID onward, or the data alone).

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
// The MODX prints an arrow from a private-use font between a byte's bits and the value's (`1st bit6-0  bit13-7`).
const clean = (s) => String(s ?? '').replace(/[—−]/g, '–').replace(/[’‘]/g, "'").replace(/[\uf000-\uf8ff]/g, ':').replace(/\s+/g, ' ').trim();
const slug = (label) => label.toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';

/** `00 – 7F` -> [[0, 127]]; `00 – 0F, 7F` -> [[0, 15], [127, 127]]; `00, 20 – 7E` -> [[0, 0], [32, 126]]. */
export function readHexRange(text) {
  const parts = clean(text).split(/\s*,\s*/).filter(Boolean);
  if (!parts.length) return null;
  const out = [];
  for (const p of parts) {
    // Two digits a byte, or one (the MX's `0 – 2`).
    const m = /^([0-9A-F]{1,2})(?:\s*[–-]\s*([0-9A-F]{1,2}))?$/.exec(p);
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
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(current.trim()); current = ''; } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** `-24 – +24 (semitones)`, `-24 – +24 [semitones]` (the MOXF), `ALGO 1 – 12`, `-48 (-4 octave) – +48 (+4 octave)` -> { min, max, unit }. */
export function readShownRange(text) {
  const t = clean(text);
  const unit = /[([](semitones?|cent|cents|dB|%|Hz|ms|octave)[)\]]\s*$/i.exec(t)?.[1];
  const bare = t.replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  // Pan: `L64 – C – R63`.
  const pan = /^L(\d+)\s*–\s*C\s*–\s*R(\d+)$/.exec(bare);
  if (pan) return { min: -Number(pan[1]), max: Number(pan[2]) };
  // Through zero: `-64 – 0 – +63`.
  const through = /^([+-]?\d+)\s*–\s*0\s*–\s*([+-]?\d+)$/.exec(bare);
  if (through) return { min: Number(through[1]), max: Number(through[2]) };
  const m = /^(?:[A-Za-z.]+\s+)?([+-]?\d+)\s*(?:dB|%|cent|Hz|ms)?\s*–\s*([+-]?\d+)\s*(?:dB|%|cent|Hz|ms)?$/.exec(bare);
  if (!m) return null;
  const named = unit ? ({ db: 'dB', hz: 'Hz', semitone: 'semitones', cents: 'cent' }[unit.toLowerCase()] ?? unit.toLowerCase()) : null;
  return { min: Number(m[1]), max: Number(m[2]), ...(named ? { unit: named } : {}) };
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
    // `0: Voice, 1: Performance, …`, `00: 0dB, 01: +6dB`: the value printed before each name is left off.
    const numbered = named && items.every((x, i) => new RegExp(`^0*${from + i}\\s*[:=]\\s*\\S`).test(x));
    if (named) return { choices: items.map((label, i) => ({ value: from + i, label: numbered ? label.replace(/^\d+\s*[:=]\s*/, '') : label })) };
    const listed = from === 0 ? readValueList(to, items) : null;
    if (listed) return { choices: listed };
    return {};
  }
  // Counted out over the parts in turn: `00 – 10, 7F` beside `1 – 16, omni, off`.
  if (items.length !== parts.length) {
    const values = parts.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (u, i) => from + i));
    const listed = readValueList(values.length - 1, items);
    return listed ? { choices: listed.map((c, i) => ({ value: values[i], label: c.label })) } : {};
  }
  // Part for part: `00 – 0F, 7F` beside `1 – 16, off`.
  const choices = [];
  for (const [i, [from, to]] of parts.entries()) {
    if (from === to) { choices.push({ value: from, label: items[i].replace(new RegExp(`\\s*\\(${hex(from)}H?\\)$`), '') }); continue; }
    const shown = readShownRange(items[i]);
    if (!shown || shown.max - shown.min !== to - from) return {};
    for (let v = from; v <= to; v++) choices.push({ value: v, label: String(shown.min + (v - from)) });
  }
  return { choices };
}

/**
 * A list that counts out the range from 0, an item at a time: a name (one value), a range of
 * numbers (`1 – 95`, one value each), `0 = Preset` (that value), `2 – 9 = Library1 – 8` (those values,
 * named in turn). A range sharing one meaning (`1 – 127: Mono`) is not a list. Returns the choices,
 * or null when the items do not count out exactly 0 to `to`.
 */
export function readValueList(to, items) {
  const out = [];
  for (const item of items) {
    let m;
    const next = out.length;
    if ((m = /^(\d+)\s*[:=]\s*(\D*?)(\d+)\s*–\s*(\d+)\s*[:=]\s*\2(\d+)$/.exec(item))) {
      // `2 = Library1 … 9 = Library8`: the values between, named in turn.
      const [a, b, first] = [Number(m[1]), Number(m[4]), Number(m[3])];
      if (a !== next || b - a !== Number(m[5]) - first) return null;
      for (let v = a; v <= b; v++) out.push({ value: v, label: `${m[2]}${first + v - a}` });
    } else if ((m = /^(\d+)\s*–\s*(\d+)\s*[:=]\s*(.+)$/.exec(item))) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      const named = /^(.*?)(\d+)\s*–\s*(\d+)$/.exec(m[3].trim());
      if (a !== next || !named || Number(named[3]) - Number(named[2]) !== b - a) return null;
      for (let v = a; v <= b; v++) out.push({ value: v, label: `${named[1]}${Number(named[2]) + v - a}` });
    } else if ((m = /^(\d+)\s*[:=]\s*(.+)$/.exec(item))) {
      if (Number(m[1]) !== next) return null;
      out.push({ value: next, label: m[2].trim() });
    } else if (/\d\s*–\s*[+-]?\d/.test(item)) {
      const shown = readShownRange(item);
      if (!shown) return null;
      const prefix = /^([A-Za-z.]+)\s+[+-]?\d/.exec(item)?.[1];
      for (let n = shown.min; n <= shown.max; n++) out.push({ value: out.length, label: prefix ? `${prefix} ${n}` : String(n) });
    } else {
      out.push({ value: next, label: item });
    }
  }
  return out.length === to + 1 && out.length >= 2 ? out : null;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** Key 0 = C0 as the MOXF's drum keys print it (`Key C0` … `Key C6`, 00 – 48). */
export const noteName = (key) => `${NOTES[key % 12]}${Math.floor(key / 12)}`;
const noteNumber = (s) => { const m = /^([A-G]#?)(\d)$/.exec(s); return m ? NOTES.indexOf(m[1]) + 12 * Number(m[2]) : null; };

/**
 * The names of a series printed first and last (`Part 1` … `Part 16`, `Key C0` … `Key C6`), counted
 * out between them; numbered from 1 after the last's name when they do not count out.
 */
export function seriesNames(first, last, count) {
  const [a, b] = [/^(.*?)(\S+)$/.exec(first), /^(.*?)(\S+)$/.exec(last)];
  const prefix = b[1];
  if (/^\d+$/.test(a[2]) && /^\d+$/.test(b[2]) && Number(b[2]) - Number(a[2]) + 1 === count) return Array.from({ length: count }, (u, i) => `${prefix}${Number(a[2]) + i}`);
  const [na, nb] = [noteNumber(a[2]), noteNumber(b[2])];
  if (na !== null && nb !== null && nb - na + 1 === count) return Array.from({ length: count }, (u, i) => `${prefix}${noteName(na + i)}`);
  return Array.from({ length: count }, (u, i) => `${prefix}${i + 1}`);
}

// An address byte is printed, or a placeholder: the whole byte (`op`, `kk`), or a nibble each (`ep`:
// element in the high nibble, part in the low; `5p`: 50H plus the part).
const placeholderVars = (byte, holders) => (/^[0-9A-F]{2}$/.test(byte) ? [] : holders[byte] ? [byte] : byte.split('').filter((c) => !/[0-9A-F]/.test(c)));
const resolveByte = (byte, at, holders) => {
  if (/^[0-9A-F]{2}$/.test(byte)) return byte;
  if (holders[byte]) return hex(at[byte]);
  return hex(parseInt(byte.split('').map((c) => (/[0-9A-F]/.test(c) ? c : at[c].toString(16))).join(''), 16));
};
/** Every assignment of the placeholders `vars` over their values, each with the values' labels. */
const assignments = (vars, holders) => {
  let out = [{}];
  for (const v of vars) out = out.flatMap((at) => holders[v].values.map((value, i) => ({ ...at, [v]: value, [`${v}:label`]: holders[v].labels[i] })));
  return out;
};

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
  const skip = (why, what) => { const list = skipped.get(why) ?? []; if (!list.includes(what)) skipped.set(why, [...list, what]); };
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  // The bytes between the device number and the address, as the data format prints them: the group
  // number and model ID (7F 1C 03, the reface), or a model ID of two bytes (7F 17, the MX). A bulk dump
  // carries its byte count among them (`bb`), before the model ID or after it.
  const model = data.format.modelId;
  const group = data.format.group ?? ['7F', '1C'];
  const head = data.format.header ?? [...group, model];
  const bulkHead = data.format.bulkHeader ?? [...group, 'bb', 'bb', model];
  const recipe = { id: 'parameterChange', kind: 'sysex', template: ['F0', '43', '$deviceId', ...head, '$address', '$encodedValue', 'F7'] };
  const placed = [];   // { parameter, address: [H, M, L], width }

  // The bulk dump blocks, each where it starts and how many bytes of data it holds. The byte count is
  // printed as the data list says: from the model ID onward (the reface: the data and four bytes
  // more) or the data alone (the MOXF).
  const overhead = data.format.byteCount === 'data' ? 0 : 4;
  const expandBlock = (b) => {
    const [H, M, L] = b.address.map((x) => parseInt(x, 16));
    // A series printed first and last (`Part 1` … `Part 4 03`, `Key C0` … `Key C6 48`): a block for
    // each middle byte between.
    if (b.last) {
      const to = parseInt(b.last.mid, 16);
      const names = seriesNames(blockName(b.name), clean(b.last.name), to - M + 1);
      return names.map((name, i) => ({ ...b, name, at: [H, M + i, L] }));
    }
    // A block printed with placeholders (the MODX's `41 ep 00 [p: Part No. (0...15), e: Element No.
    // (0...7)]`): one for each value the layout gives them (its laid-out part's elements). A Bulk
    // Header's or Footer's `mm nn` is the edit buffer's, from the layout.
    const vars = b.frame ? [] : [...new Set(b.address.flatMap((x) => placeholderVars(x, blockHolders)))];
    if (vars.some((v) => !blockHolders[v])) { skip('bulk dump blocks printed with a placeholder the layout does not give, not read (their messages are let pass)', `${blockName(b.name)} (${b.address.join(' ')})`); return []; }
    if (vars.length) return assignments(vars, blockHolders).map((at) => ({ ...b, name: `${blockName(b.name)} ${vars.map((v) => at[`${v}:label`]).join(' ')}`, at: b.address.map((x) => parseInt(resolveByte(x, at, blockHolders), 16)) }));
    return [{ ...b, at: [H, M, L] }];
  };
  const blockHolders = { ...(layout.placeholders ?? {}), ...(layout.bulkPlaceholders ?? {}) };
  // The block column and the description run together: `COMMON TG Common`, `AUDIO IN PART Audio Part
  // (A/D)`, `QUICK SETUP CONFIG MIDI Config 1`. The label's words are left off up to the last the
  // description repeats (`TG Common`, `Audio Part (A/D)`, `MIDI Config 1`); `SYSTEM Common` keeps it.
  const blockName = (n) => clean(n)
    .replace(/^((?:[A-Z][A-Z0-9/+&]*\s+)+)(?=[A-Z][a-z])(.*)$/, (m, label, rest) => {
      const words = label.trim().split(/\s+/);
      const last = words.findLastIndex((w) => new RegExp(`\\b${w.replace(/[^A-Z0-9]/g, '')}\\b`).test(rest.toUpperCase()));
      return last < 0 ? m : [...words.slice(last + 1), rest].join(' ');
    })
    .replace(/\b(\w+)\s+\1\b/g, '$1');
  // A Bulk Header is at 0E, a Bulk Footer at 0F (the Bulk Control table's addresses), whatever the
  // row is called: the reface YC's data list prints its footer `Bulk`.
  const frameOf = (b) => (b.address[0] === '0E' || /Bulk Header/i.test(b.name) ? 'header' : b.address[0] === '0F' || /Bulk Footer/i.test(b.name) ? 'footer' : null);
  const blocks = data.bulk.map((b) => ({ ...b, frame: frameOf(b), label: clean(b.name).replace(/\s*Bulk (Header|Footer)?$/i, ''), name: frameOf(b) === 'footer' ? 'Bulk Footer' : blockName(b.name), size: Math.max(0, b.bytes - overhead) }))
    .flatMap(expandBlock)
    .map((b) => ({ ...b, name: layout.blockName?.(b.name, b.at) ?? b.name }));
  const blockAt = (address) => blocks.find((b) => b.at[0] === address[0] && b.at[1] === address[1] && address[2] >= b.at[2] && address[2] < b.at[2] + b.size);

  for (const table of data.tables) {
    const title = titleOf(table.title);
    const holders = { ...readPlaceholders(table.notes), ...(layout.placeholders ?? {}), ...(layout.tables?.[title]?.placeholders ?? {}) };
    const own = layout.tables?.[title] ?? {};
    if (own.skip) { skip(own.skip, title); continue; }
    const varsOf = (byte) => placeholderVars(byte, holders);
    const resolve = (byte, at) => resolveByte(byte, at, holders);
    // Rows run by the placeholders in their own address: a run of rows with the same ones is laid
    // out once per assignment of them (a Part row once per part, a Scene Part row once per scene and
    // part), and a row with none once.
    // A name printed once beside the rows that share it (`MTC strat offset` beside Hour, Minute, Second
    // and Frame): each takes it, with the word its description ends on.
    const tableRows = table.rows.map((r) => ({ ...r }));
    const endWord = (r) => /\(([A-Za-z]+)\)\s*$/.exec(clean(r.description))?.[1];
    for (let i = 1; i < tableRows.length; i++) {
      if (clean(tableRows[i].name) || !tableRows[i].range.length || !endWord(tableRows[i])) continue;
      let j = i - 1;
      while (j > 0 && !clean(table.rows[j].name)) j--;
      const base = clean(table.rows[j].name);
      if (!base) continue;
      tableRows[i].name = `${base} ${endWord(tableRows[i])}`;
      if (tableRows[j].name === table.rows[j].name && endWord(tableRows[j])) tableRows[j].name = `${base} ${endWord(tableRows[j])}`;
    }
    const runs = [];
    for (const row of tableRows) {
      const vars = [...new Set(row.address.flatMap(varsOf))];
      // `00 5n 00` and `00 6n 00` are different things numbered alike (a Quick Setup, an audio config).
      const key = row.address.filter((b) => varsOf(b).length).join(' ');
      if (runs.length && runs.at(-1).key === key) runs.at(-1).rows.push(row); else runs.push({ key, vars, rows: [row] });
    }
    for (const run of runs) {
      const unknown = run.vars.filter((v) => !holders[v]);
      if (unknown.length) { skip('an address byte printed as a placeholder neither its table nor the layout explains', run.rows.map((r) => `${title}: ${r.name} (${r.address.join(' ')})`).join(', ')); continue; }
      const instances = assignments(run.vars, holders);
    for (const at of instances) {
      const labels = run.vars.map((v) => at[`${v}:label`]);
      const inst = labels.length ? { label: labels.join(' ') } : null;
      const rows = run.rows;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowVars = run.vars;
        const address = row.address.map((b) => resolve(b, at));
        // The layout may name the group from the bulk dump block the row falls in.
        const groupName = own.groupOf?.(at, row, blockAt(address.map((b) => parseInt(b, 16)))) ?? (inst ? (own.group ? `${own.group} ${inst.label}` : inst.label) : own.group ?? titleCase(title));
        let name = clean(row.name);
        const label = `${groupName}: ${name} (${address.join(' ')})`;
        if (/^reserved$/i.test(name) || !row.range.length) { continue; }
        if (inst && rowVars.length && !own.groupOf && !own.group) name = /^OP\b/.test(name) && /^OP\d/.test(inst.label) ? name.replace(/^OP\b/, inst.label) : `${inst.label} ${name}`;
        // `1..16`, `0 .. 59 (Minute)`, `5 ... 300`, `-120 … +120`: a range printed with dots.
        const asPrinted = clean(row.description);
        const description = asPrinted.replace(/(\d)\s*(?:\.{2,3}|…)\s*(?=[+-]?\d)/g, '$1 – ');
        const describe = [];
        // Several switches in one byte (`bit 6: Off, On Assignable Knob 8 bit 5: …`): sending one means
        // knowing the others.
        if ((`${description} ${row.notes}`.match(/\bbit\s*\d+\s*:/g) ?? []).length >= 2) { skip('several settings packed in one byte, a bit each', label); continue; }
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
            description: `${n} characters, one per address from ${address.join(' ')}, ${asPrinted}. Read from the bulk dump; not written, since a parameter change carries one character.`,
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
          // A one-byte range wrapped over two lines (`00 –` over `11, 7F`).
          const parts = readHexRange(row.range.join(' '));
          if (!parts) { skip('a data range not read', `${label}: ${row.range.join('; ')}`); continue; }
          const values = readValues(parts, description);
          // A list longer than a menu (`Off, 1 – 95`, a controller number) is a number with its description.
          if (values.choices && values.choices.length > 32 && parts.length === 1) read = { min: parts[0][0], max: parts[0][1] };
          else if (values.choices) read = { choices: values.choices };
          else if (parts.length > 1) { skip('a data range in parts its description does not match', `${label}: ${row.range[0]} / ${description}`); continue; } else read = { min: parts[0][0], max: parts[0][1], ...values };
        } else {
          // Several bytes, split as the description says.
          const bounds = row.range.map((r) => readHexRange(r)?.[0]);
          if (bounds.length !== row.size || bounds.some((b) => !b)) { skip(`a value over ${row.size} bytes whose ranges are not printed one a byte`, label); continue; }
          if (row.size === 4 && /bit\s*3-0\s*:?\s*bit\s*15-?\s*12/.test(description)) {
            encoding = { type: 'nibbled', nibbles: 4 };
            read = { min: bounds.reduce((n, b) => (n << 4) | b[0], 0), max: bounds.reduce((n, b) => (n << 4) | b[1], 0) };
          } else if (row.size === 2 && /bit\s*6-0\s*:?\s*bit\s*13-7/.test(description)) {
            encoding = { type: 'u14-msb-lsb' };
            read = { min: (bounds[0][0] << 7) | bounds[1][0], max: (bounds[0][1] << 7) | bounds[1][1] };
            // What it shows: as wide as the range (`-128 – +127` over 0 - 255), or the values themselves (Tempo 30 - 300).
            const shown = readShownRange(description.replace(/\s*1st bit.*$/, ''));
            if (shown && shown.max - shown.min === read.max - read.min && shown.min !== read.min) read = { ...read, shown: { min: shown.min, max: shown.max }, ...(shown.unit ? { unit: shown.unit } : {}) };
            else if (shown && shown.min >= read.min && shown.max <= read.max) read = { min: shown.min, max: shown.max };
            name = name.replace(/^(.*?)\s+MSB\s+\1\s+LSB$/, '$1');
          } else if (row.size === 2 && readShownRange(description) && ((bounds[0][1] << 7) | bounds[1][1]) - ((bounds[0][0] << 7) | bounds[1][0]) === readShownRange(description).max - readShownRange(description).min) {
            // A high and a low 7-bit range whose description counts out exactly the values between
            // (Tempo, `00 – 02` over `05 – 2C` beside `5 ... 300`; `00 – 01` over `08 – 78` beside
            // `-120 … +120`).
            encoding = { type: 'u14-msb-lsb' };
            const shown = readShownRange(description);
            read = { min: (bounds[0][0] << 7) | bounds[1][0], max: (bounds[0][1] << 7) | bounds[1][1] };
            if (shown.min !== read.min) read = { ...read, shown: { min: shown.min, max: shown.max }, ...(shown.unit ? { unit: shown.unit } : {}) };
          } else { skip(`a value over ${row.size} bytes split in a way not read`, label); continue; }
          width = row.size;
          describe.push(/1st bit/.test(description) ? `${row.size} bytes: ${description.replace(/^.*?(1st bit)/, '$1')}.` : `${row.size} bytes, the high 7 bits first.`);
          const shownText = asPrinted.replace(/\s*1st bit.*$/, '');
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
        // The Default (HEX) column, where the data list prints one.
        const printed = /^([0-9A-F]{2})(?:\s+([0-9A-F]{2}))?(?:\s+([0-9A-F]{2}))?(?:\s+([0-9A-F]{2}))?(?:\s*\([0-9A-F]+\))?$/.exec(clean(row.default ?? ''));
        const defaultBytes = printed ? printed.slice(1).filter(Boolean).map((b) => parseInt(b, 16)) : null;
        const printedDefault = defaultBytes && defaultBytes.length === width
          ? (encoding.type === 'nibbled' ? defaultBytes.reduce((n, b) => (n << 4) | b, 0) : encoding.type === 'u14-msb-lsb' ? (defaultBytes[0] << 7) | defaultBytes[1] : defaultBytes[0])
          : null;
        let p;
        if (read.choices) {
          const seen = new Set();
          const list = read.choices.map(({ value, label: l }) => { const s = slug(l); const id = seen.has(s) ? `${s}_${value}` : s; seen.add(id); return { id, label: l, value }; });
          p = { ...base, ...(describe.length ? { description: describe.join(' ') } : {}), type: 'choice', default: (list.find((c) => c.value === printedDefault) ?? list[0]).id, choices: list, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'enum' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list.length === 2 ? 'ToggleButton' : list.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } };
        } else {
          const same = readShownRange(description);
          if (row.size === 1 && description && !read.shown && !(same && same.min === read.min && same.max === read.max)) describe.push(`Printed: ${asPrinted}.`);
          if (read.unit) describe.push(`In ${read.unit}.`);
          const bipolar = read.shown && read.shown.min < 0 && read.shown.max > 0;
          const zero = bipolar ? read.min - read.shown.min : null;
          p = {
            ...base,
            ...(describe.length ? { description: describe.join(' ') } : {}),
            type: bipolar ? 'bipolar' : 'integer',
            range: { min: read.min, max: read.max },
            default: printedDefault !== null && printedDefault >= read.min && printedDefault <= read.max ? printedDefault : zero ?? read.min,
            display: { mode: 'number', unit: read.unit === 'semitones' ? 'st' : read.unit === 'dB' ? 'dB' : '', shortLabel: camel(name), ...(read.shown ? { min: read.shown.min, max: read.shown.max } : {}) },
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
  }

  // Pull: the bulk dump blocks.
  const requests = [];
  const dumpDefinitions = [];
  const read = new Set();
  const isHex = (x) => /^[0-9A-F]{2}$/.test(x);
  const dumpFor = (b, collection) => {
    const size = b.size;
    const id = `bulk${b.at.map(hex).join('')}`;
    const mappings = size > 0 ? placed.filter((x) => x.address[0] === b.at[0] && x.address[1] === b.at[1] && x.address[2] >= b.at[2] && x.address[2] + x.width <= b.at[2] + size)
      .map((x) => ({ parameter: x.parameter, offset: x.address[2] - b.at[2], ...(x.parameter.encoding.type !== 'u7' && x.parameter.type !== 'choice' && x.parameter.type !== 'text' ? { codec: { type: x.parameter.encoding.type === 'nibbled' ? 'nibbled' : x.parameter.encoding.type, ...(x.parameter.encoding.nibbles ? { nibbles: x.parameter.encoding.nibbles } : {}) } } : {}) })) : [];
    const bc = b.bytes;
    const counted = bulkHead.indexOf('bb');
    const at = 3 + bulkHead.length + 3;   // F0 43 0n, the header, the address
    // The checksum adds up from the model ID (the reface, the MOXF) or from the byte count (the MX).
    const from = 3 + counted + (data.format.checksumFrom === 'byteCount' ? 0 : 2);
    return {
      id,
      name: b.name,
      kind: 'sysex',
      matcher: { prefix: ['F0', '43', '00', ...bulkHead.map((x, i) => (i === counted ? hex(bc >> 7) : i === counted + 1 ? hex(bc & 127) : x)), ...b.at.map(hex)], suffix: ['F7'] },
      payload: { offset: at, size },
      checksum: { type: 'roland-7bit', fromOffset: from, toOffset: at + size - 1, byteOffset: at + size },
      completion: { expectedMessages: collection ? collection.count : 1, expectedBytes: at + size + 2, ...(collection ? { collectionId: collection.id, ...(collection.endsWith ? { endsWith: collection.endsWith } : {}) } : {}) },
      mappings,
    };
  };
  const take = (d) => { for (const m of d.mappings) { read.add(m.parameter); m.parameter = m.parameter.id; } dumpDefinitions.push(d); return d; };
  const notAsked = [];
  // A Bulk Header begins a collection that runs to its Bulk Footer; a block outside one is asked for
  // alone, when it holds a parameter laid out here.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.frame === 'header') {
      let j = i;
      while (j < blocks.length && blocks[j].frame !== 'footer') j++;
      const pull = layout.pull?.[b.label];
      // The header's address as printed (the reface's 0E 0F 00), or, printed `0E mm nn`, the one the
      // layout picks from the Bulk Control table (the MOXF's Normal Voice Edit Buffer, 0E 0F 00).
      const header = pull?.header?.map((x) => parseInt(x, 16)) ?? (b.address.every(isHex) ? b.at : null);
      if (!header) { skip('a bulk dump whose header the data list prints as `0E mm nn` and the layout does not pick', b.label); i = j; continue; }
      const members = blocks.slice(i, j + 1).map((m) => (m.frame && !m.address.every(isHex) ? { ...m, at: [m.at[0], header[1], header[2]] } : m));
      const id = pull?.id ?? layout.pullName ?? 'editBuffer';
      // Complete at its Bulk Footer: the data list says the blocks between may come in any order and
      // not all of them, and a MODX part sends element, key or operator blocks as its type has.
      const footer = members.at(-1);
      const collection = { id, count: members.length, ...(footer.frame === 'footer' ? { endsWith: `bulk${footer.at.map(hex).join('')}` } : {}) };
      const dumps = members.map((m) => dumpFor(m, collection));
      if (!dumps.some((d) => d.mappings.length)) { notAsked.push(pull?.name ?? b.label); i = j; continue; }
      dumps.forEach(take);
      requests.push({ id: `request${id.replace(/^./, (c) => c.toUpperCase())}`, name: `Bulk dump request (${pull?.name ?? members.slice(1, -1).map((m) => m.name).join(', ')})`, kind: 'sysex', template: ['F0', '43', '20', ...head, ...members[0].at.map(hex), 'F7'], response: { kind: 'bulkDump', collectionId: collection.id }, timeoutMs: 3000, retries: 1 });
      i = j;
    } else {
      const d = dumpFor(b, null);
      if (!d.mappings.length) { notAsked.push(b.name); continue; }
      take(d);
      const rid = `request${camel(b.name).replace(/^./, (c) => c.toUpperCase())}`;
      requests.push({ id: requests.some((r) => r.id === rid) ? `${rid}${b.at.map(hex).join('')}` : rid, name: `Bulk dump request (${b.name})`, kind: 'sysex', template: ['F0', '43', '20', ...head, ...b.at.map(hex), 'F7'], response: { dump: d.id }, timeoutMs: 3000, retries: 1 });
    }
  }
  if (notAsked.length) notes.push(`Not asked for, holding no parameter laid out here: ${notAsked.join(', ')}.`);
  for (const p of read) { p.access.canRead = true; if (p.access.source !== 'bulkDump') p.access.source = 'singleParameter'; }
  const unread = parameters.filter((p) => !read.has(p));

  for (const [why, list] of skipped) notes.push(`Left out, ${why}: ${list.join(', ')}.`);
  const unreadGroups = [...new Set(unread.map((p) => p.group))];
  if (requests.length) notes.push(`Pull: ${requests.map((r) => r.name).join('; ')}. ${read.size} of ${parameters.length} parameters are read back${unread.length ? `; not in any block: ${unread.length > 12 ? `${unread.length} parameters, in ${unreadGroups.join(', ')}` : unread.map((p) => p.name).join(', ')}` : ''}.`);

  const variables = { channel: 1, deviceId: 16, ...(layout.variables ?? {}) };
  const tests = [];
  const pick = [parameters.find((p) => p.type === 'choice'), parameters.find((p) => p.type === 'integer' && p.range.max > 1), parameters.find((p) => p.encoding.type === 'u14-msb-lsb' && p.type !== 'choice')].filter(Boolean);
  const valueBytes = (p, v) => (p.encoding.type === 'u14-msb-lsb' ? [v >> 7, v & 127] : p.encoding.type === 'nibbled' ? [3, 2, 1, 0].map((s) => (v >> (s * 4)) & 15) : [v]);
  for (const p of pick) {
    const choice = p.type === 'choice' ? p.choices.at(-1) : null;
    const v = choice ? choice.value : Math.min(p.range.max, Math.max(p.range.min, 100));
    tests.push({ name: `${p.group}: ${p.name} = ${choice ? choice.label : v}`, parameter: p.id, value: choice ? choice.id : v, expectedHex: ['F0', '43', hex(variables.deviceId), ...head, p.address, ...valueBytes(p, v).map(hex), 'F7'].join(' ') });
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
    const prefix = rich.matcher.prefix.map((b) => parseInt(b, 16));
    const summed = [...prefix.slice(rich.checksum.fromOffset), ...data];
    const sum = (128 - (summed.reduce((t, b) => t + b, 0) % 128)) % 128;
    tests.push({ name: `${rich.name}, read back`, kind: 'dumpParse', inputHex: [...prefix, ...data, sum, 0xf7].map(hex).join(' '), expectedValues: expected });
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
      `Parameter change: F0 43 1n ${head.join(' ')} <address> <data> F7, n the device number (the deviceId variable is 1n, 10H for device number 1); bulk dumps are asked for with 2n and answered with 0n, both taken as device number 1.`,
      identity ? `Identity: the reply the data list prints, ${reply.join(' ')}.` : `No identity check: ${layout.noIdentity ?? 'the data list prints no identity reply'}.`,
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
