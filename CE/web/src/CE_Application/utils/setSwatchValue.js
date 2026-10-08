// What a colour swatch in the inspector should show: the colour the canvas draws.
//
// An editor builds its swatches from the document control, and the document holds what the author
// wrote, which for a property they never touched is the factory value. The canvas draws something
// else: the control set's family patch where the control still holds its factory value
// (models/controlSetFamilies.js), and every token reference resolved. So on Tolex the Turing's bar
// swatch said factory green while its bars were tan, and a swatch holding a reference such as
// `{display.lit}` could not be painted at all.
//
// This reads the same resolution the canvas does. The swatch shows the drawn colour and says when
// it comes from the set; picking a colour writes a literal, which is the author's from then on.

import { controlSetForControl, readControlPath, resolveControlForSet } from '../models/controlSetFamilies.js';

const resolvedBySet = new WeakMap();

function resolvedFor(control, set) {
  let bySet = resolvedBySet.get(control);
  if (!bySet) {
    bySet = new Map();
    resolvedBySet.set(control, bySet);
  }
  const key = set ?? null;
  if (!bySet.has(key)) bySet.set(key, resolveControlForSet(control, controlSetForControl(control, set)));
  return bySet.get(key);
}

const HEX = /^#?([0-9A-F]{6}|[0-9A-F]{8})$/i;
const canonical = (value) => {
  const text = String(value ?? '').trim().replace(/^#/, '').toUpperCase();
  return text.length === 6 ? `FF${text}` : text;
};

/**
 * The colour a control's property is drawn in, and whether the set supplied it.
 * `shown` is the value the editor passed: when it is not the document's own value at that path
 * (the inspector is showing a state's value), it is left alone. Returns null to leave it alone.
 */
export function effectiveSwatchColour(control, set, path, shown) {
  if (!control || !path) return null;
  const stored = readControlPath(control, path);
  if (stored !== undefined && canonical(stored) !== canonical(shown)) return null;
  const drawn = readControlPath(resolvedFor(control, set), path);
  if (typeof drawn !== 'string' || !HEX.test(drawn.trim())) return null;
  return { value: canonical(drawn), fromSet: canonical(drawn) !== canonical(stored ?? shown) };
}
