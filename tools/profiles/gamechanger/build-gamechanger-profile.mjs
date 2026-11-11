// build-gamechanger-profile.mjs — a Motor Synth's transcription (tables/<name>.json) and its layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the documents:
//   - a row of the NRPN map is its NRPN (MSB the address / 128, LSB the rest), the value 14 bits on
//     data entry (CC 6, then CC 38: the CC map's "DATA ENTRY MSB (used for NRPN)" and its LSB), the
//     range the row's MIDI DATA RANGE;
//   - the PARAMETER VALUE RANGE is what that range reads as: shown so (display.min and max) where it
//     is a FLOAT's, or an INTEGER's as wide as its MIDI range (`-12 ... 0 ... 12` over 8180 ... 8204);
//     a bipolar row's default its middle value, every other's its first;
//   - left out, and named: a row whose MIDI data range is not a range of 14-bit values (`0 ... -1`,
//     `0 ... 0`, `0 ... 0x00FFFFFF`);
//   - Pull: the SysEx pages' sound and global parameter requests, and their dumps, "All Sound
//     parameter value data in 14b format (MSB, LSB) ordered by NRPN ID [size: parameter count x 2
//     bytes]": the k-th row of the map, in NRPN order, at bytes 2k and 2k + 1 of its dump, sound
//     parameters (below 8192) in one, global ones in the other. The dump must be exactly that long.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const numbers = (range) => (/^-?[\d.]+(?: \.\.\. -?[\d.]+)+$/.test(range ?? '') ? range.split(' ... ').map(Number) : null);

/** A SysEx section's bytes, as a template: `0xhh` the variable it is, the data run left out. */
export function templateOf(fields, hh = '7F') {
  const out = [];
  for (const { bytes } of fields) {
    if (/…/.test(bytes)) continue;
    for (const token of bytes.split(/\s+/)) {
      if (/^0x[0-9A-Fa-f]{2}$/.test(token)) out.push(token.slice(2).toUpperCase());
      else if (token === '0xhh') out.push(hh);
      else if (token === 'F7') out.push('F7');
      else break;
    }
  }
  return out;
}

export function buildGamechangerProfile(data, layout) {
  const notes = [];
  const left = [];
  const recipes = [];
  const parameters = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const idOf = new Map();
  const widened = [];
  for (const r of [...data.nrpn].sort((a, b) => a.nrpn - b.nrpn)) {
    const midi = numbers(r.midi);
    if (!midi || midi[0] >= midi.at(-1) || midi[0] < 0 || midi.at(-1) > 16383) { left.push(`${r.nrpn} ${r.name} (MIDI data range ${r.midi}, value range ${r.value})`); continue; }
    const value = numbers(r.value);
    const [min, max] = [midi[0], midi.at(-1)];
    const bipolar = /^BIPOLAR/.test(r.type);
    const float = /FLOAT$/.test(r.type);
    const wide = value && value.at(-1) - value[0];
    const shown = value && (value[0] !== min || value.at(-1) !== max) && (float || wide === max - min);
    if (value && !shown && (value[0] !== min || value.at(-1) !== max)) widened.push(`${r.nrpn} ${r.name} (${r.value} over ${r.midi})`);
    const group = r.name.split(/\s+/)[0];
    const msb = r.nrpn >> 7;
    const lsb = r.nrpn & 127;
    const recipe = { id: `nrpn${hex(msb)}${hex(lsb)}`, kind: 'nrpn', channel: '$channel', parameterMsb: msb, parameterLsb: lsb, valueResolution: 14, value: '$encodedValue' };
    recipes.push(recipe);
    const id = unique(`${camel(group)}.${camel(r.name)}`);
    idOf.set(r.nrpn, id);
    parameters.push({
      id,
      name: r.name,
      group: r.nrpn >= 8192 ? 'Global' : group,
      description: `NRPN ${r.nrpn} (page ${r.page}): ${r.name}, ${r.type}; parameter value range ${r.value}; MIDI data range ${r.midi}; retains ${r.retains}.`,
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipe.id,
      type: 'integer',
      range: { min, max },
      default: bipolar && midi.length === 3 ? midi[1] : min,
      display: { mode: 'number', unit: '', shortLabel: camel(r.name), ...(shown ? { min: value[0], max: value.at(-1) } : {}) },
      normalization: { mode: 'linear' },
      encoding: { type: 'u14' },
      sendPolicy: max - min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
      ui: { preferredComponent: max - min === 1 ? 'ToggleButton' : max - min > 16 ? 'Knob' : 'Combobox' },
    });
  }

  // Pull: each dump the map's rows in NRPN order, two bytes a row, the rows left out above included
  // (they are parameters of the instrument, only not laid out here).
  const sorted = [...data.nrpn].sort((a, b) => a.nrpn - b.nrpn);
  const dumps = [];
  const requests = [];
  for (const [kind, rows, requestId, dumpId] of [['SOUND', sorted.filter((r) => r.nrpn < 8192), 'requestSound', 'soundParameterDump'], ['GLOBAL', sorted.filter((r) => r.nrpn >= 8192), 'requestGlobal', 'globalParameterDump']]) {
    const request = data.sysex[`${kind} PARAMETER REQUEST`];
    const dump = data.sysex[`${kind} PARAMETER DUMP`];
    if (!request || !dump || !rows.length) continue;
    const prefix = templateOf(dump).filter((b) => b !== 'F7');
    const name = kind === 'SOUND' ? 'Sound parameter' : 'Global parameter';
    requests.push({ id: requestId, name: `${name} request`, kind: 'sysex', template: templateOf(request), response: { dump: dumpId }, timeoutMs: 4000, retries: 1 });
    const mappings = rows.map((r, k) => (idOf.has(r.nrpn) ? { parameter: idOf.get(r.nrpn), offset: k * 2 } : null)).filter(Boolean);
    for (const m of mappings) parameters.find((p) => p.id === m.parameter).access.canRead = true;
    dumps.push({
      id: dumpId,
      name: `${name} dump`,
      kind: 'sysex',
      matcher: { prefix, suffix: ['F7'] },
      payload: { offset: prefix.length, size: rows.length * 2 },
      completion: { expectedMessages: 1, expectedBytes: prefix.length + rows.length * 2 + 1, maxBytes: prefix.length + rows.length * 2 + 1 },
      mappings,
      rows: rows.length,
    });
  }

  // The identity the GENERAL INFO RESPONSE prints: `0x00 0x21 0x6D`, family `0x00 0x01`, member `0x00 0x01`.
  const response = data.sysex['GENERAL INFO RESPONSE'] ?? [];
  const field = (re) => response.find((f) => re.test(f.field))?.bytes.split(/\s+/).filter((b) => /^0x[0-9A-Fa-f]{2}$/.test(b)).map((b) => b.slice(2).toUpperCase());
  const identity = { manufacturerId: field(/^Manufacturers System Exclusive id code/), familyCode: field(/^Device family code/), modelNumber: field(/^Device family member code/) };

  // Vectors: a unipolar float, a bipolar integer read as -12 - 12, a global; the requests; a dump
  // made by hand, values at each mapping's own offset.
  const status = 0xb0;
  const send = (p, value) => {
    const r = recipes.find((x) => x.id === p.messageRecipe);
    return { name: `${p.name} = ${value} (NRPN ${r.parameterMsb * 128 + r.parameterLsb})`, parameter: p.id, value, expectedHex: [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, value >> 7], [0x26, value & 127]].map(([c, v]) => [status, c, v].map(hex).join(' ')).join('\n') };
  };
  const picks = [parameters[0], parameters.find((p) => p.display.min === -12 && p.range.min === 8180), parameters.find((p) => p.range.max === 12000), parameters.find((p) => p.group === 'Global' && p.range.max > 1)].filter(Boolean);
  const tests = picks.map((p) => send(p, p.range.max));
  for (const r of requests) tests.push({ name: r.name, kind: 'request', request: r.id, expectedHex: r.template.join(' ') });
  for (const d of dumps) {
    // Every mapping holds its parameter's default, a few another value in range; the rows left out
    // hold 0 and are read by nothing.
    const body = new Array(d.payload.size).fill(0);
    const expectedValues = {};
    d.mappings.forEach((m, k) => {
      const p = parameters.find((x) => x.id === m.parameter);
      const v = k % 37 === 0 || k === d.mappings.length - 1 ? Math.min(p.range.max, p.range.min + 1 + (k % (p.range.max - p.range.min || 1))) : p.default;
      body[m.offset] = v >> 7;
      body[m.offset + 1] = v & 127;
      expectedValues[p.id] = v;
    });
    tests.push({ name: `${d.name}, read back by NRPN order`, kind: 'dumpParse', inputHex: [...d.matcher.prefix, ...body.map(hex), 'F7'].join(' '), expectedValues });
  }

  const sources = data.sources;
  const nrpnSource = sources.find((s) => s.nrpnPages);
  const sysexSource = sources.find((s) => s.sysexPages);
  const pages = (p) => (p[0] === p[1] ? `page ${p[0]}` : `pages ${p[0]} - ${p[1]}`);
  notes.unshift(
    'Generated by tools/profiles/gamechanger/make-profiles.mjs; edit the layout in tools/profiles/gamechanger/synths/, not this file.',
    'Every parameter is a row of the NRPN map, sent as that NRPN on the base channel (the channel variable) with a 14-bit value: CC 99, CC 98, then CC 6 and CC 38, as the CC map gives data entry for NRPN. Its range is the row\'s MIDI DATA RANGE; where its PARAMETER VALUE RANGE differs, the value is shown in it (a FLOAT\'s, or an INTEGER\'s offset by the same width). The MIDI input filter must let NRPN through. Nothing here has been sent to a real instrument yet.',
    `Pull asks for the sound parameters (F0 7E 7F 07 02 00 21 6D F7, the "general channel" byte 7F, which the document says any channel answers) and for the global ones (…07 01…), and reads each dump, whose values are "in 14b format (MSB, LSB) ordered by NRPN ID [size: parameter count x 2 bytes]": the map's k-th row in NRPN order at bytes 2k and 2k + 1. That reading is the document's words taken as printed; a dump of any other length than the map's rows make is refused, so a firmware with other parameters is not misread.${dumps.map((d) => ` The ${d.name.toLowerCase()} is ${d.rows} rows (${d.payload.size} bytes).`).join('')}`,
  );
  if (left.length) notes.push(`Left out, rows whose MIDI data range is not a range of 14-bit values (each still counted in its dump's order): ${left.join('; ')}.`);
  if (widened.length) notes.push(`Laid out with their MIDI data range, which the parameter value range does not match in width (so neither is shown as the other): ${widened.join('; ')}.`);
  notes.push('The device family and member codes the general info response prints are the same for the MKI and the MKII, so the identity does not tell them apart. (The MKII\'s basic MIDI implementation says Device Inquiry "No"; its SysEx document prints the request and the reply.)');
  notes.push('The CC map gives many of these parameters a 14-bit controller pair as well (CC n, its LSB on n + 32); this profile sends the NRPNs, which cover every one.');

  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Gamechanger Audio',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: sources.map((s) => ({ type: 'manual', title: s.title, notes: `${s.nrpnPages ? `The NRPN map (PDF ${pages(s.nrpnPages)})` : ''}${s.nrpnPages && s.sysexPages ? ' and ' : ''}${s.sysexPages ? `the MIDI SysEx pages (PDF ${pages(s.sysexPages)})` : ''}, read by tools/profiles/gamechanger/read-motor-maps.mjs from ${s.file} (sha256 ${s.sha256}), ${s.url}, linked from ${s.linkedFrom}. Not yet checked against the instrument itself.` })),
    testedWith: [],
    authoringNotes: notes,
    variables: { channel: 1 },
    ...(identity.manufacturerId ? { identity: { ...identity, timeoutMs: 1000, retries: 0 } } : {}),
    coverage: {
      singleParameterWrite: `complete-for-the-NRPN-map: ${parameters.length} of its ${data.nrpn.length} rows`,
      realtimeEditing: 'complete-for-the-NRPN-map',
      editBufferDumpRequest: dumps.length ? 'complete: sound parameter request' : 'notImplemented',
      editBufferDumpParse: dumps.length ? `complete-for-the-NRPN-map: ${dumps.reduce((n, d) => n + d.mappings.length, 0)} parameters read from the sound and global parameter dumps, by NRPN order` : 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends these NRPNs when its MIDI output filter lets NRPN through',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: recipes,
    requests,
    dumpDefinitions: dumps.map(({ rows: _rows, ...d }) => d),
    parameters,
    tests,
  };
}

export { stringifyProfile };
