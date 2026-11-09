/**
 * Which parameter did that message come from?
 *
 * Everything else here runs one way. A control writes a value, the profile's recipe turns it into
 * MIDI, it goes out. This is the half that reads the arrow backwards, so the panel can follow the
 * instrument: turn a knob on the synth and the control on screen moves.
 *
 * The shape is not invented. Player.svelte already carried `ccIn` (cc -> parameter) and `sysexIn`
 * (address -> parameter) from a hand-emitted runtime map, with a comment saying "first pass — later
 * sourced from the device profile". That map covers 39 of the GAIA's 793 parameters and names 12
 * that the profile no longer has. This is the generalization it asks for.
 *
 * Three things carry the weight.
 *
 * DERIVED FROM THE COMPILER, NOT FROM THE RECIPES. The obvious build reads messageRecipes and works
 * out each parameter's message. That is a second implementation of the message format, and
 * deviceProfileLocalEngine.js carries a comment listing four ways the last one drifted from the C++
 * — a clamped checksum, a checksum over the header, an ignored algorithm, $address dropped entirely
 * — each of which made a preview disagree with an export. So this asks the compiler instead:
 * compile a parameter at several values and keep the bytes that do not move.
 *
 * PREFIXES, NOT WHOLE MESSAGES. What identifies a message always comes first — a CC's status and
 * controller, a DT1's header and address — and what varies always comes after. Matching on a prefix
 * therefore needs nothing to be true about how the VALUE is encoded, and that independence has
 * already earned itself: this was written while the GAIA declared an encoder neither engine could
 * run (see nibbledEncoding.test.js), and the index was correct throughout. Value widths are the
 * part of a profile that gets got wrong.
 *
 * MASKS, SO THE SESSION'S VARIABLES DO NOT HAVE TO MATCH. A compiled message bakes in whatever
 * `$deviceId` and `$channel` happened to be, but neither identifies the parameter — a GAIA set to
 * device id 17 sends the same edit as one set to 16. The hand-written parser this replaces knew
 * that, by ignoring byte 2 of a DT1 and the low nibble of a CC status: correct, and hardcoded MIDI
 * semantics. Here it is derived the same way as everything else. Compile each parameter under two
 * deliberately different variable sets and keep, per byte, only the BITS that agree. A DT1's device
 * id byte comes out masked to 0x80 (any 7-bit value matches) and a CC status to 0xF0 (any channel,
 * but still only a CC — a note-on does not slip through a whole-byte wildcard).
 *
 * EVERY variable the profile declares is varied, not just those two, and the session's own values
 * decide what the masks then cannot. The JP-08 sends its Upper part on `$channel` and its Lower part
 * on `$lowerChannel`. Varying `channel` alone masked the Upper part's channel and left the Lower's
 * pinned to channel 2, so the two fingerprints overlapped: `B1 4A 40` matched both, the Upper came
 * first, and every Lower knob moved the Upper control. Varying both gives them the same head, which
 * is the truth — on the wire, which part a CC belongs to is a fact about the session, not the
 * message. So when a message matches more than one parameter equally well, each is compiled under
 * the session's actual variables (the profile's own when the session sets none) and the one that
 * produces exactly this head wins. A message only one parameter can mean still matches on any
 * channel; two parameters that differ only by session variables need those variables to be right,
 * because nothing else can tell them apart. If they still cannot be told apart, the answer is
 * `ambiguous`, never a guess.
 */

import {
  decodeParameterValue,
  encodeParameterValue,
  localCompileParameter,
  parameterValueWidth,
} from '../stores/deviceProfileLocalEngine.js';

/** Values to compile a parameter at when it declares no usable range. */
const FALLBACK_PROBES = [0, 1, 42, 127];

/**
 * Values to compile THIS parameter at, spread across the range it actually declares.
 *
 * Not a fixed set, and the difference is not cosmetic. A four-nibble parameter carries its value as
 * 0x0N per byte, most significant first, so every value below 4096 leaves the top two bytes at zero.
 * Probing 0..127 made those two bytes look as fixed as the address, the prefix swallowed them, and
 * the value was then read two bytes late — a wrong number from a message that matched. Spanning the
 * declared range moves every byte the parameter can move.
 */
function probeValues(parameter) {
  if (parameter?.type === 'choice' && parameter.choices?.length) {
    // Sparse choice tables need valid wire values, not arbitrary range probes.
    return [...new Set(parameter.choices.map(choice => Number(choice.value)))];
  }
  const min = Number(parameter?.range?.min);
  const max = Number(parameter?.range?.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return FALLBACK_PROBES;
  const span = max - min;
  const values = [min, min + Math.floor(span / 3), min + Math.floor((span * 2) / 3), max];
  return [...new Set(values.map((v) => Math.round(v)))];
}

/**
 * Variable sets to compile each parameter under, to find the bits that do not identify it.
 *
 * The two must differ in every bit each field can span, or the mask comes out too tight and a real
 * message is rejected: device id across the whole 7-bit range, channel across all sixteen.
 *
 * Every other variable the profile declares goes from 0x00 to 0x7F. Nothing here knows whether one
 * is a channel or a byte, and it does not need to: the compiler clamps a channel to 1..16, so the
 * pair spans all sixteen as a channel and every bit of a 7-bit byte as a sysex token. A variable no
 * parameter uses moves nothing and costs nothing.
 */
const BASE_VARIABLE_PROBES = [
  { deviceId: 0x00, channel: 1 },
  { deviceId: 0x7f, channel: 16 },
];

function variableProbes(profile) {
  const [low, high] = BASE_VARIABLE_PROBES.map((probe) => ({ ...probe }));
  for (const name of Object.keys(profile?.variables ?? {})) {
    if (name in low) continue;
    low[name] = 0x00;
    high[name] = 0x7f;
  }
  return [low, high];
}

const U7 = { type: 'u7' };

export function bytesFromHex(hex) {
  const cleaned = String(hex ?? '').replace(/[^0-9a-f]/gi, '');
  const out = [];
  for (let i = 0; i + 1 < cleaned.length; i += 2) out.push(parseInt(cleaned.slice(i, i + 2), 16));
  return out;
}

const keyOf = (prefix, mask) => `${prefix.join(',')}/${mask.join(',')}`;

/**
 * The fixed head of one parameter's message, and which of its bits mean anything.
 *
 * `prefix` is already masked, so a byte matches when `(byte & mask[i]) === prefix[i]`. Null when the
 * parameter cannot be compiled at all, or when even its first byte varies with the value.
 *
 * `valueStart` is NOT simply the end of the prefix. When a parameter's declared range cannot move
 * its leading value bytes — a four-nibble field that only ever holds 0..255 keeps two zero bytes in
 * front of every value it sends — those bytes are genuinely constant, so they belong in the prefix
 * for matching AND in the value for decoding. Counting them here is what keeps the two consistent.
 */
export function fingerprintParameter(profile, parameterId) {
  const parameter = (profile?.parameters ?? []).find((p) => String(p?.id ?? '') === String(parameterId));
  if (!parameter) return null;

  const probes = probeValues(parameter);
  const variableSets = variableProbes(profile);
  const compile = (value, variables) => {
    const result = localCompileParameter(profile, { parameterId, value, variables });
    if (!result?.ok) return null;
    const bytes = bytesFromHex(result.hex);
    return bytes.length ? bytes : null;
  };

  const shots = [];
  for (const value of probes) {
    const shot = compile(value, variableSets[0]);
    if (!shot) return null;
    shots.push(shot);
  }

  const shortest = Math.min(...shots.map((bytes) => bytes.length));
  const raw = [];
  for (let i = 0; i < shortest; i++) {
    const byte = shots[0][i];
    if (!shots.every((bytes) => bytes[i] === byte)) break;
    raw.push(byte);
  }
  if (!raw.length) return null;

  // Keep only the bits that survive a change of session variables. A byte the other probe does not
  // reach at all is masked out entirely rather than trusted.
  const mask = raw.map(() => 0xff);
  for (let probe = 1; probe < variableSets.length; probe++) {
    const shot = compile(probes[0], variableSets[probe]);
    if (!shot) return null;
    for (let i = 0; i < raw.length; i++) {
      mask[i] &= shot[i] === undefined ? 0 : ~(raw[i] ^ shot[i]) & 0xff;
    }
  }

  // How many of the value's own leading bytes the prefix absorbed, asked of the encoder directly.
  const width = parameterValueWidth(parameter);
  const encoded = probes.map((value) => encodeParameterValue(parameter, value)?.bytes ?? []);
  let lead = 0;
  while (lead < width && encoded.every((bytes) => bytes[lead] === encoded[0][lead])) lead++;

  return {
    parameterId,
    prefix: raw.map((byte, i) => byte & mask[i]),
    mask,
    valueStart: Math.max(0, raw.length - lead),
    valueLength: width,
    encoding: parameter.encoding ?? U7,
    // The TYPE travels with the encoder. Without it the decoder sees `{type: undefined,
    // encoding: {type: 'text-ascii'}}` and falls through to the numeric path, handing back the
    // ASCII code of a patch name's first letter as the parameter's value — a plausible number from
    // a message that matched, which is exactly the failure the value WIDTH was added to prevent.
    valueType: String(parameter?.type ?? ''),
    // A switch's own wire values, which the decoder needs to read it (Tempo Sync is ON at 0).
    ...(parameter?.trueValue != null ? { trueValue: parameter.trueValue } : {}),
    ...(parameter?.falseValue != null ? { falseValue: parameter.falseValue } : {}),
    // A value this parameter is known to compile at, for compiling it again under a session's own
    // variables when they are what tells it from another parameter with the same head.
    probe: probes[0],
    source: 'compiled',
  };
}

/**
 * The messages a parameter ARRIVES on that it is never SENT on.
 *
 * A synth's own control panel does not have to echo what the editor writes. The GAIA's filter knob
 * is written as a DT1 to `10 00 0n 0C` but transmits CC 102/103/104 when you turn it, so nothing
 * derived from the write path can recognise it. The authoring schema has always modelled this as an
 * `rxLive` wire; it is declared here as `inbound` on the parameter, because a message the compiler
 * never builds cannot be discovered by compiling.
 *
 * CC only, deliberately: a declared sysex inbound would be a second hand-written message format,
 * which is the thing this module exists to avoid.
 */
function declaredInboundEntries(parameter) {
  const out = [];
  for (const wire of parameter?.inbound ?? []) {
    if (String(wire?.kind ?? '') !== 'cc') continue;
    const controller = Math.round(Number(wire.controller));
    if (!Number.isFinite(controller) || controller < 0 || controller > 127) continue;
    out.push({
      parameterId: String(parameter.id),
      prefix: [0xb0, controller],
      mask: [0xf0, 0xff],
      valueStart: 2,
      valueLength: 1,
      encoding: U7,          // a CC is one 7-bit byte whatever the parameter's own encoder is
      valueType: '',
      source: 'declared',
      valueMap: wire.valueMap,
      alternate: wire.alternate,
    });
  }
  return out;
}

/**
 * Looking a message up, without scanning every entry for it.
 *
 * Built once per index. Entries are grouped by prefix length, longest first, and within a length by
 * the prefix's last byte, which identifies the parameter (a CC's controller, a DT1's address) and so
 * is almost never masked; the few entries whose last byte is part-masked are checked at their length
 * whatever it holds. Returns every entry the message matches at the LONGEST length any of them
 * match — not merely the first — because two entries of one length can both match, and choosing
 * between them is `resolve`'s job, not the order the profile happened to list them in.
 */
function lookupFor(entries) {
  const lengths = [...new Set(entries.map((entry) => entry.prefix.length))].sort((a, b) => b - a);
  const byLastByte = new Map();
  const partMasked = new Map();
  const push = (map, key, entry) => (map.get(key) ?? map.set(key, []).get(key)).push(entry);
  for (const entry of entries) {
    const last = entry.prefix.length - 1;
    if (entry.mask[last] === 0xff) push(byLastByte, `${last + 1}:${entry.prefix[last]}`, entry);
    else push(partMasked, last + 1, entry);
  }
  const matches = (entry, bytes) => entry.prefix.every((byte, i) => (bytes[i] & entry.mask[i]) === byte);

  return (bytes) => {
    for (const length of lengths) {
      if (length > bytes.length) continue;
      const found = [
        ...(byLastByte.get(`${length}:${bytes[length - 1]}`) ?? []),
        ...(partMasked.get(length) ?? []),
      ].filter((entry) => matches(entry, bytes));
      if (found.length) return found;
    }
    return [];
  };
}

const variablesKey = (variables) =>
  JSON.stringify(Object.keys(variables ?? {}).sort().map((name) => [name, variables[name]]));

/** How many sessions' worth of compiled heads to keep. A session realistically has one or two. */
const HEAD_CACHE_LIMIT = 8;

/**
 * A parameter's head as it would be SENT under a given session's variables, asked of the compiler.
 *
 * The bits a mask throws away are exactly the ones these variables set, so this is how two
 * parameters that share a fingerprint are told apart: compile each the way the session would, and
 * see which one produced the message. Cached per variable set, because a knob sends a stream.
 * Null for a member that has no recipe to compile — a declared inbound CC.
 */
function headsFor(profile) {
  const bySession = new Map();
  return (member, variables = {}) => {
    if (member?.source !== 'compiled') return null;
    const key = variablesKey(variables);
    let heads = bySession.get(key);
    if (!heads) {
      heads = new Map();
      bySession.set(key, heads);
      if (bySession.size > HEAD_CACHE_LIMIT) bySession.delete(bySession.keys().next().value);
    }
    if (!heads.has(member.parameterId)) {
      const result = localCompileParameter(profile, { parameterId: member.parameterId, value: member.probe, variables });
      const bytes = result?.ok ? bytesFromHex(result.hex) : [];
      heads.set(member.parameterId, bytes.length >= member.prefix.length ? bytes.slice(0, member.prefix.length) : null);
    }
    return heads.get(member.parameterId);
  };
}

/**
 * Which member of the index this message belongs to, under these session variables.
 *
 * `{ member }` when exactly one parameter can mean it, `{ ambiguous: [ids] }` when more than one
 * can, null when none does. One candidate is taken as it stands, on any channel and any device id,
 * which is the tolerance the masks exist for. Several are compiled under the session's variables
 * and kept only if they produce this exact head; a declared CC has no recipe to compile, so a
 * message it shares with anything stays ambiguous.
 */
function resolve(index, bytes, variables = {}) {
  const members = (index?.lookup?.(bytes) ?? []).flatMap((entry) => entry.members);
  if (!members.length) return null;
  if (members.length === 1) return { member: members[0] };

  const exact = members.every((member) => member.source === 'compiled')
    ? members.filter((member) => {
      const head = index.headUnder?.(member, variables);
      return !!head && head.every((byte, i) => bytes[i] === byte);
    })
    : [];
  if (exact.length === 1) return { member: exact[0] };
  return { ambiguous: (exact.length ? exact : members).map((member) => member.parameterId) };
}

/**
 * Fingerprint every parameter in a profile.
 *
 * `unresolved` and `collisions` are returned rather than swallowed. A profile that indexes badly
 * will resolve little, and a caller that can say "this profile only recognises 40 of its 793
 * parameters" is more use than one showing an empty result that reads as silence from the
 * instrument.
 *
 * A collision is what `matchInbound` would call ambiguous for a message a parameter sends under the
 * profile's own variables — so the JP-08's Upper and Lower cutoff, which share a fingerprint and are
 * told apart by their channels, are not one, and two parameters on one controller still are.
 */
export function buildInboundIndex(profile) {
  const byPrefix = new Map();
  const unresolved = [];

  const add = (print) => {
    const key = keyOf(print.prefix, print.mask);
    if (!byPrefix.has(key)) byPrefix.set(key, { prefix: print.prefix, mask: print.mask, parameterIds: [], members: [] });
    const entry = byPrefix.get(key);
    entry.parameterIds.push(print.parameterId);
    entry.members.push(print);
  };

  for (const parameter of profile?.parameters ?? []) {
    const id = String(parameter?.id ?? '');
    if (!id) continue;
    const print = fingerprintParameter(profile, id);
    if (print) add(print);
    else unresolved.push(id);
    for (const declared of declaredInboundEntries(parameter)) add(declared);
  }

  // Longest first, so a more specific message wins over a shorter one that happens to be its head.
  const entries = [...byPrefix.values()].sort((a, b) => b.prefix.length - a.prefix.length);
  const index = {
    profileId: String(profile?.id ?? ''),
    entries,
    size: entries.reduce((n, e) => n + e.parameterIds.length, 0),
    unresolved,
    collisions: [],
    // Functions over the profile rather than data: how a message is looked up, and how a member is
    // compiled under a session's variables. Closures, not a side table keyed by the index, because
    // the Player keeps the index in $state and gets a proxy of it back, which no WeakMap would know.
    lookup: lookupFor(entries),
    headUnder: headsFor(profile),
  };

  const reported = new Set();
  for (const entry of entries) {
    for (const member of entry.members) {
      const head = member.source === 'compiled' ? index.headUnder(member, {}) : member.prefix;
      const hit = head ? resolve(index, head, {}) : null;
      if (!hit?.ambiguous) continue;
      const key = hit.ambiguous.join('\n');
      if (reported.has(key)) continue;
      reported.add(key);
      index.collisions.push(hit.ambiguous);
    }
  }
  return index;
}

/**
 * Which parameter sent this?
 *
 * Returns { parameterId, prefixLength } on a single match, { ambiguous: [ids] } when the profile
 * puts two parameters on the same message — picking one would bind a control to a coin toss — and
 * null when nothing matches. `variables` are the session's (a role mapping's), for the parameters
 * only they can tell apart; left out, the profile's own apply.
 */
export function matchInbound(index, hex, variables = {}) {
  const bytes = bytesFromHex(hex);
  if (!bytes.length) return null;
  const hit = resolve(index, bytes, variables);
  if (!hit) return null;
  if (hit.ambiguous) return { ambiguous: hit.ambiguous };
  return { parameterId: hit.member.parameterId, prefixLength: hit.member.prefix.length };
}

/**
 * The value bytes, still undecoded — exactly as many as this parameter's encoder occupies, so the
 * checksum and the F7 that trail a DT1 are not mistaken for part of the value.
 */
export function inboundValueBytes(index, hex, variables = {}) {
  const bytes = bytesFromHex(hex);
  const member = resolve(index, bytes, variables)?.member;
  if (!member) return [];
  const value = bytes.slice(member.valueStart, member.valueStart + member.valueLength);
  return value.length === member.valueLength ? value : [];
}

/**
 * Which parameter, and what value.
 *
 * The whole point of the module, and the reason the width matters: read a nibbled parameter as one
 * byte and you get its top nibble, which is a plausible number and the wrong one. Returns null
 * rather than guessing when the message is unknown, ambiguous, or too short to hold its own value.
 *
 * `values` are the parameters' current values, for a declared CC whose meaning depends on another
 * parameter; `variables` are the session's, as for matchInbound.
 */
export function decodeInbound(index, hex, values = {}, variables = {}) {
  const bytes = bytesFromHex(hex);
  if (!bytes.length) return null;
  const member = resolve(index, bytes, variables)?.member;
  if (!member) return null;

  const raw = bytes.slice(member.valueStart, member.valueStart + member.valueLength);
  if (raw.length !== member.valueLength) return null;
  const alternate = member.alternate;
  const mapping = alternate?.whenValues?.includes(values?.[alternate.whenParameter]) ? alternate : member;
  const parameterId = mapping === alternate ? alternate.parameterId : member.parameterId;
  if (Array.isArray(mapping.valueMap)) {
    const value = mapping.valueMap[raw[0]];
    return Number.isFinite(value) ? { parameterId, value } : null;
  }
  const value = decodeParameterValue(
    { id: parameterId, type: member.valueType, encoding: member.encoding, trueValue: member.trueValue, falseValue: member.falseValue }, raw);
  return value === null ? null : { parameterId, value };
}

/**
 * Every parameter this index can ask the instrument to read back, with the byte count to ask for.
 *
 * An RQ1 has to name a size, and the Player hardcoded one byte for everything — right for a u7 and
 * wrong for every nibbled and 14-bit parameter, which would have replied with a message the request
 * did not expect. Declared CC entries are left out: a CC is not something you can request.
 */
export function inboundReadTargets(index) {
  const out = [];
  for (const entry of index?.entries ?? []) {
    const [member, ...others] = entry.members ?? [];
    if (!member || others.length || member.source !== 'compiled') continue;
    if (entry.prefix[0] !== 0xf0 || entry.prefix.length <= 7) continue;
    out.push({
      parameterId: member.parameterId,
      address: entry.prefix.slice(7).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
      valueLength: member.valueLength,
    });
  }
  return out;
}

/**
 * The index in the shape Player.svelte already consumes: cc -> parameter, address -> parameter.
 *
 * Not the primary form — prefixes are — but the Player's map was hand-emitted and partial, and this
 * is what replacing it looks like without changing anything that reads it.
 */
export function inboundLookupMaps(index) {
  const ccIn = {};
  const sysexIn = {};

  for (const entry of index?.entries ?? []) {
    if (entry.parameterIds.length !== 1) continue;         // an ambiguous message maps to nothing
    const id = entry.parameterIds[0];
    const [first, ...rest] = entry.prefix;

    if ((first & 0xf0) === 0xb0 && rest.length >= 1) {
      ccIn[String(rest[0])] = id;
    } else if (first === 0xf0 && entry.prefix.length > 7) {
      // The address is the tail of a sysex head, after the manufacturer and command bytes. Written
      // as spaced hex, which is how the profile and the Player's map both write it.
      sysexIn[entry.prefix.slice(7).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')] = id;
    }
  }

  return { ccIn, sysexIn };
}
