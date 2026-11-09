// build-korg-sysex-id.mjs — the KingKORG's SysEx PARAMETER CHANGE: an ID, a sub-ID and a 21-bit value.
//
//   F0 42 3g 00 01 18 41  pp PP  qq QQ  vvl vvm vvh  F7      (NOTE 4 of the KingKORG document)
//
// ID and sub-ID are 14 bits each, low seven first; the value is 21 bits, low seven first, and NOTE 4
// calls it signed, so -48 goes out as two's complement (50 7F 7F). Its tables nest, and so do their
// IDs: the program table gives a block an ID and a first sub-ID (`TIMBRE A DATA ... (TABLE 2) |
// 02:00~`); inside it a row's ID is relative (`+0:04`, the block's ID with sub-ID 04), and a block
// inside that (`OSC 1 DATA ... (TABLE 7) | +0:0C~10`) makes both relative (`+0:+1`). A row printed
// `same as V.PATCH 1` is the table of the block above it, at its own IDs.
//
// What a VALUE cell makes of a setting is as for the microKORG S (build-korg-sysex.mjs), with `:`
// where that document prints `=`; a list it points to makes a choice only up to 32 names, since a
// longer one is a readout (`0~127:0.01~100[kHz] *T02-4`), and goes in the description instead.

import { camel } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const choiceSlug = (label) => label.toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';
const MAX_LIST_CHOICES = 32;

/** `F0,42,3g,` `00,01,18,` `0100 0001 (41)` -> F0 42 $deviceId 00 01 18 41, up to the ID. */
function messageHead(rows) {
  const out = [];
  for (const row of rows ?? []) {
    const cell = row.cells[0] ?? '';
    if (/\((pp|PP|qq|QQ|vv\w*|F7)\)\s*$/.test(cell)) break;
    const paren = /\(([0-9a-f]{2})\)\s*$/i.exec(cell);
    if (paren) { out.push(paren[1].toUpperCase()); continue; }
    for (const t of cell.split(',').map((x) => x.trim()).filter(Boolean)) out.push(/^3[gn]$/i.test(t) ? '$deviceId' : t.toUpperCase());
  }
  return out;
}

/** `06:00`, `+0:04`, `+0:+3`, `02:00~`, `+0:0C~10` -> its ID and sub-ID against a base, and whether it is a block. */
export function resolveId(cell, base) {
  const m = /^(\+?)([0-9a-f]+)\s*:\s*(\+?)([0-9a-f]+)\s*(~\s*[0-9a-f]*)?$/i.exec(String(cell ?? '').trim());
  if (!m) return null;
  return {
    id: (m[1] ? base.id : 0) + Number.parseInt(m[2], 16),
    sub: (m[3] ? base.sub : 0) + Number.parseInt(m[4], 16),
    block: !!m[5],
  };
}

/** What a VALUE cell says, in the KingKORG's notation (`0~2:Mono1,Mono2,Poly`, `-48~0~48[note]`). */
export function readKingValue(text, lists) {
  const marks = [...String(text).matchAll(/\*(T\d+-\d+)/g)].map((m) => m[1]);
  const s = String(text).replace(/\*\S+/g, '').replace(/\s+/g, ' ').trim();
  if (!s) {
    const list = marks.map((k) => lists[k]).find((l) => l?.entries?.length);
    return list ? { why: 'its values depend on another setting' } : { why: 'it is printed without a value' };
  }
  const unit = /\[([^\]]*)\]\s*$/.exec(s)?.[1] ?? '';
  const body = s.replace(/\s*\[[^\]]*\]\s*$/, '');
  const [left, right] = body.split(/:(.*)/s).map((x) => x?.trim());
  const nums = (left.match(/-?\d+/g) ?? []).map(Number);
  if (!nums.length || !/^[-\d~,\s]+$/.test(left)) return { why: `the value is printed as "${s}"` };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const names = (right ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  // One name per value: `0~2:Mono1,Mono2,Poly`, `0,1:Off,On`.
  const isList = /^\d+(?:\s*,\s*\d+)+$/.test(left);
  const values = isList ? left.split(',').map(Number) : Array.from({ length: max - min + 1 }, (u, i) => min + i);
  if (names.length === values.length && !names.some((n) => /~/.test(n))) return { choices: values.map((value, i) => ({ value, label: names[i] })), unit };
  for (const k of marks) {
    const entries = lists[k]?.entries ?? [];
    if (entries.length === values.length && entries.length <= MAX_LIST_CHOICES && entries.every((e, i) => e.from === values[i] && e.to === e.from)) {
      return { choices: entries.map((e) => ({ value: e.from, label: e.label })), unit };
    }
  }
  const listed = marks.map((k) => lists[k]).find((l) => l?.entries?.length);
  return {
    min, max, signed: min < 0, unit,
    shown: [right ? `${left} = ${right}` : null, listed ? `${listed.title ? `${listed.title}: ` : ''}${listed.entries.slice(0, 12).map((e) => `${e.from}=${e.label}`).join(', ')}${listed.entries.length > 12 ? ', …' : ''}` : null].filter(Boolean).join('; ') || null,
  };
}

/** `TIMBRE A DATA` -> `Timbre A`; `OSC 1 DATA` -> `OSC 1`; `V.PATCH 1 DATA` -> `V.Patch 1`. */
const blockName = (name) => name.replace(/\s+DATA$/i, '').replace(/\bTIMBRE\b/, 'Timbre').replace(/\bVOCODER\b/, 'Vocoder').replace(/\bARPEGGIO\b/, 'Arpeggio').replace(/\bEFFECT\b/, 'Effect').replace(/\bV\.PATCH\b/, 'V.Patch');

/** Parameters and recipes of the KingKORG's parameter change, built into `profile`; returns notes. */
export function addParameterChangeById(profile, data, layout) {
  const pc = data.parameterChange;
  const head = messageHead(pc.message);
  const tables = new Map(pc.tables.map((t) => [/^TABLE\s+(\d+)/.exec(t.title)?.[1], t]));
  const notes = [];
  const skipped = new Map();
  const skip = (why, what) => skipped.set(why, [...(skipped.get(why) ?? []), what]);
  const ids = new Set(profile.parameters.map((p) => p.id));
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const seen = new Set();
  let count = 0;

  const walk = (number, base, chain) => {
    const table = tables.get(String(number));
    if (!table) { skip('a block whose table is not printed', `TABLE ${number}`); return; }
    let section = '';
    let lastBlock = null;
    for (const row of table.rows) {
      if (row.cells.length === 1) { section = row.cells[0].replace(/\s+parameter$/i, '').trim(); continue; }
      let name = (row.cells[1] ?? '').trim();
      const valueText = [row.cells[2] ?? '', ...(row.more ?? []).map((c) => c[2] ?? '')].join(' ').trim();
      const resolved = resolveId(row.cells.at(-1), base);
      if (!resolved) continue;
      if (resolved.block) {
        const ref = /\(TABLE\s+(\d+)\)/i.exec(valueText)?.[1] ?? (/^same as/i.test(valueText) ? lastBlock?.ref : null);
        if (!name && lastBlock) name = lastBlock.name;            // `100~123 |  | V.Patch Parameter (TABLE 3)`
        if (!ref) { skip('a run of IDs for the characters of one setting', `${name || '?'} (${row.cells.at(-1)})`); continue; }
        lastBlock = { ref, name };
        const childName = /^(TIMBRE [AB]) DATA$/i.test(name) && /V\.Patch/i.test(valueText) ? `${blockName(name)} V.Patch` : blockName(name);
        walk(ref, { id: resolved.id, sub: resolved.sub }, [...chain, childName]);
        continue;
      }
      if (!name || /^\(?(Reserved|dummy byte)\)?$|^not use$|^program name$/i.test(name)) continue;
      name = name.replace(/\s*\(LSB\)$/i, '').replace(/\s+/g, ' ');
      const key = `${resolved.id}:${resolved.sub}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const read = readKingValue(valueText, data.lists);
      // `Voice Assign` under Voice is not `Voice Voice Assign`.
      const sectionWord = section && !name.toUpperCase().startsWith(section.toUpperCase()) ? section : '';
      const label = [chain.join(' '), sectionWord, name].filter(Boolean);
      if (read.why) { skip(read.why, label.join(' ')); continue; }
      const top = chain[0] ?? '';
      const fullName = top ? `${top}: ${[...chain.slice(1), sectionWord, name].filter(Boolean).join(' ')}` : [sectionWord, name].filter(Boolean).join(' ');
      const group = top ? `${top}: ${chain[1] ?? section ?? ''}`.replace(/: $/, '') : section || 'Program';
      const recipeId = `pc${hex(resolved.id)}${hex(resolved.sub)}`;
      const choice = !!read.choices;
      profile.messageRecipes.push({
        id: recipeId, kind: 'sysex',
        template: [...head, hex(resolved.id & 0x7f), hex(resolved.id >> 7), hex(resolved.sub & 0x7f), hex(resolved.sub >> 7), '$encodedValue', ...(choice ? ['00', '00'] : []), 'F7'],
      });
      const base2 = {
        id: unique(camel(fullName.replace(/:/g, ' ')) || recipeId),
        name: fullName,
        group: group || 'Program',
        ...(read.shown || read.unit ? { description: [read.shown, read.unit ? `In ${read.unit}.` : null].filter(Boolean).join(' ') } : {}),
        access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
        messageRecipe: recipeId,
      };
      if (choice) {
        const used = new Set();
        const choices = read.choices.map(({ value, label: l }) => { const s = choiceSlug(l); const cid = used.has(s) ? `${s}_${value}` : s; used.add(cid); return { id: cid, label: l, value }; });
        profile.parameters.push({ ...base2, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'enum' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : choices.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
      } else {
        profile.parameters.push({
          ...base2, type: 'integer', range: { min: read.min, max: read.max }, default: read.min <= 0 && read.max >= 0 ? 0 : read.min,
          display: { mode: 'number', unit: read.unit ?? '', shortLabel: camel(name) }, normalization: { mode: 'linear' },
          encoding: { type: 's21-lsb-msb' },
          sendPolicy: read.max - read.min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
          ui: { preferredComponent: /Level|Time|Attack|Decay|Sustain|Release|Depth|Int\b/i.test(name) ? 'Slider' : 'Knob' },
        });
      }
      count++;
    }
  };
  walk(1, { id: 0, sub: 0 }, []);

  notes.push(`${count} parameter(s) by SysEx PARAMETER CHANGE (${head.map((t) => (t === '$deviceId' ? '3g' : t)).join(' ')} pp PP qq QQ vvl vvm vvh F7): an ID and a sub-ID of 14 bits and a value of 21, each low seven bits first, resolved through the tables' nested blocks. NOTE 4 calls the value signed; a negative one is sent as two's complement, which is how this profile reads it; not yet tried on an instrument.`);
  for (const [why, list] of skipped) notes.push(`Left out, ${why}: ${list.join(', ')}.`);
  return notes;
}
