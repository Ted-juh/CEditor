import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { deepClone } from '../utils/deepClone.js';

function isArrayIndexSegment(value) {
  return /^\d+$/.test(String(value ?? ''));
}

function readChildValue(current, part) {
  if (Array.isArray(current) && isArrayIndexSegment(part)) {
    return current[Number(part)];
  }

  if (current?._children?.[part] !== undefined) {
    return current._children[part];
  }

  if (current?.[part] !== undefined) {
    return current[part];
  }

  return undefined;
}

export function valueAtPath(control, path) {
  if (!control || !path) return undefined;

  const parts = String(path).split('.');
  let current = control;

  for (const part of parts) {
    const next = readChildValue(current, part);
    if (next === undefined) {
      return undefined;
    }

    current = next;
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

    if (Array.isArray(current) && isArrayIndexSegment(key)) {
      const nextIndex = Number(key);
      if (current[nextIndex] === undefined) return;
      current = current[nextIndex];
      continue;
    }

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
  if (Array.isArray(current) && isArrayIndexSegment(propName)) {
    current[Number(propName)] = value;
    return;
  }

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
    if (Array.isArray(current) && isArrayIndexSegment(key)) {
      current = current[Number(key)];
    } else if (current?._children?.[key] !== undefined) {
      current = current._children[key];
    } else if (current?.[key] !== undefined) {
      current = current[key];
    } else {
      return;
    }
  }

  const finalKey = parts[parts.length - 1];
  if (Array.isArray(current) && isArrayIndexSegment(finalKey)) {
    delete current[Number(finalKey)];
  } else if (current?._children?.[finalKey] !== undefined) {
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

// Sections worth surfacing in the script Paths picker (the visually/behaviorally meaningful ones).
// Heavy structural sections (Parts, Behaviors, HitZones, Bindings, Scripts, Animations, …) are
// intentionally excluded — they aren't typical set()/get() targets and would drown the list.
const PICKER_SECTIONS = ['Core', 'Transform', 'Background', 'Text', 'Border', 'Icon', 'Effects', 'Grid'];
const PICKER_LEAF_BLOCKLIST = new Set(['Core.id', 'Core.controlType', 'Core.name']);

function pushScalarLeaves(node, prefix, out) {
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (key === '_type' || key === '_children') continue;
    const t = typeof value;
    if (value !== null && (t === 'string' || t === 'number' || t === 'boolean')) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (!PICKER_LEAF_BLOCKLIST.has(path)) out.push(path);
    }
  }
  if (node._children && typeof node._children === 'object') {
    for (const [key, child] of Object.entries(node._children)) {
      pushScalarLeaves(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
}

// The leaf set depends on a control's STRUCTURE, not its values — so we memoize per control id on
// a cheap structural fingerprint. This skips the deep walk during live value-change dispatch
// (when only values move and the Script tab keeps re-deriving the picker's control list).
const _leafCache = new Map(); // Core.id -> { fp, leaves }

function structureFingerprint(kids) {
  const parts = [];
  for (const sec of Object.keys(kids).sort()) {
    const node = kids[sec];
    const sub = node && node._children ? Object.keys(node._children).sort().join('+') : '';
    parts.push(sub ? `${sec}:${sub}` : sec);
  }
  return parts.join(',');
}

/**
 * Enumerate the addressable property dot-paths for a control, for the script Paths picker.
 * Order: value forms first (the most-used) — `value` for standard controls, each ValueChannel
 * name for custom components (those resolve to the channel's currentValue) — then the structural
 * leaves of the meaningful sections (Transform.x, Background.Fill.colour, …). De-duplicated.
 */
export function enumerateLeafPaths(control) {
  const kids = control?._children;
  if (!kids || typeof kids !== 'object') return [];

  const id = kids.Core?.id;
  const fp = structureFingerprint(kids);
  if (id != null) {
    const cached = _leafCache.get(id);
    if (cached && cached.fp === fp) return cached.leaves;
  }

  const out = [];
  // Value forms (most-used) up top.
  if (kids.Value && typeof kids.Value === 'object' && 'value' in kids.Value) out.push('value');
  const channels = kids.ValueChannels?._children;
  if (channels && typeof channels === 'object') {
    const sectionKeys = new Set(Object.keys(kids).map((k) => k.toLowerCase()));
    for (const name of Object.keys(channels)) {
      // A channel named after a section (e.g. "Core") is shadowed by that section during
      // resolution, so qualify those few to keep them reachable; everything else stays friendly.
      out.push(sectionKeys.has(name.toLowerCase()) ? `ValueChannels.${name}` : name);
    }
  }

  // Structural leaves from the meaningful sections.
  for (const section of PICKER_SECTIONS) {
    if (kids[section] && typeof kids[section] === 'object') pushScalarLeaves(kids[section], section, out);
  }

  const leaves = [...new Set(out)];
  if (id != null) _leafCache.set(id, { fp, leaves });
  return leaves;
}
