/**
 * Which parameter did that message come from?
 *
 * Everything here runs one way. A control writes a value, the profile's recipe turns it into MIDI,
 * it goes out. Nothing reads the arrow backwards, so an incoming CC or DT1 sysex from the instrument
 * is just bytes: the monitor shows hex, and MIDI learn — which exists — can say a CC moved but not
 * what it means. This is the missing half, and the thing MIDI learn needs before it can bind
 * anything by name.
 *
 * The shape is not invented. Player.svelte already carries `ccIn` (cc -> parameter) and `sysexIn`
 * (address -> parameter) from a hand-emitted runtime map, with a comment saying "first pass — later
 * sourced from the device profile". That map covers 40 of the GAIA's 793 parameters. This is the
 * generalization it asks for.
 *
 * DERIVED FROM THE COMPILER, NOT FROM THE RECIPES. The obvious build reads messageRecipes and works
 * out each parameter's message. That is a second implementation of the message format, and
 * deviceProfileLocalEngine.js carries a comment listing four ways the last one drifted from the C++
 * — a clamped checksum, a checksum over the header, an ignored algorithm, $address dropped entirely
 * — each of which made a preview disagree with an export. So this asks the compiler instead:
 * compile a parameter at several values and keep the bytes that do not move.
 *
 * PREFIXES, NOT WHOLE MESSAGES, and that is load-bearing rather than tidy. What identifies a message
 * always comes first — a CC's status and controller, a DT1's header and address — and what varies
 * always comes after. Matching on a prefix therefore needs nothing to be true about how the VALUE is
 * encoded, and that independence has already earned itself once. This was written while the GAIA
 * profile declared `{type: "nibbles"}` for 622 of its parameters, a word the C++ encoder refuses and
 * the JS engine did not implement at all — the two engines disagreed about the tail of every one of
 * those messages, and the index was correct throughout, because they agreed exactly about the head.
 * That bug is fixed (see nibbledEncoding.test.js); the property that made it survivable is not an
 * accident to be tidied away. Value widths are the part of a profile that gets got wrong.
 */

import { localCompileParameter } from '../stores/deviceProfileLocalEngine.js';

/**
 * Values to compile each parameter at.
 *
 * Spread rather than adjacent: 0 and 1 differ in one low bit, so a checksum over them can land on
 * the same byte and be mistaken for part of the address, which would extend the prefix past where
 * the message stops being fixed.
 */
const PROBES = [0, 1, 42, 127];

export function bytesFromHex(hex) {
  const cleaned = String(hex ?? '').replace(/[^0-9a-f]/gi, '');
  const out = [];
  for (let i = 0; i + 1 < cleaned.length; i += 2) out.push(parseInt(cleaned.slice(i, i + 2), 16));
  return out;
}

const keyOf = (prefix) => prefix.join(',');

/**
 * The fixed head of one parameter's message: everything before the first byte that moves with the
 * value. Null when the parameter cannot be compiled at all, or when even its first byte varies.
 */
export function fingerprintParameter(profile, parameterId) {
  const shots = [];
  for (const value of PROBES) {
    const result = localCompileParameter(profile, { parameterId, value });
    if (!result?.ok) return null;
    const bytes = bytesFromHex(result.hex);
    if (!bytes.length) return null;
    shots.push(bytes);
  }

  const shortest = Math.min(...shots.map((bytes) => bytes.length));
  const prefix = [];
  for (let i = 0; i < shortest; i++) {
    const byte = shots[0][i];
    if (!shots.every((bytes) => bytes[i] === byte)) break;
    prefix.push(byte);
  }

  return prefix.length ? { parameterId, prefix } : null;
}

/**
 * Fingerprint every parameter in a profile.
 *
 * `unresolved` and `collisions` are returned rather than swallowed. A profile that indexes badly
 * will resolve little, and a caller that can say "this profile only recognises 40 of its 793
 * parameters" is more use than one showing an empty result that reads as silence from the
 * instrument.
 */
export function buildInboundIndex(profile) {
  const byPrefix = new Map();
  const unresolved = [];

  for (const parameter of profile?.parameters ?? []) {
    const id = String(parameter?.id ?? '');
    if (!id) continue;
    const print = fingerprintParameter(profile, id);
    if (!print) { unresolved.push(id); continue; }

    const key = keyOf(print.prefix);
    if (!byPrefix.has(key)) byPrefix.set(key, { prefix: print.prefix, parameterIds: [] });
    byPrefix.get(key).parameterIds.push(id);
  }

  // Longest first, so a more specific message wins over a shorter one that happens to be its head.
  const entries = [...byPrefix.values()].sort((a, b) => b.prefix.length - a.prefix.length);
  const collisions = entries.filter((e) => e.parameterIds.length > 1).map((e) => e.parameterIds);

  return {
    profileId: String(profile?.id ?? ''),
    entries,
    size: entries.reduce((n, e) => n + e.parameterIds.length, 0),
    unresolved,
    collisions,
  };
}

/**
 * Which parameter sent this?
 *
 * Returns { parameterId, prefixLength } on a single match, { ambiguous: [ids] } when the profile
 * puts two parameters on the same message — picking one would bind a control to a coin toss — and
 * null when nothing matches.
 */
export function matchInbound(index, hex) {
  const bytes = bytesFromHex(hex);
  if (!bytes.length) return null;

  for (const entry of index?.entries ?? []) {
    if (entry.prefix.length > bytes.length) continue;
    if (!entry.prefix.every((byte, i) => bytes[i] === byte)) continue;
    if (entry.parameterIds.length > 1) return { ambiguous: [...entry.parameterIds] };
    return { parameterId: entry.parameterIds[0], prefixLength: entry.prefix.length };
  }
  return null;
}

/**
 * The bytes after the head — the value, and whatever trails it.
 *
 * Deliberately not decoded into a number. Decoding needs the value encoder, which is the half the
 * two engines disagree about, so this hands back the bytes and lets a caller that knows better say
 * what they mean.
 */
export function inboundValueBytes(index, hex) {
  const bytes = bytesFromHex(hex);
  const hit = matchInbound(index, hex);
  if (!hit?.parameterId) return [];
  return bytes.slice(hit.prefixLength);
}

/**
 * The index in the shape Player.svelte already consumes: cc -> parameter, address -> parameter.
 *
 * Not the primary form — prefixes are — but the Player's map is hand-emitted and partial, and this
 * is what replacing it looks like without changing anything that reads it.
 */
export function inboundLookupMaps(index) {
  const ccIn = {};
  const sysexIn = {};

  for (const entry of index?.entries ?? []) {
    if (entry.parameterIds.length !== 1) continue;         // an ambiguous message maps to nothing
    const id = entry.parameterIds[0];
    const [first, ...rest] = entry.prefix;

    if (first >= 0xb0 && first <= 0xbf && rest.length >= 1) {
      ccIn[String(rest[0])] = id;
    } else if (first === 0xf0 && entry.prefix.length > 7) {
      // The address is the tail of a sysex head, after the manufacturer and command bytes. Written
      // as spaced hex, which is how the profile and the Player's map both write it.
      sysexIn[entry.prefix.slice(7).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')] = id;
    }
  }

  return { ccIn, sysexIn };
}
