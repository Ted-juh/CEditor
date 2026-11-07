// quitGuard.js — what is unsaved when CEditor is asked to quit, and the person's answer.
//
// The close button, Alt+F4 and File → Close Program used to quit at once. Now the program asks the
// page first (QuitGate.h): 'quitRequested' arrives here, the page answers "asking" straight away,
// then "quit" or "stay". With nothing unsaved it answers "quit" without a word; otherwise the Quit
// window (layout/QuitDialog.svelte) lists what is unsaved and offers:
//
//   Save and quit         saves what can be saved without a dialog (it has a file already), waits
//                         for each to be written, and quits only when nothing is left unsaved;
//   Quit without saving   takes the recovery copy first (Settings → General → Restore Unsaved
//                         Work offers it next time), then quits;
//   Cancel                stays.
//
// What counts as unsaved is each document's own `modified` flag — a panel, a script workspace, a
// component, a screen — and the editors that keep theirs inside themselves (stores/unsavedEditors.js:
// the Device Profile Designer).

import { get, writable } from 'svelte/store';
import { panels, savePanelById, flushUnsavedSessionSnapshot } from './panels.js';
import { componentDocuments } from './componentWorkspace.js';
import { scriptDocuments, saveScriptWorkspaceDocument } from './scriptWorkspace.js';
import { screenDocuments, saveScreenDocument } from './screenBuilder.js';
import { dirtyEditors } from './unsavedEditors.js';
import { answerQuit, onQuitRequested } from '../bridge/bridge.js';

/** The Quit window: `{ documents, saving, note }` while it is open. */
export const quitPrompt = writable(null);

const NEVER_SAVED = 'never saved: use Save As first';

/**
 * The unsaved documents, from the stores' contents: each `{ key, kind, id, name, canSave, note }`.
 * `canSave` is whether Save and quit can save it without asking anything (it has a file to go to).
 */
export function unsavedDocumentsFrom({ panels: panelList = [], scripts = [], components = [], screens = [], editors = [] }) {
  const out = [];
  const listedPanels = new Set();
  for (const panel of panelList) {
    if (!panel?.modified) continue;
    listedPanels.add(String(panel.id));
    out.push({ key: `panel:${panel.id}`, kind: 'panel', id: panel.id, name: panel.name || 'Untitled panel', canSave: !!panel.filePath, note: panel.filePath ? '' : NEVER_SAVED });
  }
  for (const script of scripts) {
    if (!script?.modified) continue;
    const panel = script.panelId ? panelList.find((entry) => String(entry.id) === String(script.panelId)) : null;
    if (panel) {
      // A panel's scripts are saved with the panel.
      if (listedPanels.has(String(panel.id))) continue;
      listedPanels.add(String(panel.id));
      out.push({ key: `panel:${panel.id}`, kind: 'panel', id: panel.id, name: panel.name || 'Untitled panel', canSave: !!panel.filePath, note: panel.filePath ? 'its scripts' : NEVER_SAVED });
      continue;
    }
    out.push({ key: `script:${script.id}`, kind: 'script', id: script.id, name: script.name || 'Script workspace', canSave: !!script.filePath, note: script.filePath ? '' : NEVER_SAVED });
  }
  for (const component of components) {
    if (!component?.modified) continue;
    out.push({ key: `component:${component.id}`, kind: 'component', id: component.id, name: component.name || 'Component', canSave: false, note: 'saved with Export, from its tab' });
  }
  for (const screen of screens) {
    if (!screen?.modified) continue;
    out.push({ key: `screen:${screen.id}`, kind: 'screen', id: screen.id, name: screen.name || 'Screen', canSave: !!screen.filePath, note: screen.filePath ? '' : NEVER_SAVED });
  }
  for (const { key, entry } of editors) {
    let canSave = false;
    let note = '';
    try { canSave = entry.canSave?.() === true; note = canSave ? '' : String(entry.whyNot?.() ?? ''); } catch { canSave = false; }
    out.push({ key, kind: entry.kind ?? 'editor', id: entry.profileId ?? key, name: String(entry.name?.() ?? 'Device profile'), canSave, note, editor: entry });
  }
  return out;
}

/** What is unsaved now. */
export function unsavedDocuments() {
  return unsavedDocumentsFrom({
    panels: get(panels),
    scripts: get(scriptDocuments),
    components: get(componentDocuments),
    screens: get(screenDocuments),
    editors: dirtyEditors(),
  });
}

/** Is this document still unsaved? */
function stillUnsaved(entry) {
  switch (entry.kind) {
    case 'panel': return get(panels).some((panel) => panel.id === entry.id && panel.modified);
    case 'script': return get(scriptDocuments).some((script) => script.id === entry.id && script.modified);
    case 'screen': return get(screenDocuments).some((screen) => screen.id === entry.id && screen.modified);
    case 'component': return get(componentDocuments).some((component) => component.id === entry.id && component.modified);
    default: try { return entry.editor?.isDirty?.() === true; } catch { return true; }
  }
}

function startSaving(entry) {
  switch (entry.kind) {
    case 'panel': savePanelById(entry.id); break;
    case 'script': saveScriptWorkspaceDocument(entry.id, false); break;
    case 'screen': saveScreenDocument(entry.id); break;
    default: entry.editor?.save?.();
  }
}

function waitUntil(condition, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (condition()) { resolve(true); return; }
      if (Date.now() - started > timeoutMs) { resolve(false); return; }
      setTimeout(tick, 100);
    };
    tick();
  });
}

/** How long Save and quit waits for the program to say each file was written. */
export const SAVE_WAIT_MS = 20000;

function handleQuitRequest() {
  answerQuit('asking');
  if (get(quitPrompt)) return;   // already asking: the window is open
  const documents = unsavedDocuments();
  if (!documents.length) { answerQuit('quit'); return; }
  quitPrompt.set({ documents, saving: false, note: '' });
}

/** Cancel: CEditor stays open. */
export function stayOpen() {
  quitPrompt.set(null);
  answerQuit('stay');
}

/** Quit without saving, after taking the recovery copy. */
export async function quitWithoutSaving() {
  try {
    await Promise.race([flushUnsavedSessionSnapshot({ unloading: true }), new Promise((resolve) => setTimeout(resolve, 2000))]);
  } catch { /* the quit goes ahead: the person chose not to save */ }
  quitPrompt.set(null);
  answerQuit('quit');
}

/**
 * Save what can be saved, then quit if nothing is left. What could not be saved (never saved, a
 * component, a write that failed) stays in the window, which says so.
 */
export async function saveAndQuit() {
  const documents = unsavedDocuments();
  const saving = documents.filter((entry) => entry.canSave);
  quitPrompt.set({ documents, saving: true, note: '' });
  for (const entry of saving) startSaving(entry);
  await waitUntil(() => saving.every((entry) => !stillUnsaved(entry)), SAVE_WAIT_MS);
  const left = unsavedDocuments();
  if (!left.length) {
    quitPrompt.set(null);
    answerQuit('quit');
    return true;
  }
  const saved = saving.filter((entry) => !stillUnsaved(entry)).length;
  quitPrompt.set({
    documents: left,
    saving: false,
    note: `${saved ? `Saved ${saved}. ` : ''}${left.length === 1 ? 'This one still has' : `These ${left.length} still have`} unsaved changes.`,
  });
  return false;
}

let listening = false;

/** Answer the program's quit requests from now on (App.svelte, once). */
export function initQuitGuard() {
  if (listening) return;
  listening = true;
  onQuitRequested(handleQuitRequest);
}

// For the tests, which drive the request without a bridge.
export const _handleQuitRequest = handleQuitRequest;
