#!/usr/bin/env node
// check-factory-banks.mjs — a maker's own factory sounds, read through a profile's dump definitions,
// as a check that the profile reads a real dump the way the instrument wrote it.
//
//   node tools/profiles/check-factory-banks.mjs <profile id or file> <bank file>... [--detail] [--as <adapter>]
//
// A profile's Pull was written from a document and never shown a dump the instrument made. A factory
// bank is a few hundred such dumps, made by the instrument (or the maker's own tools) and checked by
// whoever voiced them. Read through the profile, each one should match a dump definition, pass its
// checksum, and give every parameter a value the profile allows: a number inside its range, a choice
// in its list, a name that is text. A parameter that is out of range across many sounds is a field
// read at the wrong offset or with the wrong width; one that is out in a few is worth a look at the
// document. Neither proves the reading right — a byte that happens to fit passes — but a document
// misread in the dump layout rarely survives a whole bank.
//
// Banks are the maker's files and are not committed; the tool reads them from wherever they were
// downloaded. It understands raw SysEx (.syx, or any file of F0 … F7 messages) and Standard MIDI Files
// (SysEx events in any track). Some banks address each sound to its memory, where the profile reads
// the edit buffer; --as names an adapter (ADAPTERS below) that readdresses them, each saying from
// which document it knows the two are the same message.

import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const PROFILES = join(repo, 'CE/profiles/test');

/** Every SysEx message in a file of raw MIDI bytes: [Uint8Array], each F0 … F7. Bytes between messages are ignored. */
export function sysexMessages(bytes) {
  const out = [];
  let start = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0xf0) start = i;
    else if (bytes[i] === 0xf7 && start >= 0) { out.push(bytes.subarray(start, i + 1)); start = -1; }
    else if (bytes[i] > 0x7f && start >= 0) start = -1; // a status byte inside a message: not SysEx
  }
  return out;
}

function varLen(bytes, at) {
  let value = 0;
  let i = at;
  for (;;) {
    const b = bytes[i++];
    value = (value << 7) | (b & 0x7f);
    if (!(b & 0x80)) return [value, i];
  }
}

/** The SysEx events of a Standard MIDI File, in track order, a message split over F0 and F7 events joined: [Uint8Array]. */
export function smfSysex(bytes) {
  const text = (at) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (text(0) !== 'MThd') throw new Error('not a Standard MIDI File');
  const u32 = (at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  const out = [];
  let at = 8 + u32(4);
  while (at + 8 <= bytes.length) {
    const length = u32(at + 4);
    const end = at + 8 + length;
    if (text(at) === 'MTrk') {
      let i = at + 8;
      let running = 0;
      let open = null; // a message an F0 event began without its F7
      while (i < end) {
        [, i] = varLen(bytes, i); // delta time
        let status = bytes[i];
        if (status === 0xff) { const [n, j] = varLen(bytes, i + 2); i = j + n; continue; }
        if (status === 0xf0 || status === 0xf7) {
          const [n, j] = varLen(bytes, i + 1);
          const data = bytes.subarray(j, j + n);
          i = j + n;
          if (status === 0xf0) open = [0xf0, ...data];
          else if (open) open.push(...data);
          else continue; // an escape: raw bytes, not ours
          if (open.at(-1) === 0xf7) { out.push(Uint8Array.from(open)); open = null; }
          continue;
        }
        if (status & 0x80) { running = status; i += 1; } else status = running;
        const hi = status & 0xf0;
        i += hi === 0xc0 || hi === 0xd0 ? 1 : 2;
      }
    }
    at = end;
  }
  return out;
}

/** The SysEx messages in a bank file, whichever kind it is. */
export function bankMessages(bytes) {
  if (bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64) return smfSysex(bytes);
  return sysexMessages(bytes);
}

// Banks whose sounds are addressed to their memories where the profile reads the edit buffer. Each
// rewrites a message to the edit buffer's address and says why the rest of the message is the same.
export const ADAPTERS = {
  // Blofeld SysEx spec 1.04, Sound Dump (SNDD): F0 3E 13 dev 10 bb nn <383 bytes> ck F7, bank 00-07
  // a memory and 7F 00 the edit buffer; the checksum is the sound data's alone, so it does not change.
  'blofeld-sound': (m) => (m.length === 392 && m[1] === 0x3e && m[2] === 0x13 && m[4] === 0x10 && m[5] < 0x08 ? withBytes(m, { 5: 0x7f, 6: 0x00 }) : m),
};

function withBytes(m, at) {
  const copy = Uint8Array.from(m);
  for (const [k, v] of Object.entries(at)) copy[Number(k)] = v;
  return copy;
}

const hexOf = (m) => [...m].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

/** Whether a decoded value is one the parameter allows; the reason when not. */
export function valueProblem(parameter, value) {
  if (parameter.type === 'text') return typeof value === 'string' ? null : 'not text';
  if (parameter.type === 'choice' || parameter.type === 'enum') return typeof value === 'string' ? null : `${value} is not one of its ${parameter.choices?.length ?? 0} values`;
  if (parameter.type === 'boolean' || parameter.type === 'momentary') return null;
  const r = parameter.range;
  if (r && typeof value === 'number' && (value < r.min || value > r.max)) return `${value} outside ${r.min} - ${r.max}`;
  return null;
}

/** Read every message through the profile: { messages, matched, byDump, failures, problems, names }. */
export async function checkBank(profile, messages, { adapter } = {}) {
  const { localParseDumpMessage } = await import(join(repo, 'CE/web/src/CE_Application/stores/deviceProfileLocalEngine.js'));
  const params = new Map(profile.parameters.map((p) => [p.id, p]));
  const result = { messages: messages.length, matched: 0, byDump: {}, checksums: {}, failures: {}, problems: {}, names: [] };
  for (const raw of messages) {
    const m = adapter ? adapter(raw) : raw;
    const parsed = localParseDumpMessage(profile, hexOf(m));
    if (!parsed.ok) {
      const key = `${parsed.matchStatus}: ${parsed.error}`;
      (result.failures[key] ??= []).push(hexOf(m.subarray(0, 12)));
      continue;
    }
    result.matched += 1;
    result.byDump[parsed.dumpId] = (result.byDump[parsed.dumpId] ?? 0) + 1;
    result.checksums[parsed.checksumStatus] = (result.checksums[parsed.checksumStatus] ?? 0) + 1;
    const name = Object.entries(parsed.values).filter(([id]) => params.get(id)?.type === 'text').map(([, v]) => v).join(' / ');
    if (name) result.names.push(name);
    for (const [id, value] of Object.entries(parsed.values)) {
      const why = valueProblem(params.get(id), value);
      if (why) (result.problems[id] ??= []).push(name ? `${why} (${name})` : why);
    }
  }
  return result;
}

function loadProfile(arg) {
  const file = arg.endsWith('.json') ? resolve(arg) : join(PROFILES, `${arg}.ceditor-device.json`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function main(argv) {
  const detail = argv.includes('--detail');
  const as = argv.includes('--as') ? argv[argv.indexOf('--as') + 1] : null;
  const rest = argv.filter((a, k) => a !== '--detail' && a !== '--as' && argv[k - 1] !== '--as');
  const [profileArg, ...files] = rest;
  if (!profileArg || !files.length) {
    console.error('usage: check-factory-banks.mjs <profile id or file> <bank file>... [--detail] [--as <adapter>]');
    process.exit(2);
  }
  if (as && !ADAPTERS[as]) throw new Error(`no adapter ${as}; there are ${Object.keys(ADAPTERS).join(', ')}`);
  const profile = loadProfile(profileArg);
  const messages = files.flatMap((f) => bankMessages(new Uint8Array(readFileSync(f))));
  const r = await checkBank(profile, messages, { adapter: as ? ADAPTERS[as] : null });
  console.log(`${profile.id}: ${files.map((f) => basename(f)).join(', ')}`);
  console.log(`  ${r.messages} SysEx messages, ${r.matched} read by a dump definition (${Object.entries(r.byDump).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}); checksums ${Object.entries(r.checksums).map(([k, v]) => `${k} ${v}`).join(', ') || '-'}`);
  for (const [why, heads] of Object.entries(r.failures)) console.log(`  not read, ${heads.length}: ${why}${detail ? `\n    ${heads.slice(0, 5).join('\n    ')}` : ` (first: ${heads[0]})`}`);
  const problems = Object.entries(r.problems).sort((a, b) => b[1].length - a[1].length);
  console.log(`  parameters with a value the profile does not allow: ${problems.length} of ${profile.parameters.length}`);
  for (const [id, list] of problems) console.log(`    ${id}: ${list.length} of ${r.matched}${detail ? `\n      ${list.slice(0, 6).join('\n      ')}` : `, e.g. ${list[0]}`}`);
  if (r.names.length) console.log(`  names: ${r.names.slice(0, detail ? r.names.length : 12).join(' | ')}${!detail && r.names.length > 12 ? ' …' : ''}`);
  return r;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
