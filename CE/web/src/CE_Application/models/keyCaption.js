// A key's caption, on, off or mixed: lettered for the panel it stands on.
//
// A toggle is made with Selected and Mixed states that letter its caption in the set's inverse text
// colour (models/componentTypes.js createButtonStates). That is for a flat face, which the same
// states fill with the checked or mixed colour: the words sit on the fill, and the inverse colour is
// what reads there. A button a set draws as a key built from parts (models/buttonDeviceParts.js)
// fills no face; its caption stands on the panel beside the key, and the inverse colour is the one
// made NOT to read on a panel. In Ivory, Pop and Atelier, light panels whose inverse text is white, a
// toggle's caption went white as it went on and could not be read (1.2 to 1.4:1). Mixed went wrong in
// more sets, since a set's inverse text is so often its own panel's colour: under 3:1 in 26 of them,
// most at about 1:1, the word simply gone.
//
// So on a key, a Selected or Mixed caption colour still at what the type made the state with is
// dropped, and the caption keeps its own colour on, off or mixed. A colour anyone chose for it is kept
// (utils/authorsStateValue.js). A flat face keeps the inverse colour, as it fills.

import { buttonDeviceDrawn } from './buttonDeviceParts.js';
import { setByAuthor } from '../utils/authorsStateValue.js';

const CAPTION = 'Text.Fill.colour';
const FILLED_FACE_STATES = ['Selected', 'Mixed'];

/** The control with its key's caption lettered for the panel on, off or mixed, or the same control. */
export function withKeyCaptionOnPanel(control) {
  if (!buttonDeviceDrawn(control)) return control;
  const states = control?._children?.States;
  const children = states?._children;
  if (!children) return control;
  let changed = null;
  for (const name of FILLED_FACE_STATES) {
    const state = children[name];
    const component = state?.patches?.component;
    if (!component || !(CAPTION in component) || setByAuthor(control, name, component, CAPTION)) continue;
    const { [CAPTION]: _faceInk, ...rest } = component;
    changed ??= {};
    changed[name] = { ...state, patches: { ...state.patches, component: rest } };
  }
  if (!changed) return control;
  return { ...control, _children: { ...control._children, States: { ...states, _children: { ...children, ...changed } } } };
}
