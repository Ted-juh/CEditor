import { choiceIndexOf } from './exportParameters.js';
import { sectionValueOf, sectionValuePatch } from './sectionValueOverrides.js';

// A host choice stores an index even when the control stores a row's internal value. The
// exported list is fixed at panel load, so use that same authored row order in both directions.
export function choiceParameterForControl(param, control) {
  if (String(param?.choiceMode ?? 'index') === 'value') return param;
  if (String(param?.valueKind ?? '') !== 'choice') return null;
  const values = (control?._children?.Value?.rows ?? [])
    .filter((row) => row?.isHeader !== true)
    .map((row) => String(row?.internalValue ?? row?.id ?? ''));
  if (!values.length) return null;
  return { ...param, choiceMode: 'value', choiceValues: values };
}

/**
 * Which value of its control an export parameter addresses: `path` is "<controlName>.<leaf>".
 *
 * The control name is stripped whole. Taking everything after the first dot instead is what the
 * Player did, and a dotted name — every generated GAIA control is one, "tone1.filter.cutoff" — then
 * addressed "filter.cutoff.value": a custom channel nothing reads. DAW values and automation moved
 * no GAIA control, and a GAIA control moved never reached its host parameter, so none of it was
 * recorded or saved with the project.
 */
export function hostParameterLeaf(param) {
  const path = String(param?.path ?? '');
  const name = String(param?.controlName ?? '');
  if (name && path.startsWith(`${name}.`)) return path.slice(name.length + 1) || 'value';
  return path.split('.').slice(1).join('.') || 'value';
}

export function controlParamValue(session, leaf, choiceParam = null, sectionField = null) {
  if (!session) return undefined;
  if (sectionField) {
    const n = Number(sectionValueOf(session.sectionValues, sectionField.section, sectionField.field));
    return Number.isFinite(n) ? n : undefined;
  }
  if (leaf && leaf !== 'value') {
    const n = Number(session.customValues?.[leaf]);
    return Number.isFinite(n) ? n : undefined;
  }
  let value;
  // A slider drag sets both fields. Host automation subsequently updates valueOverride only,
  // which is also the field the renderer reads first; the old order echoed the stale drag value.
  if (session.valueOverrideEnabled) value = session.valueOverride;
  else if (session.currentValueOverrideEnabled) value = session.currentValueOverride;
  else if (typeof session.checked === 'boolean') value = session.checked ? 1 : 0;
  if (choiceParam) {
    const index = choiceIndexOf(choiceParam, value);
    return index == null ? undefined : index;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function hostValuePatch(mapping, hostValue, controlValue, session) {
  if (mapping.sectionField) {
    const { section, field } = mapping.sectionField;
    return { sectionValues: sectionValuePatch(session?.sectionValues, section, field, hostValue) };
  }
  if (mapping.leaf && mapping.leaf !== 'value') {
    return { customValues: { [mapping.leaf]: hostValue } };
  }
  if (mapping.valueKind === 'bool') {
    return { checked: hostValue >= 0.5, mixed: false, valueOverrideEnabled: false };
  }
  return { valueOverrideEnabled: true, valueOverride: controlValue };
}
