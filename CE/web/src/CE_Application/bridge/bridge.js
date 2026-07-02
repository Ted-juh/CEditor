/**
 * Bridge between Svelte and C++ JUCE backend via window.__JUCE__
 *
 * C++ registers event listeners for: setProperty, requestFullState, undo, redo
 * C++ emits events: fullState, propUpdate
 */
import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';

/** Check if we're running inside a JUCE WebView with native integration */
export function isJuceAvailable() {
  return typeof window !== 'undefined' &&
         window.__JUCE__ &&
         window.__JUCE__.backend;
}

let nextSetPropertyRequestId = 1;
let setPropertyRejectionListenerInstalled = false;

// C++ validates every setProperty path and emits 'setPropertyRejected' when a write did NOT land
// (malformed or non-existent path). Without this, JS would keep local state the C++ tree never
// accepted — surface the failure and pull the authoritative state back to resync.
function ensureSetPropertyRejectionListener() {
  if (setPropertyRejectionListenerInstalled) return;
  setPropertyRejectionListenerInstalled = true;
  window.__JUCE__.backend.addEventListener('setPropertyRejected', (payload) => {
    console.error(
      `[bridge] setProperty #${payload?.requestId ?? '?'} rejected: ${payload?.message ?? 'unknown error'}`
    );
    requestFullState();
  });
}

/** Send a property change to C++ */
export function setProperty(path, value) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — setProperty ignored:', path, value);
    return;
  }
  ensureSetPropertyRejectionListener();
  window.__JUCE__.backend.emitEvent('setProperty', { path, value, requestId: nextSetPropertyRequestId++ });
}

/** Request the full ValueTree state from C++ */
export function requestFullState() {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — requestFullState ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('requestFullState', {});
}

/** Trigger undo on the C++ UndoManager */
export function undo() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('undo', {});
}

/** Trigger redo on the C++ UndoManager */
export function redo() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('redo', {});
}

/** Request the C++ application to close */
export function closeApplication() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('closeApplication', {});
}


/**
 * Listen for a full state push from C++.
 * Returns a removal function.
 */
export function onFullState(callback) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — onFullState listener not registered');
    return () => {};
  }
  const token = window.__JUCE__.backend.addEventListener('fullState', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/**
 * Listen for individual property updates from C++.
 * Callback receives { path: string, value: any }
 * Returns a removal function.
 */
export function onPropUpdate(callback) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — onPropUpdate listener not registered');
    return () => {};
  }
  const token = window.__JUCE__.backend.addEventListener('propUpdate', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

// --- Panel file operations ---

/** Request a "Save As" dialog for a panel. C++ will emit 'panelSaved' on success. */
export function savePanelAs(panelId, data) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — savePanelAs ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('savePanelAs', { panelId: String(panelId), data });
}

/** Save a panel to its existing file path. C++ will emit 'panelSaved' on success. */
export function savePanel(panelId, filePath, data) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — savePanel ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('savePanel', { panelId: String(panelId), filePath, data });
}

/**
 * Build a VST3 from the given panel document. C++ writes the JSON to a temp .cepanel, then runs
 * tools/scripts/export-panel-vst3.mjs (npm build + cmake). Streams 'buildProgress' { line } and
 * a final 'buildComplete' { ok, code, message, path }. `guid` is the panel's stable export GUID.
 */
export function buildVst3(panelId, data, guid, productName) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — buildVst3 ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('buildVst3', {
    panelId: String(panelId), data, guid, productName,
  });
}

// --- Scripting Toolchains (Settings → Scripting Toolchains) ---------------------------------------
/** Ask C++ for per-language toolchain status. C++ replies with the 'toolchainStatus' event. */
export function requestToolchainStatus() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('toolchainStatus', {});
}
/** Subscribe to toolchain status ({ languages: [...] }). Returns an unsubscribe fn. */
export function onToolchainStatus(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('toolchainStatus', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}
/** Install the toolchains for the given language ids (array). Streams 'toolchainProgress', ends 'toolchainDone'. */
export function provisionToolchains(languages) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('provisionToolchains', { languages });
}
/** Remove the (exclusive) toolchains for the given language ids (array). Ends with 'toolchainDone'. */
export function removeToolchains(languages) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('removeToolchains', { languages });
}
/** Subscribe to toolchain provision/remove progress lines ({ line }). Returns an unsubscribe fn. */
export function onToolchainProgress(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('toolchainProgress', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}
/** Subscribe to toolchain job completion ({ ok, code }). Returns an unsubscribe fn. */
export function onToolchainDone(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('toolchainDone', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** Request an "Open" dialog. C++ will emit 'panelOpened' on success. */
export function openPanel() {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — openPanel ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('openPanel', {});
}

/** Open a specific panel file by path (used for session restore). */
export function openPanelFile(filePath) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('openPanelFile', { filePath });
}

/** Request list of previously open panel paths from settings. C++ emits 'openPanelPaths'. */
export function loadOpenPanels() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('loadOpenPanels', {});
}

/** Persist the current list of open panel file paths to settings. */
export function updateOpenPanels(paths) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('updateOpenPanels', paths);
}

// --- Script workspace file operations ---

export function saveScriptWorkspaceAs(documentId, data) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — saveScriptWorkspaceAs ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('saveScriptWorkspaceAs', { documentId: String(documentId), data });
}

export function saveScriptWorkspace(documentId, filePath, data) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — saveScriptWorkspace ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('saveScriptWorkspace', { documentId: String(documentId), filePath, data });
}

export function openScriptWorkspace() {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — openScriptWorkspace ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('openScriptWorkspace', {});
}

export function openScriptWorkspaceFile(filePath) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('openScriptWorkspaceFile', { filePath });
}

export function loadOpenScriptWorkspaces() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('loadOpenScriptWorkspaces', {});
}

export function updateOpenScriptWorkspaces(paths) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('updateOpenScriptWorkspaces', paths);
}

/** Request persisted app settings. C++ emits 'appSettingsLoaded'. */
export function loadAppSettings() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('loadAppSettings', {});
}

/** Persist app settings payload. */
export function updateAppSettings(settings) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('updateAppSettings', settings);
}

/** Enable or disable native perf debug logging. */
export function setPerfDebugEnabled(enabled) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('setPerfDebugEnabled', enabled === true);
}

// --- Device profile / MIDI preview operations ---

export function listDeviceProfiles() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('listDeviceProfiles', {});
}

export function importDeviceProfile() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('importDeviceProfile', {});
}

export function getDeviceProfileSource(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('getDeviceProfileSource', payload ?? {});
}

export function validateDeviceProfileSource(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('validateDeviceProfileSource', payload ?? {});
}

export function saveDeviceProfileSource(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('saveDeviceProfileSource', payload ?? {});
}

export function saveProfileParameterDetail(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('saveProfileParameterDetail', payload ?? {});
}

export function setDeviceRoleMapping(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('setDeviceRoleMapping', payload ?? {});
}

export function listProfileParameters(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('listProfileParameters', payload ?? {});
}

export function getProfileParameterDetail(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('getProfileParameterDetail', payload ?? {});
}

export function listMidiDestinations() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('listMidiDestinations', {});
}

export function listMidiInputs() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('listMidiInputs', {});
}

export function getDeviceTransportCapabilities() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('getDeviceTransportCapabilities', {});
}

export function getDeviceSessionState() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('getDeviceSessionState', {});
}

export function overrideDeviceIdentityMismatch(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('overrideDeviceIdentityMismatch', payload ?? {});
}

export function startDeviceSync(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('startDeviceSync', payload ?? {});
}

export function startPresetListScan(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('startPresetListScan', payload ?? {});
}

export function cancelPresetListScan(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('cancelPresetListScan', payload ?? {});
}

export function getPresetListScans() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('getPresetListScans', {});
}

export function startBulkDumpSend(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('startBulkDumpSend', payload ?? {});
}

export function cancelBulkDumpSend(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('cancelBulkDumpSend', payload ?? {});
}

export function getBulkDumpSends() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('getBulkDumpSends', {});
}

export function compileParameterMessage(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('compileParameterMessage', payload ?? {});
}

export function setDeviceParameter(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('setDeviceParameter', payload ?? {});
}

export function compileRawMidiAction(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('compileRawMidiAction', payload ?? {});
}

export function triggerRawMidiAction(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('triggerRawMidiAction', payload ?? {});
}

export function parseDumpMessage(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('parseDumpMessage', payload ?? {});
}

export function ingestIncomingMidiMessage(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('ingestIncomingMidiMessage', payload ?? {});
}

export function runDeviceProfileTests(payload) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('runDeviceProfileTests', payload ?? {});
}

export function getDeviceRuntimeState() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('getDeviceRuntimeState', {});
}

export function getMidiMonitorEvents() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('getMidiMonitorEvents', {});
}

export function getDeviceDiagnostics() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('getDeviceDiagnostics', {});
}

export function requestMidiCiDiscovery(deviceRole = DEFAULT_DEVICE_ROLE) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('requestMidiCiDiscovery', { deviceRole });
}

export function onMidiCiDiscovered(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('midiCiDiscovered', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function setMidiCiProfile(muid, profileId, enabled) {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.emitEvent('setMidiCiProfile', { muid, profileId, enabled: !!enabled });
}

export function onMidiCiDiscoveryStarted(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('midiCiDiscoveryStarted', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onMidiCiDiscoveryComplete(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('midiCiDiscoveryComplete', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceProfilesListed(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceProfilesListed', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceProfileImported(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceProfileImported', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceProfileSource(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceProfileSource', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceProfileSourceValidated(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceProfileSourceValidated', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceProfileSourceSaved(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceProfileSourceSaved', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceRoleMappingSet(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceRoleMappingSet', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onProfileParametersListed(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('profileParametersListed', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onProfileParameterDetail(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('profileParameterDetail', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onProfileParameterDetailSaved(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('profileParameterDetailSaved', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onMidiDestinationsListed(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('midiDestinationsListed', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onMidiInputsListed(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('midiInputsListed', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceTransportCapabilities(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceTransportCapabilities', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceSessionState(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceSessionState', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onMidiInputMessage(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('midiInputMessage', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onSysexInputMessage(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('sysexInputMessage', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceSyncStarted(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceSyncStarted', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceRequestResolved(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceRequestResolved', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceRequestTimedOut(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceRequestTimedOut', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceRequestContinued(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceRequestContinued', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceIdentityReply(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceIdentityReply', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceIdentityMismatch(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceIdentityMismatch', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceIdentityOverride(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceIdentityOverride', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onPresetListScanStarted(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('presetListScanStarted', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onPresetListScanUpdated(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('presetListScanUpdated', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onPresetListScans(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('presetListScans', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onBulkDumpSendStarted(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('bulkDumpSendStarted', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onBulkDumpSendUpdated(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('bulkDumpSendUpdated', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onBulkDumpSends(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('bulkDumpSends', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onMidiPreview(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('midiPreview', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceParameterSet(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceParameterSet', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onRawMidiPreview(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('rawMidiPreview', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onRawMidiActionTriggered(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('rawMidiActionTriggered', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDumpMessageParsed(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('dumpMessageParsed', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDumpCollectionUpdated(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('dumpCollectionUpdated', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onIncomingMidiIngested(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('incomingMidiIngested', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceProfileTestsFinished(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceProfileTestsFinished', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceRuntimeState(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceRuntimeState', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onMidiMonitorEvents(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('midiMonitorEvents', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onDeviceDiagnostics(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('deviceDiagnostics', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** Request a font import dialog. C++ emits 'fontsImported' on success. */
export function importFonts() {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — importFonts ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('importFonts', {});
}

/** Request an image file browser dialog. C++ will emit 'imageBrowsed' on success. */
export function browseImage(requestId) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — browseImage ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('browseImage', { requestId });
}

/** Listen for 'imageBrowsed' events. Callback receives { requestId, filePath }. */
export function onImageBrowsed(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('imageBrowsed', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** Request file metadata (size, created, modified). C++ will emit 'fileInfo' with { filePath, size, created, modified }. */
export function requestFileInfo(filePath) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — requestFileInfo ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('requestFileInfo', { filePath });
}

/** Listen for 'fileInfo' events. Callback receives { filePath, size, created, modified }. */
export function onFileInfo(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('fileInfo', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** Request a file's contents as a data URL. C++ will emit 'fileData' with { requestId, data, mimeType }. */
export function requestFileData(requestId, filePath) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — requestFileData ignored');
    return;
  }
  window.__JUCE__.backend.emitEvent('requestFileData', { requestId, filePath });
}

/** Listen for 'fileData' events. Callback receives { requestId, data, mimeType }. */
export function onFileData(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('fileData', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** Request a native-rendered text preview for a custom font. */
export function renderFontPreview(requestId, payload) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — renderFontPreview ignored');
    return;
  }

  window.__JUCE__.backend.emitEvent('renderFontPreview', {
    requestId,
    ...payload,
  });
}

/** Listen for native text preview results. Callback receives { requestId, data?, error? }. */
export function onFontPreviewRendered(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('fontPreviewRendered', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** Listen for 'panelSaved' events. Callback receives { panelId, filePath, name? }. */
export function onPanelSaved(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('panelSaved', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** Listen for 'buildProgress' events during a VST3 build. Callback receives { line }. */
export function onBuildProgress(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('buildProgress', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** Listen for the terminal 'buildComplete' event. Callback receives { ok, code, message, path }. */
export function onBuildComplete(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('buildComplete', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** Listen for 'panelOpened' events. Callback receives metadata and may include data inline. */
export function onPanelOpened(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('panelOpened', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** Listen for 'openPanelPaths' events (session restore). Callback receives string[]. */
export function onOpenPanelPaths(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('openPanelPaths', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onScriptWorkspaceSaved(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('scriptWorkspaceSaved', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onScriptWorkspaceOpened(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('scriptWorkspaceOpened', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

export function onOpenScriptWorkspacePaths(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('openScriptWorkspacePaths', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** Listen for 'appSettingsLoaded' events. */
export function onAppSettingsLoaded(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('appSettingsLoaded', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}

/** Listen for 'fontsImported' events. Callback receives imported font metadata array. */
export function onFontsImported(callback) {
  if (!isJuceAvailable()) return () => {};
  const token = window.__JUCE__.backend.addEventListener('fontsImported', callback);
  return () => window.__JUCE__.backend.removeEventListener(token);
}
