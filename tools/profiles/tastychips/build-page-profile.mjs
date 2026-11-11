// build-page-profile.mjs — the MIDI table of a Tasty Chips web manual (tables/<name>.json, read by
// twisted/read-twisted-page.mjs) and its layout (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the page:
//   - a `cc` row (or every row, where the table has no kind column) is its controller, the number
//     after the comma where the page gives hex and decimal (`0x49, 73`);
//   - the ST-4's channel column: `chan` is each track's channel (1 - 4), `glob` channel 5, which the
//     page calls all tracks; `chan + glob` both, a parameter for each;
//   - a value printed as a range is that range, shown as what the page maps it to (`0..127 → -64..+63`,
//     `0=0.0s .. 127=4.0s`); a description is kept in the parameter's;
//   - left out, and named: messages that are not settings (pitch bend, program change, the beat
//     clock) and actions (`record sample`).

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');

/** `0..127 → -64..+63` -> { min: 0, max: 127, shown: { min: -64, max: 63 } }; `0=0.0s .. 127=4.0s` -> shown 0 .. 4, unit s. */
export function valueOf(text) {
  const t = String(text ?? '').trim();
  const mapped = /^(\d+)\.\.(\d+)\s*→\s*([-+]?\d+)\.\.([-+]?\d+)$/.exec(t);
  if (mapped) return { min: Number(mapped[1]), max: Number(mapped[2]), shown: { min: Number(mapped[3]), max: Number(mapped[4]) } };
  const ends = /^(\d+)\s*=\s*([-+]?\d+(?:\.\d+)?)\s*([a-z]*)\s*\.\.\s*(\d+)\s*=\s*([-+]?\d+(?:\.\d+)?)\s*([a-z]*)$/.exec(t);
  if (ends && ends[3] === ends[6]) return { min: Number(ends[1]), max: Number(ends[4]), shown: { min: Number(ends[2]), max: Number(ends[5]) }, unit: ends[3] };
  const span = /^(\d+)\.\.(\d+)$/.exec(t);
  if (span) return { min: Number(span[1]), max: Number(span[2]) };
  return null;
}

export function buildPageProfile(data, layout) {
  const cols = data.columns.map((c) => c.toLowerCase());
  const at = (re) => cols.findIndex((c) => re.test(c));
  const kindAt = at(/^midi command$/);
  const nameAt = at(/^description$|command$/) === kindAt ? at(/^description$/) : at(/^description$|command$/);
  const ccAt = at(/cc|control number/);
  const valueAt = at(/^value/);
  const scopeAt = at(/channel\/global/);
  const recipes = new Map();
  const parameters = [];
  const left = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const seen = new Map();
  const twice = [];
  for (const row of data.rows) {
    const kind = kindAt >= 0 ? row[kindAt] : 'cc';
    // A name marked for the page's footnote (`ADSR decay time*`, "*) Firmware 1.2 onwards").
    const marked = /\*$/.test(row[nameAt] ?? '');
    const name = (row[nameAt] || row[kindAt]).replace(/\*$/, '');
    const cc = /(?:^|,\s*)(\d+)$/.exec(row[ccAt] ?? '')?.[1];
    if (kind !== 'cc' || cc == null) { left.push(kindAt >= 0 && row[kindAt] !== name ? `${row[kindAt]} ${name}` : name); continue; }
    if (seen.has(cc)) twice.push(`CC ${cc} (${seen.get(cc)}, ${name})`);
    seen.set(cc, name);
    if (layout.actions?.test(name)) { left.push(`${name} (CC ${cc})`); continue; }
    const value = valueOf(row[valueAt]) ?? { min: 0, max: 127 };
    const scope = scopeAt >= 0 ? row[scopeAt] : null;
    const targets = scope
      ? [...(/chan/.test(scope) ? layout.tracks.map((t) => ({ label: t.label, channel: t.channel })) : []), ...(/glob/.test(scope) ? [{ label: layout.all.label, channel: layout.all.channel }] : [])]
      : [{ label: null, channel: '$channel' }];
    for (const target of targets) {
      const id = `cc${hex(Number(cc))}${target.channel === '$channel' ? '' : `ch${target.channel}`}`;
      recipes.set(id, { id, kind: 'cc', channel: target.channel, controller: Number(cc) });
      const group = target.label ?? 'Controls';
      const wide = value.max - value.min > 16;
      parameters.push({
        id: unique(`${camel(group)}.${camel(name)}`), name: target.label ? `${target.label} ${name}` : name, group,
        description: `CC ${cc}${target.channel === '$channel' ? '' : `, channel ${target.channel}`}: ${name}; ${row[valueAt] || 'no value printed'}${scope ? ` (${scope})` : ''}${marked && layout.footnote ? `; ${layout.footnote}` : ''}.`,
        access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: id,
        type: 'integer', range: { min: value.min, max: value.max }, default: value.min,
        display: { mode: 'number', unit: value.unit ?? '', shortLabel: camel(name), ...(value.shown ?? {}) }, normalization: { mode: 'linear' }, encoding: { type: 'u7' },
        sendPolicy: wide ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
        ui: { preferredComponent: wide ? 'Knob' : 'Combobox' },
      });
    }
  }
  const variables = { channel: layout.defaultChannel ?? 1 };
  const statusOf = (r) => 0xb0 + (r.channel === '$channel' ? variables.channel : r.channel) - 1;
  const picks = [parameters[0], parameters.find((p) => p.display.min != null && p.display.min < 0), parameters.find((p) => recipes.get(p.messageRecipe).channel === layout.all?.channel)].filter((p, k, a) => p && a.indexOf(p) === k);
  const tests = picks.map((p) => { const r = recipes.get(p.messageRecipe); return { name: `${p.name} = ${p.range.max}`, parameter: p.id, value: p.range.max, expectedHex: [statusOf(r), r.controller, p.range.max].map(hex).join(' ') }; });

  const doc = data.source;
  const notes = [
    'Generated by tools/profiles/tastychips/make-profiles.mjs; edit the layout in tools/profiles/tastychips/synths/, not this file.',
    `Every parameter is a row of the page's ${layout.table} table, sent as its controller${layout.tracks ? ': a `chan` row on each track\'s channel (1 - 4), a `glob` row on channel 5, which the page calls all tracks, a `chan + glob` row on both. The page does not say on which channel a command that is only global is to be sent; it goes on channel 5' : ', on the channel variable'}. The page is a live one, saved on ${doc.saved}; one fetched another day may read otherwise. Nothing here has been sent to a real instrument yet.`,
    ...(twice.length ? [`The page gives one controller to two rows: ${twice.join('; ')}. The first is laid out; the second is an action and is left out.`] : []),
    ...(left.length ? [`Left out, and named: ${left.join(', ')}.`] : []),
    ...(layout.notes ?? []),
  ];
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Tasty Chips',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `The ${layout.table} table of ${doc.url} (saved ${doc.saved} as ${doc.file}, sha256 ${doc.sha256}), linked from ${doc.linkedFrom}, read by tools/profiles/twisted/read-twisted-page.mjs. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: notes,
    variables,
    coverage: {
      singleParameterWrite: `complete-for-the-page's-table: ${parameters.length} parameters`,
      realtimeEditing: 'complete-for-the-page\'s-table',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented: the page prints no dump',
      bankDump: 'notImplemented',
      inboundControllers: layout.inbound,
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()],
    parameters,
    tests,
  };
}

export { stringifyProfile };
