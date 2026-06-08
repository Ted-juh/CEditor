import { writable, get } from 'svelte/store';
import {
  compileParameterMessage,
  getDeviceProfileSource,
  getProfileParameterDetail,
  getDeviceDiagnostics,
  getDeviceRuntimeState,
  getDeviceSessionState,
  getDeviceTransportCapabilities,
  getMidiMonitorEvents,
  importDeviceProfile as requestDeviceProfileImport,
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
  parseDumpMessage as requestDumpParse,
  runDeviceProfileTests,
  saveProfileParameterDetail as saveParameterDetail,
  saveDeviceProfileSource,
  setDeviceParameter,
  setDeviceRoleMapping,
  overrideDeviceIdentityMismatch as requestDeviceIdentityOverride,
  startDeviceSync as requestDeviceSync,
  startPresetListScan as requestPresetListScan,
  cancelPresetListScan as requestPresetListScanCancel,
  startBulkDumpSend as requestBulkDumpSend,
  cancelBulkDumpSend as requestBulkDumpSendCancel,
  getBulkDumpSends,
  requestFileData,
  validateDeviceProfileSource,
  isJuceAvailable,
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
  requestMidiCiDiscovery as requestMidiCiDiscoveryBridge,
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

export const deviceProfiles = writable([]);
export const midiDestinations = writable([{ type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' }]);
export const midiInputs = writable([{ type: 'none', id: 'none', name: 'No MIDI Input' }]);
// Profiles drafted live from MIDI-CI discovery: [{ muid, profile, summary }] (MIDI 2.0 plan, phase M1).
export const discoveredMidiCiProfiles = writable([]);

// Broadcast a MIDI-CI Discovery on the role's hardware output; results arrive via the midiCiDiscovered
// bridge event and are converted to draft profiles in discoveredMidiCiProfiles. Needs MIDI-CI hardware.
export function requestMidiCiDiscovery(deviceRole = 'mainSynth') {
  discoveredMidiCiProfiles.set([]);
  requestMidiCiDiscoveryBridge(deviceRole);
}
export const selectedDeviceProfileId = writable('test-cc-synth');
export const selectedMidiDestinationId = writable('previewOnly');
export const selectedMidiInputId = writable('none');
export const selectedSyncDirection = writable('pull');
export const deviceRoleMappings = writable({
  mainSynth: {
    role: 'mainSynth',
    profileId: 'test-cc-synth',
    midiDestination: { type: 'previewOnly', id: 'previewOnly' },
    midiInput: { type: 'none', id: 'none', name: 'No MIDI Input' },
    syncDirection: 'pull',
    variables: {},
    timingOverrides: {},
  },
});
export const latestMidiPreview = writable(null);
export const latestMidiInputMessage = writable(null);
export const latestSysexInputMessage = writable(null);
export const latestDeviceSyncResult = writable(null);
export const latestDeviceRequestContinued = writable(null);
export const latestDeviceRequestResolved = writable(null);
export const latestDeviceRequestTimedOut = writable(null);
export const latestDeviceIdentityReply = writable(null);
export const latestDeviceIdentityMismatch = writable(null);
export const latestDeviceIdentityOverride = writable(null);
export const latestPresetListScan = writable(null);
export const latestBulkDumpSend = writable(null);
export const bulkDumpSends = writable([]);
export const deviceRuntimeState = writable({});
export const deviceRuntimeOrigins = writable({});
export const deviceRuntimeConflicts = writable({});
export const deviceSessionState = writable({});
export const deviceTransportCapabilities = writable({
  transport: 'preview',
  canSendMidi: false,
  canReceiveMidi: false,
  canSendSysex: false,
  canReceiveSysex: false,
  ownsPorts: false,
  supportsChunkedSysex: false,
  supportsScheduledMessages: false,
  supportedEndpointTypes: ['previewOnly'],
  pluginTransportStatus: 'planned',
  pluginTransports: [
    { format: 'VST3', status: 'planned', ownsPorts: false, midiRouting: 'host', sysex: 'hostDependent' },
    { format: 'AU', status: 'planned', ownsPorts: false, midiRouting: 'host', sysex: 'hostDependent' },
    { format: 'AUv3', status: 'planned', ownsPorts: false, midiRouting: 'host', sysex: 'hostDependent' },
    { format: 'CLAP', status: 'planned', ownsPorts: false, midiRouting: 'host', sysex: 'hostDependent' },
  ],
});
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
export const latestDumpCollectionResult = writable(null);

let initialized = false;
let sessionPersistenceInitialized = false;
let applyingPersistedDeviceSession = false;
const pendingContinuousParameters = new Map();
let pendingContinuousFrame = 0;
const profileSourceFallbackRequests = new Map();
let localDraftProfileCounter = 1;
const recentOutboundEchoes = new Map();

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

function echoKey(deviceRole, parameterId) {
  return `${String(deviceRole ?? 'mainSynth')}:${String(parameterId ?? '')}`;
}

function valuesMatch(left, right) {
  if (typeof left === 'number' || typeof right === 'number') {
    const a = Number(left);
    const b = Number(right);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.000001;
  }
  return String(left) === String(right);
}

function markRuntimeOrigin(deviceRole, parameterId, origin, detail = {}) {
  const role = String(deviceRole ?? 'mainSynth');
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

function clearRuntimeConflict(deviceRole, parameterId) {
  const role = String(deviceRole ?? 'mainSynth');
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

function recordRuntimeConflict(deviceRole, parameterId, deviceValue, detail = {}) {
  const role = String(deviceRole ?? 'mainSynth');
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

function rememberOutboundEcho(deviceRole, parameterId, value, options = {}) {
  const parameter = String(parameterId ?? '');
  if (!parameter) return;

  recentOutboundEchoes.set(echoKey(deviceRole, parameter), {
    value,
    until: Date.now() + Number(options.echoWindowMs ?? 250),
    requestId: String(options.requestId ?? ''),
  });
  markRuntimeOrigin(deviceRole, parameter, 'panel', { requestId: options.requestId ?? '' });
}

function shouldSuppressEcho(deviceRole, parameterId, value) {
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

function fallbackMidiInput() {
  return { type: 'none', id: 'none', name: 'No MIDI Input' };
}

function bytesToHex(bytes = []) {
  return (bytes ?? [])
    .map((byte) => Number(byte).toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

function clampInt(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function normalizeHex(value = '') {
  return String(value ?? '').trim().toUpperCase().split(/[\s,]+/).filter(Boolean).join(' ');
}

function parseRawMidiHexText(value = '') {
  const tokens = normalizeHex(value).split(' ').filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: 'Bulk dump hex is required', bytes: [] };

  const bytes = [];
  for (const token of tokens) {
    if (!/^[0-9A-F]{1,2}$/.test(token)) {
      return { ok: false, error: `Invalid MIDI byte: ${token}`, bytes: [] };
    }
    const byte = parseInt(token, 16);
    if (!Number.isFinite(byte) || byte < 0 || byte > 255) {
      return { ok: false, error: `Invalid MIDI byte: ${token}`, bytes: [] };
    }
    bytes.push(byte);
  }

  if (bytes[0] === 0xf0 && bytes.at(-1) !== 0xf7) {
    return { ok: false, error: 'SysEx raw MIDI message must end with F7', bytes: [] };
  }

  return { ok: true, bytes };
}

function localBuildBulkDumpSend({
  bulkSendId = `bulk_send_${Date.now()}`,
  deviceRole = 'mainSynth',
  profileId = '',
  hex = '',
  message = '',
  dataHex = '',
  label = 'Bulk dump send',
  chunkSizeBytes,
  bulkChunkBytes,
  chunkBytes,
  chunkDelayMs,
  bulkChunkDelayMs,
  expectedCollectionId = '',
  verifyCollectionId = '',
  expectedDumpId = '',
  ackHex = '',
  nakHex = '',
  ackPolicy = null,
  retries = 0,
  source = '',
  dryRun = true,
} = {}) {
  const parsedHex = parseRawMidiHexText(hex || message || dataHex);
  const resolvedProfileId = String(profileId || get(deviceRoleMappings)?.[deviceRole]?.profileId || '');
  if (!parsedHex.ok) {
    return {
      ok: false,
      bulkSendId,
      deviceRole,
      profileId: resolvedProfileId,
      status: 'error',
      error: parsedHex.error,
      chunks: [],
      totalChunks: 0,
      totalBytes: 0,
      sentBytes: 0,
      sentChunks: 0,
      failedChunks: 0,
      progress: 0,
      local: true,
    };
  }

  const parsedProfile = source ? parseProfileSourceText(resolvedProfileId, source) : { ok: false, profile: null };
  const timing = parsedProfile.ok ? (parsedProfile.profile?.timing ?? {}) : {};
  const resolvedChunkSize = clampInt(
    chunkSizeBytes ?? bulkChunkBytes ?? chunkBytes ?? timing.bulkChunkBytes ?? 256,
    1,
    1024 * 1024
  );
  const resolvedDelay = Math.max(0, Number(
    chunkDelayMs
    ?? bulkChunkDelayMs
    ?? timing.bulkChunkDelayMs
    ?? timing.interMessageDelayMs
    ?? timing.minDelayBetweenMessagesMs
    ?? 50
  ) || 0);

  const chunks = [];
  for (let offset = 0; offset < parsedHex.bytes.length; offset += resolvedChunkSize) {
    const bytes = parsedHex.bytes.slice(offset, offset + resolvedChunkSize);
    chunks.push({
      index: chunks.length,
      offset,
      byteCount: bytes.length,
      hex: bytesToHex(bytes),
      status: dryRun ? 'preview' : 'queued',
      error: '',
      dueTimeMs: dryRun ? 0 : chunks.length * resolvedDelay,
      sentAtMs: 0,
    });
  }

  return {
    ok: true,
    bulkSendId,
    deviceRole,
    profileId: resolvedProfileId,
    label,
    status: dryRun ? 'preview' : 'running',
    running: !dryRun,
    messageType: parsedHex.bytes[0] === 0xf0 ? 'sysex' : 'raw',
    totalBytes: parsedHex.bytes.length,
    sentBytes: 0,
    chunkSizeBytes: resolvedChunkSize,
    chunkDelayMs: resolvedDelay,
    totalChunks: chunks.length,
    sentChunks: 0,
    failedChunks: 0,
    pendingChunks: dryRun ? 0 : chunks.length,
    progress: 0,
    cancelled: false,
    dryRun,
    expectedCollectionId: expectedCollectionId || verifyCollectionId || expectedDumpId,
    verificationStatus: expectedCollectionId || verifyCollectionId || expectedDumpId ? 'waiting' : 'none',
    ackStatus: ackHex || nakHex || ackPolicy?.ackHex || ackPolicy?.nakHex ? 'waiting' : 'none',
    ackHex: ackHex || ackPolicy?.ackHex || '',
    nakHex: nakHex || ackPolicy?.nakHex || '',
    retriesRemaining: Number(ackPolicy?.retries ?? retries ?? 0),
    retryCount: 0,
    dumpCollection: null,
    chunks,
    local: true,
  };
}

function parseProfileSourceText(profileId, source = '') {
  const text = String(source || get(profileSources)?.[profileId]?.source || '').trim();
  if (!text) return { ok: false, error: 'No profile source loaded.' };
  try {
    const profile = JSON.parse(text);
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      return { ok: false, error: 'Profile source must be a JSON object.' };
    }
    return { ok: true, profile, source: text };
  } catch (error) {
    return { ok: false, error: error?.message || 'Profile source is not valid JSON.' };
  }
}

function localProfileMode(profileId, source = '') {
  return !isJuceAvailable() || !!String(source ?? '').trim() || get(profileSources)?.[profileId]?.localDraft === true;
}

function recipeNumber(value, variables = {}, fallback = 0) {
  if (typeof value === 'string' && value.startsWith('$')) {
    const key = value.slice(1);
    return Number(variables[key] ?? fallback);
  }
  return Number(value ?? fallback);
}

function encodeParameterValue(parameter, value) {
  const encoding = String(parameter?.encoding?.type ?? 'u7');
  if (encoding === 'boolean-u7') {
    const on = value === true || ['true', 'on', 'yes', '1'].includes(String(value).toLowerCase());
    return { bytes: [on ? 127 : 0], number: on ? 127 : 0, normalized: on ? 1 : 0, displayed: on ? 'On' : 'Off' };
  }
  if (encoding === 'u14' || encoding === '14bit') {
    const number = clampInt(value, 0, 16383);
    return { bytes: [(number >> 7) & 0x7f, number & 0x7f], number, normalized: number / 16383, displayed: String(number) };
  }
  const number = clampInt(value, 0, 127);
  return { bytes: [number], number, normalized: number / 127, displayed: String(number) };
}

function localCompileParameter(profile, request = {}) {
  const parameterId = String(request.parameterId ?? '');
  const parameter = (profile.parameters ?? []).find((item) => String(item?.id ?? '') === parameterId);
  if (!parameter) return { ok: false, error: `Parameter "${parameterId}" is not in this profile.` };

  const recipeId = String(parameter.messageRecipe ?? '');
  const recipe = (profile.messageRecipes ?? []).find((item) => String(item?.id ?? '') === recipeId);
  if (!recipe) return { ok: false, error: `Recipe "${recipeId}" was not found for ${parameterId}.` };

  const variables = { channel: 1, deviceId: 16, ...(profile.variables ?? {}), ...(request.variables ?? {}) };
  const encoded = encodeParameterValue(parameter, request.value);
  const channel = clampInt(recipeNumber(recipe.channel, variables, variables.channel ?? 1), 1, 16);
  const status = 0xb0 + channel - 1;
  const kind = String(recipe.kind ?? 'cc');
  let bytes = [];

  if (kind === 'cc') {
    bytes = [status, clampInt(recipe.controller, 0, 127), encoded.bytes[0] ?? 0];
  } else if (kind === 'nrpn') {
    const value14 = encoded.bytes.length > 1
      ? encoded
      : encodeParameterValue({ encoding: { type: 'u14' } }, encoded.number);
    bytes = [
      status, 99, clampInt(recipe.parameterMsb, 0, 127),
      status, 98, clampInt(recipe.parameterLsb, 0, 127),
      status, 6, value14.bytes[0] ?? 0,
    ];
    if ((value14.bytes[1] ?? 0) !== 0 || value14.number > 127) {
      bytes.push(status, 38, value14.bytes[1] ?? 0);
    }
  } else if (kind === 'sysex') {
    const template = Array.isArray(recipe.template) ? recipe.template : [];
    for (const token of template) {
      const text = String(token ?? '');
      if (text === '$deviceId') bytes.push(clampInt(variables.deviceId, 0, 127));
      else if (text === '$encodedValue') bytes.push(...encoded.bytes);
      else if (text === '$checksum') bytes.push(clampInt(bytes.reduce((sum, byte) => sum + byte, 0), 0, 127));
      else if (/^[0-9a-f]{1,2}$/i.test(text)) bytes.push(parseInt(text, 16));
    }
  } else {
    return { ok: false, error: `Unsupported recipe kind "${kind}".` };
  }

  const hex = bytesToHex(bytes);
  return {
    ok: true,
    profileId: profile.id,
    deviceRole: request.deviceRole ?? 'mainSynth',
    parameterId,
    hex,
    transaction: {
      transactionId: request.requestId ?? 'local_dry_tx',
      deviceRole: request.deviceRole ?? 'mainSynth',
      parameterId,
      semanticValue: request.value,
      displayedValue: encoded.displayed,
      normalizedValue: encoded.normalized,
      encodedValueHex: bytesToHex(encoded.bytes),
      checksumStatus: kind === 'sysex' ? 'local' : 'none',
      hex,
      messages: [{ kind, hex, bytes }],
      policy: {
        mode: parameter?.sendPolicy?.mode ?? 'continuous',
        coalesce: parameter?.sendPolicy?.coalesce !== false,
        minIntervalMs: Number(parameter?.sendPolicy?.minIntervalMs ?? profile?.timing?.minDelayBetweenMessagesMs ?? 0),
        sendFinalOnRelease: parameter?.sendPolicy?.sendFinalOnRelease !== false,
        realtimeSafe: parameter?.access?.realtimeSafe !== false,
      },
    },
  };
}

function localDefaultStartupRequestId(profile) {
  const sync = Array.isArray(profile?.startup?.sync) ? profile.startup.sync : [];
  for (const step of sync) {
    if (typeof step === 'string' && step.trim()) return step.trim();
    const request = String(step?.request ?? '').trim();
    if (request) return request;
  }
  return String(profile?.requests?.[0]?.id ?? '').trim();
}

function localResolveByteToken(token, variables = {}) {
  const text = String(token ?? '').trim();
  if (text.startsWith('$')) return clampInt(variables[text.slice(1)], 0, 127);
  return /^[0-9a-f]{1,2}$/i.test(text) ? parseInt(text, 16) : 0;
}

function localPatternBytes(value, variables = {}) {
  const tokens = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[\s,]+/).filter(Boolean);
  return tokens.map((token) => localResolveByteToken(token, variables));
}

function localCompileIdentityRequest(profile, request = {}) {
  const variables = { channel: 1, deviceId: 16, ...(profile.variables ?? {}), ...(request.variables ?? {}) };
  const deviceId = localResolveByteToken(profile.identity?.requestDeviceId ?? '7F', variables);
  const bytes = [0xf0, 0x7e, deviceId, 0x06, 0x01, 0xf7];
  const hex = bytesToHex(bytes);
  return {
    ok: true,
    requestId: request.correlationId ?? `local_identity_${Date.now()}`,
    deviceRole: request.deviceRole ?? 'mainSynth',
    profileId: profile.id,
    deviceRequestId: 'identityRequest',
    expectedResponseKind: 'identity',
    status: 'Preview',
    pending: false,
    local: true,
    transaction: {
      transactionId: 'request_identityRequest',
      deviceRole: request.deviceRole ?? 'mainSynth',
      parameterId: 'identityRequest',
      semanticValue: true,
      displayedValue: 'Identity Request',
      normalizedValue: 1,
      encodedValueHex: hex,
      checksumStatus: 'none',
      hex,
      messages: [{ kind: 'sysex', hex, bytes }],
      policy: { mode: 'request', coalesce: false, minIntervalMs: 0, sendFinalOnRelease: true, realtimeSafe: false },
    },
  };
}

function localMatchIdentityReply(profile, inputHex = '') {
  const bytes = normalizeHex(inputHex).split(' ').filter(Boolean).map((token) => parseInt(token, 16));
  if (bytes.length < 11 || bytes[0] !== 0xf0 || bytes[1] !== 0x7e || bytes[3] !== 0x06 || bytes[4] !== 0x02 || bytes.at(-1) !== 0xf7) {
    return { ok: false, matched: false, error: 'Not an identity reply.', values: {} };
  }
  const manufacturerLength = bytes[5] === 0 ? 3 : 1;
  const familyOffset = 5 + manufacturerLength;
  const modelOffset = familyOffset + 2;
  const revisionOffset = modelOffset + 2;
  const actual = {
    'identity.deviceId': bytesToHex([bytes[2]]),
    'identity.manufacturerId': bytesToHex(bytes.slice(5, 5 + manufacturerLength)),
    'identity.familyCode': bytesToHex(bytes.slice(familyOffset, familyOffset + 2)),
    'identity.modelNumber': bytesToHex(bytes.slice(modelOffset, modelOffset + 2)),
    'identity.revision': bytesToHex(bytes.slice(revisionOffset, -1)),
  };
  const variables = { channel: 1, deviceId: 16, ...(profile.variables ?? {}) };
  const expected = {
    'identity.manufacturerId': bytesToHex(localPatternBytes(profile.identity?.manufacturerId, variables)),
    'identity.familyCode': bytesToHex(localPatternBytes(profile.identity?.familyCode, variables)),
    'identity.modelNumber': bytesToHex(localPatternBytes(profile.identity?.modelNumber, variables)),
    'identity.revision': bytesToHex(localPatternBytes(profile.identity?.revision, variables)),
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue && actual[key] !== expectedValue) {
      return { ok: false, matched: false, error: `${key} expected ${expectedValue} but got ${actual[key]}`, values: actual };
    }
  }
  return { ok: true, matched: true, values: actual };
}

function localDumpDiagnostics(code, message, dumpId = '') {
  return [{ level: 'error', code, message, ...(dumpId ? { dumpId } : {}) }];
}

function localBytesStartWith(bytes = [], prefix = []) {
  return prefix.length <= bytes.length && prefix.every((byte, index) => bytes[index] === byte);
}

function localBytesEndWith(bytes = [], suffix = []) {
  if (suffix.length > bytes.length) return false;
  const offset = bytes.length - suffix.length;
  return suffix.every((byte, index) => bytes[offset + index] === byte);
}

function normalizeTextCodec(codec = '') {
  const value = String(codec || 'u7');
  if (value === 'ascii' || value === 'fixed-ascii') return 'text-ascii';
  if (value === 'nibbled-ascii' || value === 'packed-nibbled-ascii') return 'text-nibbled-ascii';
  return value;
}

function trimRightPad(text = '', padByte = 32) {
  let value = String(text ?? '');
  const pad = Number(padByte);
  if (!Number.isFinite(pad) || pad < 0 || pad > 127) return value.trimEnd();
  const padChar = String.fromCharCode(pad);
  while (value.endsWith(padChar)) value = value.slice(0, -1);
  return value.trimEnd();
}

function localDecodeDumpParameterValue(parameter, bytes = [], offset = 0, codecOverride = null) {
  if (offset < 0 || offset >= bytes.length) {
    return { ok: false, error: `Dump value offset is outside message for ${parameter?.id ?? ''}` };
  }

  const type = String(parameter?.type ?? '');
  const encoding = codecOverride && typeof codecOverride === 'object'
    ? codecOverride
    : (parameter?.encoding && typeof parameter.encoding === 'object' ? parameter.encoding : {});
  let encodingType = String(encoding?.type ?? 'u7');

  if (type === 'text') {
    encodingType = normalizeTextCodec(encodingType);
    const length = Number(encoding?.length ?? 1);
    const pad = Number(encoding?.pad ?? 32);

    if (encodingType === 'text-ascii') {
      if (length <= 0 || offset + length > bytes.length) {
        return { ok: false, error: `Text dump value is outside message for ${parameter?.id ?? ''}` };
      }
      let text = '';
      for (let index = 0; index < length; index += 1) {
        const byte = bytes[offset + index];
        if (byte < 32 || byte > 127) {
          return { ok: false, error: `Text dump value contains non-ASCII byte for ${parameter?.id ?? ''}` };
        }
        text += String.fromCharCode(byte);
      }
      return { ok: true, value: trimRightPad(text, pad) };
    }

    if (encodingType === 'text-nibbled-ascii') {
      const nibbles = Number(encoding?.nibbles ?? length * 2);
      if (length <= 0 || nibbles < length * 2 || offset + nibbles > bytes.length) {
        return { ok: false, error: `Nibbled text dump value is outside message for ${parameter?.id ?? ''}` };
      }
      let text = '';
      for (let index = 0; index < length; index += 1) {
        const high = bytes[offset + (index * 2)] & 0x0f;
        const low = bytes[offset + (index * 2) + 1] & 0x0f;
        const byte = (high << 4) | low;
        if (byte < 32 || byte > 127) {
          return { ok: false, error: `Nibbled text dump value contains non-ASCII byte for ${parameter?.id ?? ''}` };
        }
        text += String.fromCharCode(byte);
      }
      return { ok: true, value: trimRightPad(text, pad) };
    }

    return { ok: false, error: `Unsupported text dump codec: ${encodingType} for ${parameter?.id ?? ''}` };
  }

  let numeric = bytes[offset];
  if (encodingType === 'u14-msb-lsb' || encodingType === 'u14' || encodingType === '14bit') {
    if (offset + 1 >= bytes.length) return { ok: false, error: `14-bit dump value requires two bytes for ${parameter?.id ?? ''}` };
    numeric = ((bytes[offset] & 0x7f) << 7) | (bytes[offset + 1] & 0x7f);
  } else if (encodingType === 'nibbled') {
    const nibbles = Number(encoding?.nibbles ?? 2);
    if (nibbles <= 0 || offset + nibbles > bytes.length) {
      return { ok: false, error: `Nibbled dump value is outside message for ${parameter?.id ?? ''}` };
    }
    numeric = 0;
    for (let index = 0; index < nibbles; index += 1) {
      numeric = (numeric << 4) | (bytes[offset + index] & 0x0f);
    }
  }

  if (type === 'choice' || type === 'enum') {
    const choice = (Array.isArray(parameter?.choices) ? parameter.choices : [])
      .find((item) => Number(item?.value) === numeric);
    if (choice) return { ok: true, value: String(choice.id ?? '') };
  }

  if (type === 'boolean' || type === 'momentary') {
    return { ok: true, value: numeric === Number(parameter?.trueValue ?? 1) };
  }

  return { ok: true, value: numeric };
}

function localParseDumpWithDefinition(profile, dump, bytes = []) {
  const variables = { channel: 1, deviceId: 16, ...(profile?.variables ?? {}) };
  const dumpId = String(dump?.id ?? '');
  const dumpName = String(dump?.name ?? '');
  const prefix = localPatternBytes(dump?.matcher?.prefix, variables);
  const suffix = localPatternBytes(dump?.matcher?.suffix, variables);
  const payloadOffset = Number(dump?.payload?.offset ?? prefix.length);
  const payloadSize = Number(dump?.payload?.size ?? 0);
  const completion = dump?.completion && typeof dump.completion === 'object' ? dump.completion : {};
  const expectedMessageCount = Number(completion.expectedMessages ?? completion.expectedMessageCount ?? 1);
  let expectedBytes = Number(completion.expectedBytes ?? completion.byteCount ?? 0);
  let minimumBytes = Number(completion.minBytes ?? completion.minimumBytes ?? expectedBytes);
  const maximumBytes = Number(completion.maxBytes ?? completion.maximumBytes ?? 0);

  if (prefix.length && !localBytesStartWith(bytes, prefix)) {
    return { ok: false, error: `Dump prefix did not match ${dumpId}`, matchStatus: 'noMatch', receivedBytes: bytes.length };
  }

  if (suffix.length && !localBytesEndWith(bytes, suffix)) {
    const error = `Dump suffix did not match ${dumpId}`;
    return {
      ok: false,
      error,
      dumpId,
      dumpName,
      checksumStatus: 'none',
      matchStatus: 'partial',
      complete: false,
      expectedMessageCount,
      receivedMessageCount: 1,
      expectedBytes,
      receivedBytes: bytes.length,
      completion,
      diagnostics: localDumpDiagnostics('partial', error, dumpId),
      partialFailures: localDumpDiagnostics('partial', error, dumpId),
    };
  }

  const checksum = dump?.checksum && typeof dump.checksum === 'object' ? dump.checksum : null;
  if (payloadSize > 0 && !expectedBytes) {
    let requiredDataEnd = payloadOffset + payloadSize;
    if (checksum) requiredDataEnd = Math.max(requiredDataEnd, Number(checksum.byteOffset ?? requiredDataEnd) + 1);
    expectedBytes = requiredDataEnd + suffix.length;
    minimumBytes = expectedBytes;
  }

  const failMatched = (matchStatus, error, checksumStatus = 'none') => ({
    ok: false,
    error,
    dumpId,
    dumpName,
    checksumStatus,
    values: {},
    matchStatus,
    complete: false,
    expectedMessageCount,
    receivedMessageCount: 1,
    expectedBytes,
    receivedBytes: bytes.length,
    completion,
    diagnostics: localDumpDiagnostics(matchStatus, error, dumpId),
    ...(matchStatus === 'partial' ? { partialFailures: localDumpDiagnostics(matchStatus, error, dumpId) } : {}),
  });

  if (minimumBytes > 0 && bytes.length < minimumBytes) {
    return failMatched('partial', `Partial dump ${dumpId}: expected at least ${minimumBytes} byte(s), got ${bytes.length}`);
  }
  if (maximumBytes > 0 && bytes.length > maximumBytes) {
    return failMatched('noMatch', `Dump byte count for ${dumpId} is outside the expected range`);
  }

  let checksumStatus = 'none';
  if (checksum) {
    const fromOffset = Number(checksum.fromOffset ?? 0);
    const toOffset = Number(checksum.toOffset ?? bytes.length - 2);
    const byteOffset = Number(checksum.byteOffset ?? bytes.length - 2);
    if (fromOffset < 0 || toOffset >= bytes.length || fromOffset > toOffset || byteOffset < 0 || byteOffset >= bytes.length) {
      return failMatched('partial', 'Dump checksum range is outside message', 'error');
    }
    let expected = 0;
    for (let index = fromOffset; index <= toOffset; index += 1) expected = (expected + bytes[index]) & 0x7f;
    const type = String(checksum.type ?? '');
    if (type === 'roland-7bit') expected = (128 - expected) & 0x7f;
    else if (type !== 'sum-7bit') return failMatched('unsupportedChecksum', `Unsupported dump checksum type: ${type}`, 'error');
    if (bytes[byteOffset] !== expected) {
      return failMatched(
        'checksumFailed',
        `Dump checksum failed; expected ${bytesToHex([expected])} but got ${bytesToHex([bytes[byteOffset]])}`,
        'error'
      );
    }
    checksumStatus = 'ok';
  }

  const mappings = Array.isArray(dump?.mappings) ? dump.mappings : [];
  if (mappings.length === 0) return failMatched('invalidDefinition', `Dump definition has no mappings: ${dumpId}`, checksumStatus);

  const values = {};
  for (const mapping of mappings) {
    const parameterId = String(mapping?.parameter ?? '');
    const parameter = (profile?.parameters ?? []).find((item) => String(item?.id ?? '') === parameterId);
    if (!parameter) return failMatched('invalidDefinition', `Dump mapping references unknown parameter: ${parameterId}`, checksumStatus);

    const decoded = localDecodeDumpParameterValue(
      parameter,
      bytes,
      payloadOffset + Number(mapping?.offset ?? 0),
      mapping?.codec ?? mapping?.nameCodec ?? null
    );
    if (!decoded.ok) {
      const status = String(decoded.error ?? '').startsWith('Unsupported') ? 'unsupportedCodec' : 'partial';
      return failMatched(status, decoded.error, checksumStatus);
    }
    values[parameterId] = decoded.value;
  }

  return {
    ok: true,
    error: '',
    dumpId,
    dumpName,
    checksumStatus,
    values,
    matchStatus: 'ok',
    complete: true,
    expectedMessageCount,
    receivedMessageCount: 1,
    expectedBytes,
    receivedBytes: bytes.length,
    completion,
    diagnostics: [],
    partialFailures: [],
  };
}

function localParseDumpMessage(profile, inputHex = '') {
  const parsed = parseRawMidiHexText(inputHex);
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      values: {},
      checksumStatus: 'none',
      matchStatus: parsed.error.includes('end with F7') ? 'partial' : 'invalidMidiData',
      diagnostics: localDumpDiagnostics(parsed.error.includes('end with F7') ? 'partial' : 'invalidMidiData', parsed.error),
    };
  }

  const bytes = parsed.bytes;
  for (let index = 1; index < bytes.length - 1; index += 1) {
    if (bytes[0] === 0xf0 && (bytes[index] < 0 || bytes[index] > 127)) {
      const error = `SysEx data byte outside 0-127: ${bytesToHex([bytes[index]])}`;
      return { ok: false, error, values: {}, checksumStatus: 'none', matchStatus: 'invalidMidiData', diagnostics: localDumpDiagnostics('invalidMidiData', error) };
    }
  }

  const dumps = Array.isArray(profile?.dumpDefinitions) ? profile.dumpDefinitions : [];
  if (dumps.length === 0) {
    return { ok: false, error: 'Profile has no dump definitions', values: {}, checksumStatus: 'none', matchStatus: 'noDefinitions', diagnostics: localDumpDiagnostics('noDefinitions', 'Profile has no dump definitions') };
  }

  let best = null;
  let bestRank = -1;
  for (const dump of dumps) {
    const parsedDump = localParseDumpWithDefinition(profile, dump, bytes);
    if (parsedDump.ok) return parsedDump;
    const rank = ['checksumFailed', 'unsupportedCodec'].includes(parsedDump.matchStatus)
      ? 4
      : parsedDump.matchStatus === 'partial'
        ? 3
        : parsedDump.dumpId
          ? 2
          : parsedDump.matchStatus === 'noMatch'
            ? 1
            : 0;
    if (rank >= bestRank) {
      best = parsedDump;
      bestRank = rank;
    }
  }
  return best ?? { ok: false, error: 'No dump definition matched message', values: {}, checksumStatus: 'none', matchStatus: 'noMatch', diagnostics: localDumpDiagnostics('noMatch', 'No dump definition matched message') };
}

function rangesForMissingCoverage(expectedBytes = 0, covered = new Set()) {
  const ranges = [];
  let start = -1;
  for (let offset = 0; offset < expectedBytes; offset += 1) {
    const missing = !covered.has(offset);
    if (missing && start < 0) start = offset;
    if ((!missing || offset === expectedBytes - 1) && start >= 0) {
      const end = missing && offset === expectedBytes - 1 ? offset : offset - 1;
      ranges.push({ label: 'missing', start, length: end - start + 1, end });
      start = -1;
    }
  }
  return ranges;
}

function localCollectDumpMessages(profile, hexMessages = []) {
  const values = {};
  const messages = [];
  const receivedRanges = [];
  const duplicateRanges = [];
  const diagnostics = [];
  const covered = new Set();
  let collectionId = '';
  let expectedMessageCount = 0;
  let expectedBytes = 0;
  let parsedMessageCount = 0;
  let failedMessageCount = 0;

  for (const hex of hexMessages) {
    const parsed = localParseDumpMessage(profile, hex);
    messages.push({
      ok: parsed.ok,
      dumpId: parsed.dumpId,
      dumpName: parsed.dumpName,
      matchStatus: parsed.matchStatus,
      complete: parsed.complete,
      expectedBytes: parsed.expectedBytes,
      receivedBytes: parsed.receivedBytes,
      checksumStatus: parsed.checksumStatus,
      error: parsed.error,
    });

    diagnostics.push(...(parsed.diagnostics ?? []));
    if (!parsed.ok) {
      failedMessageCount += 1;
      continue;
    }

    parsedMessageCount += 1;
    const completion = parsed.completion && typeof parsed.completion === 'object' ? parsed.completion : {};
    const parsedCollectionId = String(completion.collectionId ?? '');
    if (!collectionId) collectionId = parsedCollectionId || String(parsed.dumpId ?? '');
    else if (parsedCollectionId && parsedCollectionId !== collectionId) {
      diagnostics.push(...localDumpDiagnostics('mixedCollection', `Dump message belongs to a different collection: ${parsedCollectionId}`, parsed.dumpId));
    }

    expectedMessageCount = Math.max(expectedMessageCount, Number(completion.expectedMessages ?? completion.expectedMessageCount ?? parsed.expectedMessageCount ?? 0));
    const collectionBytes = Number(completion.collectionBytes ?? completion.totalBytes ?? completion.expectedCollectionBytes ?? 0);
    if (collectionBytes > 0) expectedBytes = Math.max(expectedBytes, collectionBytes);
    else if (!expectedBytes) expectedBytes = Math.max(expectedBytes, Number(parsed.expectedBytes ?? 0));

    const addressRange = completion.addressRange ?? completion.range ?? {};
    const start = Number(addressRange.start ?? covered.size);
    const length = Number(addressRange.length ?? parsed.expectedBytes ?? parsed.receivedBytes ?? 0);
    const label = String(addressRange.label ?? parsed.dumpId ?? 'range');
    receivedRanges.push({ label, start, length, end: start + Math.max(0, length) - 1, sourceId: parsed.dumpId });
    for (let offset = start; offset < start + length; offset += 1) {
      if (covered.has(offset)) duplicateRanges.push({ label: 'duplicate', start: offset, length: 1, end: offset, sourceId: parsed.dumpId });
      covered.add(offset);
    }

    Object.assign(values, parsed.values ?? {});
  }

  if (!expectedMessageCount) expectedMessageCount = hexMessages.length;
  const missingRanges = expectedBytes > 0 ? rangesForMissingCoverage(expectedBytes, covered) : [];
  const complete = failedMessageCount === 0 && hexMessages.length >= expectedMessageCount && missingRanges.length === 0;
  const ok = failedMessageCount === 0;
  const status = complete ? 'complete' : ok ? 'partial' : 'error';
  const error = complete ? '' : failedMessageCount > 0 ? `${failedMessageCount} dump message(s) failed` : 'Dump collection incomplete';
  if (!complete) diagnostics.push(...localDumpDiagnostics(status, error, collectionId));

  return {
    ok,
    complete,
    status,
    error,
    collectionId,
    expectedMessageCount,
    receivedMessageCount: hexMessages.length,
    parsedMessageCount,
    failedMessageCount,
    expectedBytes,
    receivedBytes: covered.size,
    values,
    messages,
    receivedRanges,
    missingRanges,
    duplicateRanges,
    diagnostics,
    local: true,
  };
}

function localCompileDeviceRequest(profile, request = {}) {
  const requestId = String(request.request || request.deviceRequestId || localDefaultStartupRequestId(profile)).trim();
  if (!requestId) return { ok: false, error: 'Profile has no startup request.' };

  const deviceRequest = (profile.requests ?? []).find((item) => String(item?.id ?? '') === requestId);
  if (!deviceRequest) return { ok: false, error: `Device request "${requestId}" was not found.` };

  const variables = { channel: 1, deviceId: 16, ...(profile.variables ?? {}), ...(request.variables ?? {}) };
  const bytes = [];
  for (const token of Array.isArray(deviceRequest.template) ? deviceRequest.template : []) {
    const text = String(token ?? '').trim();
    if (text.startsWith('$') || /^[0-9a-f]{1,2}$/i.test(text)) bytes.push(localResolveByteToken(text, variables));
  }

  const kind = String(deviceRequest.kind ?? (bytes[0] === 0xf0 ? 'sysex' : 'raw'));
  const expectedDumpId = String(deviceRequest.response?.dump ?? (String(deviceRequest.response?.kind ?? '') === 'bulkDump' ? deviceRequest.response?.collectionId : undefined) ?? deviceRequest.expectedDump ?? '');
  const continueRequestId = String(deviceRequest.response?.continueRequest ?? deviceRequest.continueRequest ?? '');
  const expectedResponseKind = deviceRequest.response?.identity === true || String(deviceRequest.response?.kind ?? '') === 'identity'
    ? 'identity'
    : 'dump';
  const hex = bytesToHex(bytes);
  return {
    ok: true,
    requestId: request.correlationId ?? `local_sync_${Date.now()}`,
    deviceRole: request.deviceRole ?? 'mainSynth',
    profileId: profile.id,
    deviceRequestId: requestId,
    expectedResponseKind,
    expectedDumpId,
    continueRequestId,
    status: 'Preview',
    pending: false,
    local: true,
    transaction: {
      transactionId: `request_${requestId}`,
      deviceRole: request.deviceRole ?? 'mainSynth',
      parameterId: requestId,
      semanticValue: true,
      displayedValue: deviceRequest.name ?? requestId,
      normalizedValue: 1,
      encodedValueHex: hex,
      checksumStatus: 'none',
      hex,
      messages: [{ kind, hex, bytes }],
      policy: {
        mode: 'request',
        coalesce: false,
        minIntervalMs: Number(deviceRequest.minIntervalMs ?? 0),
        sendFinalOnRelease: true,
        realtimeSafe: false,
      },
    },
    pendingRequests: [],
  };
}

function presetScanSlots(presetBrowser = {}) {
  if (Array.isArray(presetBrowser.slots)) return presetBrowser.slots.map((slot) => Number(slot)).filter(Number.isFinite);
  const start = Number(presetBrowser.startSlot ?? 0);
  const count = Number(presetBrowser.slotCount ?? 0);
  const end = Number(presetBrowser.endSlot ?? (count > 0 ? start + count - 1 : start - 1));
  const slots = [];
  for (let slot = start; slot <= end; slot += 1) slots.push(slot);
  return slots;
}

function localBuildPresetListScan(profile, options = {}) {
  const presetBrowser = profile?.presetBrowser ?? {};
  const request = String(options.request || presetBrowser.request || presetBrowser.nameRequest || '').trim();
  const slotVariable = String(options.slotVariable || presetBrowser.slotVariable || 'slot');
  if (!request) return { ok: false, error: 'Preset browser needs a request id.' };

  const scanSlots = Array.isArray(options.slots)
    ? options.slots.map((slot) => Number(slot)).filter(Number.isFinite)
    : presetScanSlots(presetBrowser);
  if (scanSlots.length === 0) return { ok: false, error: 'Preset browser has no slots to scan.' };

  const entries = scanSlots.map((slot) => {
    const compiled = localCompileDeviceRequest(profile, {
      correlationId: `preset_scan_${slot}`,
      deviceRole: options.deviceRole ?? 'mainSynth',
      profileId: profile.id,
      request,
      variables: { [slotVariable]: slot },
    });
    return {
      slot,
      request,
      requestHex: compiled?.transaction?.hex ?? '',
      ok: compiled.ok === true,
      error: compiled.error ?? '',
      status: compiled.ok === true ? 'ready' : 'error',
    };
  });

  return {
    ok: entries.every((entry) => entry.ok),
    profileId: profile.id,
    deviceRole: options.deviceRole ?? 'mainSynth',
    request,
    total: entries.length,
    pending: 0,
    entries,
    local: true,
  };
}

function validateLocalProfileSource(profileId, source = '') {
  const parsed = parseProfileSourceText(profileId, source);
  if (!parsed.ok) {
    return { profileId, ok: false, error: parsed.error, validation: [{ level: 'error', path: '$', message: parsed.error }] };
  }

  const profile = parsed.profile;
  const validation = [];
  const parameters = Array.isArray(profile.parameters) ? profile.parameters : [];
  const recipes = Array.isArray(profile.messageRecipes) ? profile.messageRecipes : [];
  const tests = Array.isArray(profile.tests) ? profile.tests : [];
  const dumps = Array.isArray(profile.dumpDefinitions) ? profile.dumpDefinitions : [];
  const parameterIds = new Set();
  const recipeIds = new Set();
  const requestIds = new Set((Array.isArray(profile.requests) ? profile.requests : []).map((request) => String(request?.id ?? '')));
  const dumpIds = new Set(dumps.map((dump) => String(dump?.id ?? '')));

  if (!profile.id) validation.push({ level: 'error', path: 'id', message: 'Profile id is required.' });
  if (parameters.length === 0) validation.push({ level: 'error', path: 'parameters', message: 'Add at least one parameter.' });
  if (recipes.length === 0) validation.push({ level: 'error', path: 'messageRecipes', message: 'Add at least one message recipe.' });
  if (tests.length === 0) validation.push({ level: 'warning', path: 'tests', message: 'Add at least one test vector.' });

  for (const [index, parameter] of parameters.entries()) {
    const id = String(parameter?.id ?? '').trim();
    if (!id) validation.push({ level: 'error', path: `parameters.${index}.id`, message: 'Parameter id is required.' });
    else if (parameterIds.has(id)) validation.push({ level: 'error', path: `parameters.${index}.id`, message: `Duplicate parameter id "${id}".` });
    parameterIds.add(id);
  }

  for (const [index, recipe] of recipes.entries()) {
    const id = String(recipe?.id ?? '').trim();
    if (!id) validation.push({ level: 'error', path: `messageRecipes.${index}.id`, message: 'Recipe id is required.' });
    else if (recipeIds.has(id)) validation.push({ level: 'error', path: `messageRecipes.${index}.id`, message: `Duplicate recipe id "${id}".` });
    recipeIds.add(id);
  }

  for (const [index, request] of (Array.isArray(profile.requests) ? profile.requests : []).entries()) {
    const id = String(request?.id ?? '').trim();
    if (!id) validation.push({ level: 'error', path: `requests.${index}.id`, message: 'Device request id is required.' });
    if (!Array.isArray(request?.template) || request.template.length === 0) {
      validation.push({ level: 'error', path: `requests.${index}.template`, message: 'Device request requires a template.' });
    }
    const responseDump = String(request?.response?.dump ?? request?.expectedDump ?? '').trim();
    if (responseDump && !dumpIds.has(responseDump)) {
      validation.push({ level: 'error', path: `requests.${index}.response.dump`, message: `Unknown dump definition "${responseDump}".` });
    }
  }

  for (const [index, step] of (Array.isArray(profile.startup?.sync) ? profile.startup.sync : []).entries()) {
    const request = typeof step === 'string' ? step : String(step?.request ?? '');
    if (request && !requestIds.has(request)) {
      validation.push({ level: 'error', path: `startup.sync.${index}.request`, message: `Unknown startup request "${request}".` });
    }
  }

  const presetRequest = String(profile.presetBrowser?.request ?? profile.presetBrowser?.nameRequest ?? '');
  if (presetRequest && !requestIds.has(presetRequest)) {
    validation.push({ level: 'error', path: 'presetBrowser.request', message: `Unknown preset request "${presetRequest}".` });
  }

  for (const [index, parameter] of parameters.entries()) {
    const recipeId = String(parameter?.messageRecipe ?? '').trim();
    if (recipeId && !recipeIds.has(recipeId)) {
      validation.push({ level: 'error', path: `parameters.${index}.messageRecipe`, message: `Recipe "${recipeId}" does not exist.` });
    }
  }

  for (const [index, dump] of dumps.entries()) {
    const id = String(dump?.id ?? '').trim();
    if (!id) validation.push({ level: 'error', path: `dumpDefinitions.${index}.id`, message: 'Dump definition id is required.' });
    const mappings = Array.isArray(dump?.mappings) ? dump.mappings : [];
    if (mappings.length === 0) {
      validation.push({ level: 'warning', path: `dumpDefinitions.${index}.mappings`, message: 'Dump definition has no mappings.' });
    }
    for (const [mappingIndex, mapping] of mappings.entries()) {
      const parameterId = String(mapping?.parameter ?? '').trim();
      if (!parameterIds.has(parameterId)) {
        validation.push({
          level: 'error',
          path: `dumpDefinitions.${index}.mappings.${mappingIndex}.parameter`,
          message: `Parameter "${parameterId}" does not exist.`,
        });
      }
    }
  }

  for (const [index, test] of tests.entries()) {
    const kind = String(test?.kind ?? 'parameter');
    if (kind === 'request' || kind === 'identityRequest' || kind === 'identityReply' || kind === 'dumpParse') {
      if (!normalizeHex(test?.expectedHex) && (kind === 'request' || kind === 'identityRequest')) {
        validation.push({ level: 'error', path: `tests.${index}.expectedHex`, message: 'Expected hex is required.' });
      }
      if (kind === 'identityReply' && !normalizeHex(test?.inputHex)) {
        validation.push({ level: 'error', path: `tests.${index}.inputHex`, message: 'Identity reply input hex is required.' });
      }
      continue;
    }
    const parameterId = String(test?.parameter ?? '').trim();
    if (!parameterIds.has(parameterId)) validation.push({ level: 'error', path: `tests.${index}.parameter`, message: `Parameter "${parameterId}" does not exist.` });
    if (!normalizeHex(test?.expectedHex)) validation.push({ level: 'error', path: `tests.${index}.expectedHex`, message: 'Expected hex is required.' });
  }

  const ok = validation.every((item) => item.level !== 'error');
  return {
    profileId,
    detectedProfileId: profile.id ?? '',
    ok,
    error: ok ? '' : 'Validation failed',
    validation,
  };
}

function updateLocalProfileStores(profileId, sourceText, profile) {
  profileSources.update((sources) => ({
    ...sources,
    [profileId]: {
      ...(sources?.[profileId] ?? {}),
      profileId,
      source: sourceText,
      localDraft: true,
      native: false,
      fallback: false,
    },
  }));
  deviceProfiles.update((profiles) => [
    ...profiles.filter((item) => String(item?.id ?? '') !== profileId),
    {
      id: profileId,
      name: profile.name || profileId,
      manufacturer: profile.manufacturer || '',
      family: profile.family || '',
      status: profile.status || 'draft',
      trust: profile.trust || 'local',
      localDraft: true,
    },
  ]);
  profileParameters.update((profiles) => ({
    ...profiles,
    [profileId]: Array.isArray(profile.parameters) ? profile.parameters : [],
  }));
  profileParameterPages.update((pages) => ({
    ...pages,
    [profileId]: {
      profileId,
      loaded: Array.isArray(profile.parameters) ? profile.parameters.length : 0,
      total: Array.isArray(profile.parameters) ? profile.parameters.length : 0,
      hasMore: false,
    },
  }));
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

function normalizeSyncDirection(value) {
  const direction = String(value ?? '').trim().toLowerCase();
  return ['pull', 'push', 'live'].includes(direction) ? direction : 'pull';
}

function normalizeRoleMappingForStore(mapping, role = 'mainSynth') {
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
    normalizedMappings.mainSynth = normalizeRoleMappingForStore(fallbackSession?.mainSynth, 'mainSynth');
  }

  return normalizedMappings;
}

function sessionSnapshotForMappings(session = {}, roleMappings = {}) {
  const mainSynth = roleMappings.mainSynth ?? normalizeRoleMappingForStore(null, 'mainSynth');
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
      entry = { muid: payload.muid ?? null, deviceRole: payload.deviceRole ?? 'mainSynth', profile, summary };
    } catch (err) {
      entry = { muid: payload.muid ?? null, deviceRole: payload.deviceRole ?? 'mainSynth', error: String(err?.message ?? err) };
    }
    discoveredMidiCiProfiles.update((list) => [...list.filter((e) => e.muid !== entry.muid), entry]);
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
    latestMidiInputMessage.set(payload ?? null);
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

    if (payload.role === 'mainSynth') {
      selectedDeviceProfileId.set(mapping.profileId);
      selectedMidiDestinationId.set(destinationId(mapping.midiDestination));
      selectedMidiInputId.set(inputId(mapping.midiInput));
      selectedSyncDirection.set(mapping.syncDirection);
    }
    const snapshot = mergeProjectDeviceRoleMapping(mapping, payload.role === 'mainSynth'
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
        ?? payload?.runtimeState?.[payload.deviceRole ?? 'mainSynth']?.[payload.parameterId];
      rememberOutboundEcho(payload.deviceRole ?? 'mainSynth', payload.parameterId, value, {
        requestId: payload?.requestId,
        echoWindowMs: 250,
      });
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
        markRuntimeOrigin(payload.deviceRole ?? 'mainSynth', parameterId, 'device', {
          requestId: payload?.requestId,
          dumpId: payload?.dumpId ?? '',
        });
        recordRuntimeConflict(payload.deviceRole ?? 'mainSynth', parameterId, value, {
          source: 'dump',
          requestId: payload?.requestId,
          dumpId: payload?.dumpId ?? '',
        });
        if (shouldSuppressEcho(payload.deviceRole ?? 'mainSynth', parameterId, value)) continue;
        queueDeviceParameterPanelPreviewSync(payload.deviceRole ?? 'mainSynth', parameterId, value);
      }
    }
  });

  onDumpCollectionUpdated((payload) => {
    latestDumpCollectionResult.set(payload ?? null);
    if (payload?.values && typeof payload.values === 'object') {
      for (const [parameterId, value] of Object.entries(payload.values)) {
        markRuntimeOrigin(payload.deviceRole ?? 'mainSynth', parameterId, 'deviceCollection', {
          requestId: payload?.requestId,
          collectionId: payload?.collectionId ?? '',
        });
        recordRuntimeConflict(payload.deviceRole ?? 'mainSynth', parameterId, value, {
          source: 'dumpCollection',
          requestId: payload?.requestId,
          collectionId: payload?.collectionId ?? '',
        });
        if (shouldSuppressEcho(payload.deviceRole ?? 'mainSynth', parameterId, value)) continue;
        queueDeviceParameterPanelPreviewSync(payload.deviceRole ?? 'mainSynth', parameterId, value);
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

export function importDeviceProfile() {
  initDeviceProfileBridge();
  requestDeviceProfileImport();
}

export function overrideDeviceIdentityMismatch({
  deviceRole = 'mainSynth',
  profileId = '',
  reason = 'User accepted identity mismatch',
} = {}) {
  initDeviceProfileBridge();
  const role = String(deviceRole || 'mainSynth');
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

export function clearDeviceRuntimeConflict(deviceRole = 'mainSynth', parameterId = '') {
  clearRuntimeConflict(deviceRole, parameterId);
}

export function recordDeviceRuntimeConflictForTest(deviceRole, parameterId, panelValue, deviceValue) {
  rememberOutboundEcho(deviceRole, parameterId, panelValue, {
    requestId: 'test_conflict',
    echoWindowMs: 1000,
  });
  return recordRuntimeConflict(deviceRole, parameterId, deviceValue, { source: 'test' });
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
  if (!isJuceAvailable()) {
    latestProfileSourceValidation.set(validateLocalProfileSource(profileId, source));
    return;
  }
  validateDeviceProfileSource({
    requestId: `profile_validate_${profileId}`,
    profileId,
    source,
  });
}

export function saveProfileSource(profileId, source) {
  initDeviceProfileBridge();
  latestProfileSourceSave.set({ profileId, running: true });
  if (!isJuceAvailable()) {
    const parsed = parseProfileSourceText(profileId, source);
    if (!parsed.ok) {
      latestProfileSourceSave.set({ profileId, ok: false, error: parsed.error });
      return;
    }
    const sourceText = JSON.stringify(parsed.profile, null, 2);
    updateLocalProfileStores(profileId, sourceText, parsed.profile);
    latestProfileSourceSave.set({ profileId, ok: true, source: sourceText, localDraft: true });
    return;
  }
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
    midiInput: options.midiInput ?? get(deviceRoleMappings)?.[role]?.midiInput ?? fallbackMidiInput(),
    syncDirection: normalizeSyncDirection(options.syncDirection ?? get(deviceRoleMappings)?.[role]?.syncDirection ?? get(selectedSyncDirection)),
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
    selectedMidiInputId.set(inputId(payload.midiInput));
    selectedSyncDirection.set(payload.syncDirection);
  }
  persistDeviceSession(payload);
  setDeviceRoleMapping(payload);
  getDeviceDiagnostics();
}

export function previewParameterMessage({ requestId, deviceRole = 'mainSynth', profileId = '', parameterId, value, source = '' }) {
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

export function startDeviceSync({
  correlationId = `sync_${Date.now()}`,
  deviceRole = 'mainSynth',
  profileId = '',
  syncDirection = '',
  request = '',
  variables = {},
  values,
  source = '',
  dryRun = false,
} = {}) {
  initDeviceProfileBridge();
  const role = String(deviceRole || 'mainSynth');
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

export function startPresetListScan({
  scanId = `preset_scan_${Date.now()}`,
  deviceRole = 'mainSynth',
  profileId = '',
  request = '',
  slotVariable = '',
  slots,
  variables = {},
  source = '',
  dryRun = true,
} = {}) {
  initDeviceProfileBridge();
  const role = String(deviceRole || 'mainSynth');
  const resolvedProfileId = String(profileId || get(deviceRoleMappings)?.[role]?.profileId || '');
  latestPresetListScan.set({ scanId, profileId: resolvedProfileId, deviceRole: role, running: true, entries: [] });

  const useLocal = localProfileMode(resolvedProfileId, source);
  if (useLocal) {
    const parsed = parseProfileSourceText(resolvedProfileId, source);
    if (!parsed.ok) {
      latestPresetListScan.set({ scanId, profileId: resolvedProfileId, deviceRole: role, ok: false, error: parsed.error, entries: [] });
      return;
    }
    latestPresetListScan.set({
      scanId,
      ...localBuildPresetListScan(parsed.profile, { deviceRole: role, request, slotVariable, slots }),
    });
    return;
  }

  const payload = {
    scanId,
    deviceRole: role,
    profileId: resolvedProfileId,
    dryRun,
  };
  if (request) payload.request = request;
  if (slotVariable) payload.slotVariable = slotVariable;
  if (Array.isArray(slots)) payload.slots = slots;
  if (variables && Object.keys(variables).length > 0) payload.variables = variables;
  requestPresetListScan(payload);
}

export function cancelPresetListScan({ scanId = '' } = {}) {
  initDeviceProfileBridge();
  const current = get(latestPresetListScan);
  const resolvedScanId = String(scanId || current?.scanId || '');
  if (isJuceAvailable() && !current?.local) {
    requestPresetListScanCancel({ scanId: resolvedScanId });
    return;
  }

  if (!current) return;
  latestPresetListScan.set({
    ...current,
    scanId: resolvedScanId,
    status: 'cancelled',
    running: false,
    cancelled: true,
    entries: (current.entries ?? []).map((entry) => (
      ['queued', 'waiting', 'running'].includes(entry?.status)
        ? { ...entry, status: 'cancelled' }
        : entry
    )),
  });
}

export function startBulkDumpSend({
  bulkSendId = `bulk_send_${Date.now()}`,
  deviceRole = 'mainSynth',
  profileId = '',
  hex = '',
  message = '',
  dataHex = '',
  label = 'Bulk dump send',
  chunkSizeBytes,
  bulkChunkBytes,
  chunkBytes,
  chunkDelayMs,
  bulkChunkDelayMs,
  expectedCollectionId = '',
  verifyCollectionId = '',
  expectedDumpId = '',
  ackHex = '',
  nakHex = '',
  ackPolicy = null,
  retries = 0,
  source = '',
  dryRun = true,
} = {}) {
  initDeviceProfileBridge();
  const role = String(deviceRole || 'mainSynth');
  const resolvedProfileId = String(profileId || get(deviceRoleMappings)?.[role]?.profileId || '');
  const payload = {
    bulkSendId,
    deviceRole: role,
    profileId: resolvedProfileId,
    hex: hex || message || dataHex,
    label,
    dryRun,
  };
  if (expectedCollectionId || verifyCollectionId || expectedDumpId) payload.expectedCollectionId = expectedCollectionId || verifyCollectionId || expectedDumpId;
  if (ackHex) payload.ackHex = ackHex;
  if (nakHex) payload.nakHex = nakHex;
  if (ackPolicy) payload.ackPolicy = ackPolicy;
  if (retries != null) payload.retries = retries;
  if (chunkSizeBytes != null) payload.chunkSizeBytes = chunkSizeBytes;
  if (bulkChunkBytes != null) payload.bulkChunkBytes = bulkChunkBytes;
  if (chunkBytes != null) payload.chunkBytes = chunkBytes;
  if (chunkDelayMs != null) payload.chunkDelayMs = chunkDelayMs;
  if (bulkChunkDelayMs != null) payload.bulkChunkDelayMs = bulkChunkDelayMs;

  latestBulkDumpSend.set({
    ...payload,
    profileId: resolvedProfileId,
    status: dryRun ? 'previewing' : 'running',
    running: !dryRun,
  });

  if (isJuceAvailable() && !source) {
    requestBulkDumpSend(payload);
    return;
  }

  const local = localBuildBulkDumpSend({
    ...payload,
    source,
  });
  latestBulkDumpSend.set(local);
  if (local.bulkSendId) {
    bulkDumpSends.update((jobs) => [
      ...jobs.filter((job) => job?.bulkSendId !== local.bulkSendId),
      local,
    ]);
  }
}

export function cancelBulkDumpSend({ bulkSendId = '' } = {}) {
  initDeviceProfileBridge();
  const current = get(latestBulkDumpSend);
  const resolvedBulkSendId = String(bulkSendId || current?.bulkSendId || '');
  if (isJuceAvailable() && !current?.local) {
    requestBulkDumpSendCancel({ bulkSendId: resolvedBulkSendId });
    return;
  }

  if (!current) return;
  const cancelled = {
    ...current,
    bulkSendId: resolvedBulkSendId,
    status: 'cancelled',
    running: false,
    cancelled: true,
    chunks: (current.chunks ?? []).map((chunk) => (
      ['queued', 'running', 'preview'].includes(chunk?.status)
        ? { ...chunk, status: 'cancelled' }
        : chunk
    )),
  };
  latestBulkDumpSend.set(cancelled);
  bulkDumpSends.update((jobs) => [
    ...jobs.filter((job) => job?.bulkSendId !== resolvedBulkSendId),
    cancelled,
  ]);
}

export function parseProfileDump({ requestId, deviceRole = 'mainSynth', profileId = '', hex, source = '' }) {
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
  deviceRole = 'mainSynth',
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

export function runTestsForProfile(profileId, options = {}) {
  initDeviceProfileBridge();
  latestProfileTestResult.set({ profileId, running: true });
  const source = options?.source ?? '';
  if (localProfileMode(profileId, source)) {
    const parsed = parseProfileSourceText(profileId, source);
    if (!parsed.ok) {
      latestProfileTestResult.set({ profileId, ok: false, error: parsed.error, total: 0, passed: 0, results: [] });
      return;
    }
    const tests = Array.isArray(parsed.profile.tests) ? parsed.profile.tests : [];
    const results = tests.map((test) => {
      const kind = String(test?.kind ?? '');
      if (kind === 'identityRequest') {
        const compiled = localCompileIdentityRequest(parsed.profile, {
          deviceRole: options?.deviceRole ?? 'mainSynth',
          profileId,
        });
        const expectedHex = normalizeHex(test?.expectedHex);
        const actualHex = normalizeHex(compiled?.transaction?.hex ?? '');
        const passed = compiled.ok === true && actualHex === expectedHex;
        return {
          name: test?.name || 'Identity Request',
          kind: 'identityRequest',
          expectedHex,
          actualHex,
          passed,
          error: compiled.ok === true ? (passed ? '' : `Expected ${expectedHex} but got ${actualHex}`) : compiled.error,
        };
      }

      if (kind === 'identityReply') {
        const matched = localMatchIdentityReply(parsed.profile, test?.inputHex);
        const expected = test?.expectedValues && typeof test.expectedValues === 'object' ? test.expectedValues : {};
        const failedKey = Object.entries(expected).find(([key, value]) => String(matched.values?.[key] ?? '') !== String(value ?? ''));
        const passed = matched.ok === true && !failedKey;
        return {
          name: test?.name || 'Identity Reply',
          kind: 'identityReply',
          expectedValues: expected,
          actualValues: matched.values,
          passed,
          error: matched.ok === true
            ? (passed ? '' : `Expected ${failedKey?.[0]} = ${failedKey?.[1]} but got ${matched.values?.[failedKey?.[0]] ?? ''}`)
            : matched.error,
        };
      }

      if (kind === 'request') {
        const compiled = localCompileDeviceRequest(parsed.profile, {
          request: test?.request,
          variables: test?.variables ?? {},
          deviceRole: options?.deviceRole ?? 'mainSynth',
          profileId,
        });
        const expectedHex = normalizeHex(test?.expectedHex);
        const actualHex = normalizeHex(compiled?.transaction?.hex ?? compiled?.hex ?? '');
        const passed = compiled.ok === true && actualHex === expectedHex;
        return {
          name: test?.name || test?.request || 'Request Test',
          kind: 'request',
          request: test?.request ?? '',
          expectedHex,
          actualHex,
          passed,
          error: compiled.ok === true ? (passed ? '' : `Expected ${expectedHex} but got ${actualHex}`) : compiled.error,
        };
      }

      if (kind === 'dumpParse') {
        const matched = localParseDumpMessage(parsed.profile, test?.inputHex);
        const expected = test?.expectedValues && typeof test.expectedValues === 'object' ? test.expectedValues : {};
        const failedKey = Object.entries(expected).find(([key, value]) => String(matched.values?.[key] ?? '') !== String(value ?? ''));
        const passed = matched.ok === true && !failedKey;
        return {
          name: test?.name || 'Dump Parse',
          kind: 'dumpParse',
          expectedValues: expected,
          actualValues: matched.values,
          matchStatus: matched.matchStatus,
          checksumStatus: matched.checksumStatus,
          expectedBytes: matched.expectedBytes,
          receivedBytes: matched.receivedBytes,
          passed,
          error: matched.ok === true
            ? (passed ? '' : `Expected ${failedKey?.[0]} = ${failedKey?.[1]} but got ${matched.values?.[failedKey?.[0]] ?? ''}`)
            : matched.error,
        };
      }

      const compiled = localCompileParameter(parsed.profile, {
        requestId: `profile_test_${profileId}_${test?.name ?? 'test'}`,
        deviceRole: options?.deviceRole ?? 'mainSynth',
        profileId,
        parameterId: test?.parameter,
        value: test?.value,
      });
      const expectedHex = normalizeHex(test?.expectedHex);
      const actualHex = normalizeHex(compiled?.transaction?.hex ?? compiled?.hex ?? '');
      const passed = compiled.ok === true && actualHex === expectedHex;
      return {
        name: test?.name || test?.parameter || 'Test',
        parameter: test?.parameter ?? '',
        expectedHex,
        actualHex,
        passed,
        error: compiled.ok === true ? (passed ? '' : `Expected ${expectedHex} but got ${actualHex}`) : compiled.error,
      };
    });
    latestProfileTestResult.set({
      profileId,
      ok: results.every((result) => result.passed),
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      results,
      local: true,
    });
    return;
  }
  runDeviceProfileTests({ profileId });
}
