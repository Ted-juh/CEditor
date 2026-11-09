// build-korg-sysex.mjs — Korg's SysEx PARAMETER CHANGE, from the parameter tables a document prints
// with a Param ID for every setting (the microKORG S: `| +20 | Cutoff | 0~127 | 00:55 | 01:65 |`).
//
//   F0 42 3g 00 01 40 41  pp PP  vv VV  F7       (NOTE 5 of the microKORG S document)
//
// The parameter ID is 14 bits, its low seven first; so is the value, which NOTE 5 calls "signed".
// A setting printed `64+/-50=0+/-50[cent]` is stored as 64 +/- 50 in a program, and its parameter
// change is read here as carrying the signed value, -50 as 3FCEH, sent 4E 7F: that is what "signed"
// says, and the profile says it is a reading of NOTE 5, not something tried on an instrument.
//
// What a VALUE cell makes of a setting:
//
//   0~127                         a number
//   64+/-50=0+/-50[cent]          a signed number, -50 - 50
//   0,1,2=Mono,Poly,Unison        a choice of the values printed, one name each
//   0~3=24LPF,12LPF,12BPF,12HPF   a choice, when the names count out to the range
//   0~7=Saw~Audio In   *T-2       a choice from the list *T-2, when it names every value
//
// Anything else is left out and said so. A table printed for two copies (`Param ID(TIMBRE 1)` and
// `(TIMBRE 2)`) makes one parameter per copy.

import { camel } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const choiceSlug = (label) => label.toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';

/** `F0,42,3g,` `00,01,40` `0100 0001 (41)` -> F0 42 $deviceId 00 01 40 41, up to the parameter ID. */
function messageHead(rows) {
  const out = [];
  for (const row of rows ?? []) {
    const cell = row.cells[0] ?? '';
    if (/\((pp|PP|vv|VV|F7)\)\s*$/.test(cell)) break;
    const paren = /\(([0-9a-f]{2})\)\s*$/i.exec(cell);
    if (paren) { out.push(paren[1].toUpperCase()); continue; }
    for (const t of cell.split(',').map((x) => x.trim()).filter(Boolean)) out.push(/^3[gn]$/i.test(t) ? '$deviceId' : t.toUpperCase());
  }
  return out;
}

/** `00:55` -> [0x55, 0x00] (pp, PP); `--:--` and ranges -> null. */
function paramId(cell) {
  const m = /^([0-9a-f]{2})\s*:\s*([0-9a-f]{2})$/i.exec(String(cell ?? '').trim());
  return m ? [Number.parseInt(m[2], 16), Number.parseInt(m[1], 16)] : null;
}

/** What a VALUE cell says: a range or list, the names, a signed range, the lists it points to. */
export function readValue(text, lists) {
  const marks = [...String(text).matchAll(/\*([A-Z]-\d+)/g)].map((m) => m[1]);
  let s = String(text).replace(/\*[A-Z]-\d+/g, '').replace(/\s+/g, ' ').trim();
  const aside = /\s*(\((?:use|when)[^)]*\))\s*$/i.exec(s);
  if (aside) s = s.slice(0, aside.index).trim();
  const note = aside ? aside[1].replace(/^\(|\)$/g, '') : null;
  let m = /^(?:64|0)\s*\+\/-\s*(\d+)\s*=\s*0\s*\+\/-\s*\1\s*(\[[^\]]*\])?$/.exec(s);
  if (m) return { min: -Number(m[1]), max: Number(m[1]), signed: true, unit: m[2]?.replace(/^\[|\]$/g, '') ?? '', note };
  // A range with its centre printed: `-3~0~+3=3OctDown~normal~3OctUp`, `0~64~127=L64~CNT~R63`.
  m = /^([-+]?\d+)\s*~\s*([-+]?\d+)\s*~\s*([-+]?\d+)\s*=\s*(.+)$/.exec(s);
  if (m) {
    const [min, centre, max] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return { min, max, signed: min < 0, shown: null, note: [`${min} ~ ${centre} ~ ${max} = ${m[4].trim()}`, note].filter(Boolean).join('; ') };
  }
  m = /^(\d+(?:,\d+)+)\s*=\s*(.+)$/.exec(s);
  if (m) {
    const values = m[1].split(',').map(Number);
    const names = m[2].split(',').map((x) => x.trim()).filter(Boolean);
    return names.length === values.length ? { choices: values.map((value, i) => ({ value, label: names[i] })), note } : { why: `names "${m[2]}" for the values ${m[1]}` };
  }
  m = /^(\d+)\s*~\s*(\d+)(?:\s*=\s*(.+))?$/.exec(s);
  if (m) {
    const [min, max] = [Number(m[1]), Number(m[2])];
    const names = (m[3] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (names.length === max - min + 1 && !names.some((n) => /~/.test(n))) return { choices: names.map((label, i) => ({ value: min + i, label })), note };
    for (const k of marks) {
      const entries = lists[k]?.entries ?? [];
      if (entries.length === max - min + 1 && entries.every((e, i) => e.from === min + i && e.to === e.from)) return { choices: entries.map((e) => ({ value: e.from, label: e.label })), note };
    }
    return { min, max, shown: m[3] ?? null, note };
  }
  return { why: `the value is printed as "${s}"` };
}

/**
 * The parameters and recipes of a document's parameter change, built into `profile`. Returns the
 * notes to add. `layout.copies` names a table's ID columns (`['Timbre 1', 'Timbre 2']`).
 */
export function addParameterChange(profile, data, layout) {
  const pc = data.parameterChange;
  if (!pc || layout.parameterChange === false) return [];
  const head = messageHead(pc.message);
  const notes = [];
  const skipped = new Map();
  const skip = (why, what) => skipped.set(why, [...(skipped.get(why) ?? []), what]);
  const ids = new Set(profile.parameters.map((p) => p.id));
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  let count = 0;
  for (const table of pc.tables) {
    const columns = table.header[0].slice(3);
    const copies = columns.map((c) => /\(([^)]*)\)/.exec(c)?.[1]?.replace(/\bTIMBRE\b/i, 'Timbre') ?? null);
    const tableName = layout.tableNames?.[table.title] ?? null;
    let section = '';
    for (const row of table.rows) {
      if (row.cells.length === 1) { section = row.cells[0].replace(/\s*\(.*\)\s*$/, '').trim(); continue; }
      const name = (row.cells[1] ?? '').trim();
      if (!name || /^\(?(Reserved|dummy byte)\)?$|^not use$/i.test(name)) continue;
      // Rows the document prints under no section row of their own (the vocoder's CH LEVEL [0],
      // after LFO 2): the layout says where they belong.
      const placed = (layout.sections ?? []).find(([pattern]) => pattern.test(name));
      if (placed) section = placed[1];
      const valueText = [row.cells[2] ?? '', ...(row.more ?? []).map((c) => c[2] ?? '')].join(' ').replace(/,\s+/g, ',').trim();
      const idCells = row.cells.slice(3);
      if (idCells.every((c) => !paramId(c))) {
        if (idCells.some((c) => /~/.test(c))) skip('a run of IDs for the bits of one setting', `${name} (${idCells.join(', ')})`);
        continue;
      }
      const read = readValue(valueText, data.lists);
      if (read.why) { skip(read.why, name); continue; }
      idCells.forEach((cell, i) => {
        const id = paramId(cell);
        if (!id) return;
        const copy = copies[i] ?? tableName;
        const full = section && !name.toUpperCase().startsWith(section.toUpperCase()) ? `${section} ${name}` : name;
        const group = [copy, section].filter(Boolean).join(': ') || 'Program';
        const recipeId = `pc${hex(id[1])}${hex(id[0])}`;
        const choice = !!read.choices;
        profile.messageRecipes.push({ id: recipeId, kind: 'sysex', template: [...head, hex(id[0]), hex(id[1]), '$encodedValue', ...(choice ? ['00'] : []), 'F7'] });
        const base = {
          id: unique(`${camel(copy ?? 'program')}.${camel(full)}`),
          name: copy ? `${copy}: ${full}` : full,
          group,
          ...(read.note || read.shown || read.unit ? { description: [read.shown ? `${read.min}~${read.max} = ${read.shown}` : null, read.unit ? `In ${read.unit}.` : null, read.note].filter(Boolean).join(' ') } : {}),
          access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
          messageRecipe: recipeId,
        };
        if (choice) {
          const used = new Set();
          const choices = read.choices.map(({ value, label }) => { const s = choiceSlug(label); const cid = used.has(s) ? `${s}_${value}` : s; used.add(cid); return { id: cid, label, value }; });
          profile.parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'enum' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : choices.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
        } else {
          profile.parameters.push({
            ...base, type: 'integer', range: { min: read.min, max: read.max }, default: read.signed ? 0 : read.min,
            display: { mode: 'number', unit: read.unit ?? '', shortLabel: camel(name) }, normalization: { mode: 'linear' },
            encoding: { type: read.signed ? 's14-lsb-msb' : 'u14-lsb-msb' },
            sendPolicy: read.max - read.min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
            ui: { preferredComponent: /Level|Time|Attack|Decay|Sustain|Release|Depth|Int\b/i.test(name) ? 'Slider' : 'Knob' },
          });
        }
        count++;
      });
    }
  }
  notes.push(`${count} parameter(s) by SysEx PARAMETER CHANGE (${head.map((t) => (t === '$deviceId' ? '3g' : t)).join(' ')} pp PP vv VV F7): the Param ID and the value 14 bits each, low seven first. A setting printed 64+/-n is sent as its signed value, -n - +n, which is how this profile reads NOTE 5's "VVvv = signed value"; not yet tried on an instrument.`);
  for (const [why, list] of skipped) notes.push(`Left out, ${why}: ${list.join(', ')}.`);
  return notes;
}

/** Test vectors for a few parameter change parameters, worked out from the ID and value here. */
export function parameterChangeVectors(profile) {
  const pcs = profile.parameters.filter((p) => profile.messageRecipes.find((r) => r.id === p.messageRecipe)?.kind === 'sysex');
  const picks = [pcs.find((p) => p.encoding.type === 'u14-lsb-msb'), pcs.find((p) => p.encoding.type === 's14-lsb-msb'), pcs.find((p) => p.type === 'choice'), pcs.at(-1)].filter(Boolean);
  return [...new Set(picks)].map((p) => {
    const recipe = profile.messageRecipes.find((r) => r.id === p.messageRecipe);
    const choice = p.type === 'choice' ? p.choices.at(-1) : null;
    const value = choice ? choice.value : p.encoding.type === 's14-lsb-msb' ? p.range.min : p.range.max;
    const wire = value & 0x3fff;
    const bytes = recipe.template.flatMap((t) => (t === '$deviceId' ? ['30'] : t === '$encodedValue' ? (choice ? [hex(value)] : [hex(wire & 0x7f), hex(wire >> 7)]) : [t]));
    return { name: `${p.name} = ${choice ? choice.label : value} (parameter change)`, parameter: p.id, value: choice ? choice.id : value, expectedHex: bytes.join(' ') };
  });
}
