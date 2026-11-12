// from-legacy-core.mjs — an engine profile (.ceditor-device.json) -> a DPD model, the inverse of
// emit-legacy-core.mjs, and the gate that proves it by emitting the model again. Browser-safe: the
// Device Profile Designer converts a generated profile when it opens one, and
// tools/from-legacy.mjs runs the gate over every profile.
//
// The device profiles generated from the makers' documents (tools/profiles/) are written in the
// engine's format. Converted:
//
//   - the DPD's own fields carry the device: every parameter's id, name, group, value type, range,
//     default, encoding, choices, display, and its wire (a CC, a 14-bit CC pair, an NRPN or RPN with
//     its options, or SysEx through a message shape with the parameter's address), and each dump's
//     framing, payload, checksum, counts and layout;
//   - `engine`, on a parameter, a dump, a mapping or the model, carries what the DPD does not model
//     and the emitter cannot derive (a KRONOS's bit-field codecs, the profile's sources, notes and
//     tests), computed as exactly the difference between the engine profile and
//     what the emitter derives.
//
// THE GATE (compareEmission). Emitting the model must give the engine profile back: every field
// equal but the message recipes, and those compared field by field (all but id and template) and by
// what they send: every parameter compiled at the ends and middle of its range and at every choice,
// through both profiles, must give the same bytes.

import { resolveModel, copyJson } from './resolve.mjs';
import { hexToBytes, bytesToHex, resolveAddress } from './codecs.mjs';
import { buildLegacyProfile } from './emit-legacy-core.mjs';

/** Structural equality of JSON values: what node's isDeepStrictEqual is for parsed JSON, in a browser too. */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The DPD id for an engine profile: `<maker>.<model>` (arturia-microfreak -> arturia.microfreak),
 * `-converted` after it when a hand-made model (CE/dpd/library, `handMade`) has that id: the older
 * hand-written roland-gaia profile would otherwise convert to roland.gaia, the GAIA's own model.
 */
export function dpdIdOf(legacy, handMade = new Set()) {
  const maker = slug(legacy.manufacturer) || 'generic';
  const rest = legacy.id.startsWith(`${maker}-`) ? legacy.id.slice(maker.length + 1) : legacy.id;
  const id = `${maker}.${rest}`;
  return handMade.has(id) ? `${id}-converted` : id;
}

const VALUE_TYPES = { integer: 'continuous', bipolar: 'signed', choice: 'enum', enum: 'enum', text: 'text', boolean: 'toggle', action: 'trigger', momentary: 'momentary' };
const ENCODINGS = { 'u14-msb-lsb': 'u14', 'u14-lsb-msb': 'u14-lsb', nibbled: 'nibbles', enum: 'u7' };
const DISPLAY_KEYS = ['format', 'table', 'min', 'max', 'unit', 'precision', 'middleC', 'mode', 'shortLabel'];

const HEX = /^[0-9A-Fa-f]{2}$/;

/** A recipe as a DPD messageShape: its template, checksum and delay (null: none, as it had none). */
const shapeOf = (r, id = r.id, template = r.template) => ({
  id, kind: 'sysex', template: [...template],
  ...(r.checksum ? { checksum: copyJson(r.checksum) } : {}),
  delayAfterMs: r.delayAfterMs ?? null,
});

/**
 * How a profile's SysEx recipes become DPD message shapes, and what each parameter sent with one
 * carries: { shapes, plan: recipe id -> { shape, address? } }.
 *
 *   - A recipe with `$address` (Roland's DT1, Yamaha's and Waldorf's parameter changes) is a shape
 *     as it stands; each parameter keeps its own address.
 *   - Recipes written out in full for every parameter (a KRONOS, an Andromeda) are grouped by their
 *     form (length, placeholders, checksum, delay); within a group the bytes that differ from one
 *     recipe to the next are the parameter's address, and the rest the shape, `$address` in their
 *     place. A recipe alone in its form, or one with a checksum, stays a shape of its own.
 */
function sysexPlan(recipes) {
  const shapes = [];
  const plan = new Map();
  const sx = recipes.filter((r) => r.kind === 'sysex');
  const used = new Set(sx.map((r) => r.id));
  const groups = new Map();
  for (const r of sx) {
    if (r.template.includes('$address') || r.checksum) { shapes.push(shapeOf(r)); plan.set(r.id, { shape: r.id }); continue; }
    const key = JSON.stringify([r.template.map((t) => (HEX.test(t) ? 'h' : t)), r.delayAfterMs ?? null]);
    (groups.get(key) ?? groups.set(key, []).get(key)).push(r);
  }
  for (const group of groups.values()) {
    const varying = [];
    for (let i = 0; i < group[0].template.length; i += 1) if (new Set(group.map((r) => r.template[i])).size > 1) varying.push(i);
    if (group.length < 2 || !varying.length) {
      for (const r of group) { shapes.push(shapeOf(r)); plan.set(r.id, { shape: r.id }); }
      continue;
    }
    const [a, b] = [varying[0], varying.at(-1)];
    const prefix = group.map((r) => r.id).reduce((p, id) => { let i = 0; while (i < p.length && p[i] === id[i]) i += 1; return p.slice(0, i); }).replace(/[^A-Za-z]+$/, '') || 'sysex';
    let id = prefix;
    for (let n = 2; used.has(id) || shapes.some((x) => x.id === id); n += 1) id = `${prefix}${n}`;
    used.add(id);
    shapes.push(shapeOf(group[0], id, [...group[0].template.slice(0, a), '$address', ...group[0].template.slice(b + 1)]));
    for (const r of group) plan.set(r.id, { shape: id, address: r.template.slice(a, b + 1).join(' ') });
  }
  return { shapes, plan };
}

/** A parameter's wire from the recipe it is sent with, or the reason it cannot be carried yet. */
function wireOf(recipe, sysex, q) {
  // A parameter only read back (from a dump) is sent with nothing: no wire at all.
  if (!recipe && !q?.messageRecipe) return { wire: null };
  if (!recipe) return { why: `message recipe ${q.messageRecipe} is missing` };
  if (recipe.kind === 'sysex') {
    const how = sysex.plan.get(recipe.id);
    return { wire: { dir: 'write', msg: 'dt1', shape: how.shape }, address: how.address };
  }
  if (recipe.kind === 'cc') {
    if (recipe.value != null && recipe.value !== '$encodedValue') return { why: `cc recipe value ${recipe.value}` };
    return {
      wire: {
        dir: 'write', msg: 'cc', cc: recipe.controller,
        ...(recipe.lsbController != null ? { lsbCc: recipe.lsbController } : {}),
        ...(recipe.channel != null && recipe.channel !== '$channel' ? { channel: recipe.channel } : {}),
      },
    };
  }
  if (recipe.kind === 'nrpn' || recipe.kind === 'rpn') {
    if (recipe.value != null && recipe.value !== '$encodedValue') return { why: `${recipe.kind} recipe value ${recipe.value}` };
    const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
    return {
      wire: {
        dir: 'write', msg: recipe.kind, [recipe.kind]: `${hex2(recipe.parameterMsb)} ${hex2(recipe.parameterLsb)}`,
        size: recipe.valueResolution === 14 ? 2 : 1,
        ...(recipe.channel != null && recipe.channel !== '$channel' ? { channel: recipe.channel } : {}),
        ...(recipe.nullAfterSend != null ? { nullAfterSend: recipe.nullAfterSend } : {}),
        ...(recipe.lowBits != null ? { lowBits: recipe.lowBits, lowBitsController: recipe.lowBitsController } : {}),
        ...(recipe.messageDelayAfterMs != null ? { delayAfterMs: recipe.messageDelayAfterMs } : {}),
      },
    };
  }
  return { why: `${recipe.kind} recipes are not converted yet` };
}

/** A parameter's own DPD fields (no `engine`), or the reason it cannot be carried yet. */
function nativeParam(q, recipes, sysex) {
  const { wire, why, address } = wireOf(recipes.get(q.messageRecipe), sysex, q);
  if (why) return { why };
  const valueType = VALUE_TYPES[q.type];
  if (!valueType) return { why: `type ${q.type}` };
  const p = { id: q.id, name: q.name, ...(q.group != null ? { group: q.group } : {}), valueType };
  if (q.range) p.range = copyJson(q.range);
  if (q.default !== undefined) p.default = copyJson(q.default);
  const enc = q.encoding?.type ?? 'u7';
  // The engine's nibble count is `nibbles`; the DPD's is `bytes`.
  const { nibbles, ...encoding } = copyJson(q.encoding ?? {});
  p.encoding = { ...encoding, type: ENCODINGS[enc] ?? enc, ...(enc === 'nibbled' ? { bytes: nibbles ?? 2 } : nibbles != null ? { nibbles } : {}) };
  p.access = {
    read: q.access?.canRead !== false, write: q.access?.canWrite !== false,
    ...(q.access?.realtimeSafe === false ? { realtimeSafe: false } : {}),
    ...(q.access?.source && q.access.source !== 'singleParameter' ? { source: q.access.source } : {}),
  };
  p.sendPolicy = q.sendPolicy === undefined ? null : copyJson(q.sendPolicy);
  if (Array.isArray(q.choices)) p.enum = q.choices.map((c) => ({ id: c.id, ...(c.label != null ? { label: c.label } : {}), wire: c.value }));
  if (q.ui) p.ui = copyJson(q.ui);
  const display = Object.fromEntries(DISPLAY_KEYS.filter((k) => q.display?.[k] !== undefined).map((k) => [k, copyJson(q.display[k])]));
  if (Object.keys(display).length) p.display = display;
  if (q.description != null) p.description = q.description;
  // The parameter's address: its own (`$address` recipes), or the bytes of its written-out recipe
  // that differ from its neighbours'.
  if (address ?? q.address) p.address = address ?? q.address;
  p.wires = wire ? [wire] : [];
  return { param: p };
}

/** What `derived` lacks or has otherwise than `original`, key by key: the overlay that turns one into the other. */
function overlay(original, derived, skip) {
  const out = {};
  for (const key of new Set([...Object.keys(original), ...Object.keys(derived)])) {
    if (skip.has(key) || deepEqual(original[key], derived[key])) continue;
    out[key] = key in original ? copyJson(original[key]) : null;
  }
  return out;
}

// The recipe a parameter names, and the address it fills in, are how its message is put together,
// which the gate compares by what it sends.
const PARAM_SKIP = new Set(['messageRecipe', 'address']);
const PROFILE_SKIP = new Set(['parameters', 'messageRecipes', 'dpdSource']);
// A dump's mappings get overlays of their own, one each.
const DUMP_SKIP = new Set(['mappings']);

// The engine's dump codecs the DPD has a name for (the rest, a KRONOS's bit fields or an explicit u7,
// are carried in the mapping's `engine`).
const DUMP_CODECS = {
  'u14-msb-lsb': () => ({ type: 'u14' }),
  'u14-lsb-msb': () => ({ type: 'u14-lsb' }),
  u8: () => ({ type: 'u8' }),
  s7: (c) => ({ type: 's7', ...(c.signedOffset != null ? { signedOffset: c.signedOffset } : {}) }),
  nibbled: (c) => ({ type: 'nibbles', bytes: c.nibbles ?? 2 }),
  'text-ascii': (c) => ({ type: 'text-ascii', length: c.length, pad: c.pad ?? 32 }),
  'text-nibbled-ascii': (c) => ({ type: 'text-nibbled-ascii', length: c.length, pad: c.pad ?? 32 }),
};

/** An engine dump definition's own DPD fields: its framing, payload, checksum, counts and layout. */
function nativeDump(d) {
  const c = d.checksum;
  return {
    id: d.id,
    name: d.name ?? d.id,
    kind: 'patch',
    ...(d.requestRecipe ? { requestShape: d.requestRecipe } : {}),
    ...(d.mappings?.length ? {} : { frameOnly: true }),
    message: {
      matcher: copyJson(d.matcher),
      payload: Object.fromEntries(['offset', 'size', 'pack'].filter((k) => d.payload?.[k] !== undefined).map((k) => [k, copyJson(d.payload[k])])),
      ...(c ? { checksum: { type: c.type, fromOffset: c.fromOffset, toOffset: c.toOffset, byteOffset: c.byteOffset } } : {}),
      // null: the count is not set (a collection its footer ends), so the emitter does not work one out.
      completion: { messages: d.completion?.expectedMessages ?? null, bytes: d.completion?.expectedBytes ?? null },
    },
    layout: (d.mappings ?? []).map((m) => {
      const codec = m.codec && DUMP_CODECS[m.codec.type]?.(m.codec);
      return {
        param: m.parameter, ...(m.offset != null ? { offset: m.offset } : {}), ...(codec ? { codec } : {}),
        ...Object.fromEntries(['record', 'scope', 'when'].filter((k) => m[k] != null).map((k) => [k, copyJson(m[k])])),
      };
    }),
  };
}

// ---- Scopes -----------------------------------------------------------------------------------
//
// A profile lists every parameter of every part, tone or effect slot: a FANTOM's 11,852 parameters
// are a few blocks, each several times over. Folded, each block is a scope: its parameters once,
// how many instances, the address step between them (base + stride), and how each instance names
// its parameters (idTemplate 'part{n}.{id}', `{n}` in its strings). A run of blocks is folded only
// if emitting the scope gives exactly what the flat parameters did.

const sub7 = (a, b) => {
  // a - b, in 7-bit bytes of a's length (an address step), or null if it would go below zero.
  const out = new Array(a.length).fill(0);
  let borrow = 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    let d = a[i] - (b[b.length - a.length + i] ?? 0) - borrow;
    borrow = d < 0 ? 1 : 0;
    if (d < 0) d += 128;
    out[i] = d;
  }
  return borrow ? null : out;
};

/** A value across instances as one template ({n} where the instance's number is), or undefined. */
function templateOf(values, ns) {
  const first = values[0];
  if (values.every((v) => deepEqual(v, first))) return first;
  if (typeof first === 'string') {
    const parts = values.map((v) => (typeof v === 'string' ? v.split(/(\d+)/) : null));
    if (parts.some((x) => !x || x.length !== parts[0].length)) return undefined;
    const out = [];
    for (let i = 0; i < parts[0].length; i += 1) {
      const col = parts.map((x) => x[i]);
      if (col.every((c) => c === col[0])) out.push(col[0]);
      else if (i % 2 === 1 && col.every((c, k) => c === String(ns[k]))) out.push('{n}');
      else return undefined;
    }
    return out.join('');
  }
  if (Array.isArray(first)) {
    if (values.some((v) => !Array.isArray(v) || v.length !== first.length)) return undefined;
    const out = [];
    for (let i = 0; i < first.length; i += 1) {
      const t = templateOf(values.map((v) => v[i]), ns);
      if (t === undefined) return undefined;
      out.push(t);
    }
    return out;
  }
  if (first && typeof first === 'object') {
    const keys = Object.keys(first);
    if (values.some((v) => !v || typeof v !== 'object' || Array.isArray(v) || !deepEqual(Object.keys(v).sort(), [...keys].sort()))) return undefined;
    const out = {};
    for (const k of keys) {
      const t = templateOf(values.map((v) => v[k]), ns);
      if (t === undefined) return undefined;
      out[k] = t;
    }
    return out;
  }
  return undefined;
}

/** A parameter's wires across instances, stepping where they step and templated, or null. */
function foldWires(wires, ns) {
  const out = [];
  for (let i = 0; i < wires[0].length; i += 1) {
    const col = wires.map((w) => ({ ...w[i] }));
    const w0 = col[0];
    if (w0.msg === 'cc') {
      const step = col.length > 1 ? col[1].cc - w0.cc : 0;
      if (col.some((w, k) => w.cc !== w0.cc + step * k || (w0.lsbCc != null && w.lsbCc !== w0.lsbCc + step * k))) return null;
      for (const w of col) { w.cc = w0.cc; if (w0.lsbCc != null) w.lsbCc = w0.lsbCc; }
      if (step) w0.ccStride = step;
    }
    for (const flavour of ['nrpn', 'rpn']) {
      if (w0.msg !== flavour) continue;
      const num = (h) => { const [a, b] = h.trim().split(/\s+/).map((x) => parseInt(x, 16)); return (a << 7) | b; };
      const step = col.length > 1 ? num(col[1][flavour]) - num(w0[flavour]) : 0;
      if (col.some((w, k) => num(w[flavour]) !== num(w0[flavour]) + step * k)) return null;
      for (const w of col) w[flavour] = w0[flavour];
      if (step) w0[`${flavour}Stride`] = step;
    }
    const stepKeys = ['ccStride', 'nrpnStride', 'rpnStride'].filter((k) => w0[k] != null);
    const t = templateOf(col.map((w) => { const c = { ...w }; for (const k of stepKeys) delete c[k]; return c; }), ns);
    if (t === undefined) return null;
    for (const k of stepKeys) t[k] = w0[k];
    out.push(t);
  }
  return out;
}

/** One parameter across a scope's instances, or null: its fields once, stepping and templated where they differ. */
function foldParam(instances, rest, ns, stride) {
  const p = { id: rest };
  const perInstance = {};
  // The address: the first instance's, the others the scope's stride on from it.
  if (instances.some((q) => q.address != null)) {
    if (!instances.every((q) => q.address != null)) return null;
    const offset = hexToBytes(instances[0].address);
    const steps = (s) => instances.every((q, idx) => bytesToHex(resolveAddress([0], s, idx, offset)) === q.address);
    if (!steps(stride)) {
      // Its own step, between its first two instances (an address of another width than the scope's).
      const own = sub7(hexToBytes(instances[1].address), offset);
      if (!own || !steps(own)) return null;
      p.addressStride = bytesToHex(own);
    }
    p.address = instances[0].address;
  }
  // The wires: a controller or a number stepping by a fixed amount, the rest templated; failing
  // that, each instance's own (one odd parameter need not keep its block from folding).
  const wires = instances.map((q) => q.wires ?? []);
  const folded = wires.some((w) => w.length !== wires[0].length) ? null : foldWires(wires, ns);
  if (folded) p.wires = folded;
  else { p.wires = copyJson(wires[0]); perInstance.wires = copyJson(wires); }
  // Everything else: the same, templated, or (as a last resort) one value per instance.
  const keys = new Set(instances.flatMap((q) => Object.keys(q)));
  for (const key of keys) {
    if (['id', 'address', 'wires'].includes(key)) continue;
    const values = instances.map((q) => q[key]);
    if (values.every((v) => v === undefined)) continue;
    const t = values.some((v) => v === undefined) ? undefined : templateOf(values, ns);
    if (t !== undefined) p[key] = t;
    else if (key === 'valueType') return null;
    else {
      // Its first instance's value stands as the parameter's own, so the parameter is whole on its
      // own (a choice keeps a list); the instances' values are laid over it.
      if (values[0] !== undefined) p[key] = copyJson(values[0]);
      perInstance[key] = values.map((v) => (v === undefined ? null : copyJson(v)));
    }
  }
  if (Object.keys(perInstance).length) p.perInstance = perInstance;
  return p;
}

/**
 * Where a parameter's id carries its instance's number, as the template its instances share: the
 * outermost segment with a number ('part2.eq.gain': part{n}.{id}, 2, 'eq.gain') or the innermost
 * ('kit1.key36.inst.wave': kit1.key{n}.{id}; 'note1Zone7Ds.tune': note1Zone{n}Ds.{id};
 * 'system.controlSource3': system.controlSource{n}, no rest). The number is the segment's last.
 */
function headOf(id, innermost) {
  const segs = id.split('.');
  const order = segs.map((_, i) => i);
  if (innermost) order.reverse();
  for (const i of order) {
    const m = /^([A-Za-z].*?)(\d+)(\D*)$/.exec(segs[i]);
    if (!m || (i === segs.length - 1 && m[3])) continue;
    const rest = segs.slice(i + 1).join('.');
    const template = [...segs.slice(0, i), `${m[1]}{n}${m[3]}`].join('.') + (rest ? '.{id}' : '');
    return { template, name: m[1].replace(/\d+/g, ''), n: Number(m[2]), rest };
  }
  return null;
}

/** The parameters as scopes: { scopes } with the runs of blocks that fold, and the rest as they were. */
function foldScopes(params, base, innermost, skip = new Set()) {
  const head = (p) => headOf(p.id, innermost);
  // Consecutive parameters of one <prefix><n>: a block.
  const blocks = [];
  for (const [i, p] of params.entries()) {
    const h = head(p);
    const last = blocks.at(-1);
    if (h && last?.template === h.template && last.n === h.n && last.end === i) { last.end = i + 1; last.rests.push(h.rest); continue; }
    blocks.push(h ? { template: h.template, name: h.name, n: h.n, start: i, end: i + 1, rests: [h.rest] } : { template: null, start: i, end: i + 1 });
  }
  const scopes = {};
  const key = (k) => { let out = k; for (let n = 2; out in scopes; n += 1) out = `${k}_${n}`; return out; };
  let flat = [];
  const flush = () => { if (flat.length) { scopes[key('global')] = { kind: 'global', label: 'Parameters', instances: 1, ...base, parameters: flat }; flat = []; } };
  for (let b = 0; b < blocks.length;) {
    const first = blocks[b];
    let e = b + 1;
    if (first.template) {
      while (e < blocks.length && blocks[e].template === first.template && blocks[e].n === first.n + (e - b) && deepEqual(blocks[e].rests, first.rests)) e += 1;
    }
    const scope = e - b >= 2 && !skip.has(first.template) ? foldRun(blocks.slice(b, e), params) : null;
    if (scope) { flush(); scopes[key(first.name)] = scope; } else for (const bl of blocks.slice(b, e)) flat.push(...params.slice(bl.start, bl.end));
    b = e;
  }
  flush();
  return scopes;
}

/** A run of blocks (one per instance, the same parameters) as one scope, or null. */
function foldRun(run, params) {
  const ns = run.map((bl) => bl.n);
  const at = (bl, j) => params[bl.start + j];
  // The stride: between the first two instances' addresses, of the first parameter with one.
  let stride = [0];
  const j0 = run[0].rests.findIndex((_, j) => at(run[0], j).address != null);
  if (j0 >= 0) {
    const d = sub7(hexToBytes(at(run[1], j0).address ?? ''), hexToBytes(at(run[0], j0).address));
    if (!d) return null;
    stride = d;
  }
  const folded = [];
  const prefix = run[0].name;
  for (const [j, rest] of run[0].rests.entries()) {
    // A parameter that is the whole numbered segment (controlSource3) is named after it.
    const p = foldParam(run.map((bl) => at(bl, j)), rest || prefix, ns, stride);
    if (!p) return null;
    folded.push(p);
  }
  const groupTemplate = folded[0].group;
  const label = typeof groupTemplate === 'string' && groupTemplate.includes('{n}') ? groupTemplate.replace(/\s*\{n\}\s*/, ' ').trim() : prefix;
  return {
    kind: /fx|effect|eq|reverb|chorus|delay|insert/i.test(prefix) ? 'effect' : /tone|partial|osc|voice|layer|timbre/i.test(prefix) ? 'tone' : 'part',
    label, instances: run.length, first: ns[0], base: '00', stride: bytesToHex(stride),
    idTemplate: run[0].template,
    parameters: folded,
  };
}

/** The model with its parameters folded into scopes, if emitting it gives exactly what the flat model did; else the flat model. */
function withScopes(model) {
  const flatScope = model.scopes.global;
  const base = flatScope.base ? { base: flatScope.base, stride: flatScope.stride } : {};
  const listed = (scopes) => Object.values(scopes).reduce((n, s) => n + s.parameters.length, 0);
  const a = emitModel(model);
  let best = model;
  // By the outermost numbered segment, then the innermost: whichever lists fewer parameters, of
  // those that emit exactly what the flat model does.
  for (const innermost of [false, true]) {
    // A scope whose parameters emit otherwise than they did flat is left unfolded, and the rest tried
    // again, a few times; anything else that differs (a dump) and the fold is not used.
    const skip = new Set();
    for (let tries = 0; tries < 4; tries += 1) {
      const scopes = foldScopes(flatScope.parameters, base, innermost, skip);
      if (Object.keys(scopes).length === 1 && scopes.global) break;
      if (listed(scopes) >= listed(best.scopes)) break;
      const folded = { ...model, scopes };
      const b = emitModel(folded);
      if (deepEqual(a, b)) { best = folded; break; }
      const { parameters: pa, ...ra } = a;
      const { parameters: pb, ...rb } = b;
      if (!deepEqual(ra, rb) || pa.length !== pb.length) break;
      const bad = new Set();
      for (const [i, q] of pa.entries()) if (!deepEqual(q, pb[i])) { bad.add(q.id); bad.add(pb[i].id); }
      const templates = new Set();
      for (const id of bad) { const h = headOf(id, innermost); if (h) templates.add(h.template); }
      if (!templates.size || [...templates].every((t) => skip.has(t))) break;
      for (const t of templates) skip.add(t);
    }
  }
  return best;
}

export function emitModel(model) {
  return buildLegacyProfile(resolveModel(model, {}));
}

/** An engine profile -> { model } or { why }: the DPD model whose emission gives that profile back. */
export function legacyToDpd(legacy, { handMade = new Set() } = {}) {
  if (legacy.dpdSource) return { why: 'already a DPD profile' };
  const recipes = new Map((legacy.messageRecipes ?? []).map((r) => [r.id, r]));
  const sysex = sysexPlan(legacy.messageRecipes ?? []);
  const params = [];
  for (const q of legacy.parameters ?? []) {
    const { param, why } = nativeParam(q, recipes, sysex);
    if (!param) return { why };
    params.push(param);
  }
  const model = {
    schemaVersion: 1,
    id: dpdIdOf(legacy, handMade),
    version: legacy.profileVersion ?? '0.1.0',
    kind: 'model',
    label: legacy.name,
    manufacturer: legacy.manufacturer,
    ...(legacy.family != null ? { family: legacy.family } : {}),
    ...(sysex.shapes.length ? { messageShapes: sysex.shapes } : {}),
    // A one-byte base leaves every address as it is, whatever its length (add7 keeps the longer).
    scopes: { global: { kind: 'global', label: 'Parameters', instances: 1, ...(params.some((p) => p.address) ? { base: '00', stride: '00' } : {}), parameters: params } },
    provenance: {
      source: 'official',
      verifiedRoundTrip: true,
      verifiedOnHardware: null,
      confirmations: 0,
      contributors: [],
      note: `Converted by CE/dpd/tools/from-legacy.mjs from the engine profile ${legacy.id}, which tools/profiles/ generates from the maker's own document (its sources say which). Emitting this model gives that profile back.`,
    },
    completeness: 'partial',
  };
  // The send policy most parameters of each value type have becomes the model's default for it, and
  // a parameter names its own only when it has another: "knobs sent as they move, lists once set",
  // once, rather than on every parameter.
  const policies = new Map();
  for (const p of params) {
    const key = JSON.stringify(p.sendPolicy);
    const byType = policies.get(p.valueType) ?? policies.set(p.valueType, new Map()).get(p.valueType);
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }
  const defaults = {};
  for (const [type, counts] of policies) {
    const [key] = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (key !== 'null') defaults[type] = JSON.parse(key);
  }
  for (const p of params) if (defaults[p.valueType] && JSON.stringify(p.sendPolicy) === JSON.stringify(defaults[p.valueType])) delete p.sendPolicy;
  if (Object.keys(defaults).length) model.defaults = { sendPolicy: defaults };
  if (legacy.presets && !legacy.presets.nameRequest) model.presets = copyJson(legacy.presets);
  if (legacy.dumpDefinitions?.length) model.dumps = legacy.dumpDefinitions.map(nativeDump);

  // What the emitter derives from the DPD fields alone, and what it must be told besides.
  const derived = emitModel(model);
  const byId = new Map(derived.parameters.map((p) => [p.id, p]));
  for (const [i, q] of (legacy.parameters ?? []).entries()) {
    const extra = overlay(q, byId.get(q.id) ?? {}, PARAM_SKIP);
    if (Object.keys(extra).length) params[i].engine = extra;
  }
  // Each dump, and each of its mappings, gets what the emitter does not derive.
  if (model.dumps) {
    const emittedDumps = new Map((derived.dumpDefinitions ?? []).map((d) => [d.id, d]));
    for (const [i, d] of legacy.dumpDefinitions.entries()) {
      const e = emittedDumps.get(d.id);
      if (!e) return { why: `dump ${d.id} is not emitted` };
      const extraDump = overlay(d, e, DUMP_SKIP);
      if (Object.keys(extraDump).length) model.dumps[i].engine = extraDump;
      for (const [k, m] of (d.mappings ?? []).entries()) {
        const extraMapping = overlay(m, e.mappings[k] ?? {}, new Set());
        if (Object.keys(extraMapping).length) model.dumps[i].layout[k].engine = extraMapping;
      }
    }
  }
  const extra = overlay(legacy, emitModel(model), PROFILE_SKIP);
  if (Object.keys(extra).length) model.engine = extra;
  return { model: withScopes(model) };
}

/** The values a parameter is checked at: the ends and middle of its range, or every choice. */
function probeValues(q) {
  if (Array.isArray(q.choices)) return q.choices.map((c) => c.id);
  if (q.range) return [...new Set([q.range.min, q.range.max, Math.round((q.range.min + q.range.max) / 2), q.default].filter((v) => typeof v === 'number'))];
  return [q.default ?? 0];
}

/**
 * Every difference between an engine profile and its model's emission: [] when the conversion holds.
 * `compile` is the engine's parameter compiler (deviceProfileLocalEngine.js localCompileParameter).
 */
export function compareEmission(legacy, model, compile) {
  const localCompileParameter = compile;
  const emitted = emitModel(model);
  const problems = [];
  for (const key of new Set([...Object.keys(legacy), ...Object.keys(emitted)])) {
    if (PROFILE_SKIP.has(key)) continue;
    if (!deepEqual(legacy[key], emitted[key])) problems.push(`profile field ${key} differs`);
  }
  const ids = (legacy.parameters ?? []).map((p) => p.id);
  if (!deepEqual(ids, emitted.parameters.map((p) => p.id))) problems.push('the parameter ids or their order differ');
  const byId = new Map(emitted.parameters.map((p) => [p.id, p]));
  const recipeA = new Map((legacy.messageRecipes ?? []).map((r) => [r.id, r]));
  const recipeB = new Map((emitted.messageRecipes ?? []).map((r) => [r.id, r]));
  // A recipe's fields but its id and template (the bytes say whether those agree); a controller
  // recipe with no value sends $encodedValue, as the engine reads it.
  const fieldsOf = (r) => {
    if (!r) return null;
    const { id, template, ...rest } = r;
    if (rest.kind !== 'sysex' && rest.value === undefined) rest.value = '$encodedValue';
    return rest;
  };
  for (const q of legacy.parameters ?? []) {
    const e = byId.get(q.id);
    if (!e) continue;
    if (q.messageRecipe && !deepEqual(fieldsOf(recipeA.get(q.messageRecipe)), fieldsOf(recipeB.get(e.messageRecipe)))) {
      problems.push(`${q.id}: its recipe differs (${JSON.stringify(fieldsOf(recipeB.get(e.messageRecipe)))}, the engine profile ${JSON.stringify(fieldsOf(recipeA.get(q.messageRecipe)))})`);
    }
    for (const key of new Set([...Object.keys(q), ...Object.keys(e)])) {
      if (!PARAM_SKIP.has(key) && !deepEqual(q[key], e[key])) problems.push(`${q.id}: ${key} differs`);
    }
    if (!q.messageRecipe) continue;
    // A parameter's message needs the profile's variables, the parameter and its recipe: compiled
    // from a profile of just those, a 20,000-parameter KRONOS is checked in seconds, not minutes (the
    // engine looks both up by scanning).
    const oneA = { ...legacy, parameters: [q], messageRecipes: [recipeA.get(q.messageRecipe)].filter(Boolean) };
    const oneB = { ...emitted, parameters: [e], messageRecipes: [recipeB.get(e.messageRecipe)].filter(Boolean) };
    for (const value of probeValues(q)) {
      const a = localCompileParameter(oneA, { parameterId: q.id, value });
      const b = localCompileParameter(oneB, { parameterId: q.id, value });
      // The whole message, every byte of it: the value alone (transaction.encodedValueHex) would let
      // a parameter sent on the wrong controller or address through.
      const hexA = a.ok ? a.hex : `error: ${a.error}`;
      const hexB = b.ok ? b.hex : `error: ${b.error}`;
      if (hexA !== hexB) problems.push(`${q.id} = ${value}: sends ${hexB}, the engine profile ${hexA}`);
    }
  }
  return problems;
}
