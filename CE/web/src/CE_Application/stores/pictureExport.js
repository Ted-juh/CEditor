// pictureExport.js — File → Export Picture: the panel, the selection or a filmstrip, as a PNG.
//
// The picture is drawn by the page's own renderer (utils/domPicture.js): the panel as it is on the
// canvas, without what only the editor shows there — the grid, guides, selection, hover and
// hidden controls — and at 1 to 4 times its size, text re-rendered at that size. A filmstrip is the
// selected control drawn at each of its values (utils/filmstripFrames.js, editor/PictureFrame.svelte)
// and stacked into one picture, the format JUCE, HISE and KnobMan read.
//
// The file is written by the app's save dialog (bridge `savePictureAs`); in a plain browser, where
// there is no app, it is downloaded instead.

import { get, writable } from 'svelte/store';
import { mount, tick, unmount } from 'svelte';
import { activePanel, panels, selectedComponentIds } from './panels.js';
import { notify } from './scriptUi.js';
import { cinfo, cwarn } from './console.js';
import { canvasPngBytes, pictureOfElement } from '../utils/domPicture.js';
import { pngWithDensity } from '../utils/pngEncode.js';
import { filmstripFrames } from '../utils/filmstripFrames.js';
import { estimateFilmstripBake } from '../utils/customComponentFilmstripBaker.js';
import { createInteractionPreviewSession } from './interactionPreview.js';
import { flatControls } from '../utils/containment.js';
import { isJuceAvailable, onPictureSaved, savePictureAs } from '../bridge/bridge.js';

/** The Export Picture window (layout/PictureExportDialog.svelte): `{ panelId, ids }` while open. */
export const pictureExportRequest = writable(null);

/**
 * The panel surface the canvas is showing, set by EditorCanvas: `{ element, panelId }`. The picture
 * is taken from it, so it is what the author sees, in Edit or in Preview.
 */
export const pictureSurface = writable(null);

/** Largest picture, in pixels a side: what a canvas in Chromium will still draw and encode. */
export const PICTURE_MAX_SIDE = 16384;
export const PICTURE_MAX_PIXELS = 120_000_000;

/** Elements only the editor draws on the canvas: left out of every picture (and the Access check). */
export const EDITOR_ONLY = [
  // The surface's own: grid, guides, the group selection and the marquee (PanelSurface).
  '.grid-overlay', '.guide-wrapper', '.selection-bounds', '.group-angle', '.marquee',
  // A control's: its handles, measurements and snap lines (CanvasControlSelectionOverlay), hit
  // zones, debug and editing badges, and the text editor open on it.
  '.resize-handle', '.rotate-zone', '.dist-label', '.dist-line', '.snap-guide',
  '.custom-hit-zone-overlay', '.custom-hit-zone-label-tray', '.interaction-debug-badge',
  '.radio-edit-target-badge', '.inline-text-editor',
  // Preview's open list, and controls hidden in the editor (Preview does not draw them at all).
  '.panel-combobox-menu', '.hidden-component',
].join(',');

/** Classes that mark a control's editor state, not its look: taken off the copy. */
export const EDITOR_STATE_CLASSES = [
  'selected', 'key-object', 'custom-component-hint', 'locked', 'lock-click-through', 'editor-draggable',
  'dragging', 'drop-target', 'device-drop-compatible', 'device-drop-warning', 'device-drop-incompatible',
  'preview-keyboard-focus', 'preview-highlighted', 'mouse-focus-outline', 'device-drop-background',
];

/** What the editor puts on the surface itself — its zoom, its frame and its shadow — taken off the copy. */
export const SURFACE_ROOT_STYLE = 'transform:none;border:0;box-shadow:none;border-radius:0;overflow:hidden;margin:0;left:0;top:0';

const controlIdOf = (control) => String(control?._children?.Core?.id ?? '');

/** The menu command: open the window for the active panel and its selection. */
export function openPictureExport() {
  const panel = get(activePanel);
  if (!panel) { notify('Open a panel to export a picture of it.', { kind: 'warn' }); return; }
  pictureExportRequest.set({ panelId: panel.id, ids: [...(get(selectedComponentIds) ?? [])].map(String) });
}

/** A file name from a panel or control name: what is safe in a file name on every system. */
export function pictureFileName(name, suffix = '') {
  const base = String(name ?? '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Panel';
  return `${base}${suffix}.png`;
}

/** The size a picture will be, and whether it can be made: what the window shows before Export. */
export function pictureSize(width, height, scale) {
  const pixelWidth = Math.max(1, Math.round(width * scale));
  const pixelHeight = Math.max(1, Math.round(height * scale));
  const tooLarge = pixelWidth > PICTURE_MAX_SIDE || pixelHeight > PICTURE_MAX_SIDE || pixelWidth * pixelHeight > PICTURE_MAX_PIXELS;
  return { pixelWidth, pixelHeight, tooLarge };
}

// --- Saving --------------------------------------------------------------------------------------

function base64Of(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

let saveListener = null;
let pendingSave = null;

/** The bytes to a file the author names. Resolves to { ok, filePath } or { ok: false, cancelled }. */
export function savePictureFile(suggestedName, bytes) {
  if (!isJuceAvailable()) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return Promise.resolve({ ok: true, filePath: suggestedName, downloaded: true });
  }
  if (!saveListener) {
    saveListener = onPictureSaved((result) => {
      const resolve = pendingSave;
      pendingSave = null;
      resolve?.(result ?? { ok: false });
    });
  }
  // One dialog at a time: a second Export while the first dialog is open answers the first.
  pendingSave?.({ ok: false, cancelled: true });
  return new Promise((resolve) => {
    pendingSave = resolve;
    savePictureAs(suggestedName, base64Of(bytes));
  });
}

function reportSaved(result, what) {
  if (result?.ok) {
    notify(result.downloaded ? `${what} downloaded.` : `${what} saved to ${result.filePath}.`, { kind: 'info' });
    cinfo(`[picture] ${what} written: ${result.filePath}`);
  } else if (!result?.cancelled) {
    notify(`${what} could not be written${result?.filePath ? ` to ${result.filePath}` : ''}.`, { kind: 'error', duration: 0 });
  }
  return result;
}

function reportGaps(picture) {
  const gaps = [
    ...picture.missing.map((url) => `a file that could not be read (${url.slice(0, 120)})`),
    ...picture.unreadable,
    ...picture.unresolved.map((id) => `a reference to ${id}, which is not on the page`),
  ];
  if (gaps.length) {
    cwarn(`[picture] Drawn without: ${gaps.join('; ')}`);
    notify(`The picture was drawn without ${gaps.length === 1 ? gaps[0] : `${gaps.length} things it uses (see the Console)`}.`, { kind: 'warn' });
  }
}

// --- The panel and the selection -----------------------------------------------------------------

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Waits for a large panel's surface to finish mounting (utils/progressiveMount.js). */
export async function surfaceReady(element, timeoutMs = 20000) {
  const started = Date.now();
  while (element.hasAttribute('data-mount-pending') && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await tick();
  await nextFrame();
}

export function liveSurface(panelId) {
  const surface = get(pictureSurface);
  if (!surface?.element?.isConnected) return null;
  if (panelId && surface.panelId !== panelId) return null;
  return surface.element;
}

/** Where a live element sits on the panel, in panel pixels, whatever the canvas zoom. */
function panelRectOf(surface, elements) {
  const surfaceRect = surface.getBoundingClientRect();
  const zoom = surface.offsetWidth ? surfaceRect.width / surface.offsetWidth : 1;
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
  for (const element of elements) {
    // The control and everything it draws: a knob's scale can reach outside its box.
    for (const node of [element, ...element.querySelectorAll('*')]) {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) continue;
      left = Math.min(left, rect.left); top = Math.min(top, rect.top);
      right = Math.max(right, rect.right); bottom = Math.max(bottom, rect.bottom);
    }
  }
  if (!Number.isFinite(left)) return null;
  const x0 = (left - surfaceRect.left) / zoom - surface.clientLeft;
  const y0 = (top - surfaceRect.top) / zoom - surface.clientTop;
  return { x: x0, y: y0, width: (right - left) / zoom, height: (bottom - top) / zoom };
}

function controlElements(surface, ids) {
  const wanted = new Set(ids.map(String));
  return [...surface.querySelectorAll('.canvas-control[data-control-id]')]
    .filter((element) => wanted.has(element.getAttribute('data-control-id')));
}

/**
 * The picture of the panel on the canvas, or of part of it.
 *
 *   what        'panel' | 'selection'
 *   scale       1..4 (device pixels per panel pixel)
 *   alone       for a selection: only the selected controls, on transparency; otherwise the panel
 *               behind them is in the picture too
 *   margin      for a selection: panel pixels around it
 *
 * Resolves to { ok, canvas, bytes, width, height, … } or { ok: false, reason }.
 */
export async function renderPanelPicture({ panelId, what = 'panel', ids = [], scale = 1, alone = false, margin = 0 } = {}) {
  const panel = (panelId ? get(panels).find((entry) => entry.id === panelId) : null) ?? get(activePanel);
  const surface = liveSurface(panelId ?? panel?.id);
  if (!surface) return { ok: false, reason: 'The panel is not on the canvas. Show it in the editor, then export.' };
  await surfaceReady(surface);

  const width = panel?.width ?? surface.clientWidth;
  const height = panel?.height ?? surface.clientHeight;
  let region = { x: 0, y: 0, width, height };
  let skip = (node) => node.matches?.(EDITOR_ONLY) ?? false;

  if (what === 'selection') {
    const chosen = controlElements(surface, ids);
    if (!chosen.length) return { ok: false, reason: 'Nothing selected is on the canvas.' };
    const rect = panelRectOf(surface, chosen);
    if (!rect) return { ok: false, reason: 'The selection draws nothing.' };
    const m = Math.max(0, Number(margin) || 0);
    const x = Math.floor(rect.x - m);
    const y = Math.floor(rect.y - m);
    region = { x, y, width: Math.ceil(rect.x + rect.width + m) - x, height: Math.ceil(rect.y + rect.height + m) - y };
    if (alone) {
      // The selected controls and what they draw, and of everything else only the elements that
      // lead down to them: a control inside a container keeps the container's box (it is placed
      // in it) but not its plate, its label or its other children.
      const chosenSet = new Set(chosen);
      const insideChosen = (node) => {
        for (let p = node.parentElement; p && p !== surface; p = p.parentElement) if (chosenSet.has(p)) return true;
        return false;
      };
      const editorOnly = skip;
      skip = (node) => {
        if (editorOnly(node)) return true;
        if (chosenSet.has(node) || insideChosen(node)) return false;
        return !chosen.some((element) => node.contains(element));
      };
    }
  }

  const size = pictureSize(region.width, region.height, scale);
  if (size.tooLarge) {
    return { ok: false, reason: `At ${scale}× the picture would be ${size.pixelWidth} × ${size.pixelHeight} pixels, more than can be drawn. Choose a smaller size.` };
  }

  const picture = await pictureOfElement(surface, {
    region,
    scale,
    skip,
    adjust: (copy) => { for (const name of EDITOR_STATE_CLASSES) copy.classList?.remove(name); },
    rootStyle: SURFACE_ROOT_STYLE,
  });
  reportGaps(picture);
  return { ok: true, ...picture };
}

/** The menu's Export: render, then save. */
export async function exportPanelPicture(options = {}) {
  const panel = get(activePanel);
  const rendered = await renderPanelPicture({ panelId: panel?.id, ...options });
  if (!rendered.ok) { notify(rendered.reason, { kind: 'warn' }); return rendered; }
  const bytes = pngWithDensity(await canvasPngBytes(rendered.canvas), options.scale ?? 1);
  const names = options.what === 'selection' ? selectionName(panel, options.ids) : '';
  const suggested = pictureFileName(panel?.name, names ? ` - ${names}` : (options.scale > 1 ? ` @${options.scale}x` : ''));
  return reportSaved(await savePictureFile(suggested, bytes), 'The picture');
}

function selectionName(panel, ids = []) {
  const wanted = new Set(ids.map(String));
  const chosen = flatControls(panel?.controls ?? []).filter((control) => wanted.has(controlIdOf(control)));
  if (chosen.length === 1) return String(chosen[0]?._children?.Core?.name ?? chosen[0]?._children?.Core?.id ?? 'Selection');
  return 'Selection';
}

// --- Filmstrips ----------------------------------------------------------------------------------

/**
 * A filmstrip of one control: every frame drawn by PictureFrame, off screen, and stacked.
 *
 *   frames       how many, for a control with a range (a switch has two, a list one per entry)
 *   orientation  'vertical' (frames one under another, as JUCE and KnobMan expect) | 'horizontal'
 *   scale        1..4
 *   margin       panel pixels around the control in each frame
 *
 * Resolves to { ok, canvas, frameCount, frameWidth, frameHeight } or { ok: false, reason }.
 */
export async function renderFilmstrip(control, { frames = 64, orientation = 'vertical', scale = 1, margin = 0 } = {}) {
  const plan = filmstripFrames(control, frames, createInteractionPreviewSession(control));
  if (!plan.ok) return { ok: false, reason: `No filmstrip: ${plan.reason}.` };
  const transform = plan.control?._children?.Transform ?? {};
  const m = Math.max(0, Math.round(Number(margin) || 0));
  const frameWidth = Math.max(1, Math.round(Number(transform.width) || 1)) + m * 2;
  const frameHeight = Math.max(1, Math.round(Number(transform.height) || 1)) + m * 2;
  const count = plan.frames.length;
  const estimate = estimateFilmstripBake(control, { frameWidth, frameHeight, frameCount: count, orientation, outputScale: scale });
  if (estimate.blocked) {
    return { ok: false, reason: `The filmstrip would be ${estimate.canvasWidth} × ${estimate.canvasHeight} pixels (${estimate.blockReason}). Use fewer frames or a smaller size.` };
  }
  // Loaded here rather than at the top so this file stays importable where there is no Svelte
  // compiler (the node tests read pictureFileName and pictureSize from it).
  const { default: PictureFrame } = await import('../editor/PictureFrame.svelte');
  const outW = estimate.outputFrameWidth;
  const outH = estimate.outputFrameHeight;
  const strip = document.createElement('canvas');
  strip.width = orientation === 'horizontal' ? outW * count : outW;
  strip.height = orientation === 'horizontal' ? outH : outH * count;
  const ctx = strip.getContext('2d');

  // Off screen but laid out: a picture needs real boxes and real computed styles.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-${frameWidth + 100000}px;top:0;width:${frameWidth}px;height:${frameHeight}px;pointer-events:none;contain:strict;`;
  document.body.appendChild(host);
  const gaps = { missing: [], unreadable: [], unresolved: [] };
  try {
    for (let i = 0; i < count; i += 1) {
      const instance = mount(PictureFrame, {
        target: host,
        props: { control: plan.control, session: plan.frames[i].session, width: frameWidth, height: frameHeight, margin: m },
      });
      try {
        await tick();
        await waitForImages(host);
        await nextFrame();
        const frameElement = host.firstElementChild;
        const picture = await pictureOfElement(frameElement, { scale: estimate.outputScale, region: { x: 0, y: 0, width: frameWidth, height: frameHeight } });
        for (const key of Object.keys(gaps)) gaps[key].push(...picture[key]);
        const x = orientation === 'horizontal' ? i * outW : 0;
        const y = orientation === 'horizontal' ? 0 : i * outH;
        ctx.drawImage(picture.canvas, x, y, outW, outH);
      } finally {
        unmount(instance);
      }
    }
  } finally {
    host.remove();
  }
  reportGaps({ missing: [...new Set(gaps.missing)], unreadable: [...new Set(gaps.unreadable)], unresolved: [...new Set(gaps.unresolved)] });
  return { ok: true, canvas: strip, frameCount: count, frameWidth: outW, frameHeight: outH, orientation, kind: plan.kind };
}

async function waitForImages(root, timeoutMs = 5000) {
  const pending = [...root.querySelectorAll('img')].filter((img) => !img.complete);
  if (!pending.length) return;
  await Promise.race([
    Promise.all(pending.map((img) => new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; }))),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** The menu's filmstrip Export: the one selected control, rendered, then saved. */
export async function exportFilmstrip(options = {}) {
  const panel = get(activePanel);
  const id = String(options.controlId ?? '');
  const control = flatControls(panel?.controls ?? []).find((entry) => controlIdOf(entry) === id);
  if (!control) { notify('Select the control to make a filmstrip of.', { kind: 'warn' }); return { ok: false }; }
  const rendered = await renderFilmstrip(control, options);
  if (!rendered.ok) { notify(rendered.reason, { kind: 'warn' }); return rendered; }
  const bytes = pngWithDensity(await canvasPngBytes(rendered.canvas), options.scale ?? 1);
  const name = String(control._children?.Core?.name ?? id);
  const suggested = pictureFileName(name, ` - ${rendered.frameCount} frames`);
  cinfo(`[picture] Filmstrip of ${name}: ${rendered.frameCount} frames of ${rendered.frameWidth} × ${rendered.frameHeight}, ${rendered.orientation}`);
  return reportSaved(await savePictureFile(suggested, bytes), 'The filmstrip');
}
