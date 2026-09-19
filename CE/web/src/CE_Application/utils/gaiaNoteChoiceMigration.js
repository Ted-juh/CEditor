import { flatControls } from './containment.js';

// Repair only the two known legacy aliases, in freshly deserialized controls.
// Keep artwork, bindings, custom labels and unrelated choice tables untouched.
export function repairGaiaNoteChoices(controls) {
  for (const control of flatControls(controls)) {
    const sections = control?._children;
    if (!sections?.DeviceBindings?.bindings?.some(binding =>
      binding.deviceRole === 'Roland GAIA SH-01'
      && /^tone[123]\.(?:lfo|modLfo)\.tempoSyncNote$/.test(binding.parameterId ?? ''))) continue;
    const rows = sections.Value?.rows;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const value = Number(row.sendValue);
      const old = value === 8 && row.displayText === '1/2' ? '12'
        : value === 13 && row.displayText === '1/6' ? '16' : null;
      if (!old || String(row.id) !== old || String(row.internalValue) !== old) continue;
      row.id = row.internalValue = `${old}_${value}`;
      row.selectedByDefault = String(sections.Behavior?.defaultValue) === row.internalValue;
    }
  }
  return controls;
}
