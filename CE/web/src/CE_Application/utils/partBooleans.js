/**
 * partBooleans.js — the designer's shape operations that end in ONE path part: Flatten (a live
 * combined shape baked into a path) and Smooth (a Pen path's corners turned into a curve).
 *
 * Combining itself is live and keeps its operands — see booleanGroups.js. Flatten is the explicit,
 * destructive step after it, for when the operands are no longer wanted: the group becomes a `path`
 * part in its compound form and its operands are removed.
 *
 * THE COMPOUND FORM of a `path` part (see penPath.js for the point form):
 *
 *   meta.pathData   SVG path data in 0..1 of the part's box, y downward — the scheme the polygons and
 *                   the point form use, so it scales with the part — filled even-odd
 *   meta.closed     true (Smooth keeps an open path open)
 *
 * A closed compound path paints through the same outline pipeline as a live group, so every fill and
 * border feature applies to it. It is not vertex-editable: it moves, scales and styles like any part.
 *
 * Because Flatten removes parts, an operand anything still refers to — a hit zone, a binding, a state,
 * a published property, a variant — is refused by name: those references would point at nothing.
 * (Keeping the group live is always the way round that; it is why groups are live.)
 */
import { partFrame } from './customDesignSurfaceGeometry.js';
import { hasCompoundPath, pathIsClosed, pathVectorPoints } from './penPath.js';
import { loadGeometry } from './partOutlines.js';
import {
  attachBooleanInputs, booleanSpec, computeBooleanShape, groupMemberNames, isBooleanGroup,
} from './booleanGroups.js';

export { hasCompoundPath, loadGeometry };

/** Everything in the component that names a part: the reason a removed part would break it. */
export function partReferences(control, name) {
  const kids = control?._children ?? {};
  const found = [];
  const mentions = (value) => {
    const text = JSON.stringify(value ?? null);
    return text.includes(`"Parts.${name}.`) || text.includes(`"part:${name}"`) || text.includes(`Parts.${name}.`);
  };
  for (const [zoneName, zone] of Object.entries(kids.HitZones?._children ?? {})) {
    if (String(zone?.source ?? '') === `part:${name}`) found.push(`hit zone ${zoneName}`);
  }
  for (const [bindingName, binding] of Object.entries(kids.Bindings?._children ?? {})) {
    if (String(binding?.target ?? '').startsWith(`Parts.${name}.`)) found.push(`binding ${bindingName}`);
  }
  for (const [stateName, state] of Object.entries(kids.States?._children ?? {})) {
    if (state?.patches?.parts && Object.hasOwn(state.patches.parts, name)) found.push(`state ${stateName}`);
  }
  for (const [propertyName, entry] of Object.entries(kids.PublishedProperties?.editableProperties ?? {})) {
    if (String(entry?.path ?? '').startsWith(`Parts.${name}.`)) found.push(`published property ${propertyName}`);
  }
  for (const [variantName, variant] of Object.entries(kids.Variants?._children ?? {})) {
    if (mentions(variant?.patches)) found.push(`variant ${variantName}`);
  }
  return found;
}

const round2 = (value) => Math.round(value * 100) / 100;

function unitPathData(scope, pathData, bounds) {
  const item = new scope.CompoundPath({ pathData, insert: false });
  item.transform(new scope.Matrix(1 / Math.max(1e-6, bounds.width), 0, 0, 1 / Math.max(1e-6, bounds.height), 0, 0));
  return item.getPathData(null, 5);
}

function pxLayout(bounds) {
  return {
    mode: 'absolute',
    x: round2(bounds.x),
    y: round2(bounds.y),
    width: round2(Math.max(1, bounds.width)),
    height: round2(Math.max(1, bounds.height)),
    xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px',
    anchorX: 'left', anchorY: 'top', offsetX: 0, offsetY: 0,
    // The turn and scale are in the outline now.
    rotation: 0, scale: 1, pivotX: 50, pivotY: 50,
  };
}

/**
 * Plan Flatten: the group `groupName` baked into a compound path part of the same name, its operands
 * (nested groups' included) removed. `resolvedParts` is the component's parts as drawn (the designer's
 * snapshot). Returns `{ ok: false, refused }` or `{ ok: true, parts }` (the next Parts._children).
 */
export async function planFlatten(control, partsChildren, resolvedParts, groupName, { artboardWidth, artboardHeight }) {
  const group = partsChildren?.[groupName];
  if (!isBooleanGroup(group)) return { ok: false, refused: [{ name: groupName, reason: 'not a combined shape' }] };
  const members = groupMemberNames(partsChildren, groupName);
  const refused = [];
  for (const name of members) {
    const references = partReferences(control, name);
    if (references.length) refused.push({ name, reason: `used by ${references.join(', ')} — flattening removes it; keep the shape live, or retarget those first` });
  }
  if (refused.length) return { ok: false, refused };

  const view = JSON.parse(JSON.stringify(resolvedParts ?? partsChildren));
  attachBooleanInputs(view);
  const shape = await computeBooleanShape(view[groupName], artboardWidth, artboardHeight, []);
  if (shape.empty) return { ok: false, refused: [{ name: groupName, reason: 'the shape is empty — there is nothing to flatten' }] };
  const { scope } = await loadGeometry();

  const spec = booleanSpec(group);
  const paint = partsChildren[spec.paintFrom] ?? partsChildren[spec.operands[0]];
  const background = paint?._children?.Background ? JSON.parse(JSON.stringify(paint._children.Background)) : null;
  if (background?._children?.Corners) delete background._children.Corners;
  const flattened = {
    ...group,
    kind: 'path',
    opacity: (group.opacity ?? 1) * (paint?.opacity ?? 1),
    meta: { ...Object.fromEntries(Object.entries(group.meta ?? {}).filter(([key]) => !['boolean', 'cache', 'booleanInputs'].includes(key))), pathData: unitPathData(scope, shape.pathData, shape.bounds), closed: true },
    _children: {
      ...Object.fromEntries(Object.entries(group._children ?? {}).filter(([key]) => !['Background', 'Effects'].includes(key))),
      Layout: { ...(group._children?.Layout ?? {}), ...pxLayout(shape.bounds) },
      ...(background ? { Background: background } : {}),
      ...(paint?._children?.Effects ? { Effects: JSON.parse(JSON.stringify(paint._children.Effects)) } : {}),
    },
  };
  const next = {};
  for (const [name, part] of Object.entries(partsChildren)) {
    if (members.includes(name)) continue;
    next[name] = name === groupName ? flattened : part;
  }
  return { ok: true, parts: next };
}

/**
 * Smooth a Pen path: a curve through the same points (Catmull-Rom), so a polygon drawn with a few
 * clicks becomes the rounded shape it was sketching. The result is the compound form: it scales and
 * styles like before, and is no longer edited point by point.
 */
export async function planPathSmooth(rendered, { artboardWidth, artboardHeight }) {
  const points = pathVectorPoints(rendered);
  if (!points) return { ok: false, reason: 'only a path drawn with the Pen can be smoothed' };
  const { scope } = await loadGeometry();
  const frame = partFrame(rendered, artboardWidth, artboardHeight);
  const closed = pathIsClosed(rendered);
  const path = new scope.Path({
    segments: points.map(([x, y]) => [frame.left + x * frame.width, frame.top + y * frame.height]),
    closed,
    insert: false,
  });
  path.smooth({ type: 'catmull-rom', factor: 0.5 });
  const bounds = path.bounds;
  const box = { x: bounds.x, y: bounds.y, width: Math.max(1e-6, bounds.width), height: Math.max(1e-6, bounds.height) };
  const unit = path.clone({ insert: false });
  unit.transform(new scope.Matrix(1 / box.width, 0, 0, 1 / box.height, -box.x / box.width, -box.y / box.height));
  const patch = {
    kind: 'path',
    'meta.pathData': unit.getPathData(null, 5),
    'meta.closed': closed,
    'meta.vectorPoints': null,
  };
  for (const [key, value] of Object.entries(pxLayout(box))) patch[`Layout.${key}`] = value;
  return { ok: true, patch };
}

export function applyPartPatch(part, patch) {
  const out = { ...part, meta: { ...(part?.meta ?? {}) }, _children: { ...(part?._children ?? {}) } };
  for (const [path, value] of Object.entries(patch)) {
    const [head, ...rest] = path.split('.');
    if (!rest.length) {
      if (value === null) delete out[head]; else out[head] = value;
    } else if (head === 'meta') {
      if (value === null) delete out.meta[rest.join('.')]; else out.meta[rest.join('.')] = value;
    } else {
      out._children[head] = { ...(out._children[head] ?? { _type: head }) };
      if (value === null) delete out._children[head][rest.join('.')]; else out._children[head][rest.join('.')] = value;
    }
  }
  return out;
}
