// build-novation-profile.mjs — a Novation transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What the guides say, and nothing they do not:
//
//   - every row whose CC/NRPN column names a control change or an NRPN, with a range printed, is a
//     parameter on it; a row printing a program change, pitch bend, aftertouch or nothing is not;
//   - a CC pair (`CC pair 14,46`, `cc 16:48`, `CC(8) 27:59`) is controller n with n+32, MIDI's coarse
//     and fine pairing, and the Circuit Mono Station's note says the second "is used to create an
//     8-bit message for a 0-255 value range". Which bit it carries is printed nowhere, so the first
//     controller is the parameter, the coarse value, 0 - 127; the second is left out and said;
//   - a range printed with what it shows (`63-66 (-1 to +2)`, `0 – 127 (-64 – 63)`, the MiniNova's
//     Mapped Range) is the values sent, shown as printed;
//   - a parameter is a choice only where its values are named with their numbers: `0=Mono, 1=Mono
//     AG, …` in the notes, `16’,8’,4’,2’ (MIDI val of 63, 64, 65, 66)`, or a value table the row
//     points to (`See Osc Waveform Table`, the Mono Station's `(see table)` beside a table titled for
//     it) that numbers every value of its range, no more and no fewer. Names without numbers
//     (`sine, tri, saw, pulse`) are said in the notes, not guessed at;
//   - several switches on one NRPN, each with values of its own (the MiniNova's 0:122: `42=FreqLink
//     Off, 43=FreqLink On`, `0=Single, 1=Multi`), are a choice each on that NRPN, and the message is
//     not attributed when the instrument sends it;
//   - a document whose tables are played once per part on a channel each (the Circuit Tracks' two
//     synths) makes a parameter per part, on that part's channel variable (layout `parts`).

import { camel, stringifyProfile } from '../roland/build-profile.mjs';
import { addPull } from './build-novation-dump.mjs';

const DASH = /\s*(?:-|–|to)\s*/;
const num = (s) => Number(String(s).replace(/[–−]/g, '-').replace(/^\+/, ''));

/** `0-127 (0 to +127)`, `58 – 69 (-6 – 5)`, `(52 - 76)`, `-63 to +63*`, `0 to 255` -> { min, max, shownMin, shownMax }. */
export function readRange(text) {
  const s = String(text ?? '').replace(/[–−]/g, '-').replace(/\*/g, '').trim();
  const m = /^\(?\s*(-?\+?\d+)\s*(?:-|to)\s*(-?\+?\d+)\s*\)?(?:\s*\(\s*(-?\+?\d+)\s*(?:-|to)\s*(-?\+?\d+)\s*\))?/.exec(s.replace(/(\d)\s*-\s*(-?\d)/, '$1 - $2'));
  if (!m) return null;
  const [min, max] = [num(m[1]), num(m[2])];
  const shown = m[3] !== undefined ? [num(m[3]), num(m[4])] : null;
  return { min, max, ...(shown ? { shownMin: shown[0], shownMax: shown[1] } : {}) };
}

/** `0=Mono, 1=Mono AG, 2=Poly 1` (notes, remarks) -> [{ value, label }], or null. */
export function namedValues(text) {
  const out = [...String(text ?? '').matchAll(/(?:^|[\s,(])(\d+)\s*=\s*([^,=]+?)(?=,\s*\d+\s*=|,?\s*$|\))/g)].map((m) => ({ value: Number(m[1]), label: m[2].trim() }));
  return out.length >= 2 && new Set(out.map((e) => e.value)).size === out.length ? out : null;
}

/** `16’,8’,4’,2’ (MIDI val of 63, 64, 65, 66)` -> [{ value, label }], or null. */
export function listedValues(text) {
  const m = /^(.+?)\s*\(MIDI val of ([\d,\s&]+)\)/i.exec(String(text ?? ''));
  if (!m) return null;
  const labels = m[1].split(',').map((x) => x.trim()).filter(Boolean);
  const values = m[2].split(/[,&]/).map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
  return labels.length === values.length && labels.length >= 2 ? values.map((value, i) => ({ value, label: labels[i] })) : null;
}

const slug = (label) => label.toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';
const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

const words = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && w !== 'table' && w !== 'see');

/**
 * The value table a row points to, and the list in it for this parameter: by the title its notes
 * name (`See Mod Matrix Table`, `See Table 3: Sync`), or, for the Mono Station's `(see table)`, the
 * table whose title is in the parameter's own name (`Oscillator Waveform Table` for `Oscillator 1
 * Waveform Type`). A table of several lists gives the one named in the parameter (`Drive Type`,
 * `Source`), or all of them together (the Circuit Tracks' Waveforms then Wavetables).
 */
export function valueListFor(row, tables) {
  if (!tables?.length || !/see .*table|\(see table\)|see table/i.test(row.notes ?? '')) return null;
  const said = /\(see table\)/i.test(row.notes) ? words(`${row.section} ${row.parameter}`).filter((w) => !/^\d+$/.test(w)) : words(row.notes);
  const numbered = /table\s+(\d+)\s*:/i.exec(row.notes)?.[1];
  const scored = tables.filter((t) => (t.doc ?? 0) === (row.doc ?? 0)).map((t) => {
    if (numbered) return { t, score: new RegExp(`^Table ${numbered}:`).test(t.title) ? 100 : 0 };
    const title = words(t.title.replace(/^Table \d+:\s*/, ''));
    return { t, score: title.length && title.every((w) => said.includes(w)) ? title.length : 0 };
  }).filter((x) => x.score).sort((a, b) => b.score - a.score);
  const table = scored[0]?.t;
  if (!table) return null;
  if (table.lists.length === 1) return { table, entries: table.lists[0].entries };
  const own = words(row.parameter);
  const named = table.lists.filter((l) => l.name && words(l.name).every((w) => own.includes(w))).sort((a, b) => words(b.name).length - words(a.name).length)[0];
  return { table, entries: named ? named.entries : table.lists.flatMap((l) => l.entries), list: named?.name ?? null };
}

/** `14,46`, `16:48`, `23.55` -> [14, 46]; `65` -> [65]; `0:27` (an NRPN) -> [0, 27]. */
const numbers = (text) => String(text ?? '').trim().split(/\s*[,:.]\s*/).filter(Boolean).map(Number);

export function buildNovationProfile(data, layout) {
  const notes = [];
  const parameters = [];
  const recipes = new Map();
  const ids = new Set();
  const skipped = new Map();
  const skip = (why, what) => skipped.set(why, [...(skipped.get(why) ?? []), what]);
  const pairs = [];
  const tableMisses = new Map();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const seen = new Map();   // recipe id -> the values its parameters take (null: all of them)
  const shared = new Set();
  // A row once per part it is played on (the Circuit Tracks' synth table: Synth 1 on channel 1,
  // Synth 2 on channel 2), or once.
  const partsOf = (row) => {
    const block = (layout.parts ?? []).find((b) => b.pages.includes(row.page) && (b.doc ?? 0) === (row.doc ?? 0));
    return block ? block.parts : [null];
  };

  for (const { row, part } of data.rows.flatMap((r) => partsOf(r).map((part) => ({ row: r, part })))) {
    const type = row.type.trim().toUpperCase().replace(/\s+/g, ' ');
    const name = (layout.names?.[row.parameter] ?? row.parameter).replace(/\s+/g, ' ').trim();
    const section = layout.sectionOf ? layout.sectionOf(row) : row.section;
    const sectioned = layout.prefixSection?.test?.(section) || (layout.prefixSection === true && section) ? `${section} ${name}` : name;
    const fullName = part ? `${part.name} ${sectioned}` : sectioned;
    const channel = part ? `$${part.channel}` : '$channel';
    const label = `${fullName} (${row.type} ${row.number})`.trim();
    const own = (layout.skip ?? []).find(([pattern]) => pattern.test(fullName));
    if (own) { skip(own[1], label); continue; }
    if (!/^(CC|CC PAIR|CC\(8\)|NRPN)$/.test(type)) { skip('not a control change or an NRPN (a program change, pitch bend, aftertouch, or none)', label); continue; }
    const n = numbers(row.number);
    if (!n.length || n.some((x) => !Number.isInteger(x) || x < 0 || x > 127)) { skip('printed without a control number', label); continue; }
    let recipe;
    let pairOf = null;
    if (type === 'NRPN') {
      if (n.length !== 2) { skip('an NRPN printed without its MSB', label); continue; }
      recipe = { id: `nrpn${hex(n[0])}${hex(n[1])}`, kind: 'nrpn', channel, parameterMsb: n[0], parameterLsb: n[1], valueResolution: 7, value: '$encodedValue', nullAfterSend: false };
    } else if (n.length === 2) {
      if (n[1] !== n[0] + 32) { skip('a CC pair that is not a controller and its fine partner 32 above', label); continue; }
      pairOf = n;
      recipe = { id: `cc${n[0]}`, kind: 'cc', channel, controller: n[0], value: '$encodedValue' };
    } else {
      recipe = { id: `cc${n[0]}`, kind: 'cc', channel, controller: n[0], value: '$encodedValue' };
    }
    if (part) recipe.id = `${recipe.id}_${part.channel}`;

    // Its values.
    const range = readRange(row.range);
    const mapped = row.mapped ? readRange(row.mapped) : null;
    // A value table the row points to, when it numbers every value of the range.
    const tabled = valueListFor(row, data.valueTables);
    const covers = tabled && range && tabled.entries.length === range.max - range.min + 1 && tabled.entries.every((e, i) => e.value === range.min + i && e.label);
    if (tabled && !covers) {
      const why = `${tabled.table.title}${tabled.list ? ` (${tabled.list})` : ''} numbers ${tabled.entries.map((e) => e.value).join(', ')} for a range of ${range ? `${range.min} - ${range.max}` : row.range}`;
      tableMisses.set(why, [...(tableMisses.get(why) ?? []), fullName]);
    }
    const choices = listedValues(row.range) ?? namedValues(row.notes) ?? (covers ? tabled.entries.map(({ value, label: l }) => ({ value, label: l })) : null);
    const describe = [];
    let read = null;
    const pair = /^\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(String(row.range).trim());
    if (choices && (!range || choices.every((c) => c.value >= Math.min(range.min, range.max) && c.value <= Math.max(range.min, range.max)) || listedValues(row.range))) {
      read = { choices };
    } else if (pair) {
      // `(0 , 127)`: two values, printed without names.
      read = { choices: [Number(pair[1]), Number(pair[2])].map((v) => ({ value: v, label: String(v) })) };
    } else if (range) {
      // The MiniNova's KeyboardOctave runs 124 - 4: 124~127 are -4~-1, 0~4 are 0~+4.
      if (range.min > range.max) { skip('a range that wraps past 127 (two\'s complement, 124 - 4)', label); continue; }
      read = { min: range.min, max: range.max };
      const shown = mapped && (mapped.min !== range.min || mapped.max !== range.max) ? { min: mapped.min, max: mapped.max }
        : range.shownMin !== undefined && (range.shownMin !== range.min || range.shownMax !== range.max) ? { min: range.shownMin, max: range.shownMax } : null;
      if (shown) read.shown = shown;
    } else if (/[a-z]/i.test(row.range) && !/\d/.test(row.range)) {
      skip('its values named but not numbered', `${label}: ${row.range}`);
      continue;
    } else {
      skip('printed without a range', label);
      continue;
    }
    if (read.min !== undefined && read.min < 0) { skip('a range printed as the value shown, not the value sent', `${label}: ${row.range}`); continue; }
    if (read.min !== undefined && read.max > (pairOf ? 255 : 127)) { skip(`a range of ${read.min} - ${read.max}, wider than its message carries`, label); continue; }
    if (read.min !== undefined && read.min === read.max) { skip(`printed with the range ${row.range}`, label); continue; }
    if (pairOf) {
      // The coarse half: the top seven of eight bits.
      const coarse = { min: read.min >> 1, max: read.max >> 1 };
      describe.push(`The coarse half of ${row.range.replace(/\s+/g, ' ')} on CC ${pairOf[0]}; the fine half, CC ${pairOf[1]}, is left out.`);
      read = { ...coarse, ...(read.shown ? { shown: read.shown } : {}) };
      pairs.push(`${fullName} (CC ${pairOf[0]}, fine CC ${pairOf[1]})`);
    }
    if (row.notes && !read.choices && !/^Send on appropriate channel/i.test(row.notes)) describe.push(row.notes.replace(/\s+/g, ' ').replace(/([^.])$/, '$1.'));
    if (/[a-z]/i.test(row.range) && !read.choices && !/^\(?-?\d/.test(row.range.replace(/[–−]/g, '-'))) describe.push(`Printed range: ${row.range}.`);
    // A message another row has: a second switch on it, when both are choices whose values differ.
    const values = read.choices ? read.choices.map((c) => c.value) : null;
    if (seen.has(recipe.id)) {
      const taken = seen.get(recipe.id);
      if (!values || !taken || values.some((v) => taken.includes(v))) { skip('a message another row already has', label); continue; }
      seen.set(recipe.id, [...taken, ...values]);
      shared.add(recipe.id);
    } else seen.set(recipe.id, values);
    recipes.set(recipe.id, recipe);

    const ownGroup = layout.groupOf?.(sectioned, section) ?? (section || (part ? '' : 'Program'));
    const group = part ? (ownGroup ? `${part.name}: ${ownGroup}` : part.name) : ownGroup;
    const leaf = sectioned.startsWith(`${ownGroup} `) ? sectioned.slice(ownGroup.length + 1) : sectioned;
    const def = /^-?\d+/.exec(String(row.default ?? '').trim());
    const base = {
      id: unique(`${camel(group)}.${camel(leaf) || recipe.id}`),
      name: fullName,
      group,
      ...(describe.length ? { description: describe.join(' ') } : {}),
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipe.id,
    };
    if (read.choices) {
      const used = new Set();
      const list = read.choices.map(({ value, label: l }) => { const s = slug(l); const id = used.has(s) ? `${s}_${value}` : s; used.add(id); return { id, label: l, value }; });
      const printedDefault = def ? list.find((c) => c.value === Number(def[0])) : null;
      parameters.push({ ...base, type: 'choice', default: (printedDefault ?? list[0]).id, choices: list, display: { mode: 'choice', shortLabel: camel(leaf) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'enum' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list.length === 2 ? 'ToggleButton' : list.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
    } else {
      const raw = def ? Number(def[0]) : null;
      const dflt = raw !== null && !pairOf && raw >= read.min && raw <= read.max ? raw : raw !== null && pairOf && (raw >> 1) >= read.min && (raw >> 1) <= read.max ? raw >> 1 : read.shown && read.shown.min < 0 ? Math.round((read.min + read.max) / 2) : read.min;
      const bipolar = read.shown && read.shown.min < 0 && read.shown.max > 0;
      parameters.push({
        ...base,
        type: bipolar ? 'bipolar' : 'integer',
        range: { min: read.min, max: read.max },
        default: dflt,
        display: { mode: 'number', unit: '', shortLabel: camel(leaf), ...(read.shown ? { min: read.shown.min, max: read.shown.max } : {}) },
        normalization: { mode: 'linear' },
        encoding: { type: 'u7' },
        sendPolicy: read.max - read.min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
        ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Time|Depth|Amount/i.test(fullName) ? 'Slider' : 'Knob' },
      });
    }
  }
  if (shared.size) notes.push(`Messages that carry several switches, each with values of its own, a choice each: ${[...new Set([...shared].map((id) => { const r = recipes.get(id); return r.kind === 'nrpn' ? `NRPN ${r.parameterMsb}:${r.parameterLsb}` : `CC ${r.controller}`; }))].join(', ')}. CEditor does not attribute one of these to a parameter when the instrument sends it.`);
  if (pairs.length) notes.push(`${pairs.length} CC pair(s) are the coarse controller alone, 0 - 127: each pair is a controller and its partner 32 above, MIDI's coarse and fine, and the Circuit Mono Station's guide says the second "is used to create an 8-bit message for a 0-255 value range" without saying which bit it carries. ${pairs.join('; ')}.`);
  for (const [why, list] of skipped) notes.push(`Left out, ${why}: ${list.join(', ')}.`);
  if (data.valueTables?.length) notes.push(`${parameters.filter((p) => p.type === 'choice').length} choice(s), their names from the value tables the rows point to (${[...new Set(data.valueTables.map((t) => t.title))].join(', ')}) where a table numbers every value of the range, or from the rows' own notes.`);
  for (const [why, names] of tableMisses) notes.push(`A number, not a choice, where the value table it points to does not number its whole range: ${why}: ${names.join(', ')}.`);

  const variables = { channel: 1, ...Object.fromEntries((layout.parts ?? []).flatMap((b) => b.parts).map((p) => [p.channel, p.default ?? 1])), ...(layout.variables ?? {}) };
  for (const block of layout.parts ?? []) notes.push(`Pages ${block.pages[0]}-${block.pages.at(-1)}: ${block.parts.map((p) => `${p.name} on the ${p.channel} variable (channel ${variables[p.channel]})`).join(', ')}${block.why ? `; ${block.why}` : ''}.`);
  const tests = [];
  const status = (p) => {
    const r = recipes.get(p.messageRecipe);
    const channel = r.channel === '$channel' ? variables.channel : variables[r.channel.replace(/^\$/, '')];
    return 0xb0 + channel - 1;
  };
  const writable = parameters;
  const picks = [
    writable.find((p) => recipes.get(p.messageRecipe).kind === 'cc'),
    writable.find((p) => recipes.get(p.messageRecipe).kind === 'cc' && p.type === 'choice'),
    writable.find((p) => recipes.get(p.messageRecipe).kind === 'nrpn' && p.type !== 'choice'),
    writable.find((p) => recipes.get(p.messageRecipe).kind === 'nrpn' && p.type === 'choice'),
    [...writable].reverse().find((p) => recipes.get(p.messageRecipe).kind === 'cc'),
  ].filter(Boolean);
  for (const p of [...new Set(picks)]) {
    const r = recipes.get(p.messageRecipe);
    const choice = p.type === 'choice' ? p.choices.at(-1) : null;
    const value = choice ? choice.value : Math.min(p.range.max, Math.max(p.range.min, 100));
    const s = status(p);
    const bytes = r.kind === 'cc' ? [[r.controller, value]] : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, value]];
    tests.push({
      name: `${p.name} = ${choice ? choice.label : value} (${r.kind === 'cc' ? `CC ${r.controller}` : `NRPN ${r.parameterMsb}:${r.parameterLsb}`})`,
      parameter: p.id,
      value: choice ? choice.id : value,
      expectedHex: bytes.map(([cc, v]) => [s, cc, v].map(hex).join(' ')).join('\n'),
    });
  }

  const profile = {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Novation',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: data.sources.map((s) => ({
      type: 'manual',
      title: s.title,
      notes: `MIDI parameter table (pages ${Array.isArray(s.pages) ? s.pages.join(', ') : s.pages}) read by tools/profiles/novation/read-novation-pdf.mjs from ${s.file} (sha256 ${s.sha256}), ${s.url}. Not yet checked against the instrument itself.`,
    })),
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/novation/make-profiles.mjs; edit the layout in tools/profiles/novation/synths/, not this file.',
      'Every parameter is a row of the guide\'s MIDI parameter table, with its printed name. Nothing here has been sent to a real instrument yet.',
      `No identity check: ${layout.noIdentity ?? 'the guide prints no Device Inquiry reply'}.`,
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-guide\'s-midi-parameter-table',
      realtimeEditing: 'complete-for-the-guide\'s-midi-parameter-table',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the panel sends these same messages when its MIDI settings allow',
      verifiedOnHardware: false,
      ...(layout.coverage ?? {}),
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.kind.localeCompare(b.kind) || (a.controller ?? a.parameterMsb * 128 + a.parameterLsb) - (b.controller ?? b.parameterMsb * 128 + b.parameterLsb) || a.id.localeCompare(b.id)),
    parameters,
    ...(layout.presets ? { presets: layout.presets } : {}),
    tests,
  };
  const pullNotes = [];
  addPull(profile, data, layout, pullNotes);
  profile.authoringNotes.push(...pullNotes);
  return profile;
}

export { stringifyProfile };
