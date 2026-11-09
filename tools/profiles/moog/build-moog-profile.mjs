// build-moog-profile.mjs — a Moog transcription (tables/<name>.json) and a layout (synths/<name>.mjs)
// -> a CEditor device profile.
//
// What the manuals say, and nothing they do not:
//
//   - every row of a CC table whose CC column prints a controller is a parameter on it, sent as that
//     controller alone. Moog prints most knobs as an MSB and an LSB (`3 [MSB], 35 [LSB]`, `19(MSB)
//     51(LSB)`, a column each), 0 - 16383 together; the manuals say to send the MSB by itself for
//     7-bit control, "the value range is always 0-127" (the Minitaur's, the Sirin's), and CEditor's
//     CC message carries one controller, so the parameter is the MSB, 0 - 127, and its LSB is said;
//   - a value list is a choice, the first value of each band sent: `0-63 = OFF, 64-127 = ON`,
//     `0-24: TRIANGLE`, `0-63(SAW) 64-127(SQR)`, `0 = 16', 32 = 8'`, `0 (OFF), 64 (ON)`. A list whose
//     bands run backwards or overlap (the Muse's `50-74: SQUARE` after `5-99`) is a misprint the
//     builder does not correct: the parameter stays a number and the profile says why;
//   - a list whose names are numbers that move with the values (`0 = -12 SEMITONES, 1 = -11 … 24 =
//     +12`) is a scale: a number from the first value to the last, shown as its names;
//   - `BIPOLAR`, `(64 is center)`, `Bipolar (Center Value = 0)`: a bipolar number, 64 shown as 0;
//   - `See table …` beside a value table the layout names for that controller: a choice from it;
//   - an NRPN row (the Sub 37's chart, the Claravox's NRPN column) is sent with its number split as
//     MIDI splits one, MSB n / 128 and LSB n % 128, which the Sub 37's chart prints beside each, and
//     its value as one 14-bit number, data entry MSB on CC 6 and LSB on CC 38;
//   - controllers 0 and 32 (bank select) and 120 - 127 (channel mode: Local Control, All Notes Off)
//     are MIDI's own, not settings, and are left out; so are rows printed as reserved, and rows
//     sharing a controller unless each prints one value of it (the Taurus 3's LFO waves on CC 68),
//     which become one choice.

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const clean = (s) => String(s ?? '').replace(/[–—−]/g, '-').replace(/[’‘]/g, "'").replace(/…/g, '...').replace(/\s+/g, ' ').trim();
const slug = (label) => label.toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';
const unwrap = (label) => clean(label).replace(/^[\s,;/.]+|[\s,;/]+$/g, '').replace(/^\((.*)\)$/, '$1').trim();
const signed = /^[+-]?\d+(\.\d+)?(\s*(SEMITONES?|OCT(AVES?)?|ST))?$/i;

/** Bands (`0-63 = OFF, 64-127 = ON`, `0-24: SAW`, `0-63(SAW)`), or null. */
export function readBands(text) {
  const t = clean(text);
  const found = [...t.matchAll(/(\d+)\s*-\s*(\d+)\s*[=:]?\s*/g)];
  if (found.length < 2) return null;
  let bands = found.map((m, i) => ({ from: Number(m[1]), to: Number(m[2]), label: unwrap(t.slice(m.index + m[0].length, found[i + 1]?.index ?? t.length)) }));
  // `0-127 0-24: TRIANGLE …`: the whole range, then its bands.
  if (!bands[0].label && bands[0].from === 0 && bands[0].to === 127) bands = bands.slice(1);
  if (bands.length < 2 || bands.some((b) => !b.label || /^\[|^\((or|MSB|LSB|14-bit)\b/i.test(b.label))) return null;
  return bands;
}

/** Points (`0 = OFF / 64 = ON`, `0 (OFF), 64 (ON)`, `42 (LO) 85 (MED) 127 (HI)`), or null. */
export function readPoints(text) {
  const t = clean(text);
  const eq = [...t.matchAll(/(?:^|[\s,;/(])(\d+)\s*=\s*/g)];
  if (eq.length >= 2 && eq[0].index === 0) {
    return eq.map((m, i) => ({ value: Number(m[1]), label: unwrap(t.slice(m.index + m[0].length, eq[i + 1]?.index ?? t.length)) }));
  }
  const paren = [...t.matchAll(/(\d+)\s*\(([^()]*)\)/g)];
  if (paren.length >= 2 && !t.replace(/(\d+)\s*\(([^()]*)\)/g, '').replace(/[\s,;/]/g, '')) {
    return paren.map((m) => ({ value: Number(m[1]), label: clean(m[2]) }));
  }
  return null;
}

const ascending = (list, lo = (x) => x.from ?? x.value, hi = (x) => x.to ?? x.value) => list.every((x, i) => lo(x) <= hi(x) && (i === 0 || lo(x) > hi(list[i - 1])));

/**
 * What a row's values say: { choices } | { min, max, shown?, bipolar? } | { skip }. `wide` is the
 * largest value the message carries (127 for a CC, 16383 for a 14-bit NRPN).
 */
export function readValues(text, wide = 127) {
  const t = clean(text).replace(/\(\s*Default\s*[:=][^)]*\)/gi, '').replace(/\.?\s*Default\s*[:=].*$/i, '').trim();
  if (!t || /^-$/.test(t)) return { skip: 'printed without a range' };
  const bands = readBands(t);
  if (bands) {
    if (!ascending(bands) || bands.at(-1).to > wide) return { number: true, why: `its bands are printed out of order (${bands.map((b) => `${b.from}-${b.to}`).join(', ')})` };
    return { choices: bands.map((b) => ({ value: b.from, label: b.label })), bands: true };
  }
  const points = readPoints(t);
  if (points) {
    if (!ascending(points) || points.at(-1).value > wide) return { number: true, why: `its values are printed out of order (${points.map((p) => p.value).join(', ')})` };
    // Names that are numbers moving with the values: a scale, not a list.
    if (points.every((p) => signed.test(p.label))) {
      const n = points.map((p) => parseFloat(p.label.replace(/^\+/, '')));
      if (points.every((p, i) => n[i] - n[0] === p.value - points[0].value)) return { min: points[0].value, max: points.at(-1).value, shown: { min: n[0], max: n.at(-1) } };
    }
    return { choices: points };
  }
  // A range: `0-127`, `0 - 16383`, `0..+24 SEMITONES`, `0-15 = MIDI Channel 1-16`, `0-4 = -2 to +2`.
  const m = /(-?\d+)\s*(?:-|to|\.\.\.?|\.\.)\s*\+?(-?\d+)/i.exec(t);
  if (!m) return { skip: /table/i.test(t) ? 'its values in a table not transcribed' : 'printed without a range' };
  let min = Number(m[1]);
  let max = Number(m[2]);
  if (min < 0) return { skip: 'a range printed as the value shown, not the value sent' };
  if (/16383/.test(t) && wide === 127) { min = 0; max = 127; }
  if (max > wide) return { skip: `a range of ${min} - ${max}, wider than its message carries` };
  const out = { min, max };
  const shown = /=\s*(?:MIDI Channel\s*)?([+-]?\d+)\s*(?:-|to)\s*([+-]?\d+)/i.exec(t.slice(m.index + m[0].length));
  if (shown) out.shown = { min: Number(shown[1]), max: Number(shown[2]) };
  if (/bipolar|cent(er|re)/i.test(t)) out.bipolar = true;
  // A unit printed with the range itself (`0-24 (SEMITONES)`, `0..+24 SEMITONES`), not one of a point on it.
  const unit = /^\s*\(?\s*(SEMITONES|Semitones|BPM|cents|Hz)\b/.exec(t.slice(m.index + m[0].length));
  if (unit) out.unit = unit[1].toLowerCase();
  return out;
}

/** The controller numbers a CC cell prints: `3 [MSB], 35 [LSB]`, `19(MSB) 51(LSB)`, `MSB 10 LSB 42`, `CC 1`, `4 (coarse) 36 (fine)`. */
export function readController(text) {
  const t = clean(text);
  const msb = /(?:^|\b)(?:CC\s*|MSB\s*)?(\d+)/i.exec(t);
  if (!msb) return null;
  const lsb = /(\d+)\s*[[(]\s*(?:LSB|fine)|LSB\s*(\d+)/i.exec(t);
  return { cc: Number(msb[1]), lsb: lsb ? Number(lsb[1] ?? lsb[2]) : null };
}

// Bank select is a program change's, not a setting. (CC 6 is the Little Phatty's modulation amount and
// the Taurus 3's filter modulation: a row naming a controller MIDI reserves elsewhere is what it says.)
const MIDI_OWN = new Map([[0, 'bank select'], [32, 'bank select']]);

/** The group a name falls in, where the table prints no section: by its first words. */
const GROUPS = [
  [/^(ARP|ARPEGGIATOR|ARP\/SEQ|SEQUENCER|SEQ)\b/i, 'Arpeggiator'],
  [/^(GLIDE|PORTAMENTO|LEGATO GLIDE|GATED GLIDE)\b/i, 'Glide'],
  [/^(F(ILTER)? ?EG|FILTER ENV|F ENV|VCF \(EG\))(?![A-Z0-9])/i, 'Filter EG'],
  [/^(AMP EG|A ENV|AMP ENV|VCA ENV|VCA \(EG\))(?![A-Z0-9])/i, 'Amp EG'],
  [/^(LFO ?1|LFO 1)\b/i, 'LFO 1'],
  [/^(LFO ?2|LFO 2)\b/i, 'LFO 2'],
  [/^(LFO|PITCH LFO|MOD(ULATION)? RATE|MOD(ULATION)? SOURCE|MOD WHEEL|MOD(ULATION)? OSC)/i, 'Modulation'],
  [/^(MOD ?1)\b/i, 'Mod 1'],
  [/^(MOD ?2)\b/i, 'Mod 2'],
  [/^(OSC|VCO|SUB OSC|NOISE|FB|FEEDBACK|OSCILLATOR|WAVE|DUO|RING|HARD SYNC|SYNC)/i, 'Oscillators'],
  [/^(FILTER|VCF|MULTIDRIVE|CUTOFF|RESONANCE|LOW CUT)/i, 'Filter'],
  [/^(DELAY)/i, 'Delay'],
  [/^(KB|KEYBOARD|PITCH BEND|BEND|NOTE PRIORITY|KEY PRIORITY)/i, 'Keyboard'],
];

const tidy = (name) => clean(name).replace(/\s*\((SEE )?NOTE \d+\)/gi, '').replace(/\s*\(M\)\s*$|\s*\(M\)/g, '').replace(/^<|>$/g, '').replace(/\s+/g, ' ').trim();

export function buildMoogProfile(data, layout) {
  const notes = [];
  const parameters = [];
  const recipes = new Map();
  const ids = new Set();
  const skipped = new Map();
  const skip = (why, what) => skipped.set(why, [...(skipped.get(why) ?? []), what]);
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  const lsbs = [];
  const corrected = [];
  const numbered = new Map();

  // The rows: CC tables, then NRPN tables, each with the message it is sent on.
  const entries = [];
  for (const [ti, table] of data.tables.entries()) {
    const kind = table.kind ?? 'cc';
    if (kind === 'sysex') continue;
    for (const row of table.rows) {
      const name = tidy(layout.names?.[`${kind}${kind === 'nrpn' ? row.nrpn : readController(row.cc)?.cc}`] ?? row.name);
      const label = `${name || '(unnamed)'} (${kind === 'nrpn' ? `NRPN ${row.nrpn}` : `CC ${clean(row.cc).replace(/^CC\s*/i, '')}`})`;
      if (!name || /RESERVED/i.test(row.name)) { skip('printed as reserved, or without a name', label); continue; }
      const own = (layout.skip ?? []).find(([pattern]) => pattern.test(name) || pattern.test(label));
      if (own) { skip(own[1], label); continue; }
      let message;
      if (kind === 'nrpn') {
        const n = Number(clean(row.nrpn));
        if (!Number.isInteger(n)) { skip('printed without an NRPN number', label); continue; }
        const [msb, lsb] = row.msb !== undefined && row.msb !== '' ? [Number(row.msb), Number(row.lsb)] : [n >> 7, n & 127];
        if (msb * 128 + lsb !== n) { skip(`an NRPN whose MSB and LSB (${row.msb}, ${row.lsb}) are not its number`, label); continue; }
        message = { kind: 'nrpn', number: n, msb, lsb };
      } else if (kind === 'ccnrpn') {
        // The Claravox's: a CC and an NRPN for each row; a 14-bit range goes on the NRPN, the rest on the CC.
        const c = readController(row.cc);
        const n = Number(clean(row.nrpn));
        const wide = /16383/.test(row.values ?? '');
        if (wide && Number.isInteger(n)) message = { kind: 'nrpn', number: n, msb: n >> 7, lsb: n & 127, cc: c?.cc };
        else if (c) message = { kind: 'cc', cc: c.cc, nrpn: Number.isInteger(n) ? n : null };
        else { skip('printed without a controller', label); continue; }
      } else {
        const c = readController(row.cc);
        if (!c) { skip('printed without a controller (a panel switch, or `Varies`)', label); continue; }
        if (c.cc > 127) { skip('printed with a controller above 127', label); continue; }
        if (MIDI_OWN.has(c.cc) || c.cc >= 120) { skip(`MIDI's own controller (${MIDI_OWN.get(c.cc) ?? 'a channel mode message'}), not a setting`, label); continue; }
        // The LSB: in the CC cell, in a column of its own, or in the values (`0-127 (or 0-16383 using CC1 & CC 33)`).
        const using = /using CC\s*\d+\s*&\s*CC\s*(\d+)/i.exec(row.values ?? '');
        message = { kind: 'cc', cc: c.cc, lsb: c.lsb ?? (/^\d+$/.test(clean(row.lsb)) ? Number(clean(row.lsb)) : using ? Number(using[1]) : null) };
      }
      // A correction the manual's own addendum prints (the Minitaur's v2.1 addendum).
      const fix = message.kind === 'cc' ? layout.corrections?.[message.cc] : null;
      if (fix) corrected.push(`${label}: ${fix.why}`);
      entries.push({ row, name, label, message, table: ti, values: fix ? fix.values : row.values ?? '', count: row.count });
    }
  }

  // Rows that share a controller: one choice where each prints one value of it (the Taurus 3's LFO waves).
  const byMessage = new Map();
  const key = (m) => (m.kind === 'nrpn' ? `nrpn${m.number}` : `cc${m.cc}`);
  for (const e of entries) byMessage.set(key(e.message), [...(byMessage.get(key(e.message)) ?? []), e]);
  const used = new Set();
  const groupOf = (e) => {
    const section = clean(e.row.section);
    const fromLayout = layout.groupOf?.(e.name, section, e);
    if (fromLayout) return fromLayout;
    // A section printed in capitals, in title case but for its abbreviations; one printed in mixed case, as printed.
    if (section) return layout.sections?.[section] ?? (section === section.toUpperCase() ? section.replace(/[A-Za-z][^\s()/]*/g, (w) => (/^(LFO|EG|VCF|VCA|VCO|ARP|KB|MIDI|CV)$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())) : section);
    return (layout.groups ?? []).concat(GROUPS).find(([re]) => re.test(e.name))?.[1] ?? 'Program';
  };
  const recipeFor = (m) => {
    const channel = '$channel';
    const r = m.kind === 'nrpn'
      ? { id: `nrpn${hex(m.msb)}${hex(m.lsb)}`, kind: 'nrpn', channel, parameterMsb: m.msb, parameterLsb: m.lsb, valueResolution: 14, value: '$encodedValue', nullAfterSend: false }
      : { id: `cc${m.cc}`, kind: 'cc', channel, controller: m.cc, value: '$encodedValue' };
    recipes.set(r.id, r);
    return r;
  };

  for (const e of entries) {
    if (used.has(e)) continue;
    const k = key(e.message);
    const together = byMessage.get(k);
    const group = groupOf(e);
    const describe = [];
    let read;
    if (together.length > 1) {
      const single = together.map((x) => (/^\s*\d+\s*$/.test(x.values) ? Number(x.values) : null));
      if (single.every((v) => v !== null) && new Set(single).size === single.length) {
        together.forEach((x) => used.add(x));
        const name = layout.joined?.[k] ?? `${together.map((x) => x.name).join('/')}`;
        read = { choices: together.map((x, i) => ({ value: single[i], label: x.name })).sort((a, b) => a.value - b.value) };
        describe.push(`${together.length} rows of the table on one controller, each with one value: a choice of them.`);
        e.name = name;
      } else if (together[0] !== e) {
        skip('a controller another row already has', e.label);
        continue;
      }
    }
    const nrpn = e.message.kind === 'nrpn';
    const wide = nrpn ? 16383 : 127;
    if (!read) {
      if (nrpn && e.count !== undefined) {
        // The Sub 37's chart: the number of values each NRPN takes.
        const n = Number(clean(e.count));
        if (!Number.isInteger(n) || n < 2) { skip('printed without its number of values', e.label); continue; }
        read = { min: 0, max: n - 1 };
      } else {
        // A value table may run over two (the Grandmother's clock divisions, `(Continued)` beside it).
        const parts = (data.valueTables ?? []).filter((t) => t.for?.includes(e.message.cc ?? e.message.number) && (t.doc ?? 0) === (e.row.doc ?? 0));
        const tabled = parts.length ? { ...parts[0], rows: parts.flatMap((t) => t.rows), pages: [...new Set(parts.flatMap((t) => t.pages))] } : null;
        if (tabled && (/table/i.test(e.values) || !e.values || layout.useTable?.includes(e.message.cc))) {
          const list = tabled.rows.map((r) => ({ value: Number(/\d+/.exec(clean(r.value))?.[0]), label: clean(r[tabled.label ?? 'label'] ?? r.label) })).filter((x) => Number.isInteger(x.value) && x.label);
          const sorted = [...list].sort((a, b) => a.value - b.value);
          if (sorted.length >= 2 && ascending(sorted) && sorted.at(-1).value <= wide) {
            read = { choices: sorted };
            const banded = tabled.rows.some((r) => /\d\s*-\s*\d/.test(clean(r.value)));
            describe.push(`Values from ${tabled.title ?? 'the table it points to'}${tabled.pages ? ` (p. ${tabled.pages.join(', ')} of the PDF)` : ''}; ${banded ? 'the first value of each band is sent' : 'the value printed beside each name is sent'}.`);
          } else {
            read = { number: true, why: `${tabled.title ?? 'its table'} does not list its values in order` };
          }
        }
        read ??= readValues(e.values, wide);
      }
      if (read.skip) { skip(read.skip, `${e.label}${e.values ? `: ${clean(e.values)}` : ''}`); continue; }
      // `Bipolar (Center Value = 0)` in the notes beside the range (the Claravox's).
      if (read.min !== undefined && !read.shown && /\bbipolar\b/i.test(`${e.row.notes ?? ''} ${e.row.function ?? ''}`)) read.bipolar = true;
      if (read.number) {
        numbered.set(read.why, [...(numbered.get(read.why) ?? []), e.label]);
        read = { min: 0, max: wide };
      }
    }
    if (read.choices && read.choices.some((c) => c.value > wide)) { skip('a value wider than its message carries', e.label); continue; }
    if (read.bands) describe.push('Each name takes a band of values; the first value of it is sent.');
    if (e.message.kind === 'cc' && e.message.lsb !== null && e.message.lsb !== undefined) {
      describe.push(`The MSB alone, 0 - 127; CC ${e.message.lsb} is its LSB, 0 - 16383 together.`);
      lsbs.push(`${e.name} (CC ${e.message.cc}, LSB ${e.message.lsb})`);
    }
    if (e.message.nrpn !== undefined && e.message.nrpn !== null && e.message.kind === 'cc') describe.push(`Also NRPN ${e.message.nrpn}.`);
    if (e.message.kind === 'nrpn' && e.message.cc !== undefined) describe.push(`Also CC ${e.message.cc}, the MSB of it, 0 - 127.`);
    if (/\(M\)/.test(e.row.name ?? '')) describe.push('Reached over MIDI only.');
    const fn = clean(e.row.function ?? e.row.notes ?? '');
    if (fn && !/^[^a-z]*$/.test(fn)) describe.push(fn.replace(/([^.])$/, '$1.'));
    if (read.unit) describe.push(`In ${read.unit}.`);
    // What the range cell says beyond its numbers (`-7 SEMITONES TO +7 SEMITONES`, `30BPM to 300BPM`).
    const said = clean(e.values).replace(/\[(MSB|LSB|MSB,\s*LSB|-|\+)\]|\(or [^)]*\)|\b(MSB|LSB|MIN|MAX|TO|14-Bit|BIPOLAR)\b/gi, '');
    if (!read.choices && /[a-z]{2,}/i.test(said) && !e.count) describe.push(`Printed: ${clean(e.values)}.`);
    const recipe = recipeFor(e.message);
    const leaf = e.name;
    const base = {
      id: unique(`${camel(group)}.${camel(leaf) || recipe.id}`),
      name: e.name,
      group,
      ...(describe.length ? { description: describe.join(' ') } : {}),
      access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      messageRecipe: recipe.id,
    };
    if (read.choices) {
      // Labels the layout restores where the PDF's text leaves a sign out (the Claravox's ♯ and ♭).
      for (const [re, to] of layout.labelFix ?? []) read.choices = read.choices.map((c) => ({ ...c, label: c.label.replace(re, to) }));
      const seen = new Set();
      const list = read.choices.map(({ value, label }) => { const s = slug(label); const id = seen.has(s) ? `${s}_${value}` : s; seen.add(id); return { id, label, value }; });
      parameters.push({ ...base, type: 'choice', default: list[0].id, choices: list, display: { mode: 'choice', shortLabel: camel(leaf) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'enum' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list.length === 2 ? 'ToggleButton' : list.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } });
    } else {
      const bipolar = read.bipolar || (read.shown && read.shown.min < 0 && read.shown.max > 0);
      const shown = read.shown ?? (read.bipolar ? { min: read.min - Math.ceil((read.max - read.min) / 2), max: read.max - Math.ceil((read.max - read.min) / 2) } : null);
      parameters.push({
        ...base,
        type: bipolar ? 'bipolar' : 'integer',
        range: { min: read.min, max: read.max },
        default: bipolar ? read.min + Math.ceil((read.max - read.min) / 2) : read.min,
        display: { mode: 'number', unit: read.unit === 'semitones' ? 'st' : '', shortLabel: camel(leaf), ...(shown ? { min: shown.min, max: shown.max } : {}) },
        normalization: { mode: 'linear' },
        encoding: { type: nrpn ? 'u14-msb-lsb' : 'u7' },
        sendPolicy: read.max - read.min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
        ui: { preferredComponent: /LEVEL|ATTACK|DECAY|SUSTAIN|RELEASE|TIME|DEPTH|AMOUNT|AMT/i.test(e.name) ? 'Slider' : 'Knob' },
      });
    }
  }

  // The layout's SysEx parameters (the Matriarch's global settings), and the requests that read them back.
  const requests = [];
  const dumpDefinitions = [];
  if (layout.sysex) addSysex(data, layout, { parameters, recipes, requests, dumpDefinitions, unique, skip, notes });

  if (lsbs.length) notes.push(`${lsbs.length} knob(s) are printed as an MSB and an LSB, 0 - 16383 together; CEditor sends the MSB alone, 0 - 127, which the manual says the instrument takes by itself: ${lsbs.join('; ')}.`);
  if (corrected.length) notes.push(`Values as corrected after the manual: ${corrected.join('; ')}.`);
  for (const [why, list] of numbered) notes.push(`A number, not a choice, where ${why}: ${list.join(', ')}.`);
  for (const [why, list] of skipped) notes.push(`Left out, ${why}: ${list.join(', ')}.`);
  if (parameters.some((p) => recipes.get(p.messageRecipe)?.kind === 'nrpn')) notes.push('Each NRPN is sent with its number split as MIDI splits one (MSB n / 128, LSB n % 128) and its value as one 14-bit number, data entry MSB on CC 6 then LSB on CC 38.');

  const variables = { channel: 1, ...(layout.variables ?? {}) };
  const tests = [];
  const status = 0xb0 + variables.channel - 1;
  const of = (kind, choice) => parameters.find((p) => recipes.get(p.messageRecipe)?.kind === kind && (choice === undefined || (p.type === 'choice') === choice));
  for (const p of [...new Set([of('cc', false), of('cc', true), of('nrpn', false), of('nrpn', true), [...parameters].reverse().find((x) => recipes.get(x.messageRecipe)?.kind === 'cc')].filter(Boolean))]) {
    const r = recipes.get(p.messageRecipe);
    const choice = p.type === 'choice' ? p.choices.at(-1) : null;
    const value = choice ? choice.value : Math.min(p.range.max, Math.max(p.range.min, r.kind === 'nrpn' && p.range.max > 127 ? 1000 : 100));
    const bytes = r.kind === 'cc' ? [[r.controller, value]] : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, value >> 7], [0x26, value & 127]];
    tests.push({
      name: `${p.name} = ${choice ? choice.label : value} (${r.kind === 'cc' ? `CC ${r.controller}` : `NRPN ${r.parameterMsb * 128 + r.parameterLsb}`})`,
      parameter: p.id,
      value: choice ? choice.id : value,
      expectedHex: bytes.map(([cc, v]) => [status, cc, v].map(hex).join(' ')).join('\n'),
    });
  }
  if (layout.sysex) tests.push(...sysexTests(layout, parameters, recipes, requests, dumpDefinitions, variables));

  const profile = {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Moog',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: data.sources.map((s, i) => ({
      type: 'manual',
      title: s.title,
      notes: `${data.tables.filter((t) => (t.doc ?? 0) === i).map((t) => `${t.kind === 'nrpn' ? 'NRPN chart' : 'MIDI CC table'} (pages ${t.pages.join(', ')})`).join(' and ') || 'Read for its corrections'} read by tools/profiles/moog/read-moog-pdf.mjs from ${s.file} (sha256 ${s.sha256}), ${s.url}. Not yet checked against the instrument itself.`,
    })),
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/moog/make-profiles.mjs; edit the layout in tools/profiles/moog/synths/, not this file.',
      'Every parameter is a row of the manual\'s MIDI tables, with its printed name. Nothing here has been sent to a real instrument yet.',
      `No identity check: ${layout.noIdentity ?? 'the manual prints no Device Inquiry reply'}.`,
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    coverage: {
      singleParameterWrite: 'complete-for-the-manual\'s-midi-tables',
      realtimeEditing: 'complete-for-the-manual\'s-midi-tables',
      editBufferDumpRequest: 'notImplemented',
      editBufferDumpParse: 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'the panel sends these same messages when its MIDI settings allow',
      verifiedOnHardware: false,
      ...(layout.coverage ?? {}),
    },
    timing: { minDelayBetweenMessagesMs: 0 },
    messageRecipes: [...recipes.values()].sort((a, b) => a.kind.localeCompare(b.kind) || (a.controller ?? a.parameterMsb * 128 + a.parameterLsb ?? 0) - (b.controller ?? b.parameterMsb * 128 + b.parameterLsb ?? 0) || a.id.localeCompare(b.id)),
    parameters,
    tests,
    ...(requests.length ? { requests, dumpDefinitions } : {}),
  };
  return profile;
}

/**
 * SysEx parameters from a table the layout names (`layout.sysex`): the Matriarch's "Global parameters
 * for sysex editing", each set with `F0 04 17 23 [ID] [MSB] [LSB] 00 … [Unit ID] F7` and read back
 * with `F0 04 17 3E [ID] 00 … [Unit ID] F7`, which the instrument answers with the set message.
 */
function addSysex(data, layout, out) {
  const s = layout.sysex;
  const table = data.tables[s.table];
  const fill = (template, id) => template.map((b) => (b === '$id' ? hex(id) : b));
  const reads = [];
  for (const row of table.rows) {
    const id = Number(clean(row.id));
    const name = tidy(row.name);
    const label = `${name} (parameter ${row.id})`;
    if (!Number.isInteger(id) || !name) continue;
    const own = (s.skip ?? []).find(([pattern]) => pattern.test(name));
    if (own) { out.skip(own[1], label); continue; }
    const read = readValues(row.values, 16383);
    if (read.skip) { out.skip(read.skip, `${label}: ${clean(row.values)}`); continue; }
    // "If the intended parameter value is less than 128, then [value MSB] is 0 and [value LSB] is the
    // intended parameter value": a setting that never reaches 128 sends 00 and then its value.
    const narrow = read.choices ? read.choices.every((c) => c.value < 128) : read.max < 128;
    const template = fill(s.set, id).flatMap((b) => (b === '$encodedValue' && narrow ? ['00', '$encodedValue'] : [b]));
    const recipe = { id: `sysex${hex(id)}`, kind: 'sysex', template };
    out.recipes.set(recipe.id, recipe);
    const encoding = { type: narrow ? (read.choices ? 'enum' : 'u7') : 'u14-msb-lsb' };
    const group = s.group ?? 'Global';
    const describe = [`Parameter ${id}, set by SysEx.`];
    const dflt = /Default\s*[:=]?\s*(\d+)/i.exec(row.values ?? '');
    const base = { id: out.unique(`${camel(group)}.${camel(name)}`), name, group, description: describe.join(' '), access: { canRead: Boolean(s.request), canWrite: true, realtimeSafe: false, source: s.request ? 'sysexRequest' : 'singleParameter' }, messageRecipe: recipe.id };
    let p;
    if (read.choices && !read.bands) {
      const seen = new Set();
      const list = read.choices.map(({ value, label: l }) => { const sl = slug(l); const cid = seen.has(sl) ? `${sl}_${value}` : sl; seen.add(cid); return { id: cid, label: l, value }; });
      p = { ...base, type: 'choice', default: (list.find((c) => dflt && c.value === Number(dflt[1])) ?? list[0]).id, choices: list, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list.length === 2 ? 'ToggleButton' : list.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } };
    } else if (read.min !== undefined) {
      const d = dflt ? Number(dflt[1]) : read.min;
      p = { ...base, type: 'integer', range: { min: read.min, max: read.max }, default: d >= read.min && d <= read.max ? d : read.min, display: { mode: 'number', unit: '', shortLabel: camel(name), ...(read.shown ? { min: read.shown.min, max: read.shown.max } : {}) }, normalization: { mode: 'linear' }, encoding, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: 'Knob' } };
      if (/[a-z]/i.test(clean(row.values).replace(/\(Default[^)]*\)/i, ''))) p.description += ` Printed: ${clean(row.values)}.`;
    } else {
      out.skip('values printed as bands, which a setting by number does not take', label);
      continue;
    }
    out.parameters.push(p);
    reads.push({ id, parameter: p });
  }
  if (s.request) {
    for (const { id, parameter } of reads) {
      out.requests.push({ id: `request${hex(id)}`, name: `Request ${parameter.name}`, kind: 'sysex', template: fill(s.request, id), response: { dump: `reply${hex(id)}` }, timeoutMs: 1000, retries: 1 });
      out.dumpDefinitions.push({
        id: `reply${hex(id)}`,
        name: `${parameter.name}, as the instrument sends it`,
        kind: 'sysex',
        matcher: { prefix: fill(s.replyPrefix, id), suffix: ['F7'] },
        payload: { offset: s.valueOffset, size: 2 },
        completion: { expectedMessages: 1, expectedBytes: s.set.length },
        mappings: [{ parameter: parameter.id, offset: 0, codec: { type: 'u14-msb-lsb' } }],
      });
    }
    out.notes.push(`${reads.length} global setting(s) are read back one at a time: each request asks for one parameter, and the instrument answers with that parameter's set message, marked as a reply.`);
  }
}

function sysexTests(layout, parameters, recipes, requests, dumps, variables) {
  const s = layout.sysex;
  const tests = [];
  const sx = parameters.filter((p) => recipes.get(p.messageRecipe)?.kind === 'sysex');
  const pick = [sx.find((p) => p.type === 'choice'), sx.find((p) => p.type === 'integer' && p.range.max > 127)].filter(Boolean);
  const render = (template, value, wide) => template.flatMap((b) => (b === '$encodedValue' ? (wide ? [hex(value >> 7), hex(value & 127)] : [hex(value)]) : b.startsWith('$') ? [hex(variables[b.slice(1)])] : [b])).join(' ');
  const wideOf = (p) => p.encoding.type === 'u14-msb-lsb';
  for (const p of pick) {
    const choice = p.type === 'choice' ? p.choices.at(-1) : null;
    const value = choice ? choice.value : Math.min(p.range.max, 1000);
    tests.push({ name: `${p.name} = ${choice ? choice.label : value} (SysEx)`, parameter: p.id, value: choice ? choice.id : value, expectedHex: render(recipes.get(p.messageRecipe).template, value, wideOf(p)) });
  }
  if (requests.length && pick[0]) {
    const p = pick.at(-1);
    const req = requests.find((r) => dumps.find((d) => d.id === r.response.dump)?.mappings[0].parameter === p.id);
    const value = p.type === 'choice' ? p.choices.at(-1).value : Math.min(p.range.max, 1000);
    tests.push({ name: `${req.name}`, kind: 'request', request: req.id, expectedHex: render(req.template, 0) });
    const reply = recipes.get(p.messageRecipe).template.map((b, i) => (i === s.replyMarker ? '01' : b));
    tests.push({ name: `${p.name}, read back`, kind: 'dumpParse', inputHex: render(reply, value, wideOf(p)), expectedValues: { [p.id]: p.type === 'choice' ? p.choices.at(-1).id : value } });
  }
  return tests;
}

export { stringifyProfile };
