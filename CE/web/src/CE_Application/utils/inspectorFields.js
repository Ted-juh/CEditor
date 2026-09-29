// inspectorFields.js — ordinary inspector fields described once, rendered by properties/FieldList.svelte.
//
// Most of a section editor is the same three lines per field: a PropertyCell with a label, a span and
// a hint, the widget, and a `set(key, value)` with the field's own default and scaling. This describes
// those fields as data so the renderer can draw them, and leaves everything that is not ordinary to
// the editor (`slot` fields render a snippet the editor supplies). Adopted one section at a time,
// starting with Kinetic — see docs/design/generated-inspector-fields.md for why this and not a JSON
// Schema form library.
//
// Field kinds:
//   toggle  { key, label, span, hint, defaultOn }   on/off. defaultOn: true reads a missing value as
//                                                    ON (the `value !== false` convention), false as OFF
//   range   { key, label, span, hint, min, max, step, default, decimals }
//           { ..., percent: true }                   a 0..1 value shown and dragged as 0..100 %
//   number  { key, label, span, hint, min, max, step, default }   a NumberCell (drag, type, reset)
//           { ..., compact: true }                   the cell drops its label strip; the NumberCell's
//                                                    own label (numberLabel, else label) shows instead
//           { ..., numberLabel }                     the NumberCell's label when it differs from the cell's
//           { ..., bare: true }                      the NumberCell alone, with no PropertyCell round it
//           { ..., clamp: true | 'min' }             clamp what is written to min..max, or only to min
//           { ..., reset: false }                    no reset-to-default on the NumberCell
//   select  { key, label, span, hint, default, options }   a <select>. options are [value, label]
//                                                    pairs, or bare values shown as themselves, in
//                                                    the order they are offered
//           { ..., table }                           the list of values the component itself reads
//                                                    (scripting/componentTables.js); a test holds
//                                                    `options` to exactly that set
//   slot    { slot }                                 the editor's own snippet, in this position
//
// Any field may carry `when: (values) => boolean`; it is drawn only while that holds.
//
// A range or number field is also where the SCRIPTING API reads its range: componentVerbs.js takes
// a verb's min/max from here (scriptRange), so the two cannot drift. A script reaches exactly the
// field's own range unless the field says `script: { min, max }` — a deliberate wider reach, such as
// Kinetic's gravity going negative from a script while the inspector stops at 0.

/** A number, or the fallback when it is not one. */
export function fieldNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Whether a field is drawn for these section values. */
export function fieldShown(field, values) {
  return typeof field.when !== 'function' || field.when(values ?? {}) === true;
}

/** A select's options as [value, label] pairs, in the order offered. */
export function selectOptions(field) {
  return (field.options ?? []).map((option) => (Array.isArray(option) ? option : [option, option]));
}

/** The value a number field shows: the stored one, else its default. */
export function numberValue(field, stored) {
  return stored ?? field.default;
}

/** What a number field stores for a value typed or dragged, clamped as the field says. */
export function numberWrite(field, value) {
  if (field.clamp === true) return Math.max(field.min, Math.min(field.max, value));
  if (field.clamp === 'min') return Math.max(field.min, value);
  return value;
}

/** What a toggle shows for a stored value. */
export function toggleOn(field, stored) {
  return field.defaultOn === false ? stored === true : stored !== false;
}

/** The slider's own min/max/step/value, and the text beside it. */
export function rangeView(field, stored) {
  if (field.percent) {
    const shown = Math.round(fieldNumber(stored, field.default ?? 0) * 100);
    return { min: 0, max: 100, step: 1, value: shown, text: `${shown}%` };
  }
  const value = fieldNumber(stored, field.default ?? 0);
  return {
    min: field.min, max: field.max, step: field.step, value,
    text: value.toFixed(field.decimals ?? 2),
  };
}

/** What a slider position stores. */
export function rangeWrite(field, sliderValue) {
  if (field.percent) return fieldNumber(sliderValue, (field.default ?? 0) * 100) / 100;
  return fieldNumber(sliderValue, field.default ?? 0);
}

/**
 * The range a field can WRITE, in stored units (a percent slider stores 0..1). A number field only
 * counts where it clamps: an unclamped NumberCell can be typed past its drag range.
 */
export function writableRange(field) {
  if (field.kind === 'range') return field.percent ? { min: 0, max: 1 } : { min: field.min, max: field.max };
  if (field.kind === 'number' && field.clamp === true) return { min: field.min, max: field.max };
  return null;
}

/**
 * The range a SCRIPT may write for this field, in stored units: its own `script` range if it has
 * one, else what the field itself spans (a percent slider spans 0..1). Null for fields with no range.
 */
export function scriptRange(field) {
  if (field?.script) return { min: field.script.min, max: field.script.max };
  if (field?.kind === 'range') return field.percent ? { min: 0, max: 1 } : { min: field.min, max: field.max };
  if (field?.kind === 'number' && field.min != null && field.max != null) return { min: field.min, max: field.max };
  return null;
}

/**
 * Fields whose own `script` range is narrower than what the inspector writes. A wider script reach is
 * a choice; a narrower one means the editor sets values a script is refused, which is a contradiction.
 */
export function scriptRangesNarrowerThanInspector(fields) {
  const problems = [];
  for (const field of fields) {
    const inspector = writableRange(field);
    const script = scriptRange(field);
    if (!inspector || !script) continue;
    if (inspector.min < script.min || inspector.max > script.max) {
      problems.push(`${field.key}: the inspector writes ${inspector.min}..${inspector.max}, a script accepts ${script.min}..${script.max}`);
    }
  }
  return problems;
}

/**
 * Selects whose options are not exactly the values the component reads. Order is free — it is how
 * the inspector presents them — but a value missing is one the editor cannot set, and a value extra
 * is one the component ignores.
 */
export function selectsOffTable(fields) {
  const problems = [];
  for (const field of fields) {
    if (field.kind !== 'select' || !Array.isArray(field.table)) continue;
    const offered = new Set(selectOptions(field).map(([value]) => value));
    const read = new Set(field.table);
    const missing = [...read].filter((value) => !offered.has(value));
    const extra = [...offered].filter((value) => !read.has(value));
    if (missing.length || extra.length) {
      problems.push(`${field.key}: ${missing.length ? `not offered ${missing.join(', ')}` : ''}${missing.length && extra.length ? '; ' : ''}${extra.length ? `offered but not read ${extra.join(', ')}` : ''}`);
    }
  }
  return problems;
}
