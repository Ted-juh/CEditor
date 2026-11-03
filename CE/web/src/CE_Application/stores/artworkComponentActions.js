// artworkComponentActions.js — File › New Component from SVG Artwork / from Photoshop Artwork.
//
//   utils/svgComponentImport.js   an SVG's shapes as vector layers. Pure, tested in node.
//   utils/psdComponentImport.js   a Photoshop file's layers as picture layers. Pure, tested in node.
//   utils/artworkComponent.js     what the names make move, and the wiring for it.
//   here                          the commands: choose a file, read it, open the component, report.
//
// The component opens in the Component Designer as a new, unsaved component, every layer there to
// change; saving or exporting it is as for any component. The file choosers are the panel
// importers' (stores/svgPanelImportActions.js, stores/psdPanelImportActions.js).

import { chooseSvg } from './svgPanelImportActions.js';
import { choosePsd } from './psdPanelImportActions.js';
import { createComponentDocument } from './componentWorkspace.js';
import { setActiveEditorTab } from './panels.js';
import { cerror, cinfo, cwarn } from './console.js';
import { notify } from './scriptUi.js';
import { describeArtworkComponent } from '../utils/artworkComponent.js';
import { isJuceAvailable, onFileData, requestFileData } from '../bridge/bridge.js';

const baseName = (path, fallback) => String(path ?? '').split(/[\\/]/).pop() || fallback;

/** Open a planned component in the Component Designer, and say what it is. Returns the document. */
export function openArtworkComponent(plan, tag) {
  if (!plan?.ok) {
    cerror(`[${tag}]`, plan?.error ?? 'nothing to import');
    notify(plan?.error ?? 'Nothing to import.', { kind: 'error', duration: 0 });
    return null;
  }
  const document = createComponentDocument({ control: plan.component, name: plan.name });
  if (document?.id) setActiveEditorTab({ type: 'component', id: document.id });
  const summary = describeArtworkComponent(plan, plan.layers);
  cinfo(`[${tag}] ✓ ${summary} Save or export it to keep it.`);
  for (const line of plan.warnings) cwarn(`[${tag}] ${line}`);
  notify(plan.warnings.length ? `${summary} Some of it is drawn differently: the Console says what.` : summary,
    { kind: plan.warnings.length ? 'warn' : 'info', duration: plan.warnings.length ? 0 : 6000 });
  return document;
}

// Linked pictures: an SVG that names `photo.png` beside it. The desktop app reads them from disk
// through the bridge, as the panel importers read their files; a browser cannot, and they are
// reported as not read.
const READ_TIMEOUT_MS = 30000;
let readCounter = 0;
const pendingReads = new Map();
let listening = false;

export function readFileAsDataUrl(filePath) {
  if (!listening) {
    listening = true;
    onFileData((payload) => {
      const pending = pendingReads.get(payload?.requestId);
      if (!pending) return;
      pendingReads.delete(payload.requestId);
      clearTimeout(pending.timer);
      pending.resolve(typeof payload?.data === 'string' && payload.data.startsWith('data:') ? payload.data : '');
    });
  }
  return new Promise((resolve) => {
    const requestId = `artworklink_${++readCounter}`;
    const timer = setTimeout(() => { pendingReads.delete(requestId); resolve(''); }, READ_TIMEOUT_MS);
    pendingReads.set(requestId, { resolve, timer });
    requestFileData(requestId, filePath);
  });
}

/** Where `href` points, beside the SVG at `svgPath`; '' for a web address or nothing to read. */
export function linkedPicturePath(href, svgPath) {
  const link = decodeURIComponent(String(href ?? '').trim());
  if (!link || /^(data|https?):/i.test(link)) return '';
  if (/^file:\/\//i.test(link)) return link.replace(/^file:\/\/\/?/i, /^file:\/\/\/[A-Za-z]:/i.test(link) ? '' : '/');
  if (/^([A-Za-z]:[\\/]|\/|\\\\)/.test(link)) return link;
  const separator = String(svgPath).includes('\\') ? '\\' : '/';
  const folder = String(svgPath ?? '').replace(/[\\/][^\\/]*$/, '');
  return folder ? `${folder}${separator}${link.replace(/[\\/]/g, separator)}` : '';
}

async function linkedPictures(text, svgPath) {
  if (!isJuceAvailable() || !svgPath) return {};
  const hrefs = new Set([...String(text).matchAll(/<image\b[^>]*?\s(?:xlink:)?href\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]));
  const files = {};
  for (const href of hrefs) {
    const path = linkedPicturePath(href, svgPath);
    if (path) files[href] = await readFileAsDataUrl(path);
  }
  return files;
}

/** Build and open a component from an SVG file's text. */
export async function importSvgComponentText(text, filePath = '') {
  const [{ planSvgComponentImport }, { loadGeometry }] = await Promise.all([
    import('../utils/svgComponentImport.js'),
    import('../utils/partOutlines.js'),
  ]);
  // Paper.js, to cut a clipped shape to its clip path; without it the clip is the layer's mask.
  const geometry = await loadGeometry().catch(() => null);
  const files = await linkedPictures(text, filePath);
  return openArtworkComponent(planSvgComponentImport(text, { fileName: baseName(filePath, 'Artwork.svg'), files, geometry }), 'svg component');
}

/** Build and open a component from a Photoshop file's bytes. ag-psd loads on first use. */
export async function importPsdComponentBytes(bytes, filePath = '') {
  const [{ planPsdComponentImport }, { loadGeometry }] = await Promise.all([
    import('../utils/psdComponentImport.js'),
    import('../utils/partOutlines.js'),
  ]);
  // Paper.js, to combine a shape layer's paths by their operations.
  const geometry = await loadGeometry().catch(() => null);
  return openArtworkComponent(planPsdComponentImport(bytes, { fileName: baseName(filePath, 'Artwork.psd'), geometry }), 'psd component');
}

/** File › New Component from SVG Artwork. */
export function newComponentFromSvgArtwork() {
  chooseSvg((text, filePath) => importSvgComponentText(text, filePath));
}

/** File › New Component from Photoshop Artwork. */
export function newComponentFromPsdArtwork() {
  choosePsd((bytes, filePath) => importPsdComponentBytes(bytes, filePath));
}
