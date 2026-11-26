// lampFace.js — the face of a lamp: an LED, a jewel lens or a lit window, lit or dark. One drawing for
// a button's lamp beside its legend (CanvasControl) and a choice group's LED style
// (editor/ChoiceGroup.svelte), so a set's lamp looks the same on both.

/** A colour as CSS: `AARRGGBB` or `RRGGBB`, with or without `#`; anything else is `fallback`. */
export function lampCss(value, fallback) {
  const raw = String(value ?? '').replace(/^#/, '').trim();
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(raw)) return fallback;
  if (raw.length === 6) return `#${raw}`;
  return `rgba(${parseInt(raw.slice(2, 4), 16)}, ${parseInt(raw.slice(4, 6), 16)}, ${parseInt(raw.slice(6, 8), 16)}, ${(parseInt(raw.slice(0, 2), 16) / 255).toFixed(3)})`;
}

/**
 * The CSS for a lamp's face, without its box: its colour (a jewel with a highlight), its bezel, its
 * glow while lit or a sunken shadow while dark, and its corners (a window is a rounded slot).
 */
export function lampFaceCss({ kind = 'led', lit = false, colour, offColour, bezelColour, size = 9 } = {}) {
  const on = lampCss(colour, '#5B9BD5');
  const off = lampCss(offColour, '#2C2C2C');
  const bezel = lampCss(bezelColour, 'rgba(255,255,255,0.4)');
  const shown = lit ? on : off;
  const face = kind === 'jewel'
    ? `radial-gradient(circle at 35% 30%, rgba(255,255,255,${lit ? 0.75 : 0.35}) 0%, rgba(255,255,255,0) 45%), ${shown}`
    : shown;
  const glow = lit
    ? `0 0 ${Math.max(4, size * 0.8)}px ${on}, 0 0 ${Math.max(2, size * 0.25)}px ${on}`
    : 'inset 0 1px 2px rgba(0,0,0,0.6)';
  return [
    `background:${face}`,
    `border:1px solid ${bezel}`,
    `box-shadow:${glow}`,
    `border-radius:${kind === 'window' ? '2px' : '50%'}`,
  ].join('; ');
}
