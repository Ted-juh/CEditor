// designerColourTarget.js — in the Component Designer, the dock's Colors tab edits the selected layer.

import { get } from 'svelte/store';
import { activateColorTarget, clearColorTarget, colorTarget } from './colorTarget.js';
import { updateControlProperty } from './controls.js';

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
  const layers = Array.isArray(status?.layers) ? status.layers : [];
  if (!controlId || !layers.length) return null;
  const key = `${controlId}:${layers.join(',')}`;
  if (layers.length === 1) {
    return { type: 'control', controlId, path: `Parts.${layers[0]}.Background.Fill.colour`, label: `${layers[0]} › Fill`, _designerFill: key };
  }
  return {
    type: 'callback',
    label: `${layers.length} layers › Fill`,
    _designerFill: key,
    apply: (hex) => {
      for (const name of layers) updateControlProperty(controlId, `Parts.${name}.Background.Fill.colour`, hex);
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
