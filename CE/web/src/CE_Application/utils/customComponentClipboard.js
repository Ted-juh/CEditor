// In-session clipboard for custom-component parts and the hit zones that
// follow them. Module-level so a copy survives switching components — parts
// can be pasted across components within the same session.
//
// The paste logic is a pure patch builder (unit-testable): it renames
// clones against the destination's existing names, rewires `part:<name>`
// hit-zone sources to the pasted names, offsets layout so the paste is
// visible, and stacks the clones above the destination's layers.

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueName(base, taken, fallback) {
  const safeBase = String(base || fallback).replace(/[^a-zA-Z0-9_]/g, '') || fallback;
  let name = safeBase;
  let index = 1;
  while (taken.has(name)) {
    index += 1;
    name = `${safeBase}_${index}`;
  }
  taken.add(name);
  return name;
}

let clipboard = null;

/**
 * Store parts (and optionally hit zones) on the clipboard.
 * parts: array of authored part nodes (each carries `.name`).
 * hitZones: array of authored hit-zone nodes (each carries `.name`).
 */
export function setPartClipboard(parts = [], hitZones = []) {
  if (!parts.length) return;
  clipboard = {
    parts: cloneValue(parts),
    hitZones: cloneValue(hitZones),
  };
}

export function getPartClipboard() {
  return clipboard;
}

export function hasPartClipboard() {
  return Array.isArray(clipboard?.parts) && clipboard.parts.length > 0;
}

export function clearPartClipboard() {
  clipboard = null;
}

/**
 * Build a control patch that pastes the clipboard into a component.
 *
 * existingPartNames / existingZoneNames: iterables of names already used in
 * the destination. baseZIndex: highest layer z-index in the destination.
 * Returns { patch, partNames, zoneNames } or null when the clipboard is empty.
 */
export function buildPastePatch(payload, existingPartNames, existingZoneNames, baseZIndex = 0, offset = 12) {
  const parts = Array.isArray(payload?.parts) ? payload.parts : [];
  if (!parts.length) return null;

  const takenParts = new Set(existingPartNames);
  const takenZones = new Set(existingZoneNames);
  const renames = new Map();
  const patch = {};
  const partNames = [];
  const zoneNames = [];
  let zIndex = Number(baseZIndex) || 0;

  for (const source of parts) {
    const clone = cloneValue(source);
    const nextName = uniqueName(`${clone.name ?? 'part'}_copy`, takenParts, 'part');
    renames.set(clone.name, nextName);
    clone.name = nextName;
    clone.locked = false;
    clone.zIndex = ++zIndex;
    if (clone._children?.Layout) {
      clone._children.Layout.offsetX = (Number(clone._children.Layout.offsetX) || 0) + offset;
      clone._children.Layout.offsetY = (Number(clone._children.Layout.offsetY) || 0) + offset;
    }
    patch[`Parts.${nextName}`] = clone;
    partNames.push(nextName);
  }

  for (const source of (Array.isArray(payload?.hitZones) ? payload.hitZones : [])) {
    const clone = cloneValue(source);
    const nextName = uniqueName(`${clone.name ?? 'zone'}_copy`, takenZones, 'zone');
    clone.name = nextName;
    // Re-point part-following zones at the pasted part names.
    const followed = /^part:(.+)$/.exec(String(clone.source ?? ''));
    if (followed && renames.has(followed[1])) {
      clone.source = `part:${renames.get(followed[1])}`;
    }
    patch[`HitZones.${nextName}`] = clone;
    zoneNames.push(nextName);
  }

  return { patch, partNames, zoneNames };
}
