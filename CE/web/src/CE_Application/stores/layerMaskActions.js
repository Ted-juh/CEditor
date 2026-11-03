// layerMaskActions.js — what the dock's Mask tab edits, and how it writes it.
//
// The Mask tab edits the mask of the layer selected in the Component Designer: the first of its
// selected layers (componentDesignerStatus), on the control the designer holds, which is a control
// on the open panel or a component open on its own. The mask itself is the part's `mask`
// (utils/partMask.js), written whole, so one change is one undo step.

import { isJuceAvailable, browseImage, onImageBrowsed } from '../bridge/bridge.js';
import { updateControlProperty } from './controls.js';
import { readFileAsDataUrl } from './artworkComponentActions.js';
import { flatControls } from '../utils/containment.js';
import { partFrame } from '../utils/customDesignSurfaceGeometry.js';
import { brightnessToAlpha } from '../utils/partMask.js';
import { numberOr } from '../utils/primitives.js';
import { whyNoOutline } from '../utils/partOutlines.js';

/**
 * The layer the Mask tab edits, or null: `{ controlId, control, layer, part, mask, frame, artboard,
 * layers }`, where `layers` names every other layer with an outline (what Mask With Layer offers,
 * hidden ones included: a layer kept only to mask is usually hidden). `status` is
 * componentDesignerStatus; `panelControls` the open panel's controls; `standalone` the component
 * open on its own, if any.
 */
export function designerMaskTarget(status, panelControls = [], standalone = null) {
  const controlId = status?.kind ? status.controlId : '';
  const layer = Array.isArray(status?.layers) ? status.layers[0] : '';
  if (!controlId || !layer) return null;
  const control = standalone?._children?.Core?.id === controlId
    ? standalone
    : flatControls(panelControls ?? []).find((entry) => entry?._children?.Core?.id === controlId) ?? null;
  const children = control?._children?.Parts?._children ?? null;
  const part = children?.[layer] ?? null;
  if (!part) return null;
  const transform = control._children.Transform ?? {};
  const artboard = { width: Math.max(1, numberOr(transform.width, 220)), height: Math.max(1, numberOr(transform.height, 120)) };
  return {
    controlId,
    control,
    layer,
    part,
    mask: part.mask && typeof part.mask === 'object' ? part.mask : null,
    frame: partFrame(part, artboard.width, artboard.height),
    artboard,
    layers: Object.keys(children).filter((name) => name !== layer && !whyNoOutline(children[name])),
  };
}

/** Write the layer's mask whole; null deletes it. */
export function writeLayerMask(controlId, layer, mask) {
  if (!controlId || !layer) return;
  updateControlProperty(controlId, `Parts.${layer}.mask`, mask ?? null);
}

// --- Load Image… ---------------------------------------------------------------------------------

let browseCounter = 0;
let pendingBrowse = null;
let browseListening = false;

function browserPicker() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.document) { resolve(''); return; }
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.svg';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(''); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

/** Ask for a picture: the app's own dialog, or the browser's. Resolves to a data URL, or ''. */
export function chooseMaskPicture() {
  if (!isJuceAvailable()) return browserPicker();
  if (!browseListening) {
    browseListening = true;
    onImageBrowsed(async (result) => {
      if (!pendingBrowse || result?.requestId !== pendingBrowse.requestId) return;
      const { resolve } = pendingBrowse;
      pendingBrowse = null;
      resolve(result?.filePath ? await readFileAsDataUrl(result.filePath) : '');
    });
  }
  return new Promise((resolve) => {
    pendingBrowse?.resolve('');
    pendingBrowse = { requestId: `layermask_${++browseCounter}`, resolve };
    browseImage(pendingBrowse.requestId, { title: 'Load a picture as the layer mask' });
  });
}

/**
 * The picture made a mask: a picture with transparency is its own mask, as is any SVG; an opaque
 * one becomes white with its brightness as alpha (utils/partMask.js brightnessToAlpha), drawn
 * through a canvas.
 */
export async function pictureAsMask(dataUrl) {
  if (!dataUrl || /^data:image\/svg/i.test(dataUrl) || typeof document === 'undefined') return dataUrl;
  const image = new Image();
  image.src = dataUrl;
  try { await image.decode(); } catch { return dataUrl; }
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!(width > 0 && height > 0)) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height);
  if (!brightnessToAlpha(pixels.data)) return dataUrl;
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}
