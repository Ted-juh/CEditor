// snapshotModel.js — capture a whole panel state, recall it, and blend between two.
//
// THE FOUNDATION the groundbreaking tier sits on, and the reason it is one module rather than five:
// Macro/Snapshot-Morph, the Vector Joystick's four corners, the Crossfader's A/B, a Pad Grid
// launching scenes, Patch Diff and the Randomizer are all "blend or recall full device states".
// Pure parameter maths and MIDI; no audio anywhere in it.
//
// INTERPOLATION IS THE PART THAT NEEDS THE PROFILE, and getting it wrong is silent. A continuous
// cutoff halfway between two snapshots is the average. A five-way waveform selector halfway between
// Saw and Square is NOT "1.5" — there is no such waveform, and sending it either rounds somewhere
// arbitrary or sends a byte the synth does not recognise. A patch name has no midpoint at all. So
// every parameter gets an explicit policy, derived from the kind the export list already carries.
//
// WHAT A SNAPSHOT IS NOT: a device preset. A preset lives in the instrument's memory and is recalled
// with a program change; a snapshot is values this panel captured and recall means SENDING them.
// Both exist, they convert, and conflating them would make "recall" mean two different things.

/** How a parameter behaves between two snapshots. */
export const MORPH_POLICY = {
  /** Continuous: the midpoint is the average. */
  lerp: 'lerp',
  /** Stepped or enumerated: the midpoint is one end or the other, never between. */
  nearest: 'nearest',
  /** No midpoint exists at all — text, a patch name, a trigger. Hold the source until the end. */
  hold: 'hold',
};

/**
 * The policy for a parameter, from the kind the export list already carries.
 *
 * `valueKind` is the field S1 of Total Recall added so a selector reaches a host as an
 * AudioParameterChoice rather than an anonymous float. It answers this question too, which is why
 * nothing new has to be declared per parameter.
 */
export function morphPolicyFor(parameter) {
  const kind = String(parameter?.valueKind ?? 'float');
  if (kind === 'choice' || kind === 'bool') return MORPH_POLICY.nearest;
  if (kind === 'text' || kind === 'patchName' || kind === 'none') return MORPH_POLICY.hold;
  return MORPH_POLICY.lerp;
}

/**
 * Blend one value.
 *
 * `t` is clamped, because a Vector Joystick's corner weights can overshoot slightly with a dragged
 * puck and a parameter must never leave its range on the strength of a rounding error.
 */
export function morphValue(from, to, t, policy = MORPH_POLICY.lerp) {
  const position = Math.min(1, Math.max(0, Number(t)));

  // ABSENCE FIRST, and absence is `undefined` rather than "not a number". A snapshot that did not
  // capture this parameter should leave it wherever the other one puts it, rather than dragging it
  // toward nothing — and a `hold` parameter's value is a STRING, which is present and not numeric.
  const hasFrom = from !== undefined && from !== null;
  const hasTo = to !== undefined && to !== null;
  if (!hasFrom && !hasTo) return undefined;
  if (!hasFrom) return to;
  if (!hasTo) return from;

  // These two never do arithmetic, so they are decided before anything is coerced. A patch name has
  // no midpoint and neither does a waveform.
  if (policy === MORPH_POLICY.hold) return position >= 1 ? to : from;
  if (policy === MORPH_POLICY.nearest) {
    // Exactly 0.5 goes to `to`, so a crossfader swept up and back is symmetric rather than
    // sticking on the way out.
    return position < 0.5 ? from : to;
  }

  const a = Number(from);
  const b = Number(to);
  if (!Number.isFinite(a)) return Number.isFinite(b) ? b : undefined;
  if (!Number.isFinite(b)) return a;
  return a + (b - a) * position;
}

/**
 * Capture the current value of every parameter, or of a scope.
 *
 * `scope` is a predicate over the parameter, so "just the filter section" and "just this group" are
 * the same mechanism rather than two. A parameter whose control has never been touched is OMITTED
 * rather than recorded as its default — see readParameterValue: a snapshot full of zeroes recalls a
 * panel to zero, which is a reset wearing a snapshot's clothes.
 */
export function captureValues(parameters, readValue, scope = null) {
  const values = {};
  for (const parameter of parameters ?? []) {
    if (scope && !scope(parameter)) continue;
    const value = readValue(parameter);
    if (value === undefined || value === null || Number.isNaN(value)) continue;
    values[parameter.id] = value;
  }
  return values;
}

/** A snapshot record. `now` is injected so two captures of the same state can be compared. */
export function makeSnapshot({ id = '', name = '', values = {}, scope = '', now = null } = {}) {
  return {
    id: id || `snap_${Object.keys(values).length}_${name.replace(/\W+/g, '_').toLowerCase()}`,
    name: String(name || 'Snapshot'),
    scope: String(scope || 'panel'),
    capturedAt: now ?? new Date().toISOString(),
    values: { ...values },
  };
}

/**
 * Blend two snapshots into a value map.
 *
 * A parameter present in only ONE snapshot is carried through unchanged rather than blended toward
 * a value nobody captured. That is what makes partial snapshots — "just the filter" — composable
 * with whole-panel ones instead of quietly resetting everything they do not mention.
 */
export function morphSnapshots(from, to, t, parameters) {
  const byId = new Map((parameters ?? []).map((p) => [p.id, p]));
  const out = {};
  const ids = new Set([...Object.keys(from?.values ?? {}), ...Object.keys(to?.values ?? {})]);

  for (const id of ids) {
    const parameter = byId.get(id);
    const blended = morphValue(from?.values?.[id], to?.values?.[id], t, morphPolicyFor(parameter));
    if (blended !== undefined) out[id] = blended;
  }
  return out;
}

/**
 * Blend N snapshots by weight — the Vector Joystick's four corners, a Macro's targets.
 *
 * Weights are normalised, so a caller can hand in raw distances. A `hold` or `nearest` parameter
 * takes the value of the HEAVIEST snapshot rather than a weighted average, which is the same rule
 * the two-snapshot case follows and for the same reason: there is no waveform 1.5.
 */
export function morphWeighted(entries, parameters) {
  const list = (entries ?? []).filter((e) => e?.snapshot && Number.isFinite(Number(e.weight)) && Number(e.weight) > 0);
  if (list.length === 0) return {};

  const total = list.reduce((sum, e) => sum + Number(e.weight), 0);
  const byId = new Map((parameters ?? []).map((p) => [p.id, p]));
  const heaviest = list.reduce((best, e) => (Number(e.weight) > Number(best.weight) ? e : best), list[0]);

  const ids = new Set(list.flatMap((e) => Object.keys(e.snapshot.values ?? {})));
  const out = {};

  for (const id of ids) {
    const policy = morphPolicyFor(byId.get(id));

    if (policy !== MORPH_POLICY.lerp) {
      const value = heaviest.snapshot.values?.[id];
      // The heaviest snapshot may not carry this parameter; fall back to whichever does, by weight.
      if (value !== undefined) { out[id] = value; continue; }
      const fallback = [...list].sort((a, b) => b.weight - a.weight)
        .find((e) => e.snapshot.values?.[id] !== undefined);
      if (fallback) out[id] = fallback.snapshot.values[id];
      continue;
    }

    // Only the snapshots that actually carry the parameter contribute, and the weights are
    // re-normalised over those — otherwise a parameter in one of four corners would be dragged
    // three-quarters of the way to nothing.
    let sum = 0;
    let weight = 0;
    for (const entry of list) {
      const value = Number(entry.snapshot.values?.[id]);
      if (!Number.isFinite(value)) continue;
      sum += value * Number(entry.weight);
      weight += Number(entry.weight);
    }
    if (weight > 0) out[id] = sum / weight;
  }

  // `total` is only used to prove the caller gave us something normalisable; the per-parameter
  // renormalisation above is what actually decides each value.
  return total > 0 ? out : {};
}

/**
 * A send budget for a morph.
 *
 * A morph moves MANY parameters continuously. Sending every one on every frame floods a DIN MIDI
 * cable at 31,250 baud — roughly 1,000 bytes a second, so a three-byte CC is about 320 per second
 * shared between everything else the panel wants to say. The rule here: coalesce per frame (the
 * caller keeps only the latest value per parameter), then cap how many go out per tick, and send
 * the ones that moved MOST first so a sweep looks right even when it is being rate-limited.
 */
export function morphSendPlan(previous, next, { budget = 32 } = {}) {
  const changed = [];
  for (const [id, value] of Object.entries(next ?? {})) {
    const before = previous?.[id];
    if (before === undefined) { changed.push({ id, value, delta: Infinity }); continue; }
    const delta = Math.abs(Number(value) - Number(before));
    if (delta > 0) changed.push({ id, value, delta });
  }

  changed.sort((a, b) => b.delta - a.delta);
  return {
    send: changed.slice(0, Math.max(0, budget)),
    // Counted, not dropped silently: a caller that is permanently over budget is a caller whose
    // morph will lag, and it should be able to say so.
    deferred: Math.max(0, changed.length - Math.max(0, budget)),
  };
}

/**
 * What differs between two snapshots — the whole of Patch Diff's engine.
 *
 * Three buckets rather than one list, because "changed" and "only in A" are different questions to
 * a user: the first is an edit, the second is a parameter one side never captured.
 */
export function diffSnapshots(a, b, parameters = []) {
  const byId = new Map((parameters ?? []).map((p) => [p.id, p]));
  const left = a?.values ?? {};
  const right = b?.values ?? {};
  const ids = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();

  const changed = [];
  const onlyInA = [];
  const onlyInB = [];
  let same = 0;

  for (const id of ids) {
    const parameter = byId.get(id) ?? null;
    const inA = Object.hasOwn(left, id);
    const inB = Object.hasOwn(right, id);

    if (inA && !inB) { onlyInA.push({ id, parameter, value: left[id] }); continue; }
    if (!inA && inB) { onlyInB.push({ id, parameter, value: right[id] }); continue; }

    const from = Number(left[id]);
    const to = Number(right[id]);
    if (from === to) { same += 1; continue; }

    const span = Math.abs(Number(parameter?.max ?? 1) - Number(parameter?.min ?? 0)) || 1;
    changed.push({
      id,
      parameter,
      from,
      to,
      delta: to - from,
      // Normalised, so a cutoff moving 40 of 127 and a resonance moving 0.3 of 1 sort against each
      // other honestly. Sorting by raw delta would put every wide-range parameter on top.
      magnitude: Math.abs(to - from) / span,
    });
  }

  changed.sort((x, y) => y.magnitude - x.magnitude);
  return { changed, onlyInA, onlyInB, same, total: ids.length };
}
