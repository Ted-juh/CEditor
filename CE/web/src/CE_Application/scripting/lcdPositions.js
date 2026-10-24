// lcdPositions.js — where on an LCD a script writes, clears or reads: a layout, a row, columns.
//
// The owner's model (docs/design/api-descriptions-handoff.md, "The LCD's script model"). A display
// has layouts, and one without layouts has one: its lines. Each layout has text of its own, one
// string per row (`lines` on the layout), which the display draws wherever no zone paints. A
// position is either a row number, which is all text() and clear() took before, or a table that
// names any of three parts, each optional:
//
//   layout  a number counted from 1 (the inspector's order), or the layout's name as given there,
//           in any case, as a control's name is matched
//   row     a number counted from 1, or a range {first, last}
//   col     the same, for columns
//
// A part left out is the whole of it, and a layout left out is the layout showing. A range is
// written as a list because a table cannot hold "col = 5, 10": Lua reads the 10 as an entry of its
// own and JavaScript and Python refuse it, so an entry without a name is refused here rather than
// dropped. wasmoon hands a Lua list over as an object keyed "1", "2", … and that is read as a list.
//
// PURE, like lcdZones.js, so the reducer, the runtime's read and the Values tab answer alike.

import { listWord } from '../utils/wordLists.js';
import { resolveActiveLayoutId } from '../utils/lcdZones.js';
import { shownValue } from './shownValue.js';

/** The parts a position names, in the order the texts give them. */
export const POSITION_PARTS = ['layout', 'row', 'col'];

const NOUNS = { row: ['row', 'rows'], col: ['column', 'columns'] };

function layoutsOf(display) {
  return Array.isArray(display?.layouts) ? display.layouts : [];
}

/** How many layouts a script counts: the display's, or one, its lines. */
export function lcdLayoutCount(display) {
  return Math.max(1, layoutsOf(display).length);
}

/** The display's rows and columns, which every layout has. */
export function lcdRows(display) {
  const n = Math.round(Number(display?.rows));
  if (n >= 1) return n;
  return Math.max(1, Array.isArray(display?.lines) ? display.lines.length : 1);
}
export function lcdCols(display) {
  const n = Math.round(Number(display?.cols));
  return n >= 1 ? n : 16;
}

/**
 * The layout showing, counted from 0; 0 for a display without layouts, whose one is its lines. The
 * runtime puts the preview's answer in `__page.activeLayoutId`, as the preview does for the
 * renderer; without it, the layout the display rests on.
 */
export function lcdShownLayout(display) {
  const list = layoutsOf(display);
  if (!list.length) return 0;
  const id = String(display?.__page?.activeLayoutId ?? '') || resolveActiveLayoutId(display?.pages ?? {}, list, {});
  const at = list.findIndex((l) => String(l?.id ?? '') === id);
  return at >= 0 ? at : 0;
}

/** A layout's text, one string per row: at least the display's rows, more where more are stored. */
export function lcdLayoutText(display, layout) {
  const list = layoutsOf(display);
  const stored = list.length ? list[layout]?.lines : display?.lines;
  const text = Array.isArray(stored) ? stored : [];
  return Array.from({ length: Math.max(lcdRows(display), text.length) }, (_, r) => String(text[r] ?? ''));
}

/** The patch that stores `text` as a layout's text: the display's lines, or that layout's. */
export function lcdLayoutTextPatch(display, layout, text) {
  const list = layoutsOf(display);
  if (!list.length) return { lines: text };
  return { layouts: list.map((l, i) => (i === layout ? { ...l, lines: text } : l)) };
}

/** A list however the language spelled it: an array, or a Lua list over wasmoon. */
function asList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length && keys.every((k, i) => k === String(i + 1))) return keys.map((k) => value[k]);
  }
  return null;
}

/** A table of named parts, rather than a number, a text or a list. */
export function isPositionTable(value) {
  return value !== null && typeof value === 'object' && !asList(value);
}

/** A whole number counted from 1 inside 1..count, as a 0-based index, or null. Fractions round. */
function countedFrom1(value, count) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n) - 1;
  return i >= 0 && i < count ? i : null;
}

function noSuch(noun, plural, value, count) {
  return `There is no ${noun} ${shownValue(value)}: the ${plural} are 1 to ${count}.`;
}

/** Which layout a `layout` part names, counted from 0, or why it names none. */
export function lcdLayoutIndex(display, value) {
  const list = layoutsOf(display);
  const count = lcdLayoutCount(display);
  if (typeof value === 'string') {
    // In any case and trimmed, as a control's name and a pixel element's are matched.
    const wanted = value.trim().toLowerCase();
    const named = wanted ? list.findIndex((l) => String(l?.name ?? '').trim().toLowerCase() === wanted) : -1;
    if (named >= 0) return { index: named };
    const n = countedFrom1(value.trim() === '' ? null : value, count);
    if (n !== null && /^\s*\d+(\.\d+)?\s*$/.test(value)) return { index: n };
    return {
      refusal: list.length
        ? `There is no layout ${JSON.stringify(value)}. One of: ${list.map((l, i) => JSON.stringify(String(l?.name || i + 1))).join(', ')}.`
        : `There is no layout ${JSON.stringify(value)}: this display has no layouts, only its lines, which are layout 1.`,
    };
  }
  const n = countedFrom1(value, count);
  if (n !== null) return { index: n };
  if (typeof value !== 'number') return { refusal: `${shownValue(value)} is not a layout: a number counted from 1, or a name.` };
  return { refusal: list.length ? noSuch('layout', 'layouts', value, count) : `There is no layout ${shownValue(value)}: this display has one, its lines.` };
}

/** One part, `row` or `col`: a number, or a range {first, last}, as 0-based [first, last]. */
function axisOf(part, value, count) {
  const [noun, plural] = NOUNS[part];
  const list = asList(value);
  if (!list) {
    const i = countedFrom1(value, count);
    return i === null ? { refusal: noSuch(noun, plural, value, count) } : { range: [i, i], single: true };
  }
  if (list.length !== 2) return { refusal: `A range is two numbers, the first ${noun} and the last: ${part} = {5, 10}.` };
  const first = countedFrom1(list[0], count);
  if (first === null) return { refusal: noSuch(noun, plural, list[0], count) };
  const end = Number(list[1]);
  if (list[1] === null || list[1] === undefined || typeof list[1] === 'boolean' || !Number.isFinite(end)) {
    return { refusal: `${shownValue(list[1])} is not a number.` };
  }
  const last = Math.round(end) - 1;
  const cap = `${plural[0].toUpperCase()}${plural.slice(1)}`;
  if (last < first) return { refusal: `${cap} ${first + 1} to ${last + 1} run backwards: write {${last + 1}, ${first + 1}}.` };
  if (last >= count) {
    return { range: [first, count - 1], clamped: `${cap} ${first + 1} to ${last + 1}: the display has ${count}, so ${first + 1} to ${count} were used.` };
  }
  return { range: [first, last] };
}

/**
 * Read a position. Returns `{ layout, rows, cols, colFrom, refusal, clamped }`: the layout counted
 * from 0, `rows` and `cols` as 0-based [first, last] or null for all of them, `colFrom` when the
 * column is one number (text() writes from it), `refusal` why it addresses nothing, and `clamped`
 * what a range past the display's edge was cut to.
 */
export function lcdPosition(display, where) {
  const out = { layout: lcdShownLayout(display), rows: null, cols: null, colFrom: false, refusal: null, clamped: null };
  const refuse = (refusal) => ({ ...out, refusal });
  if (where === undefined || where === null) return out;
  const rows = lcdRows(display);
  if (!isPositionTable(where)) {
    if (asList(where)) return refuse('A position names its parts: {row = 2, col = 5}.');
    const i = countedFrom1(where, rows);
    return i === null ? refuse(noSuch('row', 'rows', where, rows)) : { ...out, rows: [i, i] };
  }
  const parts = {};
  for (const [key, value] of Object.entries(where)) {
    if (/^\d+$/.test(key)) return refuse(`${shownValue(value)} is in the position without a name: a range is written col = {5, 10}.`);
    const part = listWord(POSITION_PARTS, key);
    if (!part) return refuse(`${JSON.stringify(key)} is not part of a position: one of "layout", "row" or "col".`);
    if (part in parts) return refuse(`"${part}" is given twice.`);
    parts[part] = value;
  }
  if (parts.layout !== undefined && parts.layout !== null) {
    const named = lcdLayoutIndex(display, parts.layout);
    if (named.refusal) return refuse(named.refusal);
    out.layout = named.index;
  }
  for (const [part, count] of [['row', rows], ['col', lcdCols(display)]]) {
    if (parts[part] === undefined || parts[part] === null) continue;
    const axis = axisOf(part, parts[part], count);
    if (axis.refusal) return refuse(axis.refusal);
    out[`${part}s`] = axis.range;
    if (part === 'col') out.colFrom = axis.single === true;
    out.clamped ??= axis.clamped ?? null;
  }
  return out;
}

/**
 * text(): `text` written at a position. One row, the layout showing's unless the table names one;
 * the whole row, or from one column on (the rest of the row kept, as a hardware LCD prints at its
 * cursor), or into a range of columns, padded with blanks or cut at its end, as a zone is.
 * Returns `{ patch, line, refusal, clamped }`: `patch` empty when the row already reads so.
 */
export function lcdWriteAt(display, where, text) {
  const pos = lcdPosition(display, where);
  if (pos.refusal) return { patch: {}, refusal: pos.refusal };
  if (!pos.rows) return { patch: {}, refusal: isPositionTable(where) ? 'A row is needed: text writes one row.' : 'No row was given.' };
  if (pos.rows[0] !== pos.rows[1]) return { patch: {}, refusal: `text writes one row, not rows ${pos.rows[0] + 1} to ${pos.rows[1] + 1}.` };
  if (text === undefined || text === null) return { patch: {}, refusal: 'No text was given.' };
  const rows = lcdLayoutText(display, pos.layout);
  const r = pos.rows[0];
  const now = rows[r];
  const s = String(text);
  let line = s;
  if (pos.cols && pos.colFrom) {
    const c = pos.cols[0];
    line = now.slice(0, c).padEnd(c) + s + now.slice(c + s.length);
  } else if (pos.cols) {
    const [c0, c1] = pos.cols;
    const width = c1 - c0 + 1;
    line = now.slice(0, c0).padEnd(c0) + s.slice(0, width).padEnd(width) + now.slice(c1 + 1);
  }
  if (line === now) return { patch: {}, line, clamped: pos.clamped };
  const next = rows.map((x, i) => (i === r ? line : x));
  return { patch: lcdLayoutTextPatch(display, pos.layout, next), line, clamped: pos.clamped };
}

/**
 * clear(): a position blanked. Nothing is the whole of the layout showing; a row, a range of rows,
 * columns of them, one character. Only the layout's own text is cleared: a zone still shows its
 * control. Returns `{ patch, refusal, clamped }`.
 */
export function lcdClearAt(display, where) {
  const pos = lcdPosition(display, where);
  if (pos.refusal) return { patch: {}, refusal: pos.refusal };
  const rows = lcdLayoutText(display, pos.layout);
  const [r0, r1] = pos.rows ?? [0, rows.length - 1];
  const next = rows.map((line, r) => {
    if (r < r0 || r > r1) return line;
    if (!pos.cols) return '';
    const [c0, c1] = pos.cols;
    if (line.length <= c0) return line;
    const end = Math.min(line.length, c1 + 1);
    return line.slice(0, c0) + ' '.repeat(end - c0) + line.slice(end);
  });
  if (next.every((line, r) => line === rows[r])) return { patch: {}, clamped: pos.clamped };
  return { patch: lcdLayoutTextPatch(display, pos.layout, next), clamped: pos.clamped };
}

/**
 * read(t, "text", where): every row of a layout as a list, one row as text, the columns of one, one
 * character. A column past the end of what was written reads as the blank the display draws.
 */
export function lcdReadAt(display, where) {
  const pos = lcdPosition(display, where);
  if (pos.refusal) return { refusal: pos.refusal };
  const rows = lcdLayoutText(display, pos.layout).slice(0, lcdRows(display));
  const cut = (line) => {
    if (!pos.cols) return line;
    const [c0, c1] = pos.cols;
    return line.padEnd(c1 + 1).slice(c0, c1 + 1);
  };
  if (pos.rows && pos.rows[0] === pos.rows[1]) return { value: cut(rows[pos.rows[0]]) };
  const [r0, r1] = pos.rows ?? [0, rows.length - 1];
  return { value: rows.slice(r0, r1 + 1).map(cut) };
}

/** A position as a phrase, for the Values tab: "layout 2, row 4, columns 5 to 10". */
export function lcdPositionWords(display, where) {
  const pos = lcdPosition(display, where);
  if (pos.refusal) return '';
  const span = (range, noun, plural) => (!range ? `every ${noun}` : range[0] === range[1] ? `${noun} ${range[0] + 1}` : `${plural} ${range[0] + 1} to ${range[1] + 1}`);
  const name = layoutsOf(display)[pos.layout]?.name;
  const layout = layoutsOf(display).length ? `layout ${pos.layout + 1}${name ? ` (${name})` : ''}` : 'the lines';
  const cols = pos.cols ? `, ${pos.colFrom ? `from column ${pos.cols[0] + 1}` : span(pos.cols, 'column', 'columns')}` : '';
  return `${layout}, ${span(pos.rows, 'row', 'rows')}${cols}`;
}
