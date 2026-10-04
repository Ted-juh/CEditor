/**
 * surfaceGroupFrames.js — how the design surface moves, sizes and previews a combined shape
 * (utils/booleanGroups.js), whose box is derived from its operands rather than stored.
 *
 * Moving or resizing the shape moves and resizes its operands: every frame inside is mapped from the
 * shape's box onto the new one. While a gesture is in flight nothing is written; the shape is drawn
 * from operands carrying their mapped frames, so its outline follows the pointer.
 */
import { groupMemberNames, isBooleanGroup } from './booleanGroups.js';

/** Map frames from one box onto another. */
export function frameMapper(from, to) {
  const sx = from.width > 0 ? to.width / from.width : 1;
  const sy = from.height > 0 ? to.height / from.height : 1;
  return (frame) => ({
    left: to.left + (frame.left - from.left) * sx,
    top: to.top + (frame.top - from.top) * sy,
    width: frame.width * sx,
    height: frame.height * sy,
  });
}

/** A part drawn at a px frame (top-left anchored), its other layout kept. */
export function withLayoutFrame(part, frame) {
  const layout = part?._children?.Layout ?? {};
  return {
    ...part,
    _children: {
      ...(part?._children ?? {}),
      Layout: {
        ...layout,
        mode: 'absolute',
        x: frame.left,
        y: frame.top,
        width: frame.width,
        height: frame.height,
        xUnit: 'px',
        yUnit: 'px',
        widthUnit: 'px',
        heightUnit: 'px',
        anchorX: 'left',
        anchorY: 'top',
        offsetX: 0,
        offsetY: 0,
      },
    },
  };
}

/**
 * A resolved shape as drawn mid-gesture. `map` carries the whole shape (it is being moved or sized);
 * otherwise each operand is drawn as `renderPart(name, part)` draws it (one operand being dragged).
 * `frameOf(name)` is an in-flight frame for a nested shape, if any; `partFrame(part)` a part's frame.
 */
export function groupForRender(group, map, { renderPart, frameOf, partFrame }) {
  const inputs = group?.meta?.booleanInputs;
  if (!inputs) return group;
  const operands = inputs.operands.map(([name, operand]) => {
    if (isBooleanGroup(operand)) {
      const own = frameOf(name);
      return [name, groupForRender(operand, map ?? (own ? frameMapper(partFrame(operand), own) : null), { renderPart, frameOf, partFrame })];
    }
    const moved = renderPart(name, operand);
    if (moved !== operand || !map) return [name, moved];
    return [name, withLayoutFrame(operand, map(partFrame(operand)))];
  });
  return { ...group, meta: { ...group.meta, booleanInputs: { ...inputs, operands } } };
}

/**
 * The patch that puts a shape at `frame` by moving and sizing its operands. `patchFor(name, authored,
 * frame)` is the surface's own frame → Layout patch for one part.
 */
export function groupFramePatch(groupName, frame, { authoredParts, parts, partFrame, isEditable, patchFor }) {
  const map = frameMapper(partFrame(parts?.[groupName] ?? authoredParts?.[groupName]), frame);
  const patch = {};
  const leaves = groupMemberNames(authoredParts, groupName).filter((name) => !isBooleanGroup(authoredParts?.[name]));
  for (const leaf of leaves) {
    const rendered = parts?.[leaf];
    const authored = authoredParts?.[leaf];
    if (!rendered || !isEditable(authored)) continue;
    Object.assign(patch, patchFor(leaf, authored, map(partFrame(rendered))));
  }
  return patch;
}
