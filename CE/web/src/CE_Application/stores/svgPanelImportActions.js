// svgPanelImportActions.js — File › New Panel from SVG Artwork.
//
// The same three layers as panel sharing, for the same reasons:
//
//   utils/svgPanelImport.js   the convention and the geometry. No bridge, no stores. Tested in node.
//   here                      the command: choose a file, read it, make the panel, say what happened.
//
// The result is always a NEW panel. Importing into the open one would have to decide what happens to
// its background and to controls already sitting where placeholders are, and every answer to that
// loses someone's work; a new panel loses nothing, and its controls can be copied across.

import {
  browseImage,
  isJuceAvailable,
  onFileData,
  onImageBrowsed,
  requestFileData,
} from '../bridge/bridge.js';
import { addPanel } from './panels.js';
import { createPanel } from './panelModel.js';
import { cerror, cinfo, cwarn } from './console.js';
import { notify } from './scriptUi.js';
import { buildSvgImportControls, describeSvgImport, planSvgPanelImport } from '../utils/svgPanelImport.js';

const READ_TIMEOUT_MS = 15000;
const REQUEST_PREFIX = 'svgpanel_';

let requestCounter = 0;
let pendingBrowse = '';
const pendingReads = new Map();
let listenersReady = false;

/** Decode what requestFileData returns — base64, always. */
function textFromDataUrl(dataUrl) {
  const comma = String(dataUrl ?? '').indexOf(',');
  if (comma < 0) return '';
  const binary = atob(String(dataUrl).slice(comma + 1));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function baseName(path) {
  return String(path ?? '').split(/[\\/]/).pop().replace(/\.svg$/i, '') || 'SVG Panel';
}

/**
 * Build and open a panel from SVG text. Split from the file picking so the part that matters is
 * reachable without a backend. Returns the new panel, or null with the reason already reported.
 */
export function importSvgPanelText(text, fileName = '') {
  const plan = planSvgPanelImport(text);
  const lines = describeSvgImport(plan);
  if (!plan.ok) {
    cerror('[svg import]', lines[0]);
    notify(lines[0], { kind: 'error', duration: 0 });
    return null;
  }

  const panel = createPanel(baseName(fileName));
  panel.width = plan.width;
  panel.height = plan.height;
  panel.bgImageEnabled = true;
  panel.bgImage = plan.background.dataUrl;
  panel.bgImageFit = 'fill';
  // Names are per panel, and this one is new — nothing to collide with but its own placeholders.
  panel.controls = buildSvgImportControls(plan);
  addPanel(panel);

  cinfo(`[svg import] ✓ ${lines[0]} → "${panel.name}". Save it to keep it.`);
  for (const line of lines.slice(1)) cwarn(`[svg import] ${line}`);
  const unplaced = plan.skipped.length;
  notify(
    unplaced
      ? `Placed ${panel.controls.length} control(s); ${unplaced} placeholder(s) could not be placed — the Console says which and why.`
      : `Placed ${panel.controls.length} control(s) on the artwork.`,
    { kind: unplaced ? 'warn' : 'info', duration: unplaced ? 0 : 5000 },
  );
  return panel;
}

function readSvgText(filePath) {
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

  // The image browser is shared with the panel background and asset pickers; the requestId is how
  // this command knows the answer is its own.
  onImageBrowsed(async (payload) => {
    if (!pendingBrowse || payload?.requestId !== pendingBrowse) return;
    pendingBrowse = '';
    const filePath = String(payload?.filePath ?? '').trim();
    if (!filePath) return;
    if (!/\.svg$/i.test(filePath)) {
      notify('Choose an .svg file — a bitmap has no placeholder layer to read.', { kind: 'warn' });
      return;
    }
    try {
      importSvgPanelText(await readSvgText(filePath), filePath);
    } catch (error) {
      cerror('[svg import] Could not read', filePath, '—', error.message);
      notify('Could not read the SVG file.', { kind: 'error', duration: 0 });
    }
  });

  // `fileData` is multicast to every listener; each filters by its own requestId prefix.
  onFileData((payload) => {
    const pending = pendingReads.get(payload?.requestId);
    if (!pending) return;
    pendingReads.delete(payload.requestId);
    clearTimeout(pending.timer);
    if (!payload?.data) pending.reject(new Error('The file was empty or could not be read'));
    else pending.resolve(textFromDataUrl(payload.data));
  });
}

function fallbackPicker() {
  if (typeof window === 'undefined' || !window.document) return;
  const input = window.document.createElement('input');
  input.type = 'file';
  input.accept = '.svg,image/svg+xml';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (file) importSvgPanelText(await file.text(), file.name);
  };
  input.click();
}

/** The menu command. */
export function newPanelFromSvgArtwork() {
  if (!isJuceAvailable()) {
    fallbackPicker();
    return;
  }
  ensureListeners();
  pendingBrowse = `${REQUEST_PREFIX}browse_${++requestCounter}`;
  browseImage(pendingBrowse);
}
