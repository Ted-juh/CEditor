// valueCompletions.js — completion over a value already written. With the caret inside a string
// literal that is a value the editor knows the choices for (a curve, a division, a scale or a chord,
// one of a fixed list, an event, a control, an animation, a font, an image), the code editor's
// completion lists those choices, and the one accepted replaces the whole value between the quotes,
// not only the part before the caret. docs/design/script-editor-value-editors.md, "Order of work",
// step 3: "reopen completion over an existing value".
//
// Nothing here works out what a value is or could be. The core (scriptValues.js) has said that, and
// its `meaning.choices` is the very list the Values tab's dropdown offers, so the two never
// disagree; this finds the value under the caret, the characters between its quotes, and lays the
// choices out as the editor's list takes them.
//
// It takes the core with it, which is a chunk of its own: the main chunk has a ceiling
// (test/bundleHygiene.test.js) the core would take it over. So it is never imported statically by
// the editor; BehaviorDesigner loads it once a script is open and hands the editor a function.

import { readStatement, writeValue } from './scriptValues.js';
import { tokenize } from './scriptValueScan.js';
import { beatsText, panelControls } from './scriptValueKinds.js';
import { DIVISIONS, DIVISION_LABELS } from './timeTables.js';
import { ALL_EVENTS } from './panelApi.js';
import { argAtOffset, statementRows } from '../editor/valueRows.js';

/**
 * @typedef {object} ValueOption  One row of the completion list.
 * @property {string} label   The choice, as the list shows it.
 * @property {string} insert  The characters it puts between the quotes: the label, escaped as the
 *   literal's own quotes need it.
 * @property {'value'} kind
 * @property {string} detail  What the choice is, in a few words ("8th T, 0.33 beats", "Knob").
 *
 * @typedef {object} ValueCompletion
 * @property {number} from  Where the value's text starts, after its opening quote (and any prefix).
 * @property {number} to    Where it ends, before its closing quote. A choice replaces [from, to).
 * @property {string} current  The value written there now.
 * @property {ValueOption[]} options  In the choices' own order: a curve or a division list has one.
 * @property {number} selected  The row the list opens on.
 */

/**
 * The choices for the value the caret is in, or null when the caret is in none the editor knows the
 * choices for: outside any string, in a string that is free text or a path, in a value that is not
 * written out (a variable, a call, text joined or interpolated), or before the opening quote or after
 * the closing one. Null means the editor's word completion is the one to ask.
 *
 * Forced (Ctrl+Space), the list is every choice, the one written selected so Enter keeps it; over a
 * value that is none of them, the choices the text before the caret starts or holds, or all of them
 * when none does. Not forced (typing), it is the choices the text before the caret starts, then
 * those that hold it, as word completion filters, the text itself left out when it is one already.
 * Whether a list with nothing typed opens at all is the editor's rule, the same as for words.
 *
 * @param {string} source
 * @param {string} languageId  A script language, as readStatement takes it.
 * @param {number} caret
 * @param {object} [context]  The core's context (panel, fonts, images…), as the Values tab passes it.
 * @param {{ force?: boolean }} [how]
 * @returns {ValueCompletion|null}
 */
export function valueCompletions(source, languageId, caret, context = {}, { force = false } = {}) {
  const src = String(source ?? '');
  const at = Number(caret);
  if (!Number.isFinite(at) || at < 0 || at > src.length || !mayBeInString(src, at)) return null;
  let statement;
  try {
    statement = readStatement(src, languageId, at, context);
  } catch {
    return null;
  }
  const arg = argAtOffset(statement, at);
  if (!arg?.literal || typeof arg.value !== 'string') return null;
  const choices = arg.meaning?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  // ce.draw.image takes the image's data, not its name, so a name offered there would be refused.
  if (arg.kind === 'image' && (arg.meaning.dataUrl || callOf(statement, arg)?.memberId === 'drawImage')) return null;
  const inner = innerOf(arg, languageId);
  if (!inner || at < inner.start || at > inner.end) return null;

  const current = arg.value;
  const written = src.slice(inner.start, inner.end);
  const prefix = src.slice(inner.start, at);
  const rows = [];
  const seen = new Set();
  for (const choice of choices) {
    const label = String(choice ?? '');
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const insert = insertFor(label, { src, languageId, arg, inner });
    // A choice that cannot be written between these quotes as they are is not offered.
    if (insert === null) continue;
    rows.push({ label, insert, kind: 'value', detail: detailOf(arg, label, context) });
  }
  if (!rows.length) return null;
  const range = { from: inner.start, to: inner.end, current };

  if (force) {
    const index = currentIndex(rows, arg, current);
    if (index >= 0) {
      // A value the runtime reads as a choice, written another way ("1/8t" for "1/8T", an event by
      // its id), is listed as it is written, in that choice's place, so Enter keeps it exactly. One
      // it refuses ("outback") has the choice selected as the choice is spelled: Enter corrects it.
      if (rows[index].label !== current && !arg.problem) rows[index] = { ...rows[index], label: current, insert: written };
      rows[index] = { ...rows[index], detail: rows[index].detail ? `now · ${rows[index].detail}` : 'now' };
      return { ...range, options: rows, selected: index };
    }
    const some = filtered(rows, prefix);
    return { ...range, options: some.length ? some : rows, selected: 0 };
  }
  return { ...range, options: filtered(rows, prefix), selected: 0 };
}

/* --------------------------------------------------------------------------- the value itself */

/**
 * Whether the caret could be in a string at all: a quote before it on its line and one after it.
 * The editor asks on every keystroke, and most are nowhere near a string, so this keeps the core's
 * read of the statement to the keystrokes that might be in one. A value the editor has choices for
 * is a name, which never runs over a line.
 */
function mayBeInString(src, at) {
  const start = src.lastIndexOf('\n', at - 1) + 1;
  let end = src.indexOf('\n', at);
  if (end < 0) end = src.length;
  return /["'`]|\[=*\[/.test(src.slice(start, at)) && /["'`]|\]=*\]/.test(src.slice(at, end));
}

/** The call an argument belongs to, as the Values tab's rows put it. */
function callOf(statement, arg) {
  return statementRows(statement).find((row) => row.arg === arg)?.call ?? null;
}

/** How many characters close a string the scanner read with quote `q`: a C++ raw string's
 *  R"delim( closes with )delim", a Lua long string's [==[ with ]==], the rest with their own. */
const closeLength = (q) => (q.startsWith('R"') ? q.length - 1 : q.length);

/**
 * Where a literal's own text is, between its quotes and after any prefix (Python's r, C#'s @, C++'s
 * u8), with its token: null for anything but one closed string, written out whole. A character
 * literal ('x' in C++, C# and Java) is not text.
 */
function innerOf(arg, languageId) {
  let toks;
  try {
    toks = tokenize(arg.text, languageId);
  } catch {
    return null;
  }
  const tok = toks.length === 1 ? toks[0] : null;
  if (!tok || tok.t !== 'str' || tok.open || tok.interp || tok.char || tok.s !== 0 || tok.e !== arg.text.length) return null;
  const end = arg.range.start + tok.e - closeLength(tok.q);
  return { start: end - tok.raw.length, end, tok };
}

// Characters no form of string in the seven languages treats as anything but themselves.
const PLAIN = /^[A-Za-z0-9 _.,:+\-/#*]*$/;

/**
 * The characters `label` is written as between the literal's quotes: itself when it is plain, else
 * as the core writes a string in the literal's form (scriptValueWrite's rule 1, keep the form), if
 * that form keeps the same quotes and reads back as `label`. Null when it does not: the quotes would
 * have to change, and a choice only ever replaces what is between them.
 */
function insertFor(label, { src, languageId, arg, inner }) {
  if (PLAIN.test(label)) return label;
  let out;
  try {
    out = writeValue(src, languageId, arg, label);
  } catch {
    return null;
  }
  if (!out) return null;
  const toks = tokenize(out.text, languageId);
  const tok = toks.length === 1 ? toks[0] : null;
  const same = tok && tok.t === 'str' && !tok.open && !tok.interp && tok.q === inner.tok.q
    && (tok.prefix ?? '') === (inner.tok.prefix ?? '') && tok.v === label;
  return same ? tok.raw : null;
}

/* ------------------------------------------------------------------------------- the list */

/** The row of the choice the written value is: the same text, or one its reader reads as that choice
 *  (any case; an event by its id rather than its handler name). -1 for none. */
function currentIndex(rows, arg, current) {
  const exact = rows.findIndex((row) => row.label === current);
  if (exact >= 0) return exact;
  const lower = current.toLowerCase();
  const anyCase = rows.findIndex((row) => row.label.toLowerCase() === lower);
  if (anyCase >= 0) return anyCase;
  if (arg.kind === 'event' && arg.meaning?.handler) return rows.findIndex((row) => row.label === arg.meaning.handler);
  return -1;
}

/** The rows `prefix` starts, then those that hold it, each in the choices' order; the prefix itself,
 *  when it is a choice already, left out, since there is nothing to complete. */
function filtered(rows, prefix) {
  if (!prefix) return rows;
  const p = prefix.toLowerCase();
  const starts = [];
  const holds = [];
  for (const row of rows) {
    if (row.label === prefix) continue;
    const label = row.label.toLowerCase();
    if (label.startsWith(p)) starts.push(row);
    else if (label.includes(p)) holds.push(row);
  }
  return [...starts, ...holds];
}

const KIND_WORDS = { curve: 'curve', scale: 'scale', chord: 'chord', animation: 'keyframe animation', font: 'font', image: 'image' };
const EVENT_BY_HANDLER = new Map(ALL_EVENTS.map((event) => [event.fn, event]));
const typesByPanel = new WeakMap();

/** A choice's line in the list, in a few words: a division's name and length, an event's first
 *  sentence, a control's type, else what kind of value it is. */
function detailOf(arg, label, context) {
  switch (arg.kind) {
    case 'division':
      return DIVISION_LABELS[label] ? `${DIVISION_LABELS[label]}, ${beatsText(DIVISIONS[label])}` : 'division';
    case 'event': {
      const summary = EVENT_BY_HANDLER.get(label)?.summary ?? '';
      return /^[\s\S]*?[.!?](?=\s|$)/.exec(summary)?.[0] ?? (summary || 'event');
    }
    case 'control': return controlTypes(context?.panel).get(label) ?? 'control';
    case 'enum': return arg.name ?? '';
    default: return KIND_WORDS[arg.kind] ?? '';
  }
}

/** Each control's name to its type, kept per panel: a list of controls can run to hundreds. */
function controlTypes(panel) {
  if (!panel || typeof panel !== 'object') return new Map();
  let types = typesByPanel.get(panel);
  if (!types) {
    types = new Map();
    for (const control of panelControls(panel)) {
      const core = control._children.Core;
      if (core.name && !types.has(core.name)) types.set(core.name, core.controlType ?? 'control');
    }
    typesByPanel.set(panel, types);
  }
  return types;
}
