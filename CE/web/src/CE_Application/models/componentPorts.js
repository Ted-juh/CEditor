export const PARAMETER_TYPES = {
  INTEGER: 'integer',
  FLOAT: 'float',
  BIPOLAR: 'bipolar',
  BOOLEAN: 'boolean',
  CHOICE: 'choice',
  CHOICE_STEPPED: 'choice-stepped',
  ENUM: 'enum',
  TEXT: 'text',
  PATCH_NAME: 'patchName',
  ACTION: 'action',
  MOMENTARY: 'momentary',
  DUMP_REQUEST: 'dumpRequest',
  RAW_MIDI_ACTION: 'rawMidiAction',
  NORMALIZED: 'normalized',
  TIME: 'time',
};

export const DEFAULT_COMPONENT_PORTS = {
  Button: [
    {
      id: 'trigger',
      label: 'Trigger',
      accepts: [PARAMETER_TYPES.ACTION, PARAMETER_TYPES.MOMENTARY, PARAMETER_TYPES.DUMP_REQUEST, PARAMETER_TYPES.RAW_MIDI_ACTION],
      defaultBindingMode: 'explicitAction',
    },
  ],
  MomentaryButton: [
    {
      id: 'trigger',
      label: 'Trigger',
      accepts: [PARAMETER_TYPES.ACTION, PARAMETER_TYPES.MOMENTARY, PARAMETER_TYPES.DUMP_REQUEST, PARAMETER_TYPES.RAW_MIDI_ACTION],
      defaultBindingMode: 'explicitAction',
    },
  ],
  TimedButton: [
    {
      id: 'trigger',
      label: 'Trigger',
      accepts: [PARAMETER_TYPES.ACTION, PARAMETER_TYPES.DUMP_REQUEST, PARAMETER_TYPES.RAW_MIDI_ACTION],
      defaultBindingMode: 'explicitAction',
    },
  ],
  OneShotButton: [
    {
      id: 'trigger',
      label: 'Trigger',
      accepts: [PARAMETER_TYPES.ACTION, PARAMETER_TYPES.DUMP_REQUEST, PARAMETER_TYPES.RAW_MIDI_ACTION],
      defaultBindingMode: 'explicitAction',
    },
  ],
  ToggleButton: [
    {
      id: 'state',
      label: 'State',
      accepts: [PARAMETER_TYPES.BOOLEAN, PARAMETER_TYPES.ENUM],
      defaultBindingMode: 'onCommit',
      warnings: {
        enum: 'Only two-choice enum parameters should be bound to a toggle.',
      },
    },
  ],
  RadioButtonGroup: [
    {
      id: 'selectedChoice',
      label: 'Selected Choice',
      accepts: [PARAMETER_TYPES.CHOICE, PARAMETER_TYPES.ENUM],
      defaultBindingMode: 'onCommit',
    },
  ],
  CyclicButton: [
    {
      id: 'selectedChoice',
      label: 'Selected Choice',
      accepts: [PARAMETER_TYPES.CHOICE, PARAMETER_TYPES.ENUM],
      defaultBindingMode: 'onCommit',
    },
  ],
  Combobox: [
    {
      id: 'selectedChoice',
      label: 'Selected Choice',
      accepts: [PARAMETER_TYPES.CHOICE, PARAMETER_TYPES.ENUM],
      defaultBindingMode: 'onCommit',
    },
  ],
  Listbox: [
    {
      id: 'selectedChoice',
      label: 'Selected Choice',
      accepts: [PARAMETER_TYPES.CHOICE, PARAMETER_TYPES.ENUM],
      defaultBindingMode: 'onCommit',
    },
  ],
  TextInput: [
    {
      id: 'text',
      label: 'Text',
      accepts: [PARAMETER_TYPES.TEXT, PARAMETER_TYPES.PATCH_NAME],
      defaultBindingMode: 'onCommit',
    },
  ],
  Range: [
    {
      id: 'value',
      label: 'Value',
      accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.BIPOLAR, PARAMETER_TYPES.NORMALIZED],
      defaultBindingMode: 'continuous',
    },
  ],
  Number: [
    {
      id: 'value',
      label: 'Value',
      accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.BIPOLAR, PARAMETER_TYPES.NORMALIZED],
      defaultBindingMode: 'continuous',
    },
  ],
  Slider: [
    {
      id: 'value',
      label: 'Value',
      accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.BIPOLAR, PARAMETER_TYPES.NORMALIZED],
      defaultBindingMode: 'continuous',
    },
  ],
  Knob: [
    {
      id: 'value',
      label: 'Value',
      accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.BIPOLAR, PARAMETER_TYPES.NORMALIZED],
      defaultBindingMode: 'continuous',
    },
  ],
  LcdDisplay: [
    {
      id: 'text',
      label: 'Text',
      accepts: [PARAMETER_TYPES.TEXT, PARAMETER_TYPES.PATCH_NAME, PARAMETER_TYPES.ENUM],
      defaultBindingMode: 'onCommit',
    },
    {
      id: 'value',
      label: 'Value',
      accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.BIPOLAR, PARAMETER_TYPES.NORMALIZED],
      defaultBindingMode: 'continuous',
    },
    {
      id: 'brightness',
      label: 'Brightness',
      accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.NORMALIZED],
      defaultBindingMode: 'continuous',
    },
    {
      id: 'backlight',
      label: 'Backlight',
      accepts: [PARAMETER_TYPES.BOOLEAN, PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.NORMALIZED],
      defaultBindingMode: 'onCommit',
    },
  ],
  PixelDisplay: [
    {
      id: 'value',
      label: 'Value',
      accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.BIPOLAR, PARAMETER_TYPES.NORMALIZED],
      defaultBindingMode: 'continuous',
    },
    {
      id: 'text',
      label: 'Text',
      accepts: [PARAMETER_TYPES.TEXT, PARAMETER_TYPES.PATCH_NAME, PARAMETER_TYPES.ENUM],
      defaultBindingMode: 'onCommit',
    },
    {
      id: 'brightness',
      label: 'Brightness',
      accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.NORMALIZED],
      defaultBindingMode: 'continuous',
    },
    {
      id: 'backlight',
      label: 'Backlight',
      accepts: [PARAMETER_TYPES.BOOLEAN, PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.NORMALIZED],
      defaultBindingMode: 'onCommit',
    },
  ],
  Meter: [
    {
      id: 'level',
      label: 'Level',
      accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.BIPOLAR, PARAMETER_TYPES.NORMALIZED],
      defaultBindingMode: 'continuous',
    },
  ],
  Envelope: [
    // Common stage parameters — the typical ADSR/DAHDSR device bindings. (Full
    // per-node fan-out binding is a later capability; these cover the usual case.)
    { id: 'attack', label: 'Attack', accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.NORMALIZED], defaultBindingMode: 'continuous' },
    { id: 'decay', label: 'Decay', accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.NORMALIZED], defaultBindingMode: 'continuous' },
    { id: 'sustain', label: 'Sustain', accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.NORMALIZED], defaultBindingMode: 'continuous' },
    { id: 'release', label: 'Release', accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.NORMALIZED], defaultBindingMode: 'continuous' },
  ],
  CustomComponent: [
    {
      id: 'mainValue',
      label: 'Main Value',
      accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.BIPOLAR, PARAMETER_TYPES.NORMALIZED],
      defaultBindingMode: 'continuous',
    },
    {
      id: 'mode',
      label: 'Mode',
      accepts: [PARAMETER_TYPES.BOOLEAN, PARAMETER_TYPES.CHOICE, PARAMETER_TYPES.ENUM],
      defaultBindingMode: 'onCommit',
    },
    {
      id: 'trigger',
      label: 'Trigger',
      accepts: [PARAMETER_TYPES.ACTION, PARAMETER_TYPES.MOMENTARY, PARAMETER_TYPES.RAW_MIDI_ACTION],
      defaultBindingMode: 'explicitAction',
    },
  ],
};

function componentTypeOf(componentOrType) {
  return typeof componentOrType === 'string'
    ? componentOrType
    : String(componentOrType?._children?.Core?.controlType ?? '');
}

function parameterTypesForPublishedType(type) {
  switch (String(type ?? 'float').trim().toLowerCase()) {
    case 'int':
    case 'integer':
    case 'note':
      return [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.NORMALIZED];
    case 'bool':
    case 'boolean':
      return [PARAMETER_TYPES.BOOLEAN, PARAMETER_TYPES.ENUM];
    case 'enum':
    case 'choice':
      return [PARAMETER_TYPES.CHOICE, PARAMETER_TYPES.ENUM, PARAMETER_TYPES.CHOICE_STEPPED];
    case 'text':
      return [PARAMETER_TYPES.TEXT];
    case 'action':
    case 'trigger':
      return [PARAMETER_TYPES.ACTION, PARAMETER_TYPES.MOMENTARY, PARAMETER_TYPES.RAW_MIDI_ACTION];
    case 'float':
    case 'bipolar':
    case 'normalized':
    default:
      return [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.BIPOLAR, PARAMETER_TYPES.NORMALIZED];
  }
}

function publishedPorts(control) {
  const published = control?._children?.PublishedProperties;
  if (!published) return [];
  const inputs = Object.entries(published.inputs ?? {})
    .filter(([, entry]) => entry?.enabled !== false)
    .map(([name, entry]) => ({
      id: String(entry?.channel || name),
      label: entry?.label || name,
      accepts: parameterTypesForPublishedType(entry?.type),
      defaultBindingMode: ['float', 'int', 'integer', 'note', 'bipolar', 'normalized'].includes(String(entry?.type ?? '').toLowerCase())
        ? 'continuous'
        : 'onCommit',
      custom: true,
      direction: 'input',
      publishedName: name,
      channel: entry?.channel || name,
    }));
  const outputs = Object.entries(published.outputs ?? {})
    .filter(([, entry]) => entry?.enabled !== false)
    .map(([name, entry]) => ({
      id: `out:${entry?.channel || name}`,
      label: `${entry?.label || name} Out`,
      accepts: parameterTypesForPublishedType(entry?.type),
      defaultBindingMode: 'feedback',
      custom: true,
      direction: 'output',
      publishedName: name,
      channel: entry?.channel || name,
    }));
  return [...inputs, ...outputs];
}

export function getComponentPorts(componentOrType) {
  const componentType = componentTypeOf(componentOrType);
  if (componentType === 'CustomComponent' && typeof componentOrType === 'object') {
    const dynamicPorts = publishedPorts(componentOrType);
    return dynamicPorts.length ? dynamicPorts : DEFAULT_COMPONENT_PORTS.CustomComponent;
  }
  return DEFAULT_COMPONENT_PORTS[componentType] ?? [];
}

export function getBindableComponentPorts(componentOrType) {
  return getComponentPorts(componentOrType).filter((port) => port.direction !== 'output');
}

export function getPreferredPort(componentOrType, parameterType) {
  const ports = getBindableComponentPorts(componentOrType);
  return ports.find((port) => port.accepts?.includes(parameterType))
    ?? ports.find((port) => parameterType === PARAMETER_TYPES.CHOICE && port.accepts?.includes(PARAMETER_TYPES.CHOICE_STEPPED))
    ?? ports[0]
    ?? null;
}

export function getBindingCompatibility(componentOrType, parameter = {}) {
  const componentType = componentTypeOf(componentOrType);
  const ports = getBindableComponentPorts(componentOrType);
  const parameterType = String(parameter?.type ?? '').trim();
  const rangeMin = Number(parameter?.range?.min ?? 0);
  const rangeMax = Number(parameter?.range?.max ?? 0);
  const numericStepCount = Number.isFinite(rangeMin) && Number.isFinite(rangeMax)
    ? Math.max(0, Math.round(rangeMax - rangeMin + 1))
    : 0;

  for (const port of ports) {
    if (port.accepts?.includes(parameterType)) {
      if (
        (componentType === 'RadioButtonGroup' || componentType === 'ToggleButton')
        && parameterType === PARAMETER_TYPES.ENUM
        && Array.isArray(parameter?.choices)
        && parameter.choices.length > 8
      ) {
        return {
          status: 'warning',
          port,
          warning: `${componentType} can bind this enum, but ${parameter.choices.length} choices will be hard to use.`,
        };
      }

      const warning = port.warnings?.[parameterType] ?? '';
      return {
        status: warning ? 'warning' : 'compatible',
        port,
        warning,
      };
    }

    if (parameterType === PARAMETER_TYPES.CHOICE && port.accepts?.includes(PARAMETER_TYPES.CHOICE_STEPPED)) {
      return {
        status: 'warning',
        port,
        warning: 'Choice parameters can be controlled as stepped values, but a combobox is recommended.',
      };
    }
  }

  const valuePort = ports.find((port) => port.id === 'value');
  const selectedChoicePort = ports.find((port) => port.id === 'selectedChoice');
  const numericType = [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.BIPOLAR, PARAMETER_TYPES.NORMALIZED].includes(parameterType);

  if (parameterType === PARAMETER_TYPES.CHOICE && valuePort) {
    return {
      status: 'warning',
      port: valuePort,
      warning: 'Choice parameters can be controlled as stepped values, but a combobox or cyclic button is recommended.',
    };
  }

  if (numericType && selectedChoicePort && componentType === 'Combobox') {
    return {
      status: 'warning',
      port: selectedChoicePort,
      warning: 'Numeric parameters can use a combobox only if you provide explicit value choices; a slider is recommended.',
    };
  }

  if (numericType && selectedChoicePort && (componentType === 'CyclicButton' || componentType === 'RadioButtonGroup')) {
    return {
      status: 'incompatible',
      port: null,
      warning: numericStepCount > 16
        ? `${componentType} would need ${numericStepCount} numeric choices; use a slider.`
        : `${componentType} is not a good binding for this numeric parameter yet.`,
    };
  }

  return {
    status: 'incompatible',
    port: null,
    warning: `${componentType} cannot bind to parameter type ${parameterType || 'unknown'}.`,
  };
}
