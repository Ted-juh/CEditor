import { derived, get } from 'svelte/store';
import { panels, resolvedActivePanelId, selectedComponentId, selectedComponentIds, selectComponent, clearSelection, keyObjectId } from './panels.js';
import { createControl as createControlFromType, getSection, hasSection } from '../models/componentTypes.js';
import { insertOffset, duplicateOffset } from './runtimePreferences.js';
import { viewportPanelCenter } from './editorView.js';
import { stateEditScope } from './stateEditScope.js';
import { deepClone } from '../utils/deepClone.js';
import {
  collectSubtreeIds,
  controlPanelRect,
  findControlById,
  findParentOfControl,
  flatControls,
  insertControlIntoTree,
  isContainerControl,
  panelToLocalPoint,
  remintControlIds,
  removeControlFromTree,
  selectionRoots,
} from '../utils/containment.js';
import { instantiateCustomComponentPackageControl } from '../utils/customComponentPackage.js';
import { isExclusiveSelectBehavior, normalizeExclusiveSelectDefaults } from '../utils/selectGroupUtils.js';
import { deleteNestedValue, setNestedValue, valueAtPath } from './controlTreeUtils.js';
import { mutatePanelControlsByIdsInList, mutatePanelControlsInList, updatePanelInList } from './panelDocumentHelpers.js';
import { mutateComponentDocumentControl } from './componentWorkspace.js';

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
    return findControlById(panel.controls, targetId);
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
    return flatControls(panel.controls).filter(c => $ids.has(c._children?.Core?.id));
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
 * Where a new control of size w×h should land: centred on the visible part
 * of the canvas (falling back to the panel centre), clamped inside the panel,
 * stepped off anything already sitting at that exact spot so repeated inserts
 * don't stack invisibly. The old behaviour — a blind +offset cascade from the
 * origin — walked new controls straight off the panel around the 20th insert.
 */
function resolveInsertPosition(panel, w, h) {
  const panelW = panel.width ?? 600;
  const panelH = panel.height ?? 400;
  const center = get(viewportPanelCenter);
  const clampX = (v) => Math.max(0, Math.min(v, Math.max(0, panelW - w)));
  const clampY = (v) => Math.max(0, Math.min(v, Math.max(0, panelH - h)));
  let x = clampX(Math.round((center?.x ?? panelW / 2) - w / 2));
  let y = clampY(Math.round((center?.y ?? panelH / 2) - h / 2));

  const occupiedAt = (px, py) => panel.controls.some((c) => {
    const t = c._children?.Transform;
    return t && Math.abs(t.x - px) < 2 && Math.abs(t.y - py) < 2;
  });
  const step = Math.max(4, get(insertOffset) || 16);
  for (let i = 0; i < 20 && occupiedAt(x, y); i++) {
    const nx = clampX(x + step);
    const ny = clampY(y + step);
    if (nx === x && ny === y) break;
    x = nx;
    y = ny;
  }
  return { x, y };
}

/** Exactly one selected container → new controls insert into it. */
function selectedContainerParentId(panel) {
  const sel = get(selectedComponentIds);
  if (sel.size !== 1) return null;
  const selId = [...sel][0];
  const selected = findControlById(panel.controls, selId);
  return selected && isContainerControl(selected) ? selId : null;
}

/**
 * Add a new control to the active panel — centred in the current view, and
 * into the selected container when there is one.
 * @param {string} type - Component type (e.g., 'Background', 'Label', 'Button')
 * @param {object} overrides - Optional per-section property overrides
 * @returns {object|null} The created control, or null if no panel is active
 */
export function addControl(type, overrides = {}) {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return null;

  const panel = get(panels).find(p => p.id === panelId);
  const control = createControlFromType(type, overrides);
  const id = control._children.Core.id;

  let parentId = null;
  if (panel && !overrides.Transform && control._children.Transform) {
    const t = control._children.Transform;
    const w = t.width ?? 100;
    const h = t.height ?? 40;
    const pos = resolveInsertPosition(panel, w, h);

    parentId = selectedContainerParentId(panel);
    if (parentId) {
      const parent = findControlById(panel.controls, parentId);
      const parentW = parent?._children?.Transform?.width ?? w;
      const parentH = parent?._children?.Transform?.height ?? h;
      const local = panelToLocalPoint(panel.controls, parentId, pos.x, pos.y);
      t.x = Math.max(0, Math.min(Math.round(local.x), Math.max(0, parentW - w)));
      t.y = Math.max(0, Math.min(Math.round(local.y), Math.max(0, parentH - h)));
    } else {
      t.x = pos.x;
      t.y = pos.y;
    }
  }

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;
      const controls = parentId
        ? insertControlIntoTree(p.controls, parentId, control)
        : [...p.controls, control];
      return { ...p, controls, modified: true };
    })
  );

  // Auto-select the new control
  selectComponent(id);
  return control;
}

export function addCustomComponentPackage(value, overrides = {}) {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return null;

  const panel = get(panels).find(p => p.id === panelId);
  const nextId = `ctrl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  let transformOverrides = overrides.Transform ?? overrides.transform ?? null;
  if (panel && !transformOverrides) {
    // The package's own size isn't known until instantiation — assume a
    // typical footprint for centring; the clamp keeps it on the panel.
    transformOverrides = resolveInsertPosition(panel, 120, 120);
  }

  const control = instantiateCustomComponentPackageControl(value, {
    ...overrides,
    id: nextId,
    Transform: transformOverrides,
  });
  if (!control?._children?.Core?.id) return null;
  const id = control._children.Core.id;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;
      return { ...p, controls: [...p.controls, control], modified: true };
    })
  );

  selectComponent(id);
  return control;
}

/**
 * Remove a control from the active panel by its Core.id.
 */
export function removeControl(id) {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return;

  let removedIds = [id];

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;
      const { controls, removed } = removeControlFromTree(p.controls, id);
      if (!removed) return p;
      removedIds = collectSubtreeIds(removed);
      return { ...p, controls, modified: true };
    })
  );

  // Remove the whole deleted subtree from the selection
  selectedComponentIds.update(ids => {
    if (!removedIds.some(removedId => ids.has(removedId))) return ids;
    const next = new Set(ids);
    for (const removedId of removedIds) next.delete(removedId);
    return next;
  });

  // Clear key object if it was inside the deleted subtree
  if (removedIds.includes(get(keyObjectId))) {
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

  // When a container and its descendant are both selected, duplicate only the
  // container — the descendant rides along in the subtree copy.
  const rootIds = selectionRoots(panel.controls, idList);

  const clones = [];
  for (const id of rootIds) {
    const source = findControlById(panel.controls, id);
    if (!source) continue;

    // Fresh ids for the control and every descendant
    const clone = remintControlIds(source);
    clone._children.Core.name = `${clone._children.Core.name}_copy`;

    if (clone._children.Transform) {
      const offset = get(duplicateOffset);
      clone._children.Transform.x += offset;
      clone._children.Transform.y += offset;
    }

    if (isExclusiveSelectBehavior(clone?._children?.Behavior) && clone._children.Behavior.defaultValue === true) {
      clone._children.Behavior.defaultValue = false;
    }

    const parent = findParentOfControl(panel.controls, id);
    clones.push({ clone, parentId: parent?._children?.Core?.id ?? null });
  }

  if (clones.length === 0) return null;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;
      let controls = p.controls;
      for (const { clone, parentId } of clones) {
        controls = insertControlIntoTree(controls, parentId, clone);
      }
      return { ...p, controls, modified: true };
    })
  );

  // Select all duplicated controls
  const newIds = new Set(clones.map(({ clone }) => clone._children.Core.id));
  selectedComponentIds.set(newIds);

  return clones.map(({ clone }) => clone);
}

/**
 * Duplicate controls at their exact positions, leaving the selection alone.
 * Backs the Alt+drag gesture: the dragged originals move on, and these clones
 * stay behind where the gesture started.
 * @param {string|string[]|Set<string>} ids
 * @returns {object[]|null} The clones, or null
 */
export function duplicateControlsInPlace(ids) {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return null;

  const idList = typeof ids === 'string' ? [ids] : [...ids];
  const panel = get(panels).find(p => p.id === panelId);
  if (!panel) return null;

  const rootIds = selectionRoots(panel.controls, idList);
  const clones = [];
  for (const id of rootIds) {
    const source = findControlById(panel.controls, id);
    if (!source) continue;
    const clone = remintControlIds(source);
    clone._children.Core.name = `${clone._children.Core.name}_copy`;
    if (isExclusiveSelectBehavior(clone?._children?.Behavior) && clone._children.Behavior.defaultValue === true) {
      clone._children.Behavior.defaultValue = false;
    }
    const parent = findParentOfControl(panel.controls, id);
    clones.push({ clone, parentId: parent?._children?.Core?.id ?? null });
  }
  if (clones.length === 0) return null;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;
      let controls = p.controls;
      for (const { clone, parentId } of clones) {
        controls = insertControlIntoTree(controls, parentId, clone);
      }
      return { ...p, controls, modified: true };
    })
  );

  return clones.map(({ clone }) => clone);
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
  if (!patchesByControlId || patchesByControlId.size === 0) return;

  if (panelId == null) {
    for (const [controlId, patch] of patchesByControlId.entries()) {
      mutateComponentDocumentControl(controlId, (draft) => {
        if (!patch || Object.keys(patch).length === 0) return false;
        for (const [path, value] of Object.entries(patch)) {
          applyResolvedValue(draft, path, value);
        }
        return true;
      });
    }
    return;
  }

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
  if (!path) return;

  if (panelId == null) {
    mutateComponentDocumentControl(controlId, (draft) => {
      deleteNestedValue(draft, path);
      return true;
    });
    return;
  }

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

/**
 * Move one or more controls into a container (or to the top level when
 * newParentId is null), placing each at panel-local coords {x, y}. Rejects
 * moving a control into its own subtree. One panels.update = one undo step.
 * @param {{id:string, x:number, y:number}[]} entries
 * @param {string|null} newParentId - Container Core.id, or null for top level
 */
export function reparentControls(entries, newParentId) {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null || !entries?.length) return;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      let controls = p.controls;
      let changed = false;

      for (const { id, x, y } of entries) {
        if (id == null || id === newParentId) continue;
        // Reject moves into a non-container or into the control's own subtree
        if (newParentId != null) {
          const target = findControlById(controls, newParentId);
          const source = findControlById(controls, id);
          if (!target || !isContainerControl(target) || !source) continue;
          if (collectSubtreeIds(source).includes(newParentId)) continue;
        }

        const { controls: without, removed } = removeControlFromTree(controls, id);
        if (!removed) continue;

        const moved = deepClone(removed);
        if (moved._children.Transform) {
          moved._children.Transform.x = Math.round(x);
          moved._children.Transform.y = Math.round(y);
        }

        controls = insertControlIntoTree(without, newParentId, moved);
        changed = true;
      }

      if (!changed) return p;
      return { ...p, controls, modified: true };
    })
  );
}

/**
 * Wrap the current selection in a new Container sized to its bounding box.
 * Children keep their visual positions (coords converted to container-local).
 */
export function groupSelectionIntoContainer(padding = 12) {
  const panelId = get(resolvedActivePanelId);
  const ids = [...get(selectedComponentIds)];
  if (panelId == null || ids.length === 0) return null;

  const panel = get(panels).find(p => p.id === panelId);
  if (!panel) return null;

  const rootIds = selectionRoots(panel.controls, ids);
  const rects = rootIds
    .map(id => ({ id, rect: controlPanelRect(panel.controls, id) }))
    .filter(entry => entry.rect);
  if (rects.length === 0) return null;

  const minX = Math.min(...rects.map(({ rect }) => rect.x)) - padding;
  const minY = Math.min(...rects.map(({ rect }) => rect.y)) - padding;
  const maxX = Math.max(...rects.map(({ rect }) => rect.x + rect.w)) + padding;
  const maxY = Math.max(...rects.map(({ rect }) => rect.y + rect.h)) + padding;

  const container = createControlFromType('Container', {
    Transform: { x: Math.round(minX), y: Math.round(minY), width: Math.round(maxX - minX), height: Math.round(maxY - minY) },
  });
  const containerId = container._children.Core.id;

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      let controls = p.controls;
      const members = [];

      for (const { id, rect } of rects) {
        const { controls: without, removed } = removeControlFromTree(controls, id);
        if (!removed) continue;
        const member = deepClone(removed);
        if (member._children.Transform) {
          member._children.Transform.x = Math.round(rect.x - minX);
          member._children.Transform.y = Math.round(rect.y - minY);
        }
        members.push(member);
        controls = without;
      }

      if (!container._children.Children._children) container._children.Children._children = {};
      for (const member of members) {
        container._children.Children._children[member._children.Core.id] = member;
      }

      return { ...p, controls: [...controls, container], modified: true };
    })
  );

  selectComponent(containerId);
  return container;
}

/**
 * Dissolve a container: promote its children to the container's parent at
 * their panel-space positions, then delete the empty shell.
 */
export function ungroupContainer(id) {
  const panelId = get(resolvedActivePanelId);
  if (panelId == null || id == null) return;

  const promotedIds = [];

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      const container = findControlById(p.controls, id);
      if (!container || !isContainerControl(container)) return p;

      const parent = findParentOfControl(p.controls, id);
      const parentId = parent?._children?.Core?.id ?? null;

      const childRects = Object.values(container._children.Children._children ?? {})
        .filter(child => child?._children?.Core)
        .map(child => ({
          child,
          rect: controlPanelRect(p.controls, child._children.Core.id),
        }));

      const { controls: without, removed } = removeControlFromTree(p.controls, id);
      if (!removed) return p;

      let controls = without;
      for (const { child, rect } of childRects) {
        const promoted = deepClone(child);
        if (promoted._children.Transform && rect) {
          const local = panelToLocalPoint(controls, parentId, rect.x, rect.y);
          promoted._children.Transform.x = Math.round(local.x);
          promoted._children.Transform.y = Math.round(local.y);
        }
        controls = insertControlIntoTree(controls, parentId, promoted);
        promotedIds.push(promoted._children.Core.id);
      }

      return { ...p, controls, modified: true };
    })
  );

  if (promotedIds.length > 0) {
    selectedComponentIds.set(new Set(promotedIds));
    keyObjectId.set(null);
  }
}
