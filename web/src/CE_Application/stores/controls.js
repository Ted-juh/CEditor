import { derived, get } from 'svelte/store';
import { panels, activePanelId, selectedComponentId, selectedComponentIds, selectComponent, clearSelection, keyObjectId, updatePanel } from './panels.js';
import { createControl as createControlFromType, getSection, hasSection } from '../models/componentTypes.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { insertOffset, duplicateOffset } from './runtimePreferences.js';
import { deepClone } from '../utils/deepClone.js';

// Re-export for convenience
export { getSection, hasSection };

/**
 * The currently selected control object (derived).
 * null when no component is selected (panel mode).
 */
export const selectedControl = derived(
  [panels, activePanelId, selectedComponentId, selectedComponentIds, keyObjectId],
  ([$panels, $activePanelId, $selectedComponentId, $ids, $keyId]) => {
    // In multi-select, show the key object (orange); in single-select, show the one selected
    const targetId = $ids.size > 1 && $keyId ? $keyId : $selectedComponentId;
    if (targetId == null) return null;
    const panel = $panels.find(p => p.id === $activePanelId);
    if (!panel) return null;
    return panel.controls.find(c => c._children?.Core?.id === targetId) ?? null;
  }
);

/**
 * All currently selected control objects (derived).
 */
export const selectedControls = derived(
  [panels, activePanelId, selectedComponentIds],
  ([$panels, $activePanelId, $ids]) => {
    if ($ids.size === 0) return [];
    const panel = $panels.find(p => p.id === $activePanelId);
    if (!panel) return [];
    return panel.controls.filter(c => $ids.has(c._children?.Core?.id));
  }
);

/**
 * Update a property on ALL selected controls at once.
 * Single panels.update call for efficiency.
 */
export function updateSelectedProperty(path, value) {
  const panelId = get(activePanelId);
  const ids = get(selectedComponentIds);
  if (panelId == null || ids.size === 0) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      const newControls = p.controls.map(c => {
        if (!ids.has(c._children?.Core?.id)) return c;
        const clone = JSON.parse(JSON.stringify(c));
        setNestedValue(clone, path, value);
        return clone;
      });

      return { ...p, controls: newControls, modified: true };
    })
  );
}

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
    const baseOffset = get(insertOffset);
    const offset = panel.controls.length * baseOffset;
    overrides = { ...overrides, Transform: { x: baseOffset + offset, y: baseOffset + offset } };
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
/**
 * Duplicate one or more controls in the active panel.
 * Accepts a single id or an array/Set of ids.
 * @param {string|string[]|Set<string>} ids - Core.id(s) of the control(s) to duplicate
 * @returns {object[]|null} The duplicated controls, or null
 */
export function duplicateControl(ids) {
  const panelId = get(activePanelId);
  if (panelId == null) return null;

  // Normalise to array
  const idList = typeof ids === 'string' ? [ids] : [...ids];

  const panel = get(panels).find(p => p.id === panelId);
  if (!panel) return null;

  const clones = [];
  for (const id of idList) {
    const source = panel.controls.find(c => c._children?.Core?.id === id);
    if (!source) continue;

    const clone = JSON.parse(JSON.stringify(source));
    const newId = `ctrl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    clone._children.Core.id = newId;
    clone._children.Core.name = `${clone._children.Core.name}_copy`;

    if (clone._children.Transform) {
      const offset = get(duplicateOffset);
      clone._children.Transform.x += offset;
      clone._children.Transform.y += offset;
    }

    clones.push(clone);
  }

  if (clones.length === 0) return null;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;
      return { ...p, controls: [...p.controls, ...clones], modified: true };
    })
  );

  // Select all duplicated controls
  const newIds = new Set(clones.map(c => c._children.Core.id));
  selectedComponentIds.set(newIds);

  return clones;
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

export function applyControlPatch(controlId, patch) {
  const panelId = get(activePanelId);
  if (panelId == null || !patch || Object.keys(patch).length === 0) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      const newControls = p.controls.map(c => {
        if (c._children?.Core?.id !== controlId) return c;

        const clone = JSON.parse(JSON.stringify(c));
        for (const [path, value] of Object.entries(patch)) {
          setNestedValue(clone, path, deepClone(value));
        }
        return clone;
      });

      return { ...p, controls: newControls, modified: true };
    })
  );
}

export function applySelectedPatch(patch) {
  const panelId = get(activePanelId);
  const ids = get(selectedComponentIds);
  if (panelId == null || ids.size === 0 || !patch || Object.keys(patch).length === 0) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      const newControls = p.controls.map(c => {
        if (!ids.has(c._children?.Core?.id)) return c;

        const clone = JSON.parse(JSON.stringify(c));
        for (const [path, value] of Object.entries(patch)) {
          setNestedValue(clone, path, deepClone(value));
        }
        return clone;
      });

      return { ...p, controls: newControls, modified: true };
    })
  );
}

export function applyPatchObject(control, patch) {
  if (!control || !patch || Object.keys(patch).length === 0) return control;
  for (const [path, value] of Object.entries(patch)) {
    setNestedValue(control, path, deepClone(value));
  }
  return control;
}

/**
 * Add a section to a control.
 * @param {string} controlId - Core.id
 * @param {string} sectionName - Section type (e.g., 'Effects', 'Grid')
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
 * First segment navigates _children (section lookup).
 * Subsequent segments try _children first (tree nodes), then plain properties
 * (handles plain objects like per-side border and array indices).
 *
 * "Transform.x"                    → _children.Transform.x = value
 * "Background.Fill.colour"         → _children.Background._children.Fill.colour = value
 * "Background.Border.top.style"    → _children.Background._children.Border.top.style = value
 * "Effects.Shadows.items.0.blur"   → _children.Effects._children.Shadows.items[0].blur = value
 */
function setNestedValue(control, path, value) {
  const parts = path.split('.');
  if (parts.length === 0) return;

  if (parts.length === 1) {
    if (!control._children) return;
    control._children[parts[0]] = value;
    return;
  }

  // First part is always a section name in _children
  let current = control._children?.[parts[0]];
  if (!current) return;

  // Navigate intermediate parts
  for (let i = 1; i < parts.length - 1; i++) {
    const key = parts[i];
    // Try _children first (tree nodes), then plain property (objects/arrays)
    if (current._children && current._children[key] !== undefined) {
      current = current._children[key];
    } else if (current._children && current._children[key] === undefined) {
      const defaultChild = getDefaultChildTemplate(current._type, key);
      if (defaultChild !== undefined) {
        current._children[key] = JSON.parse(JSON.stringify(defaultChild));
        current = current._children[key];
      } else if (current[key] !== undefined) {
        current = current[key];
      } else {
        return; // path doesn't exist
      }
    } else if (current[key] !== undefined) {
      current = current[key];
    } else {
      return; // path doesn't exist
    }
  }

  // Set the final property
  const propName = parts[parts.length - 1];
  const treeValue = value != null && typeof value === 'object' && !Array.isArray(value)
    && (value._type !== undefined || value._children !== undefined);
  const defaultChild = current?._children ? getDefaultChildTemplate(current._type, propName) : undefined;

  if (current?._children && (current._children[propName] !== undefined || treeValue || defaultChild !== undefined)) {
    current._children[propName] = value;
  } else {
    current[propName] = value;
  }
}

function getDefaultChildTemplate(typeName, childName) {
  if (!typeName || !childName) return undefined;
  const sectionDefaults = SECTION_DEFAULTS[typeName];
  return sectionDefaults?._children?.[childName];
}
