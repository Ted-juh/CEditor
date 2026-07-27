import { get } from 'svelte/store';
import { panels, activePanel, selectedComponentIds, keyObjectId } from './panels.js';
import { applyControlPatchesById, getSection } from './controls.js';
import { updatePanel } from './panels.js';
import { guides } from './guides.js';
import { getControlId, getControlLayer, sortControlsForRender } from '../utils/controlOrder.js';
import { controlPanelOffset, flatControls, getChildControls, isContainerControl } from '../utils/containment.js';

// --- Helpers ---

// Transforms are reported in PANEL space (nested controls included); the
// offsetX/offsetY fields convert results back to each control's local frame
// before writing.
function getSelectedTransforms() {
  const panel = get(activePanel);
  if (!panel) return [];
  const ids = get(selectedComponentIds);
  return flatControls(panel.controls)
    .filter(c => ids.has(c._children?.Core?.id))
    .map(c => {
      const t = getSection(c, 'Transform');
      const id = c._children.Core.id;
      const offset = controlPanelOffset(panel.controls, id);
      return {
        id,
        x: t.x + offset.x,
        y: t.y + offset.y,
        width: t.width,
        height: t.height,
        offsetX: offset.x,
        offsetY: offset.y,
      };
    });
}

function toLocalTransformPatch(transform, patch) {
  const out = { ...patch };
  if ('Transform.x' in out) out['Transform.x'] = Math.round(out['Transform.x'] - (transform.offsetX ?? 0));
  if ('Transform.y' in out) out['Transform.y'] = Math.round(out['Transform.y'] - (transform.offsetY ?? 0));
  return out;
}

function getReferenceBounds(mode, transforms, regionRef = null) {
  if (mode === 'region' && regionRef) {
    // Region mode: reference point — width/height = 0 so left/center/right all collapse to the point
    return { x: regionRef.x, y: regionRef.y, width: 0, height: 0 };
  }
  if (mode === 'key-object') {
    const kid = get(keyObjectId);
    const key = transforms.find(t => t.id === kid);
    if (key) return { x: key.x, y: key.y, width: key.width, height: key.height };
  }
  if (mode === 'guides') {
    // Build a reference rect from guide lines.
    // For each axis, find the two nearest guides that bracket the selection center.
    // If only one guide exists on an axis, use it as a zero-width line.
    const g = get(guides);
    const selMinX = Math.min(...transforms.map(t => t.x));
    const selMinY = Math.min(...transforms.map(t => t.y));
    const selMaxX = Math.max(...transforms.map(t => t.x + t.width));
    const selMaxY = Math.max(...transforms.map(t => t.y + t.height));
    const selCX = (selMinX + selMaxX) / 2;
    const selCY = (selMinY + selMaxY) / 2;

    const vg = [...(g.vertical ?? [])].sort((a, b) => a - b);
    const hg = [...(g.horizontal ?? [])].sort((a, b) => a - b);

    // Find nearest vertical guide to selection center-X
    let refX = selMinX, refW = selMaxX - selMinX;
    if (vg.length >= 2) {
      // Find pair that brackets center, or closest two
      const left = vg.filter(v => v <= selCX);
      const right = vg.filter(v => v >= selCX);
      const l = left.length > 0 ? left[left.length - 1] : vg[0];
      const r = right.length > 0 ? right[0] : vg[vg.length - 1];
      refX = l; refW = r - l;
    } else if (vg.length === 1) {
      refX = vg[0]; refW = 0;
    }

    // Find nearest horizontal guide to selection center-Y
    let refY = selMinY, refH = selMaxY - selMinY;
    if (hg.length >= 2) {
      const top = hg.filter(v => v <= selCY);
      const bot = hg.filter(v => v >= selCY);
      const t = top.length > 0 ? top[top.length - 1] : hg[0];
      const b = bot.length > 0 ? bot[0] : hg[hg.length - 1];
      refY = t; refH = b - t;
    } else if (hg.length === 1) {
      refY = hg[0]; refH = 0;
    }

    return { x: refX, y: refY, width: refW, height: refH };
  }
  // 'selection' or fallback
  const minX = Math.min(...transforms.map(t => t.x));
  const minY = Math.min(...transforms.map(t => t.y));
  const maxX = Math.max(...transforms.map(t => t.x + t.width));
  const maxY = Math.max(...transforms.map(t => t.y + t.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function commitTransformUpdates(transforms, buildPatch) {
  const patches = new Map();

  transforms.forEach((transform, index) => {
    const patch = buildPatch(transform, index);
    if (!patch || Object.keys(patch).length === 0) return;
    patches.set(transform.id, toLocalTransformPatch(transform, patch));
  });

  if (patches.size > 0) {
    applyControlPatchesById(patches);
  }
}

// --- Align (6) ---
// regionRef: { x, y } — only used when mode === 'region'

export function alignLeft(mode, regionRef = null) {
  const transforms = getSelectedTransforms();
  if (transforms.length === 0) return;
  const ref = getReferenceBounds(mode, transforms, regionRef);
  commitTransformUpdates(transforms, () => ({ 'Transform.x': ref.x }));
}

export function alignHCenter(mode, regionRef = null) {
  const transforms = getSelectedTransforms();
  if (transforms.length === 0) return;
  const ref = getReferenceBounds(mode, transforms, regionRef);
  const center = ref.x + ref.width / 2;
  commitTransformUpdates(transforms, (transform) => ({
    'Transform.x': Math.round(center - transform.width / 2),
  }));
}

export function alignRight(mode, regionRef = null) {
  const transforms = getSelectedTransforms();
  if (transforms.length === 0) return;
  const ref = getReferenceBounds(mode, transforms, regionRef);
  const right = ref.x + ref.width;
  commitTransformUpdates(transforms, (transform) => ({ 'Transform.x': right - transform.width }));
}

export function alignTop(mode, regionRef = null) {
  const transforms = getSelectedTransforms();
  if (transforms.length === 0) return;
  const ref = getReferenceBounds(mode, transforms, regionRef);
  commitTransformUpdates(transforms, () => ({ 'Transform.y': ref.y }));
}

export function alignVCenter(mode, regionRef = null) {
  const transforms = getSelectedTransforms();
  if (transforms.length === 0) return;
  const ref = getReferenceBounds(mode, transforms, regionRef);
  const center = ref.y + ref.height / 2;
  commitTransformUpdates(transforms, (transform) => ({
    'Transform.y': Math.round(center - transform.height / 2),
  }));
}

export function alignBottom(mode, regionRef = null) {
  const transforms = getSelectedTransforms();
  if (transforms.length === 0) return;
  const ref = getReferenceBounds(mode, transforms, regionRef);
  const bottom = ref.y + ref.height;
  commitTransformUpdates(transforms, (transform) => ({ 'Transform.y': bottom - transform.height }));
}

// --- Distribute Edges (6) ---

export function distributeLeftEdges() {
  const transforms = getSelectedTransforms();
  if (transforms.length < 3) return;
  const sorted = [...transforms].sort((a, b) => a.x - b.x);
  const first = sorted[0].x;
  const last = sorted[sorted.length - 1].x;
  const step = (last - first) / (sorted.length - 1);
  commitTransformUpdates(
    sorted.slice(1, -1),
    (_, index) => ({ 'Transform.x': Math.round(first + step * (index + 1)) })
  );
}

export function distributeHCenters() {
  const transforms = getSelectedTransforms();
  if (transforms.length < 3) return;
  const sorted = [...transforms].sort((a, b) => (a.x + a.width / 2) - (b.x + b.width / 2));
  const firstCenter = sorted[0].x + sorted[0].width / 2;
  const lastCenter = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width / 2;
  const step = (lastCenter - firstCenter) / (sorted.length - 1);
  commitTransformUpdates(sorted.slice(1, -1), (transform, index) => {
    const target = firstCenter + step * (index + 1);
    return { 'Transform.x': Math.round(target - transform.width / 2) };
  });
}

export function distributeRightEdges() {
  const transforms = getSelectedTransforms();
  if (transforms.length < 3) return;
  const sorted = [...transforms].sort((a, b) => (a.x + a.width) - (b.x + b.width));
  const firstRight = sorted[0].x + sorted[0].width;
  const lastRight = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
  const step = (lastRight - firstRight) / (sorted.length - 1);
  commitTransformUpdates(sorted.slice(1, -1), (transform, index) => {
    const target = firstRight + step * (index + 1);
    return { 'Transform.x': Math.round(target - transform.width) };
  });
}

export function distributeTopEdges() {
  const transforms = getSelectedTransforms();
  if (transforms.length < 3) return;
  const sorted = [...transforms].sort((a, b) => a.y - b.y);
  const first = sorted[0].y;
  const last = sorted[sorted.length - 1].y;
  const step = (last - first) / (sorted.length - 1);
  commitTransformUpdates(
    sorted.slice(1, -1),
    (_, index) => ({ 'Transform.y': Math.round(first + step * (index + 1)) })
  );
}

export function distributeVCenters() {
  const transforms = getSelectedTransforms();
  if (transforms.length < 3) return;
  const sorted = [...transforms].sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2));
  const firstCenter = sorted[0].y + sorted[0].height / 2;
  const lastCenter = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height / 2;
  const step = (lastCenter - firstCenter) / (sorted.length - 1);
  commitTransformUpdates(sorted.slice(1, -1), (transform, index) => {
    const target = firstCenter + step * (index + 1);
    return { 'Transform.y': Math.round(target - transform.height / 2) };
  });
}

export function distributeBottomEdges() {
  const transforms = getSelectedTransforms();
  if (transforms.length < 3) return;
  const sorted = [...transforms].sort((a, b) => (a.y + a.height) - (b.y + b.height));
  const firstBottom = sorted[0].y + sorted[0].height;
  const lastBottom = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
  const step = (lastBottom - firstBottom) / (sorted.length - 1);
  commitTransformUpdates(sorted.slice(1, -1), (transform, index) => {
    const target = firstBottom + step * (index + 1);
    return { 'Transform.y': Math.round(target - transform.height) };
  });
}

// --- Distribute Spacing (2) ---
// fixedGap: null = auto (even spacing from outermost), number = exact pixel gap

export function distributeHSpacing(fixedGap = null, alignOpposite = false) {
  const transforms = getSelectedTransforms();
  if (transforms.length < 2) return;
  const sorted = [...transforms].sort((a, b) => a.x - b.x);

  // Align all to topmost Y when option is enabled
  if (alignOpposite) {
    const topY = Math.min(...sorted.map(t => t.y));
    commitTransformUpdates(sorted, () => ({ 'Transform.y': topY }));
  }

  if (fixedGap != null) {
    // Fixed gap: place each component fixedGap pixels after the previous
    let currentX = sorted[0].x + sorted[0].width + fixedGap;
    const patches = new Map();
    for (let i = 1; i < sorted.length; i++) {
      patches.set(sorted[i].id, toLocalTransformPatch(sorted[i], { 'Transform.x': currentX }));
      currentX += sorted[i].width + fixedGap;
    }
    applyControlPatchesById(patches);
  } else {
    // Auto: even spacing between outermost
    if (sorted.length < 3) return;
    const totalWidth = sorted.reduce((sum, t) => sum + t.width, 0);
    const spanStart = sorted[0].x;
    const spanEnd = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
    const gap = ((spanEnd - spanStart) - totalWidth) / (sorted.length - 1);
    let currentX = sorted[0].x + sorted[0].width + gap;
    const patches = new Map();
    for (let i = 1; i < sorted.length - 1; i++) {
      patches.set(sorted[i].id, toLocalTransformPatch(sorted[i], { 'Transform.x': currentX }));
      currentX += sorted[i].width + gap;
    }
    applyControlPatchesById(patches);
  }
}

export function distributeVSpacing(fixedGap = null, alignOpposite = false) {
  const transforms = getSelectedTransforms();
  if (transforms.length < 2) return;
  const sorted = [...transforms].sort((a, b) => a.y - b.y);

  // Align all to leftmost X when option is enabled
  if (alignOpposite) {
    const leftX = Math.min(...sorted.map(t => t.x));
    commitTransformUpdates(sorted, () => ({ 'Transform.x': leftX }));
  }

  if (fixedGap != null) {
    // Fixed gap: place each component fixedGap pixels after the previous
    let currentY = sorted[0].y + sorted[0].height + fixedGap;
    const patches = new Map();
    for (let i = 1; i < sorted.length; i++) {
      patches.set(sorted[i].id, toLocalTransformPatch(sorted[i], { 'Transform.y': currentY }));
      currentY += sorted[i].height + fixedGap;
    }
    applyControlPatchesById(patches);
  } else {
    // Auto: even spacing between outermost
    if (sorted.length < 3) return;
    const totalHeight = sorted.reduce((sum, t) => sum + t.height, 0);
    const spanStart = sorted[0].y;
    const spanEnd = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
    const gap = ((spanEnd - spanStart) - totalHeight) / (sorted.length - 1);
    let currentY = sorted[0].y + sorted[0].height + gap;
    const patches = new Map();
    for (let i = 1; i < sorted.length - 1; i++) {
      patches.set(sorted[i].id, toLocalTransformPatch(sorted[i], { 'Transform.y': currentY }));
      currentY += sorted[i].height + gap;
    }
    applyControlPatchesById(patches);
  }
}

// --- Z-Order (4) ---
// Operates within each Core.layer using Core.zIndex as the ordering key.

function reorderControls(reorderFn) {
  const panel = get(activePanel);
  if (!panel) return;
  const ids = get(selectedComponentIds);
  if (ids.size === 0) return;

  const zIndexById = new Map();

  // Z-order is scoped per sibling group (panel top level, or one container's
  // children), then per layer within that group.
  const siblingGroups = [panel.controls];
  for (const control of flatControls(panel.controls)) {
    if (isContainerControl(control)) siblingGroups.push(getChildControls(control));
  }

  for (const siblings of siblingGroups) {
    const layers = new Map();
    for (const control of sortControlsForRender(siblings)) {
      const layer = getControlLayer(control);
      if (!layers.has(layer)) layers.set(layer, []);
      layers.get(layer).push(control);
    }

    for (const layerControls of layers.values()) {
      const selectedInLayer = new Set(
        layerControls
          .map(control => getControlId(control))
          .filter(id => id != null && ids.has(id))
      );

      if (selectedInLayer.size === 0) continue;

      const reorderedLayer = reorderFn([...layerControls], selectedInLayer);
      reorderedLayer.forEach((control, index) => {
        const id = getControlId(control);
        if (id != null) zIndexById.set(id, index);
      });
    }
  }

  if (zIndexById.size === 0) return;

  const patches = new Map(
    [...zIndexById].map(([id, zIndex]) => [id, { 'Core.zIndex': zIndex }])
  );
  applyControlPatchesById(patches);
}

export function bringToFront() {
  reorderControls((controls, ids) => {
    const selected = controls.filter(c => ids.has(c._children?.Core?.id));
    const rest = controls.filter(c => !ids.has(c._children?.Core?.id));
    return [...rest, ...selected];
  });
}

export function bringForward() {
  reorderControls((controls, ids) => {
    const arr = [...controls];
    // Move selected items up one position, from end to start to avoid collisions
    for (let i = arr.length - 2; i >= 0; i--) {
      if (ids.has(arr[i]._children?.Core?.id) && !ids.has(arr[i + 1]._children?.Core?.id)) {
        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      }
    }
    return arr;
  });
}

export function sendBackward() {
  reorderControls((controls, ids) => {
    const arr = [...controls];
    // Move selected items down one position, from start to end
    for (let i = 1; i < arr.length; i++) {
      if (ids.has(arr[i]._children?.Core?.id) && !ids.has(arr[i - 1]._children?.Core?.id)) {
        [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      }
    }
    return arr;
  });
}

export function sendToBack() {
  reorderControls((controls, ids) => {
    const selected = controls.filter(c => ids.has(c._children?.Core?.id));
    const rest = controls.filter(c => !ids.has(c._children?.Core?.id));
    return [...selected, ...rest];
  });
}

// --- Match Size (3) ---
// Reference: key object if set, otherwise first selected

function getReferenceSize(transforms) {
  const kid = get(keyObjectId);
  const key = transforms.find(t => t.id === kid);
  if (key) return { width: key.width, height: key.height };
  return { width: transforms[0].width, height: transforms[0].height };
}

export function matchWidth() {
  const transforms = getSelectedTransforms();
  if (transforms.length < 2) return;
  const ref = getReferenceSize(transforms);
  commitTransformUpdates(transforms, () => ({ 'Transform.width': ref.width }));
}

export function matchHeight() {
  const transforms = getSelectedTransforms();
  if (transforms.length < 2) return;
  const ref = getReferenceSize(transforms);
  commitTransformUpdates(transforms, () => ({ 'Transform.height': ref.height }));
}

export function matchBoth() {
  const transforms = getSelectedTransforms();
  if (transforms.length < 2) return;
  const ref = getReferenceSize(transforms);
  commitTransformUpdates(transforms, () => ({
    'Transform.width': ref.width,
    'Transform.height': ref.height,
  }));
}

// --- Snap to Grid ---

export function snapSelectionToGrid() {
  const panel = get(activePanel);
  if (!panel) return;
  const gridSize = panel.gridSize || 10;

  // Compute grid origin (same centering logic as EditorCanvas)
  let ox = panel.gridOriginX ?? 0;
  let oy = panel.gridOriginY ?? 0;
  if (panel.gridCentered && gridSize > 0) {
    const sub = panel.gridSubdivision ?? 1;
    const tileSize = sub > 1 ? gridSize * sub : gridSize;
    const rw = Math.round(panel.width / tileSize);
    const rh = Math.round(panel.height / tileSize);
    ox = -((rw * tileSize) - panel.width) / 2;
    oy = -((rh * tileSize) - panel.height) / 2;
  }

  const transforms = getSelectedTransforms();
  for (const t of transforms) {
    const snappedX = Math.round((t.x - ox) / gridSize) * gridSize + ox;
    const snappedY = Math.round((t.y - oy) / gridSize) * gridSize + oy;
    updateControlProperty(t.id, 'Transform.x', Math.round(snappedX - (t.offsetX ?? 0)));
    updateControlProperty(t.id, 'Transform.y', Math.round(snappedY - (t.offsetY ?? 0)));
  }
}

// --- Snap to Guides ---

export function snapSelectionToGuides() {
  const g = get(guides);
  const vg = [...(g.vertical ?? [])].sort((a, b) => a - b);
  const hg = [...(g.horizontal ?? [])].sort((a, b) => a - b);
  if (vg.length === 0 && hg.length === 0) return;

  const transforms = getSelectedTransforms();
  for (const t of transforms) {
    // Snap X to nearest vertical guide
    if (vg.length > 0) {
      let bestDist = Infinity, bestX = t.x;
      // Check left edge, center, right edge
      for (const edge of [t.x, t.x + t.width / 2, t.x + t.width]) {
        for (const gx of vg) {
          const d = Math.abs(edge - gx);
          if (d < bestDist) { bestDist = d; bestX = gx - (edge - t.x); }
        }
      }
      updateControlProperty(t.id, 'Transform.x', Math.round(bestX - (t.offsetX ?? 0)));
    }
    // Snap Y to nearest horizontal guide
    if (hg.length > 0) {
      let bestDist = Infinity, bestY = t.y;
      for (const edge of [t.y, t.y + t.height / 2, t.y + t.height]) {
        for (const gy of hg) {
          const d = Math.abs(edge - gy);
          if (d < bestDist) { bestDist = d; bestY = gy - (edge - t.y); }
        }
      }
      updateControlProperty(t.id, 'Transform.y', Math.round(bestY - (t.offsetY ?? 0)));
    }
  }
}

// --- Flip/Mirror (2) ---
// Mirror positions around the selection bounding box center

export function flipHorizontal() {
  const transforms = getSelectedTransforms();
  if (transforms.length < 2) return;
  const minX = Math.min(...transforms.map(t => t.x));
  const maxX = Math.max(...transforms.map(t => t.x + t.width));
  const center = (minX + maxX) / 2;
  for (const t of transforms) {
    const mirroredX = center - (t.x + t.width - center);
    updateControlProperty(t.id, 'Transform.x', Math.round(mirroredX - (t.offsetX ?? 0)));
  }
}

export function flipVertical() {
  const transforms = getSelectedTransforms();
  if (transforms.length < 2) return;
  const minY = Math.min(...transforms.map(t => t.y));
  const maxY = Math.max(...transforms.map(t => t.y + t.height));
  const center = (minY + maxY) / 2;
  for (const t of transforms) {
    const mirroredY = center - (t.y + t.height - center);
    updateControlProperty(t.id, 'Transform.y', Math.round(mirroredY - (t.offsetY ?? 0)));
  }
}

// --- Tidy / Auto-Grid ---
// Arrange selected components into a grid with specified columns and gap

export function tidyGrid(columns = 3, gapX = 10, gapY = 10) {
  const transforms = getSelectedTransforms();
  if (transforms.length < 2) return;

  // Sort by position: top-to-bottom, left-to-right (reading order)
  const sorted = [...transforms].sort((a, b) => {
    const rowA = Math.round(a.y / 20);
    const rowB = Math.round(b.y / 20);
    if (rowA !== rowB) return rowA - rowB;
    return a.x - b.x;
  });

  // Use the first component's position as the grid origin
  const originX = sorted[0].x;
  const originY = sorted[0].y;

  // Find max cell size (so grid cells are uniform)
  const cellW = Math.max(...sorted.map(t => t.width));
  const cellH = Math.max(...sorted.map(t => t.height));

  for (let i = 0; i < sorted.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = originX + col * (cellW + gapX);
    const y = originY + row * (cellH + gapY);
    updateControlProperty(sorted[i].id, 'Transform.x', Math.round(x - (sorted[i].offsetX ?? 0)));
    updateControlProperty(sorted[i].id, 'Transform.y', Math.round(y - (sorted[i].offsetY ?? 0)));
  }
}

// --- Circular Arrangement ---
// Arrange selected components in a circle around a center point

export function arrangeCircular(radius = 100, startAngle = 0) {
  const transforms = getSelectedTransforms();
  if (transforms.length < 2) return;

  // Center of the selection bounding box
  const minX = Math.min(...transforms.map(t => t.x));
  const minY = Math.min(...transforms.map(t => t.y));
  const maxX = Math.max(...transforms.map(t => t.x + t.width));
  const maxY = Math.max(...transforms.map(t => t.y + t.height));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const step = (2 * Math.PI) / transforms.length;
  const startRad = (startAngle * Math.PI) / 180;

  for (let i = 0; i < transforms.length; i++) {
    const angle = startRad + step * i;
    const x = cx + radius * Math.cos(angle) - transforms[i].width / 2;
    const y = cy + radius * Math.sin(angle) - transforms[i].height / 2;
    updateControlProperty(transforms[i].id, 'Transform.x', Math.round(x - (transforms[i].offsetX ?? 0)));
    updateControlProperty(transforms[i].id, 'Transform.y', Math.round(y - (transforms[i].offsetY ?? 0)));
  }
}
