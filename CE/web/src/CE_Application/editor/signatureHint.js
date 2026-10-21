// signatureHint.js — where the code editor's signature hint goes (CodeEditor.svelte), and what of it
// is shown.
//
// It went above the caret, a box over the line before, wherever the caret was in the call. Now:
//
//   inline  on the caret's line, against the right edge of the text's visible area, in the code's
//           own font and line, when it ends there at least two characters after the line's end: it
//           covers no code, and the code it is about keeps its place on the left. A call over
//           several lines puts it on the line the caret is on. (It used to sit straight after the
//           line's end; the owner asked for it at the right edge on 2026-10-21, so it is found in
//           the same place on every line.)
//   above   when the line's end and the hint do not fit in the text's visible width (a long line, or
//           one scrolled sideways): a box over the line before, at the caret, kept inside the editor.
//           It is one line tall, in the code's own size, so it covers that line and no other.
//   below   the same box over the line after, when the caret is on the editor's top visible line
//           and there is no line above it to cover.
//
// A box wider than the editor folds the parameters but the one being typed to "…", as in
// "sendCC(…, cc, …)", and is cut at the editor's width with an ellipsis if even that is too wide.
//
// Pure: the editor measures, this decides. Positions are in screen pixels, as the editor's popups
// are placed.

export const HINT = Object.freeze({
  gapChars: 2,          // between the end of the line and an inline hint
  padX: 6,              // either side, inline or a box; both are a line tall, in the code's size
  boxBorder: 1,         // a box's border, inside its line's height
  margin: 4,            // kept clear of the text area's edges
});

// Columns as the editor draws them, a tab to its next stop (textColumns.js, which the editor's other
// overlays count with too).
export { visualColumn } from './textColumns.js';

/** The parameters as the hint shows them: each { text, active, index }, or, folded, the active one
 *  alone with "…" for each run of the others. `index` is the parameter's place in `params`, which
 *  picks its colour (scripting/paramColours.js); -1 for a "…". */
export function hintParts(params, active, fold = false) {
  const list = Array.isArray(params) ? params.map(String) : [];
  if (!fold) return list.map((text, i) => ({ text, active: i === active, index: i }));
  const out = [];
  list.forEach((text, i) => {
    if (i === active) out.push({ text, active: true, index: i });
    else if (out.at(-1)?.text !== '…' || out.at(-1)?.active) out.push({ text: '…', active: false, index: -1 });
  });
  return out;
}

/** "name(a, b, c)" as a count of characters. */
export function hintLength(name, parts) {
  return String(name ?? '').length + 2 + parts.reduce((n, p) => n + p.text.length, 0) + Math.max(0, parts.length - 1) * 2;
}

/**
 * Where the hint goes: { mode: 'inline' | 'above' | 'below', x, y, width, parts }, or null when the
 * caret's line is not in view.
 *
 *   lineEndX  where the caret line's last character ends (its trailing spaces not counted, unless
 *             the caret is among them), both it and caretX by the columns the editor draws
 *             (visualColumn), not the characters
 *   caretX, lineTop, lineHeight
 *   charWidth   the code's
 *   box       { left, right, top, bottom }: the text's visible area
 */
export function placeSignatureHint({ name, params, active, lineEndX, caretX, lineTop, lineHeight, charWidth, box }) {
  if (!box || !(charWidth > 0) || lineTop + lineHeight <= box.top || lineTop >= box.bottom) return null;
  const all = hintParts(params, active);
  const inlineWidth = hintLength(name, all) * charWidth + 2 * HINT.padX;
  const inlineX = box.right - HINT.margin - inlineWidth;
  if (lineEndX >= box.left && inlineX >= lineEndX + HINT.gapChars * charWidth) {
    return { mode: 'inline', x: inlineX, y: lineTop, width: Math.ceil(inlineWidth), parts: all };
  }
  const boxWidth = (parts) => hintLength(name, parts) * charWidth + 2 * (HINT.padX + HINT.boxBorder);
  const room = Math.max(0, box.right - box.left - 2 * HINT.margin);
  const parts = boxWidth(all) > room ? hintParts(params, active, true) : all;
  const width = Math.min(Math.ceil(boxWidth(parts)), Math.floor(room));
  const x = Math.max(box.left + HINT.margin, Math.min(caretX, box.right - HINT.margin - width));
  // Exactly over the line before, or the one after: the box is a line tall.
  if (lineTop - lineHeight >= box.top) return { mode: 'above', x, y: lineTop - lineHeight, width, parts };
  return { mode: 'below', x, y: lineTop + lineHeight, width, parts };
}
