// designerColourTarget.js — in the Component Designer, the dock's Colors tab edits the selected layer.

import { get } from 'svelte/store';
import { activateColorTarget, clearColorTarget, colorTarget } from './colorTarget.js';
import { updateControlProperty } from './controls.js';
import { isFramesImage } from '../utils/imageFrames.js';
import { litLayerOf, pictureColourSettings, pictureLayerKind } from '../utils/pictureRecolour.js';

/**
 * What the designer and the dock need to know of a layer to edit its colour: `kind` ('picture',
 * 'frames', 'light' or '' for a shape, text and the rest; utils/pictureRecolour.js), and for a picture
 * its colour's and drawn colour's paths (part-relative), their values, the picture as drawn
 * (`source`: a frame of frames, the one shown at rest) and, for light, the layer it lights (`lights`).
 */
export function designerLayerLook(name, part, parts) {
  const kind = pictureLayerKind(part, name);
  if (!kind) return { name, kind: '' };
  const settings = pictureColourSettings(part);
  const image = part?._children?.Image;
  let source = '';
  if (isFramesImage(image)) {
    const at = Math.max(0, Math.min(image.frames.length - 1, Math.round(Number(image.frameIndex) || 0)));
    source = String(image.frames[at]?.source || image.frames.find((frame) => frame?.source)?.source || '');
  } else {
    source = String(part?._children?.Background?._children?.Fill?.imageSrc ?? '');
  }
  return {
    name, kind, colourPath: settings.path, drawnPath: settings.drawnPath, colour: settings.colour, drawn: settings.drawn,
    source, lights: kind === 'light' ? litLayerOf(name, parts) : '',
  };
}

const isPicture = (look) => look?.kind === 'picture' || look?.kind === 'frames';

/**
 * The Colors tab's target while the designer is open: the fill of the layers selected on its
 * surface, or null when none is (or the designer is closed).
 *
 * With no swatch clicked, the dock edits the panel background. In the designer that panel is out of
 * sight behind the component, so the tab read "Editing: Panel background" beside a selected layer,
 * and a drag on the picker repainted a panel nobody could see. Now the selected layer is what the
 * tab edits, as it is for the look bar and the Shapes panel beside it. Several layers selected take
 * the colour together, as the look bar's Fill does.
 *
 * `status` is componentDesignerStatus. `_designerFill` names the selection the target was made for.
 */
export function designerFillTarget(status) {
  const controlId = status?.kind ? status.controlId : '';
  const selected = Array.isArray(status?.layers) ? status.layers : [];
  if (!controlId || !selected.length) return null;
  // A picture's colour is its own (utils/pictureRecolour.js), not a fill it does not draw; light has
  // no colour of its own to change (the dock says which layer it lights instead).
  const looks = new Map((Array.isArray(status?.looks) ? status.looks : []).map((look) => [look.name, look]));
  const layers = selected.filter((name) => looks.get(name)?.kind !== 'light');
  if (!layers.length) return null;
  const pathOf = (name) => (isPicture(looks.get(name)) ? looks.get(name).colourPath : 'Background.Fill.colour');
  const pictures = layers.filter((name) => isPicture(looks.get(name)));
  const what = pictures.length === layers.length ? 'Colour' : (pictures.length ? 'Fill and colour' : 'Fill');
  const key = `${controlId}:${layers.join(',')}`;
  if (layers.length === 1) {
    const name = layers[0];
    const target = { type: 'control', controlId, path: `Parts.${name}.${pathOf(name)}`, label: `${name} › ${what}`, _designerFill: key };
    if (pictures.length) target._picture = { name, controlId, drawnPath: `Parts.${name}.${looks.get(name).drawnPath}` };
    return target;
  }
  return {
    type: 'callback',
    label: `${layers.length} layers › ${what}`,
    _designerFill: key,
    // Writes the value to each layer's colour, so a set colour (a role) can be linked here too.
    acceptsRoles: true,
    controlId,
    apply: (hex) => {
      for (const name of layers) updateControlProperty(controlId, `Parts.${name}.${pathOf(name)}`, hex);
    },
  };
}

let followed = null;

/**
 * Keep the dock on the designer's selection. A new selection arms its fill; a swatch the author
 * clicks after that (a stroke, a text colour) keeps the dock until the selection changes again.
 * When the dock lets go of its target (Done, or the dock closing), the selection's fill takes it
 * again, so the tab never falls back to the hidden panel.
 *
 * `fill` is the first selected layer's colour, where the picker starts.
 */
export function followDesignerFill(target, fill) {
  const key = target?._designerFill ?? null;
  const current = get(colorTarget);
  if (key === followed && (current || !target)) return;
  const previous = followed;
  followed = key;
  if (target) {
    activateColorTarget(target, fill || 'FF5B9BD5');
  } else if (previous && current && (current._designerFill || current.controlId === previous.split(':')[0] || String(current._swatchKey ?? '').startsWith('surface:'))) {
    // Nothing is selected any more: a target armed for the old selection does not outlive it.
    clearColorTarget();
  }
}
