// build-dexibell-profile.mjs — a Dexibell MIDI Implementation's transcription (tables/<name>.json) and
// its layout (synths/<name>.mjs) -> a CEditor device profile.
//
// What it takes as settled, from the document's Received data:
//   - a block is its controller; one whose channel line says `default midi ch.14` (the tonewheel
//     organ's) on the variable organChannel, set to that default, the others on the channel variable;
//   - its values: points named one each (`0H = 0, 10H = 1, … 7FH = 8`, `00H = Off, 7FH = On`, `00H=V1,
//     08H=C1, …`) a choice of those values; bands (`0~63= OFF, 64~127= ON`) a choice, a band's first
//     value sent; two numbered ends (`00H = 00, 7FH = 100`) the range shown so; otherwise the `vv=`
//     range (`00H~17H`), shown as the numbers beside it where they are as wide;
//   - left out, and named: the performance controllers (modulation, expression, hold, sostenuto,
//     soft), bank select, and the messages that are not settings.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const PERFORMANCE = new Set([0, 1, 6, 11, 32, 38, 64, 66, 67, 98, 99, 100, 101]);

/** A meanings line -> [{ value, label }]: `0H = 0, 10H = 1`, `00H=V1, 08H=C1`, `0~63= OFF, 64~127= ON`. */
export function pointsOf(line) {
  const out = [];
  for (const part of line.split(/,\s*/)) {
    const m = /^([0-9A-F]+)H\s*=\s*(.+)$/.exec(part.trim()) ?? /^(\d+)~\d+\s*=\s*(.+)$/.exec(part.trim());
    if (!m) return null;
    out.push({ value: /H\s*=/.test(part) ? parseInt(m[1], 16) : Number(m[1]), label: m[2].trim() });
  }
  return out.length >= 2 ? out : null;
}

/** A `vv=` line -> { min, max, shown? }: `00H~7FH (0~127)`, `00H~17H (1~23)`, `00H~40H~7FH (…)`. */
export function rangeOf(line) {
  const m = /([0-9A-F]{2})H~(?:[0-9A-F]{2}H~)?([0-9A-F]{2})H(?:\s*\((-?\d+)~(-?\d+)\))?/.exec(line ?? '');
  if (!m) return null;
  const [min, max] = [parseInt(m[1], 16), parseInt(m[2], 16)];
  const shown = m[3] != null && Number(m[4]) - Number(m[3]) === max - min && (Number(m[3]) !== min || Number(m[4]) !== max) ? { min: Number(m[3]), max: Number(m[4]) } : null;
  const printed = m[3] != null ? `${m[3]}~${m[4]}` : null;
  return { min, max, ...(shown ? { shown } : {}), ...(printed && !shown && (Number(m[3]) !== min || Number(m[4]) !== max) ? { mismatch: printed } : {}) };
}

export function buildDexibellProfile(data, layout) {
  const notes = [];
  const left = [];
  const recipes = new Map();
  const parameters = [];
  const ids = new Set();
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const corrected = [];
  const mismatched = [];
  let organChannel = null;
  for (const b of data.blocks) {
    if (b.controllers.some((c) => PERFORMANCE.has(c)) || !b.values) { left.push(`${b.name} (CC ${b.controllers.join(', ')})`); continue; }
    const organ = /default midi ch\.?\s*(\d+)/.exec(b.channel ?? '');
    if (organ) organChannel ??= Number(organ[1]);
    const channel = organ ? '$organChannel' : '$channel';
    const cc = b.controllers[0];
    const id = `cc${hex(cc)}${organ ? 'organ' : ''}`;
    recipes.set(id, { id, kind: 'cc', channel, controller: cc });
    const group = organ ? (/^(MAIN|UPPER|LOWER|PEDAL)\b/i.exec(b.name)?.[1].replace(/^./, (c) => c.toUpperCase()).replace(/(?<=.)./g, (c) => c.toLowerCase()) ?? 'Organ') : 'General';
    const base = {
      id: unique(`${camel(group)}.${camel(b.name)}`), name: b.name, group, source: { page: b.page },
      description: `Received data (page ${b.page}): ${b.name}, CC ${b.controllers.join(' and ')}${organ ? ` (default channel ${organ[1]})` : ''}; ${b.values}${b.meanings.length ? `; ${b.meanings.join('; ')}` : ''}${b.notes.length ? ` ${b.notes.join(' ')}` : ''}`,
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' }, messageRecipe: id,
    };
    const bands = /(\d+~\d+\s*=\s*\S+(?:,\s*\d+~\d+\s*=\s*\S+)+)/.exec(b.values)?.[1];
    let points = b.meanings.length ? pointsOf(b.meanings.join(', ')) : bands ? pointsOf(bands) : null;
    // `00H = 00, 7FH = 100`: the range's two ends, numbered.
    if (points && points.length === 2 && points.every((p) => /^\d+$/.test(p.label)) && points[0].value === 0 && points[1].value === 127) {
      parameters.push({ ...base, type: 'integer', range: { min: 0, max: 127 }, default: 0, display: { mode: 'number', unit: '', shortLabel: camel(b.name), min: Number(points[0].label), max: Number(points[1].label) }, normalization: { mode: 'linear' }, encoding: { type: 'u7' }, sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true }, ui: { preferredComponent: 'Knob' } });
      continue;
    }
    if (points) {
      // A drawbar's levels, 0 - 8, printed with one level twice and one missing (`50H = 5, 60H = 7,
      // 70H = 7`): the missing level is the twice-printed one's first, which the order shows.
      const numbers = points.map((p) => (/^\d+$/.test(p.label) ? Number(p.label) : null));
      if (numbers.every((n) => n != null) && numbers.length === 9) {
        const missing = Array.from({ length: 9 }, (u, k) => k).filter((k) => !numbers.includes(k));
        const twice = numbers.findIndex((n, k) => numbers.indexOf(n) !== k);
        if (missing.length === 1 && twice > 0 && numbers[twice - 1] === missing[0] + 1) {
          corrected.push({ name: b.name, at: `${hex(points[twice - 1].value)}H`, printed: numbers[twice - 1], also: `${hex(points[twice].value)}H`, to: missing[0] });
          points = points.map((p, k) => (k === twice - 1 ? { ...p, label: String(missing[0]) } : p));
        }
      }
      const seen = new Set();
      const choices = points.map(({ value, label }) => { let cid = camel(label) || `v${value}`; if (/^\d/.test(cid)) cid = `v${cid}`; if (seen.has(cid)) cid = `${cid}${value}`; seen.add(cid); return { id: cid, label, value }; });
      parameters.push({ ...base, type: 'choice', default: choices[0].id, choices, display: { mode: 'choice', shortLabel: camel(b.name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'u7' }, sendPolicy: { mode: choices.length > 6 ? 'continuous' : 'onCommit', coalesce: true }, ui: { preferredComponent: choices.length === 2 ? 'ToggleButton' : choices.length === 9 ? 'Slider' : 'Combobox' } });
      continue;
    }
    const range = rangeOf(b.values);
    if (!range) { left.push(`${b.name} (CC ${cc}, ${b.values})`); continue; }
    if (range.mismatch) mismatched.push(`${b.name} (${hex(range.min)}H~${hex(range.max)}H beside ${range.mismatch})`);
    parameters.push({
      ...base, type: 'integer', range: { min: range.min, max: range.max }, default: range.min,
      display: { mode: 'number', unit: '', shortLabel: camel(b.name), ...(range.shown ? range.shown : {}) }, normalization: { mode: 'linear' }, encoding: { type: 'u7' },
      sendPolicy: range.max - range.min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
      ui: { preferredComponent: range.max - range.min > 16 ? 'Knob' : 'Combobox' },
    });
  }

  const variables = { channel: 1, ...(organChannel ? { organChannel } : {}) };
  const tests = [];
  const status = (ch) => 0xb0 + (ch === '$organChannel' ? variables.organChannel : variables.channel) - 1;
  for (const p of [parameters.find((x) => x.group === 'General'), parameters.find((x) => x.type === 'choice' && x.choices.length === 9), parameters.find((x) => x.type === 'choice' && x.choices.length > 2 && x.choices.length !== 9), parameters.find((x) => x.display.min != null)].filter(Boolean)) {
    const r = recipes.get(p.messageRecipe);
    const [value, wire] = p.type === 'choice' ? [p.choices.at(-1).id, p.choices.at(-1).value] : [p.range.max, p.range.max];
    tests.push({ name: `${p.group} ${p.name} = ${value}`, parameter: p.id, value, expectedHex: [status(r.channel), r.controller, wire].map(hex).join(' ') });
  }

  const doc = data.source;
  notes.push(
    'Generated by tools/profiles/dexibell/make-profiles.mjs; edit the layout in tools/profiles/dexibell/synths/, not this file.',
    `Every parameter is a block of the document's Received data, sent as its controller: the tonewheel organ's on the variable organChannel (its default, ${organChannel ?? 'not printed'}, as each block says), the others on the channel variable. Each is received only when its RX setting is on, as its block's note says. Nothing here has been sent to a real instrument yet.`,
    ...(layout.notes ?? []),
  );
  if (corrected.length) {
    const key = (c) => `${c.at} ${c.printed} ${c.also} ${c.to}`;
    const [c] = corrected;
    notes.push(corrected.every((x) => key(x) === key(c))
      ? `Every drawbar's list of levels (${corrected.length}) prints ${c.at} as "${c.printed}", as it does ${c.also}, and has no level ${c.to}: ${c.at} is read as ${c.to}, the level its place in the order shows (an inference, written down).`
      : `Drawbar lists printing one level twice and another not at all, each read from the order (an inference, written down): ${corrected.map((x) => `${x.name}: ${x.at} printed "${x.printed}", read as ${x.to}`).join('; ')}.`);
  }
  if (mismatched.length) notes.push(`Laid out as the byte range printed, the numbers beside it being of another width: ${mismatched.join('; ')}.`);
  if (left.length) notes.push(`Left out, the performance controllers, bank select and messages that are not settings: ${left.join(', ')}.`);
  return {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Dexibell',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{ type: 'manual', title: doc.title, notes: `The Received data (PDF pages ${doc.pages[0]} - ${doc.pages[1]}), read by tools/profiles/dexibell/read-dexibell-midi.mjs from ${doc.file} (sha256 ${doc.sha256}), ${doc.url}, linked from ${doc.linkedFrom}. Not yet checked against the instrument itself.` }],
    testedWith: [],
    authoringNotes: notes,
    variables,
    coverage: {
      singleParameterWrite: `complete-for-the-Received-data: ${parameters.length} parameters`,
      realtimeEditing: 'complete-for-the-Received-data',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented: the document marks System Exclusive not received',
      bankDump: 'notImplemented',
      inboundControllers: 'the instrument transmits the same controllers when their TX settings are on',
      verifiedOnHardware: false,
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()],
    parameters,
    tests,
  };
}

export { stringifyProfile };
