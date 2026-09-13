/**
 * effectStack.js — the Effects dock tab's model, as a pure module.
 *
 * WHY THIS EXISTS AT ALL, which is the whole design in one paragraph: every text effect already
 * carries an `*Order` number (`outlineOrder: 40`, `shadowOrder: 10`, …) and `CanvasControl.svelte`
 * already sorts them into a stack every frame via `sortTextVisualLayers`. Nothing in the UI has
 * ever shown that stack — an author sets it by typing eleven numbers into eleven fields in
 * different collapsed sections. So this module derives the SAME stack the renderer draws, and
 * turns a drag into the order numbers that produce it. No data-model change and no renderer
 * change: the numbers stay exactly where they were.
 *
 * THE SORT IS IMPORTED, NOT REIMPLEMENTED. `sortTextVisualLayers` comes from
 * `editor/canvasControlStyles.js`, the same function `CanvasControl` uses. A second copy here
 * would be free to drift, and a stack that disagrees with the canvas is worse than no stack.
 *
 * Ascending `order` means further BACK (drawn first). The tab shows front-first, so the display
 * list is the sorted list reversed — see `buildTextStack`.
 *
 * Pure: no Svelte, no stores, no DOM. Everything here is testable under `node --test`.
 */
import { sortTextVisualLayers, normalizeTextLayerOrder } from '../editor/canvasControlStyles.js';
import { deepClone } from './deepClone.js';

/** Where a domain's fields hang off the control tree. */
export const TEXT_ROOT = 'Text.Effects';
export const COMPONENT_ROOT = 'Effects';

// ---------------------------------------------------------------------------------------------
// Text effects — the ordered stack.
//
// `priority` mirrors the tie-break constants in CanvasControl's sortTextVisualLayers call so the
// derived order matches the canvas exactly, INCLUDING the tie: bevel and innerShadow both default
// to order 60 and are separated only by priority. That tie is real, it ships, and saved panels
// depend on it — so it is reproduced rather than fixed. Dragging is how an author separates them.
// ---------------------------------------------------------------------------------------------

const num = (key, label, opts = {}) => ({ kind: 'number', key, label, ...opts });
const col = (key, label) => ({ kind: 'colour', key, label });
const pick = (key, label, options) => ({ kind: 'choice', key, label, options });
const flag = (key, label) => ({ kind: 'toggle', key, label });

export const TEXT_EFFECTS = [
  {
    key: 'reflection',
    label: 'Reflection',
    enabled: 'reflectionEnabled',
    order: 'reflectionOrder',
    defaultOrder: 5,
    priority: 10,
    fields: [
      col('reflectionColour', 'Colour'),
      num('reflectionAngle', 'Angle', { min: -360, max: 360, step: 1, angle: true }),
      num('reflectionDistance', 'Distance', { min: 0, max: 200, step: 1 }),
      num('reflectionIntensity', 'Intensity', { min: 0, max: 1, step: 0.05 }),
      num('reflectionBlur', 'Blur', { min: 0, max: 40, step: 0.5 }),
      pick('reflectionFadeMode', 'Fade', ['none', 'in', 'out']),
      num('reflectionFadeAmount', 'Fade amt', { min: 0, max: 100, step: 1 }),
    ],
  },
  {
    key: 'shadow',
    label: 'Shadow',
    enabled: 'shadowEnabled',
    order: 'shadowOrder',
    defaultOrder: 10,
    priority: 20,
    fields: [
      col('shadowColour', 'Colour'),
      pick('shadowStyle', 'Style', ['soft', 'long']),
      num('shadowOffsetX', 'Offset X', { min: -100, max: 100, step: 1 }),
      num('shadowOffsetY', 'Offset Y', { min: -100, max: 100, step: 1 }),
      num('shadowBlur', 'Blur', { min: 0, max: 60, step: 0.5 }),
      num('shadowDistance', 'Distance', { min: 0, max: 200, step: 1, when: (fx) => fx?.shadowStyle === 'long' }),
      num('shadowSteps', 'Steps', { min: 1, max: 64, step: 1, when: (fx) => fx?.shadowStyle === 'long' }),
    ],
  },
  {
    key: 'glow',
    label: 'Glow',
    enabled: 'glowEnabled',
    order: 'glowOrder',
    defaultOrder: 20,
    priority: 30,
    fields: [
      col('glowColour', 'Colour'),
      num('glowSize', 'Size', { min: 0, max: 80, step: 0.5 }),
      num('glowIntensity', 'Intensity', { min: 0, max: 4, step: 0.05 }),
    ],
  },
  {
    key: 'motion',
    label: 'Motion',
    enabled: 'motionEnabled',
    order: 'motionOrder',
    defaultOrder: 30,
    priority: 40,
    fields: [
      col('motionColour', 'Colour'),
      num('motionAngle', 'Angle', { min: -360, max: 360, step: 1, angle: true }),
      num('motionDistance', 'Distance', { min: 0, max: 200, step: 1 }),
      num('motionSteps', 'Steps', { min: 1, max: 64, step: 1 }),
    ],
  },
  {
    key: 'outline',
    label: 'Outline',
    enabled: 'outlineEnabled',
    order: 'outlineOrder',
    defaultOrder: 40,
    priority: 60,
    fields: [
      col('outlineColour', 'Colour'),
      num('outlineThickness', 'Thickness', { min: 0, max: 40, step: 0.1 }),
      num('outlineWidth', 'Width', { min: 0, max: 40, step: 0.1 }),
      num('outlineDistance', 'Distance', { min: 0, max: 100, step: 1 }),
      pick('outlinePlacement', 'Placement', ['inner', 'outer', 'center']),
      pick('outlineJoin', 'Join', ['round', 'miter', 'bevel']),
      flag('outlineFill', 'Fill gap'),
      flag('outlineDashEnabled', 'Dash'),
      num('outlineDashLength', 'Dash len', { min: 0, max: 80, step: 1, when: (fx) => fx?.outlineDashEnabled === true }),
      num('outlineDashGap', 'Dash gap', { min: 0, max: 80, step: 1, when: (fx) => fx?.outlineDashEnabled === true }),
    ],
  },
  {
    key: 'stroke2',
    label: '2nd Stroke',
    enabled: 'stroke2Enabled',
    order: 'stroke2Order',
    defaultOrder: 45,
    priority: 70,
    fields: [
      col('stroke2Colour', 'Colour'),
      num('stroke2Thickness', 'Thickness', { min: 0, max: 40, step: 0.1 }),
      pick('stroke2Placement', 'Placement', ['inner', 'outer', 'center']),
      flag('stroke2DashEnabled', 'Dash'),
      num('stroke2DashLength', 'Dash len', { min: 0, max: 80, step: 1, when: (fx) => fx?.stroke2DashEnabled === true }),
      num('stroke2DashGap', 'Dash gap', { min: 0, max: 80, step: 1, when: (fx) => fx?.stroke2DashEnabled === true }),
    ],
  },
  {
    key: 'innerShadow',
    label: 'Inner Shadow',
    enabled: 'innerShadowEnabled',
    order: 'innerShadowOrder',
    defaultOrder: 60,
    priority: 90,
    fields: [
      col('innerShadowColour', 'Colour'),
      num('innerShadowOffsetX', 'Offset X', { min: -100, max: 100, step: 1 }),
      num('innerShadowOffsetY', 'Offset Y', { min: -100, max: 100, step: 1 }),
      num('innerShadowBlur', 'Blur', { min: 0, max: 60, step: 0.5 }),
    ],
  },
  {
    key: 'bevel',
    label: 'Bevel',
    enabled: 'bevelEnabled',
    order: 'bevelOrder',
    defaultOrder: 60,
    priority: 100,
    fields: [
      pick('bevelStyle', 'Style', ['emboss', 'outer', 'inner', 'pillow']),
      num('bevelDepth', 'Depth', { min: 0, max: 20, step: 0.1 }),
      col('bevelHighlightColour', 'Highlight'),
      col('bevelShadowColour', 'Shadow'),
    ],
  },
  {
    key: 'innerGlow',
    label: 'Inner Glow',
    enabled: 'innerGlowEnabled',
    order: 'innerGlowOrder',
    defaultOrder: 80,
    priority: 110,
    fields: [
      col('innerGlowColour', 'Colour'),
      num('innerGlowSize', 'Size', { min: 0, max: 60, step: 0.5 }),
    ],
  },
];

/**
 * Effects with no `*Order` of their own. They still belong in the list — an author looking for
 * "blur" should find it where every other effect lives — but they cannot be dragged, because the
 * renderer does not place them in the visual stack. `stackable: false` is how the UI knows.
 */
export const TEXT_UNORDERED = [
  {
    key: 'blur',
    label: 'Blur',
    enabled: 'blurEnabled',
    stackable: false,
    fields: [num('blurAmount', 'Amount', { min: 0, max: 40, step: 0.1 })],
  },
  {
    key: 'copy',
    label: 'Copy',
    enabled: 'copyEnabled',
    stackable: false,
    fields: [
      col('copyColour', 'Colour'),
      num('copyOffsetX', 'Offset X', { min: -100, max: 100, step: 1 }),
      num('copyOffsetY', 'Offset Y', { min: -100, max: 100, step: 1 }),
      num('copyBlur', 'Blur', { min: 0, max: 60, step: 0.5 }),
    ],
  },
];

/** The fill row. Not an effect — the letterform itself — but it sits IN the stack because the
 *  renderer puts it there (`{ key: 'fill', order: textFillOrder, priority: 80 }`), which is what
 *  lets an outline sit behind or in front of the letters. Its order lives on Text.Fill, not on
 *  Text.Effects, so it carries its own root. */
export const TEXT_FILL_ROW = {
  key: 'fill',
  label: 'Fill',
  note: 'the letters',
  root: 'Text.Fill',
  order: 'order',
  defaultOrder: 50,
  priority: 80,
  alwaysOn: true,
  fields: [],
};

function section(control, path) {
  let node = control?._children;
  for (const part of path.split('.')) {
    node = node?.[part]?._children ?? node?.[part];
    if (node == null) return null;
  }
  return node;
}

/** Read a section object (with its scalar props) rather than its `_children`. */
export function readSection(control, path) {
  let node = control;
  for (const part of path.split('.')) {
    node = node?._children?.[part] ?? node?.[part];
    if (node == null) return null;
  }
  return node;
}

/**
 * The text effect stack, front first — the order the tab lists them in.
 *
 * Each row: { key, label, stackable, enabled, order, priority, orderPath, enabledPath, fields,
 *             descriptor }. `order` is the value the canvas sorts on; `orderPath` is where to
 *             write a new one.
 */
export function buildTextStack(control) {
  const fx = readSection(control, TEXT_ROOT) ?? {};
  const fill = readSection(control, 'Text.Fill') ?? {};

  const ordered = TEXT_EFFECTS.map((d) => ({
    key: d.key,
    label: d.label,
    stackable: true,
    enabled: fx?.[d.enabled] === true,
    order: normalizeTextLayerOrder(fx?.[d.order], d.defaultOrder),
    priority: d.priority,
    orderPath: `${TEXT_ROOT}.${d.order}`,
    enabledPath: `${TEXT_ROOT}.${d.enabled}`,
    root: TEXT_ROOT,
    fields: d.fields,
    descriptor: d,
  }));

  ordered.push({
    key: TEXT_FILL_ROW.key,
    label: TEXT_FILL_ROW.label,
    note: TEXT_FILL_ROW.note,
    stackable: true,
    enabled: true,
    alwaysOn: true,
    order: normalizeTextLayerOrder(fill?.order, TEXT_FILL_ROW.defaultOrder),
    priority: TEXT_FILL_ROW.priority,
    orderPath: `${TEXT_FILL_ROW.root}.${TEXT_FILL_ROW.order}`,
    enabledPath: null,
    root: TEXT_FILL_ROW.root,
    fields: [],
    descriptor: TEXT_FILL_ROW,
  });

  // Ascending order is back-to-front, which is what the renderer wants. The tab lists front
  // first, so reverse for display.
  const backToFront = sortTextVisualLayers(ordered);
  const rows = [...backToFront].reverse();

  const unordered = TEXT_UNORDERED.map((d) => ({
    key: d.key,
    label: d.label,
    stackable: false,
    enabled: fx?.[d.enabled] === true,
    order: null,
    priority: null,
    orderPath: null,
    enabledPath: `${TEXT_ROOT}.${d.enabled}`,
    root: TEXT_ROOT,
    fields: d.fields,
    descriptor: d,
  }));

  return { rows, unordered };
}

/** Rows that share an `order` with another row, so the canvas is deciding between them on the
 *  hidden `priority` alone. Surfaced in the UI because it is otherwise inexpressible. */
export function findOrderTies(rows) {
  const byOrder = new Map();
  for (const row of rows) {
    if (!row.stackable) continue;
    const list = byOrder.get(row.order) ?? [];
    list.push(row);
    byOrder.set(row.order, list);
  }
  return [...byOrder.values()].filter((list) => list.length > 1);
}

const RENUMBER_STEP = 10;

/**
 * Move `key` to `toIndex` in the front-first display list and return the property patch that
 * produces that order.
 *
 * Two strategies, and the fallback is the point. Normally the moved row only needs a value
 * between its new neighbours, so ONE property changes and every other effect keeps the number the
 * document was saved with. But neighbours can be equal (bevel and innerShadow both ship at 60) or
 * adjacent integers with no room between them, and then there is no value that expresses the
 * requested order — so the whole stack is renumbered in tens. That rewrites more properties than
 * strictly necessary and is still correct: the resulting visual order is exactly what was asked
 * for, with the ties gone.
 *
 * Returns `{}` when nothing would change, so callers can skip a no-op write.
 */
export function reorderTextStack(rows, key, toIndex) {
  const stackable = rows.filter((row) => row.stackable);
  const from = stackable.findIndex((row) => row.key === key);
  if (from < 0) return {};

  const clamped = Math.max(0, Math.min(stackable.length - 1, Math.round(toIndex)));
  if (clamped === from) return {};

  const moved = [...stackable];
  const [row] = moved.splice(from, 1);
  moved.splice(clamped, 0, row);

  // Work back-to-front, which is the direction `order` ascends.
  const ascending = [...moved].reverse();
  const index = ascending.findIndex((entry) => entry.key === key);
  const before = ascending[index - 1] ?? null;
  const after = ascending[index + 1] ?? null;

  const lower = before ? before.order : ascending[index].order - RENUMBER_STEP * 2;
  const upper = after ? after.order : ascending[index].order + RENUMBER_STEP * 2;

  if (upper - lower > 0.002) {
    const next = Math.round(((lower + upper) / 2) * 1000) / 1000;
    if (next !== row.order) return { [row.orderPath]: next };
  }

  // No gap to land in — renumber everything.
  const patch = {};
  ascending.forEach((entry, position) => {
    const next = (position + 1) * RENUMBER_STEP;
    if (entry.order !== next) patch[entry.orderPath] = next;
  });
  return patch;
}

// ---------------------------------------------------------------------------------------------
// Component effects — a shadow array plus three groups.
//
// A different shape from text, deliberately not forced into the same one: Shadows IS ordered (its
// array index is the order) but Bevel, Filters and Blend are not layers at all. The tab shows all
// four as rows, and only the shadow rows drag.
// ---------------------------------------------------------------------------------------------

export const COMPONENT_SHADOW_FIELDS = [
  pick('type', 'Type', ['drop', 'inner', 'outer-glow', 'inner-glow']),
  col('colour', 'Colour'),
  num('offsetX', 'Offset X', { min: -100, max: 100, step: 1 }),
  num('offsetY', 'Offset Y', { min: -100, max: 100, step: 1 }),
  num('blur', 'Blur', { min: 0, max: 100, step: 1 }),
  num('spread', 'Spread', { min: -50, max: 50, step: 1 }),
];

export const COMPONENT_GROUPS = [
  {
    key: 'bevel',
    label: 'Bevel',
    root: `${COMPONENT_ROOT}.Bevel`,
    enabled: 'enabled',
    fields: [
      pick('style', 'Style', ['outer-bevel', 'inner-bevel', 'emboss', 'pillow']),
      num('depth', 'Depth', { min: 0, max: 500, step: 1 }),
      num('size', 'Size', { min: 0, max: 100, step: 1 }),
      num('softness', 'Softness', { min: 0, max: 50, step: 1 }),
      num('angle', 'Angle', { min: -360, max: 360, step: 1, angle: true }),
      col('highlightColour', 'Highlight'),
      num('highlightOpacity', 'Hi opacity', { min: 0, max: 100, step: 1 }),
      col('shadowColour', 'Shadow'),
      num('shadowOpacity', 'Sh opacity', { min: 0, max: 100, step: 1 }),
    ],
  },
  {
    key: 'filters',
    label: 'Filters',
    root: `${COMPONENT_ROOT}.Filters`,
    enabled: null,
    fields: [
      num('blur', 'Blur', { min: 0, max: 40, step: 0.5 }),
      num('brightness', 'Brightness', { min: 0, max: 300, step: 1 }),
      num('contrast', 'Contrast', { min: 0, max: 300, step: 1 }),
      num('saturation', 'Saturation', { min: 0, max: 300, step: 1 }),
      num('hueRotate', 'Hue', { min: -180, max: 180, step: 1, angle: true }),
      num('grayscale', 'Grayscale', { min: 0, max: 100, step: 1 }),
      num('sepia', 'Sepia', { min: 0, max: 100, step: 1 }),
      num('invert', 'Invert', { min: 0, max: 100, step: 1 }),
    ],
  },
  {
    key: 'blend',
    label: 'Blend',
    root: `${COMPONENT_ROOT}.Blend`,
    enabled: null,
    fields: [
      pick('mode', 'Mode', ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
        'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion']),
    ],
  },
];

export function buildComponentRows(control) {
  const shadows = readSection(control, `${COMPONENT_ROOT}.Shadows`);
  const items = Array.isArray(shadows?.items) ? shadows.items : [];

  const shadowRows = items.map((item, index) => ({
    key: `shadow:${index}`,
    label: items.length > 1 ? `Shadow ${index + 1}` : 'Shadow',
    stackable: true,
    arrayIndex: index,
    enabled: item?.enabled === true,
    enabledPath: `${COMPONENT_ROOT}.Shadows.items.${index}.enabled`,
    root: `${COMPONENT_ROOT}.Shadows.items.${index}`,
    fields: COMPONENT_SHADOW_FIELDS,
    descriptor: { key: `shadow:${index}`, label: 'Shadow', fields: COMPONENT_SHADOW_FIELDS },
  }));

  const groupRows = COMPONENT_GROUPS.map((group) => {
    const node = readSection(control, group.root);
    return {
      key: group.key,
      label: group.label,
      stackable: false,
      alwaysOn: !group.enabled,
      enabled: group.enabled ? node?.[group.enabled] === true : true,
      enabledPath: group.enabled ? `${group.root}.${group.enabled}` : null,
      root: group.root,
      fields: group.fields,
      descriptor: group,
    };
  });

  return { rows: shadowRows, unordered: groupRows };
}

/** Move a shadow within `Effects.Shadows.items`. Returns a patch writing the whole array, because
 *  the array index IS the order — there is no per-item number to nudge. */
export function reorderComponentShadows(control, fromIndex, toIndex) {
  const shadows = readSection(control, `${COMPONENT_ROOT}.Shadows`);
  const items = Array.isArray(shadows?.items) ? [...shadows.items] : [];
  const from = Math.round(fromIndex);
  const to = Math.max(0, Math.min(items.length - 1, Math.round(toIndex)));
  if (from < 0 || from >= items.length || from === to) return {};
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return { [`${COMPONENT_ROOT}.Shadows.items`]: items };
}

// ---------------------------------------------------------------------------------------------
// Lighting — Display and PixelDisplay.
//
// Not a stack and not pretending to be one: backlight and dot pitch are settings for a simulated
// screen. They are in this tab because they are the third thing an author judges by looking, and
// splitting them into a fourth dock tab would be the junk-drawer failure in reverse.
// ---------------------------------------------------------------------------------------------

export const LIGHTING_GROUPS = [
  {
    key: 'backlight',
    label: 'Backlight',
    root: 'Display',
    enabled: 'backlightOn',
    fields: [
      num('brightness', 'Brightness', { min: 0, max: 100, step: 1 }),
      num('contrast', 'Contrast', { min: 0, max: 100, step: 1 }),
    ],
  },
  {
    key: 'dotmatrix',
    label: 'Dot Matrix',
    root: 'Display',
    enabled: 'dotMatrix',
    fields: [
      num('dotPitch', 'Dot pitch', { min: 0, max: 20, step: 0.1 }),
      pick('dotShape', 'Dot shape', ['round', 'square']),
    ],
  },
];

export function buildLightingRows(control) {
  const pixel = readSection(control, 'Display') == null && readSection(control, 'Pixel') != null;
  const groups = LIGHTING_GROUPS.map((group) => !pixel ? group : ({ ...group, root: 'Pixel',
    ...(group.key === 'dotmatrix' ? { enabled: null, fields: group.fields.filter((field) => field.key !== 'dotPitch') } : {}),
  }));
  const rows = groups.map((group) => {
    const node = readSection(control, group.root);
    return {
      key: group.key,
      label: group.label,
      stackable: false,
      alwaysOn: !group.enabled,
      enabled: group.enabled ? node?.[group.enabled] === true : true,
      enabledPath: group.enabled ? `${group.root}.${group.enabled}` : null,
      root: group.root,
      fields: group.fields,
      descriptor: group,
    };
  }).filter((row) => readSection(control, row.root) != null);
  return { rows: [], unordered: rows };
}

// ---------------------------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------------------------

export const DOMAINS = [
  { id: 'text', label: 'Text', build: buildTextStack },
  { id: 'component', label: 'Component', build: buildComponentRows },
  { id: 'lighting', label: 'Screen', build: buildLightingRows },
];

/** Which domains this control actually has, so the tab shows two switches rather than three when
 *  only two apply. Order matches DOMAINS. */
export function availableDomains(control) {
  if (!control) return [];
  const has = [];
  if (readSection(control, 'Text') != null) has.push('text');
  if (readSection(control, COMPONENT_ROOT) != null) has.push('component');
  if (readSection(control, 'Display') != null || readSection(control, 'Pixel') != null) has.push('lighting');
  return has;
}

export function buildDomain(control, domainId) {
  const domain = DOMAINS.find((entry) => entry.id === domainId);
  if (!domain || !control) return { rows: [], unordered: [] };
  return domain.build(control);
}

/** Fields whose `when` predicate fails are not applicable right now (a dash length with dashing
 *  off), so the settings column hides them rather than showing a dead control. */
export function visibleFields(row, values) {
  return (row?.fields ?? []).filter((field) => typeof field.when !== 'function' || field.when(values));
}

/** Every field label in every domain, for the properties panel's search index. Relocating a group
 *  out of the panel drops it out of `propertyFilter` unless something puts it back. */
export function allEffectFieldLabels() {
  const labels = new Set();
  const push = (entries) => {
    for (const entry of entries) {
      labels.add(entry.label);
      for (const field of entry.fields ?? []) labels.add(field.label);
    }
  };
  push(TEXT_EFFECTS);
  push(TEXT_UNORDERED);
  push(COMPONENT_GROUPS);
  push(LIGHTING_GROUPS);
  for (const field of COMPONENT_SHADOW_FIELDS) labels.add(field.label);
  return [...labels];
}

// ---------------------------------------------------------------------------------------------
// Preview clones.
//
// The row thumbnails and the compare button both work the same way: take the control, switch
// effects off, and hand the result to the SAME renderer the canvas uses. Nothing here draws
// anything — a second effect renderer would be free to disagree with the first, and a preview
// that disagrees with the canvas is worse than no preview.
// ---------------------------------------------------------------------------------------------

function eachEffectFlag(control, domainId, apply) {
  if (domainId === 'text') {
    const fx = readSection(control, TEXT_ROOT);
    if (!fx) return;
    for (const d of [...TEXT_EFFECTS, ...TEXT_UNORDERED]) apply(fx, d.enabled, d.key);
    return;
  }
  if (domainId === 'component') {
    const shadows = readSection(control, `${COMPONENT_ROOT}.Shadows`);
    if (Array.isArray(shadows?.items)) {
      shadows.items.forEach((item, index) => apply(item, 'enabled', `shadow:${index}`));
    }
    for (const group of COMPONENT_GROUPS) {
      if (!group.enabled) continue;
      const node = readSection(control, group.root);
      if (node) apply(node, group.enabled, group.key);
    }
    return;
  }
  if (domainId === 'lighting') {
    for (const { descriptor: group } of buildLightingRows(control).unordered) {
      if (!group.enabled) continue;
      const node = readSection(control, group.root);
      if (node) apply(node, group.enabled, group.key);
    }
  }
}

/** A clone with every effect in the domain switched off — what the compare button shows, and the
 *  base the row thumbnails build on. Filters and Blend have no enable flag, so they are reset to
 *  their neutral values instead. */
export function withEffectsOff(control, domainId) {
  if (!control) return control;
  const clone = deepClone(control);
  eachEffectFlag(clone, domainId, (node, flagKey) => { node[flagKey] = false; });
  if (domainId === 'component') {
    const filters = readSection(clone, `${COMPONENT_ROOT}.Filters`);
    if (filters) {
      Object.assign(filters, {
        blur: 0, brightness: 100, contrast: 100, saturation: 100,
        hueRotate: 0, grayscale: 0, sepia: 0, invert: 0,
      });
    }
    const blend = readSection(clone, `${COMPONENT_ROOT}.Blend`);
    if (blend) blend.mode = 'normal';
  }
  return clone;
}

/**
 * A clone with only `key` switched on — one row's contribution, on its own.
 *
 * The fill row is the exception and it matters: switching everything off already leaves the
 * letterform, so the fill's thumbnail is `withEffectsOff` unchanged rather than an empty box.
 */
export function withOnlyEffect(control, domainId, key) {
  if (!control) return control;
  const clone = withEffectsOff(control, domainId);
  if (key === 'fill') return clone;
  eachEffectFlag(clone, domainId, (node, flagKey, rowKey) => {
    if (rowKey === key) node[flagKey] = true;
  });
  if (domainId === 'component' && key === 'filters') {
    const source = readSection(control, `${COMPONENT_ROOT}.Filters`);
    const target = readSection(clone, `${COMPONENT_ROOT}.Filters`);
    if (source && target) Object.assign(target, deepClone(source));
  }
  if (domainId === 'component' && key === 'blend') {
    const source = readSection(control, `${COMPONENT_ROOT}.Blend`);
    const target = readSection(clone, `${COMPONENT_ROOT}.Blend`);
    if (source && target) target.mode = source.mode;
  }
  return clone;
}

/** A clone with `muted` switched off and, when anything is soloed, everything outside the solo set
 *  switched off too. Solo wins over mute, which is the convention every mixer uses. */
export function withSoloAndMute(control, domainId, { soloed = [], muted = [] } = {}) {
  if (!control) return control;
  const solo = new Set(soloed);
  const mute = new Set(muted);
  if (!solo.size && !mute.size) return control;
  const clone = deepClone(control);
  eachEffectFlag(clone, domainId, (node, flagKey, rowKey) => {
    if (solo.size) { if (!solo.has(rowKey)) node[flagKey] = false; return; }
    if (mute.has(rowKey)) node[flagKey] = false;
  });
  return clone;
}
