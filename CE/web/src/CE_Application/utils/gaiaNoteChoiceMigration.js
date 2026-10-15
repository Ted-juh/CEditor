import { flatControls } from './containment.js';

// Repair only the two known legacy aliases, in freshly deserialized controls.
// Keep artwork, bindings, custom labels and unrelated choice tables untouched.
//
// By copying: a loaded control's rows can be one array several controls share, frozen
// (expandControls in stores/documentShape.js), and the six GAIA note tables are exactly that. Only
// the control itself is its own to write into.
export function repairGaiaNoteChoices(controls) {
  for (const control of flatControls(controls)) {
    const sections = control?._children;
    if (!sections?.DeviceBindings?.bindings?.some(binding =>
      binding.deviceRole === 'Roland GAIA SH-01'
      && /^tone[123]\.(?:lfo|modLfo)\.tempoSyncNote$/.test(binding.parameterId ?? ''))) continue;
    const rows = sections.Value?.rows;
    if (!Array.isArray(rows)) continue;
    let repaired = false;
    const next = rows.map(row => {
      const value = Number(row.sendValue);
      const old = value === 8 && row.displayText === '1/2' ? '12'
        : value === 13 && row.displayText === '1/6' ? '16' : null;
      if (!old || String(row.id) !== old || String(row.internalValue) !== old) return row;
      repaired = true;
      const id = `${old}_${value}`;
      return { ...row, id, internalValue: id, selectedByDefault: String(sections.Behavior?.defaultValue) === id };
    });
    if (repaired) control._children = { ...sections, Value: { ...sections.Value, rows: next } };
  }
  return controls;
}
