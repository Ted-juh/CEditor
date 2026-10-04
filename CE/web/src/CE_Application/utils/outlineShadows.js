/**
 * outlineShadows.js — a part's Effects → Shadows, for a part whose shape is an outline, not its box.
 *
 * `buildShadowCSS` (effectsCSS.js) turns shadows into a CSS box-shadow, which follows the element's
 * box: on a combined shape that is a rectangle of shadow around a ring or a star. The renderer draws
 * these from the outline instead (InteractivePartRenderer's outline branch), with CSS box-shadow's
 * own geometry: an outer shadow is the shape moved by its offset, grown by its spread, blurred by half
 * its blur radius as a Gaussian's deviation, and shown only outside the shape; an inner one is the
 * outside of the shape moved and grown inward, blurred, shown only inside. Glows are the same with no
 * offset. Colours are read as box-shadow reads them (the RGB, not the alpha byte).
 */
const numberOr = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function outlineShadows(effects) {
  const items = effects?._children?.Shadows?.items ?? [];
  const outer = [];
  const inner = [];
  let reach = 0;
  for (const shadow of items) {
    if (!shadow?.enabled) continue;
    const glow = shadow.type === 'outer-glow' || shadow.type === 'inner-glow';
    const entry = {
      x: glow ? 0 : numberOr(shadow.offsetX, 0),
      y: glow ? 0 : numberOr(shadow.offsetY, 0),
      blur: Math.max(0, numberOr(shadow.blur, 0)),
      spread: numberOr(shadow.spread, 0),
      colour: `#${String(shadow.colour ?? 'FF000000').slice(-6)}`,
    };
    reach = Math.max(reach, Math.abs(entry.x) + Math.abs(entry.y) + entry.blur * 2 + Math.abs(entry.spread) + 4);
    if (shadow.type === 'inner' || shadow.type === 'inner-glow') inner.push(entry);
    else outer.push(entry);
  }
  return { outer, inner, reach };
}
