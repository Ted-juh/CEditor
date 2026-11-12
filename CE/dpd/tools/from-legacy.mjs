// from-legacy.mjs — an engine profile (.ceditor-device.json) -> a DPD model the Designer opens, the
// inverse of emit-legacy-core.mjs, proven by emitting it again.
//
//   node CE/dpd/tools/from-legacy.mjs <engine profile id>...     convert these
//   node CE/dpd/tools/from-legacy.mjs --all                      every profile that converts
//   node CE/dpd/tools/from-legacy.mjs --check                    the library is what conversion gives
//
// The device profiles generated from the makers' documents (tools/profiles/) were written in the
// engine's format, which the Designer cannot open. This writes each as a DPD model in
// CE/dpd/converted/<maker>.<model>.json (the hand-made library, CE/dpd/library, is bundled into the
// app whole; these are loaded one at a time), and indexes them in generated/dpdConvertedIndex.json:
//
//   - the DPD's own fields carry the device: every parameter's id, name, group, value type, range,
//     default, encoding, choices, display, and its wire (the controller it is sent on, its low-bits
//     controller when it is a 14-bit pair, its channel when not the profile's);
//   - `engine`, on a parameter or the model, carries what the DPD does not model and the emitter
//     cannot derive (a send policy, a short label, the profile's sources, notes and tests), computed
//     as exactly the difference between the engine profile and what the emitter derives.
//
// THE GATE. A model is written only if emitting it gives the engine profile back: every field equal,
// but the message recipes, which are compared by what they send: every parameter compiled at the
// ends and middle of its range and at every choice, through both profiles, must give the same
// bytes. A profile that does not convert (a message kind the converter does not carry yet) is named
// with the reason, and nothing is written for it.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { resolveModel } from '../resolve.mjs';
import { buildLegacyProfile } from '../emit-legacy-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const PROFILES = join(REPO, 'CE', 'profiles', 'test');
const CONVERTED = join(HERE, '..', 'converted');
// Engine profile id -> its converted model's DPD id: what the Designer opens for a profile. Not
// dpdProfileMap.json, which marks a profile whose bindings come from a generated runtime map.
const INDEX = join(REPO, 'CE', 'web', 'src', 'CE_Application', 'generated', 'dpdConvertedIndex.json');

const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The DPD id for an engine profile: `<maker>.<model>` (arturia-microfreak -> arturia.microfreak). */
export function dpdIdOf(legacy) {
  const maker = slug(legacy.manufacturer) || 'generic';
  const rest = legacy.id.startsWith(`${maker}-`) ? legacy.id.slice(maker.length + 1) : legacy.id;
  return `${maker}.${rest}`;
}

const VALUE_TYPES = { integer: 'continuous', bipolar: 'signed', choice: 'enum', enum: 'enum', text: 'text', boolean: 'toggle', action: 'trigger', momentary: 'trigger' };
const ENCODINGS = { 'u14-msb-lsb': 'u14', 'u14-lsb-msb': 'u14-lsb', nibbled: 'nibbles', enum: 'u7' };
const DISPLAY_KEYS = ['format', 'table', 'min', 'max', 'unit', 'precision', 'middleC', 'mode', 'shortLabel'];

/** A parameter's wire from the recipe it is sent with, or the reason it cannot be carried yet. */
function wireOf(recipe) {
  if (!recipe) return { why: 'no message recipe' };
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
function nativeParam(q, recipes) {
  const { wire, why } = wireOf(recipes.get(q.messageRecipe));
  if (!wire) return { why };
  const valueType = VALUE_TYPES[q.type];
  if (!valueType) return { why: `type ${q.type}` };
  const p = { id: q.id, name: q.name, ...(q.group != null ? { group: q.group } : {}), valueType };
  if (q.range) p.range = structuredClone(q.range);
  if (q.default !== undefined) p.default = structuredClone(q.default);
  const enc = q.encoding?.type ?? 'u7';
  p.encoding = { ...structuredClone(q.encoding ?? {}), type: ENCODINGS[enc] ?? enc };
  p.access = { read: q.access?.canRead !== false, write: q.access?.canWrite !== false };
  if (Array.isArray(q.choices)) p.enum = q.choices.map((c) => ({ id: c.id, ...(c.label != null ? { label: c.label } : {}), wire: c.value }));
  if (q.ui) p.ui = structuredClone(q.ui);
  const display = Object.fromEntries(DISPLAY_KEYS.filter((k) => q.display?.[k] !== undefined).map((k) => [k, structuredClone(q.display[k])]));
  if (Object.keys(display).length) p.display = display;
  if (q.description != null) p.description = q.description;
  p.wires = [wire];
  return { param: p };
}

/** What `derived` lacks or has otherwise than `original`, key by key: the overlay that turns one into the other. */
function overlay(original, derived, skip) {
  const out = {};
  for (const key of new Set([...Object.keys(original), ...Object.keys(derived)])) {
    if (skip.has(key) || isDeepStrictEqual(original[key], derived[key])) continue;
    out[key] = key in original ? structuredClone(original[key]) : null;
  }
  return out;
}

const PARAM_SKIP = new Set(['messageRecipe']);
const PROFILE_SKIP = new Set(['parameters', 'messageRecipes', 'dpdSource']);

export function emitModel(model) {
  return buildLegacyProfile(resolveModel(model, {}));
}

/** An engine profile -> { model } or { why }: the DPD model whose emission gives that profile back. */
export function legacyToDpd(legacy) {
  if (legacy.dpdSource) return { why: 'already a DPD profile' };
  if (legacy.dumpDefinitions?.length) return { why: 'dumps are not converted yet' };
  const recipes = new Map((legacy.messageRecipes ?? []).map((r) => [r.id, r]));
  const params = [];
  for (const q of legacy.parameters ?? []) {
    const { param, why } = nativeParam(q, recipes);
    if (!param) return { why };
    params.push(param);
  }
  const model = {
    schemaVersion: 1,
    id: dpdIdOf(legacy),
    version: legacy.profileVersion ?? '0.1.0',
    kind: 'model',
    label: legacy.name,
    manufacturer: legacy.manufacturer,
    ...(legacy.family != null ? { family: legacy.family } : {}),
    scopes: { global: { kind: 'global', label: 'Parameters', instances: 1, parameters: params } },
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
  if (legacy.presets && !legacy.presets.nameRequest) model.presets = structuredClone(legacy.presets);

  // What the emitter derives from the DPD fields alone, and what it must be told besides.
  const derived = emitModel(model);
  const byId = new Map(derived.parameters.map((p) => [p.id, p]));
  for (const [i, q] of (legacy.parameters ?? []).entries()) {
    const extra = overlay(q, byId.get(q.id) ?? {}, PARAM_SKIP);
    if (Object.keys(extra).length) params[i].engine = extra;
  }
  const extra = overlay(legacy, emitModel(model), PROFILE_SKIP);
  if (Object.keys(extra).length) model.engine = extra;
  return { model };
}

/** The values a parameter is checked at: the ends and middle of its range, or every choice. */
function probeValues(q) {
  if (Array.isArray(q.choices)) return q.choices.map((c) => c.id);
  if (q.range) return [...new Set([q.range.min, q.range.max, Math.round((q.range.min + q.range.max) / 2), q.default].filter((v) => typeof v === 'number'))];
  return [q.default ?? 0];
}

/** Every difference between an engine profile and its model's emission: [] when the conversion holds. */
export async function compareEmission(legacy, model) {
  const { localCompileParameter } = await import('../../web/src/CE_Application/stores/deviceProfileLocalEngine.js');
  const emitted = emitModel(model);
  const problems = [];
  for (const key of new Set([...Object.keys(legacy), ...Object.keys(emitted)])) {
    if (PROFILE_SKIP.has(key)) continue;
    if (!isDeepStrictEqual(legacy[key], emitted[key])) problems.push(`profile field ${key} differs`);
  }
  const ids = (legacy.parameters ?? []).map((p) => p.id);
  if (!isDeepStrictEqual(ids, emitted.parameters.map((p) => p.id))) problems.push('the parameter ids or their order differ');
  const byId = new Map(emitted.parameters.map((p) => [p.id, p]));
  for (const q of legacy.parameters ?? []) {
    const e = byId.get(q.id);
    if (!e) continue;
    for (const key of new Set([...Object.keys(q), ...Object.keys(e)])) {
      if (!PARAM_SKIP.has(key) && !isDeepStrictEqual(q[key], e[key])) problems.push(`${q.id}: ${key} differs`);
    }
    if (!q.messageRecipe) continue;
    for (const value of probeValues(q)) {
      const a = localCompileParameter(legacy, { parameterId: q.id, value });
      const b = localCompileParameter(emitted, { parameterId: q.id, value });
      // The whole message, every byte of it: the value alone (transaction.encodedValueHex) would let
      // a parameter sent on the wrong controller or address through.
      const hexA = a.ok ? a.hex : `error: ${a.error}`;
      const hexB = b.ok ? b.hex : `error: ${b.error}`;
      if (hexA !== hexB) problems.push(`${q.id} = ${value}: sends ${hexB}, the engine profile ${hexA}`);
    }
  }
  return problems;
}

function profileFiles() {
  return readdirSync(PROFILES).filter((f) => f.endsWith('.ceditor-device.json')).sort();
}

function readLegacy(id) {
  return JSON.parse(readFileSync(join(PROFILES, `${id}.ceditor-device.json`), 'utf8'));
}

async function main(argv) {
  const check = argv.includes('--check');
  const ids = argv.includes('--all') || check ? profileFiles().map((f) => f.replace(/\.ceditor-device\.json$/, '')) : argv.filter((a) => !a.startsWith('--'));
  if (!ids.length) { console.error('usage: from-legacy.mjs <engine profile id>... | --all | --check'); process.exit(2); }
  const index = {};
  const skipped = new Map();
  let written = 0;
  let stale = 0;
  for (const id of ids) {
    const legacy = readLegacy(id);
    const { model, why } = legacyToDpd(legacy);
    if (!model) { if (why !== 'already a DPD profile') (skipped.get(why) ?? skipped.set(why, []).get(why)).push(id); continue; }
    const problems = await compareEmission(legacy, model);
    if (problems.length) { (skipped.get('emission differs') ?? skipped.set('emission differs', []).get('emission differs')).push(`${id} (${problems.slice(0, 3).join('; ')})`); continue; }
    const file = join(CONVERTED, `${model.id}.json`);
    const text = `${JSON.stringify(model, null, 2)}\n`;
    index[legacy.id] = model.id;
    if (check) {
      if (!existsSync(file) || readFileSync(file, 'utf8') !== text) { stale += 1; console.log(`stale: ${model.id}`); }
      continue;
    }
    writeFileSync(file, text);
    written += 1;
  }
  const indexText = `${JSON.stringify(Object.fromEntries(Object.entries(index).sort()), null, 2)}\n`;
  if (check) {
    if (!existsSync(INDEX) || readFileSync(INDEX, 'utf8') !== indexText) { stale += 1; console.log('stale: dpdConvertedIndex.json'); }
    const kept = new Set(Object.values(index).map((id) => `${id}.json`));
    for (const f of readdirSync(CONVERTED)) if (!kept.has(f)) { stale += 1; console.log(`stale: ${f} converts from no profile`); }
  } else {
    writeFileSync(INDEX, indexText);
  }
  for (const [why, list] of skipped) console.log(`not converted, ${why}: ${list.length}${list.length <= 8 ? ` (${list.join(', ')})` : ` (${list.slice(0, 8).join(', ')}, …)`}`);
  if (check) {
    console.log(stale ? `${stale} model(s) are not what conversion gives: run node CE/dpd/tools/from-legacy.mjs --all` : 'The DPD library is what conversion gives.');
    if (stale) process.exit(1);
  } else {
    console.log(`Wrote ${written} DPD model(s) to CE/dpd/converted, each emitting its engine profile back.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.stack ?? e.message); process.exit(1); });
}
