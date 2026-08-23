// captureInference.js — learning a synth from the synth.
//
// The capture-session plan's engine: given what a device does when somebody turns a knob on its
// front panel, work out which parameter that was and how it is encoded. Two modes produce evidence
// and one function reads it.
//
//   MODE A, live transmit — the device sends CC/NRPN/SysEx on edit. Watch the stream, attribute the
//   movement, read the range off a sweep.
//   MODE B, dump diff — the device sends nothing on edit but answers a dump request. Two dumps that
//   differ by one front-panel move locate a parameter exactly. This is the valuable one: it is the
//   mode that covers everything made before the mid-90s, which is precisely the population no
//   editor covers.
//
// EVERY INFERENCE CARRIES ITS CONFIDENCE AND ITS EVIDENCE, and the reason is that this feature's
// whole value is trust. A profile that is 95% right and does not say which 5% is worse than no
// profile, because the user debugs their SYNTH for an evening before suspecting the tool. So:
// high confidence writes a parameter, low confidence writes a candidate, and nothing writes silence.
//
// PURE, and that is what makes it testable without a Juno in the CI runner. The plan is explicit
// that hardware is not a test: a simulated synth with a known map, a checksum, a deliberate
// bit-field, a packed payload and a volatile counter is, and `test/support/fakeSynth.js` is it.

import { CHECKSUM_IDS, computeChecksum } from './checksums.js';

/** How much a hypothesis is trusted. The plan's table, as a value. */
export const CONFIDENCE = {
  /** Round-tripped on hardware across boundary values. */
  confirmed: 'confirmed',
  /** Consistent across three or more observations, one codec fits, nothing competes. */
  probable: 'probable',
  /** One observation, or several codecs fit equally well. */
  candidate: 'candidate',
  /** Two parameters claim the same offset or bits. */
  conflict: 'conflict',
};

/** The boundary set the schema itself names for round-trip verification. */
export const BOUNDARY_VALUES = [0, 1, 63, 64, 127, 128, 255];

// --- volatile offsets ------------------------------------------------------------------------------

/**
 * Offsets that move on their own.
 *
 * Two baselines with NOTHING changed between them; anything that differs is a counter, a live LFO
 * value, a running checksum — noise that would otherwise be attributed to whatever the user did
 * next. Done once at session start, and the whole rest of the session gets quieter.
 *
 * More than two baselines is better and the signature takes a list: a counter that only ticks every
 * few seconds shows up in the third comparison and not the first.
 */
export function volatileMask(baselines) {
  const list = (Array.isArray(baselines) ? baselines : []).filter(Array.isArray);
  const mask = new Set();
  if (list.length < 2) return mask;

  const width = Math.max(...list.map((b) => b.length));
  for (let offset = 0; offset < width; offset += 1) {
    const first = list[0][offset];
    if (list.some((payload) => payload[offset] !== first)) mask.add(offset);
  }
  return mask;
}

/** Offsets where two payloads differ, ignoring the volatile ones. */
export function diffPayloads(before, after, mask = new Set()) {
  const a = Array.isArray(before) ? before : [];
  const b = Array.isArray(after) ? after : [];
  const width = Math.max(a.length, b.length);
  const changed = [];
  for (let offset = 0; offset < width; offset += 1) {
    if (mask.has(offset)) continue;
    if (a[offset] !== b[offset]) changed.push({ offset, from: a[offset], to: b[offset] });
  }
  return changed;
}

// --- checksums -------------------------------------------------------------------------------------

/**
 * Which trailing byte is a checksum, and over what range.
 *
 * Tried against every algorithm the codebase already knows and every plausible start offset, and
 * accepted only when it holds for EVERY payload given. One payload agreeing with one algorithm is
 * a coincidence at roughly one chance in 128, which over a hundred-byte dump happens constantly.
 *
 * Returns null rather than a guess. A wrong checksum is worse than none: the profile then sends
 * messages the synth silently discards, and the symptom is "the editor does nothing".
 */
export function fitChecksum(payloads, { algorithms = CHECKSUM_IDS } = {}) {
  const list = (Array.isArray(payloads) ? payloads : []).filter((p) => Array.isArray(p) && p.length > 1);
  if (list.length < 2) return null;

  const width = list[0].length;
  if (list.some((payload) => payload.length !== width)) return null;

  for (let index = width - 1; index >= Math.max(1, width - 4); index -= 1) {
    for (const algorithm of algorithms) {
      const fits = [];
      // START SCANNED DESCENDING, so the TIGHTEST fitting range wins. A leading byte that is zero
      // in every payload contributes nothing to a sum, so both "covers it" and "does not" fit
      // equally — and the tighter answer is the one supported by evidence rather than by a
      // coincidence of zeroes. The wider ones are still reported, because the difference matters
      // the first time a device sends a non-zero header.
      for (let start = index - 1; start >= 0; start -= 1) {
        const holds = list.every((payload) => computeChecksum(algorithm, payload.slice(start, index)) === payload[index]);
        if (holds) fits.push(start);
      }
      if (fits.length) {
        return { offset: index, algorithm, start: fits[0], end: index, alsoFits: fits.slice(1) };
      }
    }
  }
  return null;
}

// --- the diff table --------------------------------------------------------------------------------

function contiguous(offsets) {
  if (offsets.length === 0) return false;
  for (let i = 1; i < offsets.length; i += 1) if (offsets[i] !== offsets[i - 1] + 1) return false;
  return true;
}

function changedBits(from, to) {
  const bits = [];
  for (let bit = 0; bit < 8; bit += 1) {
    if (((from >> bit) & 1) !== ((to >> bit) & 1)) bits.push(bit);
  }
  return bits;
}

/**
 * Read a set of diffs as a parameter.
 *
 * `observations` is a list of `{ changed, payload }` — one per captured move of the SAME control.
 * The plan's table, implemented; each branch says what it saw and how sure it is.
 *
 * The single most important input is `checksum`: without it, every diff has a spurious trailing
 * byte in it and every classification is one offset too wide. Fit it once per session and pass it.
 */
export function classifyDiff(observations, { checksum = null, payloadLength = 0 } = {}) {
  const list = (Array.isArray(observations) ? observations : []).filter((o) => Array.isArray(o?.changed));
  if (list.length === 0) {
    return { kind: 'none', confidence: CONFIDENCE.candidate, why: 'nothing changed in this dump' };
  }

  // The checksum moves with every parameter, so it is evidence of nothing and has to come out
  // before anything is counted. Its presence IS a finding, but it is a session-level one.
  const withoutChecksum = list.map((observation) => ({
    ...observation,
    changed: observation.changed.filter((entry) => entry.offset !== checksum?.offset),
  }));

  const anyEmpty = withoutChecksum.some((o) => o.changed.length === 0);
  if (anyEmpty) {
    return {
      kind: 'none',
      confidence: CONFIDENCE.candidate,
      why: 'only the checksum moved — this parameter is not in this dump, or it is in a different one',
    };
  }

  // "Everything changed" — a packed payload, or a dump carrying a timestamp the mask did not catch.
  const widest = Math.max(...withoutChecksum.map((o) => o.changed.length));
  if (payloadLength > 8 && widest > payloadLength * 0.6) {
    return {
      kind: 'packed',
      confidence: CONFIDENCE.candidate,
      why: 'most of the payload moved — it is packed, or carries a counter the baseline mask missed. '
        + 'Unpack before diffing: diffing packed bytes smears one parameter across a group and '
        + 'produces nonsense with high confidence, which is the worst failure mode there is.',
      offsets: withoutChecksum[0].changed.map((entry) => entry.offset),
    };
  }

  // Every observation should touch the same offsets — but not quite. A WIDE PARAMETER CAN LEAVE A
  // BYTE UNCHANGED between two particular values: 0x0064 → 0x1234 moves three of four nibbles
  // because the last one happens to be 4 either way. Demanding identical signatures would call that
  // "two controls were moved", which is a false negative a real session would hit constantly.
  //
  // So: if every observation is a SUBSET of the widest one and the widest is contiguous, take the
  // union — the field is as wide as the widest move proves it is. Disjoint signatures are still
  // inconsistent, because that genuinely is two controls.
  const signature = (o) => o.changed.map((entry) => entry.offset).join(',');
  const signatures = new Set(withoutChecksum.map(signature));
  const union = [...new Set(withoutChecksum.flatMap((o) => o.changed.map((e) => e.offset)))].sort((a, b) => a - b);

  if (signatures.size > 1) {
    const widest = withoutChecksum.reduce((best, o) => (o.changed.length > best.changed.length ? o : best), withoutChecksum[0]);
    const widestOffsets = new Set(widest.changed.map((entry) => entry.offset));
    const nested = withoutChecksum.every((o) => o.changed.every((entry) => widestOffsets.has(entry.offset)));

    if (!nested || !contiguous([...widestOffsets].sort((a, b) => a - b))) {
      return {
        kind: 'inconsistent',
        confidence: CONFIDENCE.candidate,
        why: `the moves touched different offsets (${[...signatures].join(' | ')}) — either two controls `
          + 'were moved, or something drifted between dumps',
        offsets: union,
      };
    }
  }

  const offsets = signatures.size > 1 ? union : withoutChecksum[0].changed.map((entry) => entry.offset);
  const enough = withoutChecksum.length >= 3;

  // Indexed by offset rather than by position: with a union signature, observation 0's third entry
  // is not necessarily the same byte as observation 1's third entry.
  const at = (observation, offset) => observation.changed.find((entry) => entry.offset === offset) ?? null;

  // ONE OFFSET: u7/u8, or a bit-field.
  if (offsets.length === 1) {
    const offset = offsets[0];
    const seen = withoutChecksum.map((o) => at(o, offset)).filter(Boolean);
    const bitsMoved = new Set(seen.flatMap((entry) => changedBits(entry.from, entry.to)));
    const values = seen.map((entry) => entry.to);
    const high = Math.max(...values, ...seen.map((entry) => entry.from));

    // A SHARED BYTE, and the test for one is stricter than "some bits did not move".
    //
    // Three conditions, and each rules out a false positive that a looser rule hits constantly:
    //
    //   contiguous  — a real bit-field is a mask and a shift, so its bits are adjacent by
    //                 construction. Bits {0,1,2,3,5,6} moving is a plain byte whose bit 4 happened
    //                 not to flip across the values observed, which on three samples is common.
    //   narrow      — at most five bits. A six-bit "field" in a seven-bit byte is almost always a
    //                 u7 that never reached the top of its range.
    //   the rest are USED — some bit outside the run is set in some observation. If every other bit
    //                 is always zero there is no evidence of a second parameter, only of a value
    //                 that stayed small, and claiming a bit-field there would invent one.
    const runBits = [...bitsMoved].sort((a, b) => a - b);
    const outsideMask = 0x7f & ~runBits.reduce((m, bit) => m | (1 << bit), 0);
    const restUsed = seen.some((entry) => (entry.to & outsideMask) !== 0 || (entry.from & outsideMask) !== 0);
    if (bitsMoved.size > 0 && bitsMoved.size <= 5 && contiguousBits(bitsMoved) && high <= 0x7f && restUsed) {
      return bitsliceHypothesis(offset, bitsMoved, enough);
    }

    return {
      kind: high > 0x7f ? 'u8' : 'u7',
      encoding: { type: high > 0x7f ? 'u8' : 'u7' },
      offsets: [offset],
      size: 1,
      confidence: enough ? CONFIDENCE.probable : CONFIDENCE.candidate,
      why: `one byte at offset ${offset}, values ${Math.min(...values)}–${Math.max(...values)}`
        + (checksum ? ', checksum moved with it' : ', no checksum in this dump'),
      observedValues: values,
    };
  }

  // TWO ADJACENT: u14, and which byte is coarse says which way round.
  if (offsets.length === 2 && contiguous(offsets)) {
    const spread = (offset) => {
      const seen = withoutChecksum.map((o) => at(o, offset)?.to).filter((v) => v !== undefined);
      return seen.length ? Math.max(...seen) - Math.min(...seen) : 0;
    };
    const firstSpread = spread(offsets[0]);
    const secondSpread = spread(offsets[1]);
    // The COARSE byte is the MSB: it moves in small steps across the whole sweep while the fine one
    // wraps repeatedly. With only two observations either could look coarse, hence the confidence.
    const msbFirst = firstSpread <= secondSpread;
    return {
      kind: msbFirst ? 'u14' : 'u14-lsb',
      encoding: { type: msbFirst ? 'u14' : 'u14-lsb' },
      offsets,
      size: 2,
      confidence: enough ? CONFIDENCE.probable : CONFIDENCE.candidate,
      why: `two adjacent bytes at ${offsets[0]}–${offsets[1]}; offset ${msbFirst ? offsets[0] : offsets[1]} `
        + 'moves in coarser steps, so it is the high byte',
    };
  }

  // N ADJACENT, ALL NIBBLES: the classic Yamaha/Korg spelling of a wide value.
  if (offsets.length >= 2 && contiguous(offsets)) {
    const allNibbles = withoutChecksum.every((o) => o.changed
      .filter((entry) => offsets.includes(entry.offset))
      .every((entry) => entry.to <= 0x0f && entry.from <= 0x0f));
    if (allNibbles) {
      return {
        kind: 'nibbles',
        encoding: { type: 'nibbles', bytes: offsets.length },
        offsets,
        size: offsets.length,
        confidence: enough ? CONFIDENCE.probable : CONFIDENCE.candidate,
        why: `${offsets.length} adjacent bytes at ${offsets[0]}–${offsets.at(-1)}, none above 0x0F — high nibble first`,
      };
    }
    return {
      kind: 'multi',
      offsets,
      size: offsets.length,
      confidence: CONFIDENCE.candidate,
      why: `${offsets.length} adjacent bytes moved and they are not all nibbles — a wide value, `
        + 'or two parameters that move together',
    };
  }

  return {
    kind: 'scattered',
    offsets,
    confidence: CONFIDENCE.candidate,
    why: `${offsets.length} non-adjacent offsets moved (${offsets.join(', ')}) — a packed or `
      + 'interleaved layout, or more than one control was touched',
  };
}

function contiguousBits(bits) {
  const list = [...bits].sort((a, b) => a - b);
  for (let i = 1; i < list.length; i += 1) if (list[i] !== list[i - 1] + 1) return false;
  return true;
}

function bitsliceHypothesis(offset, bits, enough) {
  const list = [...bits].sort((a, b) => a - b);
  return {
    kind: 'bitslice',
    encoding: { type: 'bitslice', slices: [{ byte: 0, mask: list.reduce((m, bit) => m | (1 << bit), 0), shift: list[0] }] },
    offsets: [offset],
    size: 1,
    confidence: enough ? CONFIDENCE.probable : CONFIDENCE.candidate,
    // A finding, not a failure: the other bits of this byte belong to something else, and knowing
    // that is how the session knows to ask.
    why: `only bits ${list.join(',')} of offset ${offset} moved — this byte is shared, and its other `
      + 'bits belong to a different parameter',
    sharedByte: offset,
    freeBits: [0, 1, 2, 3, 4, 5, 6, 7].filter((bit) => !bits.has(bit)),
  };
}

// --- mode A: live transmit --------------------------------------------------------------------------

/**
 * Which controller the human actually moved.
 *
 * TAKE THE ONE THAT MOVED THE MOST, NOT THE ONE THAT SPOKE FIRST. A synth idles with active
 * sensing, clock, and often a stream of unrelated CCs — first-past-the-post learns the wrong thing
 * roughly as often as it works. The Expression Router already reduces its own MIDI learn this way;
 * this is the same rule where the capture session can reach it.
 *
 * `messages` are `{ kind, controller, value, channel }`. Clock and sensing are not passed here —
 * they are not controllers — but a controller that only twitched is, and losing to a real sweep is
 * exactly what should happen to it.
 */
export function attributeLiveMovement(messages, { minTravel = 8 } = {}) {
  const byController = new Map();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || message.controller === undefined || message.controller === null) continue;
    const key = `${message.kind ?? 'cc'}:${message.channel ?? 0}:${message.controller}`;
    const entry = byController.get(key) ?? {
      key,
      kind: String(message.kind ?? 'cc'),
      channel: Number(message.channel ?? 0),
      controller: message.controller,
      values: [],
    };
    entry.values.push(Number(message.value));
    byController.set(key, entry);
  }

  const scored = [...byController.values()].map((entry) => ({
    ...entry,
    travel: Math.max(...entry.values) - Math.min(...entry.values),
    count: entry.values.length,
  })).sort((a, b) => b.travel - a.travel || b.count - a.count);

  if (scored.length === 0) return { hit: null, others: [], why: 'nothing arrived' };

  const [best, ...rest] = scored;
  if (best.travel < minTravel) {
    return {
      hit: null,
      others: scored,
      why: `nothing travelled far enough (best was ${best.travel}) — sweep the control end to end `
        + 'rather than nudging it, so the range can be read too',
    };
  }
  // A close second is a real ambiguity — two controllers ganged, or a synth echoing its own edit on
  // a second CC. Reported rather than resolved.
  const ambiguous = rest.length > 0 && rest[0].travel >= best.travel * 0.8;
  return {
    hit: best,
    others: rest,
    ambiguous,
    why: ambiguous
      ? `${best.kind} ${best.controller} moved ${best.travel}, but ${rest[0].kind} ${rest[0].controller} `
        + `moved ${rest[0].travel} — two controllers moved together`
      : `${best.kind} ${best.controller} moved ${best.travel} over ${best.count} messages`,
  };
}

/**
 * What a sweep says about a parameter's range and type.
 *
 * A single value says nothing; a full sweep says almost everything. The step COUNT separates a
 * toggle from a five-way selector from a continuous control, and a value that jumps from high to
 * low mid-sweep is a signed parameter presented as 0–127 with a bias.
 */
export function analyseSweep(values) {
  const list = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (list.length === 0) return { valueType: 'continuous', min: 0, max: 127, steps: 0, confidence: CONFIDENCE.candidate };

  const min = Math.min(...list);
  const max = Math.max(...list);
  const distinct = [...new Set(list)].sort((a, b) => a - b);

  // A stepped control lands on EVENLY SPACED values; a partial sweep of a continuous one does not.
  // That is the only discriminator available from a single pass, and it is the honest one: five
  // readings at 0, 20, 40, 80, 127 are somebody sweeping a knob, not a five-way selector, and
  // "few distinct values" alone would call it a selector every time.
  const gaps = distinct.slice(1).map((value, i) => value - distinct[i]);
  const evenlySpaced = gaps.length >= 2 && gaps.every((gap) => gap === gaps[0]) && gaps[0] > 1;

  let valueType = 'continuous';
  if (distinct.length === 2 && min === 0) valueType = 'toggle';
  else if (distinct.length <= 8 && evenlySpaced) valueType = 'enum';

  // A sweep that goes up, wraps to the bottom and comes up again is a signed value with a bias —
  // the midpoint is zero and the halves are the two signs.
  let wrapped = false;
  for (let i = 1; i < list.length; i += 1) {
    if (Math.abs(list[i] - list[i - 1]) > (max - min) * 0.6) { wrapped = true; break; }
  }

  return {
    valueType,
    min,
    max,
    steps: distinct.length,
    distinct: distinct.length <= 16 ? distinct : null,
    signed: wrapped,
    signedOffset: wrapped ? Math.round((max + min) / 2) : undefined,
    // Three or more observations, one reading, nothing competing — the plan's "probable".
    confidence: list.length >= 3 && max > min ? CONFIDENCE.probable : CONFIDENCE.candidate,
    why: max === min
      ? 'the value never changed — nothing can be said about its range'
      : `${distinct.length} distinct values across ${min}–${max}`
        + (wrapped ? ', with a jump across the middle: signed, biased' : ''),
  };
}

// --- mode C / S4: verify ------------------------------------------------------------------------------

/**
 * Round-trip one parameter against a device.
 *
 * `write` and `read` are injected, so this is the same function whether the device is real or the
 * simulated one in the tests. Boundary values first, because the schema itself names them as the
 * only way to settle `packOrder` — a codec that agrees at 64 and disagrees at 128 is the exact
 * failure this catches.
 */
export function verifyRoundTrip(parameter, { write, read, values = null } = {}) {
  const min = Number(parameter?.range?.min ?? parameter?.min ?? 0);
  const max = Number(parameter?.range?.max ?? parameter?.max ?? 127);
  const probes = (values ?? BOUNDARY_VALUES).filter((value) => value >= min && value <= max);
  if (probes.length === 0) probes.push(min, max);

  const failures = [];
  for (const value of probes) {
    write(parameter, value);
    const back = read(parameter);
    if (Number(back) !== Number(value)) failures.push({ sent: value, got: back });
  }

  return {
    ok: failures.length === 0,
    probes,
    failures,
    confidence: failures.length === 0 ? CONFIDENCE.confirmed : CONFIDENCE.conflict,
    why: failures.length === 0
      ? `round-tripped at ${probes.join(', ')}`
      : `failed at ${failures.map((f) => `${f.sent}→${f.got}`).join(', ')}`,
  };
}

// --- conflicts ------------------------------------------------------------------------------------

/**
 * Parameters claiming the same bytes.
 *
 * Two parameters at one offset is either a bit-field somebody has not split yet or a mistake, and
 * the session cannot tell which — so it asks. Bit-sliced parameters at the same offset with
 * DISJOINT masks are fine and are not reported: that is what a bit-field is.
 */
export function findConflicts(parameters) {
  const byOffset = new Map();
  for (const parameter of Array.isArray(parameters) ? parameters : []) {
    for (const offset of parameter?.offsets ?? []) {
      const bucket = byOffset.get(offset) ?? [];
      bucket.push(parameter);
      byOffset.set(offset, bucket);
    }
  }

  const conflicts = [];
  for (const [offset, list] of byOffset) {
    if (list.length < 2) continue;
    const masks = list.map((p) => p?.encoding?.slices?.[0]?.mask ?? null);
    // Disjoint bit masks at one offset are a bit-field, not a clash.
    if (masks.every((mask) => mask !== null)) {
      let overlap = false;
      for (let i = 0; i < masks.length && !overlap; i += 1) {
        for (let j = i + 1; j < masks.length; j += 1) {
          if ((masks[i] & masks[j]) !== 0) { overlap = true; break; }
        }
      }
      if (!overlap) continue;
    }
    conflicts.push({
      offset,
      parameters: list,
      confidence: CONFIDENCE.conflict,
      why: `${list.length} parameters claim offset ${offset}`
        + (masks.some((m) => m === null) ? ' and at least one is not bit-sliced' : ' with overlapping bit masks'),
    });
  }
  return conflicts;
}

/**
 * The provenance block a learned parameter carries.
 *
 * The schema already has the vocabulary — `source: 'learn'`, `verifiedRoundTrip`,
 * `verifiedOnHardware`, `confirmations` — which is a large part of why this feature is feasible
 * here. A learned parameter must always be able to answer "how do you know?", and this is the
 * answer, attached to the parameter rather than kept in a session log nobody exports.
 */
export function learnProvenance(hypothesis, { at = null, sessionId = '' } = {}) {
  return {
    source: 'learn',
    confidence: hypothesis?.confidence ?? CONFIDENCE.candidate,
    verifiedRoundTrip: hypothesis?.confidence === CONFIDENCE.confirmed,
    verifiedOnHardware: hypothesis?.confidence === CONFIDENCE.confirmed,
    confirmations: hypothesis?.confidence === CONFIDENCE.confirmed ? 1 : 0,
    evidence: String(hypothesis?.why ?? ''),
    learnedAt: at ?? new Date().toISOString(),
    sessionId: String(sessionId || ''),
  };
}
