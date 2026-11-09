// build-nrpn-profile.mjs — a Sequential manual's NRPN tables (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What the tables say, and nothing they do not:
//
//   - every row is a parameter on its NRPN, with its printed range and name;
//   - a row whose value labels name every value in its range (`0 = Off`, `1 = Master`, …) is a
//     choice; labels that do not cover the range stay in the description and the value is a number;
//   - a run of NRPNs (`256-319  Seq Step 1-64 Note 1`) is one parameter per number, named by the
//     span its name carries, and only when that span counts out to the run;
//   - every value is sent as Sequential sends it: NRPN number MSB/LSB on CC 99/98, value MSB/LSB on
//     CC 6/38, so 0 - 127 goes out as MSB 0;
//   - a number printed in two tables keeps the first table's name, and the second is noted.
//
// The layout says what the tables cannot: which pages they are on, which footnote mark means a
// parameter is ignored when received, how to group, what to leave out and why.

import { camel } from '../roland/build-profile.mjs';
import { span, splitMore } from './read-nrpn-tables.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const choiceSlug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'v';

/** `MIDI Param Receive†` -> { name: 'MIDI Param Receive', marks: ['†'] } */
function splitMarks(text) {
  const m = /^(.*?)\s*([*†‡]+)\s*$/.exec(text.replace(/\s+([*†‡])/g, '$1'));
  return m ? { name: m[1], marks: [...m[2]] } : { name: text, marks: [] };
}

/** What one printed row means, before it is expanded into parameters. */
export function interpretRow(row, table, layout) {
  const nrpn = span(row.nrpn ?? 'x');
  const nrpnB = row.nrpnB ? span(row.nrpnB) : null;   // null for N/A: one parameter for both layers
  // No usable range: missing, `n/a`, `---`, or negative (the Take 5's `-700-700` fine tune, whose
  // wire form the manual does not give). Such a row is reported, not guessed at.
  // A range that wrapped (`-700-` / `700`) is put back together before it is judged.
  const more = [...(row.more ?? [])];
  let printedRange = row.range ?? null;
  if (/[-–]$/.test(printedRange ?? '') && /^-?\d+$/.test(more[0] ?? '')) printedRange += more.shift();
  const ranged = /^\d+(\s*[-–—]\s*\d+)?$/.test(printedRange ?? '');
  const [min, max] = ranged ? span(printedRange) : [null, null];
  const { labels, text } = splitMore(more, { labels: table.labels ?? layout.labels ?? 'equals' });
  const printed = (row.desc ?? row.name ?? '').trim();
  // The Rev2 prints `Mono/Stereo` twice, once on the row and again under it.
  for (let i = text.length - 1; i >= 0; i--) if (text[i] === printed) text.splice(i, 1);
  let name;
  let description = null;
  // A description that explains itself (`Master Transpose: 0= -12 semitones …`) is named by what
  // comes before its colon; a short one that wrapped (`PolyMod Filter Env` / `Amt`) is one name.
  // The older DSI manuals also explain after a comma and a number (`Oscillator 1 Frequency, 0 – 120
  // in semitones`), which a layout opts into: a comma alone is part of some names (`LFO PW 1, 2`).
  const colon = (layout.explain ?? /^([^:;]{2,40})[:;]\s*(.*)$/).exec(printed);
  if (colon) {
    name = colon[1];
    description = [colon[2], ...text].filter(Boolean).join(' ');
  } else {
    // A name that wrapped at a hyphen or a slash joins without a space: `OLED Screen-` / `saver`,
    // `LFO FREQ PW A ON/` / `OFF`.
    // A wrapped name continues in short fragments (`Amt`, `Dest On/Off`); a sentence under a row is
    // its explanation (the Pro 2's `"Default" resets for 16- and 32-step sequences are 17 and 33`).
    const cut = text.findIndex((line) => line.length > 30 || /\.$/.test(line) || /^["“]/.test(line));
    const wrapped = cut < 0 ? text : text.slice(0, cut);
    if (cut >= 0) description = text.slice(cut).join(' ');
    name = [printed, ...wrapped].reduce((all, part) => {
      if (/\w-$/.test(all) && /^[a-z]/.test(part)) return `${all.slice(0, -1)}${part}`;   // Screen- / saver
      if (/\s[-–]$/.test(all)) return `${all} ${part}`;                                   // Normal - / Bandpass: a dash, not a split word
      if (/[-/]$/.test(all)) return `${all}${part}`;                                      // ON/ / OFF
      return `${all} ${part}`;
    }).replace(/\s+/g, ' ').replace(/,$/, '');
    // What a name says about its values belongs in the description: `Feedback Amount 0 to 126 =
    // -127 to -1`, `Mod 1 Source (see table of modulation sources and values)`.
    const said = /^(.*?\S)\s+(\(\s*see\b.*\)|\(.*\b\w+\s+\w+\s+\w+.*\)|\d+\s+to\s+\d+\s*=.*)$/i.exec(name);
    if (said) { name = said[1]; description = said[2].replace(/^\(|\)$/g, ''); }
  }
  const marked = splitMarks(name);
  return { footnotes: row.footnotes ?? {}, nrpn, nrpnB, min, max, ranged, range: printedRange, name: marked.name, marks: marked.marks, labels, description, page: row.page, param: row.param ?? null };
}

/** A run of NRPNs named by a span in its name: `Seq Step 1-64 Note 1` over 64 numbers. */
function expandRun(meaning) {
  const [a, b] = meaning.nrpn;
  const count = b - a + 1;
  const run = (i) => ({ ...meaning, nrpn: [a + i, a + i], nrpnB: meaning.nrpnB ? [meaning.nrpnB[0] + i, meaning.nrpnB[0] + i] : null });
  const m = /(\d+)\s*[-–]\s*(\d+)/.exec(meaning.name);
  if (m && Number(m[2]) - Number(m[1]) + 1 === count) {
    return Array.from({ length: count }, (unused, i) => ({
      ...run(i),
      name: `${meaning.name.slice(0, m.index)}${Number(m[1]) + i}${meaning.name.slice(m.index + m[0].length)}`,
    }));
  }
  // The span may be in the explanation instead (the Tetra's `Sequence Track 1, steps 1 – 16`).
  const said = /\b([A-Za-z]+?)s?\s+(\d+)\s*[-–]\s*(\d+)\b/.exec(meaning.description ?? '');
  if (said && Number(said[3]) - Number(said[2]) + 1 === count) {
    const word = said[1][0].toUpperCase() + said[1].slice(1);
    return Array.from({ length: count }, (unused, i) => ({ ...run(i), name: `${meaning.name} ${word} ${Number(said[2]) + i}`, description: null }));
  }
  return null;
}

/** `Osc2ShapeMod` -> `Osc 2 Shape Mod`, `EnvVCAAmt` -> `Env VCA Amt`: for matching, not for display. */
export function spaced(name) {
  return name
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_/g, ' ');
}

function groupOf(name, groups, fallback) {
  const words = spaced(name);
  for (const [group, pattern] of groups ?? []) {
    const m = pattern.exec(words);
    if (!m) continue;
    const rest = m.index === 0 ? words.slice(m[0].length).trim() : '';
    return { group: group.replace(/\$(\d)/g, (all, i) => m[Number(i)] ?? ''), leaf: rest || words };
  }
  return { group: fallback, leaf: words };
}

function preferredComponent(name, choices) {
  if (choices) return choices.length === 2 ? 'ToggleButton' : choices.length <= 5 ? 'RadioButtonGroup' : 'Combobox';
  return /\b(Attack|Decay|Sustain|Release|Delay|Level|Amt|Amount|Volume|Mix)\b/i.test(name) ? 'Slider' : 'Knob';
}

export function buildNrpnProfile(data, layout) {
  const notes = [];
  const parameters = [];
  const recipes = new Map();
  const ids = new Set();
  const seen = new Map();
  const unranged = new Map();
  const skipped = new Map();
  const variables = { channel: 1, ...(layout.variables ?? {}) };

  const recipeFor = (n) => {
    const id = `nrpn${n}`;
    if (!recipes.has(id)) {
      recipes.set(id, { id, kind: 'nrpn', channel: '$channel', parameterMsb: n >> 7, parameterLsb: n & 0x7f, valueResolution: 14, value: '$encodedValue', nullAfterSend: false });
    }
    return id;
  };
  const unique = (id, n) => {
    const out = ids.has(id) ? `${id}Nrpn${n}` : id;
    ids.add(out);
    return out;
  };

  for (const table of data.tables) {
    const spec = layout.tables.find((t) => t.id === table.id) ?? {};
    for (const row of table.rows) {
      const meaning = interpretRow(row, spec, layout);
      if (!meaning.nrpn) continue;                                     // `x`: in the dump, not on an NRPN
      if (!meaning.ranged) {
        const key = meaning.range ? `printed with the range "${meaning.range}"` : 'printed without a range';
        unranged.set(key, [...(unranged.get(key) ?? []), `${meaning.nrpn[0] === meaning.nrpn[1] ? meaning.nrpn[0] : meaning.nrpn.join('-')} (${meaning.name})`]);
        continue;
      }
      // Tested before a run is expanded (`Name 0-19`), so one note covers the run.
      const skip = (layout.skip ?? []).find(([pattern]) => pattern.test(meaning.name));
      if (skip) {
        const at = meaning.nrpn[0] === meaning.nrpn[1] ? `${meaning.nrpn[0]}` : meaning.nrpn.join('-');
        skipped.set(skip[1], [...(skipped.get(skip[1]) ?? []), at]);
        continue;
      }
      let expanded = [meaning];
      if (meaning.nrpn[1] > meaning.nrpn[0]) {
        expanded = expandRun(meaning);
        if (!expanded) {
          notes.push(`NRPN ${meaning.nrpn.join('-')} (${meaning.name}) is left out: a run the table does not name one by one`);
          continue;
        }
      }
      for (const one of expanded) {
        const layers = one.nrpnB ? [['a', 'A', one.nrpn[0]], ['b', 'B', one.nrpnB[0]]] : [[null, null, one.nrpn[0]]];
        for (const [layerId, layerName, n] of layers) {
          if (seen.has(n)) {
            const first = seen.get(n);
            if (first.name.toLowerCase() !== one.name.toLowerCase()) {
              notes.push(`NRPN ${n} is printed as "${first.name}" (${first.table}) and as "${one.name}" (${table.id}); the first is used`);
              // Twice in ONE table is the manual contradicting itself, not two names for one thing:
              // say so on the parameter, where whoever uses it will read it.
              if (first.table === table.id && first.parameter) {
                const warning = `The manual also prints NRPN ${n} for "${one.name}"; which of the two the instrument answers to is not settled.`;
                first.parameter.description = first.parameter.description ? `${first.parameter.description} ${warning}` : warning;
              }
            }
            continue;
          }
          const entry = { name: one.name, table: table.id, parameter: null };
          seen.set(n, entry);
          const correction = layout.names?.[n];
          const name = correction?.name ?? one.name;
          // A table printed under one header that holds both kinds (the Mopho's) is split by number.
          const inGlobal = layout.globalNrpns && n >= layout.globalNrpns[0] && n <= layout.globalNrpns[1];
          const { group, leaf } = inGlobal ? { group: 'Global', leaf: name } : groupOf(name, layout.groups, spec.group ?? 'Program');
          // A mark means what its own footnote says; the layout's reading is the fallback for a mark
          // whose footnote the reader did not find.
          const footnote = (mark) => one.footnotes[mark] ?? layout.marks?.[mark]?.note ?? null;
          const readOnly = one.marks.some((mark) => (one.footnotes[mark] ? /ignored when received/i.test(one.footnotes[mark]) : layout.marks?.[mark]?.readOnly));
          const values = Array.from({ length: one.max - one.min + 1 }, (unused, i) => one.min + i);
          const labelled = one.labels.length === values.length && values.every((v, i) => one.labels[i]?.value === v);
          const describe = [
            one.description,
            !labelled && one.labels.length ? one.labels.map((l) => `${l.value} = ${l.label}`).join(', ') : null,
            ...one.marks.map((mark) => (footnote(mark) ? `${mark} ${footnote(mark)}` : null)).filter(Boolean),
            layout.descriptions?.[n] ?? null,
          ].filter(Boolean);
          const base = {
            id: unique(`${layerId ? `${layerId}.` : ''}${camel(group)}.${camel(leaf) || `nrpn${n}`}`, n),
            name: layerName ? `${layerName}: ${name}` : name,
            group: layerName ? `${layerName}: ${group}` : group,
            ...(describe.length ? { description: describe.join(' ') } : {}),
            access: { canRead: false, canWrite: !readOnly, realtimeSafe: true, source: 'singleParameter' },
            messageRecipe: recipeFor(n),
          };
          if (labelled) {
            const used = new Set();
            const choices = one.labels.map(({ value, label }) => {
              const slug = choiceSlug(label);
              const id = used.has(slug) ? `${slug}_${value}` : slug;
              used.add(id);
              return { id, label, value };
            });
            entry.parameter = parameters[parameters.push({
              ...base,
              type: 'choice',
              default: choices[0].id,
              choices,
              display: { mode: 'choice', shortLabel: camel(leaf) },
              normalization: { mode: 'choiceIndex' },
              encoding: { type: 'enum' },
              sendPolicy: { mode: 'onCommit', coalesce: true },
              ui: { preferredComponent: preferredComponent(name, choices) },
            }) - 1];
          } else {
            entry.parameter = parameters[parameters.push({
              ...base,
              type: 'integer',
              range: { min: one.min, max: one.max },
              default: one.min,
              display: { mode: 'number', unit: '', shortLabel: camel(leaf) },
              normalization: { mode: 'linear' },
              encoding: { type: 'u14-msb-lsb' },
              sendPolicy: one.max - one.min > 8
                ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true }
                : { mode: 'onCommit', coalesce: true },
              ui: { preferredComponent: preferredComponent(name, null) },
            }) - 1];
          }
        }
      }
    }
  }
  for (const [why, list] of skipped) notes.push(`Left out, ${why}: NRPN ${list.join(', ')}.`);
  for (const [why, list] of unranged) notes.push(`Left out, ${why}: NRPN ${list.join(', ')}.`);
  for (const [n, fix] of Object.entries(layout.names ?? {})) notes.push(`NRPN ${n} is named "${fix.name}": ${fix.why}`);

  // Tests: the expected bytes come from the NRPN number and the value, worked out here, not by
  // asking an engine. One of each kind: the first parameter, a choice, the highest NRPN (whose MSB
  // is not zero), a value above 127, and a layer B parameter where there are layers.
  const nrpnOf = (p) => recipes.get(p.messageRecipe);
  const writable = parameters.filter((p) => p.access.canWrite);
  const picks = [
    writable[0],
    writable.find((p) => p.type === 'choice'),
    writable.find((p) => p.type === 'integer' && p.range.max > 127),
    writable.find((p) => p.id.startsWith('b.')),
    [...writable].sort((a, b) => (nrpnOf(b).parameterMsb * 128 + nrpnOf(b).parameterLsb) - (nrpnOf(a).parameterMsb * 128 + nrpnOf(a).parameterLsb))[0],
  ].filter(Boolean);
  const status = 0xb0 + variables.channel - 1;
  const tests = [
    ...(layout.identity ? [{ name: 'Universal Identity Request', kind: 'identityRequest', expectedHex: 'F0 7E 7F 06 01 F7' }] : []),
    ...[...new Map(picks.map((p) => [p.id, p])).values()].map((parameter) => {
      const recipe = nrpnOf(parameter);
      const choice = parameter.type === 'choice' ? parameter.choices.at(-1) : null;
      const value = choice ? choice.value : Math.min(parameter.range.max, Math.max(parameter.range.min, 200));
      const bytes = [[0x63, recipe.parameterMsb], [0x62, recipe.parameterLsb], [0x06, value >> 7], [0x26, value & 0x7f]];
      return {
        name: `${parameter.name} = ${choice ? choice.label : value} (NRPN ${recipe.parameterMsb * 128 + recipe.parameterLsb})`,
        parameter: parameter.id,
        value: choice ? choice.id : value,
        expectedHex: bytes.map(([cc, v]) => [status, cc, v].map(hex).join(' ')).join('\n'),
      };
    }),
  ];

  const source = data.source;
  const readOnlyCount = parameters.filter((p) => !p.access.canWrite).length;
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: layout.manufacturer ?? 'Sequential',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{
      type: 'manual',
      title: `${source.title}${source.version ? ` (version ${source.version})` : ''}`,
      notes: `NRPN tables read by tools/profiles/sequential/read-nrpn-tables.mjs from ${source.file}, pages `
        + `${[...new Set(data.tables.flatMap((t) => [t.pages[0], t.pages[1]]))].join('-')} (sha256 ${source.sha256}), ${source.url}. `
        + 'Not yet checked against the instrument itself.',
    }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/sequential/make-profiles.mjs; edit the layout in tools/profiles/sequential/synths/, not this file.',
      'Every parameter is a row of the manual\'s NRPN tables, on its number, with its printed range and name. Nothing here has been sent to a real instrument yet.',
      'Values go out as the manual prints the format: NRPN MSB/LSB on CC 99/98, value MSB/LSB on CC 6/38. The instrument must have its Global MIDI parameter receive set to NRPN (or All).',
      ...(readOnlyCount ? [`${readOnlyCount} parameter(s) the manual marks as transmitted but ignored when received are read-only.`] : []),
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    ...(layout.identity ? {
      identity: { manufacturerId: layout.identity.manufacturerId ?? ['01'], familyCode: layout.identity.familyCode, modelNumber: layout.identity.modelNumber, timeoutMs: 1000, retries: 0 },
    } : {}),
    coverage: {
      singleParameterWrite: 'complete-for-the-manual\'s-nrpn-tables',
      realtimeEditing: 'complete-for-the-manual\'s-nrpn-tables',
      editBufferDumpRequest: 'notImplemented: the manual\'s program dump is not mapped yet',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the front panel sends these same NRPNs when the Global MIDI parameter send is set to NRPN',
      verifiedOnHardware: false,
      ...(layout.coverage ?? {}),
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => (a.parameterMsb * 128 + a.parameterLsb) - (b.parameterMsb * 128 + b.parameterLsb)),
    ...(layout.identity ? {
      requests: [{ id: 'identityRequest', name: 'Identity Request', kind: 'sysex', template: ['F0', '7E', '7F', '06', '01', 'F7'], response: { kind: 'identity' }, timeoutMs: 1000, retries: 0 }],
      startup: { policy: 'pull', syncDirection: 'pull', sync: [{ request: 'identityRequest' }] },
    } : {}),
    parameters,
    tests,
    ...(layout.presets ? { presets: layout.presets } : {}),
  };
}
