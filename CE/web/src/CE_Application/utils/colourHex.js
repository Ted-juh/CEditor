// Helpers for pairing a native <input type="color"> (which only speaks
// #RRGGBB, no alpha) with the display model's AARRGGBB / RRGGBB hex strings.
// The text input stays the source of truth for alpha; the swatch edits RGB.

// AARRGGBB or RRGGBB -> "#RRGGBB" for a colour input's value.
export function aarrggbbToHex(value) {
  const s = String(value ?? '').replace(/^#/, '').trim();
  let rgb;
  if (s.length >= 8) rgb = s.slice(2, 8);
  else if (s.length === 6) rgb = s;
  else rgb = '000000';
  if (!/^[0-9a-fA-F]{6}$/.test(rgb)) rgb = '000000';
  return `#${rgb.toLowerCase()}`;
}

// Merge a picked "#rrggbb" back onto the previous value, PRESERVING its alpha
// (defaulting to FF when the previous value had none). Returns AARRGGBB upper.
export function mergeHexKeepAlpha(previous, hex) {
  const prev = String(previous ?? '').replace(/^#/, '').trim();
  const alpha = prev.length >= 8 ? prev.slice(0, 2) : 'FF';
  const rgb = String(hex ?? '').replace(/^#/, '').trim().padStart(6, '0').slice(0, 6);
  return `${alpha}${rgb}`.toUpperCase();
}
