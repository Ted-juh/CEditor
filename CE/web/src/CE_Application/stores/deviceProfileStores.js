// Shared writable stores for the device-profile domain. This is the lowest layer of the
// deviceProfiles module family — it owns state only, so every sibling module can import it
// without creating cycles. Consumers should keep importing from deviceProfiles.js (the facade).
import { writable } from 'svelte/store';
import { DEFAULT_DEVICE_ROLE } from './deviceConstants.js';
import {
  requestMidiCiDiscovery as requestMidiCiDiscoveryBridge,
  setMidiCiProfile as setMidiCiProfileBridge,
} from '../bridge/bridge.js';

export const deviceProfiles = writable([]);
export const midiDestinations = writable([{ type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' }]);
export const midiInputs = writable([{ type: 'none', id: 'none', name: 'No MIDI Input' }]);
// Profiles drafted live from MIDI-CI discovery: [{ muid, profile, summary }] (MIDI 2.0 plan, phase M1).
export const discoveredMidiCiProfiles = writable([]);
// Discovery lifecycle for the UI: { state: 'idle'|'scanning'|'done'|'error', message }.
export const midiCiStatus = writable({ state: 'idle', message: '' });

// Broadcast a MIDI-CI Discovery on the role's hardware output; results arrive via the midiCiDiscovered
// bridge event and are converted to draft profiles in discoveredMidiCiProfiles. Needs MIDI-CI hardware.
export function requestMidiCiDiscovery(deviceRole = DEFAULT_DEVICE_ROLE) {
  discoveredMidiCiProfiles.set([]);
  midiCiStatus.set({ state: 'scanning', message: 'Broadcasting MIDI-CI Discovery…' });
  requestMidiCiDiscoveryBridge(deviceRole);
}

// Enable/disable a MIDI-CI profile on a discovered device (MIDI 2.0 plan, phase M2). The device's
// report comes back via a re-emitted midiCiDiscovered, refreshing the entry's profiles.
export function setMidiCiProfile(muid, profileId, enabled) {
  setMidiCiProfileBridge(muid, profileId, enabled);
}
export const selectedDeviceProfileId = writable('test-cc-synth');
export const selectedMidiDestinationId = writable('previewOnly');
export const selectedMidiInputId = writable('none');
export const selectedSyncDirection = writable('pull');
export const deviceRoleMappings = writable({
  mainSynth: {
    role: DEFAULT_DEVICE_ROLE,
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
