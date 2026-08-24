// panelSharing.js — the editor's side of packaging a panel for somebody else.
//
// `utils/panelPackage.js` is the format and is deliberately filesystem-free: it takes `readAsset`
// and `writeAsset` as arguments, which is what let it be built and tested away from Windows. This is
// the half that supplies them for the running editor, and it turned out to need no new C++ at all.
//
// READING is `fileCache`, which already exists to show local images in the WebView: it asks the
// bridge for a path and gets a data URL back. Packaging wants exactly that, so it reuses the cache
// rather than adding a second reader — and a panel being packaged has usually just been rendered, so
// most assets are already in it.
//
// WRITING turns out not to be needed. `CanvasControl.svelte:1789` accepts a `data:` URL wherever it
// accepts an image path, so opening a package can put the embedded bytes straight back into
// `imageSrc` and `bgImage`. No temp files, no cleanup, nothing left on disk when the panel is
// closed — and an opened panel is self-contained rather than pointing at a folder the next person
// also has to receive.
//
// The one real cost of that choice is honest and worth stating: the panel document then carries its
// images inline, so it is large. That is the correct trade for a shared panel, and re-pointing an
// asset at a real file afterwards is what the existing image browser is for.

import { get } from 'svelte/store';

import { isJuceAvailable } from '../bridge/bridge.js';
import { fileCache, loadFile } from './fileCache.js';
import {
  createPanelPackage,
  openPanelPackage,
  panelAssetPaths,
  validatePanelPackage,
} from '../utils/panelPackage.js';

/** How long to wait for the bridge to hand back one asset before giving up on it. */
const ASSET_TIMEOUT_MS = 4000;

/**
 * Real bytes, or nothing.
 *
 * `fileCache` has a dev-mode fallback: with no JUCE backend, `loadFile` stores the PATH under the
 * path, so a view can at least try it as a URL. Harmless there and poison here — packaging would
 * embed the string "C:/pics/knob.png" as if it were the image, producing a package that validates,
 * opens, and shows nothing. Only a data URL is bytes, so only a data URL counts.
 */
function usableAsset(value) {
  return typeof value === 'string' && value.startsWith('data:') ? value : null;
}

/**
 * Ask the cache for a path and wait for it, because packaging cannot proceed on a promise of bytes.
 *
 * `loadFile` is fire-and-forget by design — it feeds a reactive store that a view re-renders from.
 * Packaging is a one-shot operation with an answer, so it needs the awaitable form, and the timeout
 * is what stops a file the backend never answers for hanging the whole export. A timed-out asset
 * comes back null and lands in the package's `missing` list, which is the behaviour the format
 * already defines for a file that cannot be read.
 */
function readAssetViaCache(filePath) {
  return new Promise((resolve) => {
    const cached = usableAsset(get(fileCache)[filePath]);
    if (cached) { resolve(cached); return; }
    if (!isJuceAvailable()) { resolve(null); return; }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(value ?? null);
    };

    const timer = setTimeout(() => finish(null), ASSET_TIMEOUT_MS);
    const unsubscribe = fileCache.subscribe((cache) => {
      const value = usableAsset(cache[filePath]);
      if (value) finish(value);
    });

    loadFile(filePath);
  });
}

/**
 * Package a panel, embedding every asset it references.
 *
 * Returns the envelope, or `{ ok: false, error }` when the panel could not be read at all. A panel
 * with SOME unreadable assets still packages — see the format's note on why refusing outright would
 * be the wrong call.
 */
export async function packagePanelForSharing(panel, metadata = {}) {
  if (!panel) return { ok: false, error: 'No panel to package.' };

  // Warm the cache first so the common case is one pass with no waiting: a panel that has been on
  // screen already has its images here.
  for (const path of panelAssetPaths(panel)) loadFile(path);

  const envelope = await createPanelPackage(panel, {
    readAsset: readAssetViaCache,
    metadata,
  });

  const validation = validatePanelPackage(envelope);
  return {
    ok: validation.ok,
    envelope,
    issues: validation.issues,
    warnings: validation.warnings,
    missing: envelope.missing,
    assetCount: Object.keys(envelope.assets).length,
  };
}

/**
 * Open a package back into a panel document, with its assets inline as data URLs.
 *
 * The `writeAsset` the format asks for returns the data URL unchanged rather than a file path, which
 * is the whole reason this needs no filesystem: the renderer takes a `data:` URL anywhere it takes a
 * path, so the reference is already usable.
 */
export async function openSharedPanel(envelope) {
  const validation = validatePanelPackage(envelope);
  if (!validation.ok) return { ok: false, issues: validation.issues, warnings: validation.warnings, panel: null };

  return openPanelPackage(envelope, {
    // Already a data URL, since that is what the bridge hands back and what the format stored.
    // Returned as-is so the panel is self-contained; nothing is written anywhere.
    writeAsset: async (id, data) => data ?? null,
  });
}

/** The file text to save, and a sensible name for it. Kept here so the caller does no formatting. */
export function panelPackageFile(envelope) {
  const safe = String(envelope?.metadata?.name ?? 'Panel').replace(/[\\/:*?"<>|]/g, '_').trim();
  return {
    fileName: `${safe || 'Panel'}.cepanelpkg`,
    text: `${JSON.stringify(envelope, null, 2)}\n`,
  };
}
