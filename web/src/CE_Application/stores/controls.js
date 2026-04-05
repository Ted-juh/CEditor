import { derived, get } from 'svelte/store';
import { panels, activePanelId, selectedComponentId, selectedComponentIds, selectComponent, clearSelection, keyObjectId, updatePanel } from './panels.js';
import { createControl as createControlFromType, getSection, hasSection } from '../models/componentTypes.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';

// Re-export for convenience
export { getSection, hasSection };

/**
 * The currently selected control object (derived).
 * null when no component is selected (panel mode).
 */
export const selectedControl = derived(
  [panels, activePanelId, selectedComponentId],
  ([$panels, $activePanelId, $selectedComponentId]) => {
    if ($selectedComponentId == null) return null;
    const panel = $panels.find(p => p.id === $activePanelId);
    if (!panel) return null;
    return panel.controls.find(c => c._children?.Core?.id === $selectedComponentId) ?? null;
  }
);

/**
 * Add a new control to the active panel.
 * @param {string} type - Component type (e.g., 'Background', 'Label', 'Button')
 * @param {object} overrides - Optional per-section property overrides
 * @returns {object|null} The created control, or null if no panel is active
 */
export function addControl(type, overrides = {}) {
  const panelId = get(activePanelId);
  if (panelId == null) return null;

  // Stagger position so new controls don't stack at 0,0
  const panel = get(panels).find(p => p.id === panelId);
  if (panel && !overrides.Transform) {
    const offset = panel.controls.length * 20;
    overrides = { ...overrides, Transform: { x: 20 + offset, y: 20 + offset } };
  }

  const control = createControlFromType(type, overrides);
  const id = control._children.Core.id;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;
      return { ...p, controls: [...p.controls, control], modified: true };
    })
  );

  // Auto-select the new control
  selectComponent(id);
  return control;
}

/**
 * Remove a control from the active panel by its Core.id.
 */
export function removeControl(id) {
  const panelId = get(activePanelId);
  if (panelId == null) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;
      return {
        ...p,
        controls: p.controls.filter(c => c._children?.Core?.id !== id),
        modified: true,
      };
    })
  );

  // Remove from selection if it was selected
  selectedComponentIds.update(ids => {
    if (!ids.has(id)) return ids;
    const next = new Set(ids);
    next.delete(id);
    return next;
  });

  // Clear key object if it was the deleted control
  if (get(keyObjectId) === id) {
    keyObjectId.set(null);
  }
}

/**
 * Duplicate a control in the active panel.
 * @param {string} id - Core.id of the control to duplicate
 * @returns {object|null} The duplicated control, or null
 */
export function duplicateControl(id) {
  const panelId = get(activePanelId);
  if (panelId == null) return null;

  const panel = get(panels).find(p => p.id === panelId);
  if (!panel) return null;

  const source = panel.controls.find(c => c._children?.Core?.id === id);
  if (!source) return null;

  // Deep clone and assign new id/name
  const clone = JSON.parse(JSON.stringify(source));
  const newId = `ctrl_${Date.now()}`;
  clone._children.Core.id = newId;
  clone._children.Core.name = `${clone._children.Core.name}_copy`;

  // Offset position so it doesn't stack exactly on top
  if (clone._children.Transform) {
    clone._children.Transform.x += 20;
    clone._children.Transform.y += 20;
  }

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;
      return { ...p, controls: [...p.controls, clone], modified: true };
    })
  );

  selectComponent(newId);
  return clone;
}

/**
 * Update a property on a control using a dot-notation path.
 * Path is relative to the control's _children, e.g.:
 *   "Transform.x" → control._children.Transform.x
 *   "Background.Fill.colour" → control._children.Background._children.Fill.colour
 *
 * @param {string} controlId - Core.id of the control
 * @param {string} path - Dot-notation path (e.g., "Transform.x", "Background.Fill.colour")
 * @param {*} value - The new value
 */
export function updateControlProperty(controlId, path, value) {
  const panelId = get(activePanelId);
  if (panelId == null) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      const newControls = p.controls.map(c => {
        if (c._children?.Core?.id !== controlId) return c;

        const clone = JSON.parse(JSON.stringify(c));
        setNestedValue(clone, path, value);
        return clone;
      });

      return { ...p, controls: newControls, modified: true };
    })
  );
}

/**
 * Add a section to a control.
 * @param {string} controlId - Core.id
 * @param {string} sectionName - Section type (e.g., 'Border', 'Grid')
 */
export function addSection(controlId, sectionName) {
  const defaults = SECTION_DEFAULTS[sectionName];
  if (!defaults) {
    console.warn(`[addSection] No defaults for section "${sectionName}"`);
    return;
  }

  const panelId = get(activePanelId);
  if (panelId == null) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      const newControls = p.controls.map(c => {
        if (c._children?.Core?.id !== controlId) return c;
        if (c._children[sectionName]) return c; // already has it

        const clone = JSON.parse(JSON.stringify(c));
        clone._children[sectionName] = JSON.parse(JSON.stringify(defaults));
        return clone;
      });

      return { ...p, controls: newControls, modified: true };
    })
  );
}

/**
 * Remove a section from a control.
 * Cannot remove Core or Transform.
 */
export function removeSection(controlId, sectionName) {
  if (sectionName === 'Core' || sectionName === 'Transform') {
    console.warn(`[removeSection] Cannot remove mandatory section "${sectionName}"`);
    return;
  }

  const panelId = get(activePanelId);
  if (panelId == null) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      const newControls = p.controls.map(c => {
        if (c._children?.Core?.id !== controlId) return c;

        const clone = JSON.parse(JSON.stringify(c));
        delete clone._children[sectionName];
        return clone;
      });

      return { ...p, controls: newControls, modified: true };
    })
  );
}

// --- Internal helpers ---

/**
 * Set a nested value in a control by dot-notation path.
 * First segment navigates _children, subsequent segments navigate deeper _children.
 * The last segment is the property name.
 *
 * "Transform.x" → clone._children.Transform.x = value
 * "Background.Fill.colour" → clone._children.Background._children.Fill.colour = value
 * "Core.name" → clone._children.Core.name = value
 */
function setNestedValue(control, path, value) {
  const parts = path.split('.');
  if (parts.length === 0) return;

  // First part is always a section name in _children
  let current = control._children?.[parts[0]];
  if (!current) return;

  // Navigate through _children for intermediate parts
  for (let i = 1; i < parts.length - 1; i++) {
    if (current._children && current._children[parts[i]]) {
      current = current._children[parts[i]];
    } else {
      return; // path doesn't exist
    }
  }

  // Set the final property
  const propName = parts[parts.length - 1];
  current[propName] = value;
}
