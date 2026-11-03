// textLineHeight.js — the height of one line of text at `line-height: normal`, in px.
//
// A meter's label sits above or below its body and takes that much room from it (editor/MeterRenderer
// .svelte: a flex column), so a meter made into layers has to know it to put its track where the
// meter drew it. "Normal" is the font's own ascent, descent and line gap, which differ by typeface
// (Arial about 1.15 of the size, a monospace more), so it is measured where a document can measure
// it, and estimated where none can (a test in node).

const cache = new Map();

/** One line's height for `size` px of `family` at `line-height: normal`. */
export function normalLineHeight(family, size) {
  const px = Math.max(0, Number(size) || 0);
  const key = `${family}|${px}`;
  if (cache.has(key)) return cache.get(key);
  let height = px * 1.15;
  if (typeof document !== 'undefined' && document.body) {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute; left:-9999px; top:-9999px; visibility:hidden; white-space:nowrap; line-height:normal; font-size:${px}px; font-family:${family};`;
    probe.textContent = 'Hg';
    document.body.append(probe);
    const measured = probe.getBoundingClientRect().height;
    probe.remove();
    if (measured > 0) height = measured;
  }
  cache.set(key, height);
  return height;
}
