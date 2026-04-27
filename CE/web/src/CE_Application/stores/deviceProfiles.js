import { writable, get } from 'svelte/store';
import {
  compileParameterMessage,
  getDeviceDiagnostics,
  getDeviceRuntimeState,
  getMidiMonitorEvents,
  importDeviceProfile as requestDeviceProfileImport,
  listDeviceProfiles,
  listMidiDestinations,
  listProfileParameters,
  onDeviceParameterSet,
  onDeviceDiagnostics,
  onDeviceProfileImported,
  onDeviceProfileTestsFinished,
  onDeviceProfilesListed,
  onDeviceRoleMappingSet,
  onDeviceRuntimeState,
  onMidiDestinationsListed,
  onMidiMonitorEvents,
  onMidiPreview,
  onProfileParametersListed,
  runDeviceProfileTests,
  setDeviceParameter,
  setDeviceRoleMapping,
} from '../bridge/bridge.js';

export const deviceProfiles = writable([]);
export const midiDestinations = writable([]);
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

let initialized = false;

export function initDeviceProfileBridge() {
  if (initialized) return;
  initialized = true;

  onDeviceProfilesListed((payload) => {
    deviceProfiles.set(Array.isArray(payload?.profiles) ? payload.profiles : []);
  });

  onDeviceProfileImported((payload) => {
    latestProfileImport.set(payload);
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
      },
    }));
  });

  onProfileParametersListed((payload) => {
    if (payload?.ok !== true || !payload?.profileId) return;
    profileParameters.update((profiles) => ({
      ...profiles,
      [payload.profileId]: Array.isArray(payload.parameters) ? payload.parameters : [],
    }));
  });

  onMidiPreview((payload) => {
    latestMidiPreview.set(payload);
  });

  onDeviceParameterSet((payload) => {
    latestMidiPreview.set(payload);
    if (payload?.runtimeState) {
      deviceRuntimeState.set(payload.runtimeState);
    }
  });

  onDeviceRuntimeState((payload) => {
    deviceRuntimeState.set(payload ?? {});
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
}

export function refreshProfileParameters(profileId, deviceRole = 'mainSynth') {
  initDeviceProfileBridge();
  listProfileParameters({ profileId, deviceRole });
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

export function mapDeviceRole(role, profileId, options = {}) {
  initDeviceProfileBridge();
  const payload = {
    role,
    profileId,
    midiDestination: options.midiDestination ?? get(deviceRoleMappings)?.[role]?.midiDestination,
    variables: options.variables ?? {},
    timingOverrides: options.timingOverrides ?? {},
  };

  deviceRoleMappings.update((mappings) => ({
    ...mappings,
    [role]: payload,
  }));

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
  setDeviceParameter({
    requestId,
    deviceRole,
    profileId,
    parameterId,
    value,
    interactionPhase,
    dryRun,
  });
  getDeviceDiagnostics();
}

export function runTestsForProfile(profileId) {
  initDeviceProfileBridge();
  runDeviceProfileTests({ profileId });
}
