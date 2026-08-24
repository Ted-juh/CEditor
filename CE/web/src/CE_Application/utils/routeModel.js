// routeModel.js — one route model, three editors.
//
// The Link Mapper design doc left this as an open question: does the Mapper hold its own routes, or
// is there a shared panel route store the node-graph also reads? It answers itself the moment you
// write the second one. Three tiers are planned — the properties-panel link that exists, this
// component, and the modulation node-graph — and if each keeps its own routes then a route drawn on
// the canvas is invisible in the Mapper, a Mapper route cannot be seen as a cable, and every feature
// after them has to pick which of three to read. So: ONE route record, defined here, and the editors
// are three views of it.
//
// A ROUTE IS NOT A LINK. The existing `Links` section already routes one custom component's channel
// into another's, and it stays exactly as it is — a link is a fixed wire with no transform. A route
// adds the transform: an input window, an output window, a depth that can be negative, an offset and
// a curve. That is the difference between "these two controls are the same value" and "this control
// modulates that one".
//
// PURE. Endpoints are addressed by value rather than by object reference so a route survives being
// serialised into a panel, and so this whole file can be tested without a panel at all.

import { clamp, numberOr } from './primitives.js';

/** Per-link response shapes. `s` is the one people reach for and nobody can name. */
export const ROUTE_CURVE = {
  linear: 'linear',
  /** Slow then fast. What a filter cutoff wants, so the bottom of the sweep is usable. */
  exp: 'exp',
  /** Fast then slow. The inverse, for a parameter whose interesting end is the top. */
  log: 'log',
  /** Slow, fast, slow — a soft knee at both ends. */
  s: 's',
};

/**
 * How a route's contribution meets the target's own value.
 *
 * THIS IS THE DECISION THE DESIGN NOTE GLOSSED, and getting it wrong makes a modulation matrix
 * behave nothing like one. The note says "sum when multiple sources hit one target", which is right
 * — but summing ABSOLUTE values is not what summing means here. Two routes each mapping to half of
 * a target's range would sum to the top of it, so adding a second modulator would slam a parameter
 * that both sources are only nudging.
 *
 * So `add` (the default, and what a mod matrix means) contributes a SIGNED OFFSET in target units
 * around the target's own value, and `set` replaces it outright — which is what a one-source fan-out
 * macro wants, where the knob IS the value rather than a modulation of it.
 */
export const ROUTE_MODE = {
  add: 'add',
  set: 'set',
};

export const ROUTE_DEFAULTS = {
  enabled: true,
  // ADD, following the design note's "sum when multiple sources hit one target". A route drawn by
  // hand on a canvas is a modulation far more often than it is a replacement, and a matrix whose
  // rows replace each other by default is not a matrix.
  //
  // Changing this does not touch a single saved route. `makeRoute` writes a complete record, so
  // every route ever stored in a panel file carries an explicit `mode` and keeps whatever it was
  // authored with. The default is only what a NEW route starts as. The Macro and Router adapters
  // say `set` for themselves, because a macro knob really is the value rather than an offset to it.
  mode: ROUTE_MODE.add,
  inputMin: null,     // null = the source endpoint's own min
  inputMax: null,
  outputMin: null,    // null = the target endpoint's own min
  outputMax: null,
  depth: 1,           // negative inverts — the doc's "positive-negative alterations"
  offset: 0,          // in target units, applied after depth
  curve: ROUTE_CURVE.linear,
  condition: '',
};

/**
 * Address one end of a route.
 *
 * `kind` distinguishes a panel control's port from a device parameter, because a route may end at
 * either and the doc is explicit that "the routes ultimately drive params → MIDI out". Addressed by
 * id rather than by reference so the record survives serialisation.
 */
export function routeEndpoint({ kind = 'control', controlId = '', port = '', deviceRole = '', parameterId = '' } = {}) {
  if (kind === 'device') {
    return { kind: 'device', deviceRole: String(deviceRole || ''), parameterId: String(parameterId || '') };
  }
  return { kind: 'control', controlId: String(controlId || ''), port: String(port || 'value') };
}

/** A stable key for an endpoint — used for cycle detection and for fan-in grouping. */
export function endpointAddress(endpoint) {
  if (!endpoint) return '';
  if (endpoint.kind === 'device') return `device:${endpoint.deviceRole}:${endpoint.parameterId}`;
  return `control:${endpoint.controlId}:${endpoint.port || 'value'}`;
}

/** A route record, with every field defaulted. `id` is derived so the same route twice is the same route. */
export function makeRoute({ id = '', from = null, to = null, ...rest } = {}) {
  const source = from ? routeEndpoint(from) : routeEndpoint({});
  const target = to ? routeEndpoint(to) : routeEndpoint({});
  return {
    id: String(id || `${endpointAddress(source)}>${endpointAddress(target)}`),
    from: source,
    to: target,
    ...ROUTE_DEFAULTS,
    ...Object.fromEntries(Object.entries(rest).filter(([key]) => key in ROUTE_DEFAULTS)),
  };
}

/** Coerce whatever a panel file carried into a usable route. */
export function normalizeRoute(route) {
  if (!route) return null;
  const merged = makeRoute({
    id: route.id,
    from: route.from,
    to: route.to,
    ...route,
  });
  merged.enabled = route.enabled !== false;
  merged.mode = Object.values(ROUTE_MODE).includes(merged.mode) ? merged.mode : ROUTE_DEFAULTS.mode;
  merged.curve = Object.values(ROUTE_CURVE).includes(merged.curve) ? merged.curve : ROUTE_CURVE.linear;
  merged.depth = numberOr(merged.depth, 1);
  merged.offset = numberOr(merged.offset, 0);
  return merged;
}

/**
 * Shape a 0..1 position.
 *
 * Exponent 2 rather than a true exponential: a real exp curve never reaches its ends, so the top of
 * the sweep would never quite arrive at the target's maximum, and a knob that will not reach its own
 * top is a bug report.
 */
export function applyCurve(position, curve = ROUTE_CURVE.linear) {
  const t = clamp(numberOr(position, 0), 0, 1);
  switch (curve) {
    case ROUTE_CURVE.exp: return t * t;
    case ROUTE_CURVE.log: return 1 - (1 - t) * (1 - t);
    case ROUTE_CURVE.s: return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    default: return t;
  }
}

/** The window a route reads from the source, falling back to the endpoint's own range. */
function inputWindow(route, sourceSpec) {
  const lo = route?.inputMin === null || route?.inputMin === undefined
    ? numberOr(sourceSpec?.min, 0) : numberOr(route.inputMin, 0);
  const hi = route?.inputMax === null || route?.inputMax === undefined
    ? numberOr(sourceSpec?.max, 1) : numberOr(route.inputMax, 1);
  return { lo, hi };
}

function outputWindow(route, targetSpec) {
  const lo = route?.outputMin === null || route?.outputMin === undefined
    ? numberOr(targetSpec?.min, 0) : numberOr(route.outputMin, 0);
  const hi = route?.outputMax === null || route?.outputMax === undefined
    ? numberOr(targetSpec?.max, 1) : numberOr(route.outputMax, 1);
  return { lo, hi };
}

/**
 * What one route contributes.
 *
 * Returns `null` for a route that has nothing to say — disabled, no reading, a degenerate window —
 * so a caller can tell "contributes zero" from "does not contribute", which matters at a target
 * where several routes sum.
 *
 * AN INVERTED INPUT WINDOW IS A FEATURE, not an error: `inputMin: 127, inputMax: 0` reverses the
 * source, which is a thing people set up deliberately and a validator would helpfully break.
 */
export function evaluateRoute(route, sourceValue, { sourceSpec = null, targetSpec = null } = {}) {
  const spec = normalizeRoute(route);
  if (!spec || spec.enabled === false) return null;
  if (sourceValue === undefined || sourceValue === null) return null;

  const raw = typeof sourceValue === 'boolean' ? (sourceValue ? 1 : 0) : Number(sourceValue);
  if (!Number.isFinite(raw)) return null;

  const { lo, hi } = inputWindow(spec, sourceSpec);
  if (lo === hi) return null;   // a zero-width window has no position to report

  const position = clamp((raw - lo) / (hi - lo), 0, 1);
  const shaped = applyCurve(position, spec.curve);

  const out = outputWindow(spec, targetSpec);
  const span = out.hi - out.lo;

  if (spec.mode === ROUTE_MODE.add) {
    // A signed offset in target units. Depth scales it, so a negative depth pushes the other way,
    // and nothing is added to the target's own value here — the caller sums.
    return { value: shaped * span * spec.depth + spec.offset, mode: ROUTE_MODE.add };
  }

  return { value: out.lo + shaped * span * spec.depth + spec.offset, mode: ROUTE_MODE.set };
}

/**
 * Targets that more than one `set` route claims.
 *
 * The fan-in rule below says the LAST `set` wins as the base. That is deterministic and it is also
 * silent: two macros wired to one cutoff means one of them does nothing, and the author sees a knob
 * that turns and a parameter that ignores it. Nothing is refused here — a converter or an older
 * file can hold this and should still load — but the editor is told, so it can say which two.
 *
 * `add` routes are not contested. Summing is what they are for.
 */
export function contestedTargets(routes) {
  const byTarget = new Map();
  for (const raw of routes ?? []) {
    const route = normalizeRoute(raw);
    if (!route || route.enabled === false || route.mode !== ROUTE_MODE.set) continue;
    const address = endpointAddress(route.to);
    if (!address) continue;
    const bucket = byTarget.get(address) ?? { address, endpoint: route.to, routes: [] };
    bucket.routes.push(route.id);
    byTarget.set(address, bucket);
  }
  return [...byTarget.values()].filter((bucket) => bucket.routes.length > 1);
}

/**
 * Every target a set of routes writes, with its resulting value.
 *
 * `readSource` and `readTarget` are injected so this stays pure: the caller knows where a control's
 * value lives, and this file does not need to.
 *
 * FAN-IN RULE: `add` routes sum on top of the target's current value; a `set` route replaces it. If
 * both kinds reach one target, the LAST `set` wins as the base and the `add` routes then sum onto
 * it. That order is not arbitrary — a macro that sets a parameter and a mod wheel that nudges it is
 * the normal case, and the nudge belongs on top of the macro rather than under it.
 */
export function evaluateRoutes(routes, { readSource, readTarget = () => undefined, specFor = () => null } = {}) {
  const byTarget = new Map();

  for (const raw of routes ?? []) {
    const route = normalizeRoute(raw);
    if (!route || route.enabled === false) continue;

    const sourceAddress = endpointAddress(route.from);
    const targetAddress = endpointAddress(route.to);
    if (!sourceAddress || !targetAddress) continue;

    const contribution = evaluateRoute(route, readSource(route.from), {
      sourceSpec: specFor(route.from),
      targetSpec: specFor(route.to),
    });
    if (contribution === null) continue;

    const bucket = byTarget.get(targetAddress) ?? { endpoint: route.to, base: null, sum: 0, count: 0 };
    if (contribution.mode === ROUTE_MODE.set) bucket.base = contribution.value;
    else bucket.sum += contribution.value;
    bucket.count += 1;
    byTarget.set(targetAddress, bucket);
  }

  // Computed once from the same route list rather than tracked in the loop above, so the editor's
  // warning and the runtime's report can never disagree about which routes are fighting.
  const contested = new Map(contestedTargets(routes).map((entry) => [entry.address, entry.routes]));

  const out = [];
  for (const [address, bucket] of byTarget) {
    const spec = specFor(bucket.endpoint);
    const base = bucket.base === null ? Number(readTarget(bucket.endpoint) ?? numberOr(spec?.min, 0)) : bucket.base;
    if (!Number.isFinite(base)) continue;
    const value = base + bucket.sum;
    out.push({
      address,
      endpoint: bucket.endpoint,
      value: spec ? clamp(value, numberOr(spec.min, -Infinity), numberOr(spec.max, Infinity)) : value,
      routes: bucket.count,
      // Empty for every ordinary target. Non-empty means two `set` routes wanted this one and only
      // the last of them is in `value`.
      contested: contested.get(address) ?? [],
    });
  }
  return out;
}

/**
 * The most passes `settleRoutes` will make before it gives up.
 *
 * A chain settles in as many passes as it is long — A→B→C needs two, because the second pass is the
 * one that can see what the first wrote — so the cap has to clear the longest chain anybody would
 * really build. Eight does, comfortably, and still costs nothing when a ring makes it unreachable.
 */
export const ROUTE_PASS_LIMIT = 8;

/**
 * Evaluate routes repeatedly until nothing changes, or the pass limit stops it.
 *
 * WHY THIS EXISTS, given that `wouldCycle` already refuses to draw a loop: the editor's refusal is
 * the only thing standing between the runtime and a ring, and it only guards one door. A panel file
 * edited by hand, written by an older build, or produced by a converter can carry a cycle that
 * nothing ever asked `addRoute` about. `routeCycleWarnings` shows the author that ring; it does not
 * stop the runtime walking it. This does, and it is the belt to that brace.
 *
 * It also fixes something a single pass got wrong regardless of loops. `evaluateRoutes` reads every
 * source once, so a chain A→B→C moves one link per call: C only sees A's change on the SECOND
 * evaluation. Settling here means one source change produces one settled panel, rather than a
 * result that depends on how many times something happened to re-trigger.
 *
 * `writeTarget` is injected for the same reason `readSource` is — this file does not know where a
 * control's value lives. Returning `{ settled, cycles }` rather than throwing lets the caller decide:
 * the editor can surface the ring, and a player can carry on with the values it reached.
 */
export function settleRoutes(routes, {
  readSource,
  readTarget = () => undefined,
  writeTarget,
  specFor = () => null,
  passLimit = ROUTE_PASS_LIMIT,
} = {}) {
  let writes = 0;
  let passes = 0;

  while (passes < passLimit) {
    passes += 1;
    const results = evaluateRoutes(routes, { readSource, readTarget, specFor });

    let changed = 0;
    for (const result of results) {
      const current = Number(readTarget(result.endpoint));
      // The idempotence guard, and the reason a settled panel stops rather than re-rendering
      // forever: a target that already holds the computed value is not written.
      if (Number.isFinite(current) && current === Number(result.value)) continue;
      if (writeTarget?.(result.endpoint, result.value) === false) continue;
      changed += 1;
    }

    writes += changed;
    if (changed === 0) return { writes, passes, settled: true, cycles: [] };
  }

  // Out of passes. Either there is a ring, or somebody built a chain longer than the limit — and the
  // caller is told WHICH by being handed the rings themselves rather than a bare "did not settle".
  return { writes, passes, settled: false, cycles: routeCycles(routes) };
}

/**
 * Routes that form a cycle.
 *
 * NOT IN THE DESIGN NOTE, and the thing that would have taken the feature down. Fan-out plus a
 * visual canvas makes a loop trivially easy to draw — A modulates B, B modulates A, or a longer ring
 * nobody can see at once — and evaluating one re-triggers the other forever. Caught here, at author
 * time, so the editor can refuse the connection instead of the runtime hanging on it.
 *
 * Returns each cycle as the list of endpoint addresses around it, so the editor can say which wire
 * to remove rather than just "there is a loop somewhere".
 */
export function routeCycles(routes) {
  const edges = new Map();
  for (const raw of routes ?? []) {
    const route = normalizeRoute(raw);
    if (!route || route.enabled === false) continue;
    const from = endpointAddress(route.from);
    const to = endpointAddress(route.to);
    if (!from || !to) continue;
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from).add(to);
  }

  const cycles = [];
  const seen = new Set();
  const onPath = new Set();
  const path = [];

  const walk = (node) => {
    if (onPath.has(node)) {
      // Report from where the ring closes, not from where the walk started — the prefix that led
      // into the loop is not part of it and naming it would send somebody to the wrong wire.
      cycles.push([...path.slice(path.indexOf(node)), node]);
      return;
    }
    if (seen.has(node)) return;
    seen.add(node);
    onPath.add(node);
    path.push(node);
    for (const next of edges.get(node) ?? []) walk(next);
    path.pop();
    onPath.delete(node);
  };

  for (const node of edges.keys()) walk(node);
  return cycles;
}

/** True when adding this route would close a loop. What an editor asks before drawing a cable. */
export function wouldCycle(routes, candidate) {
  const route = normalizeRoute(candidate);
  if (!route) return false;
  if (endpointAddress(route.from) === endpointAddress(route.to)) return true;
  return routeCycles([...(routes ?? []), route]).length > routeCycles(routes ?? []).length;
}

/**
 * A route's contribution described in words, for the editor's row.
 *
 * Worth having as a function rather than as template strings in a Svelte file: the same sentence is
 * wanted by the Mapper's list, the node-graph's cable tooltip and a route's own hint, and three
 * copies would drift the moment `depth` grew a unit.
 */
export function describeRoute(route, { sourceLabel = '', targetLabel = '' } = {}) {
  const spec = normalizeRoute(route);
  if (!spec) return '';
  const verb = spec.mode === ROUTE_MODE.add ? 'modulates' : 'drives';
  const parts = [`${sourceLabel || 'source'} ${verb} ${targetLabel || 'target'}`];
  if (spec.depth !== 1) parts.push(`${spec.depth < 0 ? 'inverted, ' : ''}depth ${spec.depth}`);
  if (spec.offset !== 0) parts.push(`offset ${spec.offset > 0 ? '+' : ''}${spec.offset}`);
  if (spec.curve !== ROUTE_CURVE.linear) parts.push(`${spec.curve} curve`);
  if (spec.enabled === false) parts.push('disabled');
  return parts.join(' · ');
}
