import { SECTION_DEFAULTS } from './sectionDefaults.js';

/**
 * Component type registry.
 * Each type declares which optional sections it includes (Core + Transform are always added).
 */
export const COMPONENT_TYPES = {

  Background: {
    sections: ['Background'],
    defaultOverrides: {},
  },

  Label: {
    sections: ['Background', 'Text'],
    defaultOverrides: {
      Transform: { width: 100, height: 24 },
      Text: { content: 'Label' },
    },
  },

  Button: {
    sections: ['Background', 'Text', 'Border', 'Mouse', 'States', 'Scripts'],
    defaultOverrides: {
      Transform: { width: 120, height: 40 },
      Text: { content: 'Click Me' },
      Mouse: { cursor: 'pointer', interceptClicks: true, focusable: true, tabIndex: 0 },
      Border: { enabled: true },
    },
    defaultStates: ['Hover', 'Pressed', 'Disabled', 'Focused'],
  },

  Container: {
    sections: ['Background', 'Border', 'Grid', 'Children'],
    defaultOverrides: {
      Transform: { width: 300, height: 200 },
      Grid: { enabled: true, snap: true, size: 10 },
    },
  },
};

// --- Internal helpers ---

let nextControlId = 1;

/** Deep-clone a plain object. */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Shallow-merge overrides into a section clone (one level deep into _children). */
function applyOverrides(section, overrides) {
  if (!overrides) return section;
  for (const [key, value] of Object.entries(overrides)) {
    if (key === '_children' || key === '_type') continue;
    section[key] = value;
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

  // 4. Default states (if the type defines them and States section was included)
  if (template.defaultStates && children.States) {
    if (!children.States._children) children.States._children = {};
    for (const stateName of template.defaultStates) {
      children.States._children[stateName] = { _type: stateName };
    }
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
