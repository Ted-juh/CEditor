import { deepClone } from './deepClone.js';
import { flatControls, mapControlsTree } from './containment.js';

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getControlId(control) {
  return String(control?._children?.Core?.id ?? '');
}

function getBehavior(control) {
  return control?._children?.Behavior ?? null;
}

function getGroupId(behavior) {
  return String(behavior?.groupId ?? '').trim();
}

export function isExclusiveSelectBehavior(behavior) {
  const role = normalizeKey(behavior?.role);
  if (normalizeKey(behavior?.family) !== 'select') return false;
  if (normalizeKey(behavior?.valueType) !== 'bool') return false;
  if (role !== 'radio' && role !== 'segmented') return false;
  return getGroupId(behavior).length > 0;
}

export function getExclusiveSelectGroupId(control) {
  const behavior = getBehavior(control);
  if (!isExclusiveSelectBehavior(behavior)) return '';
  return getGroupId(behavior);
}

export function findExclusiveSelectGroupControls(controls = [], targetControlId = '') {
  if (!Array.isArray(controls) || !targetControlId) return [];

  const all = flatControls(controls);
  const target = all.find((control) => getControlId(control) === targetControlId) ?? null;
  const groupId = getExclusiveSelectGroupId(target);
  if (!groupId) return [];

  return all.filter((control) => getExclusiveSelectGroupId(control) === groupId);
}

export function normalizeExclusiveSelectDefaults(controls = [], preferredControlIds = []) {
  if (!Array.isArray(controls) || controls.length === 0) {
    return Array.isArray(controls) ? controls : [];
  }

  // Group membership spans the whole tree — a radio group can live inside a container.
  const all = flatControls(controls);
  const groups = new Map();
  for (const control of all) {
    const groupId = getExclusiveSelectGroupId(control);
    if (!groupId) continue;
    const bucket = groups.get(groupId) ?? [];
    bucket.push(control);
    groups.set(groupId, bucket);
  }

  const preferredIds = new Set(preferredControlIds.filter(Boolean));
  const loserIds = new Set();

  for (const members of groups.values()) {
    const checked = members.filter((control) => getBehavior(control)?.defaultValue === true);
    if (checked.length <= 1) continue;

    const winner = checked.find((control) => preferredIds.has(getControlId(control))) ?? checked[0];
    for (const control of checked) {
      if (control !== winner) loserIds.add(getControlId(control));
    }
  }

  if (loserIds.size === 0) return controls;

  return mapControlsTree(controls, (control) => {
    if (!loserIds.has(getControlId(control))) return control;
    const clone = deepClone(control);
    if (clone?._children?.Behavior) {
      clone._children.Behavior.defaultValue = false;
    }
    return clone;
  });
}
