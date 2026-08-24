/**
 * Parse whatever a person actually types into a colour field.
 *
 * THE TRAP THIS REPLACES. The chooser's hex field accepted exactly 6 or 8 hex
 * characters; anything else was dropped on the floor and the field silently
 * snapped back to the old colour. Typing `#abc` — the shorthand every CSS
 * author writes — looked like the app had ignored the keystroke, and so did a
 * pasted `rgb(24, 32, 40)` and a typo. Silence is the worst possible answer
 * here: the user cannot tell "not a colour" from "colour refused".
 *
 * So this returns a REASON on failure, and the field shows it.
 *
 * Accepted forms (leading `#` and surrounding space optional, case free):
 *   RGB       `#abc`      → AABBCC, alpha 1
 *   ARGB      `#8abc`     → shorthand with alpha FIRST, matching the 8-digit
 *                           form below and the AARRGGBB the panel stores
 *   RRGGBB    `#aabbcc`   → alpha 1
 *   AARRGGBB  `#80aabbcc` → alpha from the leading pair
 *   rgb()/rgba()          → `rgb(24, 32, 40)`, `rgba(24 32 40 / 0.5)`
 *
 * Note the alpha-first order. CSS's 8-digit hex is #RRGGBBAA; this app's
 * stored colours are AARRGGBB (JUCE order) everywhere else, and a field that
 * disagreed with the value it displays would be worse than one that disagrees
 * with CSS.
 */

const HEX_LENGTHS = 'Use 3 (#ABC), 4 (#8ABC), 6 (#AABBCC) or 8 (#80AABBCC) hex digits.';

function fail(reason) {
  return { ok: false, reason };
}

function ok(color, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  return { ok: true, color: color.toUpperCase(), alpha: a };
}

function expand(nibble) {
  return nibble + nibble;
}

function parseRgbFunction(text) {
  const match = /^rgba?\(([^)]*)\)$/i.exec(text);
  if (!match) return null;

  // Both the legacy comma form and the modern space form, with an optional
  // `/ alpha`. Splitting on the separators rather than matching one grammar
  // keeps `rgb(1,2,3)`, `rgb(1 2 3)` and `rgba(1 2 3 / 50%)` on one path.
  const parts = match[1].replace(/\//g, ' ').split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) {
    return fail('rgb() needs three channels, plus an optional alpha.');
  }

  const channels = [];
  for (const part of parts.slice(0, 3)) {
    const pct = part.endsWith('%');
    const value = Number(pct ? part.slice(0, -1) : part);
    if (!Number.isFinite(value)) return fail(`"${part}" is not a number.`);
    channels.push(Math.max(0, Math.min(255, Math.round(pct ? (value / 100) * 255 : value))));
  }

  let alpha = 1;
  if (parts.length === 4) {
    const raw = parts[3];
    const pct = raw.endsWith('%');
    const value = Number(pct ? raw.slice(0, -1) : raw);
    if (!Number.isFinite(value)) return fail(`"${raw}" is not an alpha value.`);
    alpha = pct ? value / 100 : value;
  }

  const hex = channels.map((c) => c.toString(16).padStart(2, '0')).join('');
  return ok(hex, alpha);
}

/**
 * @param {string} text — raw field contents
 * @returns {{ok: true, color: string, alpha: number} | {ok: false, reason: string}}
 *          `color` is uppercase RRGGBB; `alpha` is 0-1.
 */
export function parseColourInput(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return fail('Enter a colour, e.g. #4A90D9.');

  if (/^rgba?\(/i.test(raw)) return parseRgbFunction(raw);

  const body = raw.replace(/^#/, '').replace(/\s+/g, '');
  if (!body) return fail('Enter a colour, e.g. #4A90D9.');

  const bad = body.match(/[^0-9a-fA-F]/g);
  if (bad) {
    const unique = [...new Set(bad)].join('');
    return fail(`"${unique}" is not a hex digit — use 0-9 and A-F.`);
  }

  switch (body.length) {
    case 3:
      return ok([...body].map(expand).join(''), 1);
    case 4:
      return ok([...body.slice(1)].map(expand).join(''), parseInt(expand(body[0]), 16) / 255);
    case 6:
      return ok(body, 1);
    case 8:
      return ok(body.slice(2), parseInt(body.slice(0, 2), 16) / 255);
    default:
      return fail(`${body.length} hex digits. ${HEX_LENGTHS}`);
  }
}

/** Round-trip helper: 0-1 alpha + RRGGBB → the `#AARRGGBB` the field displays. */
export function formatColourInput(color, alpha) {
  const aa = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16).padStart(2, '0').toUpperCase();
  return `#${aa}${String(color ?? '').replace(/^#/, '').toUpperCase()}`;
}
