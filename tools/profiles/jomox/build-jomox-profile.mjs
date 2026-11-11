// build-jomox-profile.mjs — a Jomox manual's transcription (tables/<name>.json) and its layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the manual:
//   - a row is its controller, on its section's channel where the section names one (`KICK DRUM CH1`;
//     `SAMPLE CH3-CH10` is each of channels 3 - 10, a row for each), the channel variable elsewhere;
//   - its value range as printed: a range (`0-127`, `0..7`) or values (`0/64`, `13,14`); named one
//     each by its internal range (`0/64  Off/On`, `32-34  Nor, Fil, Noi`, `0..7  Sup/Sdo/…`) a choice,
//     values without names a choice of those values, a range otherwise a number;
//   - a row whose name ends in MSB and the next, ending in LSB, are one value over both controllers
//     (`M1 Pitch MSB 90 0..1`, `M1 Pitch LSB 91 0..127`: 0 - 255, the MSB first), as the manuals say
//     ("define the controllers as 14 bit CCs with MSB and LSB");
//   - several rows on one controller (the XBASE's CC 62, 63 and 93) are each their own parameter,
//     sending their own values;
//   - left out, and named: actions (storing or loading a preset).

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const ACTION = /\b(?:Store|Load|Dump)\b/i;

/** A printed range -> its values: { min, max } for a range, { values } for a list. */
export function rangeOf(text) {
  const t = String(text).replace(/\s+(?:MSB|LSB)$/, '');
  const span = /^(\d+)\s*(?:-|\.\.)\s*(\d+)$/.exec(t);
  if (span) return { min: Number(span[1]), max: Number(span[2]) };
  if (/^\d+(?:\s*[/,]\s*\d+)+$/.test(t)) return { values: t.split(/\s*[/,]\s*/).map(Number) };
  if (/^\d+$/.test(t)) return { values: [Number(t)] };
  return null;
}

/** An internal range that names values (`Off/On`, `Nor, Fil, Noi`, `Sup/Sdo/Sin/…`) -> its names, or null. */
export function namesOf(internal) {
  if (!internal || /^\d+$|^\d+\s*-\s*\d+(?:\s|$)/.test(internal)) return null;
  const names = internal.split(/\s*\/\s*|,\s*/).map((s) => s.trim()).filter(Boolean);
  return names.length >= 2 && names.every((n) => n.length <= 12) ? names : null;
}

/** `SAMPLE CH3-CH10` -> [3 … 10]; `KICK DRUM` with channel 1 -> [1]; none -> [null]. */
export const channelsOf = (row) => {
  const m = /CH\s?(\d+)\s*-\s*CH\s?(\d+)$/.exec(row.section ?? '');
  if (m) return Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (u, k) => Number(m[1]) + k);
  return [row.channel ?? null];
};

export function buildJomoxProfile(data, layout) {
  const notes = [];
  const left = [];
  const recipes = new Map();
  const parameters = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const pairs = [];
  const noRange = [];
  const rows = data.rows;
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k];
    if (ACTION.test(r.name)) { left.push(`${r.name} (CC ${r.cc}, ${r.range})`); continue; }
    // An MSB and its LSB, one value over both.
    const msb = /^(.*?)\s*MSB\*?$/.exec(r.name);
    const next = rows[k + 1];
    const lsb = msb && next && new RegExp(`^${msb[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*LSB$`).test(next.name) ? next : null;
    const range = rangeOf(r.range);
    if (!range) { noRange.push(`${r.name} (CC ${r.cc}, ${r.range})`); continue; }
    for (const channel of channelsOf(r)) {
      const chan = channel ?? '$channel';
      const group = channel != null && /CH\s?\d+\s*-\s*CH/.test(r.section ?? '') ? `${(r.section ?? '').replace(/\s*CH\s?\d+\s*-\s*CH\s?\d+$/, '')} channel ${channel}` : r.section ?? layout.name.replace(/^Jomox /, '');
      const where = channel != null ? ` on channel ${channel}` : '';
      if (lsb) {
        const top = range.max ?? Math.max(...range.values);
        const max = (top + 1) * 128 - 1;
        const id = `cc${hex(r.cc)}${hex(lsb.cc)}${channel != null ? `ch${channel}` : ''}`;
        recipes.set(id, { id, kind: 'cc', channel: chan, controller: r.cc, lsbController: lsb.cc });
        parameters.push({
          id: unique(`${camel(group)}.${camel(msb[1])}`), name: msb[1], group,
          description: `CC ${r.cc} (MSB, ${r.range}) and CC ${lsb.cc} (LSB, ${lsb.range})${where} (page ${r.page}): one value of ${max + 1} steps${lsb.internal ? `; internal ${lsb.internal}` : ''}.`,
          access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: id,
          type: 'integer', range: { min: 0, max }, default: 0, display: { mode: 'number', unit: '', shortLabel: camel(msb[1]) },
          normalization: { mode: 'linear' }, encoding: { type: 'u14-msb-lsb' }, sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true }, ui: { preferredComponent: 'Knob' },
        });
        pairs.push(`${msb[1]} (CC ${r.cc} and ${lsb.cc}, 0 - ${max})`);
        continue;
      }
      const id = `cc${hex(r.cc)}${channel != null ? `ch${channel}` : ''}`;
      recipes.set(id, { id, kind: 'cc', channel: chan, controller: r.cc });
      const base = {
        id: unique(`${camel(group)}.${camel(r.name)}`), name: r.name, group,
        description: `CC ${r.cc}${where} (page ${r.page}): ${r.section ? `${r.section}, ` : ''}${r.name}; value range ${r.range}${r.internal ? `; internal ${r.internal}` : ''}.`,
        access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: id,
      };
      const values = range.values ?? (range.max - range.min <= 31 ? Array.from({ length: range.max - range.min + 1 }, (u, i) => range.min + i) : null);
      const names = namesOf(r.internal);
      if (range.values || (names && values && names.length === values.length)) {
        const labels = names && names.length === values.length ? names : values.map(String);
        const seen = new Set();
        const choices = values.map((value, i) => { let cid = camel(labels[i]) || `v${value}`; if (seen.has(cid)) cid = `${cid}${value}`; seen.add(cid); return { id: cid, label: labels[i], value }; });
        parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(r.name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u7' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : choices.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
        continue;
      }
      parameters.push({
        ...base, type: 'integer', range: { min: range.min, max: range.max }, default: range.min,
        display: { mode: 'number', unit: '', shortLabel: camel(r.name) }, normalization: { mode: 'linear' }, encoding: { type: 'u7' },
        sendPolicy: range.max - range.min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
        ui: { preferredComponent: range.max - range.min > 16 ? 'Knob' : 'Combobox' },
      });
    }
    if (lsb) k++;
  }

  // Vectors: the first parameter at its top, a choice at its last value, a pair at its top.
  const tests = [];
  const status = (ch) => 0xb0 + ((ch === '$channel' ? 1 : ch) - 1);
  const send = (p, value, wire) => {
    const r = recipes.get(p.messageRecipe);
    const lines = r.lsbController != null ? [[r.controller, wire >> 7], [r.lsbController, wire & 127]] : [[r.controller, wire]];
    return { name: `${p.group} ${p.name} = ${value}`, parameter: p.id, value, expectedHex: lines.map(([c, v]) => [status(r.channel), c, v].map(hex).join(' ')).join('\n') };
  };
  const first = parameters[0];
  if (first) tests.push(first.type === 'choice' ? send(first, first.choices.at(-1).id, first.choices.at(-1).value) : send(first, first.range.max, first.range.max));
  const choice = parameters.find((p) => p.type === 'choice' && p.choices.length > 2 && p !== first);
  if (choice) tests.push(send(choice, choice.choices.at(-1).id, choice.choices.at(-1).value));
  const pair = parameters.find((p) => p.encoding.type === 'u14-msb-lsb');
  if (pair) tests.push(send(pair, pair.range.max, pair.range.max));
  const channelled = parameters.find((p) => recipes.get(p.messageRecipe).channel !== '$channel' && p !== first);
  if (channelled && channelled.type === 'integer') tests.push(send(channelled, channelled.range.max, channelled.range.max));

  const doc = data.source;
  const fixed = [...new Set([...recipes.values()].map((r) => r.channel).filter((c) => c !== '$channel'))].sort((a, b) => a - b);
  notes.push(
    'Generated by tools/profiles/jomox/make-profiles.mjs; edit the layout in tools/profiles/jomox/synths/, not this file.',
    `Every parameter is a row of the manual's MIDI implementation, sent as the controller it prints${fixed.length ? `: a section that names its channel on that channel (${fixed.join(', ')}), the others on the channel variable` : ', on the channel variable'}. Nothing here has been sent to a real instrument yet.`,
    'A value range named one each by the internal range beside it (`0/64  Off/On`) is a choice; values printed without names are a choice of those values; every other range is a number, its internal range or resolution in its description.',
  );
  if (pairs.length) notes.push(`MSB and LSB rows sent as one value over both controllers, the MSB first: ${pairs.join('; ')}.`);
  // (Rows on one controller and one channel; the same number on other channels is another controller.)
  const byKey = new Map();
  for (const r of rows) for (const ch of channelsOf(r)) byKey.set(`${r.cc}@${ch}`, [...(byKey.get(`${r.cc}@${ch}`) ?? []), r]);
  const sharing = [...new Set([...byKey].filter(([, rs]) => new Set(rs.map((r) => `${r.section} ${r.name}`)).size > 1).map(([key]) => { const [cc, ch] = key.split('@'); return ch === 'null' ? `${cc}` : `${cc} (channel ${ch})`; }))];
  if (sharing.length) notes.push(`Controllers several rows share, each row sending its own values: CC ${sharing.join(', ')}. Read back, such a controller cannot say which row it is.`);
  if (left.length) notes.push(`Left out, actions: ${left.join(', ')}.`);
  if (noRange.length) notes.push(`Left out, rows whose range is not numbers: ${noRange.join('; ')}.`);
  if (layout.stop) notes.push(`The table is read up to "${layout.stop.source.replace(/\\/g, '')}"; what follows is not rows of controllers.`);
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Jomox',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `The MIDI implementation's controller tables (PDF pages ${doc.pages[0]} - ${doc.pages[1]}), read by tools/profiles/jomox/read-jomox-cc.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}, linked from ${doc.linkedFrom}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: notes,
    variables: { channel: 1 },
    coverage: {
      singleParameterWrite: `complete-for-the-manual's-controller-tables: ${parameters.length} parameters from ${rows.length} rows`,
      realtimeEditing: 'complete-for-the-manual\'s-controller-tables',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented: the manual prints a dump\'s header but not its bytes\' meaning',
      bankDump: 'notImplemented',
      inboundControllers: 'the controllers the instrument sends, as the table gives them',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()],
    parameters,
    tests,
  };
}

export { stringifyProfile };
