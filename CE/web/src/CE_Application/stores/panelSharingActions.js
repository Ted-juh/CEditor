// panelSharingActions.js — the menu commands behind Share Panel and Open Shared Panel.
//
// Three layers, and they are separate on purpose:
//
//   utils/panelPackage.js   the format. No filesystem, no bridge, no editor. Testable anywhere.
//   stores/panelSharing.js  the assets. Supplies readAsset/writeAsset out of fileCache.
//   here                    the commands. Dialogs, file IO, and putting the result in a tab.
//
// The split matters because the middle layer has a rule — asset reads go through `fileCache` and
// nowhere else, so there is one answer to "what is at this path" — and reading a .cepanelpkg is
// not an asset read. Doing it there would have meant relaxing that rule for an unrelated job.

import { get } from 'svelte/store';

import {
  onFileData,
  onPanelPackageOpened,
  onPanelPackageSaved,
  openPanelPackage as bridgeOpenPanelPackage,
  requestFileData,
  savePanelPackageAs as bridgeSavePanelPackageAs,
} from '../bridge/bridge.js';
import { addPanel, activePanel } from './panels.js';
import { cerror, cinfo, cwarn } from './console.js';
import { deserializePanel, serializePanel } from './panelModel.js';
import { openSharedPanel, packagePanelForSharing, panelPackageFile } from './panelSharing.js';

/** How long to wait for the backend to hand back the chosen package before giving up. */
const READ_TIMEOUT_MS = 15000;

let listenersReady = false;
let requestCounter = 0;
const pendingReads = new Map();

/**
 * The document to package, which is the same one Save writes — not the live editor model.
 *
 * A package should hold a `.cepanel`, so that opening one is the same code path as opening a file
 * and a reader can see what they have. Two things are removed on the way out:
 *
 *   filePath      C:/Users/<author>/... , which is the author's name and folder layout in a file
 *                 they are about to send to a stranger. It is also meaningless on the other
 *                 machine, and deserializePanel takes the path from the caller anyway.
 *   deviceSession which MIDI ports were bound, by name. Machine state, not panel content: on the
 *                 recipient's computer it names hardware that is not there.
 */
function documentToShare(panel) {
  const doc = JSON.parse(serializePanel(panel));
  delete doc.filePath;
  delete doc.deviceSession;
  return doc;
}

/** Decode what requestFileData returns — base64, always, for the reason on its C++ listener. */
function textFromDataUrl(dataUrl) {
  const comma = String(dataUrl ?? '').indexOf(',');
  if (comma < 0) return '';
  const binary = atob(String(dataUrl).slice(comma + 1));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function readPackageText(filePath) {
  return new Promise((resolve, reject) => {
    const requestId = `pkg_${++requestCounter}`;
    const timer = setTimeout(() => {
      pendingReads.delete(requestId);
      reject(new Error(`Timed out reading ${filePath}`));
    }, READ_TIMEOUT_MS);
    pendingReads.set(requestId, { resolve, reject, timer });
    requestFileData(requestId, filePath);
  });
}

/**
 * Package the active panel and offer to save it.
 *
 * Returns what happened rather than throwing, so a caller can report it; the menu item just logs.
 * A panel with SOME unreadable images still packages — see the format's note on why refusing over
 * one stale path would be the wrong call — but the missing files are named, because the author is
 * the one person who can still find them.
 */
export async function sharePanelToFile(metadata = {}) {
  const panel = get(activePanel);
  if (!panel) { cwarn('[share] No active panel to share.'); return { ok: false }; }

  const name = String(panel.name ?? '').trim() || 'Panel';
  cinfo(`[share] Packaging "${name}" — embedding images may take a moment…`);

  const result = await packagePanelForSharing(documentToShare(panel), { name, ...metadata });
  if (!result.ok) {
    cerror('[share] Could not package the panel:', (result.issues ?? []).join(' '));
    return result;
  }

  if (result.missing.length) {
    cwarn(`[share] ${result.missing.length} file(s) could not be read and are NOT in the package: `
      + result.missing.join(', '));
  }

  const file = panelPackageFile(result.envelope);
  cinfo(`[share] ${result.assetCount} asset(s) embedded, ${(file.text.length / 1024).toFixed(0)} KB.`);
  ensurePanelSharingListeners();
  bridgeSavePanelPackageAs(file.fileName, file.text);
  return result;
}

/** Ask for a .cepanelpkg to open. The rest happens in the listener below. */
export function openSharedPanelFromFile() {
  ensurePanelSharingListeners();
  bridgeOpenPanelPackage();
}

/**
 * Open a package that has already been read into text.
 *
 * Split out from the bridge listener so the interesting half — validate, resolve assets, land it
 * in a tab — is reachable without a backend. The new panel deliberately has NO filePath: it came
 * out of a package, so Save should ask where to put it rather than silently writing a .cepanel
 * next to somebody else's package.
 */
export async function openPackageText(text, fallbackName = '') {
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch (error) {
    cerror('[share] That file is not a panel package — it is not valid JSON.', error.message);
    return null;
  }

  const opened = await openSharedPanel(envelope);
  if (!opened.ok) {
    cerror('[share] Cannot open that package:', opened.issues.join(' '));
    return null;
  }
  for (const warning of opened.warnings ?? []) cwarn('[share]', warning);
  if (opened.unresolved.length) {
    cwarn(`[share] ${opened.unresolved.length} asset(s) were referenced but not in the package.`);
  }

  const name = String(envelope?.metadata?.name ?? '').trim() || fallbackName || 'Shared Panel';
  const panel = deserializePanel(JSON.stringify(opened.panel), null, name);
  if (!panel) return null;

  addPanel(panel);
  cinfo(`[share] Opened "${name}" from a package. Save it to keep it.`);
  return panel;
}

/** Register the two package listeners. Idempotent; called by both commands and by app startup. */
export function ensurePanelSharingListeners() {
  if (listenersReady) return;
  listenersReady = true;

  onPanelPackageSaved((payload) => {
    if (payload?.ok === false) {
      cerror('[share] Could not write', payload?.filePath ?? 'the package', '— check the folder is writable.');
      return;
    }
    cinfo('[share] ✓ Saved →', payload?.filePath ?? '(unknown path)');
  });

  onPanelPackageOpened(async (payload) => {
    const filePath = String(payload?.filePath ?? '').trim();
    if (!filePath) return;
    try {
      const text = await readPackageText(filePath);
      await openPackageText(text, String(payload?.name ?? ''));
    } catch (error) {
      cerror('[share] Could not read', filePath, '—', error.message);
    }
  });

  // Shared with fileCache and the panel loader, which is why every one of them filters by its own
  // requestId prefix: the bridge multicasts `fileData` to all three.
  onFileData((payload) => {
    const pending = pendingReads.get(payload?.requestId);
    if (!pending) return;
    pendingReads.delete(payload.requestId);
    clearTimeout(pending.timer);
    pending.resolve(textFromDataUrl(payload?.data));
  });
}
