import { deepClone } from './deepClone.js';

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

  const target = controls.find((control) => getControlId(control) === targetControlId) ?? null;
  const groupId = getExclusiveSelectGroupId(target);
  if (!groupId) return [];

  return controls.filter((control) => getExclusiveSelectGroupId(control) === groupId);
}

export function normalizeExclusiveSelectDefaults(controls = [], preferredControlIds = []) {
  if (!Array.isArray(controls) || controls.length === 0) {
    return Array.isArray(controls) ? controls : [];
  }

  const groups = new Map();
  for (let index = 0; index < controls.length; index += 1) {
    const groupId = getExclusiveSelectGroupId(controls[index]);
    if (!groupId) continue;
    const bucket = groups.get(groupId) ?? [];
    bucket.push(index);
    groups.set(groupId, bucket);
  }

  let nextControls = null;
  const preferredIds = new Set(preferredControlIds.filter(Boolean));

  for (const indexes of groups.values()) {
    const checkedIndexes = indexes.filter((index) => getBehavior(controls[index])?.defaultValue === true);
    if (checkedIndexes.length <= 1) continue;

    const winnerIndex = checkedIndexes.find((index) => preferredIds.has(getControlId(controls[index])))
      ?? checkedIndexes[0];

    for (const index of checkedIndexes) {
      if (index === winnerIndex) continue;

      if (!nextControls) nextControls = [...controls];
      const clone = deepClone(nextControls[index]);
      if (clone?._children?.Behavior) {
        clone._children.Behavior.defaultValue = false;
      }
      nextControls[index] = clone;
    }
  }

  return nextControls ?? controls;
}
