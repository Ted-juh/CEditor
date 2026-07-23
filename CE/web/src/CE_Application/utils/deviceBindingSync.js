import { get } from 'svelte/store';
import { panels, resolvedActivePanelId } from '../stores/panels.js';
import { panelPreviewSessions, updatePanelPreviewSession } from '../stores/interactionPreview.js';

function getControlId(control) {
  return String(control?._children?.Core?.id ?? '');
}

function getBehavior(control) {
  return control?._children?.Behavior ?? null;
}

function activeDeviceBindings(control) {
  const deviceBindings = control?._children?.DeviceBindings;
  if (deviceBindings?.enabled === false) return [];

  const bindings = deviceBindings?.bindings;
  return Array.isArray(bindings)
    ? bindings.filter((binding) => binding?.kind === 'deviceParameter' && binding?.parameterId)
    : [];
}

function patchForBinding(control, binding, value) {
  const port = String(binding?.port ?? 'value');

  if (port === 'state') {
    return {
      checked: value === true || value === 1 || value === 'true' || value === '1',
      mixed: false,
      valueOverrideEnabled: false,
    };
  }

  if (port === 'selectedChoice') {
    return {
      checked: false,
      mixed: false,
      valueOverrideEnabled: true,
      valueOverride: value,
    };
  }

  // Display ports: a device parameter bound directly onto an LcdDisplay /
  // PixelDisplay writes an override into the display's preview session, which
  // applyLcdValueSource / applyPixelValueSource then reflect into the panel.
  if (port === 'text') {
    return { textOverride: value == null ? '' : String(value) };
  }

  if (port === 'brightness') {
    // Accept 0..1 normalized or 0..100; store as 0..100 for the display model.
    const n = Number(value);
    const pct = Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n <= 1 ? n * 100 : n))) : null;
    return pct == null ? null : { brightnessOverride: pct };
  }

  if (port === 'backlight') {
    const on = value === true || value === 1 || value === 'true' || value === '1'
      || (Number.isFinite(Number(value)) && Number(value) >= 0.5);
    return { backlightOverride: on };
  }

  if (port === 'value') {
    const behavior = getBehavior(control);
    const isSlider = String(behavior?.family ?? '') === 'range'
      && String(behavior?.role ?? '') === 'slider';

    if (isSlider) {
      return {
        activeHandle: 'current',
        valueInputRole: 'current',
        currentValueOverrideEnabled: true,
        currentValueOverride: value,
        valueOverrideEnabled: false,
      };
    }

    return {
      valueOverrideEnabled: true,
      valueOverride: value,
    };
  }

  return null;
}

export function syncDeviceParameterToPanelPreview(deviceRole, parameterId, value, options = {}) {
  const role = String(deviceRole ?? 'mainSynth');
  const parameter = String(parameterId ?? '');
  const skipControlId = String(options?.skipControlId ?? '');
  if (!parameter) return 0;

  const activePanelId = get(resolvedActivePanelId);
  const panel = get(panels).find((entry) => entry.id === activePanelId) ?? null;
  const controls = Array.isArray(panel?.controls) ? panel.controls : [];
  const sessions = get(panelPreviewSessions) ?? {};
  let updatedCount = 0;

  for (const control of controls) {
    const controlId = getControlId(control);
    if (!controlId) continue;
    if (skipControlId && controlId === skipControlId) continue;
    if (sessions?.[controlId]?.dragging === true) continue;

    const binding = activeDeviceBindings(control).find((entry) =>
      String(entry?.deviceRole ?? 'mainSynth') === role
        && String(entry?.parameterId ?? '') === parameter
    );
    if (!binding) continue;

    const patch = patchForBinding(control, binding, value);
    if (!patch) continue;

    updatePanelPreviewSession(controlId, patch);
    updatedCount += 1;
  }

  return updatedCount;
}

export function syncDeviceRuntimeStateToPanelPreview(runtimeState = {}) {
  if (!runtimeState || typeof runtimeState !== 'object') return 0;

  let updatedCount = 0;
  for (const [deviceRole, values] of Object.entries(runtimeState)) {
    if (!values || typeof values !== 'object') continue;

    for (const [parameterId, value] of Object.entries(values)) {
      updatedCount += syncDeviceParameterToPanelPreview(deviceRole, parameterId, value);
    }
  }

  return updatedCount;
}

const pendingParameterSyncs = new Map();
let pendingAnimationFrame = 0;

function flushQueuedParameterSyncs() {
  pendingAnimationFrame = 0;
  const queued = Array.from(pendingParameterSyncs.values());
  pendingParameterSyncs.clear();

  for (const entry of queued) {
    syncDeviceParameterToPanelPreview(entry.deviceRole, entry.parameterId, entry.value, {
      skipControlId: entry.skipControlId,
    });
  }
}

export function queueDeviceParameterPanelPreviewSync(deviceRole, parameterId, value, options = {}) {
  const role = String(deviceRole ?? 'mainSynth');
  const parameter = String(parameterId ?? '');
  if (!parameter) return;

  const skipControlId = String(options?.skipControlId ?? '');
  pendingParameterSyncs.set(`${role}:${parameter}:${skipControlId}`, {
    deviceRole: role,
    parameterId: parameter,
    value,
    skipControlId,
  });

  if (pendingAnimationFrame) return;

  if (typeof requestAnimationFrame === 'function') {
    pendingAnimationFrame = requestAnimationFrame(flushQueuedParameterSyncs);
  } else {
    pendingAnimationFrame = setTimeout(flushQueuedParameterSyncs, 16);
  }
}
