// build-modor-profile.mjs — a Modor manual's MIDI chapter (tables/<name>.json) and its layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the manual:
//   - a row the controller list marks Received is its controller, sent 0 - 127 on the channel
//     variable: the manual gives the panel's ranges ([0,127], [-64,+63], [-32,+31]) but not how a
//     controller's value maps onto them; its remarks and footnotes go in its description;
//   - the NF-1's formant controllers carry the preset vowels' values the manual prints (§4.4);
//   - the DR-2's NRPNs (MSB the drum, LSB the parameter, the value on CC 6) for the parameters the
//     list gives no controller, which is what the manual says they are for; the layout names the
//     ones it does;
//   - left out, and named: the performance controllers (mod wheel, breath, CC 3, expression, sustain),
//     MIDI's own (bank select, data entry, NRPN selection, all notes off), and rows not received.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const PERFORMANCE = /^(?:Modulation wheel|Breath Controller|Modulation CC3|Expression Pedal|Sustain pedal)\b/;
const MIDI_OWN = /^(?:Bank [Ss]elect|All notes off|NRPN\b)/;

/** A row's group, from its name: `Drum C Pan` -> Drum C, `Osc 2 fine tuning` -> Osc 2, `ENV 3 T1` -> ENV 3. */
export function groupOf(name, other = 'Patch') {
  const m = /^(Drum [A-F]|Osc \d|ENV \d|Vowel \d|Wire|Comb filter|Delay|Filter|Formant|LFO|S&H|Pitch)\b/.exec(name);
  if (!m) return other;
  return { Wire: 'Modulation wires', LFO: 'LFOs', 'S&H': 'LFOs' }[m[1]] ?? m[1];
}

export function buildModorProfile(data, layout) {
  const recipes = new Map();
  const parameters = [];
  const left = { performance: [], own: [], unreceived: [] };
  const access = { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' };
  const shape = { type: 'integer', range: { min: 0, max: 127 }, default: 0, normalization: { mode: 'linear' }, encoding: { type: 'u7' }, sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true }, ui: { preferredComponent: 'Knob' } };
  // The preset vowels on each formant controller: `Vowel 2 formant 3` is CC 112, `Vowel 1 volume` CC 41.
  const vowelsOn = new Map();
  for (const r of data.formants?.rows ?? []) r.controllers.forEach((cc) => vowelsOn.set(cc, data.formants.vowels.map((v, k) => `${v} ${r.values[k]}`).join(', ')));
  for (const row of data.rows) {
    if (!row.name) continue;
    const label = `${row.name} (CC ${row.cc})`;
    if (!row.received) { left.unreceived.push(label); continue; }
    if (PERFORMANCE.test(row.name)) { left.performance.push(label); continue; }
    if (MIDI_OWN.test(row.name)) { left.own.push(label); continue; }
    const id = `cc${hex(row.cc)}`;
    recipes.set(id, { id, kind: 'cc', channel: '$channel', controller: row.cc });
    const group = groupOf(row.name, layout.otherGroup);
    const extra = [row.remarks, ...row.notes, vowelsOn.has(row.cc) ? `the preset vowels (§4.4): ${vowelsOn.get(row.cc)}` : ''].filter(Boolean).join('; ');
    parameters.push({
      id: `${camel(group)}.${camel(row.name.replace(/^Drum [A-F] /, ''))}`, name: row.name, group,
      description: `CC ${row.cc} (page ${row.page}): ${row.name}${extra ? `; ${extra}` : ''}.${row.transmitted ? ' Also transmitted.' : ''}`,
      access, messageRecipe: id, ...shape, display: { mode: 'number', unit: '', shortLabel: camel(row.name) },
    });
  }

  // The DR-2's NRPNs: each drum's parameters the list gives no controller.
  const named = [];
  for (const { msb, instrument } of data.nrpn?.instruments ?? []) {
    for (const { lsb, name } of data.nrpn.parameters) {
      if (layout.alsoControllers?.[lsb]) {
        if (msb === 0) named.push(`${lsb} ${name} (${layout.alsoControllers[lsb]})`);
        continue;
      }
      const id = `nrpn${hex(msb)}${hex(lsb)}`;
      recipes.set(id, { id, kind: 'nrpn', channel: '$channel', parameterMsb: msb, parameterLsb: lsb, valueResolution: 7, value: '$encodedValue' });
      const group = `Drum ${instrument}`;
      parameters.push({
        id: `${camel(group)}.${camel(name)}`, name: `Drum ${instrument} ${name}`, group,
        description: `NRPN ${msb}/${lsb} (MSB the drum, LSB the parameter; §7.4): Drum ${instrument} ${name}. The manual gives no range: sent 0 - 127 on data entry (CC 6).`,
        access, messageRecipe: id, ...shape, display: { mode: 'number', unit: '', shortLabel: camel(name) },
      });
    }
  }

  const sentOf = (p, v) => {
    const r = recipes.get(p.messageRecipe);
    return r.kind === 'cc' ? ['B0', hex(r.controller), hex(v)].join(' ') : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, v]].map(([c, x]) => ['B0', hex(c), hex(x)].join(' ')).join('\n');
  };
  const picks = [parameters[0], parameters.find((p) => /preset vowels/.test(p.description)), parameters.find((p) => recipes.get(p.messageRecipe).kind === 'nrpn')].filter(Boolean);
  const tests = picks.map((p) => ({ name: `${p.name} = 100`, parameter: p.id, value: 100, expectedHex: sentOf(p, 100) }));

  const doc = data.source;
  const notes = [
    'Generated by tools/profiles/modor/make-profiles.mjs; edit the layout in tools/profiles/modor/synths/, not this file.',
    `Every parameter is a row of the manual's MIDI controller list that it marks Received, sent as its controller on the channel variable${data.nrpn ? ', and each drum\'s parameters the list gives no controller as their NRPN (MSB the drum, LSB the parameter, the value on CC 6), which is what the manual says its NRPNs are for' : ''}. Nothing here has been sent to a real instrument yet.`,
    'Each is sent 0 - 127: the manual gives the panel\'s ranges (`[0,127]`, `[-64,+63]`, coarse tuning `[-32,+31]`) but not how a controller\'s value maps onto them.',
    ...(named.length ? [`The NRPNs that set what a drum's controller sets are not laid out a second time: ${named.join(', ')}.`] : []),
    ...(data.nrpn ? ['The X, Y, Z and T parameters mean what the drum\'s model makes them (§3.1); the profile names them as the list does.'] : []),
    `Left out, and named: ${[['the performance controllers', left.performance], ["MIDI's own", left.own], ['the rows the list prints as not received', left.unreceived]].filter(([, l]) => l.length).map(([what, l]) => `${what}, ${l.join(', ')}`).join('; ')}.`,
    ...(layout.notes ?? []),
  ];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Modor',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `The MIDI controller list (PDF pages ${doc.pages[0]} - ${doc.pages[1]})${data.formants ? ' and the formant table' : ''}${data.nrpn ? ' and the NRPN table' : ''}, read by tools/profiles/modor/read-modor-manual.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}, linked from ${doc.linkedFrom}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: notes,
    variables: { channel: 1 },
    coverage: {
      singleParameterWrite: `complete-for-the-controller-list: ${parameters.length} parameters`,
      realtimeEditing: 'complete-for-the-controller-list',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented: the manual describes SysEx dumps without their format',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument sends the controllers the list marks Transmitted when its knobs turn; not mapped',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()],
    parameters,
    tests,
  };
}

export { stringifyProfile };
