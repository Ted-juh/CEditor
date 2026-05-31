/**
 * Bridge between Svelte and C++ JUCE backend via window.__JUCE__
 *
 * C++ registers event listeners for: setProperty, requestFullState, undo, redo
 * C++ emits events: fullState, propUpdate
 */

/** Check if we're running inside a JUCE WebView with native integration */
export function isJuceAvailable() {
  return typeof window !== 'undefined' &&
         window.__JUCE__ &&
         window.__JUCE__.backend;
}

/** Send a property change to C++ */
export function setProperty(path, value) {
  if (!isJuceAvailable()) {
    console.warn('[bridge] No JUCE backend — setProperty ignored:', path, value);
    return;
  }
  window.__JUCE__.backend.emitEvent('setProperty', { path, value });
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
