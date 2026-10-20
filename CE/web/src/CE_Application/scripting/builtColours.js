// builtColours.js — a colour a script builds from numbers it writes out: ce.math.rgbToHex(r, g, b)
// and ce.math.hslToHex(h, s, l). The Values tab gives such a call a colour row of its own, the
// colour it makes as the swatch, and the Colors tab writes a colour picked there back as the call's
// three numbers, the call and the text between them as they were (scriptValueWrite.js).
//
// This bends rule 6 of docs/design/script-editor-value-editors.md ("only literal text is edited; a
// computed value gets a mark at most, never an editor") and keeps its reason. The rule is there
// because a computed value is worked out from something the editor cannot see, a variable or the
// state at run time, so an editor would have to overwrite the expression or edit nothing. Neither
// is so here: every input is a number written out, and what the call makes of them is the runtime's
// own arithmetic (scriptColours.colourFromRgb, colourFromHsl), so the colour is known before the
// script runs, and the edit writes numbers where numbers were. A call with any part not written
// out (a variable, arithmetic) is computed as before, and gets no row.

import { colourFromRgb, colourFromHsl, hslOfChannels } from './scriptColours.js';

/** The calls that build a colour from three numbers, and the names of their numbers in order. */
export const BUILT_COLOURS = Object.freeze({
  rgbToHex: Object.freeze({ from: 'rgb', names: Object.freeze(['r', 'g', 'b']) }),
  hslToHex: Object.freeze({ from: 'hsl', names: Object.freeze(['h', 's', 'l']) }),
});

const BUILD = { rgb: colourFromRgb, hsl: colourFromHsl };
const WORDS = { r: 'red', g: 'green', b: 'blue', h: 'hue', s: 'saturation', l: 'lightness' };

/**
 * The colour a call builds, or null when it is not one of BUILT_COLOURS or any of its three
 * numbers is not written out: { from ('rgb' | 'hsl'), stored ("#RRGGBB", as the runtime answers),
 * parts } — `parts` the three arguments in the order the call names them, each { name, range,
 * text, value }.
 */
export function builtColourOf(memberId, args) {
  const spec = BUILT_COLOURS[memberId];
  if (!spec || !Array.isArray(args)) return null;
  const found = spec.names.map((name) => args.find((a) => (a.param?.name ?? a.name) === name));
  if (!found.every((a) => a?.literal && typeof a.value === 'number' && Number.isFinite(a.value))) return null;
  const parts = found.map((a, i) => ({ name: spec.names[i], range: { ...a.range }, text: a.text, value: a.value }));
  return { from: spec.from, stored: BUILD[spec.from](...parts.map((p) => p.value)), parts };
}

/** "red 255, green 128, blue 0": a built colour's numbers, named. */
export function builtWords(built) {
  return built.parts.map((p) => `${WORDS[p.name]} ${Number(p.value.toFixed(3))}`).join(', ');
}

/**
 * The three numbers that build `rgb` (RRGGBB, no "#") the way `from` builds it, in the order the
 * call takes them. Red, green and blue are the colour's bytes. Hue, saturation and lightness are
 * ce.math.hsl's answer, each to the fewest decimals (none, then one, two, three) at which
 * hslToHex builds that colour again. A grey has no hue of its own, so the one `written` keeps
 * the hue it had: any hue builds the same grey.
 */
export function builtNumbers(from, rgb, written = []) {
  const channels = [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16));
  if (from === 'rgb') return channels;
  const target = `#${rgb.toUpperCase()}`;
  const hsl = hslOfChannels(channels);
  if (hsl.s === 0 && Number.isFinite(written[0])) hsl.h = written[0];
  const exact = [hsl.h, hsl.s, hsl.l];
  for (let decimals = 0; decimals <= 3; decimals += 1) {
    const f = 10 ** decimals;
    const numbers = exact.map((v) => Math.round(v * f) / f);
    if (colourFromHsl(...numbers) === target) return numbers;
  }
  return exact.map((v) => Math.round(v * 1000) / 1000);
}

/** Whether `numbers` build the colour `rgb` (RRGGBB) the way `from` builds it. */
export function buildsColour(from, numbers, rgb) {
  return BUILD[from](...numbers) === `#${String(rgb).toUpperCase()}`;
}
