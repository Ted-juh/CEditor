import { writable, get } from 'svelte/store';
import { deepClone } from '../utils/deepClone.js';

/**
 * One clipboard for background layers, shared by the control background editor
 * (sections/BackgroundEditor.svelte) and the PANEL background editor
 * (panels/PanelCardContent.svelte).
 *
 * It used to be the control editor's private store, so a background could be copied from one
 * control to another and nowhere else: the panel background is a separate implementation over
 * flat `panel.bgFoo` fields and had no copy or paste of any kind, which meant a gradient built on
 * a control could not be moved to the panel behind it, or the other way round, by any route at all
 * short of retyping every number.
 *
 * The payload stays in the CONTROL's dialect — `{ layerId, data }` where `data` is keyed by
 * `Background.Fill.*` property names — because that is what was already in the store and what
 * BackgroundEditor reads. The panel side translates on the way in and on the way out. The layer
 * names differ too: the panel's fourth layer is "texture", the control's is "overlay", and they
 * are the same thing (BackgroundEditor's own `panelKeyToFillProp` has always mapped Texture to
 * overlay). Translating here keeps that equivalence in one place instead of two.
 */
export const backgroundLayerClipboard = writable(null);

export function copyBackgroundLayer(payload) {
  backgroundLayerClipboard.set(payload ? deepClone(payload) : null);
}

export function getBackgroundLayerClipboard() {
  const value = get(backgroundLayerClipboard);
  return value ? deepClone(value) : null;
}

/** panel layer id → the clipboard (control) layer id it is interchangeable with. */
const PANEL_TO_CLIP_LAYER = {
  solid: 'solid',
  gradient: 'gradient',
  image: 'image',
  texture: 'overlay',
};

/**
 * Panel field ↔ control fill property, per layer.
 *
 * Only the properties both sides have are listed. The control's `*Blend`/`*ClipMode` on solid and
 * gradient have no panel equivalent and are dropped rather than invented; dropping them is why a
 * paste is a translation and not a spread.
 */
const LAYER_FIELD_MAP = {
  solid: { colour: 'bgColour' },
  gradient: {
    gradient: 'bgGradient',
    gradientOpacity: 'bgGradientOpacity',
    gradientName: 'bgGradientName',
  },
  image: imageFieldMap('image', 'bgImage'),
  overlay: imageFieldMap('overlay', 'bgTexture'),
};

function imageFieldMap(source, panelPrefix) {
  const map = { [`${source}Src`]: panelPrefix };
  for (const suffix of [
    'Opacity', 'Fit', 'Align', 'OffsetX', 'OffsetY', 'Blend', 'Blur', 'Tint',
    'FlipH', 'FlipV', 'Rotation', 'Grayscale', 'Saturation', 'Brightness', 'Contrast', 'TileScale',
  ]) {
    map[`${source}${suffix}`] = `${panelPrefix}${suffix}`;
  }
  return map;
}

/** The panel field that switches a layer on, so a paste makes the pasted layer visible. */
const PANEL_ENABLE_FIELD = {
  solid: 'bgSolid',
  gradient: 'bgGradientEnabled',
  image: 'bgImageEnabled',
  texture: 'bgTextureEnabled',
};

/**
 * A panel background layer, read out in the control's dialect. Separate from the copy below
 * because "reset this layer to the defaults" needs the translation without disturbing whatever
 * the author had actually copied.
 */
export function panelBackgroundLayerPayload(panel, panelLayerId) {
  const layerId = PANEL_TO_CLIP_LAYER[panelLayerId];
  const fields = LAYER_FIELD_MAP[layerId];
  if (!layerId || !fields || !panel) return null;

  const data = {};
  for (const [fillProp, panelField] of Object.entries(fields)) {
    const value = panel[panelField];
    if (value === undefined) continue;
    data[fillProp] = deepClone(value);
  }

  return { layerId, data };
}

/** Copy a panel background layer into the shared clipboard, in the control's dialect. */
export function copyPanelBackgroundLayer(panel, panelLayerId) {
  const payload = panelBackgroundLayerPayload(panel, panelLayerId);
  if (payload) copyBackgroundLayer(payload);
  return payload;
}

/** Can what is on the clipboard be pasted onto this panel layer? */
export function canPastePanelBackgroundLayer(clip, panelLayerId) {
  return !!clip && clip.layerId === PANEL_TO_CLIP_LAYER[panelLayerId];
}

/**
 * The `updatePanel` patch that pastes the clipboard onto a panel layer, including switching the
 * layer on — pasting an image onto a layer nobody can see is not a paste anybody wanted.
 * Returns null when the clipboard holds a different kind of layer.
 */
export function panelBackgroundLayerPatch(clip, panelLayerId) {
  if (!canPastePanelBackgroundLayer(clip, panelLayerId)) return null;
  const fields = LAYER_FIELD_MAP[clip.layerId] ?? {};

  const patch = {};
  for (const [fillProp, panelField] of Object.entries(fields)) {
    const value = clip.data?.[fillProp];
    if (value === undefined) continue;
    patch[panelField] = deepClone(value);
  }

  const enableField = PANEL_ENABLE_FIELD[panelLayerId];
  if (enableField) patch[enableField] = true;
  return patch;
}
