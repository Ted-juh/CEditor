// wordLists.js — a word a script takes from a list the app defines, read in any case.
//
// The owner's rule (2026-10-24, on ce.components.lcd.animPreset): case does not matter for a word
// from a closed list, "everywhere". `blend("Multiply")`, `cap = "Round"` and `scroll("LEFT")` were
// refused, or drew the default, for a capital letter. Names an author makes up (a control, an
// element, a device parameter's own choices, a settings key) are not lists and stay exact.

/**
 * The word of `values` a script wrote, in any case and with spaces around it, as the list spells
 * it; null when it is none of them (or not text).
 *
 * @param {readonly string[]} values
 * @param {*} value
 * @returns {string|null}
 */
export function listWord(values, value) {
  if (typeof value !== 'string') return null;
  const want = value.trim().toLowerCase();
  return values.find((x) => typeof x === 'string' && x.toLowerCase() === want) ?? null;
}
