// lineIndex.js — where each line of a text starts, to find a position's line without counting.
//
// Counting the newlines before an offset is fine for a script and a pause per keypress for a 3 MB
// file. An index of line starts is built once per text, and a line is then a binary search.

/** The character offset at which each line of `text` starts: [0, …]; one entry per line. */
export function lineStartsOf(text) {
  const starts = [0];
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) starts.push(at + 1);
  return starts;
}

/** The line (from 0) that offset `index` is on: the last line starting at or before it. */
export function lineAt(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
