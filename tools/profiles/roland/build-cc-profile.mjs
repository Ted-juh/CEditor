// build-cc-profile.mjs — a Control Change list (charts/<name>.json) and a layout (cc-synths/<name>.mjs)
// -> a CEditor device profile.
//
// What the manual says, and nothing it does not:
//
//   - every controller the list names is a parameter, 0 - 127 on its CC, named as printed;
//   - one the chart marks as transmitted but not recognized is kept, read-only, so a panel can
//     follow it, and is never sent;
//   - a value range is never invented. Roland's lists name the controller and stop there: how a
//     Boutique divides 0 - 127 among a switch's positions is not printed, so a switch is a number
//     here until a manual or an instrument says where its steps fall. The one exception is a value
//     list the manual prints itself, `ROBOT (0, 127)`, which becomes those two choices.
//
// A layout supplies what the list cannot: groups, the parts a mark sends on another channel (the
// JP-08's Lower part, one channel up), a corrected name where the text layer lost what was printed
// (the S-1's waveform icons), and the program changes. Every correction carries its reason, and the
// reasons go into the profile's notes.

import { camel } from './build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

/** `LFO RATE (LFO [RATE] knob)` -> name and the manual's own explanation of it. */
export function splitExplanation(printed) {
  const m = /^(.*?\S)\s+(\((?:[^()]|\([^()]*\))*\)(?:\s*\((?:[^()]|\([^()]*\))*\))*)$/.exec(printed);
  if (!m) return { name: printed, explanation: null };
  return { name: m[1], explanation: m[2].replace(/^\(|\)$/g, '').replace(/\)\s*\(/g, '; ').trim() };
}

/** `(0, 127)` -> [0, 127]: the manual's own list of the values a controller takes. */
function printedValues(explanation) {
  const m = /^(\d{1,3}(?:\s*,\s*\d{1,3})+)$/.exec(explanation ?? '');
  if (!m) return null;
  const values = m[1].split(',').map((v) => Number(v.trim()));
  return values.every((v) => v <= 127) ? values : null;
}

function preferredComponent(name) {
  return /\b(ENV|ENVELOPE|LEVEL|TIME|ATTACK|DECAY|SUSTAIN|RELEASE|VOLUME|DEPTH)\b|\b[ADSR]$/i.test(name) ? 'Slider' : 'Knob';
}

function groupOf(name, groups) {
  for (const [group, pattern] of groups ?? []) {
    const m = pattern.exec(name);
    if (m) return { group, leaf: m.index === 0 && name.slice(m[0].length).trim() ? name.slice(m[0].length).trim() : name };
  }
  return { group: 'Controllers', leaf: name };
}

export function buildCcProfile(chart, synth) {
  const notes = [];
  const parameters = [];
  const recipes = new Map();
  const ids = new Set();
  const corrected = synth.names ?? {};
  const omitted = synth.omit ?? {};

  const recipeFor = (cc, channel) => {
    const id = channel === '$channel' ? `cc${cc}` : `cc${cc}${channel.slice(1, 2).toUpperCase()}${channel.slice(2)}`;
    if (!recipes.has(id)) recipes.set(id, { id, kind: 'cc', channel, controller: cc, value: '$encodedValue' });
    return id;
  };
  const unique = (id, cc) => {
    let out = id;
    if (ids.has(out)) out = `${id}Cc${cc}`;
    ids.add(out);
    return out;
  };

  for (const [cc, why] of Object.entries(omitted)) notes.push(`CC ${cc} is not a parameter here: ${why}`);
  for (const [cc, fix] of Object.entries(corrected)) notes.push(`CC ${cc} is named "${fix.name}": ${fix.why}`);
  for (const [cc, range] of Object.entries(synth.ranges ?? {})) notes.push(`CC ${cc} is ${range.min} - ${range.max}: ${range.why}`);

  const rows = [...chart.rows, ...(synth.extra ?? []).map((row) => ({ ...row, added: true }))].sort((a, b) => a.cc - b.cc);
  const repeated = new Map();
  for (const row of rows) {
    const key = (corrected[row.cc]?.name ?? row.name).toUpperCase();
    repeated.set(key, (repeated.get(key) ?? 0) + 1);
  }

  for (const row of rows) {
    if (omitted[row.cc] !== undefined) continue;
    const printed = corrected[row.cc]?.name ?? row.name;
    const { name: bare, explanation } = splitExplanation(printed);
    // The same name printed for two numbers (the SYSTEM-1's OSC1 TYPE at 46 and 61) is two
    // controllers; the number tells them apart, and the manual's spelling stays as printed.
    const name = repeated.get(printed.toUpperCase()) > 1 ? `${bare} (CC ${row.cc})` : bare;
    const values = printedValues(explanation);
    const { group, leaf } = groupOf(bare, synth.groups);
    const sendsOnly = row.rx === false;
    const describe = [
      explanation && !values ? explanation : null,
      ...row.marks.filter((mark) => !(synth.parts && mark === synth.parts.mark)).map((mark) => chart.chart.notes[mark]).filter(Boolean),
      sendsOnly ? 'The instrument sends this controller and does not respond to it, so it is read-only here.' : null,
      row.added ? row.why : null,
      synth.descriptions?.[row.cc] ?? null,
    ].filter(Boolean);

    const parts = synth.parts && row.marks.includes(synth.parts.mark) ? synth.parts.list : [{ id: null, channel: '$channel' }];
    for (const part of parts) {
      const base = {
        id: unique(`${part.id ? `${part.id}.` : ''}${camel(group)}.${camel(leaf) || `cc${row.cc}`}`, row.cc),
        name: part.id ? `${part.name} ${name}` : name,
        group: part.id ? `${part.name} ${group}` : group,
        // The page of the document its row is printed on: the reader's, or the layout's for a
        // controller the layout adds from elsewhere in the same document.
        ...(row.page ? { source: { page: row.page } } : {}),
        ...(describe.length ? { description: describe.join(' ') } : {}),
        access: { canRead: false, canWrite: !sendsOnly, realtimeSafe: true, source: 'singleParameter' },
        messageRecipe: recipeFor(row.cc, part.channel),
      };
      if (values) {
        parameters.push({
          ...base,
          type: 'choice',
          default: String(values[0]),
          choices: values.map((value) => ({ id: String(value), label: String(value), value })),
          display: { mode: 'choice', shortLabel: camel(leaf) },
          normalization: { mode: 'choiceIndex' },
          encoding: { type: 'enum' },
          sendPolicy: { mode: 'onCommit', coalesce: true },
          ui: { preferredComponent: values.length === 2 ? 'ToggleButton' : 'RadioButtonGroup' },
        });
      } else {
        parameters.push({
          ...base,
          type: 'integer',
          range: { min: synth.ranges?.[row.cc]?.min ?? 0, max: synth.ranges?.[row.cc]?.max ?? 127 },
          default: synth.ranges?.[row.cc]?.min ?? 0,
          display: { mode: 'number', unit: '', shortLabel: camel(leaf) },
          normalization: { mode: 'linear' },
          encoding: { type: 'u7' },
          sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true },
          ui: { preferredComponent: preferredComponent(bare) },
        });
      }
    }
  }

  // Tests: one controller per part, and the highest-numbered one, at a value the chart cannot
  // have produced by accident. The expected bytes are worked out here from the chart's number and
  // the channel, not by asking the engine — that is the point of a test.
  const variables = { channel: 1, ...(synth.variables ?? {}) };
  const writable = parameters.filter((p) => p.access.canWrite && p.type === 'integer');
  const picks = [...new Map([writable[0], ...(synth.parts?.list ?? []).map((part) => writable.find((p) => p.id.startsWith(`${part.id}.`))), writable.at(-1)]
    .filter(Boolean).map((p) => [p.id, p])).values()];
  const tests = picks.map((parameter) => {
    const recipe = recipes.get(parameter.messageRecipe);
    const channel = recipe.channel === '$channel' ? variables.channel : variables[recipe.channel.slice(1)];
    // Inside the parameter's own range: the C++ engine refuses a value outside it (the SE-02's
    // Bank select is 0 - 3), and a vector it refuses tests nothing.
    const value = Math.min(100, parameter.range.max);
    return {
      name: `${parameter.name} at ${value} (CC ${recipe.controller} on channel ${channel})`,
      parameter: parameter.id,
      value,
      expectedHex: [0xb0 + channel - 1, recipe.controller, value].map(hex).join(' '),
    };
  });

  const source = { ...chart.source, ...(synth.manual ?? {}) };
  const title = `${source.model ?? synth.name} ${synth.documentTitle ?? 'MIDI Implementation Chart'}`
    + `${source.version ? ` (version ${source.version}${source.date ? `, ${source.date}` : ''})` : source.date ? ` (${source.date})` : ''}`;
  const sendOnly = parameters.filter((p) => !p.access.canWrite).length;

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
      title,
      notes: `Control Change list read by tools/profiles/roland/read-cc-list.mjs from ${source.file}, page ${source.chartPage}`
        + `${source.sha256 ? ` (sha256 ${source.sha256})` : ''}${source.url ? `, ${source.url}` : ''}. `
        + 'Not yet checked against the instrument itself.',
    }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/roland/make-cc-profiles.mjs; edit the layout in tools/profiles/roland/cc-synths/, not this file.',
      'Every parameter is a controller the manual lists, on the number it gives, with the name it prints. Nothing here has been sent to a real instrument yet.',
      'Roland prints no value ranges for these controllers, so each is 0 - 127 on the wire unless a note below says the manual prints otherwise; a switch is a number until the instrument shows where its positions fall.',
      ...(sendOnly ? [`${sendOnly} controller(s) the chart marks as transmitted only are read-only: a panel can follow them, and they are never sent.`] : []),
      ...(synth.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-manual\'s-control-change-list',
      realtimeEditing: 'complete-for-the-manual\'s-control-change-list',
      editBufferDumpRequest: 'notAvailable: the instrument publishes no way to read its settings',
      editBufferDumpParse: 'notAvailable',
      bankDump: 'notAvailable',
      inboundControllers: 'every controller the chart marks as transmitted is a parameter, so a panel can follow the front panel',
      verifiedOnHardware: false,
      ...(synth.coverage ?? {}),
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.controller - b.controller || a.id.localeCompare(b.id)),
    parameters,
    tests,
    ...(synth.presets ? { presets: synth.presets } : {}),
  };
}
