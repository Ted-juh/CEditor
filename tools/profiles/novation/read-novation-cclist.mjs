// read-novation-cclist.mjs — the "MIDI Controller List" and "MIDI NRPN List" appendices of Novation's
// older manuals (K-Station, KS series), and what their notation means.
//
// The list prints a row a controller: its number, what MIDI names it for (`portamento time msb`) and
// what the instrument uses it for (`PREGLIDE SEMITONES *** -12..+12 (0=preglide disabled)`); the NRPN
// list, an LSB and its use (the MSB is not sent, "assume that the NRPN msb is 0"). The manual's own
// key, above the list:
//
//   - "Unless noted, values have the range 0-127."
//   - `***` "denotes a signed value where 64 represents zero. Unless noted, this is -64..0..+63 stored
//     as 0..64..127; another example is -12..0..+12 stored as 52..64..76";
//   - `—-` a controller not used; "(see packed parameter n)" several settings in one value's bits.
//
// `pdftotext -layout` reads these single lists down the page as they stand.

import { execFileSync } from 'node:child_process';

const text = (pdf, pages) => pages.map((p) => execFileSync('pdftotext', ['-layout', '-f', String(p), '-l', String(p), pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })).join('\n');

/** The two lists as printed: { controllers: [{ number, midi, use }], nrpns: [{ lsb, use }] }. */
export function readControllerList(pdf, pages) {
  const lines = text(pdf, pages).replace(/\r/g, '').split('\n');
  const controllers = [];
  const nrpns = [];
  let list = null;
  for (const line of lines) {
    if (/^\s*MIDI Controller List\s*$/.test(line)) { list = 'cc'; continue; }
    if (/^\s*MIDI NRPN List\s*$/.test(line)) { list = 'nrpn'; continue; }
    // The packed parameters' details follow, under a heading of their own.
    if (/^\s*(MIDI NRPN List\s*-\s*)?Packed (Parameters?|Controller)\b/i.test(line)) { list = null; continue; }
    if (list === 'cc') {
      // The use starts at the first word in capitals (or `—-`); MIDI's own name for it is lower case.
      const m = /^\s*(\d{1,3})\s+(.*)$/.exec(line);
      if (!m || Number(m[1]) > 127) continue;
      const split = /^(.*?)\s*((?:[A-Z][A-Z0-9]|[A-Z]\s|[A-Z]$|[—-]{2}).*)$/.exec(m[2]);
      controllers.push({ number: Number(m[1]), midi: (split ? split[1] : m[2]).trim(), use: (split ? split[2] : '').trim() });
    } else if (list === 'nrpn') {
      const m = /^\s*(\d{1,3})\s{2,}(\S.*?)\s*$/.exec(line);
      if (m && Number(m[1]) <= 127) { nrpns.push({ lsb: Number(m[1]), use: m[2] }); continue; }
    }
    // A use wrapped onto the next line, its bracket still open (`PART VELOCITY FUNCTION (0..15` / `= …)`).
    const last = list === 'cc' ? controllers.at(-1) : list === 'nrpn' ? nrpns.at(-1) : null;
    const more = /^\s{6,}(\S.*?)\s*$/.exec(line);
    if (last && more && (last.use.match(/\(/g) ?? []).length > (last.use.match(/\)/g) ?? []).length) last.use = `${last.use} ${more[1]}`;
  }
  return { controllers, nrpns };
}

/**
 * What a use says: { name, min, max, shownMin?, shownMax?, choices?, note?, skip? } in the manual's
 * key. `skip` says why a row is not a parameter here.
 */
export function readUse(use) {
  const s = String(use ?? '').replace(/\s+/g, ' ').trim();
  if (!s || /^[—-]+/.test(s)) return { skip: 'not used (`—-`)' };
  if (/see packed parameter/i.test(s)) return { skip: 'a packed parameter, several settings in one value\'s bits', name: s.replace(/\s*\(see packed parameter[^)]*\)/i, '') };
  if (/IGNORED|USED FOR NRPN|^NRPN NUMBER/i.test(s)) return { skip: 'part of the NRPN messages or ignored' };
  if (/^(ALL NOTES OFF|RESET CONTROLLERS|LOCAL ON\/OFF)/i.test(s)) return { skip: 'a channel mode message' };
  if (/^BANK SELECT\b/i.test(s)) return { skip: 'Bank Select, part of preset recall' };
  if (/^RESERVED$/i.test(s)) return { skip: 'reserved' };
  const receiveOnly = /\(receive only\)/i.test(s);
  let rest = s.replace(/\s*\(receive only\)/i, '');
  const signed = /\*\*\*/.test(rest);
  rest = rest.replace(/\s*\*\*\*\s*/, ' ').trim();
  let out = null;
  // `0..5 = up, down, ud1, ud2, order, random`: a value each, in order.
  const listed = /\(?\s*(\d+)\s*\.\.\s*(\d+)\s*=\s*([^)]*?)\)?\s*$/.exec(rest);
  if (listed) {
    const names = listed[3].split(',').map((x) => x.trim()).filter(Boolean);
    const [lo, hi] = [Number(listed[1]), Number(listed[2])];
    if (names.length === hi - lo + 1) out = { name: rest.slice(0, listed.index).trim(), min: lo, max: hi, choices: names.map((label, i) => ({ value: lo + i, label })) };
  }
  // `(0=internal 1=external)`, `0=TIME 1=PERMANENT`, `(0,1,2 = a, b, c)`: values named by number.
  const pairs = /\(?((?:\d+\s*=\s*[^=()]+?\s+)+\d+\s*=\s*[^=()]+?)\)?\s*$/.exec(rest);
  const commas = /\(\s*((?:\d+\s*,\s*)+\d+)\s*=\s*([^)]*)\)\s*$/.exec(rest);
  if (!out && pairs) {
    const entries = [...pairs[1].matchAll(/(\d+)\s*=\s*(.+?)(?=\s+\d+\s*=|$)/g)].map((m) => ({ value: Number(m[1]), label: m[2].trim() }));
    // A choice where they cover their range (`0=soft 1=hard`); points on a scale (`0=off 64=full
    // vocoder 127=modulator only`) stay a number, said.
    const covers = entries.every((e, i) => e.value === entries[0].value + i);
    if (entries.length >= 2 && covers) out = { name: rest.slice(0, pairs.index).trim(), min: Math.min(...entries.map((e) => e.value)), max: Math.max(...entries.map((e) => e.value)), choices: entries };
  }
  if (!out && commas) {
    const values = commas[1].split(',').map(Number);
    const names = commas[2].split(',').map((x) => x.trim()).filter(Boolean);
    if (names.length === values.length) out = { name: rest.slice(0, commas.index).trim(), min: Math.min(...values), max: Math.max(...values), choices: values.map((value, i) => ({ value, label: names[i] })) };
  }
  if (!out && signed) {
    // `-12..+12`: stored around 64; with no range, -64..+63 stored as 0..127.
    const r = /(-\d+)\s*\.\.\s*\+?(\d+)/.exec(rest);
    const [lo, hi] = r ? [Number(r[1]), Number(r[2])] : [-64, 63];
    out = { name: (r ? rest.slice(0, r.index) : rest.replace(/\s*\(.*\)\s*$/, '')).trim(), min: 64 + lo, max: 64 + hi, shownMin: lo, shownMax: hi };
    const after = r ? rest.slice(r.index + r[0].length).trim() : (/\(.*\)\s*$/.exec(rest)?.[0] ?? '');
    if (after) out.note = after.replace(/^\(|\)$/g, '');
  }
  // `(64..191 bpm)`: 0..127, shown as 64..191.
  const shown = !out ? /\s*\((\d+)\s*\.\.\s*(\d+)\s*([a-zA-Z%]+)?\)\s*$/.exec(rest) : null;
  if (shown && Number(shown[2]) - Number(shown[1]) === 127) out = { name: rest.slice(0, shown.index).trim(), min: 0, max: 127, shownMin: Number(shown[1]), shownMax: Number(shown[2]), ...(shown[3] ? { unit: shown[3] } : {}) };
  if (!out) {
    // `0..34 (non-sync, 32Triplet..12bars)`: its own range.
    const r = /^(.*?)\s*\(?(\d+)\s*\.\.\s*(\d+)\)?\s*(?:\((.*)\))?\s*([a-z]+)?\s*$/.exec(rest);
    if (r && Number(r[3]) - Number(r[2]) === 127 && Number(r[2]) > 0) out = { name: r[1].trim(), min: 0, max: 127, shownMin: Number(r[2]), shownMax: Number(r[3]), note: [r[4], r[5]].filter(Boolean).join(' ') || undefined };
    else if (r && Number(r[3]) <= 127) out = { name: r[1].trim(), min: Number(r[2]), max: Number(r[3]), note: r[4] };
    else {
      const paren = /\s*\(([^)]*)\)\s*$/.exec(rest);
      out = { name: (paren ? rest.slice(0, paren.index) : rest).trim(), min: 0, max: 127, ...(paren ? { note: paren[1] } : {}) };
    }
  }
  if (receiveOnly) out.receiveOnly = true;
  return out;
}
