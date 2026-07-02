import { get, writable } from 'svelte/store';
import { normalizeDeviceSession } from './appSettingsSchema.js';
import { DEFAULT_DEVICE_ROLE } from './deviceConstants.js';

export const PROJECT_DEVICE_SESSION_SCHEMA_VERSION = 1;
const pendingRestoreRequests = [];
let restoreHandler = null;

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasEntries(value) {
  return Object.keys(objectOrEmpty(value)).length > 0;
}

function compactRoleMapping(mapping, role) {
  const next = {
    role: String(mapping?.role ?? role),
    profileId: String(mapping?.profileId ?? ''),
    midiDestination: { ...(mapping?.midiDestination ?? {}) },
    midiInput: { ...(mapping?.midiInput ?? {}) },
    syncDirection: String(mapping?.syncDirection ?? 'pull'),
  };

  if (hasEntries(mapping?.variables)) {
    next.variables = { ...mapping.variables };
  }

  if (hasEntries(mapping?.timingOverrides)) {
    next.timingOverrides = { ...mapping.timingOverrides };
  }

  return next;
}

export function createProjectDeviceSessionSnapshot(session = {}) {
  const normalized = normalizeDeviceSession(session);
  const roleMappings = {};

  for (const [role, mapping] of Object.entries(normalized.roleMappings ?? {})) {
    roleMappings[role] = compactRoleMapping(mapping, role);
  }

  return {
    schemaVersion: PROJECT_DEVICE_SESSION_SCHEMA_VERSION,
    selectedProfileId: normalized.selectedProfileId,
    selectedDestinationId: normalized.selectedDestinationId,
    selectedInputId: normalized.selectedInputId,
    selectedSyncDirection: normalized.selectedSyncDirection,
    roleMappings,
  };
}

export function normalizeProjectDeviceSession(session = {}) {
  return createProjectDeviceSessionSnapshot(session);
}

export const projectDeviceSession = writable(createProjectDeviceSessionSnapshot());

export function setProjectDeviceSession(session = {}) {
  const snapshot = createProjectDeviceSessionSnapshot(session);
  projectDeviceSession.set(snapshot);
  return snapshot;
}

export function mergeProjectDeviceRoleMapping(mapping, overrides = {}) {
  const current = get(projectDeviceSession);
  const role = String(mapping?.role ?? DEFAULT_DEVICE_ROLE);
  const snapshot = createProjectDeviceSessionSnapshot({
    ...current,
    ...overrides,
    roleMappings: {
      ...(current.roleMappings ?? {}),
      ...(overrides.roleMappings ?? {}),
      [role]: mapping,
    },
  });

  projectDeviceSession.set(snapshot);
  return snapshot;
}

export function getProjectDeviceSessionSnapshot(overrides = {}) {
  const current = get(projectDeviceSession);
  return createProjectDeviceSessionSnapshot({
    ...current,
    ...overrides,
    roleMappings: {
      ...(current.roleMappings ?? {}),
      ...(overrides.roleMappings ?? {}),
    },
  });
}

export function registerProjectDeviceSessionRestoreHandler(handler) {
  restoreHandler = typeof handler === 'function' ? handler : null;

  if (restoreHandler) {
    while (pendingRestoreRequests.length > 0) {
      const request = pendingRestoreRequests.shift();
      restoreHandler(request.session, request.options);
    }
  }

  return () => {
    if (restoreHandler === handler) restoreHandler = null;
  };
}

export function requestProjectDeviceSessionRestore(session = {}, options = {}) {
  const snapshot = setProjectDeviceSession(session);
  if (restoreHandler) {
    return restoreHandler(snapshot, options);
  }

  pendingRestoreRequests.push({ session: snapshot, options });
  return {
    ok: true,
    pending: true,
    source: options.source ?? 'project',
    label: options.label ?? '',
    deviceSession: snapshot,
    diagnostics: projectDeviceSessionDiagnostics(snapshot),
  };
}

function catalogMatchesPort(catalog, port) {
  const entries = Array.isArray(catalog) ? catalog : [];
  if (entries.length === 0) return true;

  const id = String(port?.id ?? '').trim();
  const name = String(port?.name ?? '').trim().toLowerCase();
  const type = String(port?.type ?? '').trim();

  return entries.some((entry) => {
    const entryId = String(entry?.id ?? '').trim();
    const entryName = String(entry?.name ?? '').trim().toLowerCase();
    const entryType = String(entry?.type ?? '').trim();
    return (id && entryId === id)
      || (name && entryName === name)
      || (type && id && entryType === type && entryId === id);
  });
}

function profileExists(catalog, profileId) {
  const entries = Array.isArray(catalog) ? catalog : [];
  if (entries.length === 0) return true;
  const id = String(profileId ?? '').trim();
  return entries.some((entry) => String(entry?.id ?? '').trim() === id);
}

export function projectDeviceSessionDiagnostics(session = {}, catalog = {}) {
  const snapshot = createProjectDeviceSessionSnapshot(session);
  const issues = [];

  for (const [role, mapping] of Object.entries(snapshot.roleMappings ?? {})) {
    const profileId = String(mapping?.profileId ?? '').trim();
    if (!profileId) {
      issues.push({
        level: 'error',
        code: 'missing-profile-id',
        source: role,
        message: 'Project device role is missing a profile id.',
        action: 'Select profile',
      });
    } else if (!profileExists(catalog.profiles, profileId)) {
      issues.push({
        level: 'error',
        code: 'missing-profile',
        source: role,
        message: `Project requires missing profile: ${profileId}`,
        action: 'Import profile',
      });
    }

    const destination = mapping?.midiDestination ?? {};
    if (destination.type !== 'previewOnly' && !catalogMatchesPort(catalog.midiDestinations, destination)) {
      issues.push({
        level: 'warning',
        code: 'missing-midi-destination',
        source: role,
        message: `Project MIDI output is not available: ${destination.name || destination.id || 'unknown output'}.`,
        action: 'Select output',
      });
    }

    const input = mapping?.midiInput ?? {};
    if (input.type !== 'none' && !catalogMatchesPort(catalog.midiInputs, input)) {
      issues.push({
        level: 'warning',
        code: 'missing-midi-input',
        source: role,
        message: `Project MIDI input is not available: ${input.name || input.id || 'unknown input'}.`,
        action: 'Select input',
      });
    }
  }

  return {
    ok: issues.length === 0,
    schemaVersion: snapshot.schemaVersion,
    issues,
  };
}
