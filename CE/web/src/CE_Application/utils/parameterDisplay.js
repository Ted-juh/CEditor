// parameterDisplay.js — a control's readout written the way the synth writes the value, and typed
// text read back, from the same profile fields ce.format.parameter reads.
//
// A device parameter's `display` (dpd.schema.json parameterDisplay) says what kind of value it is:
// a cutoff stored 0..127 that reads 20 Hz..20 kHz, an LFO rate whose display follows a table. The
// adoption rules copy that onto the bound control (Behavior.displayFormat, displayTable,
// displayMiddleC, beside the displayMin/displayMax they already copied), and the readout writes it
// with formatCore.js's formatDescribed — the code every script runtime runs for
// ce.format.parameter, so a readout and a script's LCD line cannot disagree.
//
// ABSENT BY DEFAULT, as the display scale is (valueDisplayScale.js): no displayFormat (or "number")
// and no table means this returns null and the readout formats exactly as it always has.

import { formatDescribed, formatParse } from '../scripting/formatCore.js';
import { displayScale, fromDisplay } from './valueDisplayScale.js';

/** What `display.format` may be; the inspector lists them in this order. */
export const DISPLAY_FORMATS = ['number', 'hz', 'time', 'db', 'percent', 'pan', 'ratio', 'note', 'division', 'table'];

function finiteOr(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * The parameter description a Behavior stands for, or null when it asks for no special display.
 * `min`/`max` are the control's wire range.
 */
export function describedFromBehavior(behavior, min, max) {
  const format = typeof behavior?.displayFormat === 'string' ? behavior.displayFormat : '';
  const table = Array.isArray(behavior?.displayTable) && behavior.displayTable.length ? behavior.displayTable : null;
  if (!table && (!format || format === 'number' || !DISPLAY_FORMATS.includes(format))) return null;
  const display = {};
  if (format && format !== 'table') display.format = format;
  if (table) display.table = table;
  const displayMin = finiteOr(behavior?.displayMin, NaN);
  const displayMax = finiteOr(behavior?.displayMax, NaN);
  if (Number.isFinite(displayMin) && Number.isFinite(displayMax)) {
    display.min = displayMin;
    display.max = displayMax;
  }
  const precision = finiteOr(behavior?.precision, NaN);
  if (Number.isFinite(precision)) display.precision = Math.max(0, Math.min(6, Math.round(precision)));
  const middleC = finiteOr(behavior?.displayMiddleC, NaN);
  if (Number.isFinite(middleC)) display.middleC = middleC;
  return { type: 'integer', range: { min: finiteOr(min, 0), max: finiteOr(max, 127) }, display };
}

/** The readout text for a wire value, or null when the Behavior asks for the plain number. */
export function formatBehaviorDisplay(behavior, min, max, value) {
  const desc = describedFromBehavior(behavior, min, max);
  if (!desc) return null;
  // A readout has no console: a value a format refuses (a negative frequency) shows the placeholder.
  return formatDescribed(desc, value, undefined, () => {});
}

function asText(entry) {
  if (entry && typeof entry === 'object') return String(entry.text ?? '');
  return String(entry ?? '');
}

/** Typed text back to a wire value, or null when it cannot be read. The inverse of the above. */
export function parseBehaviorDisplay(behavior, min, max, text) {
  const desc = describedFromBehavior(behavior, min, max);
  if (!desc) return null;
  const typed = String(text ?? '').trim();
  if (!typed) return null;
  const { display, range } = desc;

  if (display.table) {
    const wanted = typed.toLowerCase();
    const first = display.table[0];
    if (first && typeof first === 'object' && first.upTo !== undefined) {
      let low = range.min;
      for (const entry of display.table) {
        if (asText(entry).trim().toLowerCase() === wanted) return low;
        low = finiteOr(entry?.upTo, low) + 1;
      }
    } else {
      const index = display.table.findIndex((entry) => asText(entry).trim().toLowerCase() === wanted);
      if (index >= 0) return range.min + index;
    }
    return null;
  }

  const kind = display.format;
  const scale = displayScale({ displayMin: display.min, displayMax: display.max }, range.min, range.max);
  if (kind === 'percent') {
    const fraction = formatParse(typed, { kind: 'percent' });
    return Number.isFinite(fraction) ? range.min + fraction * (range.max - range.min) : null;
  }
  if (kind === 'pan') {
    const a = scale ? display.min : range.min;
    const b = scale ? display.max : range.max;
    const center = a < 0 && b > 0 ? 0 : Math.floor((a + b) / 2 + 0.5);
    const shown = formatParse(typed, { kind: 'pan', min: a, max: b, center });
    return Number.isFinite(shown) ? fromDisplay(scale, shown) : null;
  }
  const opts = { kind };
  if (kind === 'note' && Number.isFinite(display.middleC)) opts.middleC = display.middleC;
  const shown = formatParse(typed, opts);
  return Number.isFinite(shown) ? fromDisplay(scale, shown) : null;
}
