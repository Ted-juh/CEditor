import { SECTION_DEFAULTS } from './sectionDefaults.js';
import { createDefaultInteractiveSections } from './interactionDefaults.js';

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
} = {}) {
  return {
    sections: ['Background', 'Text', 'Icon', 'Effects', 'ContentLayout', 'Behavior', 'States', 'Value', 'Animations', 'Scripts'],
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
    sections: ['Mouse', 'Behavior', 'Parts', 'Bindings', 'States', 'Animations', 'Scripts'],
    defaultOverrides: {
      Transform: { width: 180, height: 40 },
      Mouse: { cursor: 'pointer', interceptClicks: true, focusable: true, tabIndex: 0, draggable: true },
      ...createDefaultInteractiveSections('Range'),
    },
  },

  Slider: {
    sections: ['Mouse', 'Behavior', 'Parts', 'Bindings', 'States', 'Animations', 'Scripts'],
    defaultOverrides: {
      Transform: { width: 220, height: 48 },
      Mouse: { cursor: 'pointer', interceptClicks: true, focusable: true, tabIndex: 0, draggable: true },
      ...createDefaultInteractiveSections('Slider'),
    },
  },

  Container: {
    sections: ['Background', 'Effects', 'Grid', 'Children'],
    defaultOverrides: {
      Transform: { width: 300, height: 200 },
      Grid: { enabled: true, snap: true, size: 10 },
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
