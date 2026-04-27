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
  Range: [
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
};

export function getComponentPorts(componentType) {
  return DEFAULT_COMPONENT_PORTS[componentType] ?? [];
}

export function getPreferredPort(componentType, parameterType) {
  const ports = getComponentPorts(componentType);
  return ports.find((port) => port.accepts?.includes(parameterType))
    ?? ports.find((port) => parameterType === PARAMETER_TYPES.CHOICE && port.accepts?.includes(PARAMETER_TYPES.CHOICE_STEPPED))
    ?? ports[0]
    ?? null;
}

export function getBindingCompatibility(componentType, parameter = {}) {
  const ports = getComponentPorts(componentType);
  const parameterType = String(parameter?.type ?? '').trim();

  for (const port of ports) {
    if (port.accepts?.includes(parameterType)) {
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

  return {
    status: 'incompatible',
    port: null,
    warning: `${componentType} cannot bind to parameter type ${parameterType || 'unknown'}.`,
  };
}
