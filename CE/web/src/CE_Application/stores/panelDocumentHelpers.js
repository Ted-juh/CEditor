import { deepClone } from '../utils/deepClone.js';
import { mapControlsTree } from '../utils/containment.js';

export function updatePanelInList(list, panelId, updater) {
  let changed = false;

  const nextList = list.map((panel) => {
    if (panel.id !== panelId) return panel;

    const nextPanel = updater(panel);
    if (!nextPanel || nextPanel === panel) return panel;

    changed = true;
    return nextPanel;
  });

  return changed ? nextList : list;
}

export function mutatePanelControlsInList(list, panelId, matcher, mutator) {
  return updatePanelInList(list, panelId, (panel) => {
    let changed = false;

    // Tree-aware: a control may sit at top level or nested inside a container's
    // Children map. mapControlsTree walks the whole tree (a flat list is just a
    // tree with no children, so this is identical for un-nested panels).
    const nextControls = mapControlsTree(panel.controls, (control) => {
      if (!matcher(control)) return control;

      const draft = deepClone(control);
      const result = mutator(draft, control);
      if (result === false) return control;

      changed = true;
      return result && result !== true ? result : draft;
    });

    if (!changed) return panel;
    return { ...panel, controls: nextControls, modified: true };
  });
}

export function mutatePanelControlsByIdsInList(list, panelId, ids, mutator) {
  const targetIds = ids instanceof Set ? ids : new Set(ids);
  if (targetIds.size === 0) return list;

  return mutatePanelControlsInList(
    list,
    panelId,
    (control) => targetIds.has(control?._children?.Core?.id),
    mutator
  );
}

export function applyPanelUpdates(panel, updates) {
  const nextUpdates = { ...updates };

  if (panel.lockAspectRatio && panel.width > 0 && panel.height > 0) {
    const ratio = panel.width / panel.height;
    if ('width' in nextUpdates && !('height' in nextUpdates)) {
      nextUpdates.height = Math.round(nextUpdates.width / ratio);
    } else if ('height' in nextUpdates && !('width' in nextUpdates)) {
      nextUpdates.width = Math.round(nextUpdates.height * ratio);
    }
  }

  return { ...panel, ...nextUpdates, modified: true };
}
