// Bridge wiring + session lifecycle for device profiles: registers all JUCE bridge event
// listeners (exactly once, guarded by `initialized`), persists/restores the device session
// via appSettings/projectDeviceSession, and owns role-mapping + profile/source refresh calls.
import { get } from 'svelte/store';
import {
  getDeviceProfileSource,
  getProfileParameterDetail,
  getDeviceDiagnostics,
  getDeviceRuntimeState,
  getDeviceSessionState,
  getDeviceTransportCapabilities,
  getMidiMonitorEvents,
  listDeviceProfiles,
  listMidiDestinations,
  listMidiInputs,
  listProfileParameters,
  onDeviceParameterSet,
  onDeviceDiagnostics,
  onDeviceIdentityOverride,
  onDeviceSessionState,
  onDeviceTransportCapabilities,
  onDumpCollectionUpdated,
  onDumpMessageParsed,
  onDeviceProfileImported,
  onDeviceProfileSource,
  onDeviceProfileSourceSaved,
  onDeviceProfileSourceValidated,
  onDeviceProfileTestsFinished,
  onDeviceProfilesListed,
  onDeviceRoleMappingSet,
  onFileData,
  onDeviceRuntimeState,
  onMidiDestinationsListed,
  onMidiInputMessage,
  onMidiInputsListed,
  onMidiMonitorEvents,
  onMidiPreview,
  onProfileParameterDetail,
  onProfileParameterDetailSaved,
  onProfileParametersListed,
  onSysexInputMessage,
  setDeviceRoleMapping,
  onDeviceSyncStarted,
  onDeviceRequestContinued,
  onDeviceRequestResolved,
  onDeviceRequestTimedOut,
  onDeviceIdentityReply,
  onDeviceIdentityMismatch,
  onPresetListScanStarted,
  onPresetListScanUpdated,
  onBulkDumpSendStarted,
  onBulkDumpSendUpdated,
  onBulkDumpSends,
  onMidiCiDiscovered,
  onMidiCiDiscoveryStarted,
  onMidiCiDiscoveryComplete,
  getBulkDumpSends,
  requestFileData,
} from '../bridge/bridge.js';
import { midiCiPropertiesToProfile } from '../generated/dpd/import-midici.mjs';
import {
  queueDeviceParameterPanelPreviewSync,
  syncDeviceRuntimeStateToPanelPreview,
} from '../utils/deviceBindingSync.js';
import { appSettings, replaceDeviceSessionSettings, updateDeviceSessionSettings } from './appSettings.js';
import {
  createProjectDeviceSessionSnapshot,
  mergeProjectDeviceRoleMapping,
  projectDeviceSessionDiagnostics,
  registerProjectDeviceSessionRestoreHandler,
  setProjectDeviceSession,
} from './projectDeviceSession.js';
import {
  deviceProfiles,
  midiDestinations,
  midiInputs,
  discoveredMidiCiProfiles,
  midiCiStatus,
  selectedDeviceProfileId,
  selectedMidiDestinationId,
  selectedMidiInputId,
  selectedSyncDirection,
  deviceRoleMappings,
  latestMidiPreview,
  latestMidiInputMessage,
  latestSysexInputMessage,
  latestDeviceSyncResult,
  latestDeviceRequestContinued,
  latestDeviceRequestResolved,
  latestDeviceRequestTimedOut,
  latestDeviceIdentityReply,
  latestDeviceIdentityMismatch,
  latestDeviceIdentityOverride,
  latestPresetListScan,
  latestBulkDumpSend,
  bulkDumpSends,
  deviceRuntimeState,
  deviceSessionState,
  deviceTransportCapabilities,
  midiMonitorEvents,
  deviceDiagnostics,
  latestProfileTestResult,
  latestProfileImport,
  profileParameters,
  profileParameterPages,
  profileParameterDetails,
  profileSources,
  latestProfileSourceValidation,
  latestProfileSourceSave,
  latestDumpParseResult,
  latestDumpCollectionResult,
} from './deviceProfileStores.js';
import {
  markRuntimeOrigin,
  recordRuntimeConflict,
  rememberOutboundEcho,
  shouldSuppressEcho,
  sourceControlIdFromRequestId,
} from './deviceMidiRuntime.js';
import { DEFAULT_DEVICE_ROLE, DEFAULT_ECHO_WINDOW_MS } from './deviceConstants.js';

// Echo window per role: role mapping timingOverrides.echoWindowMs wins, then the profile
// source's timing.echoWindowMs, then the conservative default. The parsed value is cached per
// profile and self-invalidates when the source text changes (saves replace the string).
const echoWindowCache = new Map(); // profileId -> { source, ms }

function echoWindowMsForRole(deviceRole) {
  const role = String(deviceRole ?? DEFAULT_DEVICE_ROLE);
  const mapping = get(deviceRoleMappings)?.[role];

  const override = Number(mapping?.timingOverrides?.echoWindowMs);
  if (Number.isFinite(override) && override > 0) return override;

  const profileId = String(mapping?.profileId ?? '');
  if (!profileId) return DEFAULT_ECHO_WINDOW_MS;

  const sourceText = get(profileSources)?.[profileId]?.source ?? '';
  const cached = echoWindowCache.get(profileId);
  if (cached && cached.source === sourceText) return cached.ms;

  let ms = DEFAULT_ECHO_WINDOW_MS;
  try {
    const configured = Number(JSON.parse(sourceText)?.timing?.echoWindowMs);
    if (Number.isFinite(configured) && configured > 0) ms = configured;
  } catch {
    // no source loaded or invalid JSON — keep the default
  }
  echoWindowCache.set(profileId, { source: sourceText, ms });
  return ms;
}

let initialized = false;
let sessionPersistenceInitialized = false;
let applyingPersistedDeviceSession = false;
const profileSourceFallbackRequests = new Map();

function fallbackPreviewDestination() {
  return { type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' };
}

function fallbackMidiInput() {
  return { type: 'none', id: 'none', name: 'No MIDI Input' };
}

function decodeDataUrlText(dataUrl = '') {
  const commaIndex = String(dataUrl).indexOf(',');
  if (commaIndex < 0) return '';

  const meta = dataUrl.slice(0, commaIndex).toLowerCase();
  const payload = dataUrl.slice(commaIndex + 1);
  if (!meta.includes(';base64')) {
    try {
      return decodeURIComponent(payload);
    } catch {
      return payload;
    }
  }

  const binary = atob(payload);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}

function destinationId(destination) {
  return String(destination?.id ?? 'previewOnly');
}

function inputId(input) {
  return String(input?.id ?? 'none');
}

export function normalizeSyncDirection(value) {
  const direction = String(value ?? '').trim().toLowerCase();
  return ['pull', 'push', 'live'].includes(direction) ? direction : 'pull';
}

function normalizeRoleMappingForStore(mapping, role = DEFAULT_DEVICE_ROLE) {
  return {
    role: String(mapping?.role ?? role),
    profileId: String(mapping?.profileId ?? 'test-cc-synth'),
    midiDestination: mapping?.midiDestination ?? fallbackPreviewDestination(),
    midiInput: mapping?.midiInput ?? fallbackMidiInput(),
    syncDirection: normalizeSyncDirection(mapping?.syncDirection ?? mapping?.syncPolicy ?? mapping?.startupPolicy),
    variables: mapping?.variables && typeof mapping.variables === 'object' ? { ...mapping.variables } : {},
    timingOverrides: mapping?.timingOverrides && typeof mapping.timingOverrides === 'object'
      ? { ...mapping.timingOverrides }
      : {},
  };
}

function normalizeRoleMappingsForStore(roleMappings, fallbackSession = {}) {
  const rawMappings = roleMappings && typeof roleMappings === 'object' && !Array.isArray(roleMappings)
    ? roleMappings
    : {};
  const normalizedMappings = {};

  for (const [role, mapping] of Object.entries(rawMappings)) {
    normalizedMappings[role] = normalizeRoleMappingForStore(mapping, role);
  }

  if (!normalizedMappings.mainSynth) {
    normalizedMappings.mainSynth = normalizeRoleMappingForStore(fallbackSession?.mainSynth, DEFAULT_DEVICE_ROLE);
  }

  return normalizedMappings;
}

function sessionSnapshotForMappings(session = {}, roleMappings = {}) {
  const mainSynth = roleMappings.mainSynth ?? normalizeRoleMappingForStore(null, DEFAULT_DEVICE_ROLE);
  return createProjectDeviceSessionSnapshot({
    selectedProfileId: session.selectedProfileId || mainSynth.profileId,
    selectedDestinationId: session.selectedDestinationId || destinationId(mainSynth.midiDestination),
    selectedInputId: session.selectedInputId || inputId(mainSynth.midiInput),
    selectedSyncDirection: normalizeSyncDirection(session.selectedSyncDirection || mainSynth.syncDirection),
    roleMappings,
  });
}

function updateProjectDeviceSessionDiagnostics(session = createCurrentDeviceSessionSnapshot()) {
  const diagnostics = projectDeviceSessionDiagnostics(session, {
    profiles: get(deviceProfiles),
    midiDestinations: get(midiDestinations),
    midiInputs: get(midiInputs),
  });

  deviceDiagnostics.update((current) => {
    const nativeIssues = (current?.issues ?? []).filter((issue) => issue?.projectDeviceSession !== true);
    const nativeOk = current?.ok !== false || nativeIssues.length === 0;
    return {
      ...(current ?? {}),
      ok: nativeOk && diagnostics.ok,
      issues: [
        ...nativeIssues,
        ...diagnostics.issues.map((issue) => ({
          ...issue,
          projectDeviceSession: true,
        })),
      ],
    };
  });

  return diagnostics;
}

function persistDeviceSession(mapping) {
  if (applyingPersistedDeviceSession) return;

  const snapshot = mergeProjectDeviceRoleMapping(mapping, {
    selectedProfileId: mapping.profileId,
    selectedDestinationId: destinationId(mapping.midiDestination),
    selectedInputId: inputId(mapping.midiInput),
    selectedSyncDirection: normalizeSyncDirection(mapping.syncDirection),
  });

  updateProjectDeviceSessionDiagnostics(snapshot);
  updateDeviceSessionSettings(snapshot);
}

function initDeviceSessionPersistence() {
  if (sessionPersistenceInitialized) return;
  sessionPersistenceInitialized = true;

  appSettings.subscribe((settings) => {
    const session = settings?.deviceSession;
    if (!session) return;

    const roleMappings = normalizeRoleMappingsForStore(session.roleMappings, session);
    const snapshot = setProjectDeviceSession(sessionSnapshotForMappings(session, roleMappings));
    updateProjectDeviceSessionDiagnostics(snapshot);

    applyingPersistedDeviceSession = true;
    try {
      selectedDeviceProfileId.set(snapshot.selectedProfileId);
      selectedMidiDestinationId.set(snapshot.selectedDestinationId);
      selectedMidiInputId.set(snapshot.selectedInputId);
      selectedSyncDirection.set(snapshot.selectedSyncDirection);
      deviceRoleMappings.update((mappings) => ({
        ...mappings,
        ...roleMappings,
      }));
    } finally {
      applyingPersistedDeviceSession = false;
    }

    if (initialized) {
      for (const mapping of Object.values(roleMappings)) {
        setDeviceRoleMapping(mapping);
      }
    }
  });
}

export function initDeviceProfileBridge() {
  initDeviceSessionPersistence();
  if (initialized) return;
  initialized = true;

  onDeviceProfilesListed((payload) => {
    deviceProfiles.set(Array.isArray(payload?.profiles) ? payload.profiles : []);
    updateProjectDeviceSessionDiagnostics();
  });

  onDeviceProfileImported((payload) => {
    latestProfileImport.set(payload);
  });

  onMidiCiDiscovered((payload) => {
    // C++ surfaced a discovered device's raw Property Exchange resources; turn them into a draft
    // (partial) DPD profile via the bundled importer and collect it for the UI to open.
    if (!payload || payload.deviceInfo == null) return;
    let entry;
    try {
      const { profile, summary } = midiCiPropertiesToProfile({
        deviceInfo: payload.deviceInfo,
        allCtrlList: payload.allCtrlList,
        channelList: payload.channelList,
        programList: payload.programList,
      });
      entry = { muid: payload.muid ?? null, deviceRole: payload.deviceRole ?? DEFAULT_DEVICE_ROLE, profile, summary, profiles: Array.isArray(payload.profiles) ? payload.profiles : [] };
    } catch (err) {
      entry = { muid: payload.muid ?? null, deviceRole: payload.deviceRole ?? DEFAULT_DEVICE_ROLE, error: String(err?.message ?? err), profiles: Array.isArray(payload.profiles) ? payload.profiles : [] };
    }
    discoveredMidiCiProfiles.update((list) => [...list.filter((e) => e.muid !== entry.muid), entry]);
  });

  onMidiCiDiscoveryStarted((payload) => {
    // The C++ start result: ok -> scanning continues; otherwise surface the reason (e.g. no output).
    if (payload?.ok === false || payload?.error) {
      midiCiStatus.set({ state: 'error', message: payload?.error || 'MIDI-CI discovery could not start' });
    }
  });

  onMidiCiDiscoveryComplete(() => {
    midiCiStatus.update((s) => (s.state === 'error' ? s : { state: 'done', message: '' }));
  });

  onDeviceProfileSource((payload) => {
    if (payload?.ok !== true || !payload?.profileId) return;
    profileSourceFallbackRequests.delete(`profile_source_file_${payload.profileId}`);
    profileSources.update((sources) => ({
      ...sources,
      [payload.profileId]: {
        profileId: payload.profileId,
        filePath: payload.filePath,
        source: String(payload.source ?? ''),
        lastModified: payload.lastModified ?? '',
        native: true,
        fallback: false,
      },
    }));
  });

  onFileData((payload) => {
    const request = profileSourceFallbackRequests.get(payload?.requestId);
    if (!request) return;

    profileSourceFallbackRequests.delete(payload.requestId);
    profileSources.update((sources) => {
      const existing = sources?.[request.profileId];
      if (existing?.native === true) return sources;

      return {
        ...sources,
        [request.profileId]: {
        profileId: request.profileId,
        filePath: request.filePath,
        source: decodeDataUrlText(payload?.data ?? ''),
        lastModified: '',
        fallback: true,
      },
      };
    });
  });

  onDeviceProfileSourceValidated((payload) => {
    latestProfileSourceValidation.set(payload);
  });

  onDeviceProfileSourceSaved((payload) => {
    latestProfileSourceSave.set(payload);
    if (payload?.ok !== true) return;

    if (payload?.profileId && payload?.source !== undefined) {
      profileSources.update((sources) => ({
        ...sources,
        [payload.profileId]: {
          profileId: payload.profileId,
          filePath: payload.filePath,
          source: String(payload.source ?? ''),
          lastModified: payload.lastModified ?? '',
          native: true,
          fallback: false,
        },
      }));
    }

    refreshDeviceProfiles();
    refreshProfileParameters(payload.profileId);
    requestProfileSource(payload.profileId);
  });

  onMidiDestinationsListed((payload) => {
    midiDestinations.set(Array.isArray(payload?.destinations) ? payload.destinations : []);
    updateProjectDeviceSessionDiagnostics();
  });

  onMidiInputsListed((payload) => {
    midiInputs.set(Array.isArray(payload?.inputs) ? payload.inputs : []);
    updateProjectDeviceSessionDiagnostics();
  });

  onDeviceTransportCapabilities((payload) => {
    deviceTransportCapabilities.set(payload ?? {});
  });

  onDeviceSessionState((payload) => {
    deviceSessionState.set(payload ?? {});
  });

  onMidiInputMessage((payload) => {
    // ce.midi.interceptIn sits HERE, not in the scripting runtime, because everything downstream —
    // the panel's bindings, the note input, the transport — reads this store. A filter applied only
    // where scripts listen would be a rule that holds for scripts and not for the panel.
    const filtered = filterInboundMidi(payload ?? null);
    if (filtered === null || filtered === undefined) return;   // a filter swallowed it
    latestMidiInputMessage.set(filtered);
  });

  onSysexInputMessage((payload) => {
    latestSysexInputMessage.set(payload ?? null);
  });

  onDeviceSyncStarted((payload) => {
    latestDeviceSyncResult.set(payload ?? null);
    if (payload?.sessionState) deviceSessionState.set(payload.sessionState);
  });

  onDeviceRequestContinued((payload) => {
    latestDeviceRequestContinued.set(payload ?? null);
    if (payload?.dumpCollection) latestDumpCollectionResult.set(payload.dumpCollection);
  });

  onDeviceRequestResolved((payload) => {
    latestDeviceRequestResolved.set(payload ?? null);
  });

  onDeviceRequestTimedOut((payload) => {
    latestDeviceRequestTimedOut.set(payload ?? null);
  });

  onDeviceIdentityReply((payload) => {
    latestDeviceIdentityReply.set(payload ?? null);
  });

  onDeviceIdentityMismatch((payload) => {
    latestDeviceIdentityMismatch.set(payload ?? null);
  });

  onDeviceIdentityOverride((payload) => {
    latestDeviceIdentityOverride.set(payload ?? null);
    latestDeviceIdentityMismatch.set(null);
    if (payload?.sessionState) deviceSessionState.set(payload.sessionState);
  });

  onPresetListScanStarted((payload) => {
    latestPresetListScan.set(payload ?? null);
  });

  onPresetListScanUpdated((payload) => {
    latestPresetListScan.set(payload ?? null);
  });

  onBulkDumpSendStarted((payload) => {
    latestBulkDumpSend.set(payload ?? null);
    if (payload?.bulkSendId) {
      bulkDumpSends.update((jobs) => [
        ...jobs.filter((job) => job?.bulkSendId !== payload.bulkSendId),
        payload,
      ]);
    }
  });

  onBulkDumpSendUpdated((payload) => {
    latestBulkDumpSend.set(payload ?? null);
    if (payload?.bulkSendId) {
      bulkDumpSends.update((jobs) => [
        ...jobs.filter((job) => job?.bulkSendId !== payload.bulkSendId),
        payload,
      ]);
    }
  });

  onBulkDumpSends((payload) => {
    bulkDumpSends.set(Array.isArray(payload) ? payload : []);
  });

  onDeviceRoleMappingSet((payload) => {
    if (payload?.ok !== true || !payload?.role) return;
    const previous = get(deviceRoleMappings)?.[payload.role] ?? {};
    const mapping = normalizeRoleMappingForStore({
      ...previous,
      role: payload.role,
      profileId: payload.profileId ?? previous.profileId,
      midiDestination: payload.midiDestination ?? previous.midiDestination,
      midiInput: payload.midiInput ?? previous.midiInput,
      syncDirection: payload.syncDirection ?? previous.syncDirection,
      variables: payload.variables ?? previous.variables,
      timingOverrides: payload.timingOverrides ?? previous.timingOverrides,
    }, payload.role);

    deviceRoleMappings.update((mappings) => ({
      ...mappings,
      [payload.role]: mapping,
    }));

    if (payload.role === DEFAULT_DEVICE_ROLE) {
      selectedDeviceProfileId.set(mapping.profileId);
      selectedMidiDestinationId.set(destinationId(mapping.midiDestination));
      selectedMidiInputId.set(inputId(mapping.midiInput));
      selectedSyncDirection.set(mapping.syncDirection);
    }
    const snapshot = mergeProjectDeviceRoleMapping(mapping, payload.role === DEFAULT_DEVICE_ROLE
      ? {
        selectedProfileId: mapping.profileId,
        selectedDestinationId: destinationId(mapping.midiDestination),
        selectedInputId: inputId(mapping.midiInput),
        selectedSyncDirection: mapping.syncDirection,
      }
      : {});
    updateProjectDeviceSessionDiagnostics(snapshot);
    if (payload.sessionState) deviceSessionState.set(payload.sessionState);
    if (payload.capabilities) deviceTransportCapabilities.set(payload.capabilities);
  });

  onProfileParametersListed((payload) => {
    if (payload?.ok !== true || !payload?.profileId) return;
    const parameters = Array.isArray(payload.parameters) ? payload.parameters : [];
    const offset = Number(payload.offset ?? 0);
    profileParameters.update((profiles) => {
      const existing = offset > 0 && Array.isArray(profiles[payload.profileId]) ? profiles[payload.profileId] : [];
      return {
        ...profiles,
        [payload.profileId]: offset > 0 ? [...existing, ...parameters] : parameters,
      };
    });
    profileParameterPages.update((pages) => ({
      ...pages,
      [payload.profileId]: {
        profileId: payload.profileId,
        offset,
        limit: Number(payload.limit ?? parameters.length),
        loaded: offset + parameters.length,
        total: Number(payload.total ?? parameters.length),
        hasMore: payload.hasMore === true,
        query: String(payload.query ?? ''),
        group: String(payload.group ?? ''),
        type: String(payload.type ?? ''),
        access: String(payload.access ?? ''),
        groups: Array.isArray(payload.groups) ? payload.groups : [],
        types: Array.isArray(payload.types) ? payload.types : [],
      },
    }));
  });

  onProfileParameterDetail((payload) => {
    if (payload?.ok !== true || !payload?.profileId || !payload?.parameterId) return;
    const key = `${payload.profileId}:${payload.parameterId}`;
    profileParameterDetails.update((details) => ({
      ...details,
      [key]: {
        profileId: payload.profileId,
        parameterId: payload.parameterId,
        parameterIndex: payload.parameterIndex,
        parameter: payload.parameter ?? null,
        recipe: payload.recipe ?? null,
        tests: Array.isArray(payload.tests) ? payload.tests : [],
        filePath: payload.filePath ?? '',
        lastModified: payload.lastModified ?? '',
      },
    }));
  });

  onProfileParameterDetailSaved((payload) => {
    latestProfileSourceSave.set(payload);
    if (payload?.ok !== true || !payload?.profileId || !payload?.parameterId) return;

    const key = `${payload.profileId}:${payload.parameterId}`;
    profileParameterDetails.update((details) => ({
      ...details,
      [key]: {
        ...(details[key] ?? {}),
        profileId: payload.profileId,
        parameterId: payload.parameterId,
        parameter: payload.parameter ?? details[key]?.parameter ?? null,
        filePath: payload.filePath ?? details[key]?.filePath ?? '',
        lastModified: payload.lastModified ?? details[key]?.lastModified ?? '',
      },
    }));

    profileParameters.update((profiles) => {
      const list = Array.isArray(profiles[payload.profileId]) ? [...profiles[payload.profileId]] : [];
      const index = list.findIndex((parameter) => String(parameter?.id ?? '') === String(payload.parameterId));
      if (index >= 0) list[index] = payload.parameter;
      return { ...profiles, [payload.profileId]: list };
    });
  });

  onMidiPreview((payload) => {
    latestMidiPreview.set(payload);
  });

  onDeviceParameterSet((payload) => {
    latestMidiPreview.set(payload);
    if (payload?.runtimeState) {
      deviceRuntimeState.set(payload.runtimeState);
    }
    if (payload?.ok === true && payload?.parameterId) {
      const value = payload?.transaction?.semanticValue
        ?? payload?.runtimeState?.[payload.deviceRole ?? DEFAULT_DEVICE_ROLE]?.[payload.parameterId];
      rememberOutboundEcho(payload.deviceRole ?? DEFAULT_DEVICE_ROLE, payload.parameterId, value, {
        requestId: payload?.requestId,
        echoWindowMs: echoWindowMsForRole(payload.deviceRole),
      });
      if (value !== undefined) {
        queueDeviceParameterPanelPreviewSync(payload.deviceRole ?? DEFAULT_DEVICE_ROLE, payload.parameterId, value, {
          skipControlId: sourceControlIdFromRequestId(payload?.requestId),
        });
      }
    }
  });

  onDumpMessageParsed((payload) => {
    latestDumpParseResult.set(payload);
    if (payload?.runtimeState) {
      deviceRuntimeState.set(payload.runtimeState);
      syncDeviceRuntimeStateToPanelPreview(payload.runtimeState);
    }
    if (payload?.ok === true && payload?.values && typeof payload.values === 'object') {
      for (const [parameterId, value] of Object.entries(payload.values)) {
        markRuntimeOrigin(payload.deviceRole ?? DEFAULT_DEVICE_ROLE, parameterId, 'device', {
          requestId: payload?.requestId,
          dumpId: payload?.dumpId ?? '',
        });
        recordRuntimeConflict(payload.deviceRole ?? DEFAULT_DEVICE_ROLE, parameterId, value, {
          source: 'dump',
          requestId: payload?.requestId,
          dumpId: payload?.dumpId ?? '',
        });
        if (shouldSuppressEcho(payload.deviceRole ?? DEFAULT_DEVICE_ROLE, parameterId, value)) continue;
        queueDeviceParameterPanelPreviewSync(payload.deviceRole ?? DEFAULT_DEVICE_ROLE, parameterId, value);
      }
    }
  });

  onDumpCollectionUpdated((payload) => {
    latestDumpCollectionResult.set(payload ?? null);
    if (payload?.values && typeof payload.values === 'object') {
      for (const [parameterId, value] of Object.entries(payload.values)) {
        markRuntimeOrigin(payload.deviceRole ?? DEFAULT_DEVICE_ROLE, parameterId, 'deviceCollection', {
          requestId: payload?.requestId,
          collectionId: payload?.collectionId ?? '',
        });
        recordRuntimeConflict(payload.deviceRole ?? DEFAULT_DEVICE_ROLE, parameterId, value, {
          source: 'dumpCollection',
          requestId: payload?.requestId,
          collectionId: payload?.collectionId ?? '',
        });
        if (shouldSuppressEcho(payload.deviceRole ?? DEFAULT_DEVICE_ROLE, parameterId, value)) continue;
        queueDeviceParameterPanelPreviewSync(payload.deviceRole ?? DEFAULT_DEVICE_ROLE, parameterId, value);
      }
    }
  });

  onDeviceRuntimeState((payload) => {
    deviceRuntimeState.set(payload ?? {});
    const filtered = {};
    for (const [role, values] of Object.entries(payload ?? {})) {
      if (!values || typeof values !== 'object') continue;
      filtered[role] = {};
      for (const [parameterId, value] of Object.entries(values)) {
        markRuntimeOrigin(role, parameterId, 'deviceRuntime');
        recordRuntimeConflict(role, parameterId, value, { source: 'runtimeState' });
        if (!shouldSuppressEcho(role, parameterId, value)) filtered[role][parameterId] = value;
      }
    }
    syncDeviceRuntimeStateToPanelPreview(filtered);
  });

  onMidiMonitorEvents((payload) => {
    midiMonitorEvents.set(Array.isArray(payload) ? payload : []);
  });

  onDeviceDiagnostics((payload) => {
    deviceDiagnostics.set(payload ?? { ok: false, issues: [] });
    updateProjectDeviceSessionDiagnostics();
  });

  onDeviceProfileTestsFinished((payload) => {
    latestProfileTestResult.set(payload);
  });

  const currentMainSynth = get(deviceRoleMappings)?.mainSynth;
  if (currentMainSynth) {
    setDeviceRoleMapping(currentMainSynth);
  }
}

export function refreshProfileParameters(profileId, deviceRole = DEFAULT_DEVICE_ROLE, options = {}) {
  initDeviceProfileBridge();
  listProfileParameters({
    profileId,
    deviceRole,
    offset: Number(options.offset ?? 0),
    limit: Number(options.limit ?? 160),
    query: String(options.query ?? ''),
    group: String(options.group ?? ''),
    type: String(options.type ?? ''),
    access: String(options.access ?? ''),
  });
}

export function requestProfileParameterDetail(profileId, parameterId, deviceRole = DEFAULT_DEVICE_ROLE) {
  initDeviceProfileBridge();
  getProfileParameterDetail({
    requestId: `profile_parameter_detail_${profileId}_${parameterId}`,
    profileId,
    parameterId,
    deviceRole,
  });
}

export function refreshDeviceProfiles() {
  initDeviceProfileBridge();
  listDeviceProfiles();
  listMidiDestinations();
  listMidiInputs();
  getDeviceTransportCapabilities();
  getDeviceSessionState();
  getDeviceRuntimeState();
  getMidiMonitorEvents();
  getDeviceDiagnostics();
  getBulkDumpSends();
}

export function createCurrentDeviceSessionSnapshot() {
  return createProjectDeviceSessionSnapshot({
    selectedProfileId: get(selectedDeviceProfileId),
    selectedDestinationId: get(selectedMidiDestinationId),
    selectedInputId: get(selectedMidiInputId),
    selectedSyncDirection: get(selectedSyncDirection),
    roleMappings: get(deviceRoleMappings),
  });
}

export function restoreProjectDeviceSession(session, options = {}) {
  initDeviceProfileBridge();
  const snapshot = setProjectDeviceSession(session);

  if (options.persist !== false) {
    replaceDeviceSessionSettings(snapshot);
  }

  const diagnostics = updateProjectDeviceSessionDiagnostics(snapshot);
  if (diagnostics.issues.length === 0) getDeviceDiagnostics();

  return {
    ok: diagnostics.ok,
    source: options.source ?? 'project',
    label: options.label ?? '',
    deviceSession: snapshot,
    diagnostics,
  };
}

registerProjectDeviceSessionRestoreHandler(restoreProjectDeviceSession);

export function requestProfileSource(profileId) {
  initDeviceProfileBridge();
  getDeviceProfileSource({
    requestId: `profile_source_${profileId}`,
    profileId,
  });

  const profile = get(deviceProfiles).find((item) => String(item?.id ?? '') === String(profileId));
  const filePath = profile?.filePath;
  if (filePath) {
    const requestId = `profile_source_file_${profileId}`;
    profileSourceFallbackRequests.set(requestId, { profileId, filePath });
    requestFileData(requestId, filePath);
  }
}

export function mapDeviceRole(role, profileId, options = {}) {
  initDeviceProfileBridge();
  const payload = {
    role,
    profileId,
    midiDestination: options.midiDestination ?? get(deviceRoleMappings)?.[role]?.midiDestination ?? fallbackPreviewDestination(),
    midiInput: options.midiInput ?? get(deviceRoleMappings)?.[role]?.midiInput ?? fallbackMidiInput(),
    syncDirection: normalizeSyncDirection(options.syncDirection ?? get(deviceRoleMappings)?.[role]?.syncDirection ?? get(selectedSyncDirection)),
    variables: options.variables ?? get(deviceRoleMappings)?.[role]?.variables ?? {},
    timingOverrides: options.timingOverrides ?? get(deviceRoleMappings)?.[role]?.timingOverrides ?? {},
  };

  deviceRoleMappings.update((mappings) => ({
    ...mappings,
    [role]: payload,
  }));

  if (role === DEFAULT_DEVICE_ROLE) {
    selectedDeviceProfileId.set(profileId);
    selectedMidiDestinationId.set(destinationId(payload.midiDestination));
    selectedMidiInputId.set(inputId(payload.midiInput));
    selectedSyncDirection.set(payload.syncDirection);
  }
  persistDeviceSession(payload);
  setDeviceRoleMapping(payload);
  getDeviceDiagnostics();
}
