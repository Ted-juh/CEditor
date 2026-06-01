import { derived, get, writable } from 'svelte/store';
import {
  isJuceAvailable,
  loadOpenScriptWorkspaces as bridgeLoadOpenScriptWorkspaces,
  onOpenScriptWorkspacePaths,
  onScriptWorkspaceOpened,
  onScriptWorkspaceSaved,
  openScriptWorkspace as bridgeOpenScriptWorkspace,
  openScriptWorkspaceFile as bridgeOpenScriptWorkspaceFile,
  saveScriptWorkspace as bridgeSaveScriptWorkspace,
  saveScriptWorkspaceAs as bridgeSaveScriptWorkspaceAs,
  updateOpenScriptWorkspaces as bridgeUpdateOpenScriptWorkspaces,
} from '../bridge/bridge.js';
import {
  deserializeScriptWorkspaceDocument,
  sanitizeScriptDocument,
  scriptWorkspaceFilename,
  serializeScriptWorkspaceDocument,
} from '../scripting/scriptDocumentModel.js';
import { createScriptDocument } from '../scripting/scriptSamples.js';

const SCRIPT_WORKSPACE_STORAGE_KEY = 'ce.scriptWorkspaces.v1';
let bridgeInitialized = false;

function browserLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function sanitizeDocument(document) {
  return sanitizeScriptDocument(document);
}

function readPersistedState() {
  const storage = browserLocalStorage();
  if (!storage) return { documents: [], activeId: null };
  try {
    const parsed = JSON.parse(storage.getItem(SCRIPT_WORKSPACE_STORAGE_KEY) || '{}');
    const documents = (Array.isArray(parsed?.documents) ? parsed.documents : [])
      .map(sanitizeDocument)
      .filter(Boolean);
    const activeId = String(parsed?.activeId ?? '').trim();
    return {
      documents,
      activeId: documents.some((document) => document.id === activeId)
        ? activeId
        : (documents.at(-1)?.id ?? null),
    };
  } catch {
    return { documents: [], activeId: null };
  }
}

function persistState(documents, activeId) {
  const storage = browserLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(SCRIPT_WORKSPACE_STORAGE_KEY, JSON.stringify({
      activeId,
      documents: documents.map(sanitizeDocument).filter(Boolean),
    }));
  } catch {
    // Persistence is best-effort; the editor can still work in-memory.
  }
}

const persistedState = readPersistedState();

export const scriptDocuments = writable(persistedState.documents);
export const activeScriptDocumentId = writable(persistedState.activeId);

export const activeScriptDocument = derived(
  [scriptDocuments, activeScriptDocumentId],
  ([$scriptDocuments, $activeScriptDocumentId]) =>
    $scriptDocuments.find((document) => document.id === $activeScriptDocumentId) ?? null
);

export function createScriptWorkspaceDocument(options = {}) {
  const document = sanitizeDocument(createScriptDocument(options));
  scriptDocuments.update((documents) => [...documents, document]);
  activeScriptDocumentId.set(document.id);
  return document;
}

export function openScriptWorkspaceDocument(document) {
  const sanitized = sanitizeDocument(document);
  if (!sanitized) return null;
  scriptDocuments.update((documents) => [
    ...documents.filter((entry) => entry.id !== sanitized.id),
    sanitized,
  ]);
  activeScriptDocumentId.set(sanitized.id);
  return sanitized;
}

export function setActiveScriptDocument(id) {
  if (!id) return;
  activeScriptDocumentId.set(id);
}

export function closeScriptWorkspaceDocument(id) {
  let nextId = null;
  scriptDocuments.update((documents) => {
    const index = documents.findIndex((document) => document.id === id);
    const nextDocuments = documents.filter((document) => document.id !== id);
    if (get(activeScriptDocumentId) === id) {
      nextId = nextDocuments[Math.min(Math.max(index, 0), nextDocuments.length - 1)]?.id ?? null;
      activeScriptDocumentId.set(nextId);
    }
    return nextDocuments;
  });
  return nextId;
}

export function updateScriptDocument(id, updater) {
  scriptDocuments.update((documents) =>
    documents.map((document) => {
      if (document.id !== id) return document;
      const patch = typeof updater === 'function' ? updater(document) : updater;
      return { ...document, ...patch, modified: true };
    })
  );
}

export function markScriptWorkspaceSaved(documentId, { filePath = '', name = '' } = {}) {
  scriptDocuments.update((documents) =>
    documents.map((document) => {
      if (document.id !== documentId) return document;
      const recentFiles = filePath
        ? [filePath, ...(document.recentFiles ?? []).filter((path) => path !== filePath)].slice(0, 12)
        : (document.recentFiles ?? []);
      return {
        ...document,
        filePath: filePath || document.filePath || '',
        name: name || document.name,
        modified: false,
        recentFiles,
      };
    })
  );
  persistOpenScriptWorkspacePaths();
}

export function updateScriptInDocument(documentId, scriptId, updater) {
  scriptDocuments.update((documents) =>
    documents.map((document) => {
      if (document.id !== documentId) return document;
      return {
        ...document,
        modified: true,
        scripts: (document.scripts ?? []).map((script) => {
          if (script.id !== scriptId) return script;
          const patch = typeof updater === 'function' ? updater(script) : updater;
          return { ...script, ...patch };
        }),
      };
    })
  );
}

export function updateActiveScriptInDocument(documentId, updater) {
  const document = get(scriptDocuments).find((entry) => entry.id === documentId) ?? null;
  const scriptId = document?.activeScriptId || document?.scripts?.[0]?.id;
  if (!scriptId) return;
  updateScriptInDocument(documentId, scriptId, updater);
}

export function addScriptToDocument(documentId, script = {}) {
  const id = String(script.id ?? `script_${Date.now().toString(36)}`).trim();
  const nextScript = {
    id,
    name: String(script.name ?? id),
    scope: String(script.scope ?? 'panel'),
    event: String(script.event ?? 'onValueChanged'),
    target: String(script.target ?? '*'),
    enabled: script.enabled !== false,
    steps: Array.isArray(script.steps) ? script.steps : [],
    ...script,
    id,
  };
  updateScriptDocument(documentId, (document) => ({
    activeScriptId: nextScript.id,
    scripts: [...(document.scripts ?? []), nextScript],
  }));
  return nextScript;
}

export function duplicateScriptInDocument(documentId, scriptId) {
  const document = get(scriptDocuments).find((entry) => entry.id === documentId);
  const source = document?.scripts?.find((script) => script.id === scriptId);
  if (!source) return null;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = `${source.id}_copy_${Date.now().toString(36)}`;
  copy.name = `${source.name ?? source.id} Copy`;
  return addScriptToDocument(documentId, copy);
}

export function removeScriptFromDocument(documentId, scriptId) {
  updateScriptDocument(documentId, (document) => {
    const scripts = (document.scripts ?? []).filter((script) => script.id !== scriptId);
    return {
      scripts,
      activeScriptId: document.activeScriptId === scriptId ? (scripts[0]?.id ?? '') : document.activeScriptId,
    };
  });
}

export function updateScriptStep(documentId, scriptId, stepId, updater) {
  updateScriptInDocument(documentId, scriptId, (script) => ({
    steps: (script.steps ?? []).map((step) => {
      if (step.id !== stepId) return step;
      const patch = typeof updater === 'function' ? updater(step) : updater;
      return { ...step, ...patch };
    }),
  }));
}

export function addScriptStep(documentId, scriptId, command = 'setValue') {
  const defaultArgs = {
    setValue: { target: 'target.value', value: { ref: 'event.value' } },
    routeValue: { from: 'event.value', to: 'target.value', transform: { ref: 'event.value' } },
    setVisible: { target: 'groupName', visible: true },
    showGroup: { group: 'groupName' },
    hideGroup: { group: 'groupName' },
    setPanelState: { state: 'default' },
    setAnimation: { target: 'partName', animation: 'hoverScroll', enabled: true },
    startTimer: { id: 'timer1', ms: 250 },
    stopTimer: { id: 'timer1' },
    emitEvent: { event: 'onCustomEvent', target: 'target', value: { ref: 'event.value' } },
    sendCC: { channel: 1, cc: 74, value: { op: 'round', args: [{ op: '*', args: [{ ref: 'event.value' }, 127] }] }, phase: 'commit' },
    sendNRPN: { channel: 1, parameterMsb: 0, parameterLsb: 1, value: { op: 'round', args: [{ op: '*', args: [{ ref: 'event.value' }, 16383] }] }, phase: 'commit' },
    buildSysex: { bytes: [0xF0, 0x41, 0x10, 0x00, 0x15, 0x12, 0x34, 0x56, 0xF7] },
    checksum: { type: 'Roland', bytes: [0x10, 0x00, 0x15, 0x12, 0x34, 0x56] },
    to14Bit: { value: { op: 'round', args: [{ op: '*', args: [{ ref: 'event.value' }, 16383] }] } },
    sendSysex: { bytes: [0xF0, 0x41, 0x10, 0x00, 0x15, 0x12, 0x34, 0x56, 0xF7] },
    requestDeviceDump: { profileId: 'roland-sh-201', deviceRole: 'mainSynth', request: 'requestTemporaryPatchBulk', phase: 'commit' },
    log: { message: 'trace', value: { ref: 'event.value' } },
  };
  const step = {
    id: `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    command,
    args: defaultArgs[command] ?? { target: 'target.value', value: { ref: 'event.value' } },
  };
  updateScriptInDocument(documentId, scriptId, (script) => ({
    steps: [...(script.steps ?? []), step],
  }));
  return step;
}

export function removeScriptStep(documentId, scriptId, stepId) {
  updateScriptInDocument(documentId, scriptId, (script) => ({
    steps: (script.steps ?? []).filter((step) => step.id !== stepId),
  }));
}

export function moveScriptStep(documentId, scriptId, stepId, direction) {
  updateScriptInDocument(documentId, scriptId, (script) => {
    const steps = [...(script.steps ?? [])];
    const index = steps.findIndex((step) => step.id === stepId);
    const nextIndex = index + (direction < 0 ? -1 : 1);
    if (index < 0 || nextIndex < 0 || nextIndex >= steps.length) return { steps };
    const [step] = steps.splice(index, 1);
    steps.splice(nextIndex, 0, step);
    return { steps };
  });
}

function fallbackDownload(document) {
  if (typeof window === 'undefined' || typeof Blob === 'undefined') return false;
  const data = serializeScriptWorkspaceDocument(document);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = scriptWorkspaceFilename(document.name);
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  markScriptWorkspaceSaved(document.id, { filePath: document.filePath, name: document.name });
  return true;
}

function fallbackOpenFilePicker() {
  if (typeof window === 'undefined' || !window.document) return false;
  const input = window.document.createElement('input');
  input.type = 'file';
  input.accept = '.cescript.json,application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    openScriptWorkspaceDocument(deserializeScriptWorkspaceDocument(text, '', file.name.replace(/\.cescript\.json$/i, '')));
  };
  input.click();
  return true;
}

export function saveScriptWorkspaceDocument(documentId, forceSaveAs = false) {
  const document = get(scriptDocuments).find((entry) => entry.id === documentId);
  if (!document) return;
  const data = serializeScriptWorkspaceDocument(document);
  if (!isJuceAvailable()) {
    fallbackDownload(document);
    return;
  }
  if (document.filePath && !forceSaveAs) {
    bridgeSaveScriptWorkspace(document.id, document.filePath, data);
  } else {
    bridgeSaveScriptWorkspaceAs(document.id, data);
  }
}

export function saveActiveScriptWorkspace() {
  const document = get(activeScriptDocument);
  if (document) saveScriptWorkspaceDocument(document.id, false);
}

export function saveActiveScriptWorkspaceAs() {
  const document = get(activeScriptDocument);
  if (document) saveScriptWorkspaceDocument(document.id, true);
}

export function openScriptWorkspaceFromFile() {
  if (!isJuceAvailable()) {
    fallbackOpenFilePicker();
    return;
  }
  bridgeOpenScriptWorkspace();
}

export function persistOpenScriptWorkspacePaths() {
  const paths = [...new Set(get(scriptDocuments).map((document) => document.filePath).filter(Boolean))];
  bridgeUpdateOpenScriptWorkspaces(paths);
}

export function initScriptWorkspaceBridge() {
  if (bridgeInitialized) return;
  bridgeInitialized = true;

  onScriptWorkspaceSaved((payload) => {
    markScriptWorkspaceSaved(String(payload?.documentId ?? ''), {
      filePath: String(payload?.filePath ?? ''),
      name: String(payload?.name ?? ''),
    });
  });

  onScriptWorkspaceOpened((payload) => {
    const filePath = String(payload?.filePath ?? '').trim();
    if (!filePath && !payload?.data) return;
    const existing = get(scriptDocuments).find((document) => document.filePath === filePath);
    if (existing) {
      activeScriptDocumentId.set(existing.id);
      return;
    }
    try {
      openScriptWorkspaceDocument(deserializeScriptWorkspaceDocument(
        String(payload?.data ?? ''),
        filePath,
        String(payload?.name ?? '')
      ));
      persistOpenScriptWorkspacePaths();
    } catch (error) {
      console.error('[scriptWorkspace] Failed to open script workspace:', error);
    }
  });

  onOpenScriptWorkspacePaths((paths) => {
    if (!Array.isArray(paths)) return;
    for (const path of [...new Set(paths.map(String).filter(Boolean))]) {
      bridgeOpenScriptWorkspaceFile(path);
    }
  });

  bridgeLoadOpenScriptWorkspaces();
}

scriptDocuments.subscribe((documents) => {
  persistState(documents, get(activeScriptDocumentId));
  persistOpenScriptWorkspacePaths();
});

activeScriptDocumentId.subscribe((activeId) => {
  persistState(get(scriptDocuments), activeId);
});
