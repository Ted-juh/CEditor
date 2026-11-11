// build-kronos-profile.mjs — a KRONOS-style object table's transcription (tables/<name>.json, from
// import-kronos.mjs) and a layout (synths/<name>.mjs) -> a CEditor device profile. The KRONOS and the
// NAUTILUS publish their MIDI Implementations this way.
//
// What the archive says, and nothing it does not:
//
//   - every row with a parameter id is a parameter, sent by Parameter Change (function 43: the
//     exclusive header its block prints, then `43 TYP SOC SUB PID IDX valueH valueM valueL F7`), its
//     value 21 bits, two's complement, high byte first (*4; the KRONOS's voice model files: "21-bit
//     signed value, MSB first"); a PID above 126 takes the message's second form, `7F PIDH PIDL`
//     (the instrument still receives it);
//   - the table prints no message per row. Where the archive has a parameter change of its own for
//     some groups (the KRONOS's KARMA and Drum Track ones), the layout routes those groups to it
//     (`functions`), and the profile says, per group, whether their ids are also ones Parameter
//     Change takes for other rows (so they cannot be sent by it) or whether the message's name alone
//     sends them there. Groups the archive leaves undecided are left out (`leaveOut`), with the same
//     count. The builder checks that every id it sends is unique per message;
//   - its range is the row's data(hex): `00~7F` is 0~127, and a range whose first value is the larger
//     (`9D~63`, `FF39~00C7`) is two's complement over its bytes, -99~+99 and -199~+199;
//   - it is a choice where the row names both of two values (`00~01 | Off~On`), with the names as
//     printed: the value column is 19 characters wide, and a name it cuts short keeps its cut, shown
//     with an ellipsis; and where its ends are the ends of a list the archive prints in full (the
//     KRONOS voice model's AMS sources: `00~30 | Off~Tempo` is sources 0~48, Off to Tempo);
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
  // The NAUTILUS's QuickAccess rows print `0 ~ 5C`: spaced, the digits not padded to a byte.
  const m = /^([0-9A-F]+)\s*~\s*([0-9A-F]+)((?:\s*,\s*[0-9A-F]+)*)$/.exec(cell);
  if (!m) return null;
  let [, lo, hi, extra] = m;
  if (lo.length <= 2 && hi.length <= 2) [lo, hi] = [lo.padStart(2, '0'), hi.padStart(2, '0')];
  if (lo.length !== hi.length || lo.length % 2) return { cut: true };   // `80000000~7FFF`: the column's end
  const bytes = lo.length / 2;
  let min = Number.parseInt(lo, 16);
  const max = Number.parseInt(hi, 16);
  const signed = min > max;
  if (signed) min -= 2 ** (bytes * 8);
  return { min, max, bytes, signed, extra: extra ? extra.split(',').map((s) => s.trim()).filter(Boolean) : [] };
}

/** The bit column: blank is the whole byte, `6` one bit, `5~0` bits 0 to 5 (Global prints `0~1`, low first). */
export function readBits(cell) {
  if (!cell) return { from: 0, bits: 8 };
  const m = /^(\d)(?:~(\d))?$/.exec(cell);
  if (!m) throw new Error(`bit "${cell}"`);
  const [a, b] = [Number(m[1]), m[2] === undefined ? Number(m[1]) : Number(m[2])];
  return { from: Math.min(a, b), bits: Math.abs(a - b) + 1 };
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
  const ams = data.voiceModel?.amsSources ?? [];
  const bigEndian = data.rows.some((r) => /Big Endian/.test(r.note ?? ''));

  const header = exclusiveHeader(data);
  const routeOf = (row) => (layout.functions ?? []).find((f) => f.group.test(row.group))?.code ?? '43';
  const leaveOutOf = (row) => (layout.leaveOut ?? []).find((l) => l.group.test(row.group));
  const longForm = new Set();

  // Value lists a range's two ends can name in full: the voice model's AMS sources, and the EXi
  // engines by number (`00~09 | Off~EP-1`).
  const lists = [ams, (data.engines ?? []).map((e) => ({ value: e.number, label: e.name }))].filter((l) => l.length);
  const listFor = (labels, read) => lists.find((l) => l[read.min]?.label === labels[0] && l[read.max]?.label === labels[1]);

  // A name printed for several settings of one group is numbered in the order printed: the chord pads'
  // eight notes, the 32 GE real-time parameters.
  const engineRows = engineSettings(data, layout);
  // Global's group cells print `USB    Input L`: runs of spaces are one.
  const tidy = (r) => (/\s{2,}/.test(r.group ?? '') || /\s{2,}/.test(r.name ?? '') ? { ...r, group: r.group.replace(/\s+/g, ' '), name: r.name.replace(/\s+/g, ' ') } : r);
  const rows = [...data.rows.map(tidy), ...engineRows.rows];
  const named = (row) => {
    const rename = (layout.renames ?? []).find((r) => r.group.test(row.group) && r.name === row.name && r.pid === row.id?.[3]);
    return rename ? rename.to : row.name;
  };
  const keyOf = (row) => `${row.group}\u0000${named(row)}`;
  const counts = new Map();
  for (const row of rows) if (row.id && row.name) counts.set(keyOf(row), (counts.get(keyOf(row)) ?? 0) + 1);
  const seen = new Map();

  // An id the table prints for more than one setting, unmarked (the EXi program's Chain Switch and
  // Chain Level, which the HD-1 table marks `* Chain Level`): which value means which it does not say.
  const sameId = new Map();
  for (const row of data.rows) {
    if (!row.id || !row.group || !row.name || readData(row.data)?.fixed || noteReason(row.note) || leaveOutOf(row)) continue;
    const key = `${routeOf(row)} ${row.id.join(' ')}`;
    sameId.set(key, [...(sameId.get(key) ?? []), row]);
  }
  const sharedId = (row) => {
    const same = sameId.get(`${routeOf(row)} ${row.id.join(' ')}`);
    if (!(same?.length > 1)) return null;
    // Numbered copies of one setting (Global's 128 External Sets) share a reason, so one note says it.
    const patterns = new Set(same.map((r) => `${r.group} ${r.name}`.replace(/\d+/g, '#')));
    return patterns.size === 1
      ? `the table prints one id for each setting of its ${same.length} numbered copies ("${[...patterns][0]}"), unmarked, and does not say which copy is meant`
      : `the table prints one id for ${same.map((r) => `${r.group} ${r.name}`).join(' and ')}, unmarked, and does not say which value means which`;
  };

  // A row the dump holds and no parameter change sets (the EXi slots' Algorithm Type): read, not sent.
  const readOnlyRow = (row) => {
    const read = readData(row.data);
    const labels = readLabels(row.value);
    const list = labels && read && !read.signed ? listFor(labels, read) : null;
    const label = `${row.group} ${row.name}`;
    const id = `${camel(row.group)}.${camel(row.name)}`;
    ids.add(id);
    const choices = list?.slice(read.min, read.max + 1).map((s) => ({ id: camel(s.label) || `v${s.value}`, label: s.label, value: s.value }));
    parameters.push({
      id,
      name: label,
      group: row.group,
      description: `Offset ${row.ofs}. Read from the dump; the table prints no parameter id for it, so it is not sent.`,
      access: { canRead: true, canWrite: false, realtimeSafe: false, source: 'bulkDump' },
      ...(choices
        ? { type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(row.name) }, encoding: { type: 'enum' } }
        : { type: 'integer', range: { min: read.min, max: read.max }, default: read.min, display: { mode: 'number', unit: '', shortLabel: camel(row.name) }, encoding: { type: 'u7' } }),
    });
    mappings.push({ parameter: id, offset: row.ofs, codec: { type: 'bitfields', parts: [{ at: 0, from: 0, bits: 8, shift: 0 }] }, read, bits: { from: 0, bits: 8 } });
    readOnly.push(label);
  };
  const readOnly = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.id && row.group && (layout.readOnly ?? []).includes(row.name)) { readOnlyRow(row); continue; }
    if (!row.id || !row.group) continue;          // a further byte of the value above, with its own id
    if (engineRows.shared.has(row)) { leave(leftOut, engineRows.shared.get(row), `${row.group} ${row.name}`); continue; }
    if (!row.engine && row.name && sharedId(row) && !readData(row.data)?.fixed && !noteReason(row.note) && !leaveOutOf(row)) { leave(leftOut, sharedId(row), `${row.group} ${row.name}`); continue; }
    if (!row.name) { leave(leftOut, 'printed with a group and no name', `${row.group} (offset ${row.ofs})`); continue; }
    const key = keyOf(row);
    const nth = (seen.get(key) ?? 0) + 1;
    seen.set(key, nth);
    const leaf = counts.get(key) > 1 ? `${named(row)} ${nth}` : named(row);
    const label = `${row.group} ${leaf}`;
    const read = readData(row.data);
    if (read?.fixed) { fixed.push(label); continue; }
    const out = leaveOutOf(row);
    if (out) { leave(leftOut, out.why, label); continue; }
    const why = noteReason(row.note) ?? (!row.data ? 'no range printed (data(hex) is blank)' : !read ? `data printed "${row.data}"` : read.cut ? 'its data(hex) cell is cut short' : null);
    if (why) { leave(leftOut, why, label); continue; }
    // A row with an id and neither group nor name after this one is a further byte of its value.
    if (rows[i + 1]?.id && !rows[i + 1].group && !rows[i + 1].name && rows[i + 1].ofs !== row.ofs) { leave(leftOut, 'its value spreads over bytes with ids of their own', label); continue; }

    const bits = readBits(row.bit);
    // A field read back must fit its bits (an engine's may run on into the next byte, and is not read):
    // one that does not is sent, its value not depending on them, and not read back.
    const misfit = !row.engine && ((read.bytes > 1 && row.bit) || (read.bytes === 1 && (read.signed ? read.max - read.min : read.max) >= 2 ** bits.bits));
    const [typ, soc, sub, pid, idx] = row.id;
    const idBytes = pid < 127 ? [typ, soc, sub, pid, idx] : [typ, soc, sub, 0x7f, (pid >> 7) & 0x7f, pid & 0x7f, idx];
    const fn = routeOf(row);
    // An engine's ids are the slot's, whatever engine is in it: another engine's setting may send the
    // same message, so the recipe names the engine.
    const recipeId = `${fn === '43' ? 'pc' : `pc${fn}_`}${idBytes.map(hex).join('')}${row.engine ? `_${camel(row.engine)}` : ''}`;
    if (recipes.has(recipeId)) throw new Error(`${label}: parameter id ${idBytes.map(hex).join(' ')} twice for function ${fn}`);

    const labels = readLabels(row.value);
    const inverted = /bypass, Invert Value/.test(row.note ?? '');
    let choices = null;
    if (labels && read.min === 0 && read.max === 1 && !labels.every((l, n) => numberLabel(l, n))) {
      // `* -> bypass, Invert Value`: the switch is sent as its effect's bypass, On as 0.
      choices = labels.map((l, n) => ({ id: camel(l.replace('…', '')) || `v${n}`, label: l, value: inverted ? 1 - n : n }));
    } else if (labels && read.min === 0 && !read.signed && listFor(labels, read)) {
      const used = new Set();
      choices = listFor(labels, read).slice(0, read.max + 1).map((s) => {
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
    recipes.set(recipeId, { id: recipeId, kind: 'sysex', template: [...header, fn, ...idBytes.map(hex), ...(choices ? ['00', '00'] : []), '$encodedValue', 'F7'] });
    if (pid >= 127) longForm.add(recipeId);

    if (misfit) { leave(notReadBack, 'its bits are printed narrower than its range (`bit 0` for `00~02`), so where its value ends in the byte is not said', `${label} (bit ${row.bit}, ${row.data})`); continue; }
    if (row.engine) { leave(notReadBack, `an EXi engine's own setting: ${layout.document.engines} gives its offset inside the engine's block, and the program table prints the block only as reserved bytes, without saying where the engine's table begins in it`, label); continue; }
    if (read.bytes > 1) { leave(notReadBack, bigEndian ? 'a value over two bytes: the archive marks only the KARMA Start Seed\'s bytes `Big Endian` and does not say the order of the others' : 'a value over two bytes, whose byte order the archive does not say', label); continue; }
    if (read.extra.length) { leave(notReadBack, `a value the dump may hold as ${read.extra.join(', ')}, which the parameter does not offer`, label); continue; }
    const codec = { type: 'bitfields', ...(read.signed ? { signed: true } : {}), parts: [{ at: 0, from: bits.from, bits: bits.bits, shift: 0 }], ...(inverted ? { map: [[0, 1], [1, 0]] } : {}) };
    mappings.push({ parameter: parameter.id, offset: row.ofs, codec, read, bits });
    parameter.access.canRead = true;
  }

  const routing = routingNotes(data, layout, { routeOf, leaveOutOf });
  return shell(data, layout, { header, parameters, recipes, mappings, leftOut, notReadBack, fixed, longForm, routing, readOnly, engineNotes: engineRows.notes });
}

/**
 * Prog_EXi.txt's engines, as rows of the program for each slot the layout names (`engineSlots`: EXi1
 * with TYP 11, EXi2 with 12): grouped `EXi1 AL-1 [LFO1]`, the id the slot's TYP and the row's four
 * bytes. Each engine's rows are checked against the count its heading prints. An id the table prints
 * for several of an engine's settings (the EP-1's effects, one meaning per effect type) is `shared`,
 * with the reason it is left out.
 */
function engineSettings(data, layout) {
  const rows = [];
  const shared = new Map();
  const sharedRows = [];
  const notes = [];
  if (!data.engines || !layout.engineSlots) return { rows, shared, notes };
  for (const engine of data.engines) {
    if (engine.printedCount !== undefined && engine.printedCount !== engine.rows.length) throw new Error(`${engine.name}: ${engine.rows.length} rows where its heading prints ${engine.printedCount}`);
    const byId = new Map();
    for (const r of engine.rows.filter((x) => x.id)) byId.set(r.id.join(' '), [...(byId.get(r.id.join(' ')) ?? []), r]);
    for (const slot of layout.engineSlots) {
      for (const r of engine.rows) {
        if (!r.id) continue;
        if (r.typ !== '11/12') throw new Error(`${engine.name} ${r.name}: TYP printed ${r.typ}`);
        const m = /^(\[[^\]]+\])\s*(.*)$/.exec(r.name);
        const row = {
          line: r.line, ofs: r.ofs, ...(r.bit ? { bit: r.bit } : {}),
          group: `${slot.label} ${engine.name}${m ? ` ${m[1]}` : ''}`,
          name: m ? m[2] || m[1] : r.name,
          data: r.data, value: r.value, id: [slot.typ, ...r.id], ...(r.note ? { note: r.note } : {}),
          engine: engine.name,
        };
        rows.push(row);
        if (byId.get(r.id.join(' ')).length > 1) sharedRows.push(row);
      }
    }
    // One reason per engine: the blocks whose settings share their ids (the EP-1's effects).
    const blocks = [...new Set(engine.rows.filter((r) => r.id && byId.get(r.id.join(' ')).length > 1).map((r) => /^(\[[^\]]+\])/.exec(r.name)?.[1] ?? r.name))];
    for (const row of sharedRows.splice(0)) shared.set(row, `${engine.name} prints the same ids for the settings of ${blocks.length} blocks (${blocks.join(', ')}), one meaning per block chosen`);
    if (engine.rows.length) notes.push(`${engine.name} ${engine.rows.length}`);
  }
  return { rows, shared, notes };
}

/**
 * Preset recall from the implementation's receive table of banks (Bank Map KORG): a bank per Bank
 * Select MSB and LSB the object's column names, 128 programs each by Program Change. A run of LSBs
 * (`79,01-09 : g(1)-g(9)`) is a bank each; a second select for a bank already reached (`38,00 : G`
 * beside `79,00 : G`) is named in the notes and not offered. The banks numbered 001~128 are the GM
 * ones, read-only (*2 of the SysEx text: `GM, g(1)-g(9), g(d) (read-only)`).
 */
export function presetBanks(banks, column, objectName) {
  const kept = [];
  const alternates = [];
  for (const b of banks ?? []) {
    const c = b[column];
    if (!c) continue;
    const from = Number.parseInt(b.lsb, 16);
    const lsbs = b.lsbTo ? Array.from({ length: Number.parseInt(b.lsbTo, 16) - from + 1 }, (unused, i) => from + i) : [from];
    let labels = [c.label];
    if (b.lsbTo) {
      const run = /^(\D*)(\d+)(\D*)-\1(\d+)\3$/.exec(c.label);
      if (!run || Number(run[4]) - Number(run[2]) + 1 !== lsbs.length) throw new Error(`banks ${b.msb},${b.lsb}-${b.lsbTo}: "${c.label}" is not one name per LSB`);
      labels = lsbs.map((unused, i) => `${run[1]}${Number(run[2]) + i}${run[3]}`);
    }
    lsbs.forEach((lsb, i) => {
      const gm = c.first === 1;
      if (kept.some((k) => k.name === labels[i] && k.gm === gm)) { alternates.push(`${b.msb},${hex(lsb)} (${labels[i]})`); return; }
      kept.push({ name: labels[i], gm, msb: Number.parseInt(b.msb, 16), lsb, count: c.last - c.first + 1 });
    });
  }
  let slot = 0;
  const out = kept.map((k) => {
    const bank = {
      id: camel(`${objectName} ${k.gm ? 'gm ' : ''}${k.name.replace(/[()]/g, ' ')}`),
      label: `${objectName} ${k.name}${k.gm ? ' (001-128)' : ''}`,
      role: k.gm ? 'factory' : 'user',
      writable: false,
      startSlot: slot,
      slotCount: k.count,
      programBase: 0,
      bankMsb: k.msb,
      bankLsb: k.lsb,
    };
    slot += k.count;
    return bank;
  });
  return { banks: out, alternates };
}

/** Which TYP each EXi slot's rows of the program table print: `EXi1 Mod.Mixer1 Type` with 11, EXi2's 12. */
function slotEvidence(data, layout) {
  return (layout.engineSlots ?? []).map((slot) => {
    const row = data.rows.find((r) => r.id && r.group.startsWith(`${slot.label} Mod.Mixer`));
    if (!row || row.id[0] !== slot.typ) throw new Error(`${layout.name}: the program table's ${slot.label} rows do not take TYP ${slot.typ}`);
    return `${row.group} ${row.name}, TYP ${row.id[0]}`;
  });
}

/** The object the table is, by its number in *1: 00 Program (the default), 01 Combination, … */
const objectOf = (layout) => layout.object ?? { code: '00', name: 'Program' };

/** `F0, 42, 3g, 68` (or `F0, 42, 3g, 00, 01, 5D`) from the Parameter Change block, 3g as the device id. */
export function exclusiveHeader(data) {
  const header = (lines) => {
    const line = (lines ?? []).find((l) => /Excl Header\s*$/.test(l));
    return line ? line.replace(/Excl Header\s*$/, '').split(',').map((t) => t.trim()).filter(Boolean) : null;
  };
  const printed = header(data.messages.parameterChange);
  if (!printed || printed[0] !== 'F0' || printed[1] !== '42' || printed[2] !== '3g') throw new Error('archive: the exclusive header no longer reads F0, 42, 3g, …');
  for (const key of ['currentObjectDumpRequest', 'currentObjectDump']) {
    if (header(data.messages[key])?.join(' ') !== printed.join(' ')) throw new Error(`archive: ${key} prints another exclusive header`);
  }
  return printed.map((t) => (t === '3g' ? '$deviceId' : t.toUpperCase()));
}

/**
 * What decides each routed or left-out group's message: how many of its rows share an id with a row
 * Parameter Change (43) sends. Those cannot go by 43; a group with none goes by its message's name.
 */
function routingNotes(data, layout, { routeOf, leaveOutOf }) {
  const settings = data.rows.filter((r) => r.id && r.name && !readData(r.data)?.fixed && !noteReason(r.note));
  const by43 = new Map();
  for (const r of settings) if (routeOf(r) === '43' && !leaveOutOf(r)) by43.set(r.id.join(' '), r);
  const tally = (rows) => {
    const groups = new Map();
    for (const r of rows) {
      const g = groups.get(r.group) ?? { rows: 0, shared: 0, example: null };
      g.rows++;
      const other = by43.get(r.id.join(' '));
      if (other) { g.shared++; g.example ??= `${r.id.join(' ')} is ${r.group} ${r.name} and ${other.group} ${other.name}`; }
      groups.set(r.group, g);
    }
    return [...groups].map(([group, g]) => `${group}, ${g.shared} of ${g.rows}${g.example ? ` (${g.example})` : ''}`).join('; ');
  };
  const notes = (layout.functions ?? []).map((f) => {
    const rows = settings.filter((r) => routeOf(r) === f.code && !leaveOutOf(r));
    return `The rows of ${f.group.source.replace(/^\^/, '').trim()}… go by ${f.message} (function ${f.code}), the same message as Parameter Change under another code. The table prints no message per row. Per group, the rows whose ids Parameter Change also takes for another row, and so cannot go by it: ${tally(rows)}. A group goes by one message: one with such rows cannot go by Parameter Change, and one with none goes by ${f.code} on the message's name alone. A reading, not tried on an instrument.`;
  });
  for (const l of layout.leaveOut ?? []) {
    const rows = settings.filter((r) => leaveOutOf(r) === l);
    notes.push(`Left out, ${l.label}: per group, the rows whose ids Parameter Change also takes for another row: ${tally(rows)}.`);
  }
  return notes;
}

/** What the builder relies on, checked against the archive's own words so a new release cannot slip by. */
function checkMessages(data, layout) {
  const has = (lines, re, what) => {
    if (!(lines ?? []).some((l) => re.test(l))) throw new Error(`${layout.name} archive: ${what} no longer reads as expected`);
  };
  const m = data.messages;
  has(m.parameterChange, /^\s*43\s+Function/, 'Parameter Change (function 43)');
  has(m.parameterChange, /^\s*valueH\s+Value\s+\(bit14-20\)/, 'the parameter change\'s value, high byte first');
  // The KARMA and Drum Track parameter changes: the same five id bytes and value as function 43.
  for (const f of layout.functions ?? []) {
    has(m[f.code], new RegExp(`^\\[${f.code}\\] ${f.message}\\b`), `${f.message} (function ${f.code})`);
    const fields = (lines) => lines.map((l) => /^\s+(\S+)\s{2,}/.exec(l)?.[1]).filter(Boolean).join(' ');
    if (fields(m[f.code]).replace(f.code, '43') !== fields(m.parameterChange.slice(0, m.parameterChange.findIndex((l) => /End of Excl/.test(l)) + 1))) {
      throw new Error(`${layout.name} archive: ${f.message} is no longer laid out as Parameter Change`);
    }
  }
  has(m.parameterChange, /^\s*7F\s+part of parameter id/, 'the second form of the parameter id');
  if (data.voiceModel) {
    has(data.voiceModel.messageFormats, /21-bit signed value, MSB first/, 'the voice model\'s value format');
    has(data.voiceModel.messageFormats, /7F pp pp: \(14-bit, MSB first\)/, 'the voice model\'s long parameter id');
  }
  for (const code of layout.citedMessages ?? []) has(m[code], new RegExp(`^\\[${code}\\]`), `the block of function ${code}`);
  has(m.value, /21-bit 2's complement/, 'footnote *4');
  has(m.currentObjectDumpRequest, /^\s*74\s+Function/, 'Current Object Dump Request (function 74)');
  has(m.currentObjectDump, /^\s*version\s+obj's version number/, 'the Current Object Dump\'s version byte');
  // *1 numbers the objects (`obj = 00 : Program (…, Prog_HD-1.txt)`); where a line names files, the
  // table's must be among them (the NAUTILUS prints `01 : Combination` without).
  const { code, name } = objectOf(layout);
  const line = (m.objects ?? []).find((l) => new RegExp(`(?:obj =|^)\\s*${code} : ${name}\\b`, 'i').test(l));
  if (!line || (line.includes('(') && !line.includes(data.source.file.split('/').at(-1)))) throw new Error(`${layout.name} archive: object ${code} as the ${name.toLowerCase()} no longer reads as expected`);
  has(m.packing, /0GFEDCBA/, 'the 8-in-7 packing');
  has(m.packing, /sysExSize = binarySize \+ \(binarySize\+6\)\/7/, 'the packed size');
}

function shell(data, layout, { header, parameters, recipes, mappings, leftOut, notReadBack, fixed, longForm, routing, readOnly = [], engineNotes = [] }) {
  const object = data.object;
  const instrument = layout.family;
  const packed = object.size + Math.floor((object.size + 6) / 7);
  const { code, name: objectName } = objectOf(layout);
  const kind = objectName.toLowerCase();
  const prefix = [...header, '75', code, hex(object.objectVersion)];
  const request = [...header, '74', code, 'F7'];
  const requestId = `requestCurrent${objectName}`;
  const dumpId = `current${objectName}Dump`;
  const device = (t) => (t === '$deviceId' ? '30' : t);

  // The Device Inquiry reply as printed: after KORG's 42, the two bytes where the universal reply puts
  // the family code, then the two of the member code; a byte printed as a letter varies (`mm`, one
  // per model) and is not checked.
  const reply = data.identity?.reply ?? [];
  if (reply.slice(0, 6).join(' ') !== 'F0 7E 0g 06 02 42') throw new Error(`${layout.name}: the Device Inquiry reply no longer reads F0,7E,0g,06,02,42`);
  const fixedByte = (b) => /^[0-7][0-9A-F]$/.test(b);
  const familyCode = reply.slice(6, 8);
  const modelNumber = reply.slice(8, 10);
  if (!familyCode.every(fixedByte)) throw new Error(`${layout.name}: the reply's family bytes are not printed as values`);
  const checked = modelNumber.every(fixedByte) ? [...familyCode, ...modelNumber] : familyCode;
  const members = (data.identity.members ?? []).map((m) => `${m.model.replace(/\s+/g, ' ')} ${m.code}H`);
  const universalLength = 15;

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
  const sendable = parameters.filter((p) => p.access.canWrite);
  const integers = sendable.filter((p) => p.type === 'integer');
  const picks = [
    [integers.find((p) => p.range.min === -99), (p) => p.range.min],
    [integers.find((p) => p.range.min <= -5000), (p) => p.range.min],
    [integers.find((p) => p.range.max > 16383), (p) => p.range.max],
    [sendable.find((p) => p.description.includes('bypass')), (p) => p.choices[0].id],
    [sendable.find((p) => p.type === 'choice' && p.choices.length > 2), (p) => p.choices.at(-1).id],
    [sendable.find((p) => longForm.has(p.messageRecipe)), (p) => (p.type === 'choice' ? p.choices.at(-1).id : p.range.max)],
    [sendable.find((p) => p.type === 'choice' && p.choices.length === 2), (p) => p.choices.at(-1).id],
    [integers.find((p) => p.range.min >= 0 && p.range.max > 1), (p) => p.range.max],
    ...(layout.functions ?? []).map((f) => [integers.find((p) => recipeOf(p).template[header.length] === f.code), (p) => p.range.max]),
    // An engine's own setting in each slot: its recipe names the engine.
    ...(layout.engineSlots ?? []).map((slot) => [integers.find((p) => p.group.startsWith(`${slot.label} `) && /_[a-z]/.test(p.messageRecipe) && p.range.min < 0), (p) => p.range.min]),
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
    mappings.find((m) => m.codec.signed && m.read.min === -99) ?? mappings.find((m) => m.codec.signed),
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
  if (wire.length !== packed) throw new Error(`${layout.name}: packed ${wire.length} bytes, *3 says ${packed}`);

  const presets = presetBanks(data.banks, kind, objectName);
  // The GM banks are factory ones because *2 says so; a release that stops saying it stops the build.
  const gmReadOnly = (data.messages.banks ?? []).map((l) => /(GM, g\(1\)-g\(9\), g\(d\) \(read-only\))/.exec(l)?.[1]).find(Boolean);
  if (presets.banks.some((b) => b.role === 'factory') && !gmReadOnly) throw new Error(`${layout.name}: *2 no longer calls the GM banks read-only`);
  const summary = (map) => [...map].map(([why, labels]) => `${labels.length} ${labels.length === 1 ? 'setting' : 'settings'} (${[...new Set(labels.map((l) => l.replace(/ \d+$/, '')))].slice(0, 6).join('; ')}${labels.length > 6 ? '; …' : ''}): ${why}`);
  const source = data.source;
  const amsUsed = parameters.some((p) => p.choices?.length > 2 && p.choices[0].label === data.voiceModel?.amsSources?.[0]?.label && p.choices.length === 49);
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
        title: `${source.title}: ${object.title}${source.printed ? `, ${source.printed}` : ''}, object version ${object.objectVersion}`,
        notes: `Rows read by tools/profiles/korg/read-kronos-table.mjs from ${source.file} (sha256 ${source.sha256}) in ${source.archive} of ${source.archiveDate}, ${source.url}. Not yet checked against the instrument itself.`,
      },
      ...data.files.map((f) => ({ type: 'manual', title: `${source.title}: ${f.file}${f.printed ? ` (${f.printed})` : ''}`, notes: `${f.file} (sha256 ${f.sha256}) in ${source.archive}.` })),
    ],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/korg/make-profiles.mjs; edit the layout in tools/profiles/korg/synths/, not this file.',
      `Every row of ${source.file} with a parameter id is a parameter, named by its group and its name as printed, and sent by Parameter Change (function 43): ${header.map(device).join(' ').replace(/^F0 42 30/, 'F0 42 3g')} 43 TYP SOC SUB PID IDX and the value as 21 bits, two's complement, high byte first (*4). Nothing here has been sent to a real instrument yet.`,
      ...routing,
      `${layout.scope} The ${instrument} takes ${kind} parameters in ${objectName} mode ("Which parameters are currently available for editing depends on the instrument's mode"). The effects' own parameters, which depend on the effect type (Effect.txt), are not here.`,
      `A range whose first value is the larger (9D~63) is two's complement over its bytes, -99~+99. A choice is a row naming both of two values${amsUsed ? ', or a row whose ends are the ends of the voice model\'s AMS source list (Off~Tempo, sources 0~48)' : ''}. The value column is 19 characters wide; a name it cuts short keeps its cut, with an ellipsis. Other value names are in each parameter's description.`,
      ...(longForm.size ? ['A parameter id above 126 takes the message\'s second form, 7F PIDH PIDL, which the archive calls deprecated and says the instrument still receives.'] : []),
      ...(layout.renames ?? []).map((r) => `"${r.name}" as "${r.to}": ${r.why}.`),
      ...(engineNotes.length ? [`The EXi engines' own settings come from ${layout.document.engines} (each engine's rows as many as its heading prints: ${engineNotes.join(', ')}), once for each slot: ${layout.engineSlots.map((s) => `${s.label} by TYP ${s.typ}`).join(', ')}, as the program table's own rows for each slot take them (${slotEvidence(data, layout).join(', ')})${data.voiceModel?.messageFormats?.some((l) => /0B: EXi patch 1/.test(l)) ? ' and the voice model files say ("<type> 0B: EXi patch 1, 0C: EXi patch 2")' : ''}. A slot takes the settings of the engine in it: another engine's are refused or mean something else, and engines share ids, so a message from the instrument that more than one engine's setting sends is not attributed to any.`] : []),
      ...(readOnly.length ? [`Read and not sent: ${readOnly.join(', ')}; the table prints no parameter id for ${readOnly.length === 1 ? 'it' : 'them'}.`] : []),
      ...(fixed.length ? [`${fixed.length} rows with an id print a fixed value (\`10(fixed)\`, \`00(fixed)\`: ${[...new Set(fixed.map((l) => l.replace(/ \d+$/, '')))].slice(0, 3).join('; ')}; …) and are not settings.`] : []),
      ...summary(leftOut).map((s) => `Left out: ${s}.`),
      `Pull: Current Object Dump Request (function 74) for object ${code}, the ${kind}, answered by a Current Object Dump (function 75) carrying object version ${object.objectVersion} and ${object.size} bytes in Korg's 8-in-7 packing (*3: ${packed} bytes). ${mappings.length} parameters are read back at their rows' offsets and bits. A dump of any other length does not match${layout.otherLength ? `: ${layout.otherLength}` : ''}.`,
      ...summary(notReadBack).map((s) => `Sent and not read back: ${s}.`),
      'The exclusive header carries the global MIDI channel as 3g; the profile\'s deviceId variable is that byte, 30H for channel 1.',
      `Identity: the Device Inquiry reply (${layout.document.implementation}) is printed ${reply.join(' ')}${reply.length !== universalLength ? `, ${reply.length} bytes where the universal reply has ${universalLength}` : ''}. Its 7th to ${6 + checked.length}th bytes, ${checked.join(' ')}, are checked as printed, where the universal reply puts the family${checked.length > 2 ? ' and member' : ''} code${members.length ? `; its ${reply.indexOf('mm') + 1}th byte, mm, is one per model and is not checked: ${members.join(', ')}` : ''}.`,
      ...(presets.banks.length
        ? [`Preset recall: Bank Select MSB and LSB, then Program Change, for the ${presets.banks.length} banks the implementation's receive table gives in ${objectName} mode when Global's Bank Map is KORG (${presets.banks.map((b) => b.label.replace(`${objectName} `, '')).join(', ')}).${presets.banks.some((b) => b.role === 'factory') ? ` The banks numbered 001-128 are the GM ones, read-only (${layout.document.messages} *2: "${gmReadOnly}").` : ''}${presets.alternates.length ? ` The table also reaches some of them by a second select (${presets.alternates.join(', ')}), not offered.` : ''} With Bank Map GM(2) the MSBs differ, and this recall does not apply.`]
        : ['No preset recall: the implementation prints no banks for this object.']),
    ],
    variables: { channel: 1, deviceId: 0x30 },
    identity: { manufacturerId: ['42'], familyCode, ...(checked.length > 2 ? { modelNumber } : {}), timeoutMs: 1000, retries: 0 },
    coverage: {
      singleParameterWrite: `partial: ${parameters.length} settings of ${layout.coverageOf}; what is left out is in the notes`,
      realtimeEditing: `partial: ${parameters.length} settings of ${layout.coverageOf} by parameter change`,
      editBufferDumpRequest: `complete: Current Object Dump Request (function 74), object ${code}`,
      editBufferDumpParse: `partial: ${mappings.length} of the profile's ${parameters.length} parameters are read from the current program`,
      bankDump: 'notImplemented',
      inboundControllers: `the ${instrument} also transmits Parameter Change (function 43) when edited on it; not tried on an instrument`,
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()],
    parameters,
    requests: [
      { id: 'identityRequest', name: 'Identity Request', kind: 'sysex', template: ['F0', '7E', '7F', '06', '01', 'F7'], response: { kind: 'identity' }, timeoutMs: 1000, retries: 0 },
      { id: requestId, name: `Current Object Dump Request (${objectName})`, kind: 'sysex', template: request, response: { dump: dumpId }, timeoutMs: 3000, retries: 1 },
    ],
    startup: { policy: 'pull', syncDirection: 'pull', sync: [{ request: 'identityRequest' }, { request: requestId }] },
    ...(presets.banks.length ? { presets: { banks: presets.banks, recall: { kind: 'bankPc' } } } : {}),
    tests: [
      { name: 'Universal Identity Request', kind: 'identityRequest', expectedHex: 'F0 7E 7F 06 01 F7' },
      ...[...new Map(picks.map(([p, value]) => [p.id, vector(p, value(p))])).values()],
      { name: `Current Object Dump Request (${objectName})`, kind: 'request', request: requestId, expectedHex: request.map(device).join(' ') },
      { name: `Current Object Dump (${objectName}), read back`, kind: 'dumpParse', inputHex: [...prefix.map(device), ...wire.map(hex), 'F7'].join(' '), expectedValues: expected },
    ],
    dumpDefinitions: [{
      id: dumpId,
      name: `Current Object Dump (${object.title})`,
      kind: 'sysex',
      matcher: { prefix, suffix: ['F7'] },
      payload: { offset: prefix.length, size: object.size, pack: { type: 'packed8to7', packOrder: 'msb-low-first', groupSize: 7 } },
      // Exactly this long: a program of an EXi bank comes back under the same header as an HD-1's.
      completion: { expectedMessages: 1, expectedBytes: prefix.length + packed + 1, maxBytes: prefix.length + packed + 1 },
      mappings: mappings.map(({ parameter, offset, codec }) => ({ parameter, offset, codec })),
    }],
  };
}
