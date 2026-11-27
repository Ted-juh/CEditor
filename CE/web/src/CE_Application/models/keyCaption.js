// A key's caption, on or off: lettered for the panel it stands on.
//
// A toggle is made with a Selected state that letters its caption in the set's inverse text colour
// (models/componentTypes.js createButtonStates). That is for
// a flat face, which the same state fills with the checked colour: the words sit on the fill, and
// the inverse colour is what reads there. A button a set draws as a key built from parts
// (models/buttonDeviceParts.js) fills no face; its caption stands on the panel beside the key, and
// the inverse colour is the one made NOT to read on a panel. In Ivory, Pop and Atelier, light panels
// whose inverse text is white, a toggle's caption went white as it went on and could not be read
// (1.2 to 1.4:1); in the other sets that draw a key the inverse colour happened to be the caption's
// own, and nothing changes there.
//
// So on a key, a Selected caption colour still at what the type made the state with is dropped,
// and the caption keeps its own colour on or off. A colour anyone chose for it is kept
// (utils/authorsStateValue.js). A flat face keeps the inverse colour, as it fills.
//
// The Mixed state letters its caption the same way, and on a key it reads under 3:1 in 26 sets;
// changing it changes 33 sets' look and 46 starter panels, so it is the owner's call and is left as
// it is (docs/design/component-presets.md, The Button).

import { buttonDeviceDrawn } from './buttonDeviceParts.js';
import { setByAuthor } from '../utils/authorsStateValue.js';

const CAPTION = 'Text.Fill.colour';
const FILLED_FACE_STATES = ['Selected'];

/** The control with its key's caption lettered for the panel on or off, or the same control. */
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
