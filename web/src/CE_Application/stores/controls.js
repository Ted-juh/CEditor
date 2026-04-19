import { derived, get } from 'svelte/store';
import { panels, resolvedActivePanelId, selectedComponentId, selectedComponentIds, selectComponent, clearSelection, keyObjectId, updatePanel } from './panels.js';
import { createControl as createControlFromType, getSection, hasSection } from '../models/componentTypes.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { insertOffset, duplicateOffset } from './runtimePreferences.js';
import { stateEditScope } from './stateEditScope.js';
import { deepClone } from '../utils/deepClone.js';

// Re-export for convenience
export { getSection, hasSection };

/**
 * The currently selected control object (derived).
 * null when no component is selected (panel mode).
 */
export const selectedControl = derived(
  [panels, resolvedActivePanelId, selectedComponentId, selectedComponentIds, keyObjectId],
  ([$panels, $resolvedActivePanelId, $selectedComponentId, $ids, $keyId]) => {
    // In multi-select, show the key object (orange); in single-select, show the one selected
    const targetId = $ids.size > 1 && $keyId ? $keyId : $selectedComponentId;
    if (targetId == null) return null;
    const panel = $panels.find(p => p.id === $resolvedActivePanelId);
    if (!panel) return null;
    return panel.controls.find(c => c._children?.Core?.id === targetId) ?? null;
  }
);

/**
 * All currently selected control objects (derived).
 */
export const selectedControls = derived(
  [panels, resolvedActivePanelId, selectedComponentIds],
  ([$panels, $resolvedActivePanelId, $ids]) => {
    if ($ids.size === 0) return [];
    const panel = $panels.find(p => p.id === $resolvedActivePanelId);
    if (!panel) return [];
    return panel.controls.filter(c => $ids.has(c._children?.Core?.id));
  }
);

const STATE_SCOPABLE_PREFIXES = ['Background.', 'Text.', 'Icon.', 'Effects.'];
const STATE_SCOPABLE_EXACT = new Set(['Transform.scale', 'Transform.rotation', 'Transform.opacity']);

function isStateScopablePath(path) {
  if (!path) return false;
  if (STATE_SCOPABLE_EXACT.has(path)) return true;
  return STATE_SCOPABLE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function activeStateScopeNameForPath(path) {
  const scope = get(stateEditScope);
  if (scope?.mode !== 'state' || !scope?.stateName) return '';
  return isStateScopablePath(path) ? scope.stateName : '';
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function valueAtPath(control, path) {
  if (!control || !path) return undefined;
  const parts = String(path).split('.');
  let current = control;
  for (const part of parts) {
    if (current?._children?.[part] !== undefined) {
      current = current._children[part];
    } else if (current?.[part] !== undefined) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function ensureStatePatchMap(control, stateName) {
  const states = control?._children?.States;
  const state = states?._children?.[stateName];
  if (!state) return null;
  if (!state.patches || typeof state.patches !== 'object') state.patches = {};
  if (!state.patches.component || typeof state.patches.component !== 'object') {
    state.patches.component = {};
  }
  return state.patches.component;
}

function applyStateScopedValue(control, stateName, path, value) {
  const patchMap = ensureStatePatchMap(control, stateName);
  if (!patchMap) return false;

  const baseValue = valueAtPath(control, path);
  if (deepEqual(baseValue, value)) {
    delete patchMap[path];
  } else {
    patchMap[path] = deepClone(value);
  }
  return true;
}

function applyResolvedValue(control, path, value) {
  const stateName = activeStateScopeNameForPath(path);
  if (stateName) {
    return applyStateScopedValue(control, stateName, path, value);
  }
  setNestedValue(control, path, value);
  return true;
}

/**
 * Update a property on ALL selected controls at once.
 * Single panels.update call for efficiency.
 */
export function updateSelectedProperty(path, value) {
  const panelId = get(resolvedActivePanelId);
  const ids = get(selectedComponentIds);
  if (panelId == null || ids.size === 0) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      const newControls = p.controls.map(c => {
        if (!ids.has(c._children?.Core?.id)) return c;
        const clone = JSON.parse(JSON.stringify(c));
        applyResolvedValue(clone, path, value);
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
  const panelId = get(resolvedActivePanelId);
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
  const panelId = get(resolvedActivePanelId);
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
  const panelId = get(resolvedActivePanelId);
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
  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      const newControls = p.controls.map(c => {
        if (c._children?.Core?.id !== controlId) return c;

        const clone = JSON.parse(JSON.stringify(c));
        applyResolvedValue(clone, path, value);
        return clone;
      });

      return { ...p, controls: newControls, modified: true };
    })
  );
}

export function applyControlPatch(controlId, patch) {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null || !patch || Object.keys(patch).length === 0) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      const newControls = p.controls.map(c => {
        if (c._children?.Core?.id !== controlId) return c;

        const clone = JSON.parse(JSON.stringify(c));
        for (const [path, value] of Object.entries(patch)) {
          applyResolvedValue(clone, path, deepClone(value));
        }
        return clone;
      });

      return { ...p, controls: newControls, modified: true };
    })
  );
}

export function applySelectedPatch(patch) {
  const panelId = get(resolvedActivePanelId);
  const ids = get(selectedComponentIds);
  if (panelId == null || ids.size === 0 || !patch || Object.keys(patch).length === 0) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      const newControls = p.controls.map(c => {
        if (!ids.has(c._children?.Core?.id)) return c;

        const clone = JSON.parse(JSON.stringify(c));
        for (const [path, value] of Object.entries(patch)) {
          applyResolvedValue(clone, path, deepClone(value));
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

export function removeControlNode(controlId, path) {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null || !path) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      const newControls = p.controls.map(c => {
        if (c._children?.Core?.id !== controlId) return c;

        const clone = JSON.parse(JSON.stringify(c));
        deleteNestedValue(clone, path);
        return clone;
      });

      return { ...p, controls: newControls, modified: true };
    })
  );
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

  const panelId = get(resolvedActivePanelId);
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
 * Add multiple sections to a control in a single store update.
 * Missing/unknown sections are ignored, existing sections are preserved.
 */
export function addSections(controlId, sectionNames = []) {
  const requested = Array.from(new Set(sectionNames.filter(Boolean)));
  if (!requested.length) return;

  const entries = requested
    .map((sectionName) => [sectionName, SECTION_DEFAULTS[sectionName]])
    .filter(([, defaults]) => !!defaults);

  if (!entries.length) return;

  const unknown = requested.filter((sectionName) => !SECTION_DEFAULTS[sectionName]);
  for (const sectionName of unknown) {
    console.warn(`[addSections] No defaults for section "${sectionName}"`);
  }

  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      let changed = false;
      const newControls = p.controls.map(c => {
        if (c._children?.Core?.id !== controlId) return c;

        const missingEntries = entries.filter(([sectionName]) => !c._children?.[sectionName]);
        if (!missingEntries.length) return c;

        const clone = JSON.parse(JSON.stringify(c));
        for (const [sectionName, defaults] of missingEntries) {
          clone._children[sectionName] = JSON.parse(JSON.stringify(defaults));
        }
        changed = true;
        return clone;
      });

      return changed ? { ...p, controls: newControls, modified: true } : p;
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

  const panelId = get(resolvedActivePanelId);
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

function deleteNestedValue(control, path) {
  const parts = path.split('.');
  if (parts.length === 0) return;

  if (parts.length === 1) {
    if (!control._children) return;
    delete control._children[parts[0]];
    return;
  }

  let current = control._children?.[parts[0]];
  if (!current) return;

  for (let i = 1; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (current?._children?.[key] !== undefined) {
      current = current._children[key];
    } else if (current?.[key] !== undefined) {
      current = current[key];
    } else {
      return;
    }
  }

  const finalKey = parts[parts.length - 1];
  if (current?._children?.[finalKey] !== undefined) {
    delete current._children[finalKey];
  } else if (current && current[finalKey] !== undefined) {
    delete current[finalKey];
  }
}
