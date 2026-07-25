import { SECTION_DEFAULTS } from './sectionDefaults.js';
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
    defaultOverrides: {},
  },

  Label: {
    sections: ['Background', 'Text', 'Icon', 'Effects', 'ContentLayout'],
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
    defaultOverrides: {
      Transform: { width: 300, height: 200 },
      Grid: { enabled: true, snap: true, size: 10 },
    },
  },

  Group: {
    sections: ['Background', 'Text', 'Icon', 'Effects', 'ContentLayout', 'Grid', 'Children'],
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

  Constraint: {
    sections: ['Background', 'Constraint', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
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

  Crossfader: {
    sections: ['Background', 'Crossfader', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
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

  Meter: {
    sections: ['Background', 'Meter', 'Text', 'Effects', 'DeviceBindings', 'Scripts'],
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
    defaultOverrides: {
      Transform: { width: 80, height: 80 },
      Background: { _children: { Fill: { colour: 'FF5B9BD5' } } },
    },
  },
};

// --- Internal helpers ---

let nextControlId = Date.now();

/** Deep-clone a plain object. */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

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
