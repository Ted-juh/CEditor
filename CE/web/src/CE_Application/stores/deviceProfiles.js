import { writable, get } from 'svelte/store';
import {
  compileParameterMessage,
  getDeviceProfileSource,
  getProfileParameterDetail,
  getDeviceDiagnostics,
  getDeviceRuntimeState,
  getMidiMonitorEvents,
  importDeviceProfile as requestDeviceProfileImport,
  listDeviceProfiles,
  listMidiDestinations,
  listProfileParameters,
  onDeviceParameterSet,
  onDeviceDiagnostics,
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
  onMidiMonitorEvents,
  onMidiPreview,
  onProfileParameterDetail,
  onProfileParameterDetailSaved,
  onProfileParametersListed,
  parseDumpMessage as requestDumpParse,
  runDeviceProfileTests,
  saveProfileParameterDetail as saveParameterDetail,
  saveDeviceProfileSource,
  setDeviceParameter,
  setDeviceRoleMapping,
  requestFileData,
  validateDeviceProfileSource,
} from '../bridge/bridge.js';
import {
  queueDeviceParameterPanelPreviewSync,
  syncDeviceRuntimeStateToPanelPreview,
} from '../utils/deviceBindingSync.js';
import { appSettings, updateDeviceSessionSettings } from './appSettings.js';

export const deviceProfiles = writable([]);
export const midiDestinations = writable([]);
export const selectedDeviceProfileId = writable('test-cc-synth');
export const selectedMidiDestinationId = writable('previewOnly');
export const deviceRoleMappings = writable({
  mainSynth: {
    role: 'mainSynth',
    profileId: 'test-cc-synth',
    midiDestination: { type: 'previewOnly', id: 'previewOnly' },
    variables: {},
    timingOverrides: {},
  },
});
export const latestMidiPreview = writable(null);
export const deviceRuntimeState = writable({});
export const midiMonitorEvents = writable([]);
export const deviceDiagnostics = writable({ ok: true, issues: [] });
export const latestProfileTestResult = writable(null);
export const latestProfileImport = writable(null);
export const profileParameters = writable({});
export const profileParameterPages = writable({});
export const profileParameterDetails = writable({});
export const profileSources = writable({});
export const latestProfileSourceValidation = writable(null);
export const latestProfileSourceSave = writable(null);
export const latestDumpParseResult = writable(null);

let initialized = false;
let sessionPersistenceInitialized = false;
let applyingPersistedDeviceSession = false;
const pendingContinuousParameters = new Map();
let pendingContinuousFrame = 0;
const profileSourceFallbackRequests = new Map();
let localDraftProfileCounter = 1;

function uniqueDraftProfileId(base = 'new-device-profile') {
  const existing = new Set(get(deviceProfiles).map((profile) => String(profile?.id ?? '')));
  let id = base;
  while (existing.has(id)) {
    localDraftProfileCounter += 1;
    id = `${base}-${localDraftProfileCounter}`;
  }
  return id;
}

function createBlankProfileSource(id, name) {
  return {
    id,
    name,
    manufacturer: '',
    family: '',
    profileVersion: '0.1.0',
    minCEditorVersion: '0.1.0',
    status: 'draft',
    trust: 'local',
    coverage: {
      realtimeEditing: 'draft',
    },
    variables: {
      channel: 1,
      deviceId: 16,
    },
    timing: {
      minDelayBetweenMessagesMs: 20,
    },
    messageRecipes: [],
    dumpDefinitions: [],
    parameters: [],
    tests: [],
  };
}

export function createDeviceProfileDraft({ id = '', name = 'Untitled Device Profile' } = {}) {
  const profileId = String(id || uniqueDraftProfileId()).trim();
  const profileName = String(name || 'Untitled Device Profile').trim();
  const source = createBlankProfileSource(profileId, profileName);

  deviceProfiles.update((profiles) => [
    ...profiles.filter((profile) => String(profile?.id ?? '') !== profileId),
    {
      id: profileId,
      name: profileName,
      manufacturer: '',
      family: '',
      status: 'draft',
      trust: 'local',
      source: '',
      localDraft: true,
    },
  ]);

  profileSources.update((sources) => ({
    ...sources,
    [profileId]: {
      profileId,
      source: JSON.stringify(source, null, 2),
      localDraft: true,
    },
  }));

  profileParameters.update((profiles) => ({
    ...profiles,
    [profileId]: [],
  }));

  profileParameterPages.update((pages) => ({
    ...pages,
    [profileId]: { profileId, loaded: 0, total: 0, hasMore: false },
  }));

  selectedDeviceProfileId.set(profileId);
  return { id: profileId, name: profileName, source };
}

function sourceControlIdFromRequestId(requestId = '') {
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

function flushContinuousParameterSends() {
  pendingContinuousFrame = 0;
  const queued = Array.from(pendingContinuousParameters.values());
  pendingContinuousParameters.clear();

  for (const payload of queued) {
    setDeviceParameter(payload);
  }
}

function queueContinuousParameterSend(payload) {
  const key = [
    payload?.deviceRole ?? 'mainSynth',
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

function fallbackPreviewDestination() {
  return { type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' };
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

function normalizeRoleMappingForStore(mapping, role = 'mainSynth') {
  return {
    role: String(mapping?.role ?? role),
    profileId: String(mapping?.profileId ?? 'test-cc-synth'),
    midiDestination: mapping?.midiDestination ?? fallbackPreviewDestination(),
    variables: mapping?.variables && typeof mapping.variables === 'object' ? { ...mapping.variables } : {},
    timingOverrides: mapping?.timingOverrides && typeof mapping.timingOverrides === 'object'
      ? { ...mapping.timingOverrides }
      : {},
  };
}

function profileExists(profileId) {
  const id = String(profileId ?? '');
  if (!id) return false;
  return get(deviceProfiles).some((profile) => String(profile?.id ?? '') === id);
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
  const role = String(payload?.deviceRole ?? 'mainSynth');
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

function persistDeviceSession(mapping) {
  if (applyingPersistedDeviceSession) return;

  updateDeviceSessionSettings({
    selectedProfileId: mapping.profileId,
    selectedDestinationId: destinationId(mapping.midiDestination),
    roleMappings: {
      [mapping.role]: mapping,
    },
  });
}

function initDeviceSessionPersistence() {
  if (sessionPersistenceInitialized) return;
  sessionPersistenceInitialized = true;

  appSettings.subscribe((settings) => {
    const session = settings?.deviceSession;
    const mainSynth = session?.roleMappings?.mainSynth;
    if (!mainSynth) return;

    const mapping = normalizeRoleMappingForStore(mainSynth, 'mainSynth');
    applyingPersistedDeviceSession = true;
    selectedDeviceProfileId.set(String(session.selectedProfileId || mapping.profileId));
    selectedMidiDestinationId.set(String(session.selectedDestinationId || destinationId(mapping.midiDestination)));
    deviceRoleMappings.update((mappings) => ({
      ...mappings,
      [mapping.role]: mapping,
    }));
    applyingPersistedDeviceSession = false;

    if (initialized) {
      setDeviceRoleMapping(mapping);
    }
  });
}

export function initDeviceProfileBridge() {
  initDeviceSessionPersistence();
  if (initialized) return;
  initialized = true;

  onDeviceProfilesListed((payload) => {
    deviceProfiles.set(Array.isArray(payload?.profiles) ? payload.profiles : []);
  });

  onDeviceProfileImported((payload) => {
    latestProfileImport.set(payload);
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
  });

  onDeviceRoleMappingSet((payload) => {
    if (payload?.ok !== true || !payload?.role) return;
    deviceRoleMappings.update((mappings) => ({
      ...mappings,
      [payload.role]: {
        ...(mappings[payload.role] ?? {}),
        role: payload.role,
        profileId: payload.profileId,
        midiDestination: payload.midiDestination ?? mappings[payload.role]?.midiDestination,
        variables: payload.variables ?? mappings[payload.role]?.variables ?? {},
        timingOverrides: payload.timingOverrides ?? mappings[payload.role]?.timingOverrides ?? {},
      },
    }));
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
        ?? payload?.runtimeState?.[payload.deviceRole ?? 'mainSynth']?.[payload.parameterId];
      if (value !== undefined) {
        queueDeviceParameterPanelPreviewSync(payload.deviceRole ?? 'mainSynth', payload.parameterId, value, {
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
        queueDeviceParameterPanelPreviewSync(payload.deviceRole ?? 'mainSynth', parameterId, value);
      }
    }
  });

  onDeviceRuntimeState((payload) => {
    deviceRuntimeState.set(payload ?? {});
    syncDeviceRuntimeStateToPanelPreview(payload ?? {});
  });

  onMidiMonitorEvents((payload) => {
    midiMonitorEvents.set(Array.isArray(payload) ? payload : []);
  });

  onDeviceDiagnostics((payload) => {
    deviceDiagnostics.set(payload ?? { ok: false, issues: [] });
  });

  onDeviceProfileTestsFinished((payload) => {
    latestProfileTestResult.set(payload);
  });

  const currentMainSynth = get(deviceRoleMappings)?.mainSynth;
  if (currentMainSynth) {
    setDeviceRoleMapping(currentMainSynth);
  }
}

export function refreshProfileParameters(profileId, deviceRole = 'mainSynth', options = {}) {
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

export function requestProfileParameterDetail(profileId, parameterId, deviceRole = 'mainSynth') {
  initDeviceProfileBridge();
  getProfileParameterDetail({
    requestId: `profile_parameter_detail_${profileId}_${parameterId}`,
    profileId,
    parameterId,
    deviceRole,
  });
}

export function saveProfileParameter(profileId, parameterId, parameter, deviceRole = 'mainSynth') {
  initDeviceProfileBridge();
  latestProfileSourceSave.set({ profileId, parameterId, running: true });
  saveParameterDetail({
    requestId: `profile_parameter_save_${profileId}_${parameterId}`,
    profileId,
    parameterId,
    parameter,
    deviceRole,
  });
}

export function refreshDeviceProfiles() {
  initDeviceProfileBridge();
  listDeviceProfiles();
  listMidiDestinations();
  getDeviceRuntimeState();
  getMidiMonitorEvents();
  getDeviceDiagnostics();
}

export function importDeviceProfile() {
  initDeviceProfileBridge();
  requestDeviceProfileImport();
}

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

export function validateProfileSource(profileId, source) {
  initDeviceProfileBridge();
  latestProfileSourceValidation.set({ profileId, running: true });
  validateDeviceProfileSource({
    requestId: `profile_validate_${profileId}`,
    profileId,
    source,
  });
}

export function saveProfileSource(profileId, source) {
  initDeviceProfileBridge();
  latestProfileSourceSave.set({ profileId, running: true });
  saveDeviceProfileSource({
    requestId: `profile_save_${profileId}`,
    profileId,
    source,
  });
}

export function mapDeviceRole(role, profileId, options = {}) {
  initDeviceProfileBridge();
  const payload = {
    role,
    profileId,
    midiDestination: options.midiDestination ?? get(deviceRoleMappings)?.[role]?.midiDestination ?? fallbackPreviewDestination(),
    variables: options.variables ?? get(deviceRoleMappings)?.[role]?.variables ?? {},
    timingOverrides: options.timingOverrides ?? get(deviceRoleMappings)?.[role]?.timingOverrides ?? {},
  };

  deviceRoleMappings.update((mappings) => ({
    ...mappings,
    [role]: payload,
  }));

  if (role === 'mainSynth') {
    selectedDeviceProfileId.set(profileId);
    selectedMidiDestinationId.set(destinationId(payload.midiDestination));
  }
  persistDeviceSession(payload);
  setDeviceRoleMapping(payload);
  getDeviceDiagnostics();
}

export function previewParameterMessage({ requestId, deviceRole = 'mainSynth', profileId = '', parameterId, value }) {
  initDeviceProfileBridge();
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
  deviceRole = 'mainSynth',
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

export function parseProfileDump({ requestId, deviceRole = 'mainSynth', profileId = '', hex }) {
  initDeviceProfileBridge();
  latestDumpParseResult.set({ requestId, profileId, deviceRole, running: true });
  requestDumpParse({
    requestId,
    deviceRole,
    profileId,
    hex,
  });
}

export function runTestsForProfile(profileId) {
  initDeviceProfileBridge();
  latestProfileTestResult.set({ profileId, running: true });
  runDeviceProfileTests({ profileId });
}
