// ce.patch — a synth's sound as a value: the part that is the same in every runtime.
//
// Design record: docs/design/ce-patch-module.md. Everything here is pure: it takes the parameters
// the device profile describes (ce.device.parameters()) and patches, and gives patches, lists and
// plans. It reads and sends nothing; the runtimes do that around it (panelRuntime.js, and the
// `@module ce.patch` sections of the Lua, JavaScript and Python preludes). The JavaScript prelude
// runs this file itself (tools/scripts/gen-patch-prelude.mjs); the Lua and Python preludes are ports
// held to the same answers by test/patchParity.test.js.
//
// A patch is a table: { device, role, scope, name, values, missing, source }, `values` parameter id
// to value in the parameter's own units, a choice by its id, as ce.device.write() takes them.
//
// The rules for each kind of value are snapshotModel.js's (a choice is one end or the other, never
// between; a name has no midpoint), applied by profile parameter id. Numbers blend in a straight
// line between the two values: the descriptor a runtime has carries no curve, so "along the
// parameter's curve" waits for one.
//
// `say(level, text)` reports a refused call ('error') or a name the profile does not have ('warn').

export const PATCH_LEAVE_OUT_GROUPS = ['system', 'global', 'utility', 'performance'];
const DEFAULT_SEED = 0x9E3779B9;
const NUMBER_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/* -------------------------------------------------------------------------------- helpers */

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUMBER_TEXT.test(v.trim())) return Number(v.trim());
  return NaN;
}

function opt(opts, key) {
  return opts && typeof opts === 'object' ? opts[key] : undefined;
}

/** A list option: a list of texts, or one text. Anything else is none. */
function names(v) {
  if (typeof v === 'string') return v === '' ? [] : [v];
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const x of v) if (typeof x === 'string' && x !== '') out.push(x);
  return out;
}

function lower(s) {
  return String(s ?? '').toLowerCase();
}

function contains(list, value) {
  for (const x of list) if (x === value) return true;
  return false;
}

function hasValue(values, id) {
  return values !== null && typeof values === 'object' && Object.prototype.hasOwnProperty.call(values, id)
    && values[id] !== undefined && values[id] !== null;
}

function copyValues(values) {
  const out = {};
  if (values && typeof values === 'object') {
    for (const key of Object.keys(values)) if (values[key] !== undefined && values[key] !== null) out[key] = values[key];
  }
  return out;
}

/** Half away from zero, as every prelude rounds. */
function roundHalfAway(x) {
  return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
}

/* ----------------------------------------------------------------------- parameter kinds */

/** 'number', 'choice', 'text' or 'action', from the descriptor ce.device.parameters() gives. */
export function patchKind(desc) {
  const type = String(desc?.type ?? '');
  if (type === 'action' || type === 'momentary' || type === 'trigger') return 'action';
  if (type === 'text') return 'text';
  if (type === 'choice' || type === 'boolean' || type === 'enum' || type === 'bool') return 'choice';
  if (Array.isArray(desc?.choices) && desc.choices.length > 0) return 'choice';
  return 'number';
}

function writable(desc) {
  const access = desc?.access;
  if (typeof access === 'string') return lower(access).indexOf('write') >= 0;
  if (access && typeof access === 'object' && access.canWrite === false) return false;
  return true;
}

function isWhole(desc) {
  const type = String(desc?.type ?? '');
  return type !== 'float';
}

function rangeOf(desc) {
  const range = desc?.range && typeof desc.range === 'object' ? desc.range : {};
  const lo = toNumber(range.min);
  const hi = toNumber(range.max);
  const a = Number.isFinite(lo) ? lo : 0;
  const b = Number.isFinite(hi) ? hi : 127;
  return a <= b ? [a, b] : [b, a];
}

/** The values a choice takes, as patches hold them: its ids, or true/false for an on/off. */
function choicesOf(desc) {
  const out = [];
  if (Array.isArray(desc?.choices)) {
    for (const c of desc.choices) {
      if (c && typeof c === 'object') {
        if (c.id !== undefined && c.id !== null) out.push(c.id);
        else if (c.value !== undefined && c.value !== null) out.push(c.value);
      } else if (c !== undefined && c !== null) {
        out.push(c);
      }
    }
  }
  if (out.length === 0 && (String(desc?.type ?? '') === 'boolean' || String(desc?.type ?? '') === 'bool')) {
    out.push(false);
    out.push(true);
  }
  return out;
}

/** A number put back where the synth can take it: its step (a whole number unless float) and range. */
function settle(desc, v) {
  let x = v;
  if (isWhole(desc)) x = roundHalfAway(x);
  const [lo, hi] = rangeOf(desc);
  if (x < lo) x = lo;
  if (x > hi) x = hi;
  return x;
}

function sameValue(desc, a, b) {
  const x = toNumber(a);
  const y = toNumber(b);
  if (typeof a !== 'boolean' && typeof b !== 'boolean' && Number.isFinite(x) && Number.isFinite(y)) {
    // Two numbers closer than the parameter's step are the same value.
    return Math.abs(x - y) < (isWhole(desc) ? 0.5 : 1e-9);
  }
  if (a === b) return true;
  if (a === undefined || a === null || b === undefined || b === null) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  // Synths pad a name to its length, so "INIT  " and "INIT" are one name.
  return String(a).replace(/\s+$/, '') === String(b).replace(/\s+$/, '');
}

/* -------------------------------------------------------------------------------- scopes */

function leftOutGroup(desc) {
  return contains(PATCH_LEAVE_OUT_GROUPS, lower(desc?.group));
}

function matchesNameList(desc, list) {
  const group = lower(desc?.group);
  for (const name of list) {
    if (name === desc?.id) return true;
    if (group !== '' && lower(name) === group) return true;
  }
  return false;
}

/**
 * The parameters a scope holds, in the profile's order. `defs` is the scopes a profile's `patch`
 * section or define() describes, by id: { groups, only, except }. Without one, "voice" is every
 * parameter but actions and the System, Global, Utility and Performance groups, and "system" those
 * groups. Unknown scope: null.
 */
export function patchScopeParams(params, scope, defs) {
  const list = Array.isArray(params) ? params : [];
  const id = String(scope ?? 'voice');
  const def = defs && typeof defs === 'object' ? defs[id] : undefined;
  const out = [];
  if (def && typeof def === 'object') {
    const groups = names(def.groups);
    const only = names(def.only);
    const except = names(def.except);
    for (const desc of list) {
      if (patchKind(desc) === 'action') continue;
      if ((groups.length > 0 || only.length > 0) && !matchesNameList(desc, groups) && !contains(only, desc?.id)) continue;
      if (matchesNameList(desc, except)) continue;
      out.push(desc);
    }
    return out;
  }
  if (id === 'voice') {
    for (const desc of list) if (patchKind(desc) !== 'action' && !leftOutGroup(desc)) out.push(desc);
    return out;
  }
  if (id === 'system') {
    for (const desc of list) if (patchKind(desc) !== 'action' && leftOutGroup(desc)) out.push(desc);
    return out;
  }
  return null;
}

/** The scope's one text parameter, which holds the patch name; none or several: ''. */
export function patchNameParameter(scoped) {
  let found = '';
  for (const desc of scoped) {
    if (patchKind(desc) !== 'text') continue;
    if (found !== '') return '';
    found = String(desc.id);
  }
  return found;
}

/* ------------------------------------------------------------------- choosing parameters */

function warnUnknown(scoped, list, what, verb, say, words) {
  for (const name of list) {
    if (words && contains(words, name)) continue;
    let known = false;
    for (const desc of scoped) {
      if (desc?.id === name || (lower(desc?.group) !== '' && lower(desc?.group) === lower(name))) { known = true; break; }
    }
    if (!known) say('warn', `ce.patch.${verb}: the profile has no parameter or group "${name}" in this scope, in ${what}; the rest goes ahead.`);
  }
}

/**
 * The ids a command works on, in the profile's order, from the options every command shares; null
 * when `groups` and `only` leave nothing (said). `forApply` keeps the patch name and the parameters
 * the synth cannot be sent, which apply sends or lists as skipped rather than leaving out.
 */
export function patchChoose(scoped, opts, say, verb, forApply) {
  const groups = names(opt(opts, 'groups'));
  const only = names(opt(opts, 'only'));
  const except = names(opt(opts, 'except'));
  const include = names(opt(opts, 'include'));
  warnUnknown(scoped, groups, 'groups', verb, say, null);
  warnUnknown(scoped, only, 'only', verb, say, null);
  warnUnknown(scoped, except, 'except', verb, say, null);
  warnUnknown(scoped, include, 'include', verb, say, ['name', 'readOnly', 'leaveOut']);
  warnUnknown(scoped, names(opt(opts, 'lock')), 'lock', verb, say, null);
  const chosen = [];
  for (const desc of scoped) {
    const included = matchesNameList(desc, include);
    if (!forApply && !included) {
      if (patchKind(desc) === 'text' && !contains(include, 'name')) continue;
      if (!writable(desc) && !contains(include, 'readOnly')) continue;
    }
    if ((groups.length > 0 || only.length > 0) && !matchesNameList(desc, groups) && !contains(only, desc?.id)) continue;
    if (matchesNameList(desc, except)) continue;
    chosen.push(String(desc.id));
  }
  if (chosen.length === 0 && (groups.length > 0 || only.length > 0)) {
    say('error', `ce.patch.${verb}: groups and only leave no parameter chosen, so nothing was done.`);
    return null;
  }
  return chosen;
}

function lockedIds(scoped, opts) {
  const lock = names(opt(opts, 'lock'));
  const out = [];
  for (const desc of scoped) if (matchesNameList(desc, lock)) out.push(String(desc.id));
  return out;
}

function byId(scoped) {
  const map = {};
  for (const desc of scoped) map[String(desc.id)] = desc;
  return map;
}

/* --------------------------------------------------------------------------------- patches */

export function isPatch(p) {
  return p !== null && typeof p === 'object' && !Array.isArray(p) && p.values !== null && typeof p.values === 'object';
}

/** A patch of the same synth and scope as `base`, holding `values`. */
export function patchMake(base, values, scoped, source) {
  const missing = [];
  for (const desc of scoped) {
    if (patchKind(desc) !== 'action' && !hasValue(values, String(desc.id))) missing.push(String(desc.id));
  }
  const nameId = patchNameParameter(scoped);
  const patch = {
    device: String(base?.device ?? ''),
    role: String(base?.role ?? 'mainSynth'),
    scope: String(base?.scope ?? 'voice'),
    values,
    missing,
    source,
  };
  if (nameId !== '' && hasValue(values, nameId)) patch.name = String(values[nameId]);
  else if (typeof base?.name === 'string') patch.name = base.name;
  return patch;
}

function samePatches(a, b, verb, what, say) {
  if (!isPatch(a) || !isPatch(b)) {
    say('error', `ce.patch.${verb}: ${what} must be patches, as ce.patch.current() gives them, so nothing was done.`);
    return false;
  }
  if (String(a.device ?? '') !== String(b.device ?? '') || String(a.scope ?? '') !== String(b.scope ?? '')) {
    say('error', `ce.patch.${verb}: a patch of ${String(b.device ?? '')} (${String(b.scope ?? '')}) cannot be used with one of ${String(a.device ?? '')} (${String(a.scope ?? '')}), so nothing was done.`);
    return false;
  }
  return true;
}

function clamp01(v) {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return NaN;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/* ------------------------------------------------------------------------------ transforms */

/** ce.patch.morph: part of the way from `a` (t = 0) to `b` (t = 1). */
export function patchMorph(a, b, t, scoped, opts, say) {
  if (!samePatches(a, b, 'morph', 'a and b', say)) return undefined;
  const at = clamp01(t);
  if (Number.isNaN(at)) {
    say('error', 'ce.patch.morph: t must be a number from 0 to 1, so nothing was done.');
    return undefined;
  }
  let switchAt = clamp01(opt(opts, 'switchAt'));
  if (Number.isNaN(switchAt)) switchAt = 0.5;
  const ids = patchChoose(scoped, opts, say, 'morph', false);
  if (ids === null) return undefined;
  const locked = lockedIds(scoped, opts);
  const descs = byId(scoped);
  const out = copyValues(a.values);
  for (const key of Object.keys(b.values)) if (!hasValue(out, key) && hasValue(b.values, key)) out[key] = b.values[key];
  for (const id of ids) {
    if (contains(locked, id) || !hasValue(a.values, id) || !hasValue(b.values, id)) continue;
    const desc = descs[id];
    const kind = patchKind(desc);
    if (kind === 'number') {
      const x = toNumber(a.values[id]);
      const y = toNumber(b.values[id]);
      if (Number.isFinite(x) && Number.isFinite(y)) out[id] = settle(desc, x + (y - x) * at);
    } else if (kind === 'choice') {
      out[id] = at < switchAt ? a.values[id] : b.values[id];
    }
  }
  return patchMake(a, out, scoped, 'made');
}

/** ce.patch.blend: several patches, each counting as much as its weight. */
export function patchBlend(patches, weights, scoped, opts, say) {
  if (!Array.isArray(patches) || patches.length < 2) {
    say('error', 'ce.patch.blend: patches must be a list of two or more patches, so nothing was done.');
    return undefined;
  }
  for (let i = 1; i < patches.length; i += 1) if (!samePatches(patches[0], patches[i], 'blend', 'patches', say)) return undefined;
  const w = [];
  let total = 0;
  for (let i = 0; i < patches.length; i += 1) {
    const n = Array.isArray(weights) ? toNumber(weights[i]) : NaN;
    const v = Number.isFinite(n) && n > 0 ? n : 0;
    w.push(v);
    total += v;
  }
  if (!(total > 0)) {
    say('error', 'ce.patch.blend: the weights add up to 0 or less, so nothing was done.');
    return undefined;
  }
  const ids = patchChoose(scoped, opts, say, 'blend', false);
  if (ids === null) return undefined;
  const locked = lockedIds(scoped, opts);
  const descs = byId(scoped);
  const out = copyValues(patches[0].values);
  for (let i = 1; i < patches.length; i += 1) {
    for (const key of Object.keys(patches[i].values)) if (!hasValue(out, key) && hasValue(patches[i].values, key)) out[key] = patches[i].values[key];
  }
  for (const id of ids) {
    if (contains(locked, id)) continue;
    const desc = descs[id];
    const kind = patchKind(desc);
    if (kind === 'number') {
      let sum = 0;
      let weight = 0;
      for (let i = 0; i < patches.length; i += 1) {
        const x = toNumber(hasValue(patches[i].values, id) ? patches[i].values[id] : undefined);
        if (!Number.isFinite(x) || w[i] <= 0) continue;
        sum += x * w[i];
        weight += w[i];
      }
      if (weight > 0) out[id] = settle(desc, sum / weight);
    } else if (kind === 'choice') {
      let best = -1;
      for (let i = 0; i < patches.length; i += 1) {
        if (!hasValue(patches[i].values, id) || w[i] <= 0) continue;
        if (best < 0 || w[i] > w[best]) best = i;
      }
      if (best >= 0) out[id] = patches[best].values[id];
    }
  }
  return patchMake(patches[0], out, scoped, 'made');
}

/** A seeded xorshift32, as ce.math's: the same numbers in every language. Returns next() in [0, 1). */
export function patchRandomSource(seed) {
  const n = toNumber(seed);
  let x = Number.isFinite(n) ? (Math.floor(n) % 4294967296 + 4294967296) % 4294967296 : 0;
  if (x === 0) x = DEFAULT_SEED;
  return () => {
    x = (x ^ ((x << 13) >>> 0)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ ((x << 5) >>> 0)) >>> 0;
    return x / 4294967296;
  };
}

function withinRange(desc, within) {
  let [lo, hi] = rangeOf(desc);
  const narrow = within && typeof within === 'object' ? within[String(desc.id)] : undefined;
  if (Array.isArray(narrow) && narrow.length >= 2) {
    const a = toNumber(narrow[0]);
    const b = toNumber(narrow[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const low = Math.max(lo, Math.min(a, b));
      const high = Math.min(hi, Math.max(a, b));
      if (low <= high) { lo = low; hi = high; }
    }
  }
  return [lo, hi];
}

/** ce.patch.random: `from` with every chosen value drawn anew, within each parameter's range. */
export function patchRandom(from, scoped, opts, next, say) {
  if (!isPatch(from)) {
    say('error', 'ce.patch.random: from must be a patch, as ce.patch.current() gives them, so nothing was done.');
    return undefined;
  }
  const ids = patchChoose(scoped, opts, say, 'random', false);
  if (ids === null) return undefined;
  const locked = lockedIds(scoped, opts);
  const descs = byId(scoped);
  const within = opt(opts, 'within');
  const out = copyValues(from.values);
  for (const id of ids) {
    if (contains(locked, id)) continue;
    const desc = descs[id];
    const kind = patchKind(desc);
    if (kind === 'number') {
      const [lo, hi] = withinRange(desc, within);
      const r = next();
      out[id] = isWhole(desc) ? Math.min(Math.floor(hi), Math.ceil(lo) + Math.floor(r * (Math.floor(hi) - Math.ceil(lo) + 1))) : lo + r * (hi - lo);
    } else if (kind === 'choice') {
      const choices = choicesOf(desc);
      const r = next();
      if (choices.length > 0) out[id] = choices[Math.min(choices.length - 1, Math.floor(r * choices.length))];
    }
  }
  return patchMake(from, out, scoped, 'made');
}

/** ce.patch.mutate: every chosen value moved a little, at random. */
export function patchMutate(patch, amount, scoped, opts, next, say) {
  if (!isPatch(patch)) {
    say('error', 'ce.patch.mutate: patch must be a patch, as ce.patch.current() gives them, so nothing was done.');
    return undefined;
  }
  const by = clamp01(amount);
  if (Number.isNaN(by)) {
    say('error', 'ce.patch.mutate: amount must be a number from 0 to 1, so nothing was done.');
    return undefined;
  }
  const ids = patchChoose(scoped, opts, say, 'mutate', false);
  if (ids === null) return undefined;
  const locked = lockedIds(scoped, opts);
  const descs = byId(scoped);
  const out = copyValues(patch.values);
  for (const id of ids) {
    if (contains(locked, id) || !hasValue(out, id)) continue;
    const desc = descs[id];
    const kind = patchKind(desc);
    if (kind === 'number') {
      const x = toNumber(out[id]);
      if (!Number.isFinite(x)) continue;
      const [lo, hi] = rangeOf(desc);
      // Two draws, so a small move is more likely than a large one.
      const r1 = next();
      const r2 = next();
      out[id] = settle(desc, x + (r1 - r2) * by * (hi - lo));
    } else if (kind === 'choice') {
      const r1 = next();
      const r2 = next();
      if (r1 >= by) continue;
      const others = [];
      for (const c of choicesOf(desc)) if (!sameValue(desc, c, out[id])) others.push(c);
      if (others.length > 0) out[id] = others[Math.min(others.length - 1, Math.floor(r2 * others.length))];
    }
  }
  return patchMake(patch, out, scoped, 'made');
}

/** ce.patch.merge: `base` with the chosen parameters taken from `other`. */
export function patchMerge(base, other, scoped, opts, say) {
  if (!samePatches(base, other, 'merge', 'base and other', say)) return undefined;
  if (names(opt(opts, 'groups')).length === 0 && names(opt(opts, 'only')).length === 0) {
    say('error', 'ce.patch.merge: name the parameters to take, with groups or only; taking every value is other itself, so nothing was done.');
    return undefined;
  }
  const ids = patchChoose(scoped, opts, say, 'merge', false);
  if (ids === null) return undefined;
  const locked = lockedIds(scoped, opts);
  const out = copyValues(base.values);
  for (const id of ids) if (!contains(locked, id) && hasValue(other.values, id)) out[id] = other.values[id];
  return patchMake(base, out, scoped, 'made');
}

/* ------------------------------------------------------------------------------ comparing */

/** ce.patch.diff: { id, name, group, from, to } for each chosen parameter whose value differs. */
export function patchDiff(a, b, scoped, opts, say) {
  if (!samePatches(a, b, 'diff', 'a and b', say)) return undefined;
  const ids = patchChoose(scoped, opts, say, 'diff', false);
  if (ids === null) return undefined;
  const descs = byId(scoped);
  const out = [];
  for (const id of ids) {
    const inA = hasValue(a.values, id);
    const inB = hasValue(b.values, id);
    if (!inA && !inB) continue;
    if (inA && inB && sameValue(descs[id], a.values[id], b.values[id])) continue;
    const entry = { id, name: String(descs[id]?.name ?? id), group: String(descs[id]?.group ?? '') };
    if (inA) entry.from = a.values[id];
    if (inB) entry.to = b.values[id];
    out.push(entry);
  }
  return out;
}

/** ce.patch.equal: no chosen parameter differs. */
export function patchEqual(a, b, scoped, opts, say) {
  const d = patchDiff(a, b, scoped, opts, say);
  if (d === undefined) return undefined;
  return d.length === 0;
}

/* -------------------------------------------------------------------------------- sending */

/**
 * What apply sends: { send: [[id, value]], values, skipped: [{ id, why }] }. `values` is everything
 * the panel takes (every chosen value the patch holds); `send` the ones to send, without those the
 * synth already has when `changedOnly` is on (`known`: what the synth last had, by id).
 */
export function patchApplyPlan(patch, known, scoped, opts, say) {
  const ids = patchChoose(scoped, opts, say, 'apply', true);
  if (ids === null) return null;
  const descs = byId(scoped);
  const changedOnly = opt(opts, 'changedOnly') !== false;
  const send = [];
  const values = {};
  const skipped = [];
  for (const id of ids) {
    if (!hasValue(patch.values, id)) continue;
    const value = patch.values[id];
    values[id] = value;
    if (!writable(descs[id])) { skipped.push({ id, why: 'the synth cannot be sent it' }); continue; }
    if (changedOnly && hasValue(known, id) && sameValue(descs[id], known[id], value)) continue;
    send.push([id, value]);
  }
  // Sorted, so every language lists them in the same order (a Lua table has none of its own).
  for (const key of Object.keys(patch.values).sort()) {
    if (!Object.prototype.hasOwnProperty.call(descs, key)) skipped.push({ id: key, why: 'not a parameter of this scope' });
  }
  return { send, values, skipped };
}

/**
 * apply(p, { live = true }): the ones that moved most first, at most `budget`; the rest wait for the
 * next apply without `live`. Returns { now, later } as lists of [id, value].
 */
export function patchLivePlan(send, known, scoped, budget) {
  const descs = byId(scoped);
  const moved = [];
  for (let i = 0; i < send.length; i += 1) {
    const [id, value] = send[i];
    const [lo, hi] = rangeOf(descs[id]);
    const x = toNumber(value);
    const y = toNumber(hasValue(known, id) ? known[id] : undefined);
    const delta = Number.isFinite(x) && Number.isFinite(y) ? Math.abs(x - y) / ((hi - lo) || 1) : 2;
    moved.push([delta, i]);
  }
  // By how far it moved, then by the profile's order; the same in every language.
  moved.sort((p, q) => (q[0] - p[0]) || (p[1] - q[1]));
  const now = [];
  const later = [];
  for (let k = 0; k < moved.length; k += 1) (k < budget ? now : later).push(send[moved[k][1]]);
  return { now, later };
}

/* ------------------------------------------------------------------------------ commands */

const SEND_MODES = ['auto', 'parameters', 'dump', 'none'];
const LIVE_BUDGET = 32;
const DEFINE_FIELDS = ['name', 'groups', 'only', 'except', 'dumps', 'read', 'transform'];
const STORE_PREFIX = 'ce.patch:';

function listOfScopes(section) {
  const out = [];
  const scopes = section && typeof section === 'object' ? section.scopes : undefined;
  if (Array.isArray(scopes)) for (const s of scopes) if (s && typeof s === 'object' && typeof s.id === 'string' && s.id !== '') out.push(s);
  return out;
}

/**
 * The commands, over a runtime's host: `{ say(level, text), profile(role), parameters(role),
 * read(id, role), write(id, value, role), fill(values), snapshot(), restore(values),
 * requestDump(kind, fn, opts), sendDump(kind), setVariable(name, value, role), patchSection(role),
 * random(), now(), store: { get(key), set(key, value), keys(), remove(key) } }`.
 */
export function patchCommands(host) {
  const say = (level, text) => host.say(level, text);
  const defined = {};     // role -> scope id -> spec, from define()
  const waiting = {};     // role + scope -> [[id, value]] a live apply left for later

  function context(role) {
    const r = typeof role === 'string' && role !== '' ? role : 'mainSynth';
    const profile = host.profile(r);
    if (!profile || typeof profile !== 'object' || typeof profile.id !== 'string' || profile.id === '') {
      return { role: r, device: 'panel', params: null, section: null };
    }
    const params = host.parameters(r);
    const section = host.patchSection(r);
    return { role: r, device: profile.id, params: Array.isArray(params) ? params : [], section: section && typeof section === 'object' ? section : null };
  }

  function scopeDefs(ctx) {
    const defs = {};
    for (const s of listOfScopes(ctx.section)) defs[s.id] = s;
    const own = defined[ctx.role];
    if (own) for (const id of Object.keys(own)) defs[id] = own[id];
    return defs;
  }

  function panelDescriptors(values) {
    const out = [];
    // By name, so every language gives them in one order.
    for (const name of Object.keys(values && typeof values === 'object' ? values : {}).sort()) {
      const v = values[name];
      const type = typeof v === 'number' ? 'float' : typeof v === 'boolean' ? 'boolean' : 'text';
      out.push({ id: name, name, group: '', type });
    }
    return out;
  }

  function scoped(ctx, scope, verb) {
    if (ctx.params === null) {
      if (scope !== 'voice') {
        say('error', `ce.patch.${verb}: a panel without a device profile has one scope, "voice", so nothing was done.`);
        return null;
      }
      return panelDescriptors(host.snapshot());
    }
    const list = patchScopeParams(ctx.params, scope, scopeDefs(ctx));
    if (list === null) say('error', `ce.patch.${verb}: "${scope}" is not a scope of ${ctx.device}, so nothing was done. ce.patch.scopes() lists them.`);
    return list;
  }

  function forPatch(patch, verb) {
    if (!isPatch(patch)) {
      say('error', `ce.patch.${verb}: that is not a patch, as ce.patch.current() gives them, so nothing was done.`);
      return null;
    }
    const ctx = context(typeof patch.role === 'string' ? patch.role : 'mainSynth');
    if (String(patch.device ?? '') !== ctx.device) {
      say('error', `ce.patch.${verb}: the patch is one of ${String(patch.device ?? '')}, and this panel's synth is ${ctx.device}, so nothing was done.`);
      return null;
    }
    const list = scoped(ctx, String(patch.scope ?? 'voice'), verb);
    return list === null ? null : { ctx, list };
  }

  function scopeOf(scope, opts) {
    if (typeof scope === 'string' && scope !== '') return scope;
    const fromOpts = opt(opts, 'scope');
    return typeof fromOpts === 'string' && fromOpts !== '' ? fromOpts : 'voice';
  }

  function current(scope, opts) {
    const ctx = context(opt(opts, 'role'));
    const id = scopeOf(scope, opts);
    const list = scoped(ctx, id, 'current');
    if (list === null) return undefined;
    // The choosing options narrow what is captured; without them, the whole scope.
    const narrowed = names(opt(opts, 'groups')).length > 0 || names(opt(opts, 'only')).length > 0 || names(opt(opts, 'except')).length > 0;
    const ids = narrowed ? patchChoose(list, opts, say, 'current', true) : null;
    if (narrowed && ids === null) return undefined;
    let values;
    if (ctx.params === null) {
      values = copyValues(host.snapshot());
      if (ids !== null) for (const key of Object.keys(values)) if (!contains(ids, key)) delete values[key];
    } else {
      values = {};
      for (const desc of list) {
        if (ids !== null && !contains(ids, String(desc.id))) continue;
        const v = host.read(String(desc.id), ctx.role);
        if (v !== undefined && v !== null) values[String(desc.id)] = v;
      }
    }
    return patchMake({ device: ctx.device, role: ctx.role, scope: id }, values, list, 'panel');
  }

  function seeded(opts, verb) {
    const seed = opt(opts, 'seed');
    if (seed !== undefined && seed !== null) {
      if (!Number.isFinite(toNumber(seed))) {
        say('error', `ce.patch.${verb}: seed must be a number, so nothing was done.`);
        return null;
      }
      return patchRandomSource(seed);
    }
    return patchRandomSource(Math.floor(host.random() * 4294967296));
  }

  function knownValues(ctx, list) {
    const known = {};
    if (ctx.params === null) return known;
    for (const desc of list) {
      const v = host.read(String(desc.id), ctx.role);
      if (v !== undefined && v !== null) known[String(desc.id)] = v;
    }
    return known;
  }

  function scopeDumps(ctx, scope) {
    const def = scopeDefs(ctx)[scope];
    return def ? names(def.dumps) : [];
  }

  function apply(patch, opts) {
    const at = forPatch(patch, 'apply');
    if (at === null) return { ok: false, via: 'none', applied: 0, sent: 0, skipped: [] };
    const { ctx, list } = at;
    const scope = String(patch.scope ?? 'voice');
    let send = opt(opts, 'send');
    if (send === undefined || send === null) send = 'auto';
    if (!contains(SEND_MODES, send)) {
      say('error', `ce.patch.apply: send "${String(send)}" is not one of "auto", "parameters", "dump" or "none", so nothing was done.`);
      return { ok: false, via: 'none', applied: 0, sent: 0, skipped: [] };
    }
    const known = knownValues(ctx, list);
    const plan = patchApplyPlan(patch, known, list, opts, say);
    if (plan === null) return { ok: false, via: 'none', applied: 0, sent: 0, skipped: [] };
    const applied = Object.keys(plan.values).length;
    if (ctx.params === null) {
      // No profile: the controls take the values, and send them as their own bindings say.
      host.restore(plan.values);
      return { ok: true, via: 'none', applied, sent: 0, skipped: plan.skipped };
    }
    const dumps = scopeDumps(ctx, scope);
    const deliver = ctx.section && typeof ctx.section.deliver === 'string' ? ctx.section.deliver : '';
    let via = send;
    if (send === 'auto') via = deliver === 'dump' && dumps.length > 0 ? 'dump' : 'parameters';
    if (via === 'dump' && dumps.length === 0) {
      say('error', `ce.patch.apply: ${ctx.device} has no dumps for the "${scope}" scope, so it cannot take a patch as a dump, and nothing was done.`);
      return { ok: false, via: 'none', applied: 0, sent: 0, skipped: [] };
    }
    host.fill(plan.values);
    if (via === 'none') return { ok: true, via, applied, sent: 0, skipped: plan.skipped };
    if (via === 'dump') {
      for (const kind of dumps) host.sendDump(kind);
      return { ok: true, via, applied, sent: dumps.length, skipped: plan.skipped };
    }
    const key = `${ctx.role}\u0000${scope}`;
    let toSend = plan.send;
    if (opt(opts, 'live') === true) {
      const split = patchLivePlan(plan.send, known, list, LIVE_BUDGET);
      toSend = split.now;
      waiting[key] = split.later;
    } else {
      // What a live apply left: sent now, unless this patch sets it again.
      const later = waiting[key] ?? [];
      delete waiting[key];
      const planned = {};
      for (const [id] of toSend) planned[id] = true;
      for (const entry of later) if (!planned[entry[0]]) toSend = toSend.concat([entry]);
    }
    let sent = 0;
    const skipped = plan.skipped.slice();
    for (const [id, value] of toSend) {
      if (host.write(id, value, ctx.role) === true) sent += 1;
      else skipped.push({ id, why: 'not sent' });
    }
    return { ok: true, via, applied, sent, skipped };
  }

  function read(scope, fn, opts) {
    const ctx = context(opt(opts, 'role'));
    const id = typeof scope === 'string' && scope !== '' ? scope : 'voice';
    if (typeof fn !== 'function') {
      say('error', 'ce.patch.read: fn must be a function to call with the patch, so nothing was asked.');
      return false;
    }
    if (scoped(ctx, id, 'read') === null) return false;
    const dumps = ctx.params === null ? [] : scopeDumps(ctx, id);
    if (dumps.length === 0) {
      say('error', `ce.patch.read: the "${id}" scope has no dumps to ask the synth for, so it cannot be read. ce.patch.define() can name them.`);
      return false;
    }
    let ok = true;
    const timeout = toNumber(opt(opts, 'timeout'));
    const dumpOpts = Number.isFinite(timeout) && timeout > 0 ? { timeout } : undefined;
    let at = 0;
    const next = () => {
      if (at >= dumps.length) {
        const patch = current(id, { role: ctx.role });
        const info = { ok, missing: patch ? patch.missing : [] };
        fn(patch, info);
        return;
      }
      const kind = dumps[at];
      at += 1;
      const asked = host.requestDump(kind, (values, answer) => {
        if (!answer || answer.ok !== true) ok = false;
        next();
      }, dumpOpts);
      if (asked === false) { ok = false; next(); }
    };
    next();
    return true;
  }

  function scopes(role) {
    const ctx = context(role);
    if (ctx.params === null) {
      return [{ id: 'voice', name: 'Voice', parameters: Object.keys(host.snapshot()).length, canRead: false, canSend: true, via: 'none' }];
    }
    const defs = scopeDefs(ctx);
    // The profile's scopes in its order, then the script's by name, so every language lists them alike.
    const ids = defs.voice ? [] : ['voice'];
    for (const s of listOfScopes(ctx.section)) if (!contains(ids, s.id)) ids.push(s.id);
    for (const id of Object.keys(defined[ctx.role] ?? {}).sort()) if (!contains(ids, id)) ids.push(id);
    const deliver = ctx.section && typeof ctx.section.deliver === 'string' ? ctx.section.deliver : '';
    const out = [];
    for (const id of ids) {
      const list = patchScopeParams(ctx.params, id, defs);
      if (list === null || (list.length === 0 && !defs[id])) continue;
      const dumps = defs[id] ? names(defs[id].dumps) : [];
      out.push({
        id,
        name: defs[id] && typeof defs[id].name === 'string' ? defs[id].name : id.slice(0, 1).toUpperCase() + id.slice(1),
        parameters: list.length,
        canRead: dumps.length > 0,
        canSend: true,
        via: deliver === 'dump' && dumps.length > 0 ? 'dump' : 'parameters',
      });
    }
    if (!defs.system) {
      const system = patchScopeParams(ctx.params, 'system', defs);
      if (system !== null && system.length > 0) out.push({ id: 'system', name: 'System', parameters: system.length, canRead: false, canSend: true, via: 'parameters' });
    }
    return out;
  }

  function define(scope, spec, role) {
    if (typeof scope !== 'string' || scope === '') {
      say('error', 'ce.patch.define: scope must be a name, such as "voice", so nothing was defined.');
      return false;
    }
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      say('error', 'ce.patch.define: spec must be a table of groups, only, except and dumps, so nothing was defined.');
      return false;
    }
    for (const key of Object.keys(spec).sort()) {
      if (!contains(DEFINE_FIELDS, key)) {
        say('error', `ce.patch.define: "${key}" is not one of the fields a scope takes (${DEFINE_FIELDS.join(', ')}), so nothing was defined.`);
        return false;
      }
    }
    for (const key of ['groups', 'only', 'except', 'dumps']) {
      const v = spec[key];
      if (v !== undefined && v !== null && typeof v !== 'string' && !Array.isArray(v)) {
        say('error', `ce.patch.define: ${key} must be a list of names, so nothing was defined.`);
        return false;
      }
    }
    const r = typeof role === 'string' && role !== '' ? role : 'mainSynth';
    const def = { id: scope };
    for (const key of Object.keys(spec)) def[key] = spec[key];
    if (!defined[r]) defined[r] = {};
    defined[r][scope] = def;
    return true;
  }

  function storeKey(device, name) {
    return `${STORE_PREFIX}${device}:${lower(name)}`;
  }

  function save(name, patch, opts) {
    if (typeof name !== 'string' || name.trim() === '' || name.length > 64) {
      say('error', 'ce.patch.save: name must be text of 1 to 64 characters, so nothing was kept.');
      return false;
    }
    if (!isPatch(patch)) {
      say('error', 'ce.patch.save: that is not a patch, as ce.patch.current() gives them, so nothing was kept.');
      return false;
    }
    const key = storeKey(String(patch.device ?? ''), name);
    if (opt(opts, 'replace') === false && host.store.get(key) !== undefined && host.store.get(key) !== null) {
      say('error', `ce.patch.save: a patch called "${name}" is already kept, and replace is off, so nothing was kept.`);
      return false;
    }
    return host.store.set(key, {
      name, device: String(patch.device ?? ''), role: String(patch.role ?? 'mainSynth'), scope: String(patch.scope ?? 'voice'),
      savedAt: String(host.now() ?? ''), values: copyValues(patch.values),
    }) !== false;
  }

  function load(name, opts) {
    const ctx = context(opt(opts, 'role'));
    const record = host.store.get(storeKey(ctx.device, String(name ?? '')));
    if (!record || typeof record !== 'object') {
      for (const key of host.store.keys().slice().sort()) {
        if (key.indexOf(STORE_PREFIX) !== 0 || key.slice(key.lastIndexOf(':') + 1) !== lower(name)) continue;
        const other = host.store.get(key);
        if (other && typeof other === 'object') {
          say('error', `ce.patch.load: "${String(name ?? '')}" was kept for ${String(other.device ?? '')}, and this panel's synth is ${ctx.device}, so there is no patch.`);
          return undefined;
        }
      }
      say('error', `ce.patch.load: no patch called "${String(name ?? '')}" is kept for ${ctx.device}, so there is no patch.`);
      return undefined;
    }
    const scope = typeof record.scope === 'string' ? record.scope : 'voice';
    const list = scoped(ctx, scope, 'load') ?? [];
    const patch = patchMake({ device: ctx.device, role: ctx.role, scope, name: record.name }, copyValues(record.values), list, 'library');
    patch.name = String(record.name ?? name);
    return patch;
  }

  function listKept(opts) {
    const ctx = context(opt(opts, 'role'));
    const scope = opt(opts, 'scope');
    const prefix = `${STORE_PREFIX}${ctx.device}:`;
    const out = [];
    for (const key of host.store.keys()) {
      if (key.indexOf(prefix) !== 0) continue;
      const record = host.store.get(key);
      if (!record || typeof record !== 'object') continue;
      if (typeof scope === 'string' && scope !== '' && record.scope !== scope) continue;
      out.push({ name: String(record.name ?? ''), scope: String(record.scope ?? 'voice'), savedAt: String(record.savedAt ?? '') });
    }
    // Newest first; the same time (or none) by name, so every language lists them alike.
    out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return out;
  }

  function forget(name, opts) {
    const ctx = context(opt(opts, 'role'));
    const key = storeKey(ctx.device, String(name ?? ''));
    const record = host.store.get(key);
    if (record === undefined || record === null) return false;
    host.store.remove(key);
    return true;
  }

  function write(patch, slot, opts) {
    const at = forPatch(patch, 'write');
    if (at === null) return { ok: false, slot, error: 'not a patch of this synth' };
    const how = at.ctx.section && typeof at.ctx.section.write === 'object' ? at.ctx.section.write : null;
    const n = toNumber(slot);
    if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
      say('error', 'ce.patch.write: slot must be a whole number from 0, so nothing was stored.');
      return { ok: false, slot, error: 'not a slot' };
    }
    if (!how || how.via !== 'dump' || typeof how.dump !== 'string' || how.dump === '') {
      const why = how && how.via === 'command'
        ? 'its profile stores a slot with a write command, which ce.patch cannot send yet'
        : 'its profile does not say how to store a slot (patch.write)';
      say('error', `ce.patch.write: ${at.ctx.device} cannot be written to: ${why}, so nothing was stored.`);
      return { ok: false, slot: n, error: why };
    }
    host.setVariable('slot', n, at.ctx.role);
    host.fill(copyValues(patch.values));
    host.sendDump(how.dump);
    return { ok: true, slot: n };
  }

  return {
    current,
    read,
    load,
    morph: (a, b, t, opts) => { const at = forPatch(a, 'morph'); return at === null ? undefined : patchMorph(a, b, t, at.list, opts, say); },
    blend: (patches, weights, opts) => {
      const first = Array.isArray(patches) ? patches[0] : undefined;
      const at = forPatch(first, 'blend');
      return at === null ? undefined : patchBlend(patches, weights, at.list, opts, say);
    },
    random: (opts) => {
      const from = opt(opts, 'from');
      const base = from === undefined || from === null ? current(opt(opts, 'scope'), { role: opt(opts, 'role') }) : from;
      if (base === undefined) return undefined;
      const at = forPatch(base, 'random');
      if (at === null) return undefined;
      if (at.ctx.params === null) {
        say('error', 'ce.patch.random: a panel without a device profile does not say each control\'s range, so nothing was drawn.');
        return undefined;
      }
      const next = seeded(opts, 'random');
      return next === null ? undefined : patchRandom(base, at.list, opts, next, say);
    },
    mutate: (patch, amount, opts) => {
      const at = forPatch(patch, 'mutate');
      if (at === null) return undefined;
      if (at.ctx.params === null) {
        say('error', 'ce.patch.mutate: a panel without a device profile does not say each control\'s range, so nothing was changed.');
        return undefined;
      }
      const next = seeded(opts, 'mutate');
      return next === null ? undefined : patchMutate(patch, amount, at.list, opts, next, say);
    },
    merge: (base, other, opts) => { const at = forPatch(base, 'merge'); return at === null ? undefined : patchMerge(base, other, at.list, opts, say); },
    diff: (a, b, opts) => { const at = forPatch(a, 'diff'); return at === null ? undefined : patchDiff(a, b, at.list, opts, say); },
    equal: (a, b, opts) => { const at = forPatch(a, 'equal'); return at === null ? undefined : patchEqual(a, b, at.list, opts, say); },
    apply,
    save,
    list: listKept,
    forget,
    write,
    scopes,
    define,
  };
}
