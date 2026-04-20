import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { deepClone } from '../utils/deepClone.js';

export function valueAtPath(control, path) {
  if (!control || !path) return undefined;

  const parts = String(path).split('.');
  let current = control;

  for (const part of parts) {
    if (current?._children?.[part] !== undefined) {
      current = current._children[part];
    } else if (current?.[part] !== undefined) {
      current = current[part];
    } else {
      return undefined;
    }
  }

  return current;
}

function getDefaultChildTemplate(typeName, childName) {
  if (!typeName || !childName) return undefined;
  const sectionDefaults = SECTION_DEFAULTS[typeName];
  return sectionDefaults?._children?.[childName];
}

export function setNestedValue(control, path, value) {
  const parts = String(path).split('.');
  if (parts.length === 0) return;

  if (parts.length === 1) {
    if (!control._children) return;
    control._children[parts[0]] = value;
    return;
  }

  let current = control._children?.[parts[0]];
  if (!current) return;

  for (let index = 1; index < parts.length - 1; index += 1) {
    const key = parts[index];

    if (current._children && current._children[key] !== undefined) {
      current = current._children[key];
      continue;
    }

    if (current._children && current._children[key] === undefined) {
      const defaultChild = getDefaultChildTemplate(current._type, key);
      if (defaultChild !== undefined) {
        current._children[key] = deepClone(defaultChild);
        current = current._children[key];
        continue;
      }
    }

    if (current[key] !== undefined) {
      current = current[key];
      continue;
    }

    return;
  }

  const propName = parts[parts.length - 1];
  const treeValue = value != null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value._type !== undefined || value._children !== undefined);
  const defaultChild = current?._children ? getDefaultChildTemplate(current._type, propName) : undefined;

  if (current?._children && (current._children[propName] !== undefined || treeValue || defaultChild !== undefined)) {
    current._children[propName] = value;
  } else {
    current[propName] = value;
  }
}

export function deleteNestedValue(control, path) {
  const parts = String(path).split('.');
  if (parts.length === 0) return;

  if (parts.length === 1) {
    if (!control._children) return;
    delete control._children[parts[0]];
    return;
  }

  let current = control._children?.[parts[0]];
  if (!current) return;

  for (let index = 1; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (current?._children?.[key] !== undefined) {
      current = current._children[key];
    } else if (current?.[key] !== undefined) {
      current = current[key];
    } else {
      return;
    }
  }

  const finalKey = parts[parts.length - 1];
  if (current?._children?.[finalKey] !== undefined) {
    delete current._children[finalKey];
  } else if (current && current[finalKey] !== undefined) {
    delete current[finalKey];
  }
}

export function applyPatchObject(control, patch) {
  if (!control || !patch || Object.keys(patch).length === 0) return control;

  for (const [path, value] of Object.entries(patch)) {
    setNestedValue(control, path, deepClone(value));
  }

  return control;
}
