// customComponentVariants.js — a custom component's named looks, applied.
//
// A component can define variants (Compact, Dark, Light…) in the designer's Publish tab, and each
// placed copy picks one. Until 2026-09-29 nothing that drew a component read either, so picking a
// variant changed the document and nothing on screen. resolveInteractiveControl — the one path the
// editor canvas, the preview and the exported plug-in all draw through — now applies it.
//
// WHAT A VARIANT MAY CHANGE. How the component looks: its parts, and the root's own appearance
// sections. Not how it behaves (hit zones, channels, bindings, links, states) and not where it
// sits (Transform). Hit testing reads the component's own hit zones, not the resolved copy, so a
// variant that moved a hit zone would draw one thing and respond to clicks somewhere else; and a
// variant that resized the instance would fight whoever placed it. Such paths are refused, and
// the variants editor says so rather than letting them be written and silently do nothing.
//
// WHICH VARIANT. The UI writes the choice to both Variants.active and Designer.activeVariant;
// scripts and the published `variant` property write only Designer.activeVariant. The first of the
// two that names an existing, enabled variant wins, so either route works and a stale name (a
// removed variant) falls through instead of blanking the component.

const LOOK_ROOTS = new Set(['Parts', 'Background', 'Text', 'Effects', 'Image']);

/** Why a variant may not patch this path, or '' when it may. */
export function variantPathRefusal(path) {
  const text = String(path ?? '').trim();
  if (!text) return 'empty path';
  const [root, ...rest] = text.split('.');
  if (!LOOK_ROOTS.has(root)) {
    return root === 'Transform'
      ? 'a variant does not move or resize a placed copy; that is the copy\'s own Transform'
      : `a variant changes how a component looks; ${root} is how it behaves`;
  }
  if (root === 'Parts' && rest.length < 2) return 'name a part and one of its properties';
  return '';
}

/** The variant a copy is showing, or null for the base look. */
export function activeVariantOf(control) {
  const children = control?._children ?? {};
  const variants = children.Variants?._children ?? {};
  const candidates = [children.Designer?.activeVariant, children.Variants?.active];
  for (const name of candidates) {
    if (typeof name !== 'string' || !name) continue;
    const variant = variants[name];
    if (!variant) continue;
    if (variant.enabled === false) return null;
    const patches = variant.patches ?? {};
    return Object.keys(patches).length ? { name, variant, patches } : null;
  }
  return null;
}

/**
 * The node a path's last segment is set on, walking `_children` first as the rest of the tree
 * code does — or null when the path leads nowhere.
 */
function parentFor(node, segments) {
  let current = node;
  for (const key of segments.slice(0, -1)) {
    if (current?._children?.[key] !== undefined) current = current._children[key];
    else if (current?.[key] !== undefined && current[key] !== null && typeof current[key] === 'object') current = current[key];
    else return null;
  }
  return current && typeof current === 'object' ? current : null;
}

/**
 * Write a variant's patches into `node` (mutating it). Returns the patches whose target does not
 * exist YET — a part a generator has not made, say — so the caller can retry them after
 * materializing. Refused paths are neither written nor returned.
 */
export function applyVariantPatches(node, patches = {}) {
  const missed = {};
  for (const [path, value] of Object.entries(patches ?? {})) {
    if (variantPathRefusal(path)) continue;
    const segments = path.split('.');
    const parent = parentFor(node, segments);
    if (!parent) {
      missed[path] = value;
      continue;
    }
    const last = segments[segments.length - 1];
    const copy = value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
    if (parent._children?.[last] !== undefined) parent._children[last] = copy;
    else parent[last] = copy;
  }
  return missed;
}

/**
 * Apply the copy's active variant to `node` (a clone the caller owns). Returns the patches still
 * waiting on materialization, or null when there were none.
 */
export function applyActiveVariant(node) {
  const active = activeVariantOf(node);
  if (!active) return null;
  const missed = applyVariantPatches(node, active.patches);
  return Object.keys(missed).length ? missed : null;
}

/**
 * Each patch of a variant, checked against the component: will it apply, and if not, why not.
 * `materialized` is the component after its generators ran, so a patch on a generated part counts
 * as found.
 */
export function describeVariantPatches(patches = {}, materialized = null) {
  return Object.keys(patches ?? {}).map((path) => {
    const refusal = variantPathRefusal(path);
    if (refusal) return { path, status: 'refused', reason: refusal };
    if (materialized && !parentFor(materialized, path.split('.'))) {
      return { path, status: 'missing', reason: 'nothing on this component has that path, so it changes nothing' };
    }
    return { path, status: 'ok', reason: '' };
  });
}
