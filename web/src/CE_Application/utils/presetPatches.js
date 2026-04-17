import { deepClone } from './deepClone.js';

function getComponentPathValue(control, path) {
  if (!control || !path) return undefined;

  const parts = String(path).split('.');
  if (parts.length === 0) return undefined;

  let current = control._children?.[parts[0]];
  if (current == null) return undefined;

  for (let i = 1; i < parts.length; i++) {
    const key = parts[i];

    if (current?._children && current._children[key] !== undefined) {
      current = current._children[key];
    } else if (current && typeof current === 'object' && current[key] !== undefined) {
      current = current[key];
    } else {
      return undefined;
    }
  }

  return current;
}

function collectComponentLeafPatches(basePath, value, out) {
  if (value === undefined) return;

  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    out[basePath] = deepClone(value);
    return;
  }

  const hasTreeShape = value._type !== undefined || value._children !== undefined;
  if (!hasTreeShape) {
    out[basePath] = deepClone(value);
    return;
  }

  for (const [key, childValue] of Object.entries(value)) {
    if (key === '_type' || key === '_children') continue;
    out[`${basePath}.${key}`] = deepClone(childValue);
  }

  for (const [childName, childValue] of Object.entries(value._children ?? {})) {
    collectComponentLeafPatches(`${basePath}.${childName}`, childValue, out);
  }
}

export function buildComponentPatch(control, scopeOptions, selectedScopeIds) {
  const selected = new Set(selectedScopeIds ?? []);
  const patch = {};

  for (const option of scopeOptions ?? []) {
    if (!selected.has(option.id)) continue;

    for (const path of option.paths ?? []) {
      const value = getComponentPathValue(control, path);
      collectComponentLeafPatches(path, value, patch);
    }
  }

  return patch;
}

export function buildPanelPatch(panel, scopeOptions, selectedScopeIds) {
  const selected = new Set(selectedScopeIds ?? []);
  const patch = {};

  for (const option of scopeOptions ?? []) {
    if (!selected.has(option.id)) continue;

    for (const path of option.paths ?? []) {
      if (panel?.[path] === undefined) continue;
      patch[path] = deepClone(panel[path]);
    }
  }

  return patch;
}

export function filterPatchByScopes(patch, scopeOptions, selectedScopeIds) {
  const selected = new Set(selectedScopeIds ?? []);
  if (selected.size === 0) return {};

  const allowedPaths = [];
  for (const option of scopeOptions ?? []) {
    if (!selected.has(option.id)) continue;
    for (const path of option.paths ?? []) {
      allowedPaths.push(String(path));
    }
  }

  const filtered = {};
  for (const [path, value] of Object.entries(patch ?? {})) {
    const normalizedPath = String(path);
    if (allowedPaths.some((allowedPath) =>
      normalizedPath === allowedPath
      || normalizedPath.startsWith(`${allowedPath}.`)
      || allowedPath.startsWith(`${normalizedPath}.`)
    )) {
      filtered[normalizedPath] = deepClone(value);
    }
  }

  return filtered;
}
