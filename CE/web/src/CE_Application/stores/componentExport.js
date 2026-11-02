// componentExport.js — the Export window for a custom component, and the export itself.
//
// Export is the one way out: to the component library (Insert › Saved packages, the dock's Library
// and the icon rail list it on every panel) and/or to a file (`<name>-<version>.ceditor-component
// .json`, the library's own package format). It works for a component on a panel and for one open on
// its own (File › New Custom Component, or opened from the library), which had no way to be saved.

import { get, writable } from 'svelte/store';
import { customComponentLibrary } from './customComponentLibrary.js';
import { applyControlPatch, standaloneComponentControl } from './controls.js';
import { markComponentDocumentSaved } from './componentWorkspace.js';
import { createCustomComponentExportEnvelope, createCustomComponentLibraryEnvelope } from '../utils/customComponentPackage.js';
import { relinkCustomComponentPatch } from '../utils/customComponentSourceLink.js';
import { componentExportFileName } from '../utils/componentExport.js';
import { refreshSettingDefaultsPatch } from '../utils/componentSettings.js';
import { applyPatchObject } from './controlTreeUtils.js';
import { deepClone } from '../utils/deepClone.js';
import { notify } from './scriptUi.js';

/** Whether the Export window is open. */
export const componentExportOpen = writable(false);

export function openComponentExport() {
  componentExportOpen.set(true);
}

export function closeComponentExport() {
  componentExportOpen.set(false);
}

/** A file the browser (or the app's WebView) saves as a download, as Package file did. */
export function downloadText(text, fileName) {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return false;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Export `control` as `name` `version`, to the library and/or a file.
 *
 * Saved to the library, the component is then that library version: a copy on a panel is linked to
 * it (its Source card says "Up to date", and other copies can update to it), and a component open on
 * its own takes the name and stops asking to be saved when closed.
 *
 * Returns `{ ok, entry, fileName, error }`.
 */
export function exportComponent(control, { name, version, changes = '', details = {}, toLibrary = true, toFile = false } = {}) {
  const id = control?._children?.Core?.id;
  if (!id) return { ok: false, error: 'There is no component to export.' };
  if (!toLibrary && !toFile) return { ok: false, error: 'Choose where to save it: the library, a file, or both.' };
  const metadata = {
    name: String(name ?? '').trim() || undefined,
    version: String(version ?? '').trim() || undefined,
    changes,
    // The Export window's Details: what the library shows and searches. Left out, the package
    // reads them from the component as it always did (normalizeCustomComponentMetadata).
    ...Object.fromEntries(['description', 'category', 'tags', 'author', 'license']
      .filter((key) => details?.[key] !== undefined)
      .map((key) => [key, details[key]])),
  };
  const standalone = get(standaloneComponentControl)?._children?.Core?.id === id;

  // Every setting starts, on a copy placed from what is exported, as the component looks now
  // (utils/componentSettings.js), however the author changed it since adding it.
  const defaults = refreshSettingDefaultsPatch(control);
  if (Object.keys(defaults).length) applyControlPatch(id, defaults);
  let exported = control;
  if (Object.keys(defaults).length || (standalone && metadata.name)) {
    exported = deepClone(control);
    applyPatchObject(exported, defaults);
    // A component open on its own is named by its document; it takes the name it is exported under.
    if (standalone && metadata.name) exported._children.Core.name = metadata.name;
  }

  let entry = null;
  if (toLibrary) {
    entry = customComponentLibrary.saveControl(exported, metadata);
    if (!entry) return { ok: false, error: 'The library did not take it.' };
    const patch = relinkCustomComponentPatch(exported, entry);
    if (standalone && metadata.name) patch['Core.name'] = metadata.name;
    applyControlPatch(id, patch);
  }

  let fileName = '';
  if (toFile) {
    const envelope = createCustomComponentExportEnvelope(exported, metadata);
    fileName = componentExportFileName(envelope.metadata?.name, envelope.metadata?.version);
    downloadText(JSON.stringify(envelope, null, 2), fileName);
  }

  if (standalone) markComponentDocumentSaved(id);
  const where = [entry ? 'to the library' : '', fileName ? `as ${fileName}` : ''].filter(Boolean).join(' and ');
  notify(`Exported ${metadata.name ?? 'the component'} ${entry?.version ?? metadata.version ?? ''} ${where}.`.replace(/\s+/g, ' '));
  return { ok: true, entry, fileName };
}

/** The dock Library tab's Save as file…: one saved component, as the file Export writes. */
export function saveLibraryEntryToFile(entry) {
  if (!entry?.envelope) return '';
  const fileName = componentExportFileName(entry.name, entry.version);
  downloadText(JSON.stringify(entry.envelope, null, 2), fileName);
  return fileName;
}

/** The dock Library tab's Export all…: every saved component in one file, which Import reads back. */
export function exportWholeLibrary(entries = get(customComponentLibrary)) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return '';
  const bundle = createCustomComponentLibraryEnvelope(list);
  const fileName = `ceditor-component-library-${new Date().toISOString().slice(0, 10)}.json`;
  downloadText(JSON.stringify(bundle, null, 2), fileName);
  return fileName;
}
