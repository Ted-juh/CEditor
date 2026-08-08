import { derived } from 'svelte/store';
import { equalityWritable } from '../utils/equalityStore.js';
import { panels, resolvedActivePanelId, selectedComponentId, selectedComponentIds, keyObjectId } from './panels.js';
import { getSection } from '../models/componentTypes.js';
import { resolveStateScopedControl } from '../utils/interactionRuntime.js';

const DEFAULT_SCOPE = {
  mode: 'base',
  stateName: '',
};

// The scope is an OBJECT, so a plain writable notifies on every set whether or not anything
// changed — see utils/equalityStore.js. It is read by `selectedScopedEditingControl` below, which
// derives from the whole `panels` store, so a pointless notification re-derives the selected
// control and everything the properties panel builds from it.
export const stateEditScope = equalityWritable({ ...DEFAULT_SCOPE }, sameScope);

function sameScope(left, right) {
  return (left?.mode ?? 'base') === (right?.mode ?? 'base')
    && (left?.stateName ?? '') === (right?.stateName ?? '');
}

export function setStateEditScopeBase() {
  stateEditScope.set({ ...DEFAULT_SCOPE });
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

  stateEditScope.set(nextScope);
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
