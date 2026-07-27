// parameterAdoption.js — bind a device-profile parameter's metadata onto a control.
//
// Dropping a parameter onto a control should leave the control already shaped like that
// parameter: right label, right range, right choices, right button behaviour. This runs from
// both entry points that can make that happen — the Parameter Browser's "assign to selection"
// and a drag-and-drop straight onto the canvas — which is why it lives here rather than in
// either component.

import { updateControlProperty } from '../stores/controls.js';

// Controls whose main visible text IS their label, so a parameter name belongs in Text.content.
// Deliberately narrower than "every type with a Text section": a Meter, Envelope or Matrix has
// text too, but stamping a parameter name across it is not what the author asked for.
export const LABEL_BEARING_TYPES = [
  'Button', 'MomentaryButton', 'TimedButton', 'OneShotButton', 'ToggleButton',
  'RadioButtonGroup', 'CyclicButton', 'Combobox', 'Label',
];

/**
 * Apply a parameter's metadata to a control.
 * @param {string} controlId   the control receiving the parameter
 * @param {string} controlType its Core.controlType
 * @param {object} parameter   the device-profile parameter descriptor
 */
export function adoptParameterMetadata(controlId, controlType, parameter) {
  const shortLabel = parameter?.display?.shortLabel || parameter?.name || parameter?.id;
  if (shortLabel && LABEL_BEARING_TYPES.includes(controlType)) {
    updateControlProperty(controlId, 'Text.content', shortLabel);
  }

  if (parameter?.type === 'integer' || parameter?.type === 'float' || parameter?.type === 'bipolar') {
    const min = Number(parameter?.range?.min ?? 0);
    const max = Number(parameter?.range?.max ?? 127);
    const value = Number(parameter?.default ?? min);
    updateControlProperty(controlId, 'Behavior.min', min);
    updateControlProperty(controlId, 'Behavior.max', max);
    updateControlProperty(controlId, 'Behavior.defaultCurrentValue', value);
    updateControlProperty(controlId, 'Behavior.valueType', parameter.type === 'float' ? 'float' : 'int');
  }

  if (parameter?.type === 'choice' && Array.isArray(parameter?.choices)) {
    updateControlProperty(controlId, 'Value.rows', parameter.choices.map((choice, index) => ({
      id: choice.id ?? `choice_${index + 1}`,
      displayText: choice.label ?? choice.id ?? String(choice.value ?? index),
      internalValue: choice.id ?? String(choice.value ?? index),
      sendValue: choice.value ?? index,
      receiveValue: choice.value ?? index,
      selectedByDefault: (choice.id ?? String(choice.value)) === parameter.default,
      enabled: true,
      visualOverrides: {},
    })));
    updateControlProperty(controlId, 'Behavior.valueType', 'enum');
    updateControlProperty(controlId, 'Behavior.defaultValue', parameter.default ?? parameter.choices[0]?.id ?? '');
  }

  if (parameter?.type === 'boolean') {
    updateControlProperty(controlId, 'Behavior.family', 'select');
    updateControlProperty(controlId, 'Behavior.role', 'toggle');
    updateControlProperty(controlId, 'Behavior.valueType', 'bool');
    updateControlProperty(controlId, 'Behavior.defaultValue', parameter.default === true);
    updateControlProperty(controlId, 'Behavior.allowMixed', false);
  }

  if (parameter?.type === 'action' || parameter?.type === 'momentary') {
    updateControlProperty(controlId, 'Behavior.family', 'trigger');
    updateControlProperty(controlId, 'Behavior.role', 'button');
    updateControlProperty(controlId, 'Behavior.valueType', 'none');
    if (controlType === 'TimedButton') {
      updateControlProperty(controlId, 'Behavior.buttonType', 'timed');
      updateControlProperty(controlId, 'Behavior.subtype', 'hold_to_confirm');
    } else if (controlType === 'OneShotButton') {
      updateControlProperty(controlId, 'Behavior.buttonType', 'one_shot');
      updateControlProperty(controlId, 'Behavior.subtype', 'single_use');
    } else {
      updateControlProperty(controlId, 'Behavior.buttonType', parameter.type === 'momentary' ? 'momentary' : 'one_shot');
      updateControlProperty(controlId, 'Behavior.subtype', parameter.type === 'momentary' ? 'momentary' : 'action');
    }
  }
}
