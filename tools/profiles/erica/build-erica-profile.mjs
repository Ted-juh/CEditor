// build-erica-profile.mjs — an Erica Synths transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the chart:
//   - a cell of the voice matrix (the PĒRKONS) is that voice's parameter, the controller printed in
//     it; a row of the function lists (the LXR-02) is its controller or its NRPN (CC 99 the number's
//     coarse half, CC 98 its fine, the value on CC 6, as the list's own rows for them say);
//   - the group is the voice (`Voice 1` …), `All voices` for `all`, the effects or Global for `-`;
//   - no chart prints values: each is 0 - 127, the switches among them, and the profile says what the
//     manual says each switch selects;
//   - a row whose function is `-` is a number the instrument does not use, and is left out; so are
//     the NRPN controllers themselves (CC 6, 98, 99), which the NRPN parameters send.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

/** A transcription's rows -> [{ kind, number, name, voice }], whichever shape the chart has. */
export function rowsOf(data) {
  return data.rows.map((r) => (r.kind ? r : { kind: 'cc', number: r.cc, name: r.name, voice: String(r.voice) }));
}

export const groupOf = (r) => (/^\d+$/.test(r.voice) ? `Voice ${r.voice}` : r.voice === 'all' ? 'All voices' : /^FX\b/.test(r.name) ? 'FX' : 'Global');

export function buildEricaProfile(data, layout) {
  const notes = [];
  const unused = [];
  const nrpnControllers = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const recipes = new Map();
  const parameters = [];
  for (const r of rowsOf(data)) {
    const label = r.kind === 'cc' ? `CC ${r.number}` : `NRPN ${r.number}`;
    if (!r.name || r.name === '-') { unused.push(label); continue; }
    if (r.kind === 'cc' && /^NRPN\b/.test(r.name)) { nrpnControllers.push(`${label} ${r.name}`); continue; }
    const group = groupOf(r);
    const recipe = r.kind === 'cc'
      ? { id: `cc${r.number}`, kind: 'cc', channel: '$channel', controller: r.number, value: '$encodedValue' }
      : { id: `nrpn${hex(r.number >> 7)}${hex(r.number & 127)}`, kind: 'nrpn', channel: '$channel', parameterMsb: r.number >> 7, parameterLsb: r.number & 127, valueResolution: 7, value: '$encodedValue' };
    if (recipes.has(recipe.id)) throw new Error(`${layout.id}: ${label} twice`);
    recipes.set(recipe.id, recipe);
    const switched = layout.switches?.[r.name];
    const describe = [`${label}${r.voice ? `, voice ${r.voice}` : ''}.`];
    if (switched) describe.push(`A switch: ${switched}. The chart prints no values for it.`);
    parameters.push({
      id: unique(`${camel(group)}.${camel(r.name.toLowerCase())}`),
      name: r.name,
      group,
      description: describe.join(' '),
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipe.id,
      type: 'integer',
      range: { min: 0, max: 127 },
      default: 0,
      display: { mode: 'number', unit: '', shortLabel: camel(r.name.toLowerCase()) },
      normalization: { mode: 'linear' },
      encoding: { type: 'u7' },
      sendPolicy: switched ? { mode: 'onCommit', coalesce: true } : { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true },
      ui: { preferredComponent: switched ? 'Knob' : /level|volume|send|decay|attack|amount/i.test(r.name) ? 'Slider' : 'Knob' },
    });
  }
  if (nrpnControllers.length) notes.push(`Left out, the controllers the NRPN parameters are sent with: ${nrpnControllers.join(', ')}.`);
  if (unused.length) notes.push(`Numbers the chart lists with no function (\`-\`), left out: ${unused.join(', ')}.`);

  const variables = { channel: 1 };
  const picks = [...new Set([parameters[0], parameters.find((p) => recipes.get(p.messageRecipe).kind === 'nrpn'), parameters.at(-1)].filter(Boolean))];
  const tests = picks.map((p) => {
    const r = recipes.get(p.messageRecipe);
    const lines = r.kind === 'cc' ? [[r.controller, 100]] : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, 100]];
    return { name: `${p.group} ${p.name} = 100 (${r.kind === 'cc' ? `CC ${r.controller}` : `NRPN ${r.parameterMsb * 128 + r.parameterLsb}`})`, parameter: p.id, value: 100, expectedHex: lines.map(([c, v]) => [0xb0, c, v].map(hex).join(' ')).join('\n') };
  });
  const doc = data.sources[0];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Erica Synths',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `MIDI chart (page${layout.pages.length > 1 ? 's' : ''} ${layout.pages.join(', ')} of the PDF) read by tools/profiles/erica/import-erica.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/erica/make-profiles.mjs; edit the layout in tools/profiles/erica/synths/, not this file.',
      'Every parameter is a controller of the manual\'s MIDI chart, with the name it prints, grouped by the voice it belongs to. The chart prints no values: each is 0 - 127. Nothing here has been sent to a real instrument yet.',
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-MIDI-chart',
      realtimeEditing: 'complete-for-the-MIDI-chart',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: layout.inbound ?? 'not printed in the manual',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.kind.localeCompare(b.kind) || (a.controller ?? a.parameterLsb + a.parameterMsb * 128) - (b.controller ?? b.parameterLsb + b.parameterMsb * 128)),
    parameters,
    tests,
  };
}

export { stringifyProfile };
