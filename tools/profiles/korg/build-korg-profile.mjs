// build-korg-profile.mjs — a Korg MIDI Implementation's transcription (tables/<name>.json) and a
// layout (synths/<name>.mjs) -> a CEditor device profile.
//
// What the document says, and nothing it does not:
//
//   - every control change the instrument RECOGNISES (its 2-1 table) is a parameter on that CC,
//     named as printed; one it only transmits is kept read-only, so a panel can follow it;
//   - a control change is a choice only where the document names its values: the footnote of the
//     receive table gives each label a range (`vv:0~42,43~85,86~127 = CUTOFF, PITCH2, PITCH`), the
//     transmit table the value the instrument sends for it (`0,64,127`). The value sent is the one
//     the instrument itself sends, and only when it falls in the receive table's range for the same
//     label; where the two tables disagree, or a list depends on another setting ("When MOD FX TYPE
//     is CHORUS"), the controller is a number and both readings go in its description;
//   - every NRPN with a printed range is a parameter, its value on CC 6; a value wider than 7 bits
//     goes as the document prints the format, its low bits first on their own controller (CC 63);
//   - a list the document prints for a value (`*3-5 (VOICE MODE)`, `*note P6`) makes it a choice
//     only when it names every value of the range, one each;
//   - where the document leaves the panel's control changes assignable and the Owner's Manual numbers
//     them (the microKORG), those are parameters too (build-korg-knobs.mjs).
//
// The layout says what the document cannot: groups, what to leave out and why, and corrections,
// each with its reason, which go into the profile's notes.

import { camel } from '../roland/build-profile.mjs';
import { addPull } from './build-korg-dump.mjs';
import { addParameterChange, parameterChangeVectors } from './build-korg-sysex.mjs';
import { readHexValue } from './build-korg-hex.mjs';
import { knobControllers } from './build-korg-knobs.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const slug = (label) => label.toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';
const norm = (s) => String(s).toUpperCase().replace(/\s+/g, ' ').trim();

/** Controllers that are plumbing, not parameters, known by the name the document prints for them. */
const PLUMBING = [
  [/^Bank Select\b/i, 'Bank Select, part of preset recall'],
  [/^Data Entry\b/i, 'Data Entry, part of the NRPN messages'],
  [/^N?RPN\s*\((?:MSB|LSB)\)|^N?RPN (?:MSB|LSB)$|^(?:Non-)?Registered Parameter/i, 'an NRPN or RPN selector, part of the NRPN messages'],
  [/^LSB VALUE$/i, 'the low bits of a value wider than 7 bits, sent before it'],
  [/^(All Sound Off|All Notes? Off|Reset All Controllers|Local (?:Sw|Control|On\/Off)|Omni|Mono|Poly)\b/i, 'a channel mode message'],
];

const MARK = /\*(\d+-\d+|\d+)(?![\d-])/g;
const NOTE_MARK = /\*note\s+([A-Z]\d+)/gi;

/** `AMP EG ATTACK (vv=0~127)  *5-2*5-4` -> name, the printed values, the explanation, the marks. */
export function splitDescription(desc) {
  const marks = [...String(desc).matchAll(MARK)].map((m) => m[1]);
  // `Expression   ( CONTROL Pedal )` -> `Expression (CONTROL Pedal)`.
  const text = String(desc).replace(NOTE_MARK, '').replace(MARK, '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  let m = /^(.*?)\s*\((?:([^()]*?),\s*)?v{1,2}=:?\s*([^()]*)\)\s*(.*)$/.exec(text);
  if (m) return { name: m[1].trim(), explanation: [m[2], m[4]].filter(Boolean).join('; ') || null, values: m[3].trim(), marks };
  m = /^(.*?)\s+v{1,2}=(\S+)\s*(.*)$/.exec(text);
  if (m) return { name: m[1].trim(), explanation: m[3] || null, values: m[2], marks };
  return { name: text, explanation: null, values: null, marks };
}

/** `0~127` -> {min, max}; `0,64,127` -> {list}; `0` -> {min: 0, max: 0}. */
export function parseValues(spec) {
  const s = String(spec ?? '').replace(/\s+/g, '');
  let m = /^(-?\d+)[~-](-?\d+)$/.exec(s);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  if (/^\d+(,\d+)+$/.test(s)) return { list: s.split(',').map(Number) };
  m = /^(\d+)$/.exec(s);
  if (m) return { min: Number(m[1]), max: Number(m[1]) };
  return null;
}

/** A receive footnote: `vv:0~42,43~85,86~127 = EG TARGET:CUTOFF, PITCH2, PITCH` -> [{from, to, label}]. */
export function receivedLabels(text) {
  if (!text || /\bWhen\b/i.test(text)) return null;
  // The older documents (the first volcas): a title, then one range a line in hex and decimal,
  // `00 (00) ~ 0C (12)  : POLY`.
  const lined = [...text.matchAll(/([0-9A-F]{2})\s*\(\s*(\d+)\s*\)\s*~\s*([0-9A-F]{2})\s*\(\s*(\d+)\s*\)\s*:\s*(.+?)(?=\s+[0-9A-F]{2}\s*\(\s*\d+\s*\)\s*~|\s*$)/gi)];
  if (lined.length >= 2) {
    // Each bound is printed twice, in hex and in decimal, and a document can disagree with itself
    // (the volca fm2's ARP TYPE prints `40 (58)`). A label is given the values both readings agree
    // on, and the disagreement is kept on the entry.
    const out = lined.map((x) => {
      const [hexFrom, hexTo, decFrom, decTo] = [Number.parseInt(x[1], 16), Number.parseInt(x[3], 16), Number(x[2]), Number(x[4])];
      const entry = { from: Math.max(hexFrom, decFrom), to: Math.min(hexTo, decTo), label: x[5].trim() };
      if (hexFrom !== decFrom || hexTo !== decTo) entry.printed = `${x[1]} (${x[2]}) ~ ${x[3]} (${x[4]})`;
      return entry;
    });
    if (out.some((e) => e.from > e.to)) return null;
    // `00 (00) ~ 07 (07) : -63,-63,-62,…` is a table of what the display shows, not names.
    return out.some((e) => /^[-+\d\s,~]+$/.test(e.label)) ? null : out;
  }
  // Names first, then their ranges (the NTS-1 mkII): `EG TYPE:ADSR, AHR, AR = vv:0~24,25~49,50~127`.
  const named = /^(?:[^:=]*:)?\s*([^=]+?)\s*=\s*vv\s*:\s*([\d~,\s]+)$/.exec(text);
  if (named && /~/.test(named[2]) && named[2].includes(',')) {
    const ranges = named[2].split(',').map((r) => r.trim()).filter(Boolean).map((r) => r.split('~').map((x) => Number(x.trim())));
    const labels = named[1].split(',').map((l) => l.trim()).filter(Boolean);
    if (labels.length === ranges.length && ranges.every((r) => r.length === 2)) return ranges.map(([from, to], i) => ({ from, to, label: labels[i] }));
  }
  const m = /^\s*vv\s*:\s*([\d~,\s]+?)\s*=\s*(.+)$/.exec(text);
  if (!m) return null;
  // `vv:0~64~127 = -12note~0~+12note` is a scale, not a list of values.
  if (/\d\s*~\s*\d+\s*~/.test(m[1]) || !m[1].includes(',')) return null;
  const ranges = m[1].split(',').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [a, b] = r.split('~').map((x) => Number(x.trim()));
    return [a, Number.isFinite(b) ? b : a];
  });
  let rest = m[2].trim();
  const colon = rest.indexOf(':');
  if (colon >= 0 && (rest.indexOf(',') < 0 || colon < rest.indexOf(','))) rest = rest.slice(colon + 1);
  const labels = rest.split(',').map((l) => l.trim()).filter(Boolean);
  if (labels.length !== ranges.length) return { mismatch: true, ranges, labels };
  return ranges.map(([from, to], i) => ({ from, to, label: labels[i] }));
}

/** A transmit footnote: `EG TARGET:CUTOFF, PITCH2, PITCH = vv:0,64,127` -> [{value, label}]. */
export function transmittedLabels(text, rowValues) {
  if (!text || /\bWhen\b/i.test(text)) return null;
  const m = /^(.*?)(?:=\s*vv\s*:\s*([\d,\s]+))?\s*$/.exec(text);
  let labelsText = m[1].trim();
  const colon = labelsText.indexOf(':');
  if (colon >= 0) labelsText = labelsText.slice(colon + 1);
  const labels = labelsText.split(',').map((l) => l.trim()).filter(Boolean);
  const values = m[2] ? m[2].split(',').map((v) => Number(v.trim())) : rowValues;
  if (!values || values.length !== labels.length) return null;
  return labels.map((label, i) => ({ value: values[i], label }));
}

/**
 * A footnote that prints both directions (the PS-3300's `*1 : OFF-ON / TRANSMIT 0,127 = OFF, ON /
 * RECEIVE 0~63,64~127 = OFF, ON`) -> the values sent and the ranges received, or null.
 */
export function transmitReceive(text) {
  const m = /TRANSMIT\s+([\d,\s]+?)\s*=\s*(.+?)\s+RECEIVE\s+([\d~,\s]+?)\s*=\s*(.+?)\s*$/.exec(text ?? '');
  if (!m) return null;
  const names = (x) => x.split(',').map((l) => l.trim()).filter(Boolean);
  const [sentValues, sentNames, ranges, receivedNames] = [m[1].split(',').map(Number), names(m[2]), m[3].split(',').map((r) => r.split('~').map(Number)), names(m[4])];
  if (sentValues.length !== sentNames.length || ranges.length !== receivedNames.length) return null;
  return {
    sent: sentValues.map((value, i) => ({ value, label: sentNames[i] })),
    received: ranges.map(([from, to = from], i) => ({ from, to, label: receivedNames[i] })),
  };
}

/** `00:Slow, 7F:Fast`, `00:Organ, 01:Key/Layer, 02:EQ` (the VOX Continental) -> [{value, label}], hex values. */
export function hexPairs(text) {
  const parts = String(text ?? '').trim().split(/\s*,\s*(?=[0-9A-F]{2}\s*:)/i);
  const out = parts.map((p) => /^([0-9A-F]{2})\s*:\s*(.+)$/i.exec(p)).map((m) => (m ? { value: Number.parseInt(m[1], 16), label: m[2].trim() } : null));
  return out.length >= 2 && out.every(Boolean) ? out : null;
}

/** `0,1 = Off,On`, `0~4  *3-5`, `0~200 = -100%~+100% *3-2`, `ASCII *note P1` -> what an NRPN value cell says. */
export function parseNrpnValue(cell) {
  const marks = [...String(cell).matchAll(/\*(\d+(?:-\d+)?)\b/g)].map((m) => m[1]);
  const notes = [...String(cell).matchAll(NOTE_MARK)].map((m) => m[1].toUpperCase());
  const text = String(cell).replace(NOTE_MARK, '').replace(/\*(\d+(?:-\d+)?)\b/g, '').trim();
  const [spec, shown] = text.split('=').map((x) => x?.trim());
  return { values: parseValues(spec), ascii: /^ASCII\b/i.test(spec ?? ''), shown: shown ?? null, marks, notes };
}

/** `BAND[1] LEVEL` -> `Band 1 Level`: a name printed in capitals, as words. */
const ACRONYMS = new Set(['OSC', 'LFO', 'EG', 'FX', 'HPF', 'LPF', 'BPF', 'MIDI', 'DWGS', 'KBD', 'CC', 'FC']);
export function printedName(text) {
  return String(text).trim().replace(/\[(\d+)\]/g, ' $1').replace(/\s+/g, ' ')
    .replace(/\b([A-Z]{2,})\b/g, (w) => (ACRONYMS.has(w) ? w : `${w[0]}${w.slice(1).toLowerCase()}`));
}

function groupOf(name, groups) {
  for (const [group, pattern] of groups ?? []) {
    const m = pattern.exec(name);
    if (m) return { group, leaf: m.index === 0 && name.slice(m[0].length).trim() ? name.slice(m[0].length).trim() : name };
  }
  return { group: 'Program', leaf: name };
}

function preferredComponent(name, choices) {
  if (choices) return choices.length === 2 ? 'ToggleButton' : choices.length <= 5 ? 'RadioButtonGroup' : 'Combobox';
  return /\b(ATTACK|DECAY|SUSTAIN|RELEASE|LEVEL|DEPTH|VOLUME|INT|DRY WET|TIME)\b/i.test(name) ? 'Slider' : 'Knob';
}

/** The low-bits controller and count a data-entry footnote describes: "the lower 3 bits are first expected via a CC #63". */
function lowBitsOf(text) {
  const m = /lower\s+(\d+)\s+bits\s+are\s+first\s+(?:expected|sent)\s+via\s+a\s+CC\s*#\s*(\d+)/i.exec(text ?? '');
  return m ? { lowBits: Number(m[1]), lowBitsController: Number(m[2]) } : null;
}

export function buildKorgProfile(data, layout) {
  const notes = [];
  const parameters = [];
  const recipes = new Map();
  const ids = new Set();
  const marks = { ...data.marks, ...(layout.marks ?? {}) };
  // A footnote corrected where the document's own text shows the slip, with the reason.
  for (const [mark, fix] of Object.entries(layout.markFixes ?? {})) {
    if (!marks[mark]?.includes(fix.printed)) throw new Error(`${layout.id}: footnote *${mark} no longer prints "${fix.printed}"`);
    marks[mark] = marks[mark].replace(fix.printed, fix.read);
    notes.push(`Footnote *${mark} prints "${fix.printed}"; read as "${fix.read}": ${fix.why}`);
  }
  const omitFor = (cc, name) => layout.omit?.[cc] ?? PLUMBING.find(([pattern]) => pattern.test(name))?.[1] ?? null;
  const unique = (id, suffix) => {
    let out = ids.has(id) ? `${id}${suffix}` : id;
    for (let n = 2; ids.has(out); n++) out = `${id}${suffix}_${n}`;   // NRPN 04 20H and 05 20H both end in 20
    ids.add(out);
    return out;
  };
  const choiceList = (entries) => {
    const used = new Set();
    return entries.map(({ value, label }) => {
      const base = slug(label);
      const id = used.has(base) ? `${base}_${value}` : base;
      used.add(id);
      return { id, label, value };
    });
  };
  const numberParameter = (base, min, max, encoding) => ({
    ...base,
    type: 'integer',
    range: { min, max },
    default: min,
    display: { mode: 'number', unit: '', shortLabel: base.shortLabel },
    normalization: { mode: 'linear' },
    encoding: { type: encoding },
    sendPolicy: max - min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
    ui: { preferredComponent: preferredComponent(base.name, null) },
  });
  // Centred on 64 and shown as -63 ~ +63 (`00,01~40~7F:-63,-63~0~63`): 1 - 127, 64 the default.
  const bipolarParameter = (base, read) => ({
    ...numberParameter(base, read.min, read.max, 'u7'),
    type: 'bipolar',
    default: Math.round((read.min + read.max) / 2),
    display: { mode: 'number', unit: '', shortLabel: base.shortLabel, min: read.displayMin, max: read.displayMax },
  });
  const choiceParameter = (base, choices) => ({
    ...base,
    type: 'choice',
    default: choices[0].id,
    choices,
    display: { mode: 'choice', shortLabel: base.shortLabel },
    normalization: { mode: 'choiceIndex' },
    encoding: { type: 'enum' },
    sendPolicy: { mode: 'onCommit', coalesce: true },
    ui: { preferredComponent: preferredComponent(base.name, choices) },
  });
  const push = (p) => {
    const { shortLabel, ...rest } = p;
    parameters.push(rest);
    return rest;
  };

  // ------------------------------------------------------------ control changes
  const sent = new Map(data.transmitted.map((row) => [row.cc, row]));
  const heard = new Map(data.received.map((row) => [row.cc, row]));
  const omitted = new Map();
  const wideControllers = [];
  const coarsePairs = [];
  for (const cc of [...new Set([...heard.keys(), ...sent.keys()])].sort((a, b) => a - b)) {
    const rx = heard.get(cc);
    const tx = sent.get(cc);
    const row = rx ?? tx;
    const printed = splitDescription(row.desc);
    const why = omitFor(cc, printed.name);
    if (why) {
      omitted.set(why, [...(omitted.get(why) ?? []), cc]);
      continue;
    }
    // MSB/LSB pairs named alike (the NTS-1 mkII's EG ATTACK on 16 and 48): the coarse controller is
    // the parameter, and the fine one is left out, since the document does not say how many of its
    // bits count.
    const pairName = layout.coarseOfPairs ? /^(.*?)\s*\((MSB|LSB)\)$/i.exec(printed.name) : null;
    const partner = pairName ? [...heard.values()].find((r) => r !== rx && splitDescription(r.desc).name.toUpperCase() === `${pairName[1]} (${pairName[2].toUpperCase() === 'MSB' ? 'LSB' : 'MSB'})`.toUpperCase()) : null;
    if (pairName && partner && pairName[2].toUpperCase() === 'LSB') {
      const reason = 'the fine half of a pair whose coarse half is the parameter; the document does not say how many of its bits count';
      omitted.set(reason, [...(omitted.get(reason) ?? []), cc]);
      continue;
    }
    const fix = layout.names?.[`cc${cc}`];
    const name = fix?.name ?? (pairName && partner ? pairName[1] : printed.name);
    if (pairName && partner) coarsePairs.push(`${pairName[1]} (CC ${cc}, fine CC ${partner.cc})`);
    const { group, leaf } = groupOf(name, layout.groups);
    const recipeId = `cc${cc}`;
    recipes.set(recipeId, { id: recipeId, kind: 'cc', channel: '$channel', controller: cc, value: '$encodedValue' });
    const describe = [];
    if (printed.explanation) describe.push(printed.explanation);

    // Its values: the receive footnote's labelled ranges, the transmit footnote's values.
    const rxMarks = rx ? splitDescription(rx.desc).marks.map((k) => layout.markFor?.[k] ?? k) : [];
    if (rxMarks.some((k) => lowBitsOf(marks[k]))) wideControllers.push(cc);
    // One footnote for both directions (`TRANSMIT 0,127 = OFF, ON  RECEIVE 0~63,64~127 = OFF, ON`).
    const pairedMark = rxMarks.find((k) => transmitReceive(marks[k]));
    const rxMark = pairedMark ?? rxMarks.find((k) => !lowBitsOf(marks[k]) && (/^\s*vv\s*:/.test(marks[k] ?? '') || /\bWhen\b/.test(marks[k] ?? '') || Array.isArray(receivedLabels(marks[k]))));
    const txMark = pairedMark ?? (tx ? splitDescription(tx.desc).marks.find((k) => k.startsWith('2-')) : null);
    const rxLabels = pairedMark ? transmitReceive(marks[pairedMark]).received : rxMark ? receivedLabels(marks[rxMark]) : null;
    const txValues = tx ? parseValues(splitDescription(tx.desc).values ?? (tx.more.join('').match(/vv=:?([\d,\s]+)/)?.[1] ?? ''))?.list : null;
    const txLabels = pairedMark ? transmitReceive(marks[pairedMark]).sent : txMark ? transmittedLabels(marks[txMark], txValues) : null;
    let choices = null;
    const pairs = rxMarks.map((k) => hexPairs(marks[k])).find(Boolean);
    if (pairs) choices = choiceList(pairs);
    else if (Array.isArray(rxLabels) && txLabels) {
      const agree = rxLabels.length === txLabels.length
        && rxLabels.every((r, i) => (layout.sameLabels?.[`cc${cc}`] || norm(r.label) === norm(txLabels[i].label)) && txLabels[i].value >= r.from && txLabels[i].value <= r.to);
      if (agree) choices = choiceList(txLabels.map((t, i) => ({ value: t.value, label: rxLabels[i].label })));
      else {
        describe.push(`Received: ${marks[rxMark]}. Transmitted: ${marks[txMark]}${txValues ? ` (${txValues.join(', ')})` : ''}.`);
        notes.push(`CC ${cc} (${name}) is a number: the document's receive and transmit tables disagree on its values (${rxMark}, ${txMark}).`);
      }
    } else if (Array.isArray(rxLabels)) {
      choices = choiceList(rxLabels.map((r) => ({ value: r.from, label: r.label })));
      const misprinted = rxLabels.filter((r) => r.printed);
      if (misprinted.length) {
        describe.push(`The document's hex and decimal disagree at ${misprinted.map((r) => `${r.label} (${r.printed})`).join(', ')}; each value sent is one both readings give that name.`);
        notes.push(`CC ${cc} (${name}): the document prints hex and decimal bounds that disagree (${misprinted.map((r) => r.printed).join('; ')}); the values sent fall in both.`);
      }
    } else if (rxMark && marks[rxMark]) {
      describe.push(marks[rxMark]);
    } else if (txLabels && !rx) {
      choices = choiceList(txLabels);
    } else if (txLabels && rxMarks.some((k) => /^\d+-\d+$/.test(k) && marks[k] === undefined)) {
      // The receive table points at a footnote the document does not print; the transmit table's
      // names and values are the only ones there are.
      const missing = rxMarks.filter((k) => /^\d+-\d+$/.test(k) && marks[k] === undefined);
      choices = choiceList(txLabels);
      notes.push(`CC ${cc} (${name}) takes the values the instrument sends (${txMark}): the receive table points at *${missing.join(', *')}, which the document does not print.`);
    }
    // A mark that says something about the controller itself ("recognized prologue-16 only"), not
    // the usual "recognized when MIDI Rx CC is On".
    for (const k of rxMarks) {
      const said = marks[k];
      if (!said || k === rxMark || hexPairs(said) || lowBitsOf(said) || /^\s*vv\s*:/.test(said) || /^This message is (recognized|transmitted) when\b/i.test(said)) continue;
      describe.push(said);
    }
    if (choices && choices.some((c) => c.value > 127)) {
      describe.push(`Values as printed: ${choices.map((c) => `${c.value} = ${c.label}`).join(', ')}.`);
      choices = null;
    }
    if (layout.descriptions?.[`cc${cc}`]) describe.push(layout.descriptions[`cc${cc}`]);
    const range = parseValues(printed.values);
    const min = range?.min ?? 0;
    const max = range?.max ?? 127;
    const base = {
      id: unique(`${camel(group)}.${camel(leaf) || `cc${cc}`}`, `Cc${cc}`),
      name,
      group,
      // Where the document prints it: the line of its row, the receive table's when it has one.
      source: { line: row.line },
      ...(describe.length ? { description: describe.join(' ') } : {}),
      access: { canRead: false, canWrite: !!rx, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipeId,
      shortLabel: camel(leaf),
    };
    if (!rx) notes.push(`CC ${cc} (${name}) is read-only: the document lists it as transmitted, not recognised.`);
    push(choices ? choiceParameter(base, choices) : numberParameter(base, min, max, 'u7'));
  }
  for (const [why, list] of omitted) notes.push(`Not a parameter here, ${why}: CC ${list.join(', ')}.`);
  if (coarsePairs.length) notes.push(`Each of these is the coarse (MSB) controller of a pair, named without "(MSB)"; it sends 0 - 127 on its own: ${coarsePairs.join('; ')}.`);
  if (wideControllers.length) {
    notes.push(`CC ${wideControllers.join(', ')} take a 10-bit value when its low 3 bits come first on CC 63, as the document says; CEditor sends them as 7-bit controllers, 0 - 127, which the instrument also takes.`);
  }

  const profile_ccs = new Set([...recipes.values()].filter((r) => r.kind === 'cc').map((r) => r.controller));
  // ------------------------------------------------------------ NRPNs
  const skipped = new Map();
  const skip = (why, at) => skipped.set(why, [...(skipped.get(why) ?? []), at]);
  // A setting in the microKORG documents' hex notation (build-korg-hex.mjs), as a parameter.
  const hexParameter = (name, read, recipeId, suffix, line, extra = null) => {
    const { group, leaf } = groupOf(name, layout.groups);
    const words = [read.shown, read.note, read.unit && !read.shown ? `In ${read.unit}.` : null, extra].filter(Boolean);
    const base = {
      id: unique(`${camel(group)}.${camel(leaf) || recipeId}`, suffix),
      name, group,
      source: { line },
      ...(words.length ? { description: words.join(' ') } : {}),
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipeId, shortLabel: camel(leaf),
    };
    push(read.choices ? choiceParameter(base, choiceList(read.choices))
      : read.displayMin !== undefined ? bipolarParameter(base, read)
        : numberParameter(base, read.min, read.max, read.wide ? (read.signed ? 's14-lsb-msb' : 'u14-lsb-msb') : 'u7'));
  };
  // The microKORG (2002)'s knobs: control changes the Owner's Manual numbers (build-korg-knobs.mjs).
  if (data.ownersManual) {
    const knobs = knobControllers(data, layout);
    for (const spec of knobs.specs) {
      const recipeId = `cc${spec.cc}`;
      recipes.set(recipeId, { id: recipeId, kind: 'cc', channel: '$channel', controller: spec.cc, value: '$encodedValue' });
      const leaf = spec.name.startsWith(`${spec.group} `) ? spec.name.slice(spec.group.length + 1) : spec.name;
      const base = {
        id: unique(`${camel(spec.group)}.${camel(leaf) || recipeId}`, `Cc${spec.cc}`),
        name: spec.name, group: spec.group,
        // The Owner's Manual, the profile's second document, prints the knob's control change.
        source: { doc: 1, page: data.ownersManual.source.pdfPage },
        ...(spec.description ? { description: spec.description } : {}),
        access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
        messageRecipe: recipeId, shortLabel: camel(leaf),
      };
      push(spec.read.choices ? choiceParameter(base, choiceList(spec.read.choices))
        : spec.read.displayMin !== undefined ? bipolarParameter(base, spec.read)
          : numberParameter(base, spec.read.min, spec.read.max, 'u7'));
    }
    notes.push(...knobs.notes);
  }
  if (layout.hexValues && data.controllerTable) {
    for (const row of data.controllerTable) {
      if (profile_ccs.has(row.cc)) continue;
      const read = readHexValue(row.value, marks, data.lists);
      if (read.why) { skip(read.why, `CC ${row.cc} (${row.name})`); continue; }
      const recipeId = `cc${row.cc}`;
      recipes.set(recipeId, { id: recipeId, kind: 'cc', channel: '$channel', controller: row.cc, value: '$encodedValue' });
      hexParameter(row.name.replace(/\s+/g, ' ').trim(), read, recipeId, `Cc${row.cc}`, row.line);
    }
  }
  let msbDashes = false;
  // Rows after a `(Synth Mode /Vocoder Mode )` heading (the microKORG's) print each mode's name and
  // value apart at a `/`: `Patch1 Source/Fc Mod Source | *2-3 / *2-3`, `/BAND[1] LEVEL | / 00~7F:0~127`.
  let modeSplit = false;
  const modeHalves = (row, name) => {
    if (!modeSplit || !name.includes('/')) return [{ name, value: row.value }];
    const [synth, ...rest] = name.split('/');
    const vocoder = `Vocoder ${printedName(rest.join('/'))}`;
    const values = /^(.*?)\s*\/\s*(.*)$/.exec(row.value);
    const [synthValue, vocoderValue] = values ? [values[1].trim(), values[2].trim()] : [row.value, row.value];
    if (!synth.trim()) return [{ name: vocoder, value: vocoderValue }];
    if (synthValue === vocoderValue) return [{ name: synth.trim(), value: synthValue, extra: `In a vocoder program: ${printedName(rest.join('/'))}.` }];
    return [{ name: synth.trim(), value: synthValue, extra: `In a vocoder program this NRPN is ${vocoder} instead.` }, { name: vocoder, value: vocoderValue, extra: `In a synth program this NRPN is ${synth.trim()} instead.` }];
  };
  // A table of LSBs whose MSB picks one of several units (the PS-3300's three PSU-3301s): every row
  // once per unit, named `<unit> : <section> : <setting>`.
  const nrpnRows = data.nrpnMsb && data.nrpn.every((r) => r.msb === null)
    ? data.nrpn.length ? Array.from({ length: data.nrpnMsb.to - data.nrpnMsb.from + 1 }, (u, i) => data.nrpnMsb.from + i).flatMap((msb) => data.nrpn.map((row) => ({
      ...row,
      msb: hex(msb),
      name: [data.nrpnMsb.labels[msb - data.nrpnMsb.from], row.section && !norm(row.name).startsWith(norm(row.section)) ? row.section : null, row.name].filter(Boolean).join(' : '),
    }))) : []
    : data.nrpn;
  if (nrpnRows !== data.nrpn) notes.push(`The NRPN MSB picks the unit (${data.nrpnMsb.labels.map((l, i) => `${data.nrpnMsb.from + i} = ${l}`).join(', ')}) and the LSB its setting: ${data.nrpn.length} settings for each.`);
  for (const row of nrpnRows) {
    const lsb = Number.parseInt(row.lsb, 16);
    const msb = row.msb === '--' ? 0 : Number.parseInt(row.msb, 16);
    if (row.msb === '--') msbDashes = true;
    const number = `${row.msb === '--' ? '--' : hex(msb)} ${hex(lsb)}H`;
    const fix = layout.names?.[`nrpn${hex(msb)}${hex(lsb)}`];
    const name = fix?.name ?? row.name.replace(/\s+/g, ' ').trim();
    const own = (layout.skip ?? []).find(([pattern]) => pattern.test(name));
    if (own) { skip(own[1], number); continue; }
    if (layout.hexValues) {
      for (const half of modeHalves(row, name)) {
        const read = readHexValue(half.value, marks, data.lists);
        if (read.why) { skip(read.why, `${number} (${half.name})`); continue; }
        if (!read.wide && ((read.max ?? 0) > 127 || read.choices?.some((c) => c.value > 127))) { skip('wider than 7 bits', `${number} (${half.name})`); continue; }
        const recipeId = `nrpn${hex(msb)}${hex(lsb)}`;
        recipes.set(recipeId, { id: recipeId, kind: 'nrpn', channel: '$channel', parameterMsb: msb, parameterLsb: lsb, valueResolution: read.wide ? 14 : 7, value: '$encodedValue', nullAfterSend: false });
        hexParameter(half.name, read, recipeId, `Nrpn${hex(lsb)}`, row.line, half.extra);
      }
      if (row.more.some((m) => /Synth Mode\s*\/\s*Vocoder Mode/i.test(m))) modeSplit = true;
      continue;
    }
    const value = parseNrpnValue(row.value);
    if (value.ascii) { skip('the program name, one character per NRPN; CEditor cannot edit text over NRPN yet', number); continue; }
    if (!value.values) { skip('printed without a range', `${number} (${name})`); continue; }
    const values = value.values.list ?? Array.from({ length: value.values.max - value.values.min + 1 }, (unused, i) => value.values.min + i);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const low = value.marks.map((k) => lowBitsOf(marks[k])).find(Boolean);
    const describe = [];
    // Its labels: printed after `=` one per value, or a list it points to naming every value.
    let choices = null;
    const paired = value.marks.map((k) => transmitReceive(marks[k])).find(Boolean);
    if (paired) {
      const agree = paired.sent.length === paired.received.length && paired.sent.every((t, i) => norm(t.label) === norm(paired.received[i].label) && t.value >= paired.received[i].from && t.value <= paired.received[i].to);
      if (agree) choices = choiceList(paired.sent);
    }
    const shown = value.shown ? value.shown.split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (shown.length === values.length && !shown.some((s) => /~/.test(s))) {
      choices = choiceList(values.map((v, i) => ({ value: v, label: shown[i] })));
    } else if (value.shown) {
      describe.push(`${value.values.list ? value.values.list.join(',') : `${min}~${max}`} = ${value.shown}`);
    }
    for (const key of [...value.notes, ...value.marks]) {
      if (choices && transmitReceive(marks[key])) continue;
      const list = data.lists[key];
      if (list?.entries?.length && !choices) {
        const single = list.entries.every((e) => e.from === e.to);
        const covers = single && list.entries.length === values.length && values.every((v, i) => list.entries[i].from === v);
        if (covers) choices = choiceList(list.entries.map((e) => ({ value: e.from, label: e.label })));
        else describe.push(`${list.title ? `${list.title}: ` : ''}${list.entries.map((e) => `${e.from === e.to ? e.from : `${e.from}~${e.to}`} = ${e.label}`).join(', ')}`);
      } else if (!list && marks[key] && !lowBitsOf(marks[key])) {
        describe.push(marks[key]);
      }
    }
    if (layout.descriptions?.[`nrpn${hex(msb)}${hex(lsb)}`]) describe.push(layout.descriptions[`nrpn${hex(msb)}${hex(lsb)}`]);
    if (max > 127 && !low) { skip('wider than 7 bits, with no format printed for the extra bits', `${number} (${name})`); continue; }
    const recipeId = `nrpn${hex(msb)}${hex(lsb)}`;
    recipes.set(recipeId, {
      id: recipeId, kind: 'nrpn', channel: '$channel', parameterMsb: msb, parameterLsb: lsb,
      ...(low && max > 127 ? { lowBitsController: low.lowBitsController, lowBits: low.lowBits } : { valueResolution: 7 }),
      value: '$encodedValue', nullAfterSend: false,
    });
    const { group, leaf } = groupOf(name, layout.groups);
    const base = {
      id: unique(`${camel(group)}.${camel(leaf) || recipeId}`, `Nrpn${hex(lsb)}`),
      name,
      group,
      source: { line: row.line },
      ...(describe.length ? { description: describe.join(' ') } : {}),
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipeId,
      shortLabel: camel(leaf),
    };
    push(choices ? choiceParameter(base, choices) : numberParameter(base, min, max, max > 127 ? 'u14-msb-lsb' : 'u7'));
  }
  for (const [why, list] of skipped) notes.push(`Left out, ${why}: NRPN ${list.join(', ')}.`);
  if (msbDashes) notes.push('The NRPN table prints the parameter MSB as "--"; CC 99 is sent as 0.');
  for (const [key, fix] of Object.entries(layout.names ?? {})) notes.push(`${key.replace(/^cc/, 'CC ').replace(/^nrpn/, 'NRPN ')} is named "${fix.name}": ${fix.why}`);
  for (const [key, why] of Object.entries(layout.sameLabels ?? {})) notes.push(`${key.replace(/^cc/, 'CC ')}'s two tables name its values alike but for print: ${why}; the receive table's names are used.`);
  for (const [mark, other] of Object.entries(layout.markFor ?? {})) notes.push(`Mark *${mark} is read from the footnote printed as *${other}: ${layout.markWhy?.[mark] ?? 'the document prints it under that number'}.`);

  // ------------------------------------------------------------ identity, presets, tests
  const identity = layout.identity ?? identityFrom(data.identity, data.identityValues);
  const variables = { channel: 1, ...(layout.variables ?? {}) };
  const status = 0xb0 + variables.channel - 1;
  const writable = parameters.filter((p) => p.access.canWrite);
  const recipeOf = (p) => recipes.get(p.messageRecipe);
  const picks = [
    writable.find((p) => recipeOf(p).kind === 'cc'),
    writable.find((p) => recipeOf(p).kind === 'cc' && p.type === 'choice'),
    writable.find((p) => recipeOf(p).kind === 'nrpn' && p.type === 'choice'),
    writable.find((p) => recipeOf(p).kind === 'nrpn' && recipeOf(p).lowBits),
    writable.find((p) => recipeOf(p).kind === 'nrpn' && recipeOf(p).valueResolution === 14 && p.range?.min < 0),
    [...writable].reverse().find((p) => recipeOf(p).kind === 'cc'),
  ].filter(Boolean);
  const vectorOf = (parameter) => {
    const recipe = recipeOf(parameter);
    const choice = parameter.type === 'choice' ? parameter.choices.at(-1) : null;
    const value = choice ? choice.value : recipe.valueResolution === 14 && parameter.range.min < 0 ? parameter.range.min : Math.min(parameter.range.max, Math.max(parameter.range.min, recipe.lowBits ? 1001 : 100));
    let bytes;
    if (recipe.kind === 'cc') bytes = [[recipe.controller, value]];
    else if (recipe.valueResolution === 14) bytes = [[0x63, recipe.parameterMsb], [0x62, recipe.parameterLsb], [0x06, (value & 0x3fff) >> 7], [0x26, value & 0x7f]];
    else if (recipe.lowBits) bytes = [[0x63, recipe.parameterMsb], [0x62, recipe.parameterLsb], [recipe.lowBitsController, value & ((1 << recipe.lowBits) - 1)], [0x06, value >> recipe.lowBits]];
    else bytes = [[0x63, recipe.parameterMsb], [0x62, recipe.parameterLsb], [0x06, value]];
    return {
      name: `${parameter.name} = ${choice ? choice.label : value} (${recipe.kind === 'cc' ? `CC ${recipe.controller}` : `NRPN ${hex(recipe.parameterMsb)} ${hex(recipe.parameterLsb)}H`})`,
      parameter: parameter.id,
      value: choice ? choice.id : value,
      expectedHex: bytes.map(([cc, v]) => [status, cc, v].map(hex).join(' ')).join('\n'),
    };
  };
  const tests = [
    ...(identity ? [{ name: 'Universal Identity Request', kind: 'identityRequest', expectedHex: 'F0 7E 7F 06 01 F7' }] : []),
    ...[...new Map(picks.map((p) => [p.id, p])).values()].map(vectorOf),
  ];

  const source = data.source;
  const lowBitsCount = parameters.filter((p) => recipeOf(p).lowBits).length;
  const profile = {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Korg',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: [{
      type: 'manual',
      title: `${source.title}${source.revision ? ` (Revision ${source.revision}${source.date ? `, ${source.date}` : ''})` : ''}`,
      notes: `Tables read by tools/profiles/korg/read-korg-text.mjs from ${source.file} (sha256 ${source.sha256}), ${source.url}. Not yet checked against the instrument itself.`,
    }, ...(data.ownersManual ? [{
      type: 'manual',
      title: `${data.ownersManual.source.title}, p. ${data.ownersManual.source.printedPage}`,
      notes: `The knobs' control changes, read by tools/profiles/korg/read-korg-om-cc.mjs from ${data.ownersManual.source.file} (sha256 ${data.ownersManual.source.sha256}), PDF page ${data.ownersManual.source.pdfPage}, ${data.ownersManual.source.url}.`,
    }] : [])],
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/korg/make-profiles.mjs; edit the layout in tools/profiles/korg/synths/, not this file.',
      'Every parameter is a control change the document says the instrument recognises, or a row of its NRPN table, with its printed name. Nothing here has been sent to a real instrument yet.',
      ...(lowBitsCount ? [`${lowBitsCount} NRPN value(s) wider than 7 bits go as the document prints the format: the low bits first on their own controller, then the rest on CC 6. CEditor sends these; it does not yet put the two halves together when the instrument sends them.`] : []),
      ...(identity ? [] : [`No identity check: ${layout.noIdentity ?? 'the document prints no Device Inquiry reply'}.`]),
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    ...(identity ? { identity: { manufacturerId: ['42'], familyCode: identity.familyCode, modelNumber: identity.modelNumber, timeoutMs: 1000, retries: 0 } } : {}),
    coverage: {
      singleParameterWrite: 'complete-for-the-document\'s-control-changes-and-nrpns',
      realtimeEditing: 'complete-for-the-document\'s-control-changes-and-nrpns',
      editBufferDumpRequest: 'notImplemented: the program dump is described but not mapped yet',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the front panel sends these same control changes when its MIDI settings allow',
      verifiedOnHardware: false,
      ...(layout.coverage ?? {}),
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.kind.localeCompare(b.kind) || (a.controller ?? a.parameterMsb * 128 + a.parameterLsb) - (b.controller ?? b.parameterMsb * 128 + b.parameterLsb)),
    parameters,
    ...(identity ? {
      requests: [{ id: 'identityRequest', name: 'Identity Request', kind: 'sysex', template: ['F0', '7E', '7F', '06', '01', 'F7'], response: { kind: 'identity' }, timeoutMs: 1000, retries: 0 }],
      startup: { policy: 'pull', syncDirection: 'pull', sync: [{ request: 'identityRequest' }] },
    } : {}),
    ...((layout.presets ?? presetsFrom(data)) ? { presets: layout.presets ?? presetsFrom(data) } : {}),
    tests,
  };
  const changeNotes = addParameterChange(profile, data, layout);
  if (changeNotes.length) {
    profile.variables = { ...profile.variables, deviceId: 0x30 };
    profile.authoringNotes.push(...changeNotes, 'The exclusive header carries the global MIDI channel as 3g; the profile\'s deviceId variable is that byte, 30H for channel 1.');
    profile.tests.push(...parameterChangeVectors(profile));
  }
  const pullNotes = [];
  addPull(profile, data, layout, pullNotes);
  profile.authoringNotes.push(...pullNotes);
  return profile;
}

/** The Device Inquiry reply's family and member bytes: the two after KORG's ID, then the next two. */
export function identityFrom(rows, values = []) {
  const at = (rows ?? []).findIndex((r) => /^42$/i.test(r.byte) && /KORG/i.test(r.description));
  if (at < 0) return null;
  // A byte printed as a symbol, its value given below the table (`mm = 11 : micro KORG`).
  const resolve = (byte) => values.find((v) => v.symbol.toLowerCase() === byte.toLowerCase())?.value ?? byte;
  const bytes = rows.slice(at + 1, at + 5).map((r) => resolve(r.byte).toUpperCase());
  if (bytes.length < 4 || !bytes.every((b) => /^[0-7][0-9A-F]$/.test(b))) return null;
  return { familyCode: bytes.slice(0, 2), modelNumber: bytes.slice(2, 4) };
}

/**
 * Preset recall from the document's own lines: Bank Select MSB and LSB (`vv=0`, `vv=0~4`) and
 * Program Change (`pp=0~99`). A bank per LSB value, each the size of the Program Change range.
 */
export function presetsFrom(data) {
  const pc = data.programChange ? /pp=(\d+)~(\d+)/.exec(data.programChange.desc) : null;
  if (!pc) return null;
  const size = Number(pc[2]) - Number(pc[1]) + 1;
  const rangeOf = (cc) => {
    const row = data.received.find((r) => r.cc === cc);
    return row ? parseValues(splitDescription(row.desc).values) : null;
  };
  const msb = rangeOf(0);
  const lsb = rangeOf(32);
  if (msb && msb.max !== msb.min) return null;   // a bank MSB that varies: not this simple shape
  const lsbValues = lsb ? Array.from({ length: lsb.max - lsb.min + 1 }, (unused, i) => lsb.min + i) : [null];
  return {
    banks: lsbValues.map((b, i) => ({
      id: lsbValues.length > 1 ? `bank-${i + 1}` : 'programs',
      label: `Programs ${i * size + 1}-${(i + 1) * size}`,
      role: 'user',
      writable: false,
      startSlot: i * size,
      slotCount: size,
      programBase: Number(pc[1]),
      ...(msb ? { bankMsb: msb.min } : {}),
      ...(b !== null ? { bankLsb: b } : {}),
    })),
    recall: { kind: 'bankPc' },
  };
}
