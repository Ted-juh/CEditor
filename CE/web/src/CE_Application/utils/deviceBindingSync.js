import { get } from 'svelte/store';
import { recordDeviceParameterValue } from '../stores/deviceParameterValues.js';
import { panels, resolvedActivePanelId } from '../stores/panels.js';
import { panelPreviewSessions, updatePanelPreviewSessions } from '../stores/interactionPreview.js';
import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';
import { shouldAcceptFeedback } from './displayMode.js';
import { flatControls } from './containment.js';

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
  // Staged pattern editing is atomic: individual hardware replies must not replace its loop length.
  if (port === 'arpEndStep' && control?._children?.Designer?.patternEditing?.kind === 'gaia') return null;
  // Named custom channels are independent ports, not the component's main value.
  if (control?._children?.ValueChannels?._children?.[port]) {
    return { customValues: { [port]: value } };
  }

  if (port === 'state') {
    const row = control?._children?.Value?.rows?.find(row => String(row.internalValue ?? row.id) === String(value));
    const state = row ? row.receiveValue ?? row.sendValue : value;
    return {
      checked: state === true || state === 1 || state === 'true' || state === '1',
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

// Panel edits replace the root controls array, including nested binding edits.
// Index once per document revision instead of walking every control for every
// parameter in every repeated native runtime-state snapshot.
const bindingIndexes = new WeakMap();
const EMPTY_CONTROLS = [];
function bindingIndex(controls) {
  let index = bindingIndexes.get(controls);
  if (index) return index;
  index = new Map();
  for (const control of flatControls(controls)) {
    const seen = new Set();
    for (const binding of activeDeviceBindings(control)) {
      const key = JSON.stringify([String(binding.deviceRole ?? DEFAULT_DEVICE_ROLE), String(binding.parameterId)]);
      if (seen.has(key)) continue; // preserve the first matching binding per control
      seen.add(key);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ control, binding });
    }
  }
  bindingIndexes.set(controls, index);
  return index;
}

function syncContext() {
  const activePanelId = get(resolvedActivePanelId);
  const panel = get(panels).find(entry => entry.id === activePanelId);
  return { index: bindingIndex(panel?.controls ?? EMPTY_CONTROLS), sessions: get(panelPreviewSessions) ?? {}, patches: [] };
}

function collectParameterPatches(context, deviceRole, parameterId, value, options = {}) {
  const role = String(deviceRole ?? DEFAULT_DEVICE_ROLE);
  const parameter = String(parameterId ?? '');
  const skipControlId = String(options?.skipControlId ?? '');
  if (!parameter) return 0;

  // The device told us what this parameter is. Record it before fanning it out to bound controls:
  // a display zone naming '@param:...' reads it from here, and has no control to read it from.
  recordDeviceParameterValue(role, parameter, value);

  const { sessions } = context;
  let updatedCount = 0;

  for (const { control, binding } of context.index.get(JSON.stringify([role, parameter])) ?? []) {
    const controlId = getControlId(control);
    if (!controlId) continue;
    if (skipControlId && controlId === skipControlId) continue;
    // The drag guard keeps the device's echo from fighting the hand on the knob — but it is only
    // right for a two-way control. A display cannot be dragged, so a `dragging` flag left stale in
    // its session could only freeze it; and an input-only control must not be moved by feedback at
    // all. One question, asked with the flow in hand.
    if (!shouldAcceptFeedback(getBehavior(control), sessions?.[controlId])) continue;

    const patch = patchForBinding(control, binding, value);
    if (!patch) continue;

    context.patches.push({ controlId, patch });
    updatedCount += 1;
  }

  return updatedCount;
}

export function syncDeviceParameterToPanelPreview(deviceRole, parameterId, value, options = {}) {
  const context = syncContext();
  const count = collectParameterPatches(context, deviceRole, parameterId, value, options);
  updatePanelPreviewSessions(context.patches);
  return count;
}

export function syncDeviceRuntimeStateToPanelPreview(runtimeState = {}) {
  if (!runtimeState || typeof runtimeState !== 'object') return 0;

  let updatedCount = 0;
  const context = syncContext();
  for (const [deviceRole, values] of Object.entries(runtimeState)) {
    if (!values || typeof values !== 'object') continue;

    for (const [parameterId, value] of Object.entries(values)) {
      updatedCount += collectParameterPatches(context, deviceRole, parameterId, value);
    }
  }

  updatePanelPreviewSessions(context.patches);
  return updatedCount;
}

const pendingParameterSyncs = new Map();
let pendingAnimationFrame = 0;

function flushQueuedParameterSyncs() {
  pendingAnimationFrame = 0;
  const queued = Array.from(pendingParameterSyncs.values());
  pendingParameterSyncs.clear();

  const context = syncContext();
  for (const entry of queued) {
    collectParameterPatches(context, entry.deviceRole, entry.parameterId, entry.value, {
      skipControlId: entry.skipControlId,
    });
  }
  updatePanelPreviewSessions(context.patches);
}

export function queueDeviceParameterPanelPreviewSync(deviceRole, parameterId, value, options = {}) {
  const role = String(deviceRole ?? DEFAULT_DEVICE_ROLE);
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
