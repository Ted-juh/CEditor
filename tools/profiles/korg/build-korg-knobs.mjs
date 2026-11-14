// build-korg-knobs.mjs — the microKORG (2002)'s panel knobs and switches as control changes.
//
// The MIDI Implementation's knob table (*3) names the 41 knobs and switches in their sections, with
// what each means in a synth program and in a vocoder program, and calls their control changes
// assignable. The Owner's Manual (p. 56) prints the same 41 in the same order with the control change
// each has from the factory, and the values each sends and takes, in decimal:
//
//   0...127                                              a number
//   0 / 1: –63, 2: –62...63: –1, 64: 0, 65: +1...127: +63  centred on 64, 0 and 1 both the bottom
//   sent 0: Saw, 18: Square, …  received 0...15: Saw, …   a choice, sent as the instrument sends it
//   Synth; … Vocoder; …                                  each mode's own
//
// A knob is one parameter where both modes read it alike (or the vocoder leaves it unused), named as
// the synth calls it. Where they differ it is two parameters on the one controller, the second named
// for the vocoder (`Vocoder Cutoff`) in the Vocoder group; a controller two parameters share is not
// attributed when it comes back in.

import { readHexValue } from './build-korg-hex.mjs';
import { modes } from './read-korg-om-cc.mjs';

const dash = (s) => String(s ?? '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const key = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** `0: Saw, 18: Square` / `0...15: Saw, 77..102: -1` -> [{ from, to, label }], or null. */
function entries(text) {
  // A comma between entries, or none where the page wrapped a line (`72: Vox Wave 90: DWGS`).
  const parts = dash(text).split(/(?:,\s*|\s+)(?=\d+(?:\s*\.{2,3}\s*\d+)?\s*:)/);
  const out = [];
  for (const part of parts) {
    const m = /^(\d+)(?:\s*\.{2,3}\s*(\d+))?\s*:\s*(.+)$/.exec(part.trim());
    if (!m) return null;
    out.push({ from: Number(m[1]), to: Number(m[2] ?? m[1]), label: m[3].trim() });
  }
  return out.length >= 2 ? out : null;
}

/** One mode's value, as the Owner's Manual prints what is sent and what is received. */
export function readOmValue(sentText, receivedText) {
  const sent = dash(sentText);
  const received = dash(receivedText);
  if (!received) return null;
  // `0...127`, with what changes it after a comma or star: `0...127, Tempo Sync=ON; see p.57`.
  const plain = /^0\s*\.{2,3}\s*127(?:\s*[,*]\s*(.+))?$/.exec(received);
  if (plain) return { min: 0, max: 127, ...(plain[1] ? { aside: plain[1].trim() } : {}) };
  // `see p.57`: a number whose meaning another page tabulates.
  if (/^see p\.\s*\d+$/i.test(received)) return { min: 0, max: 127, aside: received };
  // `0 / 1: L63, 2: L62...63: L01, 64: CNT, 65: R01...127: R63`.
  const centred = /^0\s*\/\s*1\s*:\s*([^,]+),.*\b64\s*:\s*([^,]+),.*\b127\s*:\s*(\S+)$/.exec(received);
  if (centred) return { min: 1, max: 127, displayMin: -63, displayMax: 63, shown: `1~127 = ${centred[1]} ~ ${centred[2]} ~ ${centred[3]}; 0 is ${centred[1]} too` };
  // A choice: each value sent falls in the range received under the same name.
  const tx = entries(sent);
  const rx = entries(received);
  if (tx && rx && tx.length === rx.length && tx.every((t, i) => t.from === t.to && key(t.label) === key(rx[i].label) && t.from >= rx[i].from && t.from <= rx[i].to)) {
    return { choices: tx.map((t, i) => ({ value: t.from, label: rx[i].label })), ranges: rx };
  }
  return null;
}

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The knob table, a row a knob: its section (and the vocoder's, where printed apart), names, value. */
export function foldKnobs(rows) {
  const out = [];
  let section = '';
  let vocoderSection = '';
  for (const { cells } of rows) {
    if (cells.length === 2) { out.push({ section: '', vocoderSection: '', synth: cells[0], vocoder: cells[0], value: cells[1] }); continue; }
    const [head, synth, vocoder, value] = cells;
    // `(AudioIn1)` under OSC2: the vocoder's name for the section, from that row on.
    if (/^\(.*\)$/.test(head)) vocoderSection = head.slice(1, -1);
    else if (head) { section = head; vocoderSection = ''; }
    out.push({ section, vocoderSection: vocoderSection || section, synth, vocoder, value });
  }
  return out;
}

/**
 * The knobs as parameter specs: { cc, name, group, read, description } with `read` as
 * readHexValue gives one (min/max, displayMin/displayMax, or choices). Throws when the two documents
 * do not print the same number of knobs.
 */
export function knobControllers(data, layout) {
  const rows = data.ownersManual?.rows ?? [];
  const knobs = foldKnobs(data.knobs ?? []);
  if (rows.length !== knobs.length) throw new Error(`${layout.id}: the Owner's Manual prints ${rows.length} knobs and the MIDI Implementation ${knobs.length}`);
  const matched = matchKnobs(rows, knobs, layout);
  const sectionName = (s) => layout.sectionNames?.[s] ?? s;
  const nameIn = (section, leaf) => {
    const group = sectionName(section);
    if (!group || (layout.unprefixed ?? []).includes(section)) return leaf;
    return key(leaf).startsWith(key(group.split(' ')[0])) ? leaf : `${group} ${leaf}`;
  };
  // A knob's vocoder half is named for the vocoder: `Vocoder Cutoff`, beside the synth's `Filter Cutoff`.
  const vocoderOf = (leaf) => `Vocoder ${leaf}`;
  const sentence = (s) => (s && !/[.!?]$/.test(s) ? `${s}.` : s);
  const page = data.ownersManual.source.printedPage;
  const aside = (text, mark) => {
    const m = /^\*?\s*(?:(.+?);\s*)?see p\.\s*(\d+)$/i.exec(text ?? '');
    const where = m ? `the Owner's Manual, p. ${m[2]}` : null;
    const fromMark = mark ? readHexValue(`*${mark}`, data.marks, data.lists).shown : null;
    if (fromMark) return `${fromMark[0].toUpperCase()}${fromMark.slice(1)}${where ? ` (and ${where})` : ''}`;
    if (m) return m[1] ? `When ${m[1]}, see ${where}` : `See ${where}`;
    return text || null;
  };
  // The knob table's marks, mode by mode (`*2-5/00~7F:0~127`), say what an aside points to.
  const cellsOf = (value) => (value.split('/').length === 2 && !/^[0-9A-F]{2}~[0-9A-F]{2}\//i.test(value) ? value.split('/') : [value, value]);
  const markOf = (cell) => /^\s*\*([\w-]+)\s*$/.exec(cell ?? '')?.[1] ?? null;
  const describe = (read, mark) => [read.shown, read.aside || (mark && read.min === 0 && read.max === 127) ? aside(read.aside, mark) : null].filter(Boolean).map(sentence);
  const specs = [];
  const notes = [];
  rows.forEach((row, i) => {
    const { knob } = matched[i];
    const sent = modes(row.sent);
    const received = modes(row.received);
    const synth = readOmValue(sent.synth, received.synth);
    if (!synth) throw new Error(`${layout.id}: CC ${row.cc} (${row.synth}): the Owner's Manual's "${received.synth}" is no value this reader knows`);
    // Whether the vocoder uses it is the Owner's Manual's word (it prints a dash where not), and so
    // are its values; its name is the MIDI Implementation's where that prints one.
    const vocoderUsed = !!row.vocoder;
    const vocoderName = knob.vocoder || row.vocoder;
    const vocoder = vocoderUsed ? readOmValue(sent.vocoder, received.vocoder) : null;
    if (vocoderUsed && !vocoder) throw new Error(`${layout.id}: CC ${row.cc} (${row.vocoder}): the Owner's Manual's "${received.vocoder}" is no value this reader knows`);
    const [synthCell, vocoderCell] = cellsOf(knob.value);
    const group = knob.section ? sectionName(knob.section) : (layout.switchGroup ?? 'Program');
    const alike = !vocoderUsed || sameValue(synth, vocoder);
    const synthWords = describe(synth, markOf(synthCell));
    if (!vocoderUsed) synthWords.push('Not used in a vocoder program.');
    else if (alike && key(vocoderName) !== key(knob.synth)) synthWords.push(`In a vocoder program: ${vocoderName}.`);
    else if (!alike) synthWords.push(`In a vocoder program this controller is ${vocoderOf(vocoderName)} instead.`);
    specs.push({ cc: row.cc, name: nameIn(knob.section, knob.synth), group, read: synth, description: synthWords.join(' '), shared: !alike });
    if (!alike) {
      const words = describe(vocoder, markOf(vocoderCell));
      words.push(`In a synth program this controller is ${nameIn(knob.section, knob.synth)} instead.`);
      specs.push({ cc: row.cc, name: vocoderOf(vocoderName), group: layout.vocoderGroup ?? 'Vocoder', read: vocoder, description: words.join(' '), shared: true });
    }
  });
  const shared = [...new Set(specs.filter((s) => s.shared).map((s) => s.cc))];
  const renamed = matched.filter((m) => m.how !== 'name').map((m) => `CC ${m.row.cc} is "${m.row.synth}" in the Owner's Manual, "${m.knob.synth}" in the MIDI Implementation`);
  notes.push(`${rows.length} panel knobs and switches on the control changes the Owner's Manual (p. ${page}) gives them from the factory; the MIDI Implementation calls them assignable (GLOBAL's Knob & Switch Ctrl Change No. Map), so an instrument set otherwise needs its own. Names and sections are the MIDI Implementation's, each knob found there by its name; values, and what each sends, the Owner's Manual's.`);
  if (shared.length) notes.push(`CC ${shared.join(', ')} mean one thing in a synth program and another in a vocoder program; each is two parameters, the second in the Vocoder group, and is not attributed to either when the instrument sends it.`);
  if (renamed.length) notes.push(`The two documents name some knobs differently; the MIDI Implementation's names are used: ${renamed.join('; ')}.`);
  return { specs, notes };
}

/** `Ctrl` in `Control`: each letter in order, the first the same. */
const abbreviates = (short, long) => {
  const a = String(short).toUpperCase().split(/\s+/);
  const b = String(long).toUpperCase().split(/\s+/);
  return a.length === b.length && a.every((w, i) => w[0] === b[i][0] && [...w].every(((at) => (c) => (at = b[i].indexOf(c, at) + 1) > 0)(0)));
};

/**
 * Each Owner's Manual row's knob in the MIDI Implementation's table: the first not yet taken with the
 * same name (the two documents print some sections in another order: the filter EG before AMP in
 * the manual, after it in the table); failing that, the same vocoder name, then a name it
 * abbreviates (`Sync Ctrl`, `Sync Control`). Throws on a row it cannot place.
 */
export function matchKnobs(rows, knobs, layout = {}) {
  const taken = new Set();
  const ways = [
    ['name', (r, k) => key(r.synth) === key(k.synth)],
    ['vocoder name', (r, k) => !!r.vocoder && !!k.vocoder && key(r.vocoder) === key(k.vocoder)],
    ['abbreviation', (r, k) => abbreviates(r.synth, k.synth)],
  ];
  return rows.map((row) => {
    for (const [how, same] of ways) {
      const at = knobs.findIndex((k, i) => !taken.has(i) && same(row, k));
      if (at >= 0) { taken.add(at); return { row, knob: knobs[at], how }; }
    }
    throw new Error(`${layout.id ?? 'knobs'}: CC ${row.cc} ("${row.synth}" in the Owner's Manual) is no knob of the MIDI Implementation's table`);
  });
}
