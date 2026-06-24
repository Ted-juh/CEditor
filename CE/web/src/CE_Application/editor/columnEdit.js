// columnEdit.js — pure transforms for column (block) editing, the practical core of
// multi-cursor: a caret on each of several lines at the same column, edited together.
// The editor applies these as a single full-text replacement (so it stays source-safe and
// undo-able); only the rendering of the multiple carets is overlay work in the component.
//
// Lines and columns are 0-based. A column spans [startLine, endLine] at column `col`.
// Lines shorter than `col` clamp to their end (no padding) — like common editors.

/** Insert `str` at `col` on every line in [startLine, endLine]. Returns the new source. */
export function columnInsert(source, startLine, endLine, col, str) {
  const lines = String(source ?? '').split('\n');
  const lo = Math.max(0, Math.min(startLine, endLine));
  const hi = Math.min(lines.length - 1, Math.max(startLine, endLine));
  for (let i = lo; i <= hi; i++) {
    const at = Math.min(col, lines[i].length);
    lines[i] = lines[i].slice(0, at) + str + lines[i].slice(at);
  }
  return lines.join('\n');
}

/** Delete one character before `col` on every line in [startLine, endLine]. */
export function columnDelete(source, startLine, endLine, col) {
  if (col <= 0) return String(source ?? '');
  const lines = String(source ?? '').split('\n');
  const lo = Math.max(0, Math.min(startLine, endLine));
  const hi = Math.min(lines.length - 1, Math.max(startLine, endLine));
  for (let i = lo; i <= hi; i++) {
    const at = Math.min(col, lines[i].length);
    if (at > 0) lines[i] = lines[i].slice(0, at - 1) + lines[i].slice(at);
  }
  return lines.join('\n');
}

/** Character offset of (line, col) in `source` (0-based line/col), clamped to the line. */
export function offsetOf(source, line, col) {
  const lines = String(source ?? '').split('\n');
  const ln = Math.max(0, Math.min(line, lines.length - 1));
  let off = 0;
  for (let i = 0; i < ln; i++) off += lines[i].length + 1;
  return off + Math.min(col, lines[ln].length);
}
