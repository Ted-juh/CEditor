import { derived, get } from 'svelte/store';
import { panels, resolvedActivePanelId, selectedComponentId, selectedComponentIds, selectComponent, clearSelection, keyObjectId } from './panels.js';
import { createControl as createControlFromType, getSection, hasSection } from '../models/componentTypes.js';
import { insertOffset, duplicateOffset } from './runtimePreferences.js';
import { stateEditScope } from './stateEditScope.js';
import { deepClone } from '../utils/deepClone.js';
import { isExclusiveSelectBehavior, normalizeExclusiveSelectDefaults } from '../utils/selectGroupUtils.js';
import { deleteNestedValue, setNestedValue, valueAtPath } from './controlTreeUtils.js';
import { mutatePanelControlsByIdsInList, mutatePanelControlsInList, updatePanelInList } from './panelDocumentHelpers.js';

// Re-export for convenience
export { getSection, hasSection };
export { applyPatchObject } from './controlTreeUtils.js';

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

const STATE_SCOPABLE_PREFIXES = ['Background.', 'Text.', 'Icon.', 'Effects.', 'ContentLayout.'];
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

function isBehaviorPath(path) {
  return String(path ?? '').startsWith('Behavior.');
}

function shouldNormalizeExclusiveSelection(paths = []) {
  return Array.from(paths).some((path) => isBehaviorPath(path));
}

function normalizeExclusiveSelectionInList(list, panelId, preferredControlIds = []) {
  return updatePanelInList(list, panelId, (panel) => {
    const nextControls = normalizeExclusiveSelectDefaults(panel?.controls ?? [], preferredControlIds);
    if (nextControls === panel?.controls) return panel;
    return { ...panel, controls: nextControls, modified: true };
  });
}

/**
 * Update a property on ALL selected controls at once.
 * Single panels.update call for efficiency.
 */
export function updateSelectedProperty(path, value) {
  const panelId = get(resolvedActivePanelId);
  const ids = get(selectedComponentIds);
  if (panelId == null || ids.size === 0) return;

  const preferredControlIds = isBehaviorPath(path) ? [...ids] : [];

  panels.update((list) => {
    let nextList = mutatePanelControlsByIdsInList(list, panelId, ids, (draft) => {
      applyResolvedValue(draft, path, value);
      return true;
    });

    if (isBehaviorPath(path)) {
      nextList = normalizeExclusiveSelectionInList(nextList, panelId, preferredControlIds);
    }

    return nextList;
  });
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

    if (isExclusiveSelectBehavior(clone?._children?.Behavior) && clone._children.Behavior.defaultValue === true) {
      clone._children.Behavior.defaultValue = false;
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
  applyControlPatchesById(new Map([[controlId, { [path]: value }]]));
}

export function applyControlPatchesById(patchesByControlId) {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null || !patchesByControlId || patchesByControlId.size === 0) return;

  const preferredControlIds = [...patchesByControlId.keys()];
  const shouldNormalize = shouldNormalizeExclusiveSelection(
    preferredControlIds.flatMap((controlId) => Object.keys(patchesByControlId.get(controlId) ?? {}))
  );

  panels.update((list) => {
    let nextList = mutatePanelControlsInList(
      list,
      panelId,
      (control) => patchesByControlId.has(control?._children?.Core?.id),
      (draft) => {
        const patch = patchesByControlId.get(draft?._children?.Core?.id);
        if (!patch || Object.keys(patch).length === 0) return false;

        for (const [path, value] of Object.entries(patch)) {
          applyResolvedValue(draft, path, value);
        }

        return true;
      }
    );

    if (shouldNormalize) {
      nextList = normalizeExclusiveSelectionInList(nextList, panelId, preferredControlIds);
    }

    return nextList;
  });
}

export function applyControlPatch(controlId, patch) {
  if (!patch || Object.keys(patch).length === 0) return;
  applyControlPatchesById(new Map([[controlId, patch]]));
}

export function applySelectedPatch(patch) {
  const panelId = get(resolvedActivePanelId);
  const ids = get(selectedComponentIds);
  if (panelId == null || ids.size === 0 || !patch || Object.keys(patch).length === 0) return;

  const preferredControlIds = [...ids];
  const shouldNormalize = shouldNormalizeExclusiveSelection(Object.keys(patch));

  panels.update((list) => {
    let nextList = mutatePanelControlsByIdsInList(list, panelId, ids, (draft) => {
      for (const [path, value] of Object.entries(patch)) {
        applyResolvedValue(draft, path, value);
      }

      return true;
    });

    if (shouldNormalize) {
      nextList = normalizeExclusiveSelectionInList(nextList, panelId, preferredControlIds);
    }

    return nextList;
  });
}

export function removeControlNode(controlId, path) {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null || !path) return;

  panels.update((list) =>
    mutatePanelControlsInList(
      list,
      panelId,
      (control) => control?._children?.Core?.id === controlId,
      (draft) => {
        deleteNestedValue(draft, path);
        return true;
      }
    )
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

  panels.update((list) =>
    mutatePanelControlsInList(
      list,
      panelId,
      (control) => control?._children?.Core?.id === controlId,
      (draft, original) => {
        if (original._children[sectionName]) return false;
        draft._children[sectionName] = deepClone(defaults);
        return true;
      }
    )
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

  panels.update((list) =>
    mutatePanelControlsInList(
      list,
      panelId,
      (control) => control?._children?.Core?.id === controlId,
      (draft, original) => {
        const missingEntries = entries.filter(([sectionName]) => !original._children?.[sectionName]);
        if (!missingEntries.length) return false;

        for (const [sectionName, sectionDefaults] of missingEntries) {
          draft._children[sectionName] = deepClone(sectionDefaults);
        }

        return true;
      }
    )
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

  panels.update((list) =>
    mutatePanelControlsInList(
      list,
      panelId,
      (control) => control?._children?.Core?.id === controlId,
      (draft) => {
        delete draft._children[sectionName];
        return true;
      }
    )
  );
}
