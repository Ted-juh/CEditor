/**
 * booleanGroups.js — combined shapes that stay live: unite, subtract, intersect and exclude as a
 * GROUP over parts that are kept, not a new path that replaces them.
 *
 * WHY LIVE. Replacing the operands with their result (what the first version did) deletes parts, and
 * a component names its parts everywhere — hit zones follow them, bindings move them, states and
 * variants restyle them, scripts address them. A deleted operand left each of those pointing at
 * nothing, so it had to be refused. Kept operands break nothing: a hit zone on the hole still follows
 * the hole, a binding that slides the hole slides the hole in the result, and Release gives back
 * exactly what was there.
 *
 * THE MODEL. A group is an ordinary part of kind `boolean`:
 *
 *   meta.boolean   { operation, operands: [names, back to front], paintFrom: name }
 *   meta.cache     the last computed outline, so a panel paints it at once (see below)
 *   Layout         the result's bounds, kept by the editor (the outline is the truth, not this box)
 *
 * and each operand carries `meta.booleanGroup: <group name>`. Operands are not drawn as themselves;
 * the group draws the outline they combine to. Hidden operands take no part (as in every drawing tool:
 * hide the hole and the plate is whole again). Subtract cuts every other visible operand out of the
 * back-most visible one.
 *
 * PAINT. The group paints with the fill, border, effects and opacity of one operand, `paintFrom` (the
 * back-most for subtract, the front-most otherwise, as drawing tools pick) — read live, so a state or
 * binding that recolours that part recolours the shape, with nothing rewritten. Every paint feature
 * the part renderer has applies to the outline (BackgroundRenderer's outline mode).
 *
 * LIVE, AT RUN TIME TOO. `attachBooleanInputs` runs at the end of the resolve pipeline
 * (resolveInteractiveControl, the designer's snapshot): each group is handed its operands as they are
 * NOW — after variants, generators, bindings and states. The renderer asks `booleanShapeFor` for the
 * outline: a synchronous answer when the operands' geometry matches the cache or an earlier result;
 * otherwise the last good outline, while Paper.js (loaded on demand, in the plug-in's player too)
 * computes the new one and `booleanShapeRevision` tells the renderer to draw it.
 *
 * NESTING. A group can be an operand of another group; its own result is what takes part.
 */
import { writable } from 'svelte/store';
import { partFrame } from './customDesignSurfaceGeometry.js';
import { BOOLEAN_KIND, isBooleanGroup, loadGeometry, partOutline, paintsBox, whyNoOutline } from './partOutlines.js';
import { textLayoutSpec } from './textOutline.js';
import { scalePathData } from './svgPathScale.js';
import { withPivotKept } from './bezierPath.js';
import { numberOr } from './primitives.js';

export { BOOLEAN_KIND, isBooleanGroup };

export const BOOLEAN_OPERATIONS = ['unite', 'subtract', 'intersect', 'exclude'];
export const BOOLEAN_LABELS = { unite: 'Unite', subtract: 'Subtract', intersect: 'Intersect', exclude: 'Exclude' };

/** The group an operand belongs to, or ''. */
export function booleanGroupOf(part) {
  const name = part?.meta?.booleanGroup;
  return typeof name === 'string' ? name : '';
}

export function isBooleanOperand(part) {
  return booleanGroupOf(part) !== '';
}

export function booleanSpec(part) {
  const spec = part?.meta?.boolean ?? {};
  const operands = Array.isArray(spec.operands) ? spec.operands.filter((name) => typeof name === 'string' && name) : [];
  const operation = BOOLEAN_OPERATIONS.includes(spec.operation) ? spec.operation : 'unite';
  const paintFrom = operands.includes(spec.paintFrom) ? spec.paintFrom : (operation === 'subtract' ? operands[0] : operands[operands.length - 1]);
  return { operation, operands, paintFrom: paintFrom ?? '' };
}

/** Part entries ([name, part]) that draw as themselves: everything but the operands of a group. */
export function drawnPartEntries(entries) {
  return entries.filter(([, part]) => !isBooleanOperand(part));
}

// --- Resolution: hand each group its live operands --------------------------------------------------

const PAINT_SECTIONS = ['Background', 'Effects'];

/**
 * For every group in a RESOLVED parts map (a private copy — this writes into it): attach the operands
 * as they are now, and dress the group in its paint source's paint. Returns the same map.
 */
export function attachBooleanInputs(partsChildren) {
  if (!partsChildren) return partsChildren;
  // Whether group `from` reaches `target` through its operands — a malformed document could make a
  // group contain itself, and attaching that would make the resolved tree circular.
  const reaches = (from, target, seen = new Set()) => {
    if (from === target) return true;
    if (seen.has(from) || !isBooleanGroup(partsChildren[from])) return false;
    seen.add(from);
    return booleanSpec(partsChildren[from]).operands.some((next) => reaches(next, target, seen));
  };
  for (const [name, part] of Object.entries(partsChildren)) {
    if (!isBooleanGroup(part)) continue;
    const spec = booleanSpec(part);
    const operands = spec.operands
      .filter((operandName) => operandName !== name && partsChildren[operandName] && !reaches(operandName, name))
      .map((operandName) => [operandName, partsChildren[operandName]]);
    const paintName = partsChildren[spec.paintFrom] ? spec.paintFrom : operands[0]?.[0];
    const paint = paintName ? partsChildren[paintName] : null;
    part.meta = { ...(part.meta ?? {}), booleanInputs: { operation: spec.operation, operands, paintFrom: paintName ?? '' } };
    part._children = { ...(part._children ?? {}) };
    for (const section of PAINT_SECTIONS) {
      if (paint?._children?.[section]) part._children[section] = paint._children[section];
      else delete part._children[section];
    }
    if (part._children.Background?._children?.Corners) {
      // The outline is the shape; corners belonged to the operand's box.
      const background = part._children.Background;
      const { Corners: _corners, ...rest } = background._children;
      part._children.Background = { ...background, _children: rest };
    }
    const groupOpacity = numberOr(part.opacity, 1);
    const paintOpacity = numberOr(paint?.opacity, 1);
    part.opacity = groupOpacity * paintOpacity;
  }
  return partsChildren;
}

// --- The geometry a result depends on (its cache key) ----------------------------------------------

const GEOMETRY_META = ['vectorPoints', 'pathData', 'closed', 'arcTrack', 'ringArc', 'valueArc', 'renderer', 'sliderControl'];

function geometryKey(part, width, height, seen = new Set()) {
  if (!part) return null;
  if (isBooleanGroup(part)) {
    const inputs = part.meta?.booleanInputs;
    if (!inputs || seen.has(part)) return { group: 'unresolved' };
    seen.add(part);
    return {
      group: inputs.operation,
      visible: part.visible !== false,
      operands: inputs.operands.map(([name, operand]) => [name, geometryKey(operand, width, height, seen)]),
    };
  }
  const meta = {};
  for (const key of GEOMETRY_META) if (part.meta?.[key] !== undefined) meta[key] = part.meta[key];
  const background = part._children?.Background?._children ?? {};
  const border = background.Border;
  const frame = partFrame(part, width, height);
  return {
    kind: part.kind ?? 'rectangle',
    visible: part.visible !== false,
    layout: part._children?.Layout ?? null,
    meta,
    corners: background.Corners ?? null,
    stroke: border ? { enabled: border.enabled === true, thickness: border.thickness ?? null } : null,
    text: part._children?.Text ? { spec: textLayoutSpec(part, frame.width, frame.height), box: paintsBox(part) } : null,
  };
}

/** The key of a group's outline: operation, operands' geometry, the face size and the insets asked. */
export function booleanShapeKey(groupPart, parentWidth, parentHeight, insetDepths = []) {
  const inputs = groupPart?.meta?.booleanInputs;
  if (!inputs) return '';
  return JSON.stringify({
    w: Math.round(parentWidth * 100) / 100,
    h: Math.round(parentHeight * 100) / 100,
    g: geometryKey(groupPart, parentWidth, parentHeight),
    i: [...insetDepths].map((depth) => Math.round(depth * 100) / 100).sort((a, b) => a - b),
  });
}

// --- Computation (async: Paper.js, fonts) ---------------------------------------------------------

async function operandItem(geo, part, width, height) {
  if (isBooleanGroup(part)) return groupItem(geo, part, width, height);
  return partOutline(geo, part, width, height);
}

async function groupItem(geo, groupPart, width, height) {
  const inputs = groupPart?.meta?.booleanInputs;
  if (!inputs) return null;
  const visible = inputs.operands.filter(([, part]) => part?.visible !== false);
  const items = [];
  for (const [, part] of visible) items.push(await operandItem(geo, part, width, height));
  if (inputs.operation === 'subtract') {
    const [base, ...cutters] = items;
    if (!base) return null;
    const cut = cutters.filter(Boolean);
    if (!cut.length) return base;
    const union = cut.slice(1).reduce((sum, item) => sum.unite(item, { insert: false }), cut[0]);
    return base.subtract(union, { insert: false });
  }
  if (inputs.operation === 'intersect') {
    if (items.some((item) => !item)) return null;
    return items.slice(1).reduce((sum, item) => sum.intersect(item, { insert: false }), items[0]);
  }
  const present = items.filter(Boolean);
  if (!present.length) return null;
  return present.slice(1).reduce((sum, item) => sum[inputs.operation](item, { insert: false }), present[0]);
}

const round3 = (value) => Math.round(value * 1000) / 1000;

/**
 * Compute a group's outline. Resolves to
 *   { pathData, bounds: { x, y, width, height }, insets: { [depth]: pathData }, empty }
 * with every path in the RESULT's own box (px, origin at bounds.x / bounds.y), even-odd.
 * `insetDepths`: the outline pulled inward by each depth, for borders (dots sit on an inset line) and
 * fills clipped inside the border.
 */
export async function computeBooleanShape(groupPart, parentWidth, parentHeight, insetDepths = []) {
  const geo = await loadGeometry();
  const item = await groupItem(geo, groupPart, parentWidth, parentHeight);
  if (!item || item.isEmpty() || Math.abs(item.area) < 0.01) {
    return { pathData: '', bounds: { x: 0, y: 0, width: 0, height: 0 }, insets: {}, empty: true };
  }
  const bounds = item.bounds;
  const local = item.clone({ insert: false });
  local.translate(new geo.scope.Point(-bounds.x, -bounds.y));
  const insets = {};
  for (const depth of insetDepths) {
    if (!(depth > 0)) continue;
    const inset = geo.PaperOffset.offset(local, -depth, { join: 'round', insert: false });
    insets[round3(depth)] = inset && !inset.isEmpty() ? inset.getPathData(null, 3) : '';
  }
  return {
    pathData: local.getPathData(null, 3),
    bounds: { x: round3(bounds.x), y: round3(bounds.y), width: round3(bounds.width), height: round3(bounds.height) },
    insets,
    empty: false,
  };
}

// --- The renderer's synchronous view of an asynchronous result -------------------------------------

/** Bumped whenever a computation finishes, so renderers that asked for it look again. */
export const booleanShapeRevision = writable(0);

const MEMO_LIMIT = 400;
const memo = new Map();
const pending = new Map();
const lastGood = new Map();

function rememberGood(identity, shape) {
  lastGood.delete(identity);
  lastGood.set(identity, shape);
  if (lastGood.size > MEMO_LIMIT) lastGood.delete(lastGood.keys().next().value);
}

function remember(key, value) {
  memo.set(key, value);
  if (memo.size > MEMO_LIMIT) memo.delete(memo.keys().next().value);
}

function shapeFromMemo(key, compute, { cacheShape = null, cacheKey = '', identity = null } = {}) {
  const hit = memo.get(key);
  if (hit) {
    if (identity && hit.shape) rememberGood(identity, hit.shape);
    return { shape: hit.shape, key, pending: false, error: hit.error ?? '' };
  }
  if (cacheKey === key && cacheShape) {
    remember(key, { shape: cacheShape });
    return { shape: cacheShape, key, pending: false, error: '' };
  }
  if (!pending.has(key)) {
    const job = compute()
      .then((shape) => remember(key, { shape }))
      .catch((error) => remember(key, { shape: null, error: error?.message ?? String(error) }))
      .finally(() => {
        pending.delete(key);
        booleanShapeRevision.update((n) => n + 1);
      });
    pending.set(key, job);
  }
  const stale = (identity && lastGood.get(identity)) ?? cacheShape ?? null;
  return { shape: stale, key, pending: true, error: '' };
}

/**
 * The outline to draw for a resolved group now: `{ shape, key, pending, error }`. `shape` may be the
 * previous outline while a new one is computed. `identity` names the group across resolves (the
 * renderer instance drawing it) so that previous outline can be found.
 */
export function booleanShapeFor(groupPart, parentWidth, parentHeight, { insetDepths = [], identity = null } = {}) {
  const key = booleanShapeKey(groupPart, parentWidth, parentHeight, insetDepths);
  if (!key) return { shape: null, key, pending: false, error: '' };
  const cache = groupPart?.meta?.cache;
  return shapeFromMemo(key, () => computeBooleanShape(groupPart, parentWidth, parentHeight, insetDepths), {
    cacheShape: cache?.shape ?? null,
    cacheKey: cache?.key ?? '',
    identity,
  });
}

/**
 * A closed compound path part's outline in its box (`width` × `height` px): synchronous — the unit
 * outline scaled — except for inward offsets (dotted borders, fills inside the border), which Paper.js
 * computes and which arrive with `booleanShapeRevision`.
 */
export function compoundShapeFor(part, width, height, { insetDepths = [], identity = null } = {}) {
  const pathData = scalePathData(part?.meta?.pathData ?? '', width, height);
  const base = { pathData, bounds: { x: 0, y: 0, width, height }, insets: {}, empty: !pathData };
  const depths = insetDepths.filter((depth) => depth > 0);
  if (!depths.length || !pathData) return { shape: base, key: '', pending: false, error: '' };
  const key = JSON.stringify({ compound: pathData, i: [...depths].sort((a, b) => a - b) });
  const result = shapeFromMemo(key, async () => {
    const geo = await loadGeometry();
    const item = new geo.scope.CompoundPath({ pathData, insert: false });
    item.fillRule = 'evenodd';
    const insets = {};
    for (const depth of depths) {
      const inset = geo.PaperOffset.offset(item, -depth, { join: 'round', insert: false });
      insets[round3(depth)] = inset && !inset.isEmpty() ? inset.getPathData(null, 3) : '';
    }
    return { ...base, insets };
  }, { identity });
  return { ...result, shape: result.shape ? { ...result.shape, pathData } : base };
}

/** Wait for every outline being computed (tests, and the designer before it writes a cache). */
export async function settleBooleanShapes() {
  while (pending.size) await Promise.all([...pending.values()]);
}

export function clearBooleanShapeMemo() {
  memo.clear();
}

// --- Authoring --------------------------------------------------------------------------------------

function uniqueName(base, taken) {
  let name = base;
  let index = 2;
  while (taken.has(name)) name = `${base}${index++}`;
  return name;
}

function paintOrder(entries) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => numberOr(a.entry[2]?.zIndex, 0) - numberOr(b.entry[2]?.zIndex, 0) || a.index - b.index)
    .map(({ entry }) => entry);
}

/** A generated part made the author's own, as the designer's Detach does (and the generator leaves it). */
export function detachedCopy(rendered) {
  const copy = JSON.parse(JSON.stringify(rendered));
  copy.generated = false;
  copy.meta = { ...(copy.meta ?? {}), generated: false, detachedFromGenerator: copy.meta?.generatedBy ?? true };
  delete copy.meta.generatedBy;
  return copy;
}

/**
 * Plan a new combined shape over `entries` ([name, authoredPart | null, renderedPart]) of a component.
 * Returns `{ ok: false, refused: [{ name, reason }] }` or
 *   `{ ok: true, groupName, parts: <the next Parts._children>, empty }`
 * — one write, so one undo takes the whole thing back.
 */
export async function planBooleanGroup(partsChildren, entries, operation, { artboardWidth, artboardHeight, name = '' } = {}) {
  if (!BOOLEAN_OPERATIONS.includes(operation)) return { ok: false, refused: [{ name: '', reason: `no operation ${operation}` }] };
  if (entries.length < 2) return { ok: false, refused: [{ name: '', reason: 'select two or more shapes' }] };
  const refused = [];
  for (const [partName, authored, rendered] of entries) {
    const part = authored ?? rendered;
    const owner = booleanGroupOf(part);
    if (owner) refused.push({ name: partName, reason: `already part of ${owner} — select ${owner} itself to combine it` });
    const why = whyNoOutline(rendered ?? authored);
    if (why) refused.push({ name: partName, reason: why });
  }
  if (refused.length) return { ok: false, refused };

  const order = paintOrder(entries);
  const operands = order.map(([partName]) => partName);
  const paintFrom = operation === 'subtract' ? operands[0] : operands[operands.length - 1];
  const taken = new Set(Object.keys(partsChildren ?? {}));
  const groupName = name && !taken.has(name) ? name : uniqueName(`${paintFrom}${operation[0].toUpperCase()}${operation.slice(1)}`, taken);

  const next = { ...(partsChildren ?? {}) };
  for (const [partName, authored, rendered] of order) {
    const base = authored ?? detachedCopy(rendered);
    next[partName] = { ...base, meta: { ...(base.meta ?? {}), booleanGroup: groupName } };
  }
  const zIndex = Math.max(...order.map(([, , rendered]) => numberOr(rendered?.zIndex, 0)));
  const group = {
    kind: BOOLEAN_KIND,
    name: groupName,
    visible: true,
    zIndex,
    meta: { boolean: { operation, operands, paintFrom } },
    _children: { Layout: { _type: 'Layout', mode: 'absolute', x: 0, y: 0, width: 1, height: 1, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' } },
  };
  next[groupName] = group;

  // Resolve against what is on screen (generated and variant-patched frames), then cache the outline.
  // A private copy: attaching inputs writes into the parts it is given.
  const resolvedView = JSON.parse(JSON.stringify(next));
  for (const [partName, , rendered] of order) {
    if (rendered) resolvedView[partName] = { ...JSON.parse(JSON.stringify(rendered)), meta: { ...(rendered.meta ?? {}), booleanGroup: groupName } };
  }
  attachBooleanInputs(resolvedView);
  const cache = await cacheFor(resolvedView[groupName], artboardWidth, artboardHeight);
  if (cache.error) return { ok: false, refused: [{ name: '', reason: cache.error }] };
  next[groupName] = withCache(group, cache);
  return { ok: true, groupName, parts: next, empty: cache.shape.empty };
}

async function cacheFor(resolvedGroup, width, height) {
  try {
    const shape = await computeBooleanShape(resolvedGroup, width, height, []);
    return { key: booleanShapeKey(resolvedGroup, width, height, []), shape, artboardWidth: width, artboardHeight: height };
  } catch (error) {
    return { error: error?.message ?? String(error) };
  }
}

function withCache(group, cache) {
  const { bounds } = cache.shape;
  const round2 = (value) => Math.round(value * 100) / 100;
  // A turned or scaled shape keeps its pivot on the same spot when its box follows the operands, or
  // the whole shape would swing each time an operand is edited (bezierPath.js withPivotKept).
  const kept = withPivotKept(group, {
    'Layout.x': round2(bounds.x), 'Layout.y': round2(bounds.y),
    'Layout.width': round2(Math.max(1, bounds.width)), 'Layout.height': round2(Math.max(1, bounds.height)),
  }, cache.artboardWidth ?? 0, cache.artboardHeight ?? 0);
  const pivot = kept['Layout.pivotX'] === undefined ? {} : { pivotX: kept['Layout.pivotX'], pivotY: kept['Layout.pivotY'] };
  return {
    ...group,
    meta: { ...group.meta, cache: { key: cache.key, shape: cache.shape } },
    _children: {
      ...group._children,
      Layout: {
        ...(group._children?.Layout ?? {}),
        mode: 'absolute',
        x: round2(bounds.x),
        y: round2(bounds.y),
        width: round2(Math.max(1, bounds.width)),
        height: round2(Math.max(1, bounds.height)),
        xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px',
        anchorX: 'left', anchorY: 'top', offsetX: 0, offsetY: 0,
        // A group's own turn / scale are the author's (the renderer applies them to the whole
        // outline); only the box follows the operands, and the pivot stays where it was drawn.
        ...pivot,
      },
    },
  };
}

/**
 * The group's cache and box brought up to date with its operands (after an edit), or null when they
 * already agree. `resolvedGroup` is the group as resolved (operands attached); `authored` its document form.
 */
export async function refreshedGroup(authored, resolvedGroup, width, height) {
  const key = booleanShapeKey(resolvedGroup, width, height, []);
  if (!key || authored?.meta?.cache?.key === key) return null;
  const cache = await cacheFor(resolvedGroup, width, height);
  if (cache.error) return null;
  return withCache(authored, cache);
}

/** Parts after changing a group's operation (subtract ↔ unite …), paint source following the convention. */
export function withOperation(partsChildren, groupName, operation) {
  const group = partsChildren?.[groupName];
  if (!isBooleanGroup(group) || !BOOLEAN_OPERATIONS.includes(operation)) return partsChildren;
  const spec = booleanSpec(group);
  const paintFrom = operation === 'subtract' ? spec.operands[0] : spec.operands[spec.operands.length - 1];
  return {
    ...partsChildren,
    [groupName]: { ...group, meta: { ...group.meta, boolean: { ...group.meta.boolean, operation, paintFrom }, cache: undefined } },
  };
}

/** Parts after Release: the group gone, its operands drawn as themselves again, untouched otherwise. */
export function releasedParts(partsChildren, groupName) {
  const group = partsChildren?.[groupName];
  if (!isBooleanGroup(group)) return partsChildren;
  const next = {};
  for (const [name, part] of Object.entries(partsChildren)) {
    if (name === groupName) continue;
    if (booleanGroupOf(part) === groupName) {
      const { booleanGroup: _group, ...meta } = part.meta ?? {};
      // A released operand that was itself in a group comes back under that group's parent, if any.
      if (booleanGroupOf(group)) meta.booleanGroup = booleanGroupOf(group);
      next[name] = { ...part, meta };
    } else {
      next[name] = part;
    }
  }
  // Operands of the released group replace it wherever an enclosing group listed it.
  const operands = booleanSpec(group).operands;
  for (const [name, part] of Object.entries(next)) {
    if (!isBooleanGroup(part)) continue;
    const spec = part.meta.boolean;
    if (!spec?.operands?.includes(groupName)) continue;
    next[name] = {
      ...part,
      meta: { ...part.meta, boolean: { ...spec, operands: spec.operands.flatMap((entry) => (entry === groupName ? operands : [entry])) }, cache: undefined },
    };
  }
  return next;
}

/** Every part name inside a group, nested groups' operands included. */
export function groupMemberNames(partsChildren, groupName, seen = new Set()) {
  const group = partsChildren?.[groupName];
  if (!isBooleanGroup(group) || seen.has(groupName)) return [];
  seen.add(groupName);
  const names = [];
  for (const name of booleanSpec(group).operands) {
    names.push(name);
    names.push(...groupMemberNames(partsChildren, name, seen));
  }
  return names;
}

// --- Keeping membership consistent through the designer's layer operations ------------------------

/** `names` plus every part inside the groups among them, in order, once each. */
export function withGroupMembers(partsChildren, names) {
  const out = [];
  const seen = new Set();
  const add = (name) => {
    if (seen.has(name) || !partsChildren?.[name]) return;
    seen.add(name);
    out.push(name);
    if (isBooleanGroup(partsChildren[name])) for (const member of booleanSpec(partsChildren[name]).operands) add(member);
  };
  for (const name of names) add(name);
  return out;
}

/**
 * Re-point membership among freshly copied parts (paste, duplicate). `clones` maps new name → part,
 * `renames` old name → new name. A copied operand whose group was not copied stands alone; a copied
 * group keeps only the operands that came with it.
 */
export function remapCopiedGroups(clones, renames) {
  for (const clone of Object.values(clones)) {
    const owner = booleanGroupOf(clone);
    if (owner) {
      const meta = { ...clone.meta };
      if (renames.has(owner)) meta.booleanGroup = renames.get(owner);
      else delete meta.booleanGroup;
      clone.meta = meta;
    }
    if (isBooleanGroup(clone)) {
      const spec = booleanSpec(clone);
      const operands = spec.operands.filter((name) => renames.has(name)).map((name) => renames.get(name));
      const paintFrom = renames.get(spec.paintFrom) ?? operands[0] ?? '';
      const { cache: _cache, ...meta } = clone.meta ?? {};
      clone.meta = { ...meta, boolean: { ...clone.meta.boolean, operands, paintFrom } };
    }
  }
  return clones;
}

/** The patch that keeps membership right when part `from` is renamed `to`. */
export function membershipRenamePatch(partsChildren, from, to) {
  const patch = {};
  for (const [name, part] of Object.entries(partsChildren ?? {})) {
    if (booleanGroupOf(part) === from) patch[`Parts.${name === from ? to : name}.meta.booleanGroup`] = to;
    if (isBooleanGroup(part)) {
      const spec = part.meta?.boolean ?? {};
      if (!spec.operands?.includes(from) && spec.paintFrom !== from) continue;
      patch[`Parts.${name === from ? to : name}.meta.boolean`] = {
        ...spec,
        operands: (spec.operands ?? []).map((entry) => (entry === from ? to : entry)),
        paintFrom: spec.paintFrom === from ? to : spec.paintFrom,
      };
    }
  }
  return patch;
}

/**
 * Parts after deleting `names`: a deleted group takes its operands with it (they exist only to shape
 * it); a deleted operand leaves its group, and a group left with nothing is deleted too.
 */
export function partsAfterRemoval(partsChildren, names) {
  const doomed = new Set(withGroupMembers(partsChildren, names));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, part] of Object.entries(partsChildren ?? {})) {
      if (doomed.has(name) || !isBooleanGroup(part)) continue;
      if (booleanSpec(part).operands.every((operand) => doomed.has(operand) || !partsChildren[operand])) {
        doomed.add(name);
        changed = true;
      }
    }
  }
  const next = {};
  for (const [name, part] of Object.entries(partsChildren ?? {})) {
    if (doomed.has(name)) continue;
    if (isBooleanGroup(part) && booleanSpec(part).operands.some((operand) => doomed.has(operand))) {
      const spec = booleanSpec(part);
      const operands = spec.operands.filter((operand) => !doomed.has(operand));
      const paintFrom = operands.includes(spec.paintFrom) ? spec.paintFrom : (spec.operation === 'subtract' ? operands[0] : operands[operands.length - 1]);
      const { cache: _cache, ...meta } = part.meta ?? {};
      next[name] = { ...part, meta: { ...meta, boolean: { ...part.meta.boolean, operands, paintFrom } } };
    } else {
      next[name] = part;
    }
  }
  return next;
}

/** Parts after moving operand `name` one step forward (+1) or back (-1) within its group. */
export function partsAfterOperandMove(partsChildren, name, direction) {
  const groupName = booleanGroupOf(partsChildren?.[name]);
  const group = partsChildren?.[groupName];
  if (!isBooleanGroup(group)) return partsChildren;
  const operands = [...booleanSpec(group).operands];
  const index = operands.indexOf(name);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= operands.length) return partsChildren;
  [operands[index], operands[target]] = [operands[target], operands[index]];
  const spec = booleanSpec(group);
  // The paint follows the convention (back-most for subtract, front-most otherwise) only if it did.
  const conventional = spec.operation === 'subtract' ? spec.operands[0] : spec.operands[spec.operands.length - 1];
  const paintFrom = spec.paintFrom === conventional ? (spec.operation === 'subtract' ? operands[0] : operands[operands.length - 1]) : spec.paintFrom;
  const { cache: _cache, ...meta } = group.meta ?? {};
  return { ...partsChildren, [groupName]: { ...group, meta: { ...meta, boolean: { ...group.meta.boolean, operands, paintFrom } } } };
}

/** A shape's operands for a layer list, front first as layer lists are: [[name, part]]. */
export function operandEntries(partsChildren, name) {
  const group = partsChildren?.[name];
  if (!isBooleanGroup(group)) return [];
  return [...booleanSpec(group).operands].reverse()
    .map((operand) => [operand, partsChildren?.[operand]])
    .filter(([, part]) => part);
}
