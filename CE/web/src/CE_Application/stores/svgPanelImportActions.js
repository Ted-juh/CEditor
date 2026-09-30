// svgPanelImportActions.js — File › New Panel from SVG Artwork, and File › Update Panel from SVG Artwork.
//
// The same layers as panel sharing, for the same reasons:
//
//   utils/svgPanelImport.js     the convention and the geometry. No bridge, no stores. Tested in node.
//   utils/svgPanelReimport.js   matching a revised drawing to the panel it made. Pure, tested in node.
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
import { notify } from './scriptUi.js';
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
let pendingBrowse = null;   // { requestId, handle(text, filePath) }
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
  // What "Update Panel from SVG Artwork" matches against next time.
  panel.artworkImport = artworkRecord(plan, linksForNewImport(plan, panel.controls), baseName(fileName));
  addPanel(panel);
  embedArtworkFonts(panel.id, plan.background.svg);

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

/**
 * Update the open panel from a revised drawing. Shows what it will do and asks first, because the
 * background image is outside undo (history.js excludes panel images to keep snapshots small): undo
 * puts the controls back, but not the old artwork. Returns what was applied, or null.
 */
export function updatePanelFromSvgText(text, fileName = '', { confirm = confirmDestructive } = {}) {
  const panel = get(activePanel);
  if (!panel) {
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

  const update = planSvgPanelReimport(panel, plan, { fileName: baseName(fileName) });
  const lines = describeSvgReimport(update);
  const skipped = plan.skipped.map((skip) => `Skipped ${skip.source}: ${skip.reason}`);
  const question = [
    `Update "${panel.name}" from ${baseName(fileName)}.svg?`,
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
    bgImageEnabled: true,
    bgImage: plan.background.dataUrl,
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

  embedArtworkFonts(panel.id, plan.background.svg);
  cinfo(`[svg update] ✓ "${panel.name}" from ${baseName(fileName)}.svg: ${update.moves.length} moved, `
    + `${update.added.length} added, ${update.unchanged} unchanged.`);
  for (const line of [...lines.slice(1), ...skipped]) cwarn(`[svg update] ${line}`);
  notify(
    reimportIsEmpty(update)
      ? 'The artwork was replaced; every control was already in place.'
      : `Updated from the artwork: ${update.moves.length} moved, ${update.added.length} added.`
        + (update.kept.length ? ` ${update.kept.length} kept without a placeholder — see the Console.` : ''),
    { kind: update.kept.length || skipped.length ? 'warn' : 'info', duration: update.kept.length ? 0 : 5000 },
  );
  return update;
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
    if (!pendingBrowse || payload?.requestId !== pendingBrowse.requestId) return;
    const { handle } = pendingBrowse;
    pendingBrowse = null;
    const filePath = String(payload?.filePath ?? '').trim();
    if (!filePath) return;
    if (!/\.svg$/i.test(filePath)) {
      notify('Choose an .svg file — a bitmap has no placeholder layer to read.', { kind: 'warn' });
      return;
    }
    try {
      handle(await readSvgText(filePath), filePath);
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

function fallbackPicker(handle) {
  if (typeof window === 'undefined' || !window.document) return;
  const input = window.document.createElement('input');
  input.type = 'file';
  input.accept = '.svg,image/svg+xml';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (file) handle(await file.text(), file.name);
  };
  input.click();
}

function chooseSvg(handle) {
  if (!isJuceAvailable()) {
    fallbackPicker(handle);
    return;
  }
  ensureListeners();
  pendingBrowse = { requestId: `${REQUEST_PREFIX}browse_${++requestCounter}`, handle };
  browseImage(pendingBrowse.requestId);
}

/** File › New Panel from SVG Artwork. */
export function newPanelFromSvgArtwork() {
  chooseSvg((text, filePath) => importSvgPanelText(text, filePath));
}

/** File › Update Panel from SVG Artwork. */
export function updatePanelFromSvgArtwork() {
  if (!get(activePanel)) {
    notify('Open the panel to update first.', { kind: 'warn' });
    return;
  }
  chooseSvg((text, filePath) => updatePanelFromSvgText(text, filePath));
}
