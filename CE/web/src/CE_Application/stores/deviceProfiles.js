// Device profiles — public import surface (facade).
//
// The implementation is split into focused modules; this file re-exports the exact same API
// it always had, so consumers keep importing from './deviceProfiles.js':
//   deviceProfileStores.js      — all writable stores + MIDI-CI discovery entry points
//   deviceProfileLocalEngine.js — local compile/parse/validate engine (JUCE-less fallback)
//   deviceMidiRuntime.js        — echo suppression, runtime origins/conflicts, send queue
//   deviceProfileSession.js     — bridge listener wiring, session persistence, role mapping
//   deviceProfileCatalog.js     — profile drafts, import, source save/validate, test runs
//   deviceMidiOps.js            — parameter preview/commit, device sync, dump parse/collect
//   devicePresetJobs.js         — preset list scans and bulk dump send jobs

export {
  deviceProfiles,
  midiDestinations,
  midiInputs,
  discoveredMidiCiProfiles,
  midiCiStatus,
  requestMidiCiDiscovery,
  setMidiCiProfile,
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
  deviceRuntimeOrigins,
  deviceRuntimeConflicts,
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

export {
  clearDeviceRuntimeConflict,
  recordDeviceRuntimeConflictForTest,
} from './deviceMidiRuntime.js';

export {
  initDeviceProfileBridge,
  refreshProfileParameters,
  requestProfileParameterDetail,
  refreshDeviceProfiles,
  createCurrentDeviceSessionSnapshot,
  restoreProjectDeviceSession,
  requestProfileSource,
  mapDeviceRole,
  forgetDeviceRole,
} from './deviceProfileSession.js';

export {
  createDeviceProfileDraft,
  saveProfileParameter,
  importDeviceProfile,
  validateProfileSource,
  saveProfileSource,
  runTestsForProfile,
} from './deviceProfileCatalog.js';

export {
  overrideDeviceIdentityMismatch,
  previewParameterMessage,
  commitDeviceParameter,
  startDeviceSync,
  parseProfileDump,
  collectProfileDumps,
} from './deviceMidiOps.js';

export {
  startPresetListScan,
  cancelPresetListScan,
  startBulkDumpSend,
  cancelBulkDumpSend,
} from './devicePresetJobs.js';
