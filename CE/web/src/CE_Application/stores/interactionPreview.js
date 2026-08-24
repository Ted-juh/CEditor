import { writable, derived, get } from 'svelte/store';
import { selectedControl } from './controls.js';
import { panels, resolvedActivePanelId, selectedComponentId } from './panels.js';
import { setDebugDock } from './debugDock.js';
import { beginPreviewRehearsal, endPreviewRehearsal } from './previewRehearsal.js';
import { resolveInteractiveControl, serializeInteractionRuntime, resolveInteractionContext } from '../utils/interactionRuntime.js';
import { dependsOnId, dependsResetOnChange, visibleChoiceRows, firstDependentValue } from '../utils/dependentChoices.js';
import { getNextEnumValue } from '../utils/enumBehavior.js';
import { findExclusiveSelectGroupControls, isExclusiveSelectBehavior } from '../utils/selectGroupUtils.js';
import { normalizeCustomChannelValue, seedCustomValues } from '../utils/customComponentInteraction.js';
import { syncCustomArpeggiatorValues } from '../utils/customComponentArpeggiator.js';
import { applyPanelCustomLinkRoutes } from '../utils/panelCustomComponentLinks.js';
import { applyPanelValueRoutes } from '../utils/routeSessions.js';
import { flatControls } from '../utils/containment.js';

/**
 * Every control in the panel, containers included.
 *
 * The session map is rebuilt from a control LIST, and anything absent from that list is dropped —
 * so being handed only the top-level controls silently deleted the session of everything inside a
 * Group. It deleted them mid-gesture: pressing a nested pad wrote pressed=true, the resulting
 * re-render synced the sessions, and the pad\'s entry vanished while the finger was still down.
 * The runtime diffs this map to raise onPointerUp, and you cannot diff a key that is not there,
 * so the release never fired at all. Flattening here rather than at each call site is deliberate —
 * a caller that forgets is exactly how this happened.
 */
const allControls = (controls) => flatControls(Array.isArray(controls) ? controls : []);

const DEFAULT_SESSION = {
  enabled: true,
  hover: false,
  pressed: false,
  focused: false,
  dragging: false,
  disabled: false,
  pending: false,
  executed: false,
  // Repeats while held (momentary/repeating). A COUNTER, not a flag: two fires 120 ms apart patch
  // the same `executed: true` and shallowEqualSession would swallow the second, so the only way a
  // consumer can tell one repeat from the next is a number that goes up.
  repeatCount: 0,
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
  customValues: {},
  customNormalizedValue: 0,
  activeCustomBehavior: '',
  activeCustomHitZone: '',
  hoveredCustomBehavior: '',
  hoveredCustomHitZone: '',
};

export const interactionPreviewSessions = writable({});
export const previewModeEnabled = writable(false);
export const panelPreviewDebugEnabled = writable(false);
export const panelPreviewSessions = writable({});
export const previewInspectedControlId = writable('');

export function getDefaultInteractionPreviewSession() {
  return { ...DEFAULT_SESSION, customValues: {} };
}

export function createInteractionPreviewSession(control = null) {
  const next = getDefaultInteractionPreviewSession();
  if (String(control?._children?.Core?.controlType ?? '') === 'CustomComponent') {
    next.customValues = seedCustomValues(control);
    const channels = control?._children?.ValueChannels?._children ?? {};
    const mainChannel = channels.mainValue ?? Object.values(channels)[0] ?? null;
    next.customNormalizedValue = normalizeCustomChannelValue(mainChannel, next.customValues?.[mainChannel?.name ?? 'mainValue']);
  }
  const behavior = control?._children?.Behavior ?? null;
  if (String(behavior?.valueType ?? '') === 'bool' || String(behavior?.family ?? '') === 'select') {
    next.checked = behavior?.defaultValue === true;
  }
  if (String(behavior?.family ?? '') === 'range' && String(behavior?.role ?? '') === 'slider') {
    next.activeHandle = String(behavior?.valueMode ?? 'single') === 'range' ? 'start' : 'current';
    next.valueInputRole = next.activeHandle;
  }
  // Two-value range spinner starts with the low (start) field active.
  if (String(behavior?.family ?? '') === 'range'
    && String(behavior?.role ?? '') === 'spinbox'
    && String(behavior?.valueMode ?? 'single') === 'range') {
    next.activeHandle = 'start';
    next.valueInputRole = 'start';
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

// Cascading selectors: after any session change, keep every dependent list in
// sync with its parent selector. Each child stores the parent's current value
// in `dependsParentValue`; when that changes, the child's selection is reset to
// the first row visible under the new parent value (unless it opted out via
// dependsResetOnChange, in which case a still-visible pick is kept). This runs
// alongside applyPanelCustomLinkRoutes on every panel-preview session update.
export function applyPanelDependentChoices(controls = [], sessions = {}) {
  const controlList = Array.isArray(controls) ? controls : [];
  const byId = new Map(controlList.map((control) => [getControlId(control), control]));
  let nextSessions = sessions ?? {};
  let changed = false;

  for (const child of controlList) {
    const parentId = dependsOnId(child);
    if (!parentId) continue;
    const childId = getControlId(child);
    if (!childId || parentId === childId) continue;
    const parent = byId.get(parentId);
    if (!parent) continue;

    const parentValue = String(resolveInteractionContext(parent, nextSessions?.[parentId] ?? {})?.valueRaw ?? '');
    const childSession = nextSessions?.[childId] ?? {};
    const storedParentValue = childSession.dependsParentValue;
    if (storedParentValue !== undefined && String(storedParentValue) === parentValue) continue; // unchanged

    const rows = child?._children?.Value?.rows ?? [];
    const patch = { dependsParentValue: parentValue };
    // Is the child's current pick still visible under the new parent value?
    const currentValue = String(resolveInteractionContext(child, childSession)?.valueRaw ?? '');
    const stillVisible = visibleChoiceRows(rows, parentValue, parentId)
      .some((row) => row?.isHeader !== true && row?.enabled !== false
        && String(row.internalValue ?? row.id ?? '') === currentValue);

    if (dependsResetOnChange(child) || !stillVisible) {
      patch.valueOverrideEnabled = true;
      patch.valueOverride = firstDependentValue(rows, parentValue, parentId);
      patch.listboxSelected = [];
      patch.listboxPending = '';
      patch.listboxScrollTop = 0;
      patch.listboxNowPlaying = '';
    }

    nextSessions = { ...nextSessions, [childId]: { ...childSession, ...patch } };
    changed = true;
  }

  return changed ? nextSessions : sessions;
}

// Route custom-component links, settle the panel's value routes, then reconcile dependent
// (cascading) selectors.
//
// VALUE ROUTES RUN HERE for the same reason custom links do: a route is a function of the sessions,
// so applying it inside the update needs no trigger, no re-entrancy guard and no frame budget. The
// alternative was a store action called on every source change, which would have re-entered the
// update it was called from. `panel` is optional so `createPreviewSessionsMap` can build a fresh map
// before there is one — a panel with no sessions has no route sources to read, so there is nothing
// to settle on that path anyway.
function applyPanelSessionEffects(controls, sessions, panel = null) {
  const linked = applyPanelCustomLinkRoutes(controls, sessions);
  const routed = panel ? applyPanelValueRoutes(panel, linked) : linked;
  return applyPanelDependentChoices(controls, routed);
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
  const controlList = allControls(controls);
  const sessions = controlList.reduce((nextSessions, control) => {
    const controlId = getControlId(control);
    if (!controlId) return nextSessions;
    nextSessions[controlId] = createInteractionPreviewSession(control);
    return nextSessions;
  }, {});
  return applyPanelSessionEffects(controlList, sessions);
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

    const nextSessions = {
      ...current,
      [controlId]: nextSession,
    };
    const panel = getActivePanel();
    return applyPanelSessionEffects(allControls(panel?.controls), nextSessions, panel);
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
  const wasEnabled = get(previewModeEnabled) === true;

  // Photograph the document BEFORE anything runs against it: the runtime's subscriber fires
  // synchronously inside .set(), and onPanelBuild creates controls the moment it does.
  if (nextEnabled && !wasEnabled) beginPreviewRehearsal();

  previewModeEnabled.set(nextEnabled);

  if (!nextEnabled) {
    panelPreviewDebugEnabled.set(false);
    panelPreviewSessions.set({});
    previewInspectedControlId.set('');
    // …and put it back AFTER, so the teardown the runtime just did inside .set() — onPanelClose,
    // its writes included — is inside the bracket rather than landing on the restored document.
    endPreviewRehearsal();
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
  const controlList = allControls(controls);

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
    const routed = applyPanelSessionEffects(controlList, next);
    if (!changed && routed === next) return current;
    return routed;
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
    const nextPatch = patch?.customValues
      ? {
        ...patch,
        customValues: syncCustomArpeggiatorValues(control, {
          ...(previousSession.customValues ?? {}),
          ...(patch.customValues ?? {}),
        }),
      }
      : patch;
    const nextSession = {
      ...previousSession,
      ...nextPatch,
    };

    if (shallowEqualSession(previousSession, nextSession)) {
      return current;
    }

    const nextSessions = {
      ...current,
      [controlId]: nextSession,
    };
    const panel = getActivePanel();
    return applyPanelSessionEffects(allControls(panel?.controls), nextSessions, panel);
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
  if (!control) return null;

  const behavior = control?._children?.Behavior ?? null;
  if (String(behavior?.family ?? '') !== 'select') return null;

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

    const panel = getActivePanel();
    panelPreviewSessions.set(applyPanelSessionEffects(allControls(panel?.controls), nextSessions, panel));
    return {
      checked: true,
      mixed: false,
      valueOverrideEnabled: false,
    };
  }

  if (buttonType === 'radio' || role === 'radio') {
    const valueRows = getEnabledValueRows(control);
    const nextRow = valueRows.find((row) => String(row?.internalValue ?? row?.id ?? '') === requestedValue)
      ?? valueRows.find((row) => row?.selectedByDefault === true)
      ?? valueRows[0]
      ?? null;
    if (!nextRow) return null;

    const patch = {
      checked: false,
      mixed: false,
      valueOverrideEnabled: true,
      valueOverride: nextRow?.internalValue ?? nextRow?.id ?? '',
    };
    updatePanelPreviewSession(controlId, patch);
    return patch;
  }

  if (buttonType === 'combobox') {
    const valueRows = getEnabledValueRows(control);
    if (!valueRows.length) return null;

    const currentValue = currentSession?.valueOverrideEnabled === true
      ? currentSession?.valueOverride
      : behavior?.defaultValue;
    const nextRow = valueRows.find((row) => String(row?.internalValue ?? row?.id ?? '') === requestedValue)
      ?? valueRows.find((row) => String(row?.internalValue ?? row?.id ?? '') === String(currentValue ?? ''))
      ?? valueRows.find((row) => row?.selectedByDefault === true)
      ?? valueRows[0]
      ?? null;
    if (!nextRow) return null;

    const patch = {
      checked: false,
      mixed: false,
      valueOverrideEnabled: true,
      valueOverride: nextRow?.internalValue ?? nextRow?.id ?? '',
    };
    updatePanelPreviewSession(controlId, patch);
    return patch;
  }

  if (buttonType === 'cyclic') {
    const valueRows = getEnabledValueRows(control);
    if (!valueRows.length) return null;

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

    const patch = {
      valueOverrideEnabled: true,
      valueOverride: nextRow?.internalValue ?? nextRow?.id ?? '',
    };
    updatePanelPreviewSession(controlId, patch);
    return patch;
  }

  if (valueType === 'enum') {
    const values = Array.isArray(behavior?.enumValues) ? behavior.enumValues : [];
    if (!values.length) return null;

    const currentValue = currentSession?.valueOverrideEnabled === true
      ? currentSession?.valueOverride
      : behavior?.defaultValue;
    const nextValue = getNextEnumValue(values, currentValue, behavior?.wrapEnum === true);

    const patch = {
      valueOverrideEnabled: true,
      valueOverride: nextValue,
    };
    updatePanelPreviewSession(controlId, patch);
    return patch;
  }

  const patch = {
    checked: !currentPreviewBoolValue(control, currentSession),
    mixed: false,
    valueOverrideEnabled: false,
  };
  updatePanelPreviewSession(controlId, patch);
  return patch;
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
