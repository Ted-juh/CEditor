import { SECTION_DEFAULTS } from './sectionDefaults.js';
import { deepClone } from '../utils/deepClone.js';
import { createDefaultInteractiveSections } from './interactionDefaults.js';
import { getComponentPorts } from './componentPorts.js';
import {
  createCustomComponentBlankBindingsDefaults,
  createCustomComponentBlankPartsDefaults,
  createCustomComponentSections,
} from '../utils/customComponentFactory.js';

function createStateNode(name, when = {}, component = {}) {
  return {
    _type: 'State',
    name,
    group: 'interaction',
    description: '',
    enabled: true,
    when,
    patches: {
      component,
      parts: {},
    },
  };
}

function createButtonStates({ includeSelected = false, includeExecuted = false } = {}) {
  const children = {
    Hover: createStateNode('Hover', { hover: true }, {
      'Background.Fill.colour': 'FF4A4A4A',
    }),
    Pressed: createStateNode('Pressed', { pressed: true }, {
      'Background.Fill.colour': 'FF2C2C2C',
      'Transform.scale': 0.985,
    }),
    Focused: createStateNode('Focused', { focused: true }, {
      'Background.Border.colour': 'FF89C2FF',
    }),
    Disabled: createStateNode('Disabled', { disabled: true }, {
      'Transform.opacity': 0.55,
    }),
  };

  if (includeSelected) {
    children.Selected = createStateNode('Selected', { checked: true }, {
      'Background.Fill.colour': 'FF2D6F9C',
      'Text.Fill.colour': 'FFFFFFFF',
    });
  }

  if (includeExecuted) {
    children.Executed = createStateNode('Executed', { executed: true }, {
      'Transform.opacity': 0.45,
    });
  }

  return {
    _type: 'States',
    enabled: true,
    debug: false,
    priority: ['disabled', 'executed', 'pending', 'pressed', 'hover', 'checked', 'mixed', 'focused'],
    _children: children,
  };
}

function createComboboxStates() {
  return {
    _type: 'States',
    enabled: true,
    debug: false,
    priority: ['disabled', 'pressed', 'hover', 'focused'],
    _children: {
      Hover: createStateNode('Hover', { hover: true }, {
        'Background.Fill.colour': 'FF414141',
      }),
      Pressed: createStateNode('Pressed', { pressed: true }, {
        'Background.Fill.colour': 'FF2A2A2A',
      }),
      Focused: createStateNode('Focused', { focused: true }, {
        'Background.Border.colour': 'FF89C2FF',
      }),
      Disabled: createStateNode('Disabled', { disabled: true }, {
        'Transform.opacity': 0.55,
      }),
    },
  };
}

function buildValueRows(rows = []) {
  return rows.map((row, index) => ({
    id: row.id ?? `row_${index + 1}`,
    displayText: row.displayText ?? '',
    internalValue: row.internalValue ?? '',
    sendValue: row.sendValue ?? '',
    receiveValue: row.receiveValue ?? '',
    selectedByDefault: row.selectedByDefault === true,
    enabled: row.enabled !== false,
    visualOverrides: row.visualOverrides ?? {},
    // Rich-row extras (Listbox): all optional.
    icon: row.icon ?? '',          // data URL or icon name (left of the label)
    subtitle: row.subtitle ?? '',  // secondary line under the label
    badge: row.badge ?? '',        // trailing tag (bank letter, FAV, MIDI #)
    swatch: row.swatch ?? '',      // AARRGGBB category accent (left stripe/dot)
    isHeader: row.isHeader === true, // renders as a non-selectable section header
    parentValue: row.parentValue ?? '', // cascading: parent value this row belongs to ('' = all)
  }));
}

function createButtonType({
  label = 'Button',
  width = 132,
  height = 40,
  buttonType = 'momentary',
  subtype = 'action',
  family = 'trigger',
  role = 'button',
  valueType = 'none',
  defaultValue = null,
  rows = [],
  includeSelectedState = false,
  includeExecutedState = false,
  behavior = {},
  value = {},
  contentLayout = {},
  portType = 'Button',
} = {}) {
  return {
    sections: ['Background', 'Text', 'Icon', 'Effects', 'ContentLayout', 'Behavior', 'States', 'Value', 'DeviceBindings', 'Animations', 'Scripts'],
    ports: getComponentPorts(portType),
    defaultOverrides: {
      Transform: { width, height },
      Text: { content: label },
      Background: {
        _children: {
          Fill: { colour: 'FF3A3A3A' },
          Border: { enabled: true, thickness: 1, colour: '66FFFFFF' },
          Corners: { radius: 8 },
        },
      },
      ContentLayout: {
        mode: 'text_only',
        horizontalAlign: 'center',
        verticalAlign: 'center',
        gap: 8,
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: 8,
        paddingBottom: 8,
        ...contentLayout,
      },
      Behavior: {
        buttonType,
        subtype,
        family,
        role,
        valueType,
        defaultValue,
        ...behavior,
      },
      States: createButtonStates({
        includeSelected: includeSelectedState,
        includeExecuted: includeExecutedState,
      }),
      Value: {
        showMapping: value.showMapping === true,
        rows: buildValueRows(rows),
        segmentStyle: value.segmentStyle ?? { shared: {}, rows: {} },
      },
    },
  };
}

/**
 * Component type registry.
 * Each type declares which optional sections it includes (Core + Transform are always added).
 */
export const COMPONENT_TYPES = {
  Background: {
    sections: ['Background', 'Effects'],
    // HOST AUTOMATION.
    // Nothing to automate: this type holds no value, only appearance and layout.
    exportValues: [],
    defaultOverrides: {},
  },

  Label: {
    sections: ['Background', 'Text', 'Icon', 'Effects', 'ContentLayout'],
    // HOST AUTOMATION.
    // Nothing to automate: this type holds no value, only appearance and layout.
    exportValues: [],
    defaultOverrides: {
      Transform: { width: 120, height: 32 },
      Text: { content: 'Label' },
      ContentLayout: {
        mode: 'text_only',
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 4,
        paddingBottom: 4,
      },
    },
  },

  Button: createButtonType({
    label: 'Button',
    buttonType: 'momentary',
    subtype: 'action',
    family: 'trigger',
    role: 'button',
    valueType: 'none',
  }),

  MomentaryButton: createButtonType({
    label: 'Action',
    buttonType: 'momentary',
    subtype: 'action',
    family: 'trigger',
    role: 'button',
    valueType: 'none',
  }),

  ToggleButton: createButtonType({
    label: 'Toggle',
    width: 136,
    buttonType: 'toggle',
    subtype: 'toggle',
    family: 'select',
    role: 'toggle',
    valueType: 'bool',
    defaultValue: false,
    includeSelectedState: true,
    portType: 'ToggleButton',
    rows: [
      { id: 'off', displayText: 'Off', internalValue: false, sendValue: 0 },
      { id: 'on', displayText: 'On', internalValue: true, sendValue: 1 },
    ],
    value: { showMapping: true },
  }),

  RadioButtonGroup: createButtonType({
    label: 'Choice Group',
    width: 240,
    height: 44,
    buttonType: 'radio',
    subtype: 'radio',
    family: 'select',
    role: 'radio',
    valueType: 'enum',
    defaultValue: 'option_1',
    includeSelectedState: true,
    portType: 'RadioButtonGroup',
    rows: [
      { id: 'option_1', displayText: 'Option 1', internalValue: 'option_1', sendValue: 0, selectedByDefault: true },
      { id: 'option_2', displayText: 'Option 2', internalValue: 'option_2', sendValue: 1 },
    ],
    behavior: {
      selectionMode: 'single',
      visualStyle: 'radio',
      allowDeselect: false,
    },
    value: { showMapping: true },
  }),

  CyclicButton: createButtonType({
    label: 'Cycle',
    width: 136,
    buttonType: 'cyclic',
    subtype: 'cycle',
    family: 'select',
    role: 'custom',
    valueType: 'enum',
    defaultValue: 'state_1',
    includeSelectedState: true,
    portType: 'CyclicButton',
    rows: [
      { id: 'state_1', displayText: 'State 1', internalValue: 'state_1', sendValue: 0 },
      { id: 'state_2', displayText: 'State 2', internalValue: 'state_2', sendValue: 1 },
      { id: 'state_3', displayText: 'State 3', internalValue: 'state_3', sendValue: 2 },
    ],
    behavior: {
      wrapBehavior: true,
    },
    value: { showMapping: true },
  }),

  Combobox: {
    sections: ['Background', 'Text', 'Icon', 'Effects', 'ContentLayout', 'Behavior', 'States', 'Value', 'DeviceBindings', 'Animations', 'Scripts'],
    ports: getComponentPorts('Combobox'),
    defaultOverrides: {
      Transform: { width: 160, height: 34 },
      Text: { content: 'Option 1' },
      Background: {
        _children: {
          Fill: { colour: 'FF2F2F2F' },
          Border: { enabled: true, thickness: 1, colour: '66FFFFFF' },
          Corners: { radius: 6 },
        },
      },
      ContentLayout: {
        mode: 'text_only',
        horizontalAlign: 'left',
        verticalAlign: 'center',
        gap: 8,
        paddingLeft: 10,
        paddingRight: 30,
        paddingTop: 6,
        paddingBottom: 6,
      },
      Behavior: {
        buttonType: 'combobox',
        subtype: 'dropdown',
        family: 'select',
        role: 'combobox',
        valueType: 'enum',
        defaultValue: 'option_1',
        selectionMode: 'single',
        keyboardEnabled: true,
        focusable: true,
        emitClick: true,
        emitValueChange: true,
        emitStateChange: true,
      },
      States: createComboboxStates(),
      Value: {
        showMapping: true,
        rows: buildValueRows([
          { id: 'option_1', displayText: 'Option 1', internalValue: 'option_1', sendValue: 0, selectedByDefault: true },
          { id: 'option_2', displayText: 'Option 2', internalValue: 'option_2', sendValue: 1 },
          { id: 'option_3', displayText: 'Option 3', internalValue: 'option_3', sendValue: 2 },
        ]),
        segmentStyle: { shared: {}, rows: {} },
      },
    },
  },

  Listbox: {
    sections: ['Background', 'Text', 'Icon', 'Effects', 'ContentLayout', 'Behavior', 'States', 'Value', 'Listbox', 'DeviceBindings', 'Animations', 'Scripts'],
    ports: getComponentPorts('Listbox'),
    defaultOverrides: {
      // Tall enough for ~5 rows; no dropdown arrow gutter.
      Transform: { width: 160, height: 200 },
      Text: { content: 'Option 1' },
      Background: {
        _children: {
          Fill: { colour: 'FF2F2F2F' },
          Border: { enabled: true, thickness: 1, colour: '66FFFFFF' },
          Corners: { radius: 6 },
        },
      },
      ContentLayout: {
        mode: 'text_only',
        horizontalAlign: 'left',
        verticalAlign: 'center',
        gap: 8,
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 6,
        paddingBottom: 6,
      },
      Behavior: {
        buttonType: 'listbox',
        subtype: 'scrollable',
        family: 'select',
        role: 'listbox',
        valueType: 'enum',
        defaultValue: 'option_1',
        selectionMode: 'single',
        keyboardEnabled: true,
        focusable: true,
        emitClick: true,
        emitValueChange: true,
        emitStateChange: true,
      },
      States: createComboboxStates(),
      Value: {
        showMapping: true,
        rows: buildValueRows([
          { id: 'option_1', displayText: 'Option 1', internalValue: 'option_1', sendValue: 0, selectedByDefault: true },
          { id: 'option_2', displayText: 'Option 2', internalValue: 'option_2', sendValue: 1 },
          { id: 'option_3', displayText: 'Option 3', internalValue: 'option_3', sendValue: 2 },
        ]),
        segmentStyle: { shared: {}, rows: {} },
      },
    },
  },

  TextInput: {
    sections: ['Background', 'Text', 'Icon', 'Effects', 'ContentLayout', 'Behavior', 'States', 'DeviceBindings'],
    ports: getComponentPorts('TextInput'),
    defaultOverrides: {
      Transform: { width: 160, height: 32 },
      Text: { content: 'Enter text…' }, // placeholder (NOT the live value)
      Background: {
        _children: {
          Fill: { colour: 'FF2F2F2F' },
          Border: { enabled: true, thickness: 1, colour: '66FFFFFF' },
          Corners: { radius: 6 },
        },
      },
      ContentLayout: {
        mode: 'text_only',
        horizontalAlign: 'left',
        verticalAlign: 'center',
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 4,
        paddingBottom: 4,
      },
      Behavior: {
        buttonType: 'textInput',
        family: 'text',
        role: 'textInput',
        valueType: 'text',
        defaultValue: '', // the live text lives here
        keyboardEnabled: true,
        focusable: true,
        emitValueChange: true,
      },
      States: createComboboxStates(),
    },
  },

  TimedButton: createButtonType({
    label: 'Hold',
    width: 148,
    buttonType: 'timed',
    subtype: 'hold_to_confirm',
    family: 'trigger',
    role: 'button',
    valueType: 'none',
    behavior: {
      holdDuration: 1500,
      requiredClicks: 2,
      clickWindow: 350,
    },
  }),

  OneShotButton: createButtonType({
    label: 'Submit',
    width: 148,
    buttonType: 'one_shot',
    subtype: 'single_use',
    family: 'trigger',
    role: 'button',
    valueType: 'none',
    includeExecutedState: true,
    behavior: {
      disableAfterUse: true,
      lockoutDuration: 0,
    },
  }),

  Range: {
    sections: ['Mouse', 'Behavior', 'Parts', 'Bindings', 'DeviceBindings', 'States', 'Animations', 'Scripts'],
    ports: getComponentPorts('Range'),
    defaultOverrides: {
      Transform: { width: 200, height: 40 },
      Mouse: { cursor: 'pointer', interceptClicks: true, focusable: true, tabIndex: 0, draggable: true },
      ...createDefaultInteractiveSections('Range'),
    },
  },

  Number: {
    sections: ['Mouse', 'Behavior', 'Parts', 'Bindings', 'DeviceBindings', 'States', 'Animations', 'Scripts'],
    ports: getComponentPorts('Number'),
    defaultOverrides: {
      Transform: { width: 132, height: 38 },
      Mouse: { cursor: 'pointer', interceptClicks: true, focusable: true, tabIndex: 0, draggable: true },
      ...createDefaultInteractiveSections('Number'),
    },
  },

  Slider: {
    sections: ['Mouse', 'Behavior', 'Parts', 'Bindings', 'DeviceBindings', 'States', 'Animations', 'Scripts'],
    ports: getComponentPorts('Slider'),
    defaultOverrides: {
      Transform: { width: 220, height: 48 },
      Mouse: { cursor: 'pointer', interceptClicks: true, focusable: true, tabIndex: 0, draggable: true },
      ...createDefaultInteractiveSections('Slider'),
    },
  },

  Knob: {
    sections: ['Mouse', 'Behavior', 'Parts', 'Bindings', 'DeviceBindings', 'States', 'Animations', 'Scripts'],
    ports: getComponentPorts('Knob'),
    defaultOverrides: {
      Transform: { width: 100, height: 100 },
      Mouse: { cursor: 'pointer', interceptClicks: true, focusable: true, tabIndex: 0, draggable: true },
      ...createDefaultInteractiveSections('Knob'),
    },
  },

  CustomComponent: {
    sections: [
      'Background',
      'Effects',
      'Mouse',
      'Designer',
      'Parts',
      'Assets',
      'ValueChannels',
      'Behaviors',
      'HitZones',
      'Generators',
      'Bindings',
      'Links',
      'States',
      'Animations',
      'DeviceBindings',
      'PublishedProperties',
      'ExternalAPI',
      'Variants',
      'Scripts',
    ],
    ports: getComponentPorts('CustomComponent'),
    defaultOverrides: {
      Transform: { width: 200, height: 200 },
      Background: {
        _children: {
          Fill: { colour: '00000000', solidEnabled: false },
          Border: { enabled: false },
          Corners: { radius: 10 },
        },
      },
      Mouse: { cursor: 'pointer', interceptClicks: true, focusable: true, tabIndex: 0, draggable: true },
      Parts: createCustomComponentBlankPartsDefaults(),
      Bindings: createCustomComponentBlankBindingsDefaults(),
      States: {
        _type: 'States',
        enabled: true,
        debug: false,
        priority: [],
        _children: {},
      },
      Animations: {
        _type: 'Animations',
        enabled: true,
        debug: false,
        _children: {},
      },
      ...createCustomComponentSections(),
    },
  },

  Container: {
    sections: ['Background', 'Effects', 'Grid', 'Children'],
    // HOST AUTOMATION.
    // Nothing to automate: this type holds no value, only appearance and layout.
    exportValues: [],
    defaultOverrides: {
      Transform: { width: 300, height: 200 },
      Grid: { enabled: true, snap: true, size: 10 },
    },
  },

  Group: {
    sections: ['Background', 'Text', 'Icon', 'Effects', 'ContentLayout', 'Grid', 'Children'],
    // HOST AUTOMATION.
    // Nothing to automate: this type holds no value, only appearance and layout.
    exportValues: [],
    defaultOverrides: {
      Transform: { width: 260, height: 180 },
      Background: {
        _children: {
          Fill: { colour: '11FFFFFF' },
          Border: { enabled: true, thickness: 1, colour: '66FFFFFF' },
          Corners: { radius: 6 },
        },
      },
      Text: { content: 'Group' },
      ContentLayout: {
        mode: 'text_only',
        horizontalAlign: 'left',
        verticalAlign: 'top',
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 4,
        paddingBottom: 4,
      },
      Grid: { enabled: true, snap: true, size: 10 },
    },
  },

  Image: {
    sections: ['Background', 'Effects'],
    // HOST AUTOMATION.
    // Nothing to automate: this type holds no value, only appearance and layout.
    exportValues: [],
    defaultOverrides: {
      Transform: { width: 160, height: 120 },
      Background: {
        _children: {
          Fill: { solidEnabled: false, imageEnabled: true, imageFit: 'contain', colour: '00000000' },
          Border: { enabled: false },
        },
      },
    },
  },

  LcdDisplay: {
    sections: ['Background', 'Display', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION.
    // An OUTPUT. Its content arrives from a binding or a script; a host parameter would let a DAW write
    // what the display is supposed to be reporting. Same ruling as Meter.
    exportValues: [],
    ports: getComponentPorts('LcdDisplay'),
    defaultOverrides: {
      // A 16x2 character LCD in a dark bezel by default.
      Transform: { width: 260, height: 96 },
      Background: {
        _children: {
          Fill: { colour: 'FF161616' },
          Border: { enabled: true, thickness: 2, colour: 'FF000000' },
          Corners: { radius: 10 },
        },
      },
    },
  },

  PixelDisplay: {
    sections: ['Background', 'Pixel', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION.
    // An OUTPUT. Its content arrives from a binding or a script; a host parameter would let a DAW write
    // what the display is supposed to be reporting. Same ruling as Meter.
    exportValues: [],
    ports: getComponentPorts('PixelDisplay'),
    defaultOverrides: {
      // A 128x64 OLED-style pixel surface in a dark bezel by default.
      Transform: { width: 260, height: 140 },
      Background: {
        _children: {
          Fill: { colour: 'FF101010' },
          Border: { enabled: true, thickness: 2, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  Macro: {
    sections: ['Background', 'Macro', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION. The macro's own position, 0..1. `slots` is where it is routed, which is
    // panel wiring rather than something a host moves.
    exportValues: [{ field: 'value', section: 'Macro', kind: 'float' }],
    ports: getComponentPorts('Macro'),
    defaultOverrides: {
      // A macro knob + assignment lanes in a dark panel by default.
      Transform: { width: 320, height: 150 },
      Background: {
        _children: {
          Fill: { colour: 'FF15151A' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 10 },
        },
      },
    },
  },

  Constellation: {
    sections: ['Background', 'Constellation', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION.
    exportValues: [
      { field: 'probeX', section: 'Constellation', kind: 'float', suffix: 'x', label: 'X' },
      { field: 'probeY', section: 'Constellation', kind: 'float', suffix: 'y', label: 'Y' },
    ],
    ports: getComponentPorts('Constellation'),
    defaultOverrides: {
      // A wide preset-map field on a dark panel by default.
      Transform: { width: 260, height: 220 },
      Background: {
        _children: {
          Fill: { colour: 'FF0C0C12' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 12 },
        },
      },
    },
  },

  Timbre: {
    sections: ['Background', 'Timbre', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION.
    exportValues: [
      { field: 'x', section: 'Timbre', kind: 'float', suffix: 'x', label: 'X' },
      { field: 'y', section: 'Timbre', kind: 'float', suffix: 'y', label: 'Y' },
    ],
    ports: getComponentPorts('Timbre'),
    defaultOverrides: {
      // A square perceptual sound-map on a dark panel by default.
      Transform: { width: 220, height: 220 },
      Background: {
        _children: {
          Fill: { colour: 'FF0C0C12' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 12 },
        },
      },
    },
  },

  Router: {
    sections: ['Background', 'Router', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION.
    // Routing configuration -- which source drives what, through which curve. Config, not performance.
    exportValues: [],
    ports: getComponentPorts('Router'),
    defaultOverrides: {
      // A transfer-curve panel with a source chip + destination lanes by default.
      Transform: { width: 320, height: 190 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 10 },
        },
      },
    },
  },

  Turing: {
    sections: ['Background', 'Turing', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION. Decided 2026-08-23: the four knobs the front panel of a real Turing machine
    // has. `length` is included deliberately — shortening the loop live is the instrument's defining
    // gesture, not a configuration step.
    //
    // `phase` stays out permanently: generated output, and a host parameter would let a DAW write
    // what the component reports. `quantizeLevels` stays out too — it changes what the values MEAN
    // rather than what they are, so sweeping it is a patch edit, not a performance.
    exportValues: [
      { field: 'rate', section: 'Turing', kind: 'float', suffix: 'rate', min: 0.1, max: 32, label: 'Rate', unit: 'st/s' },
      { field: 'randomness', section: 'Turing', kind: 'float', suffix: 'randomness', label: 'Randomness' },
      { field: 'gateThreshold', section: 'Turing', kind: 'float', suffix: 'gateThreshold', label: 'Gate threshold' },
      { field: 'length', section: 'Turing', kind: 'float', suffix: 'length', min: 1, max: 64, label: 'Length' },
    ],
    ports: getComponentPorts('Turing'),
    defaultOverrides: {
      // A wide step-sequence field on a dark panel by default.
      Transform: { width: 260, height: 120 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 10 },
        },
      },
    },
  },

  Looper: {
    sections: ['Background', 'Looper', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION. Decided 2026-08-23: NOTHING, and the deferral was right to suspect it.
    //
    // `phase` is the playhead — generated output, so a host writing it would be a DAW driving the
    // component's own report. `loopSeconds` and `loopBars` are the loop's LENGTH, and changing that
    // while lanes are playing is a structural edit rather than a sweep: every recorded gesture is
    // stored against the loop it was drawn in, so a host automating the length would be scrubbing
    // the material rather than performing it. There is no scalar here worth a permanent parameter.
    exportValues: [],
    ports: getComponentPorts('Looper'),
    defaultOverrides: {
      // A wide multi-lane gesture recorder on a dark panel by default.
      Transform: { width: 300, height: 150 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 10 },
        },
      },
    },
  },

  ChordPad: {
    // Note-playing control: it emits MIDI notes rather than driving a device
    // parameter, so it carries no DeviceBindings section.
    sections: ['Background', 'ChordPad', 'Text', 'Effects', 'Scripts'],
    // HOST AUTOMATION.
    // A note EMITTER. It sends notes; it holds no scalar a host would sweep. Its fields are musical
    // configuration (key, scale, voicing).
    exportValues: [],
    ports: getComponentPorts('ChordPad'),
    defaultOverrides: {
      // A square chord wheel on a dark panel by default.
      Transform: { width: 260, height: 280 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 12 },
        },
      },
    },
  },

  Arp: {
    // Like the ChordPad it plays notes rather than driving a parameter, so it
    // carries no DeviceBindings section either.
    sections: ['Background', 'Arp', 'Text', 'Effects', 'Scripts'],
    // HOST AUTOMATION. Decided 2026-08-23: all four candidates export, because all four are
    // things a player sweeps mid-performance rather than settings they configure once. Picking a
    // subset would have been the arbitrary choice.
    //
    // `phase` is deliberately absent and always will be: it is the arpeggiator's own position,
    // GENERATED output, and a host parameter would let a DAW write what the component is reporting.
    // `octaves` is stepped and rides as a float — arpLayout's `clampInt(octaves, 1, 4)` rounds it,
    // so a host sweeping between values lands on whole octaves.
    exportValues: [
      { field: 'rate', section: 'Arp', kind: 'float', suffix: 'rate', min: 0.1, max: 32, label: 'Rate', unit: 'st/s' },
      { field: 'gate', section: 'Arp', kind: 'float', suffix: 'gate', label: 'Gate' },
      { field: 'swing', section: 'Arp', kind: 'float', suffix: 'swing', label: 'Swing' },
      { field: 'octaves', section: 'Arp', kind: 'float', suffix: 'octaves', min: 1, max: 4, label: 'Octaves' },
    ],
    ports: getComponentPorts('Arp'),
    defaultOverrides: {
      // A wide, short step lane.
      Transform: { width: 320, height: 96 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 10 },
        },
      },
    },
  },

  NoteRibbon: {
    // Plays notes rather than driving a parameter — no DeviceBindings, same as
    // the ChordPad and the Arp.
    sections: ['Background', 'NoteRibbon', 'Text', 'Effects', 'Scripts'],
    // HOST AUTOMATION.
    // A note emitter, as ChordPad. Keyboard configuration, not a value.
    exportValues: [],
    ports: getComponentPorts('NoteRibbon'),
    defaultOverrides: {
      // A wide playing strip.
      Transform: { width: 360, height: 104 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 10 },
        },
      },
    },
  },

  DrumPads: {
    // Emits notes rather than driving a parameter — no DeviceBindings, same as
    // the ChordPad, the Arp and the NoteRibbon.
    sections: ['Background', 'DrumPads', 'Text', 'Effects', 'Scripts'],
    // HOST AUTOMATION.
    // A note emitter, as ChordPad. Grid and mapping configuration, not a value.
    exportValues: [],
    ports: getComponentPorts('DrumPads'),
    defaultOverrides: {
      // A square 4x4 grid.
      Transform: { width: 260, height: 280 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 12 },
        },
      },
    },
  },

  Phrase: {
    // Sequences PITCH — the gap between the Turing (values) and the Arp (notes
    // you're already holding). Emits MIDI, so no DeviceBindings.
    sections: ['Background', 'Phrase', 'Text', 'Effects', 'Scripts'],
    // HOST AUTOMATION. Decided 2026-08-23: the four continuous performance controls, matching the
    // Arp's ruling because they are the same four gestures over a different pattern source.
    //
    // `steps` stays out permanently — it is a pattern with the Matrix's variable-cardinality
    // problem, and an exported list has to be fixed. `velocity` stays out too, but for a softer
    // reason: it is the default a cell uses when it carries none, so automating it moves only the
    // cells that declined to say, which is a surprising thing for a host parameter to do.
    exportValues: [
      { field: 'transpose', section: 'Phrase', kind: 'float', suffix: 'transpose', min: -24, max: 24, label: 'Transpose', unit: 'st' },
      { field: 'swing', section: 'Phrase', kind: 'float', suffix: 'swing', label: 'Swing' },
      { field: 'gate', section: 'Phrase', kind: 'float', suffix: 'gate', label: 'Gate' },
      { field: 'rate', section: 'Phrase', kind: 'float', suffix: 'rate', min: 0.1, max: 32, label: 'Rate', unit: 'st/s' },
    ],
    ports: getComponentPorts('Phrase'),
    defaultOverrides: {
      Transform: { width: 460, height: 170 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  Setlist: {
    // An ordered list of panel states you advance with a footswitch. Sends
    // program change and writes panel values, so no DeviceBindings of its own.
    sections: ['Background', 'Setlist', 'Text', 'Effects', 'Scripts'],
    // HOST AUTOMATION. Decided 2026-08-23: `index` exports, with a FIXED 0..127 range rather than
    // the scene count.
    //
    // The trap was real — the number of scenes is per-panel and an exported parameter's range is
    // permanent once a session references it, so a range that tracked the scene list would silently
    // change meaning the moment somebody added a song. Pinning it at 0..127 is the same answer MIDI
    // itself gives for program change: the host sees a fixed set of slots and the component clamps
    // to the scenes that exist. Adding a song then widens what is reachable instead of rewriting
    // what every saved automation lane means.
    //
    // `crossfadeMs` stays out: it is how a scene change behaves, not a thing to perform.
    exportValues: [
      { field: 'index', section: 'Setlist', kind: 'float', suffix: 'index', min: 0, max: 127, label: 'Scene' },
    ],
    ports: getComponentPorts('Setlist'),
    defaultOverrides: {
      Transform: { width: 260, height: 150 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  Harmoniser: {
    // One finger in, a chord out. Reads the MIDI input and emits notes, so no
    // DeviceBindings.
    sections: ['Background', 'Harmoniser', 'Text', 'Effects', 'Scripts'],
    // HOST AUTOMATION.
    // Harmony configuration (key, scale, voicing, voice leading). No single scalar, and each field
    // changes what the notes MEAN rather than how much of something there is.
    exportValues: [],
    ports: getComponentPorts('Harmoniser'),
    defaultOverrides: {
      Transform: { width: 340, height: 110 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  Recorder: {
    // The note twin of the Gesture Looper: records what you play (on the panel
    // or on the MIDI input) and loops it. Emits MIDI, so no DeviceBindings.
    sections: ['Background', 'Recorder', 'Text', 'Effects', 'Scripts'],
    // HOST AUTOMATION.
    // A transport state machine (`state`, `playing`, `slot`). A host writing 'recording' into it is not
    // automation.
    exportValues: [],
    ports: getComponentPorts('Recorder'),
    defaultOverrides: {
      Transform: { width: 420, height: 150 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  SplitZone: {
    // A routing table: notes in on the hardware input, notes out on the raw MIDI
    // path. Like the other note controls it emits MIDI rather than parameter
    // values, so there is no DeviceBindings section.
    sections: ['Background', 'SplitZone', 'Text', 'Effects', 'Scripts'],
    // HOST AUTOMATION.
    // Zone configuration: note ranges and channels. Changing it mid-performance is a setup change, not
    // automation.
    exportValues: [],
    ports: getComponentPorts('SplitZone'),
    defaultOverrides: {
      Transform: { width: 420, height: 110 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  Panic: {
    // Emits MIDI directly, like the note-playing controls — no DeviceBindings.
    sections: ['Background', 'Panic', 'Text', 'Effects', 'Scripts'],
    // HOST AUTOMATION.
    // A trigger, not a value. Same family as Button, which declines for the same reason.
    exportValues: [],
    ports: getComponentPorts('Panic'),
    defaultOverrides: {
      Transform: { width: 132, height: 48 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  Transport: {
    // Emits MIDI clock directly rather than driving a parameter.
    sections: ['Background', 'Transport', 'Text', 'Effects', 'Scripts'],
    // HOST AUTOMATION. Decided 2026-08-23: `swing` exports, `bpm` does not — and the split is the
    // resolution of the snag rather than a compromise around it.
    //
    // `bpm` genuinely fights its own source. A Transport set to follow the host takes tempo FROM the
    // DAW, so a host parameter writing tempo INTO it would be the DAW arguing with itself, and which
    // side wins depends on a setting the automation lane cannot see. A parameter that is ignored
    // half the time is worse than no parameter, because the lane looks like it is doing something.
    //
    // `swing` has no such conflict. It is CEditor's own, applied to every synced step follower, and
    // no host has an opinion about it — so it behaves identically whichever source the Transport is
    // on, which is exactly the property `bpm` lacks.
    exportValues: [
      { field: 'swing', section: 'Transport', kind: 'float', suffix: 'swing', label: 'Swing' },
    ],
    ports: getComponentPorts('Transport'),
    defaultOverrides: {
      Transform: { width: 230, height: 58 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  Constraint: {
    sections: ['Background', 'Constraint', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION.
    // A rule applied to other controls. The automatable values are the members', not this one's.
    exportValues: [],
    ports: getComponentPorts('Constraint'),
    defaultOverrides: {
      // A row of linked value bars on a dark panel by default.
      Transform: { width: 200, height: 140 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 10 },
        },
      },
    },
  },

  Kinetic: {
    sections: ['Background', 'Kinetic', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION. Decided 2026-08-23: all three, which is the non-arbitrary answer to "picking
    // one would be arbitrary" — the same reasoning that gave VectorJoystick two rather than one.
    //
    // They are the physics a player performs with: gravity swings the field, restitution decides how
    // long it rings, friction decides how fast it dies. Each is a plain scalar with a stable range
    // and none of them is generated output.
    exportValues: [
      { field: 'gravity', section: 'Kinetic', kind: 'float', suffix: 'gravity', min: -1, max: 1, label: 'Gravity' },
      { field: 'restitution', section: 'Kinetic', kind: 'float', suffix: 'restitution', label: 'Restitution' },
      { field: 'friction', section: 'Kinetic', kind: 'float', suffix: 'friction', label: 'Friction' },
    ],
    ports: getComponentPorts('Kinetic'),
    defaultOverrides: {
      // A square physics box on a dark panel by default.
      Transform: { width: 180, height: 180 },
      Background: {
        _children: {
          Fill: { colour: 'FF0D0D12' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 10 },
        },
      },
    },
  },

  Orbit: {
    sections: ['Background', 'Orbit', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION. Decided 2026-08-23: `rate` exports and `nodes` does not, which turns out not
    // to be a compromise — they are different kinds of thing.
    //
    // `rate` is the global speed of the whole field: one scalar, stable range, exactly what a host
    // parameter is for. `nodes` is a LIST whose length the author chooses, which is the Matrix and
    // Envelope problem — an exported parameter list has to be fixed, and a panel that gains a node
    // must not silently change what every saved automation lane addresses. The per-node values stay
    // reachable through the component's own ports and through scripting, where cardinality can
    // change without breaking anything already written down.
    //
    // `cycleBars` stays out: it is which division to sync to, a setting rather than a sweep.
    exportValues: [
      { field: 'rate', section: 'Orbit', kind: 'float', suffix: 'rate', min: 0.01, max: 8, label: 'Rate', unit: 'Hz' },
    ],
    ports: getComponentPorts('Orbit'),
    defaultOverrides: {
      // A square circular modulation field on a dark panel by default.
      Transform: { width: 200, height: 200 },
      Background: {
        _children: {
          Fill: { colour: 'FF0D0D12' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 12 },
        },
      },
    },
  },

  Ribbon: {
    sections: ['Background', 'Ribbon', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION. Same shape as the crossfader — one scalar stored 0..1.
    exportValues: [{ field: 'value', section: 'Ribbon', kind: 'float' }],
    ports: getComponentPorts('Ribbon'),
    defaultOverrides: {
      // A tall vertical touch strip / wheel by default.
      Transform: { width: 44, height: 150 },
      Background: {
        _children: {
          Fill: { colour: 'FF121212' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  Numpad: {
    // Value + DeviceBindings, so a typed number binds like any other value — to a device parameter,
    // or through a script to a preset recall. Nothing about Program Change lives in the component.
    sections: ['Background', 'Numpad', 'Value', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION. A keypad is one number, and it already declares its own range. It carries a
    // Value section and no Behavior, which is why deriveExportParameters could not see it: that
    // function's only door for a standard control was `Behavior`, so the one component here that
    // visibly stores a number exported nothing at all.
    exportValues: [{ field: 'value', section: 'Numpad', kind: 'float', minField: 'min', maxField: 'max' }],
    ports: getComponentPorts('Numpad'),
    defaultOverrides: {
      // Three columns of keys plus a readout: taller than it is wide, like the thing it imitates.
      Transform: { width: 168, height: 232 },
      Background: {
        _children: {
          Fill: { colour: 'FF101017' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  Crossfader: {
    sections: ['Background', 'Crossfader', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION. `mix` is the whole value, stored 0..1 with 0.5 as centre. `bipolar` is a
    // DISPLAY flag — RibbonRenderer's readout does `value * 2 - 1` for it — so the exported range
    // is the stored domain, not the displayed one.
    exportValues: [{ field: 'mix', section: 'Crossfader', kind: 'float' }],
    ports: getComponentPorts('Crossfader'),
    defaultOverrides: {
      // A wide horizontal A/B fader by default.
      Transform: { width: 200, height: 44 },
      Background: {
        _children: {
          Fill: { colour: 'FF121212' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  VectorJoystick: {
    sections: ['Background', 'Joystick', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION. Two parameters, not one. Every host models an XY pad as two automation
    // lanes, and flattening them to a single scalar would lose the axis a user was drawing. Both
    // are stored 0..1 with 0.5 as centre, whatever `bipolar` shows.
    exportValues: [
      { field: 'x', section: 'Joystick', kind: 'float', suffix: 'x', label: 'X' },
      { field: 'y', section: 'Joystick', kind: 'float', suffix: 'y', label: 'Y' },
    ],
    ports: getComponentPorts('VectorJoystick'),
    defaultOverrides: {
      // A square XY pad in a dark panel by default.
      Transform: { width: 160, height: 160 },
      Background: {
        _children: {
          Fill: { colour: 'FF121212' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  Matrix: {
    sections: ['Background', 'Matrix', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION: none, deliberately. Two reasons, either sufficient. A parameter per cell is
    // rows x cols parameters and both are per-panel, but the exported list has to be FIXED — a
    // panel whose parameter count changes when someone adds a row is a panel that breaks every
    // saved session. And a modulation matrix is routing configuration, not a performance control.
    exportValues: [],
    ports: getComponentPorts('Matrix'),
    defaultOverrides: {
      // A 4×4 routing grid in a dark panel by default.
      Transform: { width: 260, height: 170 },
      Background: {
        _children: {
          Fill: { colour: 'FF121212' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  Envelope: {
    sections: ['Background', 'Envelope', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION: none, deliberately. An envelope is a shape with a variable number of
    // points, so it has the same fixed-list problem as the matrix; and the thing that does move
    // continuously, `phase`, is driven by `phaseSourceId` — an output, like the meter's.
    exportValues: [],
    ports: getComponentPorts('Envelope'),
    defaultOverrides: {
      // A wide ADSR editing area in a dark panel by default.
      Transform: { width: 280, height: 160 },
      Background: {
        _children: {
          Fill: { colour: 'FF141414' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 8 },
        },
      },
    },
  },

  Keyboard: {
    sections: ['Background', 'Keyboard', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION. A keyboard emits NOTES, not a parameter value — a DAW automating "note" on a
    // keyboard would be a DAW playing it, which is what its own MIDI track is for. Declared empty
    // rather than left absent, so QA-08 files it as a decision instead of an oversight.
    exportValues: [],
    ports: getComponentPorts('Keyboard'),
    defaultOverrides: {
      // Two octaves at a playable key width by default.
      Transform: { width: 320, height: 90 },
      Background: {
        _children: {
          Fill: { colour: 'FF15151A' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 4 },
        },
      },
    },
  },

  StepSequencer: {
    sections: ['Background', 'StepSequencer', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION. Tempo and run state, which are the two things a DAW plausibly drives. The
    // pattern is not automatable: it is a document, and a host parameter per cell would be a
    // thousand lanes.
    exportValues: [
      { field: 'bpm', section: 'StepSequencer', kind: 'float', suffix: 'bpm', label: 'Tempo' },
      { field: 'running', section: 'StepSequencer', kind: 'bool', suffix: 'run', label: 'Run' },
    ],
    ports: getComponentPorts('StepSequencer'),
    defaultOverrides: {
      Transform: { width: 420, height: 130 },
      Background: {
        _children: {
          Fill: { colour: 'FF15151A' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 6 },
        },
      },
    },
  },

  TabContainer: {
    sections: ['Background', 'TabContainer', 'Effects', 'Grid', 'Children'],
    // HOST AUTOMATION. The page, as a choice — switching pages from a DAW is a real thing to want,
    // and `valueKind: 'choice'` is what makes it arrive as named pages rather than as a float.
    exportValues: [{
      field: 'pageIndex', section: 'TabContainer', kind: 'choice', suffix: 'page', label: 'Page',
      // The range and the labels both come from the authored page list — see paramFromTypeSpec.
      listField: 'pages', labelKey: 'label',
    }],
    ports: getComponentPorts('TabContainer'),
    defaultOverrides: {
      Transform: { width: 320, height: 220 },
      Grid: { enabled: true, snap: true, size: 10 },
      Background: {
        _children: {
          Fill: { colour: 'FF1A1A20' },
          Border: { enabled: true, thickness: 1, colour: 'FF2E2E36' },
          Corners: { radius: 6 },
        },
      },
    },
  },

  ScrollArea: {
    sections: ['Background', 'ScrollArea', 'Effects', 'Grid', 'Children'],
    // HOST AUTOMATION: none. A scroll position is where somebody is LOOKING, not a parameter of the
    // instrument, and a DAW writing it would move the view under the player's hands.
    exportValues: [],
    ports: getComponentPorts('ScrollArea'),
    defaultOverrides: {
      Transform: { width: 280, height: 200 },
      Grid: { enabled: true, snap: true, size: 10 },
      Background: {
        _children: {
          Fill: { colour: 'FF1A1A20' },
          Border: { enabled: true, thickness: 1, colour: 'FF2E2E36' },
          Corners: { radius: 6 },
        },
      },
    },
  },

  Meter: {
    sections: ['Background', 'Meter', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
    // HOST AUTOMATION: none, deliberately. A meter DISPLAYS a level that arrives from somewhere
    // else — `valueSourceId` names where — so a host parameter would let a DAW write a reading the
    // component is supposed to be reporting. An output is not an automation target. Declared
    // empty rather than left absent, so QA-08 files it as a decision instead of an oversight.
    exportValues: [],
    ports: getComponentPorts('Meter'),
    defaultOverrides: {
      // A horizontal level meter in a dark inset by default.
      Transform: { width: 220, height: 34 },
      Background: {
        _children: {
          Fill: { colour: 'FF121212' },
          Border: { enabled: true, thickness: 1, colour: 'FF000000' },
          Corners: { radius: 6 },
        },
      },
    },
  },

  TestBox: {
    sections: ['Background', 'Effects'],
    // HOST AUTOMATION.
    // Nothing to automate: this type holds no value, only appearance and layout.
    exportValues: [],
    defaultOverrides: {
      Transform: { width: 80, height: 80 },
      Background: { _children: { Fill: { colour: 'FF5B9BD5' } } },
    },
  },
};

// --- Internal helpers ---

let nextControlId = Date.now();

/** Deep-merge overrides into a section clone, including _children. */
function applyOverrides(section, overrides) {
  if (!overrides) return section;
  for (const [key, value] of Object.entries(overrides)) {
    if (key === '_type') continue;
    if (key === '_children' && typeof value === 'object' && section._children) {
      for (const [childName, childOverrides] of Object.entries(value)) {
        if (section._children[childName]) {
          applyOverrides(section._children[childName], childOverrides);
        } else {
          section._children[childName] = deepClone(childOverrides);
        }
      }
    } else {
      section[key] = value;
    }
  }
  return section;
}

/**
 * Create a control object ready for the store.
 *
 * @param {string} type - Key in COMPONENT_TYPES (e.g., 'Background', 'Label', 'Button')
 * @param {object} overrides - Per-section property overrides from the caller
 * @returns {object} A complete control object with _type: 'Control' and _children
 */
export function createControl(type, overrides = {}) {
  const template = COMPONENT_TYPES[type];
  if (!template) {
    throw new Error(`Unknown component type: "${type}". Available: ${Object.keys(COMPONENT_TYPES).join(', ')}`);
  }

  const id = `ctrl_${nextControlId++}`;
  const children = {};

  // 1. Core (mandatory)
  const core = deepClone(SECTION_DEFAULTS.Core);
  core.id = id;
  core.controlType = type;
  core.name = overrides.name || `${type}_${id.replace('ctrl_', '')}`;
  applyOverrides(core, overrides.Core);
  children.Core = core;

  // 2. Transform (always present)
  const transform = deepClone(SECTION_DEFAULTS.Transform);
  applyOverrides(transform, template.defaultOverrides?.Transform);
  applyOverrides(transform, overrides.Transform);
  children.Transform = transform;

  // 3. Optional sections from the type template
  for (const sectionName of template.sections) {
    const defaults = SECTION_DEFAULTS[sectionName];
    if (!defaults) {
      console.warn(`[createControl] No defaults for section "${sectionName}"`);
      continue;
    }

    const section = deepClone(defaults);
    applyOverrides(section, template.defaultOverrides?.[sectionName]);
    applyOverrides(section, overrides[sectionName]);
    children[sectionName] = section;
  }

  return {
    _type: 'Control',
    _children: children,
  };
}

/**
 * Get a section from a control by name.
 */
export function getSection(control, sectionName) {
  return control?._children?.[sectionName] ?? null;
}

/**
 * Check if a control has a specific section.
 */
export function hasSection(control, sectionName) {
  return control?._children?.[sectionName] != null;
}
