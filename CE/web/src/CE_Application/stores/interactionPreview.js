import { writable, derived, get } from 'svelte/store';
import { selectedControl } from './controls.js';
import { panels, resolvedActivePanelId, selectedComponentId } from './panels.js';
import { setDebugDock } from './debugDock.js';
import { resolveInteractiveControl, serializeInteractionRuntime } from '../utils/interactionRuntime.js';
import { getNextEnumValue } from '../utils/enumBehavior.js';
import { findExclusiveSelectGroupControls, isExclusiveSelectBehavior } from '../utils/selectGroupUtils.js';

const DEFAULT_SESSION = {
  enabled: true,
  hover: false,
  pressed: false,
  focused: false,
  dragging: false,
  disabled: false,
  pending: false,
  executed: false,
  checked: false,
  mixed: false,
  valueOverrideEnabled: false,
  valueOverride: 0,
  startValueOverrideEnabled: false,
  startValueOverride: 0,
  currentValueOverrideEnabled: false,
  currentValueOverride: 0,
  endValueOverrideEnabled: false,
  endValueOverride: 0,
  activeHandle: 'current',
  valueInputActive: false,
  valueInputRole: 'current',
  valueInputBuffer: '',
  animationsEnabled: true,
  autoDebug: false,
  reducedMotion: false,
  highContrast: false,
  inputModality: 'pointer',
};

export const interactionPreviewSessions = writable({});
export const previewModeEnabled = writable(false);
export const panelPreviewSessions = writable({});
export const previewInspectedControlId = writable('');

export function getDefaultInteractionPreviewSession() {
  return { ...DEFAULT_SESSION };
}

export function createInteractionPreviewSession(control = null) {
  const next = getDefaultInteractionPreviewSession();
  const behavior = control?._children?.Behavior ?? null;
  if (String(behavior?.valueType ?? '') === 'bool' || String(behavior?.family ?? '') === 'select') {
    next.checked = behavior?.defaultValue === true;
  }
  if (String(behavior?.family ?? '') === 'range' && String(behavior?.role ?? '') === 'slider') {
    next.activeHandle = String(behavior?.valueMode ?? 'single') === 'range' ? 'start' : 'current';
    next.valueInputRole = next.activeHandle;
  }
  return next;
}

function shallowEqualSession(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;

  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

function getControlId(control) {
  return String(control?._children?.Core?.id ?? '');
}

function getActivePanel() {
  const activePanelId = get(resolvedActivePanelId);
  if (activePanelId == null) return null;
  return get(panels).find((entry) => entry.id === activePanelId) ?? null;
}

function getActivePanelControlById(controlId = '') {
  if (!controlId) return null;
  return getActivePanel()?.controls?.find((control) => getControlId(control) === controlId) ?? null;
}

function getEnabledValueRows(control) {
  const rows = control?._children?.Value?.rows;
  return Array.isArray(rows) ? rows.filter((row) => row?.enabled !== false) : [];
}

function currentPreviewBoolValue(control, session = null) {
  const behavior = control?._children?.Behavior ?? null;
  if (session?.valueOverrideEnabled === true) return session?.valueOverride === true;
  if (String(behavior?.valueType ?? '') === 'bool' || String(behavior?.family ?? '') === 'select') {
    return session?.checked === true || behavior?.defaultValue === true;
  }
  return session?.checked === true;
}

function createPreviewSessionsMap(controls = []) {
  return (Array.isArray(controls) ? controls : []).reduce((sessions, control) => {
    const controlId = getControlId(control);
    if (!controlId) return sessions;
    sessions[controlId] = createInteractionPreviewSession(control);
    return sessions;
  }, {});
}

export function updateInteractionPreviewSession(controlId, patch = {}) {
  if (!controlId) return;
  interactionPreviewSessions.update((current) => {
    const previousSession = {
      ...DEFAULT_SESSION,
      ...(current[controlId] ?? {}),
    };
    const nextSession = {
      ...previousSession,
      ...patch,
    };

    if (shallowEqualSession(previousSession, nextSession)) {
      return current;
    }

    return {
      ...current,
      [controlId]: nextSession,
    };
  });
}

export function resetInteractionPreviewSession(controlId) {
  if (!controlId) return;
  interactionPreviewSessions.update((current) => ({
    ...current,
    [controlId]: { ...DEFAULT_SESSION },
  }));
}

export function removeInteractionPreviewSession(controlId) {
  if (!controlId) return;
  interactionPreviewSessions.update((current) => {
    const next = { ...current };
    delete next[controlId];
    return next;
  });
}

export function setPreviewModeEnabled(enabled) {
  const nextEnabled = enabled === true;
  previewModeEnabled.set(nextEnabled);
  if (!nextEnabled) {
    panelPreviewSessions.set({});
    previewInspectedControlId.set('');
  }
}

export function togglePreviewMode() {
  setPreviewModeEnabled(!get(previewModeEnabled));
}

export function setPreviewInspectedControlId(controlId = '') {
  const nextId = String(controlId ?? '');
  if (get(previewInspectedControlId) === nextId) return;
  previewInspectedControlId.set(nextId);
}

export function syncPanelPreviewSessions(controls = []) {
  const controlList = Array.isArray(controls) ? controls : [];

  panelPreviewSessions.update((current) => {
    const next = {};
    let changed = false;

    for (const control of controlList) {
      const controlId = getControlId(control);
      if (!controlId) continue;

      const previousSession = current?.[controlId];
      const nextSession = previousSession
        ? { ...createInteractionPreviewSession(control), ...previousSession }
        : createInteractionPreviewSession(control);

      next[controlId] = nextSession;
      if (!previousSession || !shallowEqualSession(previousSession, nextSession)) {
        changed = true;
      }
    }

    const currentKeys = Object.keys(current ?? {});
    if (currentKeys.length !== Object.keys(next).length) changed = true;
    if (!changed) return current;
    return next;
  });
}

export function updatePanelPreviewSession(controlId, patch = {}) {
  if (!controlId) return;

  panelPreviewSessions.update((current) => {
    const control = getActivePanelControlById(controlId);
    const previousSession = {
      ...createInteractionPreviewSession(control),
      ...(current?.[controlId] ?? {}),
    };
    const nextSession = {
      ...previousSession,
      ...patch,
    };

    if (shallowEqualSession(previousSession, nextSession)) {
      return current;
    }

    return {
      ...current,
      [controlId]: nextSession,
    };
  });
}

export function resetPanelPreviewSessions(controls = []) {
  panelPreviewSessions.set(createPreviewSessionsMap(controls));
}

export function resetPanelPreviewSession(controlId) {
  const control = getActivePanelControlById(controlId);
  if (!control) return;
  updatePanelPreviewSession(controlId, createInteractionPreviewSession(control));
}

export function commitPanelPreviewSelectAction(controlId, options = {}) {
  const control = getActivePanelControlById(controlId);
  if (!control) return;

  const behavior = control?._children?.Behavior ?? null;
  if (String(behavior?.family ?? '') !== 'select') return;

  const role = String(behavior?.role ?? '');
  const buttonType = String(behavior?.buttonType ?? '');
  const valueType = String(behavior?.valueType ?? '');
  const requestedValue = String(options?.value ?? '').trim();
  const currentSession = {
    ...createInteractionPreviewSession(control),
    ...(get(panelPreviewSessions)?.[controlId] ?? {}),
  };

  if (isExclusiveSelectBehavior(behavior)) {
    const groupedControls = findExclusiveSelectGroupControls(getActivePanel()?.controls ?? [], controlId);
    const nextSessions = { ...(get(panelPreviewSessions) ?? {}) };

    for (const groupedControl of groupedControls) {
      const groupedControlId = getControlId(groupedControl);
      if (!groupedControlId) continue;

      nextSessions[groupedControlId] = {
        ...createInteractionPreviewSession(groupedControl),
        ...(nextSessions[groupedControlId] ?? {}),
        checked: groupedControlId === controlId,
        mixed: false,
        valueOverrideEnabled: false,
      };
    }

    panelPreviewSessions.set(nextSessions);
    return;
  }

  if (buttonType === 'radio' || role === 'radio') {
    const valueRows = getEnabledValueRows(control);
    const nextRow = valueRows.find((row) => String(row?.internalValue ?? row?.id ?? '') === requestedValue)
      ?? valueRows.find((row) => row?.selectedByDefault === true)
      ?? valueRows[0]
      ?? null;
    if (!nextRow) return;

    updatePanelPreviewSession(controlId, {
      checked: false,
      mixed: false,
      valueOverrideEnabled: true,
      valueOverride: nextRow?.internalValue ?? nextRow?.id ?? '',
    });
    return;
  }

  if (buttonType === 'combobox') {
    const valueRows = getEnabledValueRows(control);
    if (!valueRows.length) return;

    const currentValue = currentSession?.valueOverrideEnabled === true
      ? currentSession?.valueOverride
      : behavior?.defaultValue;
    const nextRow = valueRows.find((row) => String(row?.internalValue ?? row?.id ?? '') === requestedValue)
      ?? valueRows.find((row) => String(row?.internalValue ?? row?.id ?? '') === String(currentValue ?? ''))
      ?? valueRows.find((row) => row?.selectedByDefault === true)
      ?? valueRows[0]
      ?? null;
    if (!nextRow) return;

    updatePanelPreviewSession(controlId, {
      checked: false,
      mixed: false,
      valueOverrideEnabled: true,
      valueOverride: nextRow?.internalValue ?? nextRow?.id ?? '',
    });
    return;
  }

  if (buttonType === 'cyclic') {
    const valueRows = getEnabledValueRows(control);
    if (!valueRows.length) return;

    const currentValue = currentSession?.valueOverrideEnabled === true
      ? currentSession?.valueOverride
      : (behavior?.defaultValue ?? valueRows[0]?.internalValue ?? valueRows[0]?.id);
    const currentIndex = Math.max(
      0,
      valueRows.findIndex((row) => String(row?.internalValue ?? row?.id) === String(currentValue ?? ''))
    );
    const nextIndex = currentIndex >= valueRows.length - 1
      ? (behavior?.wrapBehavior === false ? currentIndex : 0)
      : currentIndex + 1;
    const nextRow = valueRows[nextIndex] ?? valueRows[0];

    updatePanelPreviewSession(controlId, {
      valueOverrideEnabled: true,
      valueOverride: nextRow?.internalValue ?? nextRow?.id ?? '',
    });
    return;
  }

  if (valueType === 'enum') {
    const values = Array.isArray(behavior?.enumValues) ? behavior.enumValues : [];
    if (!values.length) return;

    const currentValue = currentSession?.valueOverrideEnabled === true
      ? currentSession?.valueOverride
      : behavior?.defaultValue;
    const nextValue = getNextEnumValue(values, currentValue, behavior?.wrapEnum === true);

    updatePanelPreviewSession(controlId, {
      valueOverrideEnabled: true,
      valueOverride: nextValue,
    });
    return;
  }

  updatePanelPreviewSession(controlId, {
    checked: !currentPreviewBoolValue(control, currentSession),
    mixed: false,
    valueOverrideEnabled: false,
  });
}

export const selectedInteractionPreview = derived(
  [selectedControl, interactionPreviewSessions],
  ([$selectedControl, $sessions]) => {
    const controlId = $selectedControl?._children?.Core?.id;
    if (!controlId) return null;
    return {
      controlId,
      session: {
        ...DEFAULT_SESSION,
        ...($sessions[controlId] ?? {}),
      },
    };
  }
);

export const previewInspection = derived(
  [panels, resolvedActivePanelId, panelPreviewSessions, previewInspectedControlId, selectedComponentId],
  ([$panels, $resolvedActivePanelId, $sessions, $previewInspectedControlId, $selectedComponentId]) => {
    const panel = $panels.find((entry) => entry.id === $resolvedActivePanelId) ?? null;
    if (!panel) return null;

    const availableControls = Array.isArray(panel.controls) ? panel.controls : [];
    const availableIds = new Set(availableControls.map((control) => getControlId(control)).filter(Boolean));
    const fallbackId = availableIds.has($previewInspectedControlId)
      ? $previewInspectedControlId
      : (availableIds.has($selectedComponentId) ? $selectedComponentId : (availableControls[0]?._children?.Core?.id ?? ''));
    const control = availableControls.find((entry) => getControlId(entry) === fallbackId) ?? null;

    if (!control) {
      return {
        panel,
        controlId: '',
        control: null,
        session: null,
        runtime: null,
        resolvedControl: null,
        hasInteractiveModel: false,
      };
    }

    const session = {
      ...createInteractionPreviewSession(control),
      ...($sessions?.[fallbackId] ?? {}),
    };
    const previewOverrides = session?.enabled === false ? {} : session;
    const resolved = resolveInteractiveControl(control, previewOverrides);
    const behavior = control?._children?.Behavior ?? null;
    const hasInteractiveModel = !!behavior
      || Object.keys(control?._children?.Parts?._children ?? {}).length > 0
      || Object.keys(control?._children?.Bindings?._children ?? {}).length > 0
      || Object.keys(control?._children?.States?._children ?? {}).length > 0
      || Object.keys(control?._children?.Animations?._children ?? {}).length > 0;

    return {
      panel,
      controlId: fallbackId,
      control,
      session,
      runtime: serializeInteractionRuntime(resolved.runtime),
      resolvedControl: resolved.control ?? null,
      hasInteractiveModel,
    };
  }
);

export function dumpSelectedInteractionDebug(payload) {
  const selected = get(selectedInteractionPreview);
  if (!selected?.controlId) return;
  setDebugDock({
    title: 'Interaction Debug',
    source: selected.controlId,
    text: JSON.stringify(payload ?? {}, null, 2),
  });
}

export function dumpPreviewInspectionDebug() {
  const inspection = get(previewInspection);
  if (!inspection?.controlId) return;

  setDebugDock({
    title: 'Preview Debug',
    source: inspection.controlId,
    text: JSON.stringify({
      controlId: inspection.controlId,
      type: inspection.control?._children?.Core?.controlType ?? '',
      previewSession: inspection.session,
      runtime: inspection.runtime,
      resolvedControl: inspection.resolvedControl ?? null,
    }, null, 2),
  });
}
