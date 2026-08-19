// Outbound device operations: parameter preview/commit sends, device sync (pull/push/live),
// identity-mismatch override and dump parse/collection entry points. Falls back to the local
// engine when the JUCE bridge is unavailable or a draft source is being edited.
import { get } from 'svelte/store';
import {
  compileParameterMessage,
  getDeviceDiagnostics,
  parseDumpMessage as requestDumpParse,
  setDeviceParameter,
  overrideDeviceIdentityMismatch as requestDeviceIdentityOverride,
  startDeviceSync as requestDeviceSync,
  isJuceAvailable,
} from '../bridge/bridge.js';
import {
  deviceProfiles,
  selectedSyncDirection,
  deviceRoleMappings,
  latestMidiPreview,
  latestDeviceSyncResult,
  latestDeviceIdentityMismatch,
  latestDeviceIdentityOverride,
  deviceRuntimeState,
  deviceSessionState,
  profileParameters,
  profileParameterPages,
  latestDumpParseResult,
  latestDumpCollectionResult,
} from './deviceProfileStores.js';
import {
  localCollectDumpMessages,
  localCompileDeviceRequest,
  localCompileParameter,
  localDumpDiagnostics,
  localParseDumpMessage,
  localProfileMode,
  parseProfileSourceText,
} from './deviceProfileLocalEngine.js';
import { queueContinuousParameterSend } from './deviceMidiRuntime.js';
import { initDeviceProfileBridge, normalizeSyncDirection, refreshProfileParameters } from './deviceProfileSession.js';
import { DEFAULT_DEVICE_ROLE } from './deviceConstants.js';

/**
 * Is this a profile the engine has?
 *
 * An EMPTY catalog means "nobody has asked yet", not "the profile is missing" — and reading it the
 * second way refused every send in the app with "Not sent: unresolved profile for <role>". The
 * catalog is only populated by listDeviceProfiles, which until now was called by the settings page
 * and nothing else, so opening a panel and moving a control without visiting Settings first meant
 * every knob on it was silently declined. projectDeviceSession.js's own profileExists already
 * treats an empty catalog as "cannot say"; these two now agree.
 *
 * Being wrong the tolerant way costs a message the engine then refuses with a better error, since
 * it is the one that actually knows which profiles it loaded. Being wrong the strict way costs the
 * whole panel, silently.
 */
function profileExists(profileId) {
  const id = String(profileId ?? '');
  if (!id) return false;
  const catalog = get(deviceProfiles);
  if (!Array.isArray(catalog) || catalog.length === 0) return true;
  return catalog.some((profile) => String(profile?.id ?? '') === id);
}

function knownParameterMap(profileId) {
  const pageMeta = get(profileParameterPages)?.[profileId];
  if (pageMeta?.hasMore === true || Number(pageMeta?.total ?? 0) > Number(pageMeta?.loaded ?? 0)) return null;
  const parametersByProfile = get(profileParameters) ?? {};
  if (!Object.prototype.hasOwnProperty.call(parametersByProfile, profileId)) return null;
  const parameters = parametersByProfile[profileId];
  if (!Array.isArray(parameters)) return new Map();
  return new Map(parameters.map((parameter) => [String(parameter?.id ?? ''), parameter]));
}

function resolveParameterSend(payload) {
  const role = String(payload?.deviceRole ?? DEFAULT_DEVICE_ROLE);
  const parameterId = String(payload?.parameterId ?? '');
  const mapping = get(deviceRoleMappings)?.[role] ?? null;
  const profileId = String(payload?.profileId || mapping?.profileId || '');

  if (!profileId || !profileExists(profileId)) {
    return {
      ok: false,
      error: `Not sent: unresolved profile for ${role}${profileId ? ` (${profileId})` : ''}.`,
    };
  }

  const parameterMap = knownParameterMap(profileId);
  if (parameterMap && !parameterMap.has(parameterId)) {
    return {
      ok: false,
      error: `Not sent: ${parameterId} is not in profile ${profileId}.`,
    };
  }

  return { ok: true, profileId };
}

export function overrideDeviceIdentityMismatch({
  deviceRole = DEFAULT_DEVICE_ROLE,
  profileId = '',
  reason = 'User accepted identity mismatch',
} = {}) {
  initDeviceProfileBridge();
  const role = String(deviceRole || DEFAULT_DEVICE_ROLE);
  const resolvedProfileId = String(profileId || get(deviceRoleMappings)?.[role]?.profileId || '');
  const local = {
    ok: true,
    deviceRole: role,
    profileId: resolvedProfileId,
    identityStatus: 'overridden',
    message: reason,
    local: !isJuceAvailable(),
  };

  latestDeviceIdentityOverride.set(local);
  latestDeviceIdentityMismatch.set(null);

  if (!isJuceAvailable()) {
    deviceSessionState.update((state) => ({
      ...(state ?? {}),
      [role]: {
        ...(state?.[role] ?? {}),
        role,
        profileId: resolvedProfileId,
        state: 'ready',
        message: 'Identity mismatch accepted by user',
        identityStatus: 'overridden',
        identityMessage: reason,
      },
    }));
    return;
  }

  requestDeviceIdentityOverride({
    deviceRole: role,
    profileId: resolvedProfileId,
    reason,
  });
}

export function previewParameterMessage({ requestId, deviceRole = DEFAULT_DEVICE_ROLE, profileId = '', parameterId, value, source = '' }) {
  initDeviceProfileBridge();
  if (localProfileMode(profileId, source)) {
    const parsed = parseProfileSourceText(profileId, source);
    if (!parsed.ok) {
      latestMidiPreview.set({ ok: false, requestId, deviceRole, profileId, parameterId, error: parsed.error });
      return;
    }
    const result = localCompileParameter(parsed.profile, { requestId, deviceRole, profileId, parameterId, value });
    latestMidiPreview.set({ ...result, requestId, deviceRole, profileId, parameterId, local: true });
    return;
  }
  compileParameterMessage({
    requestId,
    deviceRole,
    profileId,
    parameterId,
    value,
    dryRun: true,
  });
}

export function commitDeviceParameter({
  requestId,
  deviceRole = DEFAULT_DEVICE_ROLE,
  profileId = '',
  parameterId,
  value,
  interactionPhase = 'commit',
  dryRun = true,
}) {
  initDeviceProfileBridge();
  const payload = {
    requestId,
    deviceRole,
    profileId,
    parameterId,
    value,
    interactionPhase,
    dryRun,
  };

  const resolved = resolveParameterSend(payload);
  if (!resolved.ok) {
    latestMidiPreview.set({
      ok: false,
      error: resolved.error,
      deviceRole,
      parameterId,
    });
    if (profileId || get(deviceRoleMappings)?.[deviceRole]?.profileId) {
      refreshProfileParameters(profileId || get(deviceRoleMappings)?.[deviceRole]?.profileId, deviceRole);
    }
    getDeviceDiagnostics();
    return;
  }

  payload.profileId = resolved.profileId;

  if (interactionPhase === 'continuous') {
    queueContinuousParameterSend(payload);
    return;
  }

  setDeviceParameter(payload);
  if (interactionPhase !== 'continuous') {
    getDeviceDiagnostics();
  }
}

export function startDeviceSync({
  correlationId = `sync_${Date.now()}`,
  deviceRole = DEFAULT_DEVICE_ROLE,
  profileId = '',
  syncDirection = '',
  request = '',
  variables = {},
  values,
  source = '',
  dryRun = false,
} = {}) {
  initDeviceProfileBridge();
  const role = String(deviceRole || DEFAULT_DEVICE_ROLE);
  const resolvedProfileId = String(profileId || get(deviceRoleMappings)?.[role]?.profileId || '');
  const direction = normalizeSyncDirection(syncDirection || get(deviceRoleMappings)?.[role]?.syncDirection || get(selectedSyncDirection));
  latestDeviceSyncResult.set({ requestId: correlationId, profileId: resolvedProfileId, deviceRole: role, syncDirection: direction, running: true });

  if (localProfileMode(resolvedProfileId, source)) {
    const parsed = parseProfileSourceText(resolvedProfileId, source);
    if (!parsed.ok) {
      latestDeviceSyncResult.set({ requestId: correlationId, profileId: resolvedProfileId, deviceRole: role, ok: false, error: parsed.error });
      return;
    }
    if (direction === 'push' && !request) {
      const pushValues = values && typeof values === 'object'
        ? values
        : get(deviceRuntimeState)?.[role] ?? {};
      const transactions = Object.entries(pushValues).map(([parameterId, value]) => (
        localCompileParameter(parsed.profile, { requestId: `${correlationId}_${parameterId}`, deviceRole: role, profileId: resolvedProfileId, parameterId, value })
      ));
      latestDeviceSyncResult.set({
        ok: transactions.every((item) => item.ok),
        requestId: correlationId,
        profileId: resolvedProfileId,
        deviceRole: role,
        syncDirection: direction,
        status: `Previewed ${transactions.filter((item) => item.ok).length} parameter(s)`,
        pushed: transactions.filter((item) => item.ok).length,
        transactions: transactions.filter((item) => item.ok).map((item) => item.transaction),
        errors: transactions.filter((item) => !item.ok).map((item) => ({ error: item.error })),
        local: true,
      });
      return;
    }
    const result = localCompileDeviceRequest(parsed.profile, {
      correlationId,
      deviceRole: role,
      profileId: resolvedProfileId,
      request,
      variables,
    });
    latestDeviceSyncResult.set({ ...result, syncDirection: direction });
    return;
  }

  requestDeviceSync({
    correlationId,
    deviceRole: role,
    profileId: resolvedProfileId,
    syncDirection: direction,
    request,
    variables,
    values,
    dryRun,
  });
}

export function parseProfileDump({ requestId, deviceRole = DEFAULT_DEVICE_ROLE, profileId = '', hex, source = '' }) {
  initDeviceProfileBridge();
  latestDumpParseResult.set({ requestId, profileId, deviceRole, running: true });
  if (localProfileMode(profileId, source)) {
    const parsed = parseProfileSourceText(profileId, source);
    if (!parsed.ok) {
      latestDumpParseResult.set({
        ok: false,
        requestId,
        profileId,
        deviceRole,
        error: parsed.error,
        matchStatus: 'invalidProfile',
        diagnostics: localDumpDiagnostics('invalidProfile', parsed.error),
        local: true,
      });
      return;
    }
    latestDumpParseResult.set({
      requestId,
      profileId,
      deviceRole,
      ...localParseDumpMessage(parsed.profile, hex),
      local: true,
    });
    return;
  }
  requestDumpParse({
    requestId,
    deviceRole,
    profileId,
    hex,
  });
}

export function collectProfileDumps({
  requestId = `dump_collection_${Date.now()}`,
  deviceRole = DEFAULT_DEVICE_ROLE,
  profileId = '',
  source = '',
  hexMessages = [],
  messages = [],
} = {}) {
  initDeviceProfileBridge();
  latestDumpCollectionResult.set({ requestId, profileId, deviceRole, running: true });

  const parsed = parseProfileSourceText(profileId, source);
  if (!parsed.ok) {
    latestDumpCollectionResult.set({
      ok: false,
      complete: false,
      status: 'error',
      requestId,
      profileId,
      deviceRole,
      error: parsed.error,
      diagnostics: localDumpDiagnostics('invalidProfile', parsed.error),
      local: true,
    });
    return;
  }

  latestDumpCollectionResult.set({
    requestId,
    profileId,
    deviceRole,
    ...localCollectDumpMessages(parsed.profile, hexMessages.length ? hexMessages : messages),
  });
}
