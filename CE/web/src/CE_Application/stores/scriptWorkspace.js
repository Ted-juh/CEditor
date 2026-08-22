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
  createScriptDocument,
  deserializeScriptWorkspaceDocument,
  sanitizeScriptDocument,
  scriptWorkspaceFilename,
  serializeScriptWorkspaceDocument,
} from '../scripting/scriptDocumentModel.js';
import { confirmDiscardUnsaved } from '../utils/confirmDiscard.js';
import { rememberRecentFile } from './recentFiles.js';

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

/** Open (or create) the script editor bound to a specific panel — one editor per panel.
 *  Binds via `panelId` so the Paths picker / controls come from THAT panel (not the ambiguous
 *  "active panel"). */
export function getOrCreateScriptDocForPanel(panelId, panelName = '') {
  const id = String(panelId ?? '').trim();
  const existing = id ? get(scriptDocuments).find((doc) => doc.panelId === id) : null;
  if (existing) {
    activeScriptDocumentId.set(existing.id);
    return existing;
  }
  const base = createScriptDocument({ name: panelName ? `${panelName} · Scripts` : 'Scripts' });
  const document = sanitizeDocument({ ...base, panelId: id });
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
  const closing = get(scriptDocuments).find((document) => document.id === id);
  // Aborted close: report the tab as still current so callers re-activate it.
  if (closing?.modified && !confirmDiscardUnsaved(closing.name)) return id;

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
  // The per-document `recentFiles` list above is this workspace's own history of where IT has
  // been saved; the app-wide Open Recent is a different list with a different job, and a script
  // workspace has to appear in it beside panels and components or File > Open Recent lies by
  // omission about half the documents the app can open.
  if (filePath) rememberRecentFile({ kind: 'script', path: filePath, name });
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
    ...script,
    id,
  };
  updateScriptDocument(documentId, (document) => ({
    activeScriptId: nextScript.id,
    scripts: [...(document.scripts ?? []), nextScript],
  }));
  return nextScript;
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
      if (filePath) rememberRecentFile({ kind: 'script', path: filePath, name: String(payload?.name ?? '') });
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
