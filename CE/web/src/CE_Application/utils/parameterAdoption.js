// parameterAdoption.js — bind a device-profile parameter's metadata onto a control.
//
// Dropping a parameter onto a control should leave the control already shaped like that
// parameter: right label, right range, right choices, right button behaviour. This runs from
// both entry points that can make that happen — the Parameter Browser's "assign to selection"
// and a drag-and-drop straight onto the canvas — which is why it lives here rather than in
// either component.
//
// The RULES live in parameterAdoptionRules.js, which imports nothing. This file is the half that
// needs a live session; the QA panel generator uses the other half from plain Node.

import { updateControlProperty } from '../stores/controls.js';
import { applyParameterAdoption } from './parameterAdoptionRules.js';

export { LABEL_BEARING_TYPES, parameterAdoptionPatches } from './parameterAdoptionRules.js';

/**
 * Apply a parameter's metadata to a control.
 * @param {string} controlId   the control receiving the parameter
 * @param {string} controlType its Core.controlType
 * @param {object} parameter   the device-profile parameter descriptor
 */
export function adoptParameterMetadata(controlId, controlType, parameter) {
  applyParameterAdoption((path, value) => updateControlProperty(controlId, path, value), controlType, parameter);
}
