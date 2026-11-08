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

export const camel = (s) => s
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
 * Consecutive `… Name 1` … `… Name N` ASCII rows are one name, not N numbers: collapsed to a single
 * `text` parameter at the first address, the way the GAIA's 12 Patch Name bytes are.
 */
function nameRuns(rows) {
  const runs = new Map();
  for (let i = 0; i < rows.length; i++) {
    const match = /^(.*\bName) 1$/.exec(rows[i].name ?? '');
    if (!match || rows[i].min !== 32) continue;
    let length = 1;
    while (rows[i + length] && rows[i + length].name === `${match[1]} ${length + 1}`) length++;
    if (length > 1) runs.set(i, { label: match[1], length });
  }
  return runs;
}

function buildParameter(row, block, address, stripName) {
  const leafName = stripName(row.name);
  const meaning = interpretRow(row);
  const base = {
    id: `${block.id}.${camel(leafName) || 'value'}`,
    name: row.name,
    group: block.group,
    address,
    access: { canRead: true, canWrite: true, realtimeSafe: !block.system, source: 'singleParameter' },
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
    return {
      ...base,
      type: 'choice',
      default: choices[0].id,
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
    ...(meaning.description ? { description: meaning.description } : {}),
    range: { min: row.min, max: row.max },
    default: bipolar ? Math.round((row.min + row.max) / 2) : row.min,
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

function textParameter(run, block, address) {
  return {
    id: `${block.id}.${camel(run.label.replace(/^.*\b(Name)$/, '$1'))}`,
    name: run.label,
    group: block.group,
    type: 'text',
    address,
    length: run.length,
    default: 'INIT'.padEnd(run.length, ' '),
    display: { mode: 'text', shortLabel: 'Name' },
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
    return { ...block, table, base: resolvePath(map, block.path), size: table.totalSize };
  });

  const parameters = [];
  const blockOf = new Map();
  const seen = new Set();
  const blockIds = new Set();
  for (const block of blocks) {
    if (blockIds.has(block.id)) throw new Error(`${synth.id}: two blocks are called ${block.id}`);
    blockIds.add(block.id);
    const rows = block.table.rows.filter((r) => !r.gap && !r.reserved);
    const runs = nameRuns(rows);
    // An id leaves out what the name says about MIDI: `Part Level (CC# 7)` is part.<x>.level, and
    // the CC number stays in the name, where a person reads it.
    const strip = (name) => {
      const bare = name.replace(/\s*\((?:CC|RPN|NRPN)#\s*\d+\)|\s*\(PC\)/g, '');
      return (block.strip ? bare.replace(block.strip, '') : bare).trim() || bare;
    };
    for (let i = 0; i < rows.length; i++) {
      const address = addAddress(block.base, rows[i].offset);
      let parameter;
      if (runs.has(i)) {
        parameter = textParameter(runs.get(i), block, address);
        i += runs.get(i).length - 1;
      } else {
        parameter = buildParameter(rows[i], block, address, strip);
      }
      // Two rows whose names camel-case alike (rare: a manual that prints the same label twice in
      // one block) keep both, distinguished by address, rather than one silently replacing the other.
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

  /* ---- dumps: one per block, every parameter at its address's distance from the block base.
   *
   *   F0 41 dev <model id…> 12 <address…> <data…> sum F7
   *
   * so the payload starts after the header and the address, the checksum covers the address and
   * the data and never the header, and the whole message is payload + size + 2. */
  const dumpDefinitions = blocks.map((block) => {
    const payloadOffset = 3 + model.length + 1 + parseBytes(block.base).length;
    const size = flat(block.size);
    const mappings = parameters
      .filter((p) => blockOf.get(p.id) === block.id)
      .map((p) => ({ parameter: p.id, offset: flat(p.address) - flat(block.base) }));
    for (const m of mappings) {
      if (m.offset < 0 || m.offset >= size) throw new Error(`${m.parameter} lies outside block ${block.id} (size ${block.size})`);
    }
    return {
      id: block.id,
      name: block.group,
      kind: 'sysex',
      matcher: { prefix: [...header('12'), ...block.base.split(' ')], suffix: ['F7'] },
      payload: { offset: payloadOffset, size },
      checksum: {
        type: 'roland-7bit',
        fromOffset: payloadOffset - parseBytes(block.base).length,
        toOffset: payloadOffset + size - 1,
        byteOffset: payloadOffset + size,
      },
      completion: { expectedMessages: 1, expectedBytes: payloadOffset + size + 2 },
      requestRecipe: requestIdFor(block.id),
      mappings,
    };
  });

  /* ---- requests: an identity request, then one RQ1 per block with its constant checksum baked in. */
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
    ...blocks.map((block) => ({
      id: requestIdFor(block.id),
      name: `Request ${block.group}`,
      kind: 'sysex',
      template: rq1Template(block.base, block.size),
      address: block.base,
      size: block.size,
      response: { kind: 'bulkDump', dump: block.id },
      timeoutMs: 1000,
      retries: 1,
    })),
  ];

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

  const source = map.source ?? {};
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
      sync: [{ request: 'identityRequest' }, ...blocks.filter((b) => !b.system || synth.pullSystem).map((b) => ({ request: requestIdFor(b.id) }))],
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
