// build-radikal-profile.mjs — the Delta CEP manual's MIDI controller table (tables/<name>.json) and
// its layout (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the table:
//   - a row is its controller on the channel variable, its range the `Bereich` printed, its default
//     the `Neutral` value where one is printed;
//   - values named in the parameter's text (`VCF Filter Type (0=Multimode, 1=LP24, 2=Analog)`, `FX Type
//     (0:TapeDly, …)`, `Paraphonic OFF/ON1/ON2` over 0-2) are a choice; `(+/- 6 halftones)` over a range
//     of thirteen around its neutral is shown as -6 … +6;
//   - `X MSB` and `X LSB` on the next controller are one 14-bit value, the MSB sent first;
//   - the delay time's two halves stay two parameters: the manual has its 3-bit LSB (CC 90) sent before
//     the coarse value (CC 89), and a pair goes out MSB first.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const GROUPS = { 'LFO->EG': 'LFO', Tap: 'Delay', Cycle: 'Global', Volume: 'Global', Paraphonic: 'Global' };

/** Values named in a parameter's text: `(0=Multimode, 1=LP24)`, `(0:TapeDly, 1:TapDly)` -> [{ value, label }]; `OFF/ON1/ON2` over a range counted from its start. */
export function namedValues(parameter, range) {
  const inside = /\(([^)]*)\)/.exec(parameter)?.[1];
  if (inside) {
    const parts = inside.split(/,\s*/).map((p) => /^(\d+)\s*[=:]\s*(\S.*)$/.exec(p));
    if (parts.length >= 2 && parts.every(Boolean)) return { name: parameter.replace(/\s*\([^)]*\)/, ''), values: parts.map((m) => ({ value: Number(m[1]), label: m[2] })) };
  }
  const slash = /^(.*?)\s+((?:\w+\/)+\w+)$/.exec(parameter);
  if (slash && range && slash[2].split('/').length === range.max - range.min + 1) return { name: slash[1], values: slash[2].split('/').map((label, k) => ({ value: range.min + k, label })) };
  return null;
}

export function buildRadikalProfile(data, layout) {
  const recipes = new Map();
  const parameters = [];
  const access = { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' };
  const continuous = { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true };
  const paired = new Set();
  const halves = [];
  for (const row of data.rows) {
    if (paired.has(row)) continue;
    const m = /^(\d+)-(\d+)$/.exec(row.range ?? '');
    let range = m ? { min: Number(m[1]), max: Number(m[2]) } : null;
    const group = GROUPS[row.parameter.split(' ')[0]] ?? row.parameter.split(' ')[0];
    // Where the table prints it: its row's page (a 14-bit pair's, its MSB row's).
    const base = { group, access, ...(row.page ? { source: { page: row.page } } : {}), description: `CC ${row.cc}: ${row.parameter}; ${row.range ?? 'no range printed'}${row.neutral != null ? `, neutral ${row.neutral}` : ''}.` };
    // `SWARM Tune MSB` and `SWARM Tune LSB` on the next controller: one 14-bit value.
    const msbOf = /^(.*) MSB$/.exec(row.parameter)?.[1];
    const lsb = msbOf && data.rows.find((r) => r.parameter === `${msbOf} LSB` && r.cc === row.cc + 1);
    if (lsb) {
      paired.add(lsb);
      const id = `cc${hex(row.cc)}pair`;
      recipes.set(id, { id, kind: 'cc', channel: '$channel', controller: row.cc, lsbController: lsb.cc, value: '$encodedValue' });
      parameters.push({ ...base, id: `${camel(group)}.${camel(msbOf)}`, name: msbOf, description: `CC ${row.cc} (MSB) and CC ${lsb.cc} (LSB): ${row.parameter} and ${lsb.parameter}, ${row.range} each.`, messageRecipe: id, type: 'integer', range: { min: 0, max: 16383 }, default: 0, display: { mode: 'number', unit: '', shortLabel: camel(msbOf) }, normalization: { mode: 'linear' }, encoding: { type: 'u14-msb-lsb' }, sendPolicy: continuous, ui: { preferredComponent: 'Knob' } });
      continue;
    }
    // The delay time's 3-bit LSB has no range printed: its three bits are 0 - 7.
    if (!range && /lower 3 Bits/.test(row.parameter)) { range = { min: 0, max: 7 }; halves.push(row); }
    if (/higher 7 Bits/.test(row.parameter)) halves.push(row);
    if (!range) throw new Error(`CC ${row.cc}: no range`);
    const id = `cc${hex(row.cc)}`;
    recipes.set(id, { id, kind: 'cc', channel: '$channel', controller: row.cc });
    const named = namedValues(row.parameter, range);
    if (named) {
      const choices = named.values.map(({ value, label }) => ({ id: /^\d/.test(camel(label)) ? `v${camel(label)}` : camel(label), label, value }));
      const def = choices.find((c) => c.value === row.neutral) ?? choices[0];
      parameters.push({ ...base, id: `${camel(group)}.${camel(named.name)}`, name: named.name, messageRecipe: id, type: 'choice', default: def.id, choices, display: { mode: 'choice', shortLabel: camel(named.name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u7' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : 'Combobox' } });
      continue;
    }
    const pm = /\(\+\/- (\d+) [^)]*\)/.exec(row.parameter);
    const shown = pm && row.neutral != null && range.max - row.neutral === Number(pm[1]) && row.neutral - range.min === Number(pm[1]) ? { min: -Number(pm[1]), max: Number(pm[1]) } : null;
    const wide = range.max - range.min > 16;
    parameters.push({
      ...base, id: `${camel(group)}.${camel(row.parameter.replace(/\s*\(.*$/, ''))}`, name: row.parameter.replace(/\s*\(.*$/, ''), messageRecipe: id,
      type: 'integer', range, default: row.neutral ?? range.min, display: { mode: 'number', unit: '', shortLabel: camel(row.parameter), ...(shown ?? {}) },
      normalization: { mode: 'linear' }, encoding: { type: 'u7' }, sendPolicy: wide ? continuous : { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: wide ? 'Knob' : 'Combobox' },
    });
  }

  const sentOf = (p, value) => {
    const r = recipes.get(p.messageRecipe);
    const v = p.type === 'choice' ? p.choices.find((c) => c.id === value).value : value;
    return (r.lsbController != null ? [[r.controller, v >> 7], [r.lsbController, v & 127]] : [[r.controller, v]]).map(([c, x]) => ['B0', hex(c), hex(x)].join(' ')).join('\n');
  };
  const picks = [parameters.find((p) => recipes.get(p.messageRecipe).lsbController != null), parameters.find((p) => p.type === 'choice' && p.choices.length > 3), parameters.find((p) => p.display.min < 0), parameters.find((p) => p.range?.min > 0 && p.display.min == null)].filter(Boolean);
  const tests = picks.map((p) => { const value = p.type === 'choice' ? p.choices.at(-1).id : p.range.max; return { name: `${p.name} = ${value}`, parameter: p.id, value, expectedHex: sentOf(p, value) }; });

  const doc = data.source;
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Radikal Technologies',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `The MIDI controller table (PDF pages ${doc.pages[0]} - ${doc.pages[1]}), read by tools/profiles/radikal/read-radikal-manual.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}, linked from ${doc.linkedFrom}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/radikal/make-profiles.mjs; edit the layout in tools/profiles/radikal/synths/, not this file.',
      'Every parameter is a row of the manual\'s MIDI controller table, sent as its controller on the channel variable, its range the `Bereich` printed and its default the `Neutral` value where one is printed. The Delta must be in Manual mode for the controllers to take effect, the manual says. Nothing here has been sent to a real instrument yet.',
      'Values named in the parameter\'s text (`(0=Multimode, 1=LP24, 2=Analog)`, `OFF/ON1/ON2`) are choices; the swarm\'s tune is one 14-bit value over CC 47 and 48, the MSB sent first.',
      ...(halves.length ? [`The delay time is laid out as its two halves, ${halves.map((r) => `${r.parameter.replace(/\s*\(.*$/, '')} (CC ${r.cc})`).join(' and ')}: the manual has the 3-bit LSB sent before the coarse value, so set the LSB first.`] : []),
      'The filter band (CC 63) is a bit field, as printed: bit 0 LP, bit 1 BP, bit 2 HP. Program changes (0 - 39 the user memories, 64 - 103 the ROM) are not laid out.',
      'The PDF\'s text layer loses the `ff` ligature; `VCF Cuto` is read as VCF Cutoff (the layout names it).',
    ],
    variables: { channel: 1 },
    coverage: {
      singleParameterWrite: `complete-for-the-controller-table: ${parameters.length} parameters`,
      realtimeEditing: 'complete-for-the-controller-table',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented: the manual prints no SysEx',
      bankDump: 'notImplemented',
      inboundControllers: 'the desktop version sends the same controllers from its knobs and buttons; not mapped',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()],
    parameters,
    tests,
  };
}

export { stringifyProfile };
