// psdPanelImportActions.js — File › New Panel from Photoshop Artwork.
//
//   utils/psdPanelImport.js    reading the layers, the convention, the flattening. Pure, tested in node.
//   here                       the command: choose a file, read it, open the panel, report.
//
// The panel is built exactly as the SVG command builds one (stores/svgPanelImportActions.js): same
// control builder, same report, and the same record of which layer made which control, so "Update
// Panel from Photoshop Artwork" matches a revised file to the panel by layer name, exactly as the
// SVG update matches by object name (utils/svgPanelReimport.js).

import { browseImage, isJuceAvailable, onFileData, onImageBrowsed, requestFileData } from '../bridge/bridge.js';

import { get } from 'svelte/store';

import { activePanel, addPanel } from './panels.js';
import { createPanel } from './panelModel.js';
import { cerror, cinfo, cwarn } from './console.js';
import { notify } from './scriptUi.js';
import { buildSvgImportControls, describeSvgImport } from '../utils/svgPanelImport.js';
import { artworkRecord, linksForNewImport } from '../utils/svgPanelReimport.js';
import { updatePanelFromArtworkPlan } from './svgPanelImportActions.js';
import { confirmDestructive } from '../utils/confirmDiscard.js';

const READ_TIMEOUT_MS = 60000;   // a layered PSD is often tens of MB
const REQUEST_PREFIX = 'psdpanel_';

let requestCounter = 0;
let pendingBrowse = null;
const pendingReads = new Map();
let listenersReady = false;

function bytesFromDataUrl(dataUrl) {
  const comma = String(dataUrl ?? '').indexOf(',');
  if (comma < 0) return new Uint8Array(0);
  return Uint8Array.from(atob(String(dataUrl).slice(comma + 1)), (c) => c.charCodeAt(0));
}

function baseName(path) {
  return String(path ?? '').split(/[\\/]/).pop().replace(/\.(psd|psb)$/i, '') || 'Photoshop Panel';
}

/**
 * Build and open a panel from a Photoshop file's bytes. Returns the new panel, or null with the
 * reason already reported. ag-psd and the flattening are loaded on first use only.
 */
export async function importPsdPanelBytes(bytes, fileName = '') {
  const { planPsdPanelImport } = await import('../utils/psdPanelImport.js');
  const plan = planPsdPanelImport(bytes);
  const lines = describeSvgImport(plan);
  if (!plan.ok) {
    cerror('[psd import]', lines[0]);
    notify(lines[0], { kind: 'error', duration: 0 });
    return null;
  }

  const panel = createPanel(baseName(fileName));
  panel.width = plan.width;
  panel.height = plan.height;
  if (plan.background.dataUrl) {
    panel.bgImageEnabled = true;
    panel.bgImage = plan.background.dataUrl;
    panel.bgImageFit = 'fill';
  }
  panel.controls = buildSvgImportControls(plan);
  // What "Update Panel from Photoshop Artwork" matches against next time.
  panel.artworkImport = artworkRecord(plan, linksForNewImport(plan, panel.controls), baseName(fileName));
  addPanel(panel);

  cinfo(`[psd import] ✓ ${lines[0]} → "${panel.name}". Save it to keep it.`);
  for (const line of lines.slice(1)) cwarn(`[psd import] ${line}`);
  const trouble = plan.skipped.length + plan.warnings.length;
  notify(
    trouble
      ? `Placed ${panel.controls.length} control(s). Some layers could not be used as they are — the Console says which and why.`
      : `Placed ${panel.controls.length} control(s) on the artwork.`,
    { kind: trouble ? 'warn' : 'info', duration: trouble ? 0 : 5000 },
  );
  return panel;
}

/**
 * Update the open panel from a revised Photoshop file: controls follow their layers, new layers
 * become controls, and nothing the author did on the panel is lost (utils/svgPanelReimport.js has
 * the rules). Asks first. Returns what was applied, or null.
 */
export async function updatePanelFromPsdBytes(bytes, fileName = '', { confirm = confirmDestructive } = {}) {
  if (!get(activePanel)) {
    notify('Open the panel to update first.', { kind: 'warn' });
    return null;
  }
  const { planPsdPanelImport } = await import('../utils/psdPanelImport.js');
  const plan = planPsdPanelImport(bytes);
  if (!plan.ok) {
    const [line] = describeSvgImport(plan);
    cerror('[psd update]', line);
    notify(line, { kind: 'error', duration: 0 });
    return null;
  }
  const extension = String(fileName).match(/\.(psd|psb)$/i)?.[0] ?? '.psd';
  return updatePanelFromArtworkPlan(plan, `${baseName(fileName)}${extension}`, { confirm, tag: 'psd update' });
}

function readBytes(filePath) {
  return new Promise((resolve, reject) => {
    const requestId = `${REQUEST_PREFIX}${++requestCounter}`;
    const timer = setTimeout(() => {
      pendingReads.delete(requestId);
      reject(new Error(`Timed out reading ${filePath}`));
    }, READ_TIMEOUT_MS);
    pendingReads.set(requestId, { resolve, reject, timer });
    requestFileData(requestId, filePath);
  });
}

function ensureListeners() {
  if (listenersReady) return;
  listenersReady = true;
  onImageBrowsed(async (payload) => {
    if (!pendingBrowse || payload?.requestId !== pendingBrowse.requestId) return;
    const { handle } = pendingBrowse;
    pendingBrowse = null;
    const filePath = String(payload?.filePath ?? '').trim();
    if (!filePath) return;
    if (!/\.(psd|psb)$/i.test(filePath)) {
      notify('Choose a Photoshop .psd file.', { kind: 'warn' });
      return;
    }
    try {
      await handle(await readBytes(filePath), filePath);
    } catch (error) {
      cerror('[psd import] Could not read', filePath, '—', error.message);
      notify('Could not read the Photoshop file.', { kind: 'error', duration: 0 });
    }
  });
  onFileData((payload) => {
    const pending = pendingReads.get(payload?.requestId);
    if (!pending) return;
    pendingReads.delete(payload.requestId);
    clearTimeout(pending.timer);
    if (!payload?.data) pending.reject(new Error('The file was empty or could not be read'));
    else pending.resolve(bytesFromDataUrl(payload.data));
  });
}

function choosePsd(handle) {
  if (!isJuceAvailable()) {
    if (typeof window === 'undefined' || !window.document) return;
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = '.psd,.psb,image/vnd.adobe.photoshop';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await handle(new Uint8Array(await file.arrayBuffer()), file.name);
    };
    input.click();
    return;
  }
  ensureListeners();
  pendingBrowse = { requestId: `${REQUEST_PREFIX}browse_${++requestCounter}`, handle };
  browseImage(pendingBrowse.requestId, { patterns: '*.psd;*.psb', title: 'Photoshop artwork' });
}

/** File › New Panel from Photoshop Artwork. */
export function newPanelFromPsdArtwork() {
  choosePsd((bytes, filePath) => importPsdPanelBytes(bytes, filePath));
}

/** File › Update Panel from Photoshop Artwork. */
export function updatePanelFromPsdArtwork() {
  if (!get(activePanel)) {
    notify('Open the panel to update first.', { kind: 'warn' });
    return;
  }
  choosePsd((bytes, filePath) => updatePanelFromPsdBytes(bytes, filePath));
}
