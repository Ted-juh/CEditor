// build-alesis-profile.mjs — the A6 Andromeda's transcription (tables/<name>.json) and its layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the specification:
//   - a row of the chart is a parameter when the chart gives it a range (`a to b`): sent by the
//     MIDI Editing message (opcode 0E), its parent page and child ID, the value a 17-bit two's
//     complement number in three bytes, bits 14 - 16 first (under the mix channel, sent as 0);
//   - its range and default as printed (`Sysex Only Fields`), the default the range's first value
//     where the printed one is outside it;
//   - its name as printed: the first word the group, the rest the name without POT or SWITCH,
//     underscores as spaces;
//   - left out, and named: the rows whose range is `any` (panel buttons: a press, not a setting),
//     those with no range, those whose range `Depends on effect config`, and the unused indices;
//   - the mode select (opcode 0D) a choice of its two modes; the Device Inquiry reply as printed.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const HEADER = ['F0', '00', '00', '0E', '1D'];

/** `1, 2, 3, 5, 8, 9` -> `1 - 3, 5, 8 - 9`. */
export function spans(numbers) {
  const out = [];
  for (const n of [...numbers].sort((a, b) => a - b)) {
    const last = out.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a} - ${b}`)).join(', ');
}

/** `OSC_1 TUNESEMITONE POT` -> { group: 'OSC 1', name: 'TUNESEMITONE', kind: 'POT' }. */
export function nameOf(printed) {
  const words = printed.split(/\s+/);
  const kind = /^(POT|SWITCH)$/.test(words.at(-1)) ? words.pop() : null;
  const [group, ...rest] = words;
  return { group: group.replace(/_/g, ' '), name: (rest.join(' ') || group).replace(/_/g, ' '), kind };
}

/** A row's range as printed -> [min, max], or null when it is not two numbers. */
export function rangeOf(range) {
  const m = /^(-?\d+) to (-?\d+)$/.exec(range ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function buildAlesisProfile(data, layout) {
  const { chart, source } = data;
  const left = { any: [], none: [], effect: [], unused: [], wide: [] };
  const outside = [];
  const recipes = [];
  const parameters = [];
  const ids = new Set();
  const addresses = new Map();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  for (const r of chart.rows) {
    if (r.notUsed) { left.unused.push(r.index); continue; }
    if (r.range === 'any') { left.any.push(r.index); continue; }
    if (!r.range) { left.none.push(r); continue; }
    if (/^Depends on effect config$/.test(r.range)) { left.effect.push(r); continue; }
    const range = rangeOf(r.range);
    if (!range) throw new Error(`chart index ${r.index}: range "${r.range}" is not read`);
    // A parent or child over 127 is no MIDI data byte (the chart's two at child 255 are buttons).
    if (r.parent > 127 || r.child > 127) { left.wide.push(r.index); continue; }
    const key = `${r.parent}/${r.child}`;
    if (addresses.has(key)) throw new Error(`chart index ${r.index}: parent ${r.parent} child ${r.child} is index ${addresses.get(key)}'s too`);
    addresses.set(key, r.index);
    const [min, max] = range;
    const { group, name } = nameOf(r.name);
    const recipe = { id: `edit${hex(r.parent)}${hex(r.child)}`, kind: 'sysex', template: [...HEADER, '0E', hex(r.parent), hex(r.child), '$encodedValue', 'F7'] };
    recipes.push(recipe);
    let def = r.default;
    if (def < min || def > max) { outside.push(`${r.index} (${r.default}, ${r.range})`); def = min; }
    parameters.push({
      id: unique(`${camel(group)}.${camel(name)}`),
      name,
      group,
      source: { page: r.page },
      description: `Chart index ${r.index} (page ${r.page}): ${r.name}, parent ${r.parent}, child ${r.child}; NRPN ${r.nrpn ? 'ON' : 'OFF'}; default ${r.default}; range ${r.range}.`,
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipe.id,
      type: 'integer',
      range: { min, max },
      default: def,
      display: { mode: 'number', unit: '', shortLabel: camel(name) },
      normalization: { mode: 'linear' },
      encoding: { type: 's17-msb-lsb' },
      sendPolicy: max - min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
      ui: { preferredComponent: max - min <= 1 ? 'ToggleButton' : max - min > 8 ? 'Knob' : 'Combobox' },
    });
  }
  // The mode select, opcode 0D: `<mode> = 0 = Program mode; 1 = Mix mode`.
  const modeLine = data.blocks.modeSelect.lines.find((l) => /<mode>\s*=/.test(l)) ?? '';
  const modes = [...modeLine.matchAll(/(\d+) = (\w+) mode/g)].map((m) => ({ value: Number(m[1]), label: m[2] }));
  if (modes.length !== 2) throw new Error(`the mode select's values are not read: "${modeLine}"`);
  recipes.push({ id: 'modeSelect', kind: 'sysex', template: [...HEADER, '0D', '$encodedValue', 'F7'] });
  parameters.unshift({
    id: 'system.mode', name: 'Mode', group: 'System', source: { page: data.blocks.modeSelect.pages[0] },
    description: `MIDI Mode Select (opcode 0D, page ${data.blocks.modeSelect.pages[0]}): ${modeLine.trim().replace(/\s+/g, ' ')}. The settings are those the mode had when it was last left.`,
    access: { canRead: false, canWrite: true, realtimeSafe: false, source: 'singleParameter' },
    messageRecipe: 'modeSelect', type: 'choice', default: camel(modes[0].label),
    choices: modes.map(({ value, label }) => ({ id: camel(label), label, value })),
    display: { mode: 'choice', shortLabel: 'mode' }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u7' },
    sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: 'RadioButtonGroup' },
  });

  // The Device Inquiry reply, as printed: `00 00 0E Alesis Manufacturer ID`, `1D 00 A6 Family ID, LSB
  // first`, `00 00 A6 Family Member, LSB first`.
  const field = (re) => (data.blocks.inquiry.lines.map((l) => re.exec(l)).find(Boolean) ?? [])[1]?.split(' ');
  const identity = { manufacturerId: field(/^\s*((?:[0-9A-F]{2} ){2}[0-9A-F]{2})\s+Alesis Manufacturer ID/), familyCode: field(/^\s*([0-9A-F]{2} [0-9A-F]{2})\s+A6 Family ID/), modelNumber: field(/^\s*([0-9A-F]{2} [0-9A-F]{2})\s+A6 Family Member/) };
  if (Object.values(identity).some((v) => !v)) throw new Error('the Device Inquiry reply is not read');

  // The document's own examples are the first vectors: `Set Filter 2 Offset to –0.02: F0 00 00 0E 1D
  // 0E 13 08 07 7F 70 F7`. (Its other, `Turn on Osc 2 Mod 3`, presses a button left out here.)
  const tests = [];
  const editing = data.blocks.editing.lines;
  editing.forEach((line, k) => {
    const m = /^\s*(F0 00 00 0E 1D 0E (?:[0-9A-F]{2} ){5}F7)\s*$/.exec(line);
    if (!m) return;
    const title = editing.slice(0, k).reverse().find((l) => /:\s*$/.test(l.trim())).trim().replace(/:$/, '');
    const bytes = m[1].split(' ');
    const p = parameters.find((x) => x.messageRecipe === `edit${bytes[6]}${bytes[7]}`);
    if (!p) return;
    const wire = (parseInt(bytes[8], 16) & 7) << 14 | parseInt(bytes[9], 16) << 7 | parseInt(bytes[10], 16);
    tests.push({ name: `The specification's example: ${title}`, parameter: p.id, value: wire >= 65536 ? wire - 131072 : wire, expectedHex: m[1] });
  });
  const wireOf = (v) => { const w = v & 0x1ffff; return [(w >> 14) & 7, (w >> 7) & 127, w & 127].map(hex); };
  const send = (p, value) => {
    const r = recipes.find((x) => x.id === p.messageRecipe);
    return { name: `${p.group} ${p.name} = ${value}`, parameter: p.id, value, expectedHex: r.template.flatMap((t) => (t === '$encodedValue' ? wireOf(value) : [t])).join(' ') };
  };
  const ints = parameters.filter((p) => p.type === 'integer');
  for (const [p, value] of [[ints[0], ints[0].range.max], [ints.find((x) => x.range.min <= -65534), -65534], [ints.find((x) => x.range.max === 65535), 65535], [ints.at(-1), ints.at(-1).range.max]]) tests.push(send(p, value));
  tests.push({ name: 'Mode = Mix (opcode 0D)', parameter: 'system.mode', value: 'mix', expectedHex: [...HEADER, '0D', '01', 'F7'].join(' ') });

  const pages = (b) => (b.pages[0] === b.pages[1] ? `page ${b.pages[0]}` : `pages ${b.pages[0]} - ${b.pages[1]}`);
  const notes = [
    'Generated by tools/profiles/alesis/make-profiles.mjs; edit the layout in tools/profiles/alesis/synths/, not this file.',
    `Every parameter but Mode is a row of the specification's SYSEX AND NRPN PARAMETER CHART (dated ${chart.date}), sent by its MIDI Editing message: F0 00 00 0E 1D 0E, the row's parent page and child ID, then the value, a 17-bit two's complement number in three bytes (<data2> bits 14 - 16, <data1> bits 7 - 13, <data0> bits 0 - 6), F7. Its range and default are the chart's, which prints them as "Sysex Only Fields". Nothing here has been sent to a real instrument yet.`,
    '<data2> also carries the mix channel (0xxx xyyy: xxxx the channel, yyy the value\'s top bits). It is sent as 0: in Program mode the A6 ignores it and edits the program edit buffer; in Mix mode the edit goes to mix channel 1, shown on the A6\'s screen only when that channel is selected. Another mix channel is not laid out.',
    'The chart marks most rows NRPN ON (the parent the NRPN\'s MSB, the child its LSB), and the A6 sends its panel as NRPNs when Global\'s PANEL TXMODE says so; the specification prints no NRPN value format (its Default and Range are for SysEx only), so neither sending by NRPN nor following the panel back is laid out.',
    'No Pull: the specification prints the program, mix and global dumps\' byte layouts, but in the engine\'s own values (Oscillator 1 Semitone at bytes 958 - 959, -32768 to +32767, where the chart\'s OSC_1 TUNESEMITONE is -60 to 60), and does not say how one maps to the other.',
    'The chart names no values (a mod source is 1 to 79), so every chart row is a number. Its names are the firmware\'s, as printed: the first word the group, the rest the name, POT and SWITCH dropped, underscores as spaces.',
    `Left out, ${left.any.length} rows whose range is "any": panel buttons and page tabs (a press, not a setting; a button's setting, where it has one, is its POT row beside it, as OSC_2 MOD3BUTTON's is MOD3ENABLE). Chart indices ${spans(left.any)}.`,
  ];
  const switches = chart.rows.filter((r) => /\sSWITCH$/.test(r.name ?? '') && rangeOf(r.range));
  if (switches.length) notes.push(`Laid out as printed, ${switches.length} SWITCH rows the chart gives a range rather than "any": ${switches.map((r) => `${r.index} ${r.name.replace(/ SWITCH$/, '')} (${r.range})`).join(', ')}.`);
  if (left.none.length) notes.push(`Left out, rows the chart prints with no default or range: ${left.none.map((r) => `${r.index} ${r.name}`).join(', ')}.`);
  if (left.effect.length) notes.push(`Left out, the digital effect's rows whose range "Depends on effect config" (chart indices ${spans(left.effect.map((r) => r.index))}: ${left.effect[0].name} - ${left.effect.at(-1).name}): the chart prints no range for any effect.`);
  if (left.wide.length) notes.push(`Left out, rows whose parent or child is over 127: chart indices ${spans(left.wide)}.`);
  if (left.unused.length) notes.push(`Chart indices ${spans(left.unused)} are printed "(not used)".`);
  if (outside.length) notes.push(`The chart's default is outside its own range for ${outside.length} rows, whose default here is the range's first value: index ${outside.join(', ')}.`);
  const tempo = chart.rows.find((r) => r.range === '60 to 65335');
  if (tempo) notes.push(`${tempo.name}'s range is laid out as printed, 60 to 65335 (index ${tempo.index}); every other row tops out at 65535.`);

  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Alesis',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: source.title, notes: `The SYSEX AND NRPN PARAMETER CHART (PDF ${pages(chart)}), the MIDI Editing and MIDI Mode Select opcodes (${pages(data.blocks.editing)}) and the Device Inquiry reply (${pages(data.blocks.inquiry)}), read by tools/profiles/alesis/read-a6-chart.mjs from ${source.file} (printed ${source.printed}, sha256 ${source.sha256}), ${source.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: notes,
    variables: { channel: 1 },
    identity: { ...identity, timeoutMs: 1000, retries: 0 },
    coverage: {
      singleParameterWrite: `complete-for-the-chart's-rows-with-a-range: ${parameters.length - 1} of its ${chart.rows.filter((r) => !r.notUsed).length} rows, and the mode select`,
      realtimeEditing: 'complete-for-the-chart\'s-rows-with-a-range',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented: the dumps hold the engine\'s values, and the specification does not map them to the chart\'s',
      bankDump: 'notImplemented',
      inboundControllers: 'not laid out: the A6 sends its panel as NRPNs whose value format the specification does not print',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: recipes,
    parameters,
    tests,
  };
}

export { stringifyProfile };
