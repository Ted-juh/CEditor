/**
 * authorsStateValue.js — whether a value a control's state sets is its author's, or its type's.
 *
 * A preset that needs a state merges into the one the control has, and gains only the values that
 * state does not set already: the author's number wins over the preset's (animationPresets.js,
 * animationPresetModel.js applyPresetPatch). But a control is made with states of its own, and some
 * set the very values presets ask for: every button is made pressing to 0.985 of its size
 * (models/componentTypes.js createButtonStates), so Sink (0.9) and Press squish (0.94) kept 0.985 on
 * every button and moved it by a pixel and a half. Nobody chose that 0.985 for this button; the type
 * did. A value still at what the type made is the type's, and a preset's value takes its place; a
 * value anyone has changed is theirs, and is kept.
 */
import { COMPONENT_TYPES } from '../models/componentTypes.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The state of that name (matched ignoring case) that the control's type makes, or null. */
function typeState(control, stateName) {
  const type = control?._children?.Core?.controlType;
  const states = COMPONENT_TYPES[type]?.defaultOverrides?.States?._children ?? {};
  const wanted = String(stateName ?? '').toLowerCase();
  const key = Object.keys(states).find((name) => name.toLowerCase() === wanted);
  return key ? states[key] : null;
}

/**
 * Whether `patches` (a state's `component` patches, or one part's when `part` is given) sets `path`
 * to a value of its author's: set, and not still the value the control's type made the state with.
 */
export function setByAuthor(control, stateName, patches, path, part = null) {
  if (!patches || !(path in patches)) return false;
  const made = typeState(control, stateName)?.patches;
  const madeWith = part ? made?.parts?.[part] : made?.component;
  if (!madeWith || !(path in madeWith)) return true;
  return !same(patches[path], madeWith[path]);
}
