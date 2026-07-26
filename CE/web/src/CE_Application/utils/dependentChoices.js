// Cascading (dependent) selectors: a combobox/listbox/radio can show only the
// choice rows that belong to another selector's current value. Each row is
// tagged with `parentValue` (the parent's internalValue it belongs to); an
// empty tag means "show for every parent value" (a shared/global row). Section
// headers are always kept. The child names its parent via `Value.dependsOn`
// (the parent control's id). Pure + unit-testable — no store/runtime imports,
// so it can be used from the model, the renderer, the hit-test and the store
// without an import cycle.

// The id of the parent selector this control depends on ('' when independent).
export function dependsOnId(control) {
  return String(control?._children?.Value?.dependsOn ?? '').trim();
}

// Whether a parent-change should reset the child's selection (default true).
export function dependsResetOnChange(control) {
  return control?._children?.Value?.dependsResetOnChange !== false;
}

// Reduce a row array to those visible under `parentValue`. With no dependency
// the rows are returned unchanged. Headers are always kept; a row is shown when
// its `parentValue` tag is empty (global) or equals the parent's value.
export function visibleChoiceRows(rows, parentValue, dependsOn) {
  const all = Array.isArray(rows) ? rows : [];
  if (!dependsOn) return all;
  const pv = String(parentValue ?? '');
  return all.filter((row) => {
    if (row?.isHeader === true) return true;
    const tag = String(row?.parentValue ?? '').trim();
    return tag === '' || tag === pv;
  });
}

// A shallow-cloned control whose Value.rows are reduced to the parent value —
// so the renderer, hit-test and layout all read the same filtered set through
// the usual `Value.rows` path and stay aligned. Returns the control untouched
// when it has no dependency or nothing is filtered out. The clone preserves
// Core (id/name), so session lookups keyed by id still resolve.
export function dependentControl(control, parentValue) {
  const dependsOn = dependsOnId(control);
  if (!dependsOn) return control;
  const value = control?._children?.Value;
  const rows = value?.rows;
  if (!Array.isArray(rows)) return control;
  const filtered = visibleChoiceRows(rows, parentValue, dependsOn);
  if (filtered.length === rows.length) return control;
  return {
    ...control,
    _children: {
      ...control._children,
      Value: { ...value, rows: filtered },
    },
  };
}

// The first pickable value under a parent value (skips headers/disabled) — used
// to reset a child's selection when the parent changes. '' when nothing fits.
export function firstDependentValue(rows, parentValue, dependsOn) {
  const row = visibleChoiceRows(rows, parentValue, dependsOn)
    .find((r) => r?.isHeader !== true && r?.enabled !== false);
  return row ? String(row.internalValue ?? row.id ?? '') : '';
}
