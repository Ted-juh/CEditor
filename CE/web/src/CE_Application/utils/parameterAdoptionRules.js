// parameterAdoptionRules.js — what a device parameter implies about the control bound to it.
//
// The rules only; no store, no imports that reach one. That is the whole reason this file exists
// separately from parameterAdoption.js: the editor applies these through updateControlProperty
// inside a live session, and the QA panel generator applies them in plain Node with no session at
// all. A second copy of the rules in tools/ would drift from this one the first time a parameter
// type was added — which is precisely how QA-06 shipped its first draft with every knob reading
// 0..1 and every combobox saying "Option 1": the sheet set the binding and never adopted anything.

// Controls whose main visible text IS their label, so a parameter name belongs in Text.content.
// Deliberately narrower than "every type with a Text section": a Meter, Envelope or Matrix has
// text too, but stamping a parameter name across it is not what the author asked for.
export const LABEL_BEARING_TYPES = [
  'Button', 'MomentaryButton', 'TimedButton', 'OneShotButton', 'ToggleButton',
  'RadioButtonGroup', 'CyclicButton', 'Combobox', 'Label',
];

/**
 * Write a parameter's metadata onto a control through an abstract setter.
 * @param {(path: string, value: unknown) => void} set  receives 'Section.path' and a value
 * @param {string} controlType  the control's Core.controlType
 * @param {object} parameter    the device-profile parameter descriptor
 */
export function applyParameterAdoption(set, controlType, parameter) {
  const shortLabel = parameter?.display?.shortLabel || parameter?.name || parameter?.id;
  if (shortLabel && LABEL_BEARING_TYPES.includes(controlType)) {
    set('Text.content', shortLabel);
  }

  if (parameter?.type === 'integer' || parameter?.type === 'float' || parameter?.type === 'bipolar') {
    const min = Number(parameter?.range?.min ?? 0);
    const max = Number(parameter?.range?.max ?? 127);
    const value = Number(parameter?.default ?? min);
    set('Behavior.min', min);
    set('Behavior.max', max);
    set('Behavior.defaultCurrentValue', value);
    set('Behavior.valueType', parameter.type === 'float' ? 'float' : 'int');

    // The readout's range, when the profile says it differs from the wire's. The GAIA stores Octave
    // Shift 61..67 and prints -3..+3; adopting only the wire range put 64 on screen where the
    // instrument shows 0, on every bipolar parameter it has. `display.min/max` has been in the
    // profile since it was written — nothing between the profile and the screen read it.
    const displayMin = Number(parameter?.display?.min);
    const displayMax = Number(parameter?.display?.max);
    const remapped = Number.isFinite(displayMin) && Number.isFinite(displayMax)
      && (displayMin !== min || displayMax !== max);
    set('Behavior.displayMin', remapped ? displayMin : null);
    set('Behavior.displayMax', remapped ? displayMax : null);
    if (parameter?.display?.unit) set('Behavior.unit', String(parameter.display.unit));
    if (remapped && displayMin < 0) set('Behavior.showSign', true);
  }

  if (parameter?.type === 'choice' && Array.isArray(parameter?.choices)) {
    set('Value.rows', parameter.choices.map((choice, index) => ({
      id: choice.id ?? `choice_${index + 1}`,
      displayText: choice.label ?? choice.id ?? String(choice.value ?? index),
      internalValue: choice.id ?? String(choice.value ?? index),
      sendValue: choice.value ?? index,
      receiveValue: choice.value ?? index,
      selectedByDefault: (choice.id ?? String(choice.value)) === parameter.default,
      enabled: true,
      visualOverrides: {},
    })));
    set('Behavior.valueType', 'enum');
    set('Behavior.defaultValue', parameter.default ?? parameter.choices[0]?.id ?? '');
  }

  if (parameter?.type === 'boolean') {
    set('Behavior.family', 'select');
    set('Behavior.role', 'toggle');
    set('Behavior.valueType', 'bool');
    set('Behavior.defaultValue', parameter.default === true);
    set('Behavior.allowMixed', false);
  }

  if (parameter?.type === 'action' || parameter?.type === 'momentary') {
    set('Behavior.family', 'trigger');
    set('Behavior.role', 'button');
    set('Behavior.valueType', 'none');
    if (controlType === 'TimedButton') {
      set('Behavior.buttonType', 'timed');
      set('Behavior.subtype', 'hold_to_confirm');
    } else if (controlType === 'OneShotButton') {
      set('Behavior.buttonType', 'one_shot');
      set('Behavior.subtype', 'single_use');
    } else {
      set('Behavior.buttonType', parameter.type === 'momentary' ? 'momentary' : 'one_shot');
      set('Behavior.subtype', parameter.type === 'momentary' ? 'momentary' : 'action');
    }
  }
}

/** The same rules as a plain `{ 'Section.path': value }` object, for callers with no store. */
export function parameterAdoptionPatches(controlType, parameter) {
  const patches = {};
  applyParameterAdoption((path, value) => { patches[path] = value; }, controlType, parameter);
  return patches;
}
