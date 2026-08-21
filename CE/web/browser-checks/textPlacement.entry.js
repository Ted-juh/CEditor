import { mount } from 'svelte';
import TextPlacement from './TextPlacement.svelte';

const app = mount(TextPlacement, { target: document.getElementById('host') });

const round = (n) => Math.round(n * 100) / 100;

/**
 * Where the INK is.
 *
 * `.text-glyphs` is the full line box — 144px wide inside a 160px control regardless of whether the
 * text is left, centred or right, because horizontal alignment happens inside it via text-align. So
 * measuring that element says nothing about where the characters ended up, which is the entire
 * question. A Range over the text nodes gives the glyphs' own box.
 */
function inkRect(root) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, found = false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (!r.width && !r.height) continue;
      found = true;
      minX = Math.min(minX, r.left); minY = Math.min(minY, r.top);
      maxX = Math.max(maxX, r.right); maxY = Math.max(maxY, r.bottom);
    }
  }
  return found ? { minX, minY, maxX, maxY } : null;
}

window.__textPlacement = () => {
  const out = {};
  for (const box of document.querySelectorAll('.case')) {
    const id = box.getAttribute('data-case');
    const glyphs = box.querySelector('.text-glyphs');
    if (!glyphs) { out[id] = null; continue; }
    const b = box.getBoundingClientRect();
    const ink = inkRect(glyphs);
    const g = glyphs.getBoundingClientRect();
    out[id] = {
      // The answer to "did the glyphs move".
      ink: ink ? [round(ink.minX - b.x), round(ink.minY - b.y), round(ink.maxX - ink.minX), round(ink.maxY - ink.minY)] : null,
      // Kept alongside so a diff says WHICH box moved, not just that something did.
      glyphBox: [round(g.x - b.x), round(g.y - b.y), round(g.width), round(g.height)],
      lines: [...box.querySelectorAll('.text-line')].map((el) => {
        const r = el.getBoundingClientRect();
        return [round(r.x - b.x), round(r.y - b.y), round(r.width), round(r.height)];
      }),
    };
  }
  return out;
};
window.__caseIds = app.caseIds;
window.__nodeCount = () => document.querySelectorAll('.case *').length;
window.__anchorCount = () => document.querySelectorAll('.case .text-anchor').length;
