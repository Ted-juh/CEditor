// textColumns.js — columns as the code editor draws them. The textarea draws a tab to its next stop,
// `tab-size: 2` (CodeEditor.svelte), so on a line with tabs a character's column is not its offset
// in the line. Everything the editor draws over the text by column (the completion list, the
// diagnostic underlines, the occurrence and Values marks, the rename box, the signature hint)
// counts with these, and so does the way back from a click to a character.

export const TAB_SIZE = 2;

/** The column `index` (a character offset into `line`) is drawn at, a tab taking the text to its
 *  next stop. Past the end, a column per character. */
export function visualColumn(line, index, tabSize = TAB_SIZE) {
  let col = 0;
  const text = String(line ?? '');
  for (let i = 0; i < Math.min(index, text.length); i++) col = text[i] === '\t' ? col + tabSize - (col % tabSize) : col + 1;
  return col + Math.max(0, index - text.length);
}

/** The character offset into `line` nearest column `col`: the way back from a click. A column inside
 *  a tab goes to whichever edge of the tab is nearer; past the end, the end. */
export function indexAtColumn(line, col, tabSize = TAB_SIZE) {
  const text = String(line ?? '');
  let at = 0;
  for (let i = 0; i < text.length; i++) {
    const next = text[i] === '\t' ? at + tabSize - (at % tabSize) : at + 1;
    if (col < next) return col - at <= next - col ? i : i + 1;
    at = next;
  }
  return text.length;
}
