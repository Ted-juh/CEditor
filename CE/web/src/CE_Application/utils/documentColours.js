/**
 * Harvest the colours a panel actually uses, for the Colors tab's
 * "Panel" row — the design-tool convention (Canva's document colours)
 * that keeps a composition consistent without hand-copying hex codes.
 *
 * Generic walk: any string value that parses as RRGGBB/AARRGGBB under a
 * key containing colour/color/tint counts (which also catches gradient
 * stops — their key is `color`). Returned as 6-char RRGGBB, most-used
 * first, fully transparent entries skipped.
 */
const COLOUR_KEY = /colou?r|tint/i;
const HEX_VALUE = /^#?[0-9a-f]{6}$|^#?[0-9a-f]{8}$/i;

export function collectDocumentColours(panel, max = 10) {
  if (!panel) return [];
  const counts = new Map();

  const record = (value) => {
    const hex = String(value).replace(/^#/, '').toUpperCase();
    let rgb = hex;
    if (hex.length === 8) {
      if (hex.slice(0, 2) === '00') return;   // fully transparent — not a colour choice
      rgb = hex.slice(2);
    }
    counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
  };

  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        if (COLOUR_KEY.test(key) && HEX_VALUE.test(value)) record(value);
      } else {
        visit(value);
      }
    }
  };

  visit(panel.controls ?? []);
  if (typeof panel.bgColour === 'string' && HEX_VALUE.test(panel.bgColour)) record(panel.bgColour);
  if (panel.bgGradient?.stops) visit(panel.bgGradient.stops);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([rgb]) => rgb);
}
