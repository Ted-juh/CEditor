/**
 * Container nesting — tree helpers over the panel's control tree.
 *
 * Controls nest inside a container's `Children._children.<id>`. The panel's
 * `controls` array holds only top-level controls; everything below lives in
 * the tree. Child `Transform.x/y` is parent-relative (offset from the
 * container's content origin = Children.padding).
 *
 * Every function here treats control structures as immutable — structural
 * ops clone-on-write and return new arrays/objects.
 */

import { deepClone } from './deepClone.js';

let remintCounter = 0;

export function isContainerControl(control) {
  return !!control?._children?.Children;
}

function childrenMapOf(control) {
  const map = control?._children?.Children?._children;
  return map && typeof map === 'object' ? map : null;
}

/** Array of child controls of a container (skips non-control entries). */
export function getChildControls(control) {
  const map = childrenMapOf(control);
  if (!map) return [];
  return Object.values(map).filter((child) => child?._children?.Core);
}

/**
 * Depth-first walk. fn(control, parent, depth) — parent is null for
 * top-level controls.
 */
export function walkControls(controls, fn, parent = null, depth = 0) {
  for (const control of controls ?? []) {
    if (!control?._children?.Core) continue;
    fn(control, parent, depth);
    const kids = getChildControls(control);
    if (kids.length) walkControls(kids, fn, control, depth + 1);
  }
}

/** Every control in the tree as a flat array (depth-first). */
export function flatControls(controls) {
  const out = [];
  walkControls(controls, (control) => out.push(control));
  return out;
}

/** Map of id → { control, parent, depth } over the whole tree. */
export function buildControlIndex(controls) {
  const index = new Map();
  walkControls(controls, (control, parent, depth) => {
    const id = control._children.Core.id;
    if (id != null) index.set(id, { control, parent, depth });
  });
  return index;
}

export function findControlById(controls, id) {
  if (id == null) return null;
  let found = null;
  walkControls(controls, (control) => {
    if (!found && control._children.Core.id === id) found = control;
  });
  return found;
}

/** Parent control of `id`, or null when top-level (or not found). */
export function findParentOfControl(controls, id) {
  return buildControlIndex(controls).get(id)?.parent ?? null;
}

/** Ancestor ids of `id`, nearest parent first. */
export function getAncestorIds(controls, id) {
  const index = buildControlIndex(controls);
  const out = [];
  let entry = index.get(id);
  while (entry?.parent) {
    const parentId = entry.parent._children.Core.id;
    out.push(parentId);
    entry = index.get(parentId);
  }
  return out;
}

/** True when `id` sits anywhere inside `ancestorId`'s subtree. */
export function isDescendantOfControl(controls, ancestorId, id) {
  return getAncestorIds(controls, id).includes(ancestorId);
}

/** All ids in a control's subtree, including its own. */
export function collectSubtreeIds(control) {
  const out = [];
  walkControls([control], (node) => out.push(node._children.Core.id));
  return out;
}

/** Selected ids minus those whose ancestor is also selected. */
export function selectionRoots(controls, ids) {
  const idSet = ids instanceof Set ? ids : new Set(ids);
  const roots = [];
  for (const id of idSet) {
    if (!getAncestorIds(controls, id).some((ancestorId) => idSet.has(ancestorId))) {
      roots.push(id);
    }
  }
  return roots;
}

/** A container's content origin inside its own box (Children.padding). */
export function contentOrigin(container) {
  const padding = Number(container?._children?.Children?.padding);
  const value = Number.isFinite(padding) ? padding : 0;
  return { x: value, y: value };
}

/**
 * Panel-space origin of the coordinate frame a control's x/y is expressed
 * in: the sum of every ancestor's position plus its content origin.
 * Top-level controls → { x: 0, y: 0 }.
 */
export function controlPanelOffset(controls, id) {
  const index = buildControlIndex(controls);
  let offsetX = 0;
  let offsetY = 0;
  let entry = index.get(id);
  while (entry?.parent) {
    const parentTransform = entry.parent._children?.Transform;
    const origin = contentOrigin(entry.parent);
    offsetX += (parentTransform?.x ?? 0) + origin.x;
    offsetY += (parentTransform?.y ?? 0) + origin.y;
    entry = index.get(entry.parent._children.Core.id);
  }
  return { x: offsetX, y: offsetY };
}

/** Panel-space rect of a control anywhere in the tree. */
export function controlPanelRect(controls, id) {
  const control = findControlById(controls, id);
  const transform = control?._children?.Transform;
  if (!transform) return null;
  const offset = controlPanelOffset(controls, id);
  return {
    x: (transform.x ?? 0) + offset.x,
    y: (transform.y ?? 0) + offset.y,
    w: transform.width ?? 0,
    h: transform.height ?? 0,
  };
}

/** Convert a panel-space point to a container's local (content) space. */
export function panelToLocalPoint(controls, containerId, x, y) {
  if (containerId == null) return { x, y };
  const rect = controlPanelRect(controls, containerId);
  const container = findControlById(controls, containerId);
  if (!rect || !container) return { x, y };
  const origin = contentOrigin(container);
  return { x: x - rect.x - origin.x, y: y - rect.y - origin.y };
}

/**
 * Clone-on-write map over every control node. fn(control) returns a
 * replacement node or the same node (=== means unchanged). Returns the
 * (possibly new) top-level array.
 */
export function mapControlsTree(controls, fn) {
  let changed = false;

  const next = (controls ?? []).map((control) => {
    if (!control?._children?.Core) return control;
    const mapped = mapControlNode(control, fn);
    if (mapped !== control) changed = true;
    return mapped;
  });

  return changed ? next : controls;
}

function mapControlNode(control, fn) {
  let node = fn(control) ?? control;

  const kids = childrenMapOf(node);
  if (kids) {
    let kidsChanged = false;
    const nextKids = {};
    for (const [key, child] of Object.entries(kids)) {
      if (!child?._children?.Core) {
        nextKids[key] = child;
        continue;
      }
      const mapped = mapControlNode(child, fn);
      nextKids[key] = mapped;
      if (mapped !== child) kidsChanged = true;
    }

    if (kidsChanged) {
      node = withChildrenMap(node === control ? shallowCloneControl(node) : node, nextKids);
    }
  }

  return node;
}

function shallowCloneControl(control) {
  return {
    ...control,
    _children: { ...control._children },
  };
}

function withChildrenMap(node, childrenMap) {
  node._children.Children = { ...node._children.Children, _children: childrenMap };
  return node;
}

/**
 * Remove a control (and its subtree) from anywhere in the tree.
 * Returns { controls, removed } — `controls` is a new array when a removal
 * happened, `removed` is the removed node (or null).
 */
export function removeControlFromTree(controls, id) {
  let removed = null;

  const topLevel = [];
  let topChanged = false;
  for (const control of controls ?? []) {
    if (control?._children?.Core?.id === id) {
      removed = control;
      topChanged = true;
      continue;
    }
    topLevel.push(control);
  }
  if (removed) return { controls: topLevel, removed };

  const next = mapControlsTree(controls, (node) => {
    if (removed) return node;
    const kids = childrenMapOf(node);
    if (!kids) return node;

    const entry = Object.entries(kids).find(([, child]) => child?._children?.Core?.id === id);
    if (!entry) return node;

    removed = entry[1];
    const nextKids = { ...kids };
    delete nextKids[entry[0]];
    return withChildrenMap(shallowCloneControl(node), nextKids);
  });

  return removed ? { controls: next, removed } : { controls: controls ?? [], removed: null };
}

/**
 * Insert a control under `parentId` (null → top level). Returns the new
 * top-level array. The parent must be a container; otherwise the control is
 * appended top-level so nothing is ever silently dropped.
 */
export function insertControlIntoTree(controls, parentId, control) {
  const id = control?._children?.Core?.id;
  if (id == null) return controls ?? [];

  if (parentId == null) return [...(controls ?? []), control];

  let inserted = false;
  const next = mapControlsTree(controls, (node) => {
    if (inserted || node._children.Core.id !== parentId || !isContainerControl(node)) return node;
    inserted = true;
    const kids = childrenMapOf(node) ?? {};
    return withChildrenMap(shallowCloneControl(node), { ...kids, [id]: control });
  });

  return inserted ? next : [...(controls ?? []), control];
}

/** Deep-clone a control with fresh panel-unique ids for it and every descendant. */
export function remintControlIds(control) {
  const clone = deepClone(control);
  remintNode(clone);
  return clone;
}

function remintNode(node) {
  node._children.Core.id = `ctrl_${Date.now()}_${(remintCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const kids = childrenMapOf(node);
  if (kids) {
    // Rebuild the children map so its keys track the fresh ids
    const rebuilt = {};
    for (const child of Object.values(kids)) {
      if (!child?._children?.Core) continue;
      remintNode(child);
      rebuilt[child._children.Core.id] = child;
    }
    node._children.Children = { ...node._children.Children, _children: rebuilt };
  }
}

/**
 * Flow layout: children positioned sequentially, wrapping rows at the
 * container's content width. Ignores child x/y. Returns Map id → { x, y }
 * in the container's content space. Shared by editor and player rendering.
 */
export function computeFlowLayout(children, containerWidth, gap = 0, padding = 0) {
  const positions = new Map();
  const contentWidth = Math.max(0, containerWidth - padding * 2);
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const child of children ?? []) {
    const transform = child?._children?.Transform;
    const w = transform?.width ?? 0;
    const h = transform?.height ?? 0;

    if (cursorX > 0 && cursorX + w > contentWidth) {
      cursorX = 0;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }

    positions.set(child._children.Core.id, { x: cursorX, y: cursorY });
    cursorX += w + gap;
    rowHeight = Math.max(rowHeight, h);
  }

  return positions;
}

/**
 * Flattened controls with panel-space synthetic Transforms — for consumers
 * that do rect math in panel coordinates (snapping, marquee, distances).
 * The returned entries share every section except Transform.
 */
export function flatControlsWithPanelRects(controls) {
  const out = [];

  const visit = (list, offsetX, offsetY) => {
    for (const control of list ?? []) {
      const transform = control?._children?.Transform;
      if (!control?._children?.Core || !transform) continue;

      out.push({
        ...control,
        _children: {
          ...control._children,
          Transform: {
            ...transform,
            x: (transform.x ?? 0) + offsetX,
            y: (transform.y ?? 0) + offsetY,
          },
        },
      });

      const kids = getChildControls(control);
      if (kids.length) {
        const origin = contentOrigin(control);
        visit(kids, offsetX + (transform.x ?? 0) + origin.x, offsetY + (transform.y ?? 0) + origin.y);
      }
    }
  };

  visit(controls, 0, 0);
  return out;
}
