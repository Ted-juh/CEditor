// Device profile catalog: local draft creation, profile import, source editing/saving,
// validation and per-profile test runs (native via the bridge, or locally via the engine).
import { get } from 'svelte/store';
import {
  importDeviceProfile as requestDeviceProfileImport,
  runDeviceProfileTests,
  saveProfileParameterDetail as saveParameterDetail,
  saveDeviceProfileSource,
  validateDeviceProfileSource,
  isJuceAvailable,
} from '../bridge/bridge.js';
import {
  deviceProfiles,
  selectedDeviceProfileId,
  latestProfileTestResult,
  profileParameters,
  profileParameterPages,
  profileSources,
  latestProfileSourceValidation,
  latestProfileSourceSave,
} from './deviceProfileStores.js';
import {
  localCompileDeviceRequest,
  localCompileIdentityRequest,
  localCompileParameter,
  localMatchIdentityReply,
  localParseDumpMessage,
  localProfileMode,
  normalizeHex,
  parseProfileSourceText,
  validateLocalProfileSource,
} from './deviceProfileLocalEngine.js';
import { initDeviceProfileBridge } from './deviceProfileSession.js';
import { DEFAULT_DEVICE_ROLE } from './deviceConstants.js';

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

export function saveProfileParameter(profileId, parameterId, parameter, deviceRole = DEFAULT_DEVICE_ROLE) {
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

export function importDeviceProfile() {
  initDeviceProfileBridge();
  requestDeviceProfileImport();
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
    // Save drafts even when incomplete, but run the full schema/reference validation and surface
    // the findings — previously only JSON syntax was checked, so a profile with dangling recipe
    // or request references saved silently and failed later with cryptic MIDI errors.
    const validated = validateLocalProfileSource(profileId, sourceText);
    latestProfileSourceValidation.set(validated);
    latestProfileSourceSave.set({
      profileId,
      ok: true,
      source: sourceText,
      localDraft: true,
      validationOk: validated.ok !== false,
      validation: validated.validation ?? [],
    });
    return;
  }
  saveDeviceProfileSource({
    requestId: `profile_save_${profileId}`,
    profileId,
    source,
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
          deviceRole: options?.deviceRole ?? DEFAULT_DEVICE_ROLE,
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
          deviceRole: options?.deviceRole ?? DEFAULT_DEVICE_ROLE,
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
        deviceRole: options?.deviceRole ?? DEFAULT_DEVICE_ROLE,
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
