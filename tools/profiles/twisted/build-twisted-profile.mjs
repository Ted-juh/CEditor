// build-twisted-profile.mjs — a Twisted Electrons page's transcription (tables/<name>.json) and its
// layout (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the page:
//   - a controller table's row is its controller, on the channel the page's routing gives the table's
//     target (BlastBeats: the drums on CH10, each synth on its own) or the channel variable; a range
//     of controllers (`Voice volume 1-8 | 10-17`) a row for each;
//   - its values: bands (`0-63 Off, 64-127 On`, `0 off, 1-127 on`) and names (`Poly 8=0, Unison=1 …`,
//     `0 normal, 1 2x, 2 4x`) a choice, a band's first value sent; a range that fits a controller
//     (`0-31`) that range; `Continuous`, `0-127` or a description (`16 arp choices`) 0 - 127; a
//     range past 127 (`Master vol 0-255`, `BPM 1-500`) left out, a controller carrying 0 - 127;
//   - TWISTfm's editor parameters: SET editor parameter (`03 id valueLSB valueMSB` after the
//     header, "value = LSB + (MSB * 128)"), each over its printed range, `0=OFF, 1=FREE, 2=SYNC` a
//     choice; Pull is GET_ALL (`01`), answered by an INFO message and a VALUE message (`12 id
//     valueLSB valueMSB`) for each editor ID, each parameter read from the VALUE whose id is its own.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const col = (table, re) => table.columns.findIndex((c) => re.test(c));

/** A controller row's values -> { min, max } | { choices } | { tooWide } | { printed: true, min, max }. */
export function controllerValues(text) {
  const t = String(text ?? '').trim();
  if (!t || /^Continuous$/i.test(t) || /^0-127$/.test(t)) return { min: 0, max: 127 };
  let m = /^0-63 (\w+), 64-127 (\w+)$/i.exec(t);
  if (m) return { choices: [{ value: 0, label: m[1] }, { value: 64, label: m[2] }] };
  m = /^0 (\w+), 1-127 (\w+)$/i.exec(t);
  if (m) return { choices: [{ value: 0, label: m[1] }, { value: 1, label: m[2] }] };
  // Bands (`0-63=off 64-127=on`, `0-25=LP 26-50=BP … 101-127=OFF`), a band's first value sent.
  if (/^\d+-\d+=\S/.test(t)) {
    const bands = [...t.matchAll(/(\d+)-(\d+)=(.+?)(?=\s+\d+-\d+=|$)/g)].map((b) => ({ value: Number(b[1]), label: b[3].trim() }));
    if (bands.length >= 2) return { choices: bands };
  }
  // Values named one each, `0=off 1=on`.
  if (/^\d+=\S+(?:\s+\d+=\S+)+$/.test(t)) return { choices: t.split(/\s+/).map((p) => /^(\d+)=(.+)$/.exec(p)).map((x) => ({ value: Number(x[1]), label: x[2] })) };
  if (/=\d+/.test(t)) {
    const choices = t.split(/,\s*/).map((p) => /^(.+?)=(\d+)$/.exec(p.trim())).map((x) => (x ? { value: Number(x[2]), label: x[1].trim() } : null));
    if (choices.every(Boolean)) return { choices };
  }
  if (/^\d+ \S/.test(t)) {
    const choices = t.split(/,\s*/).map((p) => /^(\d+) (.+)$/.exec(p.trim())).map((x) => (x ? { value: Number(x[1]), label: x[2].trim() } : null));
    if (choices.every(Boolean) && choices.length >= 2) return { choices };
  }
  m = /^(\d+)-(\d+)$/.exec(t);
  if (m) return Number(m[2]) > 127 ? { tooWide: true } : { min: Number(m[1]), max: Number(m[2]) };
  return { printed: true, min: 0, max: 127 };
}

export function buildTwistedProfile(data, layout) {
  const notes = [];
  const left = { tooWide: [], sendOnly: [], notController: [] };
  const renamed = [];
  const recipes = new Map();
  const parameters = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const printed = [];
  const channelOf = (table) => {
    const targets = layout.channels?.[table.title];
    if (!targets) return [{ channel: null, label: null }];
    return (data.routing ?? []).filter((r) => targets.some((re) => re.test(r.target))).map((r) => ({ channel: r.channel, label: r.target }));
  };
  const choiceParameter = (base, choices, encoding = 'u7') => {
    const seen = new Set();
    const list = choices.map(({ value, label }) => { let id = camel(label) || `v${value}`; if (seen.has(id)) id = `${id}${value}`; seen.add(id); return { id, label, value }; });
    return { ...base, type: 'choice', default: list[0].id, choices: list, display: { mode: 'choice', shortLabel: base.id.split('.').pop() }, normalization: { mode: 'choiceIndex' }, encoding: { type: encoding }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list.length === 2 ? 'ToggleButton' : list.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } };
  };
  const integerParameter = (base, min, max, encoding = 'u7') => ({
    ...base, type: 'integer', range: { min, max }, default: min, display: { mode: 'number', unit: '', shortLabel: base.id.split('.').pop() }, normalization: { mode: 'linear' }, encoding: { type: encoding },
    sendPolicy: max - min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
    ui: { preferredComponent: max - min === 1 ? 'ToggleButton' : max - min > 16 ? 'Knob' : 'Combobox' },
  });

  // The controller tables.
  for (const title of layout.controllerTables) {
    const table = data.tables.find((t) => t.title === title);
    const [ccAt, nameAt, valueAt, groupAt] = [col(table, /^(?:MIDI )?CC#?$/), col(table, /^(?:Parameter|Message)$/), col(table, /^(?:Values|Range)/), col(table, /^(?:Group|Panel area)$/)];
    const directionAt = col(table, /^Direction$/);
    for (const [rowIndex, row] of table.rows.entries()) {
      // A PDF table's rows keep their pages beside them (read-twisted-pdf.mjs).
      const rowPage = table.pages?.[rowIndex];
      const ccText = row[ccAt];
      // (A row the instrument only sends is no setting; a controller printed as `32+59`, `Velocity`
      // or `1 (mod wheel)` is not one controller.)
      if (directionAt >= 0 && /^send$/i.test(row[directionAt])) { left.sendOnly.push(`CC ${ccText} ${row[nameAt]}`); continue; }
      if (!/^\d+(?:-\d+)?$/.test(ccText)) { left.notController.push(`${row[nameAt]} (${ccText})`); continue; }
      const rename = layout.renames?.find((r) => r.section === row[groupAt] && r.name === row[nameAt]);
      if (rename) { renamed.push(`${rename.to}: ${rename.why}`); row[nameAt] = rename.to; }
      const span = /^(\d+)-(\d+)$/.exec(ccText);
      const controllers = span ? Array.from({ length: Number(span[2]) - Number(span[1]) + 1 }, (u, k) => Number(span[1]) + k) : [Number(ccText)];
      const values = controllerValues(valueAt >= 0 ? row[valueAt] : '');
      if (values.tooWide) { left.tooWide.push(`CC ${ccText} ${row[nameAt]} (${row[valueAt]})`); continue; }
      if (values.printed) printed.push(`CC ${ccText} ${row[nameAt]} (${row[valueAt]})`);
      for (const { channel, label } of channelOf(table)) {
        controllers.forEach((cc, k) => {
          // (`Voice volume 1-8` over `10-17`: the k-th voice's.)
          const name = span ? row[nameAt].replace(/(\d+)-(\d+)/, () => String(k + 1)) : row[nameAt];
          const group = label ?? ((groupAt >= 0 && row[groupAt]) || (layout.pdf ? name.split(' ')[0].replace(/[,:]$/, '') : title.replace(/ MIDI CC$| CCs$/, '')));
          const id = `cc${hex(cc)}${channel ? `ch${channel}` : ''}`;
          recipes.set(id, { id, kind: 'cc', channel: channel ?? '$channel', controller: cc });
          const base = {
            // Where a web page prints it: its table, by the heading it is set under; a PDF manual, the
            // page of its row (the table's title there is the layout's, not read from the manual).
            id: unique(`${camel(group)}.${camel(name)}`), name, group, ...(layout.pdf ? (rowPage ? { source: { page: rowPage } } : {}) : { source: { table: title } }),
            description: `${title}: CC ${cc}${channel ? ` on channel ${channel} (${label})` : ''}; ${row[nameAt]}${valueAt >= 0 ? `; values ${row[valueAt] || 'not printed'}` : ''}${values.printed ? '; sent as 0 - 127' : ''}.`,
            access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: id,
          };
          parameters.push(values.choices ? choiceParameter(base, values.choices) : integerParameter(base, values.min, values.max));
        });
      }
    }
  }

  // TWISTfm's SysEx editor protocol.
  const requests = [];
  const dumps = [];
  const tests = [];
  if (layout.editor) {
    const header = /Header: ((?:[0-9A-F]{2} )+[0-9A-F]{2})\./.exec(data.protocol ?? '')?.[1].split(' ');
    if (!header) throw new Error('the editor protocol\'s header is not read');
    const protocol = data.tables.find((t) => t.title === layout.editor.protocol);
    const responses = data.tables.find((t) => t.title === layout.editor.responses);
    const code = (table, name) => table.rows.find((r) => r[1] === name)?.[0];
    const [set, getAll, info, value] = [code(protocol, 'SET editor parameter'), code(protocol, 'GET_ALL editor parameters'), code(responses, 'INFO'), code(responses, 'VALUE')];
    const index = data.tables.find((t) => t.title === layout.editor.table);
    const mappings = [];
    for (const row of index.rows) {
      const [id, group, name, target, storage, range, bit] = row;
      const n = Number(id);
      const recipe = { id: `editor${hex(n)}`, kind: 'sysex', template: [...header, set, hex(n), '$encodedValue', 'F7'] };
      recipes.set(recipe.id, recipe);
      const base = {
        id: unique(`${camel(group)}.${camel(name)}`), name, group, source: { table: index.title },
        description: `Editor parameter ${n}: ${target}, ${storage}${bit ? `, bit ${bit}` : ''}; range ${range}. SET editor parameter (${set}).`,
        access: { canRead: true, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: recipe.id,
      };
      const named = range.split(/,\s*/).map((p) => /^(\d+)=(.+)$/.exec(p.trim()));
      const span = /^(\d+)-(\d+)$/.exec(range);
      if (named.every(Boolean)) parameters.push(choiceParameter(base, named.map((m) => ({ value: Number(m[1]), label: m[2] })), 'u14-lsb-msb'));
      else if (span) parameters.push(integerParameter(base, Number(span[1]), Number(span[2]), 'u14-lsb-msb'));
      else throw new Error(`editor parameter ${n}: range "${range}" is not read`);
      mappings.push({ parameter: base.id, offset: 1, when: { offset: 0, value: n } });
    }
    const count = index.rows.length + 1;
    requests.push({ id: 'requestEditorParameters', name: 'GET_ALL editor parameters', kind: 'sysex', template: [...header, getAll, 'F7'], response: { kind: 'bulkDump', collectionId: 'editorParameters' }, timeoutMs: 4000, retries: 1 });
    dumps.push(
      { id: 'editorInfo', name: 'INFO', kind: 'sysex', matcher: { prefix: [...header, info], suffix: ['F7'] }, payload: { offset: header.length + 1, size: 2 }, completion: { collectionId: 'editorParameters', expectedMessages: count }, mappings: [] },
      { id: 'editorValue', name: 'VALUE', kind: 'sysex', matcher: { prefix: [...header, value], suffix: ['F7'] }, payload: { offset: header.length + 1, size: 3 }, completion: { collectionId: 'editorParameters', expectedMessages: count }, mappings },
    );
    notes.push(`The editor parameters are the SysEx Editor Protocol's (header ${header.join(' ')}): SET editor parameter (${set}) with the parameter's id and its value in two 7-bit bytes, the low first ("value = LSB + (MSB * 128)"). Pull sends GET_ALL editor parameters (${header.join(' ')} ${getAll} F7) and reads its answer, an INFO message (${info}) and a VALUE message (${value} id valueLSB valueMSB) for each of the ${index.rows.length} editor IDs: each parameter takes the value of the VALUE whose id is its own, so the order they come in does not matter. The collection is complete at ${count} messages.`);
    // A VALUE for the first editor parameter and one for the last, and the request.
    const first = parameters.find((p) => p.messageRecipe === 'editor00');
    const last = parameters.find((p) => p.messageRecipe === `editor${hex(index.rows.length - 1)}`);
    const wire = (p) => (p.type === 'choice' ? p.choices.at(-1).value : p.range.max);
    for (const p of [first, last]) {
      const t = recipes.get(p.messageRecipe).template;
      tests.push({ name: `${p.name} = ${p.type === 'choice' ? p.choices.at(-1).id : p.range.max} (SET editor parameter)`, parameter: p.id, value: p.type === 'choice' ? p.choices.at(-1).id : p.range.max, expectedHex: [...t.slice(0, -2), hex(wire(p) & 127), hex(wire(p) >> 7), 'F7'].join(' ') });
    }
    tests.push({ name: 'GET_ALL editor parameters', kind: 'request', request: 'requestEditorParameters', expectedHex: [...header, getAll, 'F7'].join(' ') });
    tests.push({ name: 'A VALUE message, read by its id', kind: 'dumpParse', inputHex: [...header, value, hex(Number(index.rows.at(-1)[0])), hex(wire(last) & 127), hex(wire(last) >> 7), 'F7'].join(' '), expectedValues: { [last.id]: last.type === 'choice' ? last.choices.at(-1).id : wire(last) } });
  }

  // Controller vectors: the first parameter and a choice.
  const status = (ch) => 0xb0 + ((ch === '$channel' ? (data.defaultChannel?.channel ?? 1) : ch) - 1);
  for (const p of [parameters.find((x) => recipes.get(x.messageRecipe).kind === 'cc'), parameters.find((x) => recipes.get(x.messageRecipe).kind === 'cc' && x.type === 'choice')].filter(Boolean)) {
    const r = recipes.get(p.messageRecipe);
    const [value, wire] = p.type === 'choice' ? [p.choices.at(-1).id, p.choices.at(-1).value] : [p.range.max, p.range.max];
    tests.unshift({ name: `${p.group} ${p.name} = ${value}`, parameter: p.id, value, expectedHex: [status(r.channel), r.controller, wire].map(hex).join(' ') });
  }

  const doc = data.source;
  notes.unshift(
    'Generated by tools/profiles/twisted/make-profiles.mjs; edit the layout in tools/profiles/twisted/synths/, not this file.',
    `Every controller is a row of the ${layout.pdf ? 'manual' : 'page'}'s ${layout.controllerTables.join(' and ')}, sent as the controller it prints${data.routing && layout.channels ? `, on the channel the page's MIDI Channel Routing gives its target (${data.routing.map((r) => `${r.target} CH${r.channel}`).join(', ')}; changeable in the editor)` : ' on the channel variable'}${data.defaultChannel ? ` ("${data.defaultChannel.text}": the channel variable's default)` : ''}. Nothing here has been sent to a real instrument yet.`,
    ...(doc.saved ? [`The page is a live document, saved on ${doc.saved}; a later version may differ.`] : []),
  );
  notes.push(...(layout.notes ?? []));
  if (renamed.length) notes.push(`Renamed where the manual's own block shows the name: ${renamed.join('; ')}.`);
  if (left.sendOnly.length) notes.push(`Left out, rows the instrument only sends: ${left.sendOnly.join(', ')}.`);
  if (left.notController.length) notes.push(`Left out, rows whose controller is not one controller number: ${left.notController.join(', ')}.`);
  if (printed.length) notes.push(`Sent 0 - 127, their values described rather than ranged: ${printed.join('; ')}.`);
  if (left.tooWide.length) notes.push(`Left out, controllers whose printed values go past 127, which a controller cannot carry: ${left.tooWide.join('; ')}${layout.editor ? ' (the editor parameters and raw preset addresses carry the full values)' : ''}.`);
  if (layout.editor) notes.push('Not laid out: the raw preset and raw setting addresses (commands 05 - 0A), which carry the same settings as the controllers and the editor parameters byte by byte, and the buffer commands (0C, 0D).');
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Twisted Electrons',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: doc.saved
      ? `The page's MIDI tables (${data.tables.map((t) => t.title).join(', ')}), read by tools/profiles/twisted/read-twisted-page.mjs from ${doc.file} saved ${doc.saved} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.`
      : `The manual's MIDI implementation (PDF pages ${doc.pages[0]} - ${doc.pages[1]}), read by tools/profiles/twisted/read-twisted-pdf.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: notes,
    variables: { channel: data.defaultChannel?.channel ?? 1 },
    coverage: {
      singleParameterWrite: `complete-for-the-page's-tables: ${parameters.length} parameters`,
      realtimeEditing: 'complete-for-the-page\'s-tables',
      editBufferDumpRequest: layout.editor ? 'complete: GET_ALL editor parameters' : 'notImplemented',
      editBufferDumpParse: layout.editor ? 'partial: the editor parameters, from their VALUE messages; the controllers are not read back' : 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the controllers the page marks In/Out are sent back by the instrument',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()],
    ...(requests.length ? { requests, dumpDefinitions: dumps } : {}),
    parameters,
    tests,
  };
}

export { stringifyProfile };
