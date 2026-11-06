// svgPanelImportActions.js — File › New Panel from Vector Artwork, and File › Update Panel from Vector
// Artwork: an SVG, a PDF, or an Illustrator file saved with PDF compatibility.
//
// The same layers as panel sharing, for the same reasons:
//
//   utils/svgPanelImport.js     the convention and the geometry. No bridge, no stores. Tested in node.
//   utils/svgPanelReimport.js   matching a revised drawing to the panel it made. Pure, tested in node.
//   utils/pdfArtwork.js         a PDF or an .ai as the SVG the two above read. Tested in node.
//   here                        the commands: choose a file, read it, change the panels, report.
//
// "New" always makes a new panel. "Update" changes the open one, and only in the ways
// svgPanelReimport.js lists — geometry of matched controls, new controls, the size and the background
// — after showing what it will do.

import {
  browseImage,
  isJuceAvailable,
  onFileData,
  onImageBrowsed,
  requestFileData,
} from '../bridge/bridge.js';
import { get } from 'svelte/store';

import { activePanel, addPanel, panels } from './panels.js';
import { createPanel } from './panelModel.js';
import { updatePanelInList } from './panelDocumentHelpers.js';
import { cerror, cinfo, cwarn } from './console.js';
import { notify, openDialog } from './scriptUi.js';
import { confirmDestructive } from '../utils/confirmDiscard.js';
import { buildSvgImportControls, describeSvgImport, planSvgPanelImport, svgDataUrl } from '../utils/svgPanelImport.js';
import { embedSvgFonts } from '../utils/svgArtworkFonts.js';
import {
  artworkRecord,
  describeSvgReimport,
  linksForNewImport,
  planSvgPanelReimport,
  reimportIsEmpty,
} from '../utils/svgPanelReimport.js';

const READ_TIMEOUT_MS = 15000;
const REQUEST_PREFIX = 'svgpanel_';

let requestCounter = 0;
let pendingBrowse = null;   // { requestId, handle(svgText, filePath, origin) }
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
  return String(path ?? '').split(/[\\/]/).pop().replace(/\.(svg|pdf|ai)$/i, '') || 'SVG Panel';
}

const fileNameOf = (path) => String(path ?? '').split(/[\\/]/).pop();
const VECTOR_FILE = /\.(svg|pdf|ai)$/i;
const PDF_FILE = /\.(pdf|ai)$/i;

/** Where an artwork read from a PDF came from, for a report: "the PDF part of Knob.ai, artboard 2 of 3". */
export function pdfOriginText(origin) {
  if (!origin) return '';
  const where = origin.pages > 1 ? `, ${origin.illustrator ? 'artboard' : 'page'} ${origin.page} of ${origin.pages}` : '';
  return `${origin.illustrator ? 'the PDF part of ' : ''}${origin.fileName}${where}`;
}

/** Which page of a PDF with several to read: the app's list dialog. Its number, or null to stop. */
function askPage(fileName, pages, labels, illustrator) {
  const word = illustrator ? 'Artboard' : 'Page';
  const items = Array.from({ length: pages }, (_, i) => {
    const label = String(labels?.[i] ?? '').trim();
    return label && label !== String(i + 1) ? `${i + 1} · ${label}` : `${word} ${i + 1}`;
  });
  return new Promise((resolve) => {
    const id = openDialog({
      ask: 'list',
      title: `Which ${word.toLowerCase()}?`,
      message: `${fileName} has ${pages} ${word.toLowerCase()}s. One is read; choose which.`,
      items,
      accept: 'Import',
      cancel: 'Cancel',
    }, (answer) => resolve(answer ? items.indexOf(answer) + 1 : null));
    // Another dialog is open: the first.
    if (id == null) resolve(1);
  });
}

/**
 * A PDF's or an .ai's bytes as SVG text, through utils/pdfArtwork.js (pdf.js loads on first use):
 * `{ svg, origin }`, origin `{ fileName, page, pages, layers, notes, illustrator }`; or null with the
 * reason reported (nothing reported when the author cancelled the choice of page).
 */
export async function svgFromPdfBytes(bytes, filePath, { pdfjs = null } = {}) {
  const { readPdfArtwork, describePdfNotes } = await import('../utils/pdfArtwork.js');
  const fileName = fileNameOf(filePath) || 'Artwork.pdf';
  const illustrator = /\.ai$/i.test(fileName);
  const result = await readPdfArtwork(bytes, { pdfjs, choosePage: (pages, labels) => askPage(fileName, pages, labels, illustrator) });
  if (!result.ok) {
    if (result.reason !== 'cancelled') {
      cerror('[pdf import]', result.error);
      notify(result.error, { kind: 'error', duration: 0 });
    }
    return null;
  }
  return {
    svg: result.svg,
    origin: {
      fileName, page: result.page, pages: result.pages, layers: result.layers,
      // An .ai is read through its PDF part; a .pdf is one, whoever wrote it.
      notes: describePdfNotes(result.notes), illustrator,
    },
  };
}

/** Hand `handle` an artwork file's SVG text: an SVG's own, or a PDF's or an .ai's read from its bytes. */
async function deliver(handle, filePath, text, bytes) {
  if (!PDF_FILE.test(filePath)) return handle(await text(), filePath, null);
  const read = await svgFromPdfBytes(await bytes(), filePath);
  return read ? handle(read.svg, filePath, read.origin) : null;
}

/**
 * Carry the fonts the artwork's text names inside it (utils/svgArtworkFonts.js), then swap the
 * panel's background for that copy. Afterwards, not before: the panel opens at once, and the fonts
 * are found, subset and embedded in the font worker while the author looks at it. A font nothing
 * can supply is reported, with what to do about it. Returns the promise, for the tests.
 */
export function embedArtworkFonts(panelId, svgText) {
  return embedSvgFonts(svgText).then(({ svg, embedded, missing }) => {
    if (embedded.length) {
      panels.update((list) => updatePanelInList(list, panelId, (current) => ({ ...current, bgImage: svgDataUrl(svg) })));
      cinfo(`[svg import] carried in the artwork: ${embedded.join(', ')}`);
    }
    if (missing.length) {
      cwarn(`[svg import] The artwork's text uses ${missing.join(', ')}, which CEditor cannot supply, so it draws in a fallback font. `
        + 'Import the font (Settings → Fonts) and re-import, or convert the text to outlines in the drawing program.');
      notify(`Text in the artwork uses ${missing.join(', ')}, which is not available — it will draw in a fallback font. See the Console.`, { kind: 'warn', duration: 0 });
    }
    return { embedded, missing };
  }).catch((error) => {
    cwarn('[svg import] the artwork\'s fonts could not be embedded', error);
    return { embedded: [], missing: [] };
  });
}

/**
 * Build and open a panel from SVG text. Split from the file picking so the part that matters is
 * reachable without a backend. Returns the new panel, or null with the reason already reported.
 */
export function importSvgPanelText(text, fileName = '', origin = null) {
  const plan = planSvgPanelImport(text);
  if (plan.ok && origin) plan.warnings = [...(plan.warnings ?? []), ...origin.notes];
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
  // What "Update Panel from Vector Artwork" matches against next time.
  panel.artworkImport = artworkRecord(plan, linksForNewImport(plan, panel.controls), baseName(fileName));
  addPanel(panel);
  embedArtworkFonts(panel.id, plan.background.svg);

  const from = origin ? `, read from ${pdfOriginText(origin)}` : '';
  cinfo(`[svg import] ✓ ${lines[0]}${from} → "${panel.name}". Save it to keep it.`);
  for (const line of [...lines.slice(1), ...(origin?.notes ?? [])]) cwarn(`[svg import] ${line}`);
  const unplaced = plan.skipped.length;
  // A PDF keeps a layer's name and nothing below it, so its placeholders are typed by colour and shape.
  const unnamed = origin && plan.placeholders.some((placeholder) => !placeholder.name)
    ? ' The placeholders were typed by their colour and shape, since a PDF keeps no names for them; rename the controls as you need.'
    : '';
  notify(
    unplaced
      ? `Placed ${panel.controls.length} control(s)${from}; ${unplaced} placeholder(s) could not be placed — the Console says which and why.${unnamed}`
      : `Placed ${panel.controls.length} control(s) on the artwork${from}.${unnamed}`,
    { kind: unplaced ? 'warn' : 'info', duration: unplaced || unnamed ? 0 : 5000 },
  );
  return panel;
}

/**
 * Update the open panel from a revised drawing. Shows what it will do and asks first, because the
 * background image is outside undo (history.js excludes panel images to keep snapshots small): undo
 * puts the controls back, but not the old artwork. Returns what was applied, or null.
 */
export function updatePanelFromSvgText(text, fileName = '', { confirm = confirmDestructive, origin = null } = {}) {
  if (!get(activePanel)) {
    notify('Open the panel to update first.', { kind: 'warn' });
    return null;
  }
  const plan = planSvgPanelImport(text);
  if (!plan.ok) {
    const [line] = describeSvgImport(plan);
    cerror('[svg update]', line);
    notify(line, { kind: 'error', duration: 0 });
    return null;
  }
  if (origin) plan.warnings = [...(plan.warnings ?? []), ...origin.notes];
  const fileLabel = origin ? pdfOriginText(origin).replace(/^the PDF part of /, '') : `${baseName(fileName)}.svg`;
  const update = updatePanelFromArtworkPlan(plan, fileLabel, { confirm, tag: 'svg update' });
  if (update) embedArtworkFonts(get(activePanel)?.id, plan.background.svg);
  return update;
}

/**
 * The update itself, for any artwork format whose importer produces a plan of this shape (the SVG
 * and Photoshop importers both do): match, ask, apply, report. `fileLabel` is the file as the
 * question and the report name it. Returns what was applied, or null.
 */
export function updatePanelFromArtworkPlan(plan, fileLabel, { confirm = confirmDestructive, tag = 'artwork update' } = {}) {
  const panel = get(activePanel);
  if (!panel) {
    notify('Open the panel to update first.', { kind: 'warn' });
    return null;
  }
  const update = planSvgPanelReimport(panel, plan, { fileName: fileLabel.replace(/\.[a-z]+$/i, '') });
  const lines = describeSvgReimport(update);
  const skipped = plan.skipped.map((skip) => `Skipped ${skip.source}: ${skip.reason}`);
  const warnings = plan.warnings ?? [];
  const question = [
    `Update "${panel.name}" from ${fileLabel}?`,
    '',
    ...lines,
    ...(skipped.length ? ['', ...skipped] : []),
    '',
    'Undo restores the controls and the size, but not the previous background image.',
  ].join('\n');
  if (!confirm(question)) return null;

  const moves = new Map(update.moves.map((move) => [move.controlId, move.to]));
  panels.update((list) => updatePanelInList(list, panel.id, (current) => ({
    ...current,
    width: plan.width,
    height: plan.height,
    ...(plan.background?.dataUrl ? { bgImageEnabled: true, bgImage: plan.background.dataUrl } : {}),
    artworkImport: update.record,
    controls: [
      ...(current.controls ?? []).map((control) => {
        const to = moves.get(control?._children?.Core?.id);
        if (!to) return control;
        return { ...control, _children: { ...control._children, Transform: { ...control._children.Transform, ...to } } };
      }),
      ...update.added,
    ],
    modified: true,
  })));

  cinfo(`[${tag}] ✓ "${panel.name}" from ${fileLabel}: ${update.moves.length} moved, `
    + `${update.added.length} added, ${update.unchanged} unchanged.`);
  for (const line of [...lines.slice(1), ...skipped, ...warnings]) cwarn(`[${tag}] ${line}`);
  notify(
    reimportIsEmpty(update)
      ? 'The artwork was replaced; every control was already in place.'
      : `Updated from the artwork: ${update.moves.length} moved, ${update.added.length} added.`
        + (update.kept.length ? ` ${update.kept.length} kept without a placeholder — see the Console.` : ''),
    { kind: update.kept.length || skipped.length ? 'warn' : 'info', duration: update.kept.length ? 0 : 5000 },
  );
  return update;
}

/** A file through the bridge: its text, or with `bytes` its bytes. */
function readFile(filePath, { bytes = false } = {}) {
  return new Promise((resolve, reject) => {
    const requestId = `${REQUEST_PREFIX}${++requestCounter}`;
    const timer = setTimeout(() => {
      pendingReads.delete(requestId);
      reject(new Error(`Timed out reading ${filePath}`));
    }, READ_TIMEOUT_MS);
    pendingReads.set(requestId, { resolve, reject, timer, bytes });
    requestFileData(requestId, filePath);
  });
}

/** Decode what requestFileData returns as bytes. */
function bytesFromDataUrl(dataUrl) {
  const comma = String(dataUrl ?? '').indexOf(',');
  if (comma < 0) return new Uint8Array(0);
  return Uint8Array.from(atob(String(dataUrl).slice(comma + 1)), (c) => c.charCodeAt(0));
}

function ensureListeners() {
  if (listenersReady) return;
  listenersReady = true;

  // The image browser is shared with the panel background and asset pickers; the requestId is how
  // this command knows the answer is its own.
  onImageBrowsed(async (payload) => {
    if (!pendingBrowse || payload?.requestId !== pendingBrowse.requestId) return;
    const { handle } = pendingBrowse;
    pendingBrowse = null;
    const filePath = String(payload?.filePath ?? '').trim();
    if (!filePath) return;
    if (!VECTOR_FILE.test(filePath)) {
      notify('Choose an .svg, .pdf or .ai file — a bitmap has no layers to read.', { kind: 'warn' });
      return;
    }
    try {
      await deliver(handle, filePath, () => readFile(filePath), () => readFile(filePath, { bytes: true }));
    } catch (error) {
      cerror('[svg import] Could not read', filePath, '—', error.message);
      notify('Could not read the artwork file.', { kind: 'error', duration: 0 });
    }
  });

  // `fileData` is multicast to every listener; each filters by its own requestId prefix.
  onFileData((payload) => {
    const pending = pendingReads.get(payload?.requestId);
    if (!pending) return;
    pendingReads.delete(payload.requestId);
    clearTimeout(pending.timer);
    if (!payload?.data) pending.reject(new Error('The file was empty or could not be read'));
    else pending.resolve(pending.bytes ? bytesFromDataUrl(payload.data) : textFromDataUrl(payload.data));
  });
}

function fallbackPicker(handle) {
  if (typeof window === 'undefined' || !window.document) return;
  const input = window.document.createElement('input');
  input.type = 'file';
  input.accept = '.svg,.pdf,.ai,image/svg+xml,application/pdf';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (file) await deliver(handle, file.name, () => file.text(), async () => new Uint8Array(await file.arrayBuffer()));
  };
  input.click();
}

/**
 * Ask for vector artwork (an SVG, a PDF, or an Illustrator file saved with PDF compatibility), then
 * `handle(svgText, filePath, origin)`: the app's own dialog, or the browser's. `origin` is null for an
 * SVG, and says where a PDF's artwork came from (see svgFromPdfBytes).
 */
export function chooseVectorArtwork(handle) {
  if (!isJuceAvailable()) {
    fallbackPicker(handle);
    return;
  }
  ensureListeners();
  pendingBrowse = { requestId: `${REQUEST_PREFIX}browse_${++requestCounter}`, handle };
  browseImage(pendingBrowse.requestId, { patterns: '*.svg;*.pdf;*.ai', title: 'Vector artwork (SVG, PDF, Illustrator)' });
}

/** File › New Panel from Vector Artwork. */
export function newPanelFromSvgArtwork() {
  chooseVectorArtwork((text, filePath, origin) => importSvgPanelText(text, filePath, origin));
}

/** File › Update Panel from Vector Artwork. */
export function updatePanelFromSvgArtwork() {
  if (!get(activePanel)) {
    notify('Open the panel to update first.', { kind: 'warn' });
    return;
  }
  chooseVectorArtwork((text, filePath, origin) => updatePanelFromSvgText(text, filePath, { origin }));
}
