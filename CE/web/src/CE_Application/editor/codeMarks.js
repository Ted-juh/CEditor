// codeMarks.js — where the code editor draws the Values sidebar's three highlights, by line and
// column, behind the transparent textarea. docs/design/script-editor-value-editors.md, "Highlighting
// in the text what the sidebar is about".
//
// They are drawn as the occurrence marks are (CodeEditor.svelte, `ce-occ`): boxes placed by line and
// column, so nothing changes a character's width, and the text stays the browser's own textarea.
//
//   statement  a faint band over every line the listed statement covers, with a bar at its left
//   hover      a light box around the characters of the value under the pointer in the sidebar
//   edit       a stronger outlined box around the value an edit is open on
//
// A range over several lines gets one box per line: the first from where the value starts, the
// others from their indentation, the last to where it ends. A blank line inside it gets none.
// A long text is drawn a window of lines at a time (the editor's windowStart); a box is placed only
// for a line inside that window. A folded view draws none, since its lines are not the text's.

/** The kinds of mark, in the order they are drawn (later ones on top). */
export const MARK_KINDS = Object.freeze(['statement', 'hover', 'edit']);

/** The line (from 0) holding offset `index`, by the index of where each line starts. */
function lineOf(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The boxes to draw for `marks` over `text`.
 *
 * @param {{ start: number, end: number, kind: string }[]} marks  Offsets into `text`, end exclusive.
 * @param {string} text  The whole text the editor holds.
 * @param {number[]} starts  Where each of its lines starts (utils/lineIndex.js lineStartsOf).
 * @param {{ first?: number, last?: number, folded?: boolean }} [view]  The lines drawn (`last`
 *   exclusive), and whether the view is folded.
 * @returns {{ kind: string, line: number, col: number, width: number, band: boolean, key: string }[]}
 *   `line` from 0; `col` and `width` in characters; `band` for a statement line, drawn the whole
 *   width of the text area.
 */
export function markBoxes(marks, text, starts, { first = 0, last = Infinity, folded = false } = {}) {
  if (folded || !Array.isArray(marks) || !marks.length) return [];
  const src = String(text ?? '');
  const out = [];
  const order = (m) => MARK_KINDS.indexOf(m.kind);
  const sorted = marks.filter((m) => MARK_KINDS.includes(m?.kind)).slice().sort((a, b) => order(a) - order(b));
  for (const [n, mark] of sorted.entries()) {
    const start = Math.max(0, Math.min(src.length, Math.floor(Number(mark.start))));
    const end = Math.max(0, Math.min(src.length, Math.floor(Number(mark.end))));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const l0 = lineOf(starts, start);
    const l1 = lineOf(starts, end - 1);
    for (let line = Math.max(l0, first); line <= l1 && line < last; line += 1) {
      const lineStart = starts[line];
      const lineEnd = line + 1 < starts.length ? starts[line + 1] - 1 : src.length;
      const key = `${mark.kind}:${n}:${line}`;
      if (mark.kind === 'statement') {
        out.push({ kind: mark.kind, line, col: 0, width: 0, band: true, key });
        continue;
      }
      const indent = /^[ \t]*/.exec(src.slice(lineStart, lineEnd))[0].length;
      const from = line === l0 ? start : lineStart + indent;
      const to = line === l1 ? end : lineEnd;
      if (to <= from) continue;
      out.push({ kind: mark.kind, line, col: from - lineStart, width: to - from, band: false, key });
    }
  }
  return out;
}
