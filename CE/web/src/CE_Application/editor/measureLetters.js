/**
 * measureLetters.js — a Svelte action that says where the browser set each letter of an SVG <text>
 * (getStartPositionOfChar), for words played a letter at a time (utils/svgWords.js). Put it on the
 * word drawn whole and hidden (visibility="hidden" still lays it out); `measured(key, { xs, end })` is
 * told each letter's start and the last one's end, once a key, and again once the fonts are in.
 *
 *   <text use:measureLetters={{ key, measured }} visibility="hidden" …>{word}</text>
 */
export function measureLetters(node, params) {
  let current = params;
  const read = () => {
    try {
      const n = node.getNumberOfChars();
      if (!n) return;
      const xs = Array.from({ length: n }, (_, i) => node.getStartPositionOfChar(i).x);
      current?.measured?.(current.key, { xs, end: node.getEndPositionOfChar(n - 1).x });
    } catch { /* not laid out yet: the words play whole */ }
  };
  read();
  document.fonts?.ready?.then(() => read());
  return {
    update(next) {
      const changed = next?.key !== current?.key;
      current = next;
      if (changed) read();
    },
  };
}
