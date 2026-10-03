/**
 * transitionSelection.js — which animation plays, given what just changed.
 *
 * An Animation has a trigger: "from hover to pressed", or "when value.normalized changes". For
 * the first year of this app the runtime read none of it. Every animation's timing went onto
 * every change of the properties it targets, the last one in the document winning a shared
 * property, so `pressIn` (80ms) and `hoverIn` (120ms) on the same scale could never differ, and a
 * "when the value changes" glide also ran when the pointer arrived.
 *
 * A CSS transition takes its timing from the style in force AFTER a change, so choosing the
 * timing needs the frame before as well as this one. The runtime that resolves a control is pure
 * and has no "before"; the renderer that keeps a control on screen does. So the catalog
 * (interactionRuntime.js) lists every animation with its trigger, and a tracker held by the
 * renderer remembers the previous frame and picks.
 *
 * THE RULES, in the order they decide:
 *
 *  1. A STATE change enters some states and leaves others. The empty set is the state "default".
 *     An animation plays FORWARD when a state in its `to` is entered and the frame before matched
 *     its `from` ('*' or an empty list matches anything). It plays in REVERSE when a state in its
 *     `to` is left and the frame after matches its `from` — unless `reverse` is false. A forward
 *     match on a named state outranks a forward match on '*', which outranks a reverse match.
 *  2. A VALUE change plays the animations whose `source` changed, filtered by `origin`: "user"
 *     only while the pointer or keyboard is on the control, "external" only when it is not (MIDI
 *     coming back from the synth, host automation, a script).
 *  3. When a property has no match this frame:
 *       - on a state change, it gets no transition, so it snaps. That is what "from * to pressed"
 *         means: hovering does not use it. EXCEPT while a transition chosen earlier could still
 *         be running (its duration and delay have not elapsed): that one stays, because clearing
 *         a property's transition mid-flight makes CSS jump it to the end. Pressing a knob enters
 *         Pressed and, a moment later, Dragging; the press must not be cut short by the drag.
 *       - on a value-only change, it keeps what it had, for the same reason — a hover lift still
 *         running when a wheel turn arrives finishes.
 *  4. While the control is being DRAGGED, value-change animations are dropped, including ones a
 *     previous frame chose. A pointer gliding 140ms behind the mouse is lag, not animation.
 *  5. With reduced motion on — the preview's switch or the operating system's — nothing animates.
 *  6. Ties go to the animation later in the document, as they always have.
 */

import { readSignalSource } from './interactionRuntime.js';

const DEFAULT_STATE = 'default';

function stateSet(states) {
  const set = new Set((Array.isArray(states) ? states : [])
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean));
  if (!set.size) set.add(DEFAULT_STATE);
  return set;
}

const isAny = (list) => !list.length || list.includes('*');

function listMatches(list, set) {
  if (isAny(list)) return true;
  for (const state of set) if (list.includes(state)) return true;
  return false;
}

function sameValue(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  return false;
}

/** Whether the person is on the control right now — what makes a value change "theirs". */
function userIsOnControl(signals) {
  return signals?.hover === true || signals?.pressed === true || signals?.dragging === true || signals?.focused === true;
}

/**
 * What changed between two frames.
 * `previous` is null on the first frame, which counts as nothing having changed.
 */
export function describeChange(previous, next) {
  if (!previous) {
    return { first: true, stateChanged: false, entered: new Set(), exited: new Set(), before: stateSet([]), after: stateSet(next?.activeStates), changedSource: () => false };
  }
  const before = stateSet(previous.activeStates);
  const after = stateSet(next?.activeStates);
  const entered = new Set([...after].filter((state) => !before.has(state)));
  const exited = new Set([...before].filter((state) => !after.has(state)));
  const cache = new Map();
  const changedSource = (source) => {
    if (!cache.has(source)) {
      cache.set(source, !sameValue(readSignalSource(source, previous.signals), readSignalSource(source, next?.signals)));
    }
    return cache.get(source);
  };
  return {
    first: false,
    stateChanged: entered.size > 0 || exited.size > 0,
    entered,
    exited,
    before,
    after,
    changedSource,
  };
}

/**
 * How strongly an animation claims this change — 0 when it does not.
 * Forward on a named state 4, forward on '*' 3, a value change 2, reverse 1.
 */
export function matchStrength(entry, change, signals) {
  const trigger = entry?.trigger ?? {};
  if (trigger.type === 'valueChange') {
    if (!change.changedSource(trigger.source)) return 0;
    if (trigger.origin === 'user' && !userIsOnControl(signals)) return 0;
    if (trigger.origin === 'external' && userIsOnControl(signals)) return 0;
    return 2;
  }
  if (trigger.type !== 'stateChange' || !change.stateChanged) return 0;
  const to = trigger.to ?? [];
  const from = trigger.from ?? [];
  if (isAny(to)) {
    return listMatches(from, change.before) ? 3 : 0;
  }
  for (const state of change.entered) {
    if (to.includes(state) && listMatches(from, change.before)) return 4;
  }
  if (trigger.reverse !== false) {
    for (const state of change.exited) {
      if (to.includes(state) && listMatches(from, change.after)) return 1;
    }
  }
  return 0;
}

const emptyPartBucket = () => ({ transform: null, opacity: null, size: null, colour: null });

/**
 * Pick each property's transition for this change.
 *
 * Returns `{ root, parts }` where root maps bucket → { css, via } and parts maps part name → the
 * same. `via` is the trigger type that put it there, which is how a drag knows what to drop.
 */
export function selectTransitions(catalog, change, { signals = {}, previous = null, reducedMotion = false, now = 0 } = {}) {
  const root = new Map();
  const parts = new Map();
  if (!catalog?.enabled || reducedMotion || catalog?.reducedMotion) return { root, parts };

  const dragging = signals?.dragging === true;
  const valueOnly = !change.stateChanged;

  // Rule 3: a value-only change keeps everything the previous frame had; a state change keeps only
  // what may still be in flight. A kept pick is re-read from the catalog as it is NOW: an animation
  // edited in the tab since (a new duration, a new curve) carries its new timing, and one switched
  // off, deleted, or no longer aimed at that property lets go of it.
  if (previous) {
    const byName = new Map((catalog.entries ?? []).map((entry) => [entry.name, entry]));
    const carry = (pick, aims) => {
      if (!valueOnly && !((pick.until ?? 0) > now)) return null;
      const entry = byName.get(pick.name);
      if (!entry || !aims(entry)) return null;
      return entry.css === pick.css ? pick : { ...pick, css: entry.css };
    };
    for (const [bucket, pick] of previous.root) {
      const kept = carry(pick, (entry) => entry.root.has(bucket));
      if (kept) root.set(bucket, kept);
    }
    for (const [part, buckets] of previous.parts) {
      const store = new Map();
      for (const [bucket, pick] of buckets) {
        const kept = carry(pick, (entry) => entry.parts.get(part)?.has(bucket) === true);
        if (kept) store.set(bucket, kept);
      }
      if (store.size) parts.set(part, store);
    }
  }
  if (change.first) return { root, parts };

  // What a carried-over pick holds its bucket with: nothing, so any match this frame replaces it.
  const strengths = new Map();   // "<part>|<bucket>" -> strength of what holds it
  const claim = (key, strength, store, bucket, pick) => {
    const held = strengths.get(key) ?? 0;
    // `>=` so a later animation wins a tie, as the old union did.
    if (strength >= held) {
      strengths.set(key, strength);
      store.set(bucket, pick);
    }
  };

  for (const entry of catalog.entries ?? []) {
    if (dragging && entry.trigger?.type === 'valueChange') continue;
    const strength = matchStrength(entry, change, signals);
    if (!strength) continue;
    const pick = { css: entry.css, via: entry.trigger.type, name: entry.name, until: now + (entry.span ?? 0) };
    for (const bucket of entry.root) claim(`|${bucket}`, strength, root, bucket, pick);
    for (const [part, buckets] of entry.parts) {
      const store = parts.get(part) ?? new Map();
      parts.set(part, store);
      for (const bucket of buckets) claim(`${part}|${bucket}`, strength, store, bucket, pick);
    }
  }

  if (dragging) {
    for (const [bucket, pick] of root) if (pick.via === 'valueChange') root.delete(bucket);
    for (const store of parts.values()) {
      for (const [bucket, pick] of store) if (pick.via === 'valueChange') store.delete(bucket);
    }
  }
  return { root, parts };
}

/** The selection in the shape the renderers already read: bucket → CSS string. */
export function selectionToTransitions(selection) {
  const rootTransitions = new Map();
  const partTransitions = new Map();
  for (const [bucket, pick] of selection?.root ?? []) rootTransitions.set(bucket, pick.css);
  for (const [part, store] of selection?.parts ?? []) {
    if (!store.size) continue;
    const bucket = emptyPartBucket();
    for (const [name, pick] of store) bucket[name] = pick.css;
    partTransitions.set(part, bucket);
  }
  return { rootTransitions, partTransitions };
}

/**
 * What a catalog animates, as a string: two catalogs with the same key give the same selection for
 * the same change. The tracker uses it to tell a re-render with nothing new from an edit.
 */
export function catalogKey(catalog) {
  if (!catalog) return '';
  const head = `${catalog.enabled !== false ? 1 : 0}${catalog.reducedMotion === true ? 1 : 0}`;
  return head + (catalog.entries ?? []).map((entry) => {
    const parts = [...(entry.parts ?? new Map())].map(([part, buckets]) => `${part}:${[...buckets].join('+')}`).join(',');
    const t = entry.trigger ?? {};
    return `|${entry.name};${entry.css};${[...(entry.root ?? [])].join('+')};${parts};${t.type};${(t.from ?? []).join('+')};${(t.to ?? []).join('+')};${t.reverse};${t.source};${t.origin}`;
  }).join('');
}

/**
 * One control's memory of the frame before. A renderer keeps one per control on screen and calls
 * `next(runtime)` each time the control resolves; it returns the transitions for that frame in
 * the renderers' shape, plus `fired` — the names of the animations that claimed this change, which
 * the Animation tab shows as they happen.
 */
export function createTransitionTracker({ now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
  let previousFrame = null;
  let previousSelection = null;
  let previousKey = '';
  let last = { rootTransitions: new Map(), partTransitions: new Map(), fired: [] };

  return {
    next(runtime, { reducedMotion = false } = {}) {
      const frame = { activeStates: runtime?.activeStates ?? [], signals: runtime?.signals ?? {} };
      const change = describeChange(previousFrame, frame);
      const quiet = !change.first && !change.stateChanged
        && !(runtime?.transitions?.entries ?? []).some((entry) => entry.trigger?.type === 'valueChange' && change.changedSource(entry.trigger.source));
      const draggingFlip = previousFrame && (previousFrame.signals?.dragging === true) !== (frame.signals?.dragging === true);
      // An edit in the Animation tab, or either reduced-motion switch, changes the catalog without
      // changing anything an animation listens to. That is not a quiet frame.
      const key = `${reducedMotion ? 1 : 0}${catalogKey(runtime?.transitions)}`;
      const edited = key !== previousKey;
      previousFrame = frame;
      previousKey = key;
      if (quiet && !draggingFlip && !edited && previousSelection) {
        // Nothing an animation listens to changed: keep the transitions exactly as they were, so a
        // re-render for some unrelated reason never interrupts one in flight.
        return { rootTransitions: last.rootTransitions, partTransitions: last.partTransitions, fired: [] };
      }
      const selection = selectTransitions(runtime?.transitions, change, {
        signals: frame.signals,
        previous: previousSelection,
        reducedMotion,
        now: now(),
      });
      previousSelection = selection;
      const fired = [];
      if (!change.first) {
        for (const entry of runtime?.transitions?.entries ?? []) {
          if (matchStrength(entry, change, frame.signals) && !(frame.signals?.dragging === true && entry.trigger?.type === 'valueChange')) fired.push(entry.name);
        }
      }
      last = { ...selectionToTransitions(selection), fired };
      return last;
    },
    reset() {
      previousFrame = null;
      previousSelection = null;
      previousKey = '';
      last = { rootTransitions: new Map(), partTransitions: new Map(), fired: [] };
    },
  };
}
