// shownValue.js — a value as a message shows it, in the words every runtime uses (panelRuntime's
// shownValue, each prelude's __shownValue): "nothing" for none, a number as JavaScript writes it,
// text in quotes, "a list" for a table. For the modules that say a runtime's sentence without
// loading the runtime: the Values tab reads them to say what a call does.

/** "nothing", true, 3, "Kick", a list, a function. */
export function shownValue(value) {
  if (value === undefined || value === null) return 'nothing';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    return Number.isFinite(value) ? String(value) : value > 0 ? 'Infinity' : '-Infinity';
  }
  if (typeof value === 'string') return `"${value}"`;
  return typeof value === 'function' ? 'a function' : 'a list';
}
