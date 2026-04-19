import { writable, derived } from 'svelte/store';
import { panels, resolvedActivePanelId, selectedComponentId, selectedComponentIds, keyObjectId } from './panels.js';
import { getSection } from '../models/componentTypes.js';
import { resolveStateScopedControl } from '../utils/interactionRuntime.js';

const DEFAULT_SCOPE = {
  mode: 'base',
  stateName: '',
};

export const stateEditScope = writable({ ...DEFAULT_SCOPE });

function sameScope(left, right) {
  return (left?.mode ?? 'base') === (right?.mode ?? 'base')
    && (left?.stateName ?? '') === (right?.stateName ?? '');
}

export function setStateEditScopeBase() {
  stateEditScope.update((current) => (
    sameScope(current, DEFAULT_SCOPE) ? current : { ...DEFAULT_SCOPE }
  ));
}

export function setStateEditScopeState(stateName = '') {
  if (!stateName) {
    setStateEditScopeBase();
    return;
  }

  const nextScope = {
    mode: 'state',
    stateName: String(stateName),
  };

  stateEditScope.update((current) => (
    sameScope(current, nextScope) ? current : nextScope
  ));
}

export const availableStateEditNames = derived(
  [panels, resolvedActivePanelId, selectedComponentId, selectedComponentIds, keyObjectId],
  ([$panels, $resolvedActivePanelId, $selectedComponentId, $ids, $keyId]) => {
    const targetId = $ids.size > 1 && $keyId ? $keyId : $selectedComponentId;
    if (targetId == null) return [];
    const panel = $panels.find((item) => item.id === $resolvedActivePanelId);
    if (!panel) return [];
    const control = panel.controls.find((item) => item._children?.Core?.id === targetId) ?? null;
    return Object.keys(getSection(control, 'States')?._children ?? {});
  }
);

export const selectedScopedEditingControl = derived(
  [panels, resolvedActivePanelId, selectedComponentId, selectedComponentIds, keyObjectId, stateEditScope],
  ([$panels, $resolvedActivePanelId, $selectedComponentId, $ids, $keyId, $stateEditScope]) => {
    const targetId = $ids.size > 1 && $keyId ? $keyId : $selectedComponentId;
    if (targetId == null) return null;
    const panel = $panels.find((item) => item.id === $resolvedActivePanelId);
    if (!panel) return null;
    const control = panel.controls.find((item) => item._children?.Core?.id === targetId) ?? null;
    if (!control) return null;
    if ($stateEditScope?.mode !== 'state' || !$stateEditScope?.stateName) return control;
    return resolveStateScopedControl(control, $stateEditScope.stateName);
  }
);
