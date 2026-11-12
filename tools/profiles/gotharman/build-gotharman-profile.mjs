// build-gotharman-profile.mjs — a Gotharman manual's MIDI parameter list (tables/<name>.json) and its
// layout (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the manuals:
//   - the Anamono (`nrpn`): every numbered row is its NRPN (CC 99, CC 98 as the list gives them in
//     hex), its value the full 8-bit one of the manual's 14-bit mode: "the LSB bit from the controller
//     6 value and the 7 LSB bits from the controller 38 value, are assembled to a complete 8 bit
//     value", which is data entry's MSB and LSB for a value up to 255. What the value means is read
//     from the Values cell: a range from 0 is that range; a signed range (`-128 to +127`) and a list of
//     names (`Lpf, Bpf, Hpf`, `On/Off`) are counted from 0 in the order printed, which the manual does
//     not state (an inference, written down); anything else is the whole byte, 0 - 255. A row's
//     hard-wired controller is named in its description;
//   - the LD instruments (`cc`): every row is its controller, 0 - 127 (the manual gives no ranges), a
//     part's parameter on the part's channel ("For part parameters, MIDI channel are equal to part
//     number"), the instrument's on its global channel.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

/** What an Anamono Values cell says the 8-bit value is: { min, max, shown?, choices?, how }. */
export function valuesOf(text) {
  const t = String(text).trim();
  // A range: from 0, that range; from elsewhere (`-128 to +127`, `1 to 256`), counted from 0 at its low
  // end and shown as printed. One that runs down (`0 to -255`) is left as the byte.
  let m = /^(-?\d+) to \+?(-?\d+)\b/.exec(t);
  if (m && Number(m[2]) > Number(m[1])) {
    const [lo, hi] = [Number(m[1]), Number(m[2])];
    return lo === 0 ? { min: 0, max: hi, how: 'range' } : { min: 0, max: hi - lo, shown: { min: lo, max: hi }, how: 'offset' };
  }
  m = /^Off, (\d+) to (\d+)\b/.exec(t);
  if (m) return { min: 0, max: Number(m[2]), how: 'off and a range' };
  m = /^Select between the (\d+) modulation sources/.exec(t);
  if (m) return { min: 0, max: Number(m[1]) - 1, how: 'sources' };
  m = /^Select between ”Off” and (\d+) of the modulation sources/.exec(t);
  if (m) return { min: 0, max: Number(m[1]), how: 'off and sources' };
  // A list of names: `Lpf, Bpf, Hpf`, `On/Off`, `1, 2, 4, 8, 16, 32, 64, 128.`
  const names = /^[^,]+(?:, [^,]+)+$/.test(t) ? t.replace(/\.$/, '').split(', ') : /^\w+\/\w+$/.test(t) ? t.split('/') : null;
  if (names && names.every((n) => n.split(' ').length <= 3)) return { min: 0, max: names.length - 1, choices: names, how: 'names' };
  return { min: 0, max: 255, how: 'byte' };
}

/** An LD row's group: `VCF2 Reso` -> VCF2, `Insert EFX 1 Mix` -> Insert EFX 1; a part's, Part. */
export function ccGroupOf(row) {
  if (row.parts) return 'Part';
  const words = row.name.split(' ');
  const k = words.findIndex((w) => /\d/.test(w));
  return k >= 0 && k <= 2 ? words.slice(0, k + 1).join(' ') : 'Global';
}

export function buildGotharmanProfile(data, layout) {
  const recipes = new Map();
  const parameters = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const access = { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' };
  const continuous = { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true };
  const left = [];
  const counted = new Set();
  for (const row of data.rows) {
    if (layout.form === 'nrpn') {
      if (row.msb == null) { left.push(/^ASSIGN/.test(row.section) ? `${row.section.toLowerCase().replace(/^./, (c) => c.toUpperCase())}: ${row.name}` : row.name); continue; }
      const id = `nrpn${hex(row.msb)}${hex(row.lsb)}`;
      recipes.set(id, { id, kind: 'nrpn', channel: '$channel', parameterMsb: row.msb, parameterLsb: row.lsb, valueResolution: 14, value: '$encodedValue' });
      const v = valuesOf(row.values);
      if (['offset', 'names', 'off and sources'].includes(v.how)) counted.add(v.how);
      const group = row.section;
      const base = {
        id: unique(`${camel(group)}.${camel(row.name)}`), name: row.name, group, source: { page: row.page },
        description: `NRPN ${hex(row.msb)}h ${hex(row.lsb)}h (page ${row.page}): ${row.name}; ${row.values}${row.ctrl != null ? `; also CC ${row.ctrl}${row.group ? ` in the ${row.group} controller set` : ''}` : ''}.`,
        access, messageRecipe: id,
      };
      if (v.choices) {
        const seen = new Set();
        const choices = v.choices.map((label, k) => { let cid = camel(label) || `v${k}`; if (/^\d/.test(cid)) cid = `v${cid}`; if (seen.has(cid)) cid = `${cid}${k}`; seen.add(cid); return { id: cid, label, value: k }; });
        parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(row.name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u14-msb-lsb' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : 'Combobox' } });
        continue;
      }
      const wide = v.max - v.min > 16;
      parameters.push({
        ...base, type: 'integer', range: { min: v.min, max: v.max }, default: v.shown && v.shown.min < 0 ? -v.shown.min : v.min,                 // a signed range rests at its 0
        display: { mode: 'number', unit: '', shortLabel: camel(row.name), ...(v.shown ?? {}) }, normalization: { mode: 'linear' }, encoding: { type: 'u14-msb-lsb' },
        sendPolicy: wide ? continuous : { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: wide ? 'Knob' : 'Combobox' },
      });
      continue;
    }
    // An LD instrument's row.
    const channel = row.parts ? '$partChannel' : '$channel';
    const id = `cc${hex(row.cc)}${row.parts ? 'part' : ''}`;
    recipes.set(id, { id, kind: 'cc', channel, controller: row.cc });
    const group = ccGroupOf(row);
    parameters.push({
      id: unique(`${camel(group)}.${camel(row.name)}`), name: row.name, group,
      description: `CC ${row.cc}: ${row.name}${row.parts ? `, on the part's channel (parts 1 - ${row.parts}, MIDI channels 1 - ${row.parts})` : ', on the global channel'}.`,
      access, messageRecipe: id, type: 'integer', range: { min: 0, max: 127 }, default: 0,
      display: { mode: 'number', unit: '', shortLabel: camel(row.name) }, normalization: { mode: 'linear' }, encoding: { type: 'u7' }, sendPolicy: continuous, ui: { preferredComponent: 'Knob' },
    });
  }

  const variables = { channel: 1, ...(layout.form === 'cc' ? { partChannel: 1 } : {}) };
  const sentOf = (p, value) => {
    const r = recipes.get(p.messageRecipe);
    const v = p.type === 'choice' ? p.choices.find((c) => c.id === value).value : value;
    const status = 0xb0 + variables[r.channel.slice(1)] - 1;
    return (r.kind === 'cc' ? [[r.controller, v]] : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, v >> 7], [0x26, v & 127]]).map(([c, x]) => [status, c, x].map(hex).join(' ')).join('\n');
  };
  const picks = [parameters[0], parameters.find((p) => p.range?.max === 255), parameters.find((p) => p.display.min < 0), parameters.find((p) => p.type === 'choice' && p.choices.length > 2), parameters.find((p) => recipes.get(p.messageRecipe).channel === '$channel' && layout.form === 'cc')].filter((p, k, a) => p && a.indexOf(p) === k);
  const tests = picks.map((p) => { const value = p.type === 'choice' ? p.choices.at(-1).id : p.range.max; return { name: `${p.name} = ${value}`, parameter: p.id, value, expectedHex: sentOf(p, value) }; });

  const doc = data.source;
  const notes = layout.form === 'nrpn' ? [
    'Generated by tools/profiles/gotharman/make-profiles.mjs; edit the layout in tools/profiles/gotharman/synths/, not this file.',
    'Every parameter is a row of the manual\'s parameter list, sent as its NRPN (CC 99, CC 98) on the channel variable, its 8-bit value on data entry: the bit above the low seven on CC 6, the low seven on CC 38, as the manual\'s 14-bit mode assembles them. Set the MIDI edit page\'s NRPN mode to 14b for these to arrive whole. Nothing here has been sent to a real instrument yet.',
    `What a value means is read from the Values cell. A range from 0 is that range, and the whole byte (0 - 255) where the cell says something else (\`Morph from sine to …\`, \`Depends on # Of Fragments setting\`). ${counted.has('offset') ? 'A range that does not start at 0 (`-128 to +127`, `-32 to +31`, `1 to 256`) is counted from 0 at its low end, and shown as printed; ' : ''}${counted.has('names') ? 'a list of names (`Lpf, Bpf, Hpf`, `On/Off`) is counted from 0 in the order printed; ' : ''}${counted.has('off and sources') ? '`Off` and the modulation sources are counted from 0, Off first. ' : ''}The manual does not say how these are numbered: an inference, written down.`,
    'Each row\'s hard-wired controller, where it has one, is named in its description; some answer only in the primary or the secondary controller set, which CC 65 switches.',
    ...(left.length ? [`Left out, and named: the MIDI page's settings, which have no NRPN: ${left.join(', ')}.`] : []),
    ...(layout.notes ?? []),
  ] : [
    'Generated by tools/profiles/gotharman/make-profiles.mjs; edit the layout in tools/profiles/gotharman/synths/, not this file.',
    'Every parameter is a row of the manual\'s list of parameters controllable by CC, sent 0 - 127 (the manual gives no ranges): a part\'s on the variable partChannel, "MIDI channel are equal to part number", the instrument\'s on the channel variable, its global channel. The instrument answers only with its MIDI In mode set to Omni, Omni Thru, Multi-Timbral or Multi-Timbral/Thru and PccIN (Parameter CC Input) on; CClayr says whether the selected morph layer or both are set. Nothing here has been sent to a real instrument yet.',
    ...(layout.notes ?? []),
  ];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Gotharman',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `The ${layout.form === 'nrpn' ? 'parameter list' : 'list of parameters controllable by CC'} (PDF pages ${doc.pages[0]} - ${doc.pages[1]}), read by tools/profiles/gotharman/read-gotharman-manual.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}, linked from ${doc.linkedFrom}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: notes,
    variables,
    coverage: {
      singleParameterWrite: `complete-for-the-manual's-list: ${parameters.length} parameters`,
      realtimeEditing: 'complete-for-the-manual\'s-list',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented: the manual prints no dump',
      bankDump: 'notImplemented',
      inboundControllers: 'notImplemented',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()],
    parameters,
    tests,
  };
}

export { stringifyProfile };
