// Runtime MIDI value tracking: outbound-echo suppression, runtime origins, panel/device
// conflict detection and the coalesced continuous-parameter send queue. Owns the
// recentOutboundEchoes and pending-continuous state — no other module duplicates it.
import { setDeviceParameter } from '../bridge/bridge.js';
import { deviceRuntimeOrigins, deviceRuntimeConflicts } from './deviceProfileStores.js';
import { DEFAULT_DEVICE_ROLE, DEFAULT_ECHO_WINDOW_MS } from './deviceConstants.js';

const pendingContinuousParameters = new Map();
let pendingContinuousFrame = 0;
const recentOutboundEchoes = new Map();

export function sourceControlIdFromRequestId(requestId = '') {
  const value = String(requestId ?? '');
  const prefix = 'panel_preview_';
  if (!value.startsWith(prefix)) return '';

  const body = value.slice(prefix.length);
  const parts = body.split('_');
  if (parts.length >= 3 && ['continuous', 'commit'].includes(parts[parts.length - 2])) {
    return parts.slice(0, -2).join('_');
  }

  const separator = body.lastIndexOf('_');
  return separator > 0 ? body.slice(0, separator) : body;
}

function echoKey(deviceRole, parameterId) {
  return `${String(deviceRole ?? DEFAULT_DEVICE_ROLE)}:${String(parameterId ?? '')}`;
}

function valuesMatch(left, right) {
  if (typeof left === 'number' || typeof right === 'number') {
    const a = Number(left);
    const b = Number(right);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.000001;
  }
  return String(left) === String(right);
}

export function markRuntimeOrigin(deviceRole, parameterId, origin, detail = {}) {
  const role = String(deviceRole ?? DEFAULT_DEVICE_ROLE);
  const parameter = String(parameterId ?? '');
  if (!parameter) return;

  deviceRuntimeOrigins.update((origins) => ({
    ...(origins ?? {}),
    [role]: {
      ...(origins?.[role] ?? {}),
      [parameter]: {
        origin,
        updatedAt: new Date().toISOString(),
        ...detail,
      },
    },
  }));
}

function conflictKey(deviceRole, parameterId) {
  return echoKey(deviceRole, parameterId);
}

export function clearRuntimeConflict(deviceRole, parameterId) {
  const role = String(deviceRole ?? DEFAULT_DEVICE_ROLE);
  const parameter = String(parameterId ?? '');
  if (!parameter) return;

  deviceRuntimeConflicts.update((conflicts) => {
    const roleConflicts = { ...(conflicts?.[role] ?? {}) };
    if (!roleConflicts[parameter]) return conflicts ?? {};
    delete roleConflicts[parameter];
    return {
      ...(conflicts ?? {}),
      [role]: roleConflicts,
    };
  });
}

export function recordRuntimeConflict(deviceRole, parameterId, deviceValue, detail = {}) {
  const role = String(deviceRole ?? DEFAULT_DEVICE_ROLE);
  const parameter = String(parameterId ?? '');
  if (!parameter) return false;

  const entry = recentOutboundEchoes.get(conflictKey(role, parameter));
  if (!entry || entry.until < Date.now() || valuesMatch(entry.value, deviceValue)) {
    if (entry && valuesMatch(entry.value, deviceValue)) clearRuntimeConflict(role, parameter);
    return false;
  }

  deviceRuntimeConflicts.update((conflicts) => ({
    ...(conflicts ?? {}),
    [role]: {
      ...(conflicts?.[role] ?? {}),
      [parameter]: {
        deviceRole: role,
        parameterId: parameter,
        panelValue: entry.value,
        deviceValue,
        requestId: entry.requestId,
        status: 'active',
        detectedAt: new Date().toISOString(),
        source: detail.source ?? 'device',
        ...detail,
      },
    },
  }));
  return true;
}

export function rememberOutboundEcho(deviceRole, parameterId, value, options = {}) {
  const parameter = String(parameterId ?? '');
  if (!parameter) return;

  recentOutboundEchoes.set(echoKey(deviceRole, parameter), {
    value,
    until: Date.now() + Number(options.echoWindowMs ?? DEFAULT_ECHO_WINDOW_MS),
    requestId: String(options.requestId ?? ''),
  });
  markRuntimeOrigin(deviceRole, parameter, 'panel', { requestId: options.requestId ?? '' });
}

export function shouldSuppressEcho(deviceRole, parameterId, value) {
  const key = echoKey(deviceRole, parameterId);
  const entry = recentOutboundEchoes.get(key);
  if (!entry) return false;

  if (entry.until < Date.now()) {
    recentOutboundEchoes.delete(key);
    return false;
  }

  if (!valuesMatch(entry.value, value)) return false;
  recentOutboundEchoes.delete(key);
  clearRuntimeConflict(deviceRole, parameterId);
  return true;
}

function flushContinuousParameterSends() {
  pendingContinuousFrame = 0;
  const queued = Array.from(pendingContinuousParameters.values());
  pendingContinuousParameters.clear();

  for (const payload of queued) {
    setDeviceParameter(payload);
  }
}

export function queueContinuousParameterSend(payload) {
  const key = [
    payload?.deviceRole ?? DEFAULT_DEVICE_ROLE,
    payload?.parameterId ?? '',
    sourceControlIdFromRequestId(payload?.requestId),
  ].join(':');

  pendingContinuousParameters.set(key, payload);
  if (pendingContinuousFrame) return;

  if (typeof requestAnimationFrame === 'function') {
    pendingContinuousFrame = requestAnimationFrame(flushContinuousParameterSends);
  } else {
    pendingContinuousFrame = setTimeout(flushContinuousParameterSends, 16);
  }
}

export function clearDeviceRuntimeConflict(deviceRole = DEFAULT_DEVICE_ROLE, parameterId = '') {
  clearRuntimeConflict(deviceRole, parameterId);
}

export function recordDeviceRuntimeConflictForTest(deviceRole, parameterId, panelValue, deviceValue) {
  rememberOutboundEcho(deviceRole, parameterId, panelValue, {
    requestId: 'test_conflict',
    echoWindowMs: 1000,
  });
  return recordRuntimeConflict(deviceRole, parameterId, deviceValue, { source: 'test' });
}
