// scriptValues.js — the values in the statement the caret is in, what each means to the runtime that
// reads it, and how to write a new one back in the script's own form. The pure core of the script
// editor's Values sidebar: docs/design/script-editor-value-editors.md, "Decided: a Values sidebar is
// where values are shown and edited", "The model: a value kind" and "Rules every edit session
// follows". The sidebar renders exactly what this returns; nothing here touches the DOM or a store.
//
// Three calls:
//   readStatement(source, languageId, caret, context) -> Statement | null
//   readJsonValues(source, caret, context)            -> the panel file view's equivalent
//   writeValue(source, languageId, arg, newValue)     -> { start, end, text }
//
// HOW A VALUE IS RECOGNISED, in the order the record sets ("Where context comes from"): the call
// and the argument it is, by the contract (panelApi.js: a param's `kind`, `type`, `values`, `unit`,
// `fields`, and `at`, which names the path a value is written at); then a property path or a table
// key, typed by the section templates (scriptColours.colourFieldAt) or, without them, by the name
// (colou?r, tint); then the form alone, which only "#RRGGBB" is clear enough to claim.
//
// The statement, the calls and the arguments come from scriptValueScan.js; what each kind means and
// what its reader refuses, in the runtime's words, from scriptValueKinds.js; writing a value back
// from scriptValueWrite.js.

import {
  tokenize, matchBrackets, statementUnits, lineStartsOf, lineAt, unitStream, scanCalls, literalOf, isLiteral,
  valueOf, familyOf,
} from './scriptValueScan.js';
import {
  readColour, colourRefusals, readDrawGradient, readStoredGradient, readCurve, readEnvelope,
  readNote, readScaleOrChord, readDivision, readNumber, OPACITY_SCALE_WARNINGS, readEnum, ENUM_REFUSALS,
  readEvent, panelControls, controlNamed, readControl, readPath, readAnimation, readDeviceParameter, readFont, readImage, readBytes,
  checksumOf, readSysexTemplate, parameterSpecRefusal, readComponentIndex, readDeviceRole, readDumpKind, readSharedName, SECTION_NAMES, didYouMean, midiArgOf, readDash,
} from './scriptValueKinds.js';
import {
  ALL_MEMBERS, MEMBER_BY_ID, memberPath, memberModule, allModules, memberMapFor, extensionMembers, memberNames,
  unknownOptionsMessage,
} from './panelApi.js';
import { colourFieldAt, panelColourFieldAt, realNumber } from './scriptColours.js';
import { unknownModuleCall, unknownModuleCallMessage } from './unknownCalls.js';
import { tokenNameOf, resolveToken, controlSetForPanel } from '../models/controlSets.js';
import { COMPONENT_VERBS } from './componentVerbs.js';
import { TIME_NUMBERS } from './timeWords.js';
import { componentClampWarning } from './componentVerbs.js';

const COMPONENT_VERB_BY_ID = new Map(COMPONENT_VERBS.map((verb) => [verb.id, verb]));
import { FIELD_SETS } from '../models/inspectorFieldSets.js';

export { writeValue, colourText, colourToWrite, numberText } from './scriptValueWrite.js';

/**
 * The languages readStatement reads, by the ids the script editor uses.
 * @type {readonly string[]}
 */
export const VALUE_LANGUAGES = Object.freeze(['lua', 'javascript', 'typescript', 'python', 'cpp', 'csharp', 'java']);

const LANGUAGE_ALIASES = { ts: 'typescript', 'c++': 'cpp', cs: 'csharp', js: 'javascript' };
const languageOf = (id) => LANGUAGE_ALIASES[id] ?? id;

/* ------------------------------------------------------------------------------- the cache */
// The parse of a source is kept, per language, for the few sources last read: the sidebar asks on
// every caret move, and between two edits the source does not change.

const CACHE_LIMIT = 8;
const cache = new Map();

function analysed(source, language) {
  const key = `${language}\u0000${source}`;
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const fam = familyOf(language);
  const tokens = tokenize(source, language);
  const match = matchBrackets(tokens);
  const starts = lineStartsOf(source);
  const units = statementUnits(source, language, tokens, match, starts);
  const infos = units.map((unit) => {
    const stream = unitStream(tokens, unit);
    const segments = [];
    let seg = null;
    stream.forEach((tok, i) => {
      if (tok.t === 'hole') { seg = null; return; }
      const from = lineAt(starts, tok.s);
      const to = lineAt(starts, Math.max(tok.s, tok.e - 1));
      if (!seg) { seg = { i0: i, i1: i + 1, s: tok.s, e: tok.e, from, to }; segments.push(seg); } else {
        seg.i1 = i + 1; seg.e = tok.e; seg.to = Math.max(seg.to, to);
      }
    });
    return { unit, stream, segments, match: null, calls: null };
  });
  const lineUnits = new Map();
  infos.forEach((info, index) => {
    for (const seg of info.segments) {
      for (let line = seg.from; line <= seg.to; line += 1) {
        const list = lineUnits.get(line);
        if (!list) lineUnits.set(line, [index]);
        else if (list[list.length - 1] !== index) list.push(index);
      }
    }
  });
  const doc = { source, language, fam, tokens, match, starts, infos, lineUnits, parsed: units.some((u) => u.parsed) };
  cache.set(key, doc);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return doc;
}

/* ------------------------------------------------------------------------ callee resolution */
// A call is known by its callee text: ce.<module>.<name>, the flat names and their aliases, ce.core's
// commands bare, self.set and self.get, and C++/C#/Java's ctx.<name> — in C# in its PascalCase .NET
// spelling too (ctx.SetValue, ctx.SendCC), and Java's typed reads (ctx.getDouble …), which are get.
// panelRuntime's previewContextFor says what ctx holds.

let calleeTable = null;
let calleeModules = -1;

function callees() {
  const modules = allModules();
  const count = modules.length + extensionMembers().length;
  if (calleeTable && calleeModules === count) return calleeTable;
  const table = new Map();
  const members = [...ALL_MEMBERS, ...extensionMembers()].filter((m) => m.kind !== 'lifecycle');
  for (const member of members) for (const name of memberNames(member)) if (!table.has(name)) table.set(name, member.id);
  for (const module of modules) {
    for (const [short, id] of Object.entries(memberMapFor(module.id))) table.set(`${module.id}.${short}`, id);
  }
  calleeTable = table;
  calleeModules = count;
  return table;
}

const CTX_NAMES = {
  setValue: 'set', SetValue: 'set', getValue: 'get', GetValue: 'get',
  getDouble: 'get', getInt: 'get', getString: 'get', getBoolean: 'get',
};

function memberOf(id) {
  return MEMBER_BY_ID[id] ?? extensionMembers().find((m) => m.id === id) ?? null;
}

/**
 * The contract member a callee names: { memberId, member, self, ctx } or null.
 * @param {string} callee  dotted, as scriptValueScan writes it (every separator a dot)
 */
export function resolveCallee(callee) {
  let text = String(callee ?? '');
  const table = callees();
  let ctx = false;
  if (text.startsWith('ctx.')) {
    ctx = true;
    text = text.slice(4);
    if (CTX_NAMES[text]) text = CTX_NAMES[text];
  }
  if (text.startsWith('self.')) {
    const name = text.slice(5);
    return name === 'set' || name === 'get' ? { memberId: name, member: memberOf(name), self: true, ctx } : null;
  }
  let id = table.get(text);
  if (!id && ctx) id = table.get(text.charAt(0).toLowerCase() + text.slice(1));
  return id ? { memberId: id, member: memberOf(id), self: false, ctx } : null;
}

/* ------------------------------------------------------------------------------- the params */

const paramCache = new Map();

/** A member's params: the contract's, or read off its signature (the helpers carry none). */
function paramsOf(member) {
  if (Array.isArray(member?.params)) return member.params;
  if (paramCache.has(member.id)) return paramCache.get(member.id);
  const m = /\(([^)]*)\)/.exec(String(member.signature ?? ''));
  const out = [];
  if (m) {
    let optional = 0;
    let word = '';
    const flush = () => { const name = word.trim(); if (name) out.push({ name, type: 'value', required: optional === 0, fromSignature: true }); word = ''; };
    for (const c of m[1]) {
      if (c === '[') { flush(); optional += 1; } else if (c === ']') { flush(); optional = Math.max(0, optional - 1); } else if (c === ',') flush();
      else word += c;
    }
    flush();
  }
  paramCache.set(member.id, out);
  return out;
}

/** A summary's first sentence, for a row's header. */
function firstSentence(text) {
  const s = String(text ?? '').trim();
  const m = /^([\s\S]*?[.!?])(?=\s+[A-Z`"(]|\s*$)/.exec(s);
  const sentence = (m ? m[1] : s).replace(/\s+/g, ' ');
  return sentence.length > 180 ? `${sentence.slice(0, 177)}…` : sentence;
}

/* ------------------------------------------------------------------------------ the context */

const controlsByPanel = new WeakMap();

/** What readStatement knows besides the text, as it reads it. */
function contextOf(context = {}) {
  const panel = context?.panel ?? null;
  let controls = [];
  if (panel && typeof panel === 'object') {
    controls = controlsByPanel.get(panel);
    if (!controls) { controls = panelControls(panel); controlsByPanel.set(panel, controls); }
  }
  const set = context?.controlSet ?? (panel ? controlSetForPanel(panel) : null);
  let self = context?.selfControl ?? null;
  if (typeof self === 'string') self = controlNamed(controls, self);
  return {
    panel: panel && typeof panel === 'object' ? panel : null,
    controls,
    tempo: Number.isFinite(Number(context?.tempo)) && Number(context.tempo) > 0 ? Number(context.tempo) : 120,
    self: self && typeof self === 'object' ? self : null,
    fonts: context?.fonts ?? null,
    images: context?.images ?? null,
    // Each device role's profile and its whole parameter table (readDeviceParameter).
    devices: context?.devices ?? null,
    // The names the panel's scripts share (scriptNames.js), and which script this one is.
    names: context?.names ?? null,
    scriptId: context?.scriptId ?? null,
    resolvesToken: (name) => (set ? resolveToken(name, set) !== undefined : false),
    resolve: (value) => (set ? resolveToken(tokenNameOf(value), set) : undefined),
  };
}

/* ------------------------------------------------------------------------------ readStatement */

/**
 * @typedef {{ start: number, end: number }} Range  Offsets into the source, end exclusive.
 *
 * @typedef {object} Problem
 * @property {'error'|'warning'} severity  'error' when the runtime refuses the value, 'warning' when it
 *   runs it in a way the script may not mean.
 * @property {string} message  In the runtime's own words where it has them.
 *
 * @typedef {object} Arg  One written argument, one key of an options table, or one stop of a gradient.
 * @property {string|null} name  The param's name, the option's key, `stop N` for a gradient stop, the
 *   variable a loose value is assigned to, or null for an argument past the contract's params.
 * @property {object|null} param  The contract's param or option-field descriptor, or null.
 * @property {Range} range  The value's text (for an option, without its key).
 * @property {Range} [keyRange]  An option's key, as written (Lua's `["repeat"]` whole).
 * @property {string} text  The value's source text.
 * @property {boolean} literal  True when every part of it is written out.
 * @property {*} [value]  The literal's value: strings unquoted, numbers, booleans, null, arrays, objects.
 * @property {string} kind  colour | gradient | curve | envelope | division | scale | chord | enum | number |
 *   control | path | deviceParameter | note | event | animation | font | image | bytes | dash | options |
 *   text | computed | unknown.
 * @property {object} meaning  Kind by kind, as scriptValueKinds' readers document it; `meaning.choices`
 *   lists the alternatives for a choice. A colour's is { reader ('property' | 'stop' | 'drawing' |
 *   'math'), claimedBy ('schema' | 'path' | 'key' | 'form'), form, stored, css, swatch { rgb, alpha },
 *   alpha, takesAlpha, token?, none? }; a gradient's { stops [{ at, css, opacity?, … }], angle,
 *   defaultAngle, stored?, stopsTakeOpacity, complete }; an envelope's { points [{ index, x, y,
 *   pair }], count, complete, sorted, low, high }.
 * @property {Problem|null} problem
 * @property {Arg[]} [options]  An options table's keys (recursively), a section's or a patch map's
 *   settings, or a gradient's stops.
 * @property {'colour'|'gradient'|'choice'|'number'|'curve'|'envelope'|'font'|'image'|null} editable  The
 *   edit the UI may offer: the display panel's Colors or Gradient tab, a dropdown of meaning.choices, a
 *   field, the curve editor, the envelope's point editor, the Text tab's family list, the Assets tab;
 *   null for none.
 *
 * @typedef {object} Call
 * @property {string|null} memberId  The contract id, or null for a call that is not the API.
 * @property {string} path  How the contract names it ('ce.anim.to', 'set'), or the callee as written.
 * @property {string} summary  The contract's summary, first sentence.
 * @property {Range} range  The whole call.
 * @property {Range} nameRange  Its callee.
 * @property {Arg[]} args  One per argument written, mapped to the contract's params.
 * @property {object[]} missing  The required params not written.
 * @property {Call[]} children  Calls nested in its arguments.
 * @property {boolean} [open]  True when its bracket never closes (mid-edit).
 * @property {boolean} [self]  True for self.set / self.get, whose path is the attached control's.
 * @property {Problem|null} problem  A problem with the call itself rather than one argument: Lua's
 *   self:set(…), which passes self as the path.
 *
 * @typedef {object} Statement
 * @property {Range} range  The statements covering the caret's line (only their own text: a block's
 *   body is no part of its header).
 * @property {{ first: number, last: number }} lines  1-based.
 * @property {Call[]} calls  The calls in it, outermost first, in source order.
 * @property {Arg[]} values  Values outside any call that a kind claims anyway: a "#RRGGBB" string, a
 *   table field named for a colour (`local base = "#2A6BD4"`, record example 5).
 * @property {boolean} parsed  True when the statement came from a parse, false from the scanner.
 */

/**
 * The values in the statement the caret is in.
 *
 * @param {string} source
 * @param {'lua'|'javascript'|'typescript'|'python'|'cpp'|'csharp'|'java'} languageId
 * @param {number} caret  A character offset.
 * @param {object} [context]  Plain data, all optional:
 *   panel        the active panel document (controls tree, as panels.js holds it);
 *   controlSet   the control set "{accent}" resolves against (default: the panel's own);
 *   tempo        BPM, for milliseconds in beats (default 120);
 *   selfControl  the control a component script is attached to, or its name (for self.set paths);
 *   fonts        the families available (strings or { family }), for a font's check;
 *   images       the library's and panel's images (strings or { id, name }), for an image's check.
 * @returns {Statement|null}  null when the caret's line holds no statement (blank, a comment).
 */
export function readStatement(source, languageId, caret, context = {}) {
  const language = languageOf(languageId);
  if (!VALUE_LANGUAGES.includes(language)) return null;
  const src = String(source ?? '');
  if (!src.trim()) return null;
  let doc;
  try {
    doc = analysed(src, language);
  } catch {
    return null;
  }
  const pos = Math.max(0, Math.min(src.length, Number.isFinite(Number(caret)) ? Number(caret) : 0));
  const line = lineAt(doc.starts, pos);
  const unitIds = doc.lineUnits.get(line);
  if (!unitIds?.length) return null;
  const ctx = contextOf(context);

  let start = Infinity;
  let end = -Infinity;
  const calls = [];
  const values = [];
  for (const id of unitIds) {
    const info = doc.infos[id];
    const segments = info.segments.filter((s) => s.from <= line && line <= s.to);
    if (!segments.length) continue;
    for (const seg of segments) { start = Math.min(start, seg.s); end = Math.max(end, seg.e); }
    info.match ??= matchBrackets(info.stream);
    info.calls ??= scanCalls(info.stream, 0, info.stream.length, doc.fam, info.match);
    const env = { doc, info, ctx };
    const taken = [];
    for (const raw of info.calls) {
      const last = raw.close >= 0 ? raw.close : info.stream.length - 1;
      if (!segments.some((s) => raw.calleeA < s.i1 && last >= s.i0)) continue;
      taken.push([raw.calleeA, last]);
      calls.push(...built(buildCall(raw, env)));
    }
    values.push(...looseValues(env, segments, taken));
  }
  if (start === Infinity) return null;
  calls.sort((a, b) => a.range.start - b.range.start);
  values.sort((a, b) => a.range.start - b.range.start);
  return {
    range: { start, end },
    lines: { first: lineAt(doc.starts, start), last: lineAt(doc.starts, Math.max(start, end - 1)) },
    calls,
    values,
    parsed: doc.parsed,
  };
}

const built = (result) => (Array.isArray(result) ? result : [result]);
const KEPT_KINDS = (kind) => kind !== 'text' && kind !== 'unknown' && kind !== 'computed';

/** A call as the sidebar lists it, or — for one that is not the API and holds nothing worth a row —
 *  the API calls inside it, hoisted. */
function buildCall(raw, env) {
  const { doc, info } = env;
  const { stream } = info;
  const resolved = resolveCallee(raw.callee);
  const member = resolved?.member ?? null;
  const params = member ? paramsOf(member) : [];
  const args = [];
  const covered = new Set();
  let position = 0;
  const nodes = [];
  for (const rawArg of raw.args) {
    if (rawArg.b <= rawArg.a) { if (!rawArg.keyword) position += 1; continue; }
    let param = null;
    if (rawArg.keyword) param = params.find((p) => p.name === rawArg.keyword) ?? null;
    else { param = params[position] ?? null; position += 1; }
    if (param) covered.add(param.name);
    const node = literalOf(stream, rawArg.a, rawArg.b, doc.fam, info.match);
    const arg = argFrom(env, rawArg.a, rawArg.b, node, rawArg.keyword ?? param?.name ?? null, param);
    args.push(arg);
    nodes.push(node);
  }
  const path = member ? memberPath(member.id) : raw.callee;
  const site = { env, member, memberId: member?.id ?? null, path, resolved, args, nodes, raw };
  args.forEach((arg, i) => classify(arg, nodes[i], arg.param, site, i));
  animRefusals(site);
  const children = [];
  for (const nested of raw.calls) {
    // Python's dict(k=v) written as an argument is that argument's table, not a call of its own.
    if (nested.callee === 'dict' && args.some((a) => a.range.start === stream[nested.calleeA].s && a.kind !== 'computed')) continue;
    children.push(...built(buildCall(nested, env)));
  }
  const missing = member ? params.filter((p) => p.required && !covered.has(p.name)) : [];
  const call = {
    memberId: member?.id ?? null,
    path,
    summary: member ? firstSentence(member.summary) : '',
    range: { start: stream[raw.calleeA].s, end: (raw.close >= 0 ? stream[raw.close] : stream[stream.length - 1]).e },
    nameRange: { start: stream[raw.calleeA].s, end: stream[raw.calleeB - 1].e },
    args,
    missing,
    children,
  };
  if (raw.close < 0) call.open = true;
  call.problem = null;
  if (member && raw.method) {
    const written = doc.source.slice(call.nameRange.start, call.nameRange.end).replace(/\s+/g, '');
    const owner = written.slice(0, written.lastIndexOf(':'));
    call.problem = {
      severity: 'error',
      message: `${written} passes ${owner} itself as the first argument, so every argument lands one place over. `
        + `Write ${owner}.${written.slice(written.lastIndexOf(':') + 1)}(…).`,
    };
  }
  if (resolved?.self) call.self = true;
  if (member) return call;
  // A ce.<module>.<name> the module does not have fails the moment it runs: said on the call, with
  // what was meant, in the words the editor's own check says it in (unknownCalls.js).
  const unknown = unknownModuleCall(raw.callee);
  if (unknown) {
    call.problem = { severity: 'error', message: unknownModuleCallMessage(raw.callee, unknown) };
    return call;
  }
  if (args.some((a) => KEPT_KINDS(a.kind) || (a.options ?? []).some((o) => KEPT_KINDS(o.kind)))) return call;
  return children;
}

/* ------------------------------------------------------------------------- ce.anim's refusals */
// ce.anim.to, spring and envelope move numbers. panelRuntime's animationTarget refuses a target
// that is not one (text that is one is read as one), and its animatesColour a colour property as the
// path, a control's or the panel's own; either way nothing starts. Said here in those words.

const ANIM_VERBS = { animateTo: 'ce.anim.to', animateSpring: 'ce.anim.spring', animateEnvelope: 'ce.anim.envelope' };

function animRefusals(site) {
  const verb = ANIM_VERBS[site.memberId];
  if (!verb) return;
  const target = site.args.find((a) => a.param?.name === 'target');
  if (verb !== 'ce.anim.envelope' && target?.literal && !target.problem && realNumber(target.value) === undefined) {
    const why = target.value === undefined || target.value === null ? 'no number to move to was given'
      : typeof target.value === 'string' ? `"${target.value}" is not a number` : 'the target given is not a number';
    target.problem = { severity: 'error', message: `${verb}: ${why}, so nothing was started.` };
  }
  const path = site.args.find((a) => a.param?.name === 'path');
  // A colour refused outweighs a path reported only as not found: the runtime refuses it either way.
  if (!path?.literal || typeof path.value !== 'string' || path.problem?.severity === 'error') return;
  const [name, ...segs] = path.value.split('.').filter((s) => s !== '');
  if (!segs.length) return;
  const control = String(name).toLowerCase() === 'panel' ? null : controlNamed(site.env.ctx.controls, name);
  const colour = String(name).toLowerCase() === 'panel' ? panelColourFieldAt(segs.join('.'))
    : control ? colourFieldAt(control, segs.join('.')) : null;
  if (colour) path.problem = { severity: 'error', message: `${verb}: "${path.value}" is a colour, and ce.anim moves numbers, so nothing was started.` };
}

/** An Arg for stream[a..b), not yet classified. */
function argFrom(env, a, b, node, name, param) {
  const { stream } = env.info;
  const range = { start: stream[a].s, end: stream[b - 1].e };
  const literal = isLiteral(node);
  const arg = {
    name, param: param ?? null, range, text: env.doc.source.slice(range.start, range.end), literal,
    kind: 'unknown', meaning: {}, problem: null, editable: null,
  };
  if (literal) arg.value = valueOf(node);
  return arg;
}

/** An Arg for one entry of a table. */
function entryArg(env, entry, param) {
  const { stream } = env.info;
  if (entry.b <= entry.a) return null;
  const arg = argFrom(env, entry.a, entry.b, entry.node, entry.key, param);
  if (entry.keyA !== undefined) arg.keyRange = { start: stream[entry.keyA].s, end: stream[entry.keyB - 1].e };
  return arg;
}

/* ----------------------------------------------------------------------------- classifying */

const COLOUR_KEY = /(?:^|[a-z_])(?:colou?r|tint)$/i;
const isColourName = (key) => COLOUR_KEY.test(String(key ?? '')) || /^colou?r$/i.test(String(key ?? ''));
const HASH6 = /^#[0-9a-f]{6}$/i;

/** The kind the contract gives a param: its `kind`, or one its type, values, unit or fields imply. */
function kindOfParam(param) {
  if (!param) return null;
  if (param.kind) return param.kind;
  if (param.type === 'colour') return 'colour';
  if (param.type === 'path') return 'path';
  if (param.type === 'targetRef') return 'control';
  if (param.type === 'eventName') return 'event';
  if (param.type === 'bytes') return 'bytes';
  if (param.type === 'dumpKind') return 'dumpKind';
  if (Array.isArray(param.fields) && param.fields.length) return 'options';
  if (param.type === 'object') return 'options';
  if (Array.isArray(param.values) && param.values.length) return 'enum';
  if (param.unit || (Number.isFinite(param.min) && Number.isFinite(param.max))) return 'number';
  return null;
}

/** A sibling argument's literal value, by its param's name. */
function sibling(site, name) {
  const arg = site.args.find((a) => a.param?.name === name || a.name === name);
  return arg?.literal ? arg.value : undefined;
}

const moduleOf = (memberId) => memberModule()[memberId]?.module ?? '';

/** Fill in an Arg's kind, meaning, problem, options and editable. */
function classify(arg, node, param, site, index) {
  const kind = kindOfParam(param);
  // A value written at a path the call names (set's value): typed by that path.
  if (param?.at && site.memberId === 'set') { typeByPath(arg, node, site); return; }
  if (kind === 'options' || kind === 'patch') { optionsArg(arg, node, param, site); return; }
  if (kind === 'gradient') { gradientArg(arg, node, site); return; }
  // A table the contract says nothing about is still read for its colour-named keys and its
  // "#RRGGBB" items (record, "Where context comes from", 2 and 3).
  if (!kind && (node.type === 'table' || node.type === 'list')) {
    const rows = keyRows(site, node);
    if (arg.literal) { setRead(arg, rows.length ? 'options' : 'unknown', { meaning: {} }, null); } else computed(arg, null);
    if (rows.length) arg.options = rows;
    return;
  }
  if (!arg.literal) { computed(arg, kind); return; }
  const value = arg.value;
  switch (kind) {
    case 'colour': return colourArg(arg, value, colourSiteFor(site, param), 'schema');
    case 'curve': return setRead(arg, 'curve', readCurve(value), 'curve');
    // ce.anim.envelope's points: edited under the row only when the runtime would start the move,
    // since a point it refuses (an x of 50, say) has no place in a shape from 0 to 1.
    case 'envelope': {
      const read = readEnvelope(value);
      return setRead(arg, 'envelope', read, read.meaning.complete ? 'envelope' : null);
    }
    case 'division':
      if (typeof value === 'number') {
        return setRead(arg, 'number', readNumber(value, { ...param, unit: 'beats' }, { tempo: site.env.ctx.tempo, site: { path: site.path, time: timeSpec(site, param) } }), 'number');
      }
      return setRead(arg, 'division', readDivision(value, { verb: divisionVerb(site), words: param?.type === 'number or division' || site.memberId === 'afterBeats' ? 'beats' : 'division' }), 'choice');
    case 'scale': case 'chord': {
      const rootName = site.args.find((a) => a.param?.kind === 'note' && a !== arg);
      let root;
      if (rootName?.literal) root = typeof rootName.value === 'number' ? Math.floor(rootName.value) : readNote(rootName.value, {}).meaning.number;
      return setRead(arg, kind, readScaleOrChord(value, kind, { verb: site.path, root: root ?? undefined, musicWords: moduleOf(site.memberId) === 'ce.music' }), 'choice');
    }
    case 'note': {
      const midi = moduleOf(site.memberId) === 'ce.midi';
      return setRead(arg, 'note', readNote(value, { verb: midi ? site.memberId : site.path, outcome: midi ? 'nothing was sent' : 'there is no answer', midi }), null);
    }
    case 'enum': {
      const values = param.values;
      const read = readEnum(value, values, { path: site.path, name: param.name, refusal: ENUM_REFUSALS[site.memberId] });
      return setRead(arg, 'enum', read, 'choice');
    }
    case 'number': {
      const read = readNumber(value, param, { tempo: site.env.ctx.tempo, site: numberSite(site, param) });
      return setRead(arg, 'number', read, typeof value === 'number' ? 'number' : null);
    }
    case 'control': {
      const read = readControl(value, site.env.ctx);
      return setRead(arg, 'control', read, read.meaning.choices ? 'choice' : null);
    }
    case 'path': {
      const read = readPath(value, { ...site.env.ctx, self: site.resolved?.self ? site.env.ctx.self : null });
      return setRead(arg, 'path', read, null);
    }
    case 'event': {
      const target = site.args.find((a) => a !== arg && (a.param?.type === 'targetRef' || a.param?.kind === 'control'));
      return setRead(arg, 'event', readEvent(value, { anyTarget: target?.literal && target.value === '*', names: site.env.ctx.names }), 'choice');
    }
    case 'animation': {
      const read = readAnimation(value, { ...site.env.ctx, controlName: sibling(site, 'control') });
      return setRead(arg, 'animation', read, read.meaning.choices ? 'choice' : null);
    }
    // An element a component verb addresses (a pad, a cell, a zone, a slot), read against the
    // control the call names, with the verb's refusal when it addresses nothing.
    case 'componentIndex': case 'componentWord': {
      const target = sibling(site, 'target');
      const control = typeof target === 'string' ? controlNamed(site.env.ctx.controls ?? [], target) : null;
      const rest = site.args.filter((a) => a.param?.name !== 'target');
      const read = readComponentIndex(value, {
        memberId: site.memberId, at: rest.indexOf(arg), args: rest.map((a) => (a.literal ? a.value : undefined)),
        target: String(target ?? ''), control,
      });
      const editable = typeof value === 'number' ? 'number' : (typeof value === 'string' && read.meaning.choices?.length ? 'choice' : null);
      return setRead(arg, kind, read, editable);
    }
    // A device role, read against the roles there are; a dump's kind, against the main synth's
    // profile and the scripts' own declarations.
    // A timer, a setting, a custom event or an action another script names too.
    case 'sharedName': {
      const opts = site.args.find((a) => a !== arg && a.param?.name === 'opts');
      const scope = !opts ? 'panel' : !opts.literal ? null
        : typeof opts.value === 'string' ? opts.value : (opts.value?.scope ?? 'panel');
      const read = readSharedName(value, {
        names: site.env.ctx.names, memberId: site.memberId, scriptId: site.env.ctx.scriptId, scope,
        settings: site.env.ctx.panel?.scripting?.settings ?? null,
      });
      return setRead(arg, 'sharedName', read, typeof value === 'string' && read.meaning.choices.length ? 'choice' : null);
    }
    case 'deviceRole': {
      const read = readDeviceRole(value, { devices: site.env.ctx.devices, memberId: site.memberId, controls: site.env.ctx.controls });
      return setRead(arg, 'deviceRole', read, typeof value === 'string' && read.meaning.choices.length ? 'choice' : null);
    }
    case 'dumpKind': {
      const read = readDumpKind(value, { devices: site.env.ctx.devices, memberId: site.memberId });
      return setRead(arg, 'dumpKind', read, typeof value === 'string' && read.meaning.choices.length ? 'choice' : null);
    }
    case 'deviceParameter': {
      // The device is the call's own: read's and parameter's second argument, write's third, bind's
      // opts.role, each the main synth when it is not given.
      const role = site.memberId === 'deviceBind' ? sibling(site, 'opts')?.role : sibling(site, 'role');
      const read = readDeviceParameter(value, { devices: site.env.ctx.devices, role, memberId: site.memberId, control: sibling(site, 'control') });
      return setRead(arg, 'deviceParameter', read, read.meaning.choices ? 'choice' : null);
    }
    // A stroke's dash: shown as the line it draws, with the cap the same options give it, and
    // nothing to edit it with.
    case 'dash': return setRead(arg, 'dash', readDash(value, { cap: sibling(site, 'opts')?.cap }), null);
    case 'font': return setRead(arg, 'font', readFont(value, { fonts: site.env.ctx.fonts, path: site.path }), 'font');
    case 'image': return setRead(arg, 'image', readImage(value, { images: site.env.ctx.images, wantsData: site.memberId === 'drawImage', path: site.path }), 'image');
    case 'bytes': {
      if (param?.template) return setRead(arg, 'bytes', readSysexTemplate(site.spec ?? {}, site.specId), null);
      const read = readBytes(value, { verb: site.memberId, outcome: site.memberId === 'checksum' ? 'there is no checksum' : 'nothing was sent', sysex: site.memberId === 'sendSysex' });
      if (site.memberId === 'checksum' && read.meaning.bytes) read.meaning.checksum = checksumOf(sibling(site, 'type'), read.meaning.bytes);
      return setRead(arg, 'bytes', read, null);
    }
    default: return byForm(arg, value);
  }
}

/** Set an Arg's kind and what its reader said; `editable` only for a literal with no editor-blocking state. */
function setRead(arg, kind, read, editable) {
  arg.kind = kind;
  arg.meaning = read.meaning ?? {};
  arg.problem = read.problem ?? null;
  arg.editable = arg.literal ? editable : null;
}

function computed(arg, expects) {
  arg.kind = 'computed';
  arg.meaning = { expression: arg.text, expects: expects ?? null };
  arg.problem = null;
  arg.editable = null;
}

/** A value no context claims: a "#RRGGBB" string is a colour by its form; other text is free text. */
function byForm(arg, value) {
  if (typeof value === 'string' && HASH6.test(value)) {
    return colourArg(arg, value, { reader: 'property', refusal: colourRefusals.plain(), claimedBy: 'form' }, 'form');
  }
  arg.kind = typeof value === 'string' ? 'text' : 'unknown';
  arg.meaning = {};
  arg.problem = null;
  arg.editable = null;
}

function colourArg(arg, value, site, claimedBy) {
  const read = readColour(value, { ...site, claimedBy });
  setRead(arg, 'colour', read, 'colour');
}

/** Where a schema colour param is read, and the sentence its reader refuses in. */
function colourSiteFor(site, param) {
  const module = moduleOf(site.memberId);
  const { ctx } = site.env;
  if (module === 'ce.draw') {
    return { reader: 'drawing', refusal: colourRefusals.draw(site.path, `the ${site.path.split('.').pop()}`) };
  }
  // fromARGB and fromRGBA read in the order they name; the rest of ce.math as a property reads.
  if (module === 'ce.math') return { reader: param?.order ?? 'math', refusal: colourRefusals.math(site.path) };
  if (site.option === 'tint' && (site.memberId === 'imageSet' || site.memberId === 'imageIcon')) {
    const target = sibling(site, 'target');
    return { reader: 'property', refusal: colourRefusals.tint(`${site.path}("${target ?? ''}")`), resolvesToken: ctx.resolvesToken, resolve: ctx.resolve };
  }
  return { reader: 'property', refusal: colourRefusals.plain(), resolvesToken: ctx.resolvesToken, resolve: ctx.resolve };
}

/** How panelRuntime's timeRefused is called for this argument, or undefined: a timer's interval,
 *  after's delay, and syncTimer's and afterBeats' beats given as a number. */
function timeSpec(site, param) {
  const name = param?.name;
  if (site.memberId === 'after' && name === 'ms') {
    return { call: 'ce.time.after', unit: 'milliseconds', what: 'delay', positive: false, outcome: 'nothing was scheduled' };
  }
  if (site.memberId === 'startTimer' && name === 'ms') {
    return { call: `ce.time.startTimer("${sibling(site, 'id') ?? ''}")`, unit: 'milliseconds', what: 'interval', positive: true, outcome: 'no timer was started' };
  }
  if ((site.memberId === 'syncTimer' || site.memberId === 'afterBeats') && name === 'beats') {
    const sync = site.memberId === 'syncTimer';
    return { call: divisionVerb(site), unit: 'beats', what: 'number of beats', positive: sync, outcome: sync ? 'no timer was started' : 'nothing was scheduled' };
  }
  return undefined;
}

/** The words a division is refused in: ce.time.step's own, or the timer that reads one as beats. */
function divisionVerb(site) {
  if (site.memberId === 'syncTimer' || site.memberId === 'afterBeats') {
    const id = sibling(site, 'id');
    return site.memberId === 'syncTimer' ? `ce.time.syncTimer("${id ?? ''}")` : 'ce.time.afterBeats';
  }
  return site.path;
}

/** How a number's reader words a value outside its range. */
function numberSite(site, param) {
  const out = { path: site.path };
  const module = moduleOf(site.memberId);
  if (param.unit === '0 to 1') {
    if (module === 'ce.math') { out.unitWhat = site.memberId === 'colourAlpha' ? 'the alpha' : `the ${param.name}`; }
    if (site.memberId === 'drawOpacity') { out.unitWhat = 'the opacity'; out.unitOutcome = 'the opacity stays as it was'; }
  }
  if (module === 'ce.midi') out.midi = midiArgOf(site.memberId, param.name);
  if (site.memberId && module === 'ce.midi') out.path = site.memberId;
  out.time = timeSpec(site, param);
  if (site.memberId === 'sendNote' && param.name === 'ms') out.noteLength = 'sendNote';
  // A component verb's number, which the verb uses as the nearest end of its range when it is past it.
  if (COMPONENT_VERB_BY_ID.has(site.memberId)) {
    const target = sibling(site, 'target');
    const rest = site.args.filter((a) => a.param?.name !== 'target');
    out.componentClamp = { verb: COMPONENT_VERB_BY_ID.get(site.memberId), target: String(target ?? ''),
      args: rest.map((a) => (a.literal ? a.value : undefined)) };
  }
  // ce.time's helpers, which read every number they are given (timeWords.js).
  if (TIME_NUMBERS[site.memberId]?.args?.[param.name]) out.timeNumber = { memberId: site.memberId, name: param.name };
  // beatsToMs and msToBeats convert at their own bpm when it is one, and so does the row's hint.
  const bpm = (site.memberId === 'beatsToMs' || site.memberId === 'msToBeats') && param.name !== 'bpm' ? realNumber(sibling(site, 'bpm')) : undefined;
  if (bpm > 0) out.tempo = bpm;
  // ce.anim's duration, delay and beats, as the moves read them (panelRuntime's animTiming).
  if (ANIM_VERBS[site.memberId] && ['duration', 'delay', 'beats', 'stagger', 'damping', 'frequency'].includes(param.name)) {
    const fallback = { duration: 300, damping: 6, frequency: 12 }[param.name] ?? 0;
    out.animTiming = { name: param.name, fallback: Number(param.default ?? fallback) || fallback };
  }
  if (site.option === 'opacity' && OPACITY_SCALE_WARNINGS[site.memberId]) {
    out.scaleWarning = OPACITY_SCALE_WARNINGS[site.memberId](sibling(site, 'target') ?? '');
  }
  return out;
}

/* -------------------------------------------------------------------------- options tables */

/** A field list's shape, as the runtime's check reads it. */
function shapeOf(fields) {
  return {
    names: fields.filter((f) => f.name !== '<section>').map((f) => f.name),
    sections: fields.some((f) => f.name === '<section>'),
    nested: {},
  };
}

/**
 * An options table's rows: each key typed by the field it names, an unknown key refused in the
 * runtime's words, a section (create's and clone's props) typed by the templates, a patch map's
 * paths by the control.
 */
function optionsArg(arg, node, param, site, parent = '') {
  arg.kind = node.type === 'table' || node.type === 'list' ? 'options' : 'computed';
  arg.meaning = arg.kind === 'computed' ? { expression: arg.text, expects: 'options' } : {};
  arg.problem = null;
  arg.editable = null;
  if (arg.kind === 'computed') return;
  const fields = Array.isArray(param?.fields) && param.fields.length ? param.fields : null;
  if (param?.kind === 'patch') {
    const controlName = sibling(site, param.at ?? 'control');
    const control = typeof controlName === 'string' ? controlNamed(site.env.ctx.controls, controlName) : null;
    const state = sibling(site, 'state') ?? '';
    arg.options = pathRows(site, node, control ?? {}, '', (key) => colourRefusals.patch(controlName ?? '', state, key));
    return;
  }
  if (!fields) { arg.options = keyRows(site, node); return; }
  arg.meaning.fields = fields.map((f) => f.name);
  const shape = shapeOf(fields);
  const anyCase = site.memberId === 'imageSet';
  const rows = [];
  for (const entry of node.entries) {
    if (entry.key === null || /^\d+$/.test(entry.key)) continue;
    let field = fields.find((f) => f.name === entry.key);
    if (!field && anyCase) field = fields.find((f) => f.name.toLowerCase() === entry.key.toLowerCase());
    const row = entryArg(site.env, entry, field ?? null);
    if (!row) continue;
    rows.push(row);
    if (!field && shape.sections && SECTION_NAMES.has(entry.key)) {
      sectionRow(row, entry, site);
      continue;
    }
    if (!field) {
      row.kind = row.literal && typeof row.value === 'string' && HASH6.test(row.value) ? 'colour' : 'unknown';
      if (row.kind === 'colour') colourArg(row, row.value, { reader: 'property', refusal: colourRefusals.plain() }, 'form');
      row.problem = {
        severity: 'error',
        message: `${unknownOptionsMessage(site.path, { parent, keys: [entry.key], shape })}`
          + `${didYouMean(entry.key, shape.sections ? [...shape.names, ...SECTION_NAMES] : shape.names)}`,
      };
      row.editable = null;
      continue;
    }
    const optionSite = { ...site, option: field.name };
    if (Array.isArray(field.fields) && field.fields.length) {
      optionsArg(row, entry.node, field, optionSite, parent ? `${parent}.${field.name}` : field.name);
      continue;
    }
    if (field.template && kindOfParam(field) === 'bytes') {
      optionSite.spec = arg.literal ? arg.value : valueOf(node);
      optionSite.specId = sibling(site, 'id');
      if (!row.literal) { computed(row, 'bytes'); continue; }
      classify(row, entry.node, field, optionSite);
      continue;
    }
    classify(row, entry.node, field, optionSite);
  }
  arg.options = rows;
  if (site.memberId === 'deviceDefineParameter' && param?.name === 'spec' && !parent) specRefusalRow(arg, site);
}

/**
 * defineParameter's spec, refused as the runtime refuses it (parameterSpecRefusal): on the row of
 * the field the refusal names ("channel is 20, …", "nrpn.msb is 200, …"), else on the spec's own.
 * The definition says only the first field it cannot use, so the rows say only that one: a number
 * row's own range sentence is not the runtime's, and is dropped for it.
 */
function specRefusalRow(arg, site) {
  const flat = [];
  const walk = (rows, at) => {
    for (const row of rows ?? []) {
      const path = at ? `${at}.${row.name}` : String(row.name);
      flat.push({ row, path });
      walk(row.options, path);
    }
  };
  walk(arg.options, '');
  for (const { row } of flat) if (row.kind === 'number') row.problem = null;
  const error = arg.literal ? parameterSpecRefusal(arg.value, sibling(site, 'id')) : null;
  if (!error) return;
  const said = error.slice(error.indexOf('): ') + 3);
  const target = flat.find(({ path }) => said.startsWith(`${path} is `) || said.startsWith(`the ${path} is `))?.row ?? arg;
  for (const { row } of flat) if (row !== target && row.problem?.message === error) row.problem = null;
  if (!target.problem) target.problem = { severity: 'error', message: error };
}

/** create's and clone's `<section>`: a section's settings, typed by the templates (or the clone's control). */
function sectionRow(row, entry, site) {
  const isClone = site.memberId === 'panelClone';
  const name = isClone ? sibling(site, 'name') : sibling(site, 'type');
  const control = isClone && typeof name === 'string' ? controlNamed(site.env.ctx.controls, name) : null;
  const call = `${site.path}("${name ?? ''}")`;
  const outcome = isClone ? 'nothing was copied' : 'nothing was created';
  row.kind = entry.node.type === 'table' ? 'options' : 'computed';
  row.meaning = row.kind === 'options' ? { section: entry.key } : { expression: row.text, expects: 'options' };
  row.problem = null;
  row.editable = null;
  if (entry.node.type !== 'table') {
    if (entry.node.type !== 'computed') {
      row.problem = { severity: 'error', message: `${call}: "${entry.key}" takes a table of its settings, not ${row.text}, so ${outcome}.` };
    }
    return;
  }
  row.options = pathRows(site, entry.node, control ?? {}, entry.key, (path) => colourRefusals.props(call, outcome, path));
}

/**
 * Rows for a table whose keys are property paths (below `base` on `root`): a patch map, a section
 * written whole. A colour field is typed by the templates; a table inside is walked.
 */
function pathRows(site, node, root, base, refusalAt) {
  const rows = [];
  for (const entry of node.entries) {
    if (entry.key === null) continue;
    const row = entryArg(site.env, entry, null);
    if (!row) continue;
    rows.push(row);
    const path = base ? `${base}.${entry.key}` : entry.key;
    if (entry.node.type === 'table') {
      row.kind = 'options';
      row.meaning = { path };
      row.options = pathRows(site, entry.node, root, path, refusalAt);
      continue;
    }
    const field = colourFieldAt(root, path);
    const named = !field && isColourName(path.split('.').pop());
    if (!row.literal) { computed(row, field || named ? 'colour' : null); continue; }
    if (field || named) {
      colourArg(row, row.value, {
        reader: field?.stop ? 'stop' : 'property', field: field ?? {}, refusal: refusalAt(path),
        resolvesToken: site.env.ctx.resolvesToken, resolve: site.env.ctx.resolve,
      }, field ? 'path' : 'key');
      continue;
    }
    byForm(row, row.value);
  }
  return rows;
}

/**
 * Rows for a table whose keys the contract does not list: a key named for a colour, and an item
 * that is "#RRGGBB". Keys with nothing to say about them are left out, so a table of numbers gives
 * no rows. A table inside is read the same way.
 */
function keyRows(site, node) {
  const rows = [];
  for (const entry of node.entries) {
    const named = entry.key !== null && isColourName(entry.key);
    const nested = entry.node.type === 'table' || entry.node.type === 'list';
    const form = entry.node.type === 'string' && HASH6.test(entry.node.value);
    if (!named && !nested && !form) continue;
    const row = entryArg(site.env, entry, null);
    if (!row) continue;
    if (nested) {
      const inner = keyRows(site, entry.node);
      if (!inner.length) continue;
      row.kind = 'options';
      row.options = inner;
      rows.push(row);
      continue;
    }
    rows.push(row);
    if (!row.literal) { computed(row, 'colour'); continue; }
    colourArg(row, row.value, { reader: 'property', refusal: colourRefusals.plain(), resolvesToken: site.env.ctx.resolvesToken, resolve: site.env.ctx.resolve }, named ? 'key' : 'form');
  }
  return rows;
}

/* ----------------------------------------------------------------------------- set's value */

/**
 * The value set() writes, typed by its path: a colour property by the section templates (on the
 * control the path names when the panel has it), a panel colour by the panel's own, else by the
 * last segment's name. A table written whole is typed key by key.
 */
function typeByPath(arg, node, site) {
  const pathArg = site.args.find((a) => a.param?.name === 'path');
  const pathText = pathArg?.literal && typeof pathArg.value === 'string' ? pathArg.value : null;
  if (pathText === null) {
    if (!arg.literal) { computed(arg, null); return; }
    byForm(arg, arg.value);
    return;
  }
  const { ctx } = site.env;
  const self = site.resolved?.self ? ctx.self : null;
  let segs = pathText.split('.').filter((s) => s !== '');
  if (segs.length > 1 && ['value', 'normalizedValue', 'midiValue'].includes(segs[segs.length - 1])) segs = segs.slice(0, -1);
  let root = {};
  let rel = segs;
  let panelPath = false;
  if (!self) {
    const [first, ...rest] = segs;
    rel = rest;
    if (String(first ?? '').toLowerCase() === 'panel') panelPath = true;
    else root = controlNamed(ctx.controls, first) ?? {};
  } else root = self;
  const shown = self ? `${self._children?.Core?.name ?? ''}.${pathText}` : pathText;
  const refusalAt = (at) => {
    const place = at === rel.join('.') ? '' : `at ${at.slice(rel.join('.').length + 1)}, `;
    return (why, advice) => `set("${shown}"): ${place}${why}, so nothing was set. ${advice}`;
  };
  const fieldAt = (path) => (panelPath ? panelColourFieldAt(path) : colourFieldAt(root, path));
  if (node.type === 'table') {
    arg.kind = 'options';
    arg.meaning = { path: rel.join('.') };
    arg.problem = null;
    arg.editable = null;
    arg.options = panelPath
      ? panelPathRows(site, node, rel.join('.'), refusalAt)
      : pathRows(site, node, root, rel.join('.'), refusalAt);
    return;
  }
  const relPath = rel.join('.');
  const field = relPath ? fieldAt(relPath) : null;
  const last = rel[rel.length - 1] ?? '';
  const stop = /^colou?r$/i.test(last) && rel.length >= 3 && /^\d+$/.test(rel[rel.length - 2]) && /^stops$/i.test(rel[rel.length - 3]);
  if (!arg.literal) { computed(arg, field || isColourName(last) ? 'colour' : null); return; }
  if (field || isColourName(last) || stop) {
    colourArg(arg, arg.value, {
      reader: field?.stop || stop ? 'stop' : 'property', field: field ?? {}, refusal: refusalAt(relPath),
      resolvesToken: ctx.resolvesToken, resolve: ctx.resolve,
    }, field ? 'path' : 'key');
    return;
  }
  byForm(arg, arg.value);
}

function panelPathRows(site, node, base, refusalAt) {
  const rows = [];
  for (const entry of node.entries) {
    if (entry.key === null) continue;
    const row = entryArg(site.env, entry, null);
    if (!row) continue;
    rows.push(row);
    const path = base ? `${base}.${entry.key}` : entry.key;
    if (entry.node.type === 'table' || entry.node.type === 'list') {
      row.kind = 'options';
      row.meaning = { path };
      row.options = panelPathRows(site, entry.node, path, refusalAt);
      continue;
    }
    const field = panelColourFieldAt(path);
    if (!row.literal) { computed(row, field ? 'colour' : null); continue; }
    if (field) {
      colourArg(row, row.value, { reader: field.stop ? 'stop' : 'property', field, refusal: refusalAt(path) }, 'path');
      continue;
    }
    byForm(row, row.value);
  }
  return rows;
}

/* --------------------------------------------------------------------------------- gradients */

/** ce.draw.gradient's stops: a strip in the row, a swatch per stop, the editor when all are written out. */
function gradientArg(arg, node, site) {
  if (node.type !== 'list' && node.type !== 'table') { computed(arg, 'gradient'); return; }
  const { stream } = site.env.info;
  const entries = node.entries.filter((e) => e.key === null || /^\d+$/.test(e.key));
  const stops = entries.map((e) => ({ node: e.node, literal: isLiteral(e.node), value: isLiteral(e.node) ? valueOf(e.node) : undefined,
    range: { start: stream[e.a].s, end: stream[e.b - 1].e } }));
  const angleArg = site.args.find((a) => a.param?.name === 'angle');
  const angle = angleArg?.literal && typeof angleArg.value === 'number' ? angleArg.value : undefined;
  const read = readDrawGradient(stops, angle);
  arg.kind = 'gradient';
  arg.meaning = {
    ...read.meaning,
    angleWritten: Boolean(angleArg),
    angleRange: angleArg ? angleArg.range : null,
    layout: stops.every((s) => typeof s.value === 'string') ? 'colours' : 'stops',
  };
  arg.problem = read.problem;
  const angleOk = !angleArg || angleArg.literal;
  arg.editable = arg.literal && read.meaning.complete && angleOk ? 'gradient' : null;
  // A row for each stop's colour, a swatch to open the Colors tab on.
  arg.options = [];
  entries.forEach((e, i) => {
    const stopMeaning = read.meaning.stops[i];
    let colourEntry = null;
    if (e.node.type === 'table') colourEntry = e.node.entries.find((x) => x.key === 'colour') ?? e.node.entries.find((x) => x.key === 'color');
    const target = colourEntry ?? e;
    const row = entryArg(site.env, { ...target, key: `stop ${i + 1}` }, null);
    if (!row) return;
    row.name = `stop ${i + 1}`;
    delete row.keyRange;
    if (!row.literal) { computed(row, 'colour'); arg.options.push(row); return; }
    colourArg(row, row.value, { reader: 'drawing', refusal: colourRefusals.gradientStop(`stop ${i + 1} of ${entries.length}`) }, 'schema');
    row.meaning.at = stopMeaning.at;
    if (stopMeaning.opacity !== undefined) row.meaning.opacity = stopMeaning.opacity;
    arg.options.push(row);
  });
}

/* ------------------------------------------------------------------------------ loose values */

/**
 * Values in the statement outside any call that a kind claims anyway: a "#RRGGBB" string anywhere,
 * and a table field or variable named for a colour (`colour = "FF5B9BD5"`). Record example 5's
 * `local base = "#2A6BD4"` is the case: that is where `base` is edited.
 */
function looseValues(env, segments, taken) {
  const { stream } = env.info;
  const out = [];
  const inCall = (i) => taken.some(([a, b]) => i >= a && i <= b);
  for (const seg of segments) {
    for (let i = seg.i0; i < seg.i1; i += 1) {
      const tok = stream[i];
      if (tok.t !== 'str' || inCall(i) || tok.open || tok.interp) continue;
      const before = stream[i - 1];
      const key = stream[i - 2];
      let name = null;
      if (before && before.t === 'op' && (before.v === '=' || before.v === ':') && key) {
        if (key.t === 'id') name = key.v;
        else if (key.t === 'str') name = key.v;
        else if (key.t === 'op' && key.v === ']' && stream[i - 3]?.t === 'str') name = stream[i - 3].v;
      }
      const named = name !== null && isColourName(name);
      if (!HASH6.test(tok.v) && !named) continue;
      const node = { type: 'string', value: tok.v, tok: i };
      const arg = argFrom(env, i, i + 1, node, name, null);
      colourArg(arg, tok.v, { reader: 'property', refusal: colourRefusals.plain(), resolvesToken: env.ctx.resolvesToken, resolve: env.ctx.resolve }, named ? 'key' : 'form');
      out.push(arg);
    }
  }
  return out;
}

/* ============================================================================ readJsonValues */
// The panel file view (editor/PanelFileView.svelte) shows one item of a panel's file, a control or
// the panel's own settings, as JSON (stores/panelFileText.js). It has keys and no calls, so its rows
// come from property names: a colour by the section templates (scriptColours.colourFieldAt on the
// control the text is, panelColourFieldAt on the panel's settings) or a stop's `color`, a stored
// gradient, and a field whose values are a closed list (a component's enum, an inspector select).

function jsonTree(tokens, match) {
  const at = (i) => tokens[i];
  const parse = (i, parent, key) => {
    const tok = at(i);
    if (!tok) return { node: null, next: i };
    if (tok.t === 'op' && (tok.v === '{' || tok.v === '[')) {
      const object = tok.v === '{';
      const close = match[i] >= 0 ? match[i] : tokens.length;
      const node = { type: object ? 'object' : 'array', a: i, b: close, s: tok.s, e: close < tokens.length ? tokens[close].e : tokens[tokens.length - 1].e,
        entries: [], parent, key };
      let j = i + 1;
      let index = 0;
      while (j < close) {
        const t = at(j);
        if (t.t === 'op' && t.v === ',') { j += 1; continue; }
        if (object) {
          if (t.t === 'str' && at(j + 1)?.t === 'op' && at(j + 1).v === ':') {
            const { node: value, next } = parse(j + 2, node, t.v);
            node.entries.push({ key: t.v, keyTok: j, value });
            j = Math.max(next, j + 3);
          } else j += 1;
        } else {
          const { node: value, next } = parse(j, node, index);
          node.entries.push({ key: index, keyTok: null, value });
          index += 1;
          j = Math.max(next, j + 1);
        }
      }
      return { node, next: close + 1 };
    }
    if (tok.t === 'op' && tok.v === '-' && at(i + 1)?.t === 'num') {
      return { node: { type: 'number', a: i, b: i + 2, s: tok.s, e: at(i + 1).e, value: -at(i + 1).v, parent, key }, next: i + 2 };
    }
    if (tok.t === 'str') return { node: { type: 'string', a: i, b: i + 1, s: tok.s, e: tok.e, value: tok.v, open: tok.open, parent, key }, next: i + 1 };
    if (tok.t === 'num') return { node: { type: 'number', a: i, b: i + 1, s: tok.s, e: tok.e, value: tok.v, parent, key }, next: i + 1 };
    if (tok.t === 'id') {
      const value = tok.v === 'true' ? true : tok.v === 'false' ? false : null;
      return { node: { type: 'literal', a: i, b: i + 1, s: tok.s, e: tok.e, value, parent, key }, next: i + 1 };
    }
    return { node: null, next: i + 1 };
  };
  return parse(0, null, null).node;
}

function jsonValue(node) {
  if (!node) return undefined;
  if (node.type === 'object') return Object.fromEntries(node.entries.map((e) => [e.key, jsonValue(e.value)]));
  if (node.type === 'array') return node.entries.map((e) => jsonValue(e.value));
  return node.value;
}

const jsonLiteral = (node) => Boolean(node) && !node.open && (node.type !== 'object' && node.type !== 'array'
  ? true : node.entries.every((e) => jsonLiteral(e.value)));

const jsonCache = new Map();

function jsonDoc(source) {
  const hit = jsonCache.get(source);
  if (hit) return hit;
  const tokens = tokenize(source, 'json');
  const match = matchBrackets(tokens);
  const doc = { tokens, match, starts: lineStartsOf(source), root: jsonTree(tokens, match), values: new WeakMap() };
  jsonCache.set(source, doc);
  while (jsonCache.size > 4) jsonCache.delete(jsonCache.keys().next().value);
  return doc;
}

const isControlNode = (node) => node?.type === 'object' && node.entries.some((e) => e.key === '_type' && e.value?.value === 'Control');

/** The enum values a field of a component's section takes, from the verbs and the inspector. */
const sectionValues = (() => {
  let map = null;
  return (section, key) => {
    if (!map) {
      map = new Map();
      for (const verb of COMPONENT_VERBS) {
        if (verb.k === 'enum' && Array.isArray(verb.values) && verb.f) map.set(`${verb.section}.${verb.f}`, verb.values);
      }
      for (const [sec, fields] of Object.entries(FIELD_SETS)) {
        for (const f of fields) {
          if (f.kind === 'select' && Array.isArray(f.options) && f.key && !map.has(`${sec}.${f.key}`)) {
            map.set(`${sec}.${f.key}`, f.options.map((o) => (Array.isArray(o) ? o[0] : o)));
          }
        }
      }
    }
    return map.get(`${section}.${key}`) ?? null;
  };
})();

/**
 * The values in the JSON object the caret is in, for the panel file view's Values sidebar.
 *
 * @param {string} source  The text the panel file view shows (stores/panelFileText.js): a control
 *   (controlFileText), the panel's settings (panelSettingsFileText), or the whole file.
 * @param {number} caret
 * @param {object} [context]  itemKind: 'control' | 'panel' (what the text is; found from the text when
 *   left out), control: the live control object (its document form, for typing by the templates and
 *   the document), panel: the panel (for a control-set reference), controlSet.
 * @returns {{ range: Range, lines: { first: number, last: number }, calls: [], rows: Arg[],
 *   path: (string|number)[], item: { kind: 'control'|'panel', controlType: string|null } }|null}
 *   `path` is the object's place in the text, from its root.
 */
export function readJsonValues(source, caret, context = {}) {
  const src = String(source ?? '');
  if (!src.trim()) return null;
  const doc = jsonDoc(src);
  if (!doc.root || doc.root.type !== 'object') return null;
  const pos = Math.max(0, Math.min(src.length, Number(caret) || 0));
  const line = lineAt(doc.starts, pos);
  const inside = (node) => node && (node.type === 'object' || node.type === 'array') && node.s <= pos && pos < node.e;
  let obj = inside(doc.root) ? doc.root : null;
  if (!obj) return null;
  // Down to the innermost object holding the caret.
  for (;;) {
    const child = obj.entries.find((e) => inside(e.value));
    if (!child) break;
    obj = child.value;
  }
  // …and into an object that starts on the caret's line, when the caret is on its key.
  for (;;) {
    if (obj.type === 'array') break;
    const onLine = obj.entries.filter((e) => e.value && (e.value.type === 'object') && lineAt(doc.starts, e.value.s) === line
      && (e.keyTok === null || lineAt(doc.starts, doc.tokens[e.keyTok].s) === line) && pos <= e.value.s);
    if (onLine.length !== 1) break;
    obj = onLine[0].value;
  }
  while (obj && obj.type === 'array') obj = obj.parent;
  if (!obj) return null;

  // Its place, and the control (or panel) it belongs to.
  const chain = [];
  for (let n = obj; n; n = n.parent) chain.unshift(n);
  const path = chain.slice(1).map((n) => n.key);
  let controlAt = -1;
  chain.forEach((n, i) => { if (isControlNode(n)) controlAt = i; });
  const itemKind = controlAt >= 0 ? 'control' : (context?.itemKind === 'control' ? 'control' : 'panel');
  const controlNode = controlAt >= 0 ? chain[controlAt] : null;
  let root = null;
  if (controlNode) {
    if (controlAt === 0 && context?.control && typeof context.control === 'object') root = context.control;
    else {
      root = doc.values.get(controlNode);
      if (!root) { root = jsonValue(controlNode); doc.values.set(controlNode, root); }
    }
  }
  const relBase = controlNode ? chain.slice(controlAt + 1).map((n) => n.key) : path;
  const controlType = root?._children?.Core?.controlType ?? null;
  const ctx = contextOf(context);

  const rows = [];
  for (const entry of obj.entries) {
    const node = entry.value;
    if (!node || entry.keyTok === null) continue;
    const key = entry.key;
    const rel = [...relBase, key].filter((k) => k !== '_children');
    const relPath = rel.join('.');
    const row = jsonRow(src, doc, entry);
    const field = controlNode ? colourFieldAt(root, relPath) : panelColourFieldAt(relPath);
    const inStops = obj.parent?.type === 'array' && String(obj.parent.key).toLowerCase() === 'stops';
    if (node.type === 'string' && (field || (inStops && /^colou?r$/i.test(key)) || isColourName(key))) {
      const stop = field?.stop || (inStops && /^colou?r$/i.test(key));
      colourArg(row, node.value, { reader: stop ? 'stop' : 'property', field: field ?? {}, refusal: colourRefusals.plain(),
        resolvesToken: ctx.resolvesToken, resolve: ctx.resolve }, field ? 'path' : 'key');
      rows.push(row);
      continue;
    }
    if (node.type === 'object' && /gradient$/i.test(key) && node.entries.some((e) => e.key === 'stops' && e.value?.type === 'array')) {
      const value = jsonValue(node);
      const read = readStoredGradient(value);
      row.kind = 'gradient';
      row.meaning = read.meaning;
      row.problem = read.problem;
      row.editable = row.literal && read.meaning.complete ? 'gradient' : null;
      const stops = node.entries.find((e) => e.key === 'stops').value;
      row.options = stops.entries.map((s, i) => {
        const colour = s.value?.type === 'object' ? s.value.entries.find((x) => x.key === 'color' || x.key === 'colour') : null;
        if (!colour || colour.value?.type !== 'string') return null;
        const stopRow = jsonRow(src, doc, colour);
        stopRow.name = `stop ${i + 1}`;
        colourArg(stopRow, colour.value.value, { reader: 'stop', field: { stop: true }, refusal: colourRefusals.plain() }, 'path');
        stopRow.meaning.at = read.meaning.stops[i]?.at ?? null;
        return stopRow;
      }).filter(Boolean);
      rows.push(row);
      continue;
    }
    if ((node.type === 'string' || node.type === 'number') && controlNode && rel.length === 2) {
      const values = sectionValues(rel[0], key);
      if (values) {
        setRead(row, 'enum', readEnum(node.value, values, { name: key }), 'choice');
        rows.push(row);
      }
    }
  }
  return {
    range: { start: obj.s, end: obj.e },
    lines: { first: lineAt(doc.starts, obj.s), last: lineAt(doc.starts, Math.max(obj.s, obj.e - 1)) },
    calls: [],
    rows,
    path,
    item: { kind: itemKind, controlType },
  };
}

function jsonRow(src, doc, entry) {
  const node = entry.value;
  const range = { start: node.s, end: node.e };
  const literal = jsonLiteral(node);
  const row = {
    name: String(entry.key), param: null, range, text: src.slice(range.start, range.end), literal,
    kind: 'unknown', meaning: {}, problem: null, editable: null,
  };
  if (entry.keyTok !== null) row.keyRange = { start: doc.tokens[entry.keyTok].s, end: doc.tokens[entry.keyTok].e };
  if (literal) row.value = jsonValue(node);
  return row;
}

/** For the tests: forget every cached parse. */
export function clearValueCacheForTesting() {
  cache.clear();
  jsonCache.clear();
}
