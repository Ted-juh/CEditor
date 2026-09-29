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
//   slot    { slot }                                 the editor's own snippet, in this position

/** A number, or the fallback when it is not one. */
export function fieldNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

/** The range a field can WRITE, in stored units (a percent slider stores 0..1). */
export function writableRange(field) {
  if (field.kind !== 'range') return null;
  return field.percent ? { min: 0, max: 1 } : { min: field.min, max: field.max };
}

/**
 * Where the inspector and the scripting API disagree about a field. The inspector may offer LESS than
 * a script can reach (Kinetic's gravity is 0..4 by hand and -4..4 from a script, which is a choice),
 * but never more: a value the editor can set that a script is refused, or clamps, is a contradiction.
 * `verbs` is a COMPONENT_FAMILIES entry's verbs list.
 */
export function fieldsOutsideVerbs(fields, verbs) {
  const byField = new Map((verbs ?? []).filter((verb) => verb.min != null || verb.max != null).map((verb) => [verb.f, verb]));
  const problems = [];
  for (const field of fields) {
    const range = writableRange(field);
    const verb = range && byField.get(field.key);
    if (!verb) continue;
    if ((verb.min != null && range.min < verb.min) || (verb.max != null && range.max > verb.max)) {
      problems.push(`${field.key}: the inspector writes ${range.min}..${range.max}, a script accepts ${verb.min}..${verb.max}`);
    }
  }
  return problems;
}
