// build-profile.mjs — a device profile from a parsed Roland address map and a synth's layout.
//
// tools/scripts/qa/roland-gaia/make-gaia-profile.mjs built one synth by hand and found most of
// the ways this goes wrong; this is the same construction made generic, so that the next synth is
// a layout file and not another eight hundred lines. Where a decision here repeats one made there,
// the reason is there and is not repeated at length.
//
// Inputs:
//   map     — maps/<synth>.json: parse-address-map.mjs's transcription of the manual, plus where
//             it came from.
//   synth   — synths/<synth>.mjs: what the manual does not say in its tables — which blocks of the
//             address space make up the edit buffer, what to call them, the identity reply, the
//             bank table, and the manual's own example messages to check ourselves against.
//
// Output: the `.ceditor-device.json` the engine loads from CE/profiles/test/.

import { flat } from './parse-address-map.mjs';
import { interpretRow } from './interpret.mjs';

/* ------------------------------------------------------------------ addressing */

const parseBytes = (hex) => hex.trim().split(/\s+/).map((b) => parseInt(b, 16));
export const formatBytes = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

/**
 * Roland addresses are 7-bit digits: each byte carries 0..7F and overflow carries left. Operands
 * are right-aligned, so a 2-byte parameter offset adds to the last two bytes of a 4-byte base.
 */
export function addAddress(...parts) {
  const length = Math.max(...parts.map((p) => parseBytes(p).length));
  const sum = new Array(length).fill(0);
  for (const part of parts) {
    const bytes = parseBytes(part);
    bytes.forEach((value, i) => { sum[length - bytes.length + i] += value; });
  }
  for (let i = sum.length - 1; i > 0; i--) {
    if (sum[i] > 0x7f) { sum[i - 1] += Math.floor(sum[i] / 0x80); sum[i] %= 0x80; }
  }
  if (sum[0] > 0x7f) throw new Error(`address overflow adding ${parts.join(' + ')}`);
  return formatBytes(sum);
}

/** Roland's checksum: the value that brings address + data to a multiple of 128. */
export const rolandChecksum = (bytes) => (128 - (bytes.reduce((total, byte) => total + byte, 0) % 128)) % 128;

/**
 * A path of names through the map's offset tables -> the absolute base address.
 *
 * The first name is looked up in the top table (the one headed by the ModelID line); each later
 * name in whichever offset table holds it, and it must be held by exactly one — an ambiguous name
 * is an error rather than a guess. `Table::Entry` picks the table when a name is not unique.
 */
export function resolvePath(map, path) {
  const offsetTables = map.tables.filter((t) => t.kind === 'offsets');
  const top = offsetTables[0];
  const find = (name, onlyTop) => {
    const [tableName, entryName] = name.includes('::') ? name.split('::') : [null, name];
    const candidates = (onlyTop ? [top] : offsetTables)
      .filter((t) => !tableName || t.name === tableName)
      .flatMap((t) => t.entries.filter((e) => !e.gap && e.name === entryName).map((e) => ({ t, e })));
    if (candidates.length !== 1) {
      throw new Error(`address path "${name}" matches ${candidates.length} offset-table entries; it must match one`);
    }
    return candidates[0].e.address;
  };
  return addAddress(...path.map((name, i) => find(name, i === 0)));
}

/* ------------------------------------------------------------------ naming */

// `#` is a sharp, not punctuation: dropping it made "Scale Tune for C#" the same id as "for C",
// and the address suffix the collision then got differed from part to part.
export const camel = (s) => s
  .replace(/#/g, ' Sharp ')
  .replace(/[^A-Za-z0-9 ]/g, ' ')
  .trim()
  .split(/\s+/)
  .map((word, i) => (i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()))
  .join('');

const choiceSlug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'v';

function preferredComponent(name, labels) {
  if (labels) {
    if (labels.length === 2 && labels[0] === 'OFF') return 'ToggleButton';
    return labels.length <= 5 ? 'RadioButtonGroup' : 'Combobox';
  }
  return /Env |Level$|Time$/.test(name) ? 'Slider' : 'Knob';
}

/* ------------------------------------------------------------------ parameters */

/**
 * A run of ASCII rows is one string, not N numbers: collapsed to a single `text` parameter at the
 * first address, the way the GAIA's 12 Patch Name bytes are. Manuals spell the run three ways —
 * `Patch Name 1 … 12` (GAIA, JD-Xi), `NAME 1 … 16` (AX-Edge), and `Name` printed sixteen times with
 * no number at all (GAIA-2, FANTOM, JUNO-X) — and a `Scene Memo 1 … 64` is the same thing. A run
 * must be 32 - 127 throughout, at consecutive addresses, and named for text (name, memo, comment,
 * title), so a sixteen-step sequence that happens to share a name is never mistaken for one.
 */
function nameRuns(rows) {
  const runs = new Map();
  const TEXTY = /\b(name|memo|comment|title)\b/i;
  const stemOf = (name) => {
    const numbered = /^(.*?)\s*(\d+)$/.exec(name ?? '');
    return numbered ? { stem: numbered[1], n: Number(numbered[2]) } : { stem: name ?? '', n: null };
  };
  for (let i = 0; i < rows.length; i++) {
    const first = rows[i];
    if (first.min !== 32 || first.max !== 127 || !TEXTY.test(first.name ?? '')) continue;
    const { stem, n } = stemOf(first.name);
    if (n !== null && n !== 1) continue;
    let length = 1;
    for (;;) {
      const next = rows[i + length];
      if (!next || next.min !== 32 || next.max !== 127) break;
      if (flat(next.offset) !== flat(first.offset) + length) break;
      const s2 = stemOf(next.name);
      const same = n === null ? next.name === first.name : s2.stem.toLowerCase() === stem.toLowerCase() && s2.n === length + 1;
      if (!same) break;
      length++;
    }
    if (length > 1) {
      runs.set(i, { label: stem, length });
      i += length - 1;
    }
  }
  return runs;
}

function buildParameter(row, block, address, stripName) {
  // A row the manual prints with a range and no name (the JD-XA's Analog Common 00 11, six in the
  // FA-06/07/08) is still an address with a range; it is named for where it is, not left blank.
  const unnamed = !String(row.name ?? '').trim();
  const printedName = unnamed ? `Unnamed (offset ${row.offset})` : row.name;
  const leafName = unnamed ? `offset ${row.offset.replace(/ /g, '')}` : stripName(row.name);
  const meaning = interpretRow(row);
  // A wire range below zero on an unsigned encoding is a display range printed in the wrong
  // column (the GAIA-2's and JUPITER-X's AMP MOD, -100 - 100 on two nibbles). No byte on the wire
  // can carry it, so the parameter is read-only rather than a control that sends nonsense.
  const impossible = row.min < 0;
  const base = {
    id: `${block.id}.${camel(leafName) || 'value'}`,
    name: printedName,
    group: block.group,
    address,
    ...(impossible ? { description: `The manual prints ${row.min} - ${row.max} as this value's wire range, which this encoding cannot carry; read-only until an instrument shows the real wire values.` } : {}),
    access: { canRead: true, canWrite: !impossible, realtimeSafe: !block.system, source: 'singleParameter' },
    messageRecipe: 'dt1',
    ui: { preferredComponent: preferredComponent(row.name, meaning.labels) },
  };

  if (meaning.kind === 'choice') {
    const used = new Set();
    const choices = meaning.labels.map((label, index) => {
      const value = meaning.values[index];
      const slug = choiceSlug(label);
      const id = used.has(slug) ? `${slug}_${value}` : slug;
      used.add(id);
      return { id, label, value };
    });
    // The manual's own default where it prints one (the SD-90's `default: (1) ON`), else the first.
    const printed = choices.find((choice) => choice.value === row.printedDefault);
    return {
      ...base,
      type: 'choice',
      default: (printed ?? choices[0]).id,
      choices,
      display: { mode: 'choice', shortLabel: camel(leafName) },
      normalization: { mode: 'choiceIndex' },
      encoding: row.nibbles ? { type: 'nibbled', nibbles: row.nibbles } : { type: 'enum' },
      sendPolicy: { mode: 'onCommit', coalesce: true },
    };
  }

  const shown = meaning.displayMin !== undefined;
  const bipolar = shown && meaning.displayMin < 0;
  const continuous = row.max - row.min > 8 && !block.system;
  return {
    ...base,
    type: bipolar ? 'bipolar' : 'integer',
    ...(meaning.description && !impossible ? { description: meaning.description } : {}),
    range: { min: row.min, max: row.max },
    default: Number.isInteger(row.printedDefault) && row.printedDefault >= row.min && row.printedDefault <= row.max
      ? row.printedDefault
      : bipolar ? Math.round((row.min + row.max) / 2) : row.min,
    display: {
      mode: 'number',
      unit: meaning.unit ?? '',
      shortLabel: camel(leafName),
      ...(shown ? { min: meaning.displayMin, max: meaning.displayMax } : {}),
      ...(meaning.precision ? { precision: meaning.precision } : {}),
    },
    normalization: { mode: 'linear' },
    encoding: row.nibbles ? { type: 'nibbled', nibbles: row.nibbles } : { type: 'u7' },
    sendPolicy: continuous
      ? { mode: 'continuous', coalesce: true, minIntervalMs: 20, sendFinalOnRelease: true }
      : { mode: 'onCommit', coalesce: true },
  };
}

function textParameter(run, block, address, stripName) {
  return {
    id: `${block.id}.${camel(stripName(run.label)) || 'name'}`,
    name: run.label,
    group: block.group,
    type: 'text',
    address,
    length: run.length,
    default: 'INIT'.padEnd(run.length, ' '),
    display: { mode: 'text', shortLabel: /memo|comment/i.test(run.label) ? 'Memo' : 'Name' },
    encoding: { type: 'text-ascii', length: run.length, pad: 32 },
    access: { canRead: true, canWrite: true, realtimeSafe: false, source: 'singleParameter' },
    sendPolicy: { mode: 'onCommit', coalesce: false },
    messageRecipe: 'dt1',
    ui: { preferredComponent: 'TextInput' },
  };
}

/* ------------------------------------------------------------------ the profile */

const requestIdFor = (blockId) => `request${blockId.split(/[.\-_]/).map((w) => w[0].toUpperCase() + w.slice(1)).join('')}`;

export function buildProfile(map, synth) {
  const tableByName = new Map(map.tables.filter((t) => t.kind === 'parameters').map((t) => [t.name, t]));
  const model = map.modelId.split(' ');
  const header = (command) => ['F0', '41', '$deviceId', ...model, command];
  const notes = [];

  const blocks = synth.blocks.map((block) => {
    const table = tableByName.get(block.table);
    if (!table) throw new Error(`${synth.id}: block ${block.id} names table "${block.table}", which the map does not have`);
    // `noPull` (a list of patterns over block ids) marks blocks the startup read leaves alone; a
    // block's own `pull: false` says the same for one block.
    const pull = block.pull ?? !(synth.noPull ?? []).some((pattern) => pattern.test(block.id));
    return { ...block, pull, table, base: resolvePath(map, block.path), size: table.totalSize };
  });

  const parameters = [];
  const blockOf = new Map();
  const seen = new Set();
  const blockIds = new Set();
  for (const block of blocks) {
    if (blockIds.has(block.id)) throw new Error(`${synth.id}: two blocks are called ${block.id}`);
    blockIds.add(block.id);
    // A row with no range at all is not a control anyone could set safely: left out, and said so.
    for (const r of block.table.rows) {
      if (!r.gap && !r.reserved && r.min === undefined) notes.push(`${block.id}: "${r.name}" at ${r.offset} has no range in the manual and is not laid out`);
    }
    // Two rows printed at one offset (the RD-700GX's Favorite SETUP7 and SETUP8 both at 00 1B) is a
    // misprint; which is right is not knowable from the page, so the first is kept, the second left
    // out, and the note says so — never two controls writing the same byte.
    const taken = new Set();
    const rows = block.table.rows.filter((r) => !r.gap && !r.reserved && r.min !== undefined).filter((r) => {
      const at = flat(r.offset);
      if (taken.has(at)) { notes.push(`${block.id}: the manual prints "${r.name}" at ${r.offset}, which another row already holds; left out`); return false; }
      taken.add(at);
      return true;
    });
    const runs = nameRuns(rows);
    // An id leaves out what the name says about MIDI: `Part Level (CC# 7)` is part.<x>.level,
    // `Hold (CC#126/127)` is …hold, and the numbers stay in the name, where a person reads them.
    const strip = (name) => {
      const bare = name.replace(/\s*\((?:CC|RPN|NRPN)#\s*[\d/, ]+\)|\s*\(PC\)/g, '');
      return (block.strip ? bare.replace(block.strip, '') : bare).trim() || bare;
    };
    // A name the manual prints more than once in one block without a number — the two LFOs'
    // sixteen `LFO1 Step` rows, a mix table's four `Partial Level` — is numbered in the order
    // printed: `LFO1 Step 1 … 16`, rather than told apart by an address suffix nobody can template.
    const consumed = new Set();
    for (const [i, run] of runs) for (let k = 0; k < run.length; k++) consumed.add(i + k);
    const counts = new Map();
    rows.forEach((r, i) => { if (!consumed.has(i) && r.name) counts.set(r.name, (counts.get(r.name) ?? 0) + 1); });
    const ordinal = new Map();
    for (let i = 0; i < rows.length; i++) {
      const address = addAddress(block.base, rows[i].offset);
      let parameter;
      if (runs.has(i)) {
        parameter = textParameter(runs.get(i), block, address, strip);
        i += runs.get(i).length - 1;
      } else {
        let row = rows[i];
        if (row.name && counts.get(row.name) > 1) {
          const n = (ordinal.get(row.name) ?? 0) + 1;
          ordinal.set(row.name, n);
          row = { ...row, name: `${row.name} ${n}` };
        }
        parameter = buildParameter(row, block, address, strip);
      }
      // Two rows whose names still camel-case alike keep both, told apart by address, rather than
      // one silently replacing the other.
      if (seen.has(parameter.id)) {
        const renamed = `${parameter.id}_${address.split(' ').slice(-2).join('')}`;
        notes.push(`${parameter.id} occurs twice in ${block.table.name}; the second is ${renamed}`);
        parameter.id = renamed;
      }
      seen.add(parameter.id);
      parameters.push(parameter);
      blockOf.set(parameter.id, block.id);
    }
  }

  /* ---- dumps and requests: one per block, or per piece of a block bigger than one packet.
   *
   * "Data larger than 256 bytes will be divided into packets of 256 bytes or less" (128 in the
   * MC-09's and VR-09's manuals). A reply in several DT1s, each with its own address, cannot be
   * matched as one dump, so a bigger block is requested in pieces that each come back whole. The
   * cuts fall between parameters, never through a multi-byte value or a name.
   *
   *   F0 41 dev <model id…> 12 <address…> <data…> sum F7
   *
   * so the payload starts after the header and the address, the checksum covers the address and
   * the data and never the header, and the whole message is payload + size + 2. */
  const packet = map.source?.packetSize ?? 128;
  const widthOf = (p) => p.length ?? p.encoding?.nibbles ?? 1;
  const pieces = blocks.flatMap((block) => {
    const size = flat(block.size);
    const members = parameters.filter((p) => blockOf.get(p.id) === block.id)
      .map((p) => ({ p, offset: flat(p.address) - flat(block.base) }))
      .sort((a, b) => a.offset - b.offset);
    for (const m of members) {
      if (m.offset < 0 || m.offset >= size) throw new Error(`${m.p.id} lies outside block ${block.id} (size ${block.size})`);
    }
    if (size <= packet) return [{ block, id: block.id, start: 0, size, members }];
    const cuts = [0];
    for (const m of members) {
      if (m.offset + widthOf(m.p) - cuts.at(-1) > packet) cuts.push(m.offset);
    }
    // A piece ends after its last parameter, not at the next cut: reserved bytes between two
    // parameters (the JUPITER-80's Registration Controller has 53 of them before V-Link Switch)
    // would otherwise carry a piece past one packet.
    return cuts.map((start, k) => {
      const next = k + 1 < cuts.length ? cuts[k + 1] : size;
      const inside = members.filter((m) => m.offset >= start && m.offset < next);
      const end = inside.length ? Math.max(...inside.map((m) => m.offset + widthOf(m.p))) : start;
      return { block, id: `${block.id}.part${k + 1}`, start, size: end - start, members: inside };
    }).filter((piece) => piece.members.length);
  });
  const sizeBytes = (n, length) => formatBytes(Array.from({ length }, (unused, i) => Math.floor(n / 128 ** (length - 1 - i)) % 128));

  const dumpDefinitions = pieces.map((piece) => {
    const base = addAddress(piece.block.base, sizeBytes(piece.start, 4));
    const addressLength = parseBytes(base).length;
    const payloadOffset = 3 + model.length + 1 + addressLength;
    return {
      id: piece.id,
      name: piece.id === piece.block.id ? piece.block.group : `${piece.block.group} (${piece.id.split('.').at(-1)})`,
      kind: 'sysex',
      matcher: { prefix: [...header('12'), ...base.split(' ')], suffix: ['F7'] },
      payload: { offset: payloadOffset, size: piece.size },
      checksum: {
        type: 'roland-7bit',
        fromOffset: payloadOffset - addressLength,
        toOffset: payloadOffset + piece.size - 1,
        byteOffset: payloadOffset + piece.size,
      },
      completion: { expectedMessages: 1, expectedBytes: payloadOffset + piece.size + 2 },
      requestRecipe: requestIdFor(piece.id),
      mappings: piece.members.map((m) => ({ parameter: m.p.id, offset: m.offset - piece.start })),
    };
  });

  /* ---- requests: an identity request, then one RQ1 per dump with its constant checksum baked in. */
  const rq1Template = (address, size) => {
    const body = [...parseBytes(address), ...parseBytes(size)];
    return [...header('11'), ...formatBytes(body).split(' '), formatBytes([rolandChecksum(body)]), 'F7'];
  };
  const requests = [
    {
      id: 'identityRequest',
      name: 'Identity Request',
      kind: 'sysex',
      template: ['F0', '7E', '7F', '06', '01', 'F7'],
      response: { kind: 'identity' },
      timeoutMs: 1000,
      retries: 0,
    },
    ...pieces.map((piece) => {
      const address = addAddress(piece.block.base, sizeBytes(piece.start, 4));
      const size = sizeBytes(piece.size, 4);
      return {
        id: requestIdFor(piece.id),
        name: `Request ${piece.id === piece.block.id ? piece.block.group : `${piece.block.group} (${piece.id.split('.').at(-1)})`}`,
        kind: 'sysex',
        template: rq1Template(address, size),
        address,
        size,
        response: { kind: 'bulkDump', dump: piece.id },
        timeoutMs: 1000,
        retries: 1,
      };
    }),
  ];

  // What the startup read pulls. A block marked `pull: false` is one the instrument may not answer —
  // a tone type the part is not playing gets no reply (FA-06/07/08 p6), and the engine's startup
  // chain stops at the first request that times out — so it is read when asked for, not on connect.
  const pulled = pieces.filter((piece) => piece.block.pull !== false && (!piece.block.system || synth.pullSystem));
  const notPulled = [...new Set(pieces.filter((piece) => piece.block.pull === false).map((piece) => piece.block.id))];

  /* ---- tests: the manual's own messages first; they are the ones that do not trust our code. */
  const byId = new Map(parameters.map((p) => [p.id, p]));
  const dt1Hex = (address, value) => {
    const body = [...parseBytes(address), value];
    return formatBytes([0xf0, 0x41, synth.deviceId, ...parseBytes(map.modelId), 0x12, ...body, rolandChecksum(body), 0xf7]);
  };
  const tests = [{ name: 'Universal Identity Request', kind: 'identityRequest', expectedHex: 'F0 7E 7F 06 01 F7' }];
  for (const example of synth.examples ?? []) {
    const parameter = byId.get(example.parameter);
    if (!parameter) throw new Error(`${synth.id}: the manual's example names ${example.parameter}, which the profile does not have`);
    const ours = dt1Hex(parameter.address, example.value);
    if (ours !== example.expectedHex) {
      throw new Error(`${synth.id}: the manual prints ${example.expectedHex} for "${example.name}"; we would send ${ours}`);
    }
    tests.push({ name: `${example.name} (manual, ${example.where})`, parameter: example.parameter, value: example.value, expectedHex: example.expectedHex });
  }

  // A layout may state the manual's date and version where its cover reads badly (the VR-700's
  // and JUNO-Di's put the labels where the values should be): `manual: { date, version }`.
  const source = { ...(map.source ?? {}), ...(synth.manual ?? {}) };
  return {
    schemaVersion: 1,
    profileVersion: synth.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: synth.id,
    name: synth.name,
    manufacturer: 'Roland',
    family: synth.family,
    status: 'experimental',
    trust: 'local',
    description: synth.description,
    sources: [{
      type: 'manual',
      title: `${source.model ?? synth.name} MIDI Implementation${source.version ? ` (version ${source.version}` : ''}${source.date ? `, ${source.date})` : source.version ? ')' : ''}`,
      notes: `Parameter Address Map read by tools/profiles/roland/parse-address-map.mjs from ${source.file ?? 'the manual'}`
        + `${source.sha256 ? ` (sha256 ${source.sha256})` : ''}. Model ID ${map.modelId}, DT1 = 12, RQ1 = 11, Roland checksum. `
        + 'Not yet checked against the instrument itself.',
    }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/roland/make-profiles.mjs; edit the layout in tools/profiles/roland/synths/, not this file.',
      'Every parameter is the manual\'s, at the manual\'s address, with the manual\'s name. Nothing here has been sent to a real instrument yet.',
      ...(synth.notes ?? []),
      ...(synth.examplesUnavailable ? [`No example message is checked: ${synth.examplesUnavailable}`] : []),
      ...(notPulled.length ? [`Not read at startup (read on request, since the instrument may not answer them): ${notPulled.join(', ')}.`] : []),
      ...notes,
    ],
    variables: { deviceId: synth.deviceId, channel: 1 },
    identity: {
      // No requestDeviceId: the inquiry goes to 7F, which every instrument answers. No revision:
      // a firmware update is not a different instrument (profilesLoad.test.js has the GAIA story).
      manufacturerId: ['41'],
      familyCode: synth.identity.familyCode,
      modelNumber: synth.identity.modelNumber,
      timeoutMs: 1000,
      retries: 0,
    },
    coverage: {
      singleParameterWrite: 'complete-for-every-block-in-the-layout',
      editBufferDumpRequest: 'block-rq1-per-block',
      editBufferDumpParse: 'complete-for-every-block-in-the-layout',
      bankDump: 'notImplemented',
      realtimeEditing: 'complete-for-transcribed-blocks',
      verifiedOnHardware: false,
      inboundControllers: synth.inboundControllers ?? 'not modelled: what the front panel transmits is not in the address map',
      ...(synth.coverage ?? {}),
    },
    timing: { minDelayBetweenMessagesMs: 20 },
    messageRecipes: [
      {
        id: 'dt1',
        kind: 'sysex',
        template: [...header('12'), '$address', '$encodedValue', '$checksum', 'F7'],
        checksum: { type: 'roland-7bit', from: '$address', to: '$encodedValue' },
        delayAfterMs: 20,
      },
      {
        id: 'rq1',
        kind: 'sysex',
        template: [...header('11'), '$address', '$size', '$checksum', 'F7'],
        checksum: { type: 'roland-7bit', from: '$address', to: '$size' },
        delayAfterMs: 20,
      },
    ],
    requests,
    startup: {
      policy: 'pull',
      syncDirection: 'pull',
      sync: [{ request: 'identityRequest' }, ...pulled.map((piece) => ({ request: requestIdFor(piece.id) }))],
    },
    parameters,
    tests,
    dumpDefinitions,
    ...(synth.presets ? { presets: synth.presets } : {}),
  };
}

/**
 * The profile as text: readable at the top, one parameter or mapping per line below.
 *
 * Indenting every field of every parameter is what made the 882-parameter GAIA a megabyte; a
 * drum kit of thirty-seven keys has five thousand. One object per line halves the file and keeps
 * a diff readable — a changed parameter is a changed line.
 */
export function stringifyProfile(profile) {
  const lines = ['{'];
  const keys = Object.keys(profile);
  keys.forEach((key, index) => {
    const value = profile[key];
    const comma = index < keys.length - 1 ? ',' : '';
    if (key === 'parameters' || key === 'tests' || key === 'requests') {
      lines.push(`  ${JSON.stringify(key)}: [`);
      value.forEach((item, i) => lines.push(`    ${JSON.stringify(item)}${i < value.length - 1 ? ',' : ''}`));
      lines.push(`  ]${comma}`);
    } else if (key === 'dumpDefinitions') {
      lines.push(`  ${JSON.stringify(key)}: [`);
      value.forEach((dump, i) => {
        const { mappings, ...rest } = dump;
        const head = JSON.stringify(rest).slice(0, -1);
        lines.push(`    ${head},"mappings":[`);
        mappings.forEach((m, j) => lines.push(`      ${JSON.stringify(m)}${j < mappings.length - 1 ? ',' : ''}`));
        lines.push(`    ]}${i < value.length - 1 ? ',' : ''}`);
      });
      lines.push(`  ]${comma}`);
    } else {
      const text = JSON.stringify(value, null, 2).split('\n').map((line, i) => (i === 0 ? line : `  ${line}`)).join('\n');
      lines.push(`  ${JSON.stringify(key)}: ${text}${comma}`);
    }
  });
  lines.push('}');
  return `${lines.join('\n')}\n`;
}
