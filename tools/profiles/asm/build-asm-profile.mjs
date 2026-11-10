// build-asm-profile.mjs — an ASM transcription (tables/<name>.json) and a layout (synths/<name>.mjs)
// -> a CEditor device profile.
//
// Every row is its NRPN, the value 14 bits on data entry: VV, the data MSB, on CC 6 and WW, the data
// LSB, on CC 38, the value VV * 128 + WW. What the builder takes as settled, from each row's comment:
//   - none: the spec's default range, 0 - 8192 (`[0 - 2000H]`);
//   - `VV*128+WW = [a,b]`: that range, a choice where `means A / B / C` names each value;
//   - `when VV=01H ,set OSC2 Mode` …: the NRPN is several parameters, VV choosing which and WW its
//     value; each is laid out, its value VV * 128 + WW;
//   - `VV = [0,3] means MUTATOR 1-4`: the same, one parameter for each VV;
//   - `VV=05H ,WW = [1,4]` (the ARP's, the LFOs' and envelopes' switches): one parameter, VV fixed;
//   - `[Rhythm List (LFO Rate)]`: a choice of that list's values, in order;
//   - an NRPN printed as a run (`30H-37H`, `Macro1 Depth1 to Depth8`): one parameter for each.
// Where VV is fixed, the value shown is WW (display min/max), what is sent VV * 128 + WW.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const byte = (h) => parseInt(String(h).replace(/H-?$/i, ''), 16);
const slug = (label) => String(label).toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';
const DEFAULT = { lo: 0, hi: 8192, description: 'The spec gives no range: its default, 0 - 8192.' };

/** A printed NRPN LSB, `04H` or `30H-37H`, -> [first, last]. */
export function lsbRange(text) {
  const m = /^([0-9A-F]{2})H(?:-([0-9A-F]{2})H)?$/i.exec(text);
  if (!m) throw new Error(`NRPN LSB not read: ${text}`);
  return [parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)];
}

/** `A / B / C`, `OFF/NoteOn/LFO1` -> ['A', 'B', 'C']. */
const labels = (text) => text.split('/').map((s) => s.trim()).filter(Boolean);

/**
 * One row's comment -> what its parameters are: [{ suffix?, base, lo, hi, choices?, display?,
 * description? }] (base: VV * 128 for a fixed VV), or { leave: why }.
 */
export function readNote(note, lists = {}) {
  if (!note) return [{ base: 0, ...DEFAULT }];
  const n = note.replace(/\s+/g, ' ').trim();
  if (/depends on (?:PRE|POST)-FX type/.test(n)) return { leave: 'settings whose values depend on the effect type, which the spec does not list' };
  if (/set mod (?:soures|target) num/.test(n)) return { leave: 'mod sources and targets: a number above 127 moves to another VV, and the spec does not list them' };
  const rhythm = /^\[Rhythm List \((.+)\)\]$/.exec(n);
  if (rhythm) {
    const list = lists[rhythm[1]];
    if (!list) throw new Error(`no rhythm list ${rhythm[1]}`);
    return [{ base: 0, lo: 0, hi: list.length - 1, choices: list.map((label, value) => ({ value, label })), description: `The ${rhythm[1]} rhythm list.` }];
  }
  if (/> 4096,Cent/.test(n)) return [{ base: 0, lo: 0, hi: 8192, description: 'Above 4096 the value is negative: cent = value - 8192 (as printed).' }];
  if (/0 means depth = -128/.test(n)) return [{ base: 0, lo: 0, hi: 8192, display: { min: -128, max: 128 }, description: '0 is -128, 4096 is 0, 8192 is 128.' }];

  // WW's values: `WW = [0,1] = Single / WaveScan`, `WW = [0,9] means OSC1 / OSC2 …`, a signed byte.
  const wwOf = (text) => {
    if (/when WW > 64,\s*semi = WW - 128/.test(text)) {
      const choices = [];
      for (let s = -63; s <= 64; s++) choices.push({ value: s < 0 ? s + 128 : s, label: s > 0 ? `+${s}` : String(s) });
      return { lo: 0, hi: 127, choices };
    }
    const m = /WW = \[(\d+),\s*(\d+)\](?:\s*(?:=|means)\s*(.+?))?(?:,\s*$|$)/.exec(text);
    if (!m) return null;
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    const names = m[3] ? labels(m[3].replace(/,$/, '')) : [];
    return names.length === hi - lo + 1 ? { lo, hi, choices: names.map((label, k) => ({ value: lo + k, label })) } : { lo, hi, ...(m[3] ? { description: `Printed: ${m[3]}.` } : {}) };
  };

  // `when VV=00H ,set OSC1 Mode, when VV=01H ,set OSC2 Mode, … WW = [0,1] = Single / WaveScan`.
  const sets = [...n.matchAll(/when VV=([0-9A-F]{2})H ,set ([^,]+?)(?:,|$)/g)];
  if (sets.length) {
    const ww = wwOf(n);
    if (!ww) throw new Error(`VV-selected values not read: ${n}`);
    return sets.map((m) => ({ suffix: m[2].trim(), set: true, base: parseInt(m[1], 16) * 128, ...ww }));
  }
  // `VV = [0,3] means MUTATOR 1-4 WW = [0,7] means FM-Lin (FM) / …`.
  const multi = /^VV = \[0,(\d+)\] means (.+?),? (WW = .+)$/.exec(n);
  if (multi) {
    const ww = wwOf(multi[3]);
    if (!ww) throw new Error(`VV-selected values not read: ${n}`);
    return Array.from({ length: Number(multi[1]) + 1 }, (u, k) => ({ suffix: String(k + 1), base: k * 128, ...ww, description: [`VV ${k} (${multi[2]}).`, ww.description].filter(Boolean).join(' ') }));
  }
  // `VV=05H ,WW = [1,4]`, `VV=00H set Wave to WW`, `VV=08H , BPM Sync off ,set Delay to WW,`.
  const fixed = /^VV=([0-9A-F]{2})H\s*,?\s*(.*)$/.exec(n);
  if (fixed) {
    const base = parseInt(fixed[1], 16) * 128;
    const ww = wwOf(fixed[2]);
    if (ww) return [{ base, ...ww }];
    const what = fixed[2].replace(/^,\s*/, '').replace(/[,.]\s*$/, '').replace(/\s*,\s*/g, ', ');
    return [{ base, lo: 0, hi: 127, description: `${what ? `${what[0].toUpperCase()}${what.slice(1)}. ` : ''}The spec gives no range: WW, 0 - 127.` }];
  }
  // `VV*128+WW = [0,218]`, `VV*128+WW = [0,1] means OFF / ON`, `… means [Log(-64), Lin(0), Exp(64)]`.
  const range = /^VV\*128\+WW = \[\s*(\d+),\s*(\d+)\]\s*(?:means\s+(.+))?$/.exec(n);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    if (!range[3]) return [{ base: 0, lo, hi }];
    const ends = [...range[3].matchAll(/\((-?\d+)\)/g)].map((m) => Number(m[1]));
    if (/^\[/.test(range[3]) && ends.length >= 2) return [{ base: 0, lo, hi, display: { min: ends[0], max: ends.at(-1) }, description: `Printed: ${range[3]}.` }];
    const names = labels(range[3]);
    if (names.length === hi - lo + 1) return [{ base: 0, lo, hi, choices: names.map((label, k) => ({ value: lo + k, label })) }];
    return [{ base: 0, lo, hi, description: `Printed: ${range[3]}.` }];
  }
  throw new Error(`comment not read: ${n}`);
}

export function buildAsmProfile(data, layout) {
  const notes = [];
  const left = new Map();
  const leave = (why, what) => left.set(why, [...(left.get(why) ?? []), what]);
  const renamed = new Set();
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const recipes = new Map();
  const parameters = [];
  const groupStarts = new Map(layout.groups ?? []);
  const shared = new Map();
  let group = 'Sound';
  const corrected = [];
  for (const printed of data.rows) {
    // A row the spec prints wrongly, corrected by the layout.
    const fix = layout.fix?.[printed.name];
    const row = fix ? { ...printed, ...fix } : printed;
    if (fix) corrected.push(`${printed.name} (${layout.fixNotes?.[printed.name] ?? JSON.stringify(fix)})`);
    group = groupStarts.get(row.name) ?? group;
    let name = row.name;
    for (const [re, to] of layout.rename ?? []) {
      if (!re.test(name)) continue;
      const noted = Object.keys(layout.renameNotes ?? {}).find((k) => row.name.includes(k));
      if (noted) renamed.add(noted);
      name = name.replace(re, to);
    }
    if (layout.leaveOut?.[row.name]) { leave(layout.leaveOut[row.name], name); continue; }
    const msb = byte(row.msb);
    const [first, last] = lsbRange(row.lsb);
    const note = layout.cleanNote ? layout.cleanNote(row.note ?? '') || undefined : row.note;
    const read = readNote(note, data.lists);
    if (read.leave) { leave(read.leave, name); continue; }
    // A run of NRPNs: `Macro1 Depth1 to Depth8`, `LFO1 step9 to step64`.
    const run = /^(.*?)(\d+) to \D*?(\d+)$/.exec(name);
    const nrpns = [];
    for (let lsb = first; lsb <= last; lsb++) {
      if (first === last) { nrpns.push({ lsb, name }); continue; }
      if (!run || Number(run[3]) - Number(run[2]) !== last - first) throw new Error(`run of NRPNs not named: ${name} ${row.lsb}`);
      nrpns.push({ lsb, name: `${run[1]}${Number(run[2]) + lsb - first}` });
    }
    for (const nrpn of nrpns) {
      const recipe = { id: `nrpn${hex(msb)}${hex(nrpn.lsb)}`, kind: 'nrpn', channel: '$channel', parameterMsb: msb, parameterLsb: nrpn.lsb, valueResolution: 14, value: '$encodedValue' };
      recipes.set(recipe.id, recipe);
      for (const spec of read) {
        // `when VV=01H ,set OSC2 Mode`: the name the comment gives; `VV = [0,3] means MUTATOR 1-4`: numbered.
        const pName = spec.set ? spec.suffix : spec.suffix ? `${nrpn.name} ${spec.suffix}` : nrpn.name;
        const list = layout.lists?.[nrpn.name] ? data.lists[layout.lists[nrpn.name]] : null;
        if (list && list.length !== spec.hi - spec.lo + 1) throw new Error(`${nrpn.name}: ${list.length} values in the list, ${spec.hi - spec.lo + 1} in the range`);
        const choices = list ? list.map((label, k) => ({ value: spec.lo + k, label })) : spec.choices;
        const describe = [spec.description, row.cc !== undefined ? `Also CC ${row.cc} when Param RX is CC.` : null, list ? `The ${layout.lists[nrpn.name]} rhythm list.` : null].filter(Boolean);
        const base = { id: unique(`${camel(group)}.${camel(pName)}`), name: pName, group, ...(describe.length ? { description: describe.join(' ') } : {}), access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: recipe.id };
        const key = `${recipe.id}/${spec.base}`;
        shared.set(key, [...(shared.get(key) ?? []), pName]);
        if (choices) {
          const seen = new Set();
          const list2 = choices.map(({ value, label }) => { const s = slug(label); const id = seen.has(s) ? `${s}_${value}` : s; seen.add(id); return { id, label, value: spec.base + value }; });
          parameters.push({ ...base, type: 'choice', default: list2[0].id, choices: list2, display: { mode: 'choice', shortLabel: camel(pName) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u14' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list2.length === 2 ? 'ToggleButton' : list2.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
        } else {
          const min = spec.base + spec.lo;
          const max = spec.base + spec.hi;
          const display = spec.display ?? (spec.base ? { min: spec.lo, max: spec.hi } : null);
          parameters.push({ ...base, type: 'integer', range: { min, max }, default: min, display: { mode: 'number', unit: '', shortLabel: camel(pName), ...(display ?? {}) }, normalization: { mode: 'linear' }, encoding: { type: 'u14' }, sendPolicy: max - min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Amount|Amt|Vol|Cutoff|Res|Mix|Dry\/Wet|Gain|Depth/i.test(pName) ? 'Slider' : 'Knob' } });
        }
      }
    }
  }
  // Two rows the spec gives the same NRPN and VV (ENV5's on LFO1's NRPN, 3FH 04H): which is right is
  // not printed, so neither is laid out.
  const twice = [...shared].filter(([, names]) => names.length > 1);
  for (const [key, names] of twice) {
    for (const nm of names) {
      const i = parameters.findIndex((p) => p.name === nm && `${p.messageRecipe}/${Math.floor((p.choices?.[0]?.value ?? p.range.min) / 128) * 128}` === key);
      if (i >= 0) parameters.splice(i, 1);
    }
    const r = recipes.get(key.split('/')[0]);
    leave(`two rows the spec gives the same NRPN and VV (${hex(r.parameterMsb)}H ${hex(r.parameterLsb)}H, VV ${hex(Number(key.split('/')[1]) / 128)}H)`, names.join(' and '));
  }
  if (corrected.length) notes.push(`Rows the spec prints wrongly, corrected by the layout: ${corrected.join('; ')}.`);
  if (renamed.size) notes.push(`Names corrected from the spec: ${[...renamed].map((k) => layout.renameNotes?.[k] ?? k).join('; ')}; words a line break split (\`BP M\`, \`One- Shot\`) joined.`);
  for (const [why, list] of left) notes.push(`Left out, ${why}: ${list.join(', ')}.`);

  const variables = { channel: 1 };
  const status = 0xb0 + variables.channel - 1;
  const vector = (p, value, wire) => {
    const r = recipes.get(p.messageRecipe);
    return { name: `${p.group} ${p.name} = ${typeof value === 'string' ? p.choices.find((c) => c.id === value).label : value}`, parameter: p.id, value, expectedHex: [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, wire >> 7], [0x26, wire & 127]].map(([cc, v]) => [status, cc, v].map(hex).join(' ')).join('\n') };
  };
  const tests = [];
  for (const pick of layout.tests ?? []) {
    const p = parameters.find((q) => q.group === pick.group && q.name === pick.name);
    if (!p) throw new Error(`test parameter not found: ${pick.group} ${pick.name}`);
    const value = pick.label !== undefined ? p.choices.find((c) => c.label === pick.label)?.id : pick.value;
    if (value === undefined) throw new Error(`test value not found: ${pick.name} ${pick.label}`);
    const wire = typeof value === 'string' ? p.choices.find((c) => c.id === value).value : value;
    tests.push(vector(p, value, wire));
  }

  const doc = data.sources[0];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'ASM',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `NRPN table (pages ${layout.pages[0]} - ${layout.pages.at(-1)}) and rhythm lists (pages ${layout.listPages.join(', ')}) read by tools/profiles/asm/read-asm-nrpn.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/asm/make-profiles.mjs; edit the layout in tools/profiles/asm/synths/, not this file.',
      'Every parameter is a row of ASM\'s NRPN specification, sent as that NRPN with a 14-bit value: VV (the data MSB) on CC 6 and WW (the data LSB) on CC 38. The instrument\'s MIDI page 6 must have Param RX set to NRPN. Nothing here has been sent to a real instrument yet.',
      'The specification is for firmware 1.5. Later firmware adds parameters it does not list; those are not here.',
      'Where one NRPN is several parameters, told apart by VV (`when VV=01H ,set OSC2 Mode`), each is sent correctly, but CEditor does not follow them when the instrument sends them: an incoming NRPN is matched by its number alone.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-NRPN-specification',
      realtimeEditing: 'complete-for-the-NRPN-specification',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these NRPNs when Param TX is NRPN',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.parameterMsb - b.parameterMsb || a.parameterLsb - b.parameterLsb),
    parameters,
    tests,
  };
}

export { stringifyProfile };
