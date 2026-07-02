import { deepClone } from './deepClone.js';
import { numberOr } from './primitives.js';

const TRANSPARENT_COLOUR = '00000000';
const DEFAULT_FILL_ORDER = ['solid', 'gradient', 'image', 'overlay'];
const LEGACY_WHOLE_KEYS = new Set(['borderColour', 'borderWidth', 'shape', 'radius']);

export const RADIO_SEGMENT_PART_OPTIONS = [
  { id: 'whole', label: 'Whole Item' },
  { id: 'indicatorOuter', label: 'Indicator Outer' },
  { id: 'indicatorInner', label: 'Indicator Inner' },
  { id: 'label', label: 'Label' },
];

export const RADIO_WHOLE_SHAPE_OPTIONS = [
  { value: 'pill', label: 'Pill' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'square', label: 'Square' },
];

export const RADIO_INDICATOR_SHAPE_OPTIONS = [
  { value: 'circle', label: 'Circle' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'square', label: 'Square' },
  { value: 'rectangle', label: 'Rectangle' },
];

const DEFAULT_SEGMENT_BORDER = Object.freeze({
  enabled: true,
  linked: true,
  style: 'solid',
  thickness: 1,
  dotRadius: 2,
  colour: '66FFFFFF',
  fillSolid: true,
  fillGradient: false,
  fillImage: false,
  fillOverlay: false,
  imageSrc: '',
  overlaySrc: '',
  gradient: null,
  gradientFlow: 'across',
  doubleGap: 2,
  top: { style: 'solid', thickness: 1, dotRadius: 2, doubleGap: 2, colour: '66FFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across' },
  right: { style: 'solid', thickness: 1, dotRadius: 2, doubleGap: 2, colour: '66FFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across' },
  bottom: { style: 'solid', thickness: 1, dotRadius: 2, doubleGap: 2, colour: '66FFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across' },
  left: { style: 'solid', thickness: 1, dotRadius: 2, doubleGap: 2, colour: '66FFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across' },
});

const DEFAULT_SEGMENT_CORNERS = Object.freeze({
  linked: true,
  borderEnabled: true,
  radius: 9,
  style: 'rounded',
  direction: 'outward',
  borderStyle: 'solid',
  thickness: 1,
  dotRadius: 2,
  doubleGap: 2,
  doubleAnchor: 'center',
  doubleDirection: 'outward',
  colour: '66FFFFFF',
  fillSolid: true,
  fillGradient: false,
  fillImage: false,
  fillOverlay: false,
  imageSrc: '',
  overlaySrc: '',
  gradient: null,
  gradientFlow: 'across',
  cornerGradientMode: 'radial',
  cornerGradientFlip: false,
  cornerGradientInheritSide: 'A',
  topLeft: { radius: 9, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 1, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: '66FFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across', cornerGradientMode: 'radial', cornerGradientFlip: false, cornerGradientInheritSide: 'A' },
  topRight: { radius: 9, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 1, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: '66FFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across', cornerGradientMode: 'radial', cornerGradientFlip: false, cornerGradientInheritSide: 'A' },
  bottomLeft: { radius: 9, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 1, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: '66FFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across', cornerGradientMode: 'radial', cornerGradientFlip: false, cornerGradientInheritSide: 'A' },
  bottomRight: { radius: 9, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 1, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: '66FFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across', cornerGradientMode: 'radial', cornerGradientFlip: false, cornerGradientInheritSide: 'A' },
});

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function objectPathValue(source, path = '') {
  if (!source || !path) return source;
  return String(path)
    .split('.')
    .reduce((current, part) => (current && current[part] !== undefined ? current[part] : undefined), source);
}

function setObjectPath(target, path = '', value) {
  const parts = String(path ?? '').split('.').filter(Boolean);
  if (!parts.length || !isObject(target)) return;

  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!isObject(current[key])) current[key] = {};
    current = current[key];
  }

  current[parts[parts.length - 1]] = value;
}

function mergeDefinedValues(target, patch = {}) {
  if (!isObject(target) || !isObject(patch)) return;

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    if (isObject(value) && isObject(target[key])) {
      mergeDefinedValues(target[key], value);
      continue;
    }
    target[key] = deepClone(value);
  }
}

function normalizeVisualStyle(behavior) {
  const nextValue = String(behavior?.visualStyle ?? behavior?.subtype ?? 'radio').trim().toLowerCase();
  if (nextValue === 'segmented' || nextValue === 'tab') return nextValue;
  return 'radio';
}

function defaultWholeShape(visualStyle) {
  return visualStyle === 'radio' ? 'pill' : 'rounded';
}

function defaultWholeRadius(visualStyle) {
  return visualStyle === 'radio' ? 999 : 9;
}

function createWholeBorderFromBackground(backgroundBorder = null) {
  const nextBorder = deepClone(DEFAULT_SEGMENT_BORDER);
  if (isObject(backgroundBorder)) {
    mergeDefinedValues(nextBorder, backgroundBorder);
  }
  return nextBorder;
}

function createWholeCornersFromBackground(backgroundCorners = null, visualStyle = 'radio') {
  const nextCorners = deepClone(DEFAULT_SEGMENT_CORNERS);
  const defaultRadius = defaultWholeRadius(visualStyle);
  nextCorners.radius = defaultRadius;
  nextCorners.topLeft.radius = defaultRadius;
  nextCorners.topRight.radius = defaultRadius;
  nextCorners.bottomLeft.radius = defaultRadius;
  nextCorners.bottomRight.radius = defaultRadius;

  if (isObject(backgroundCorners)) {
    mergeDefinedValues(nextCorners, backgroundCorners);
  }

  return nextCorners;
}

function applyWholeShape(whole, shape = '', radius = 0) {
  const normalizedShape = String(shape ?? '').trim().toLowerCase();
  const nextRadius = Math.max(0, numberOr(radius, 0));
  const appliedRadius = normalizedShape === 'pill' ? 999 : nextRadius;

  whole.shape = normalizedShape || 'rounded';
  whole.radius = appliedRadius;
  if (!isObject(whole.corners)) {
    whole.corners = createWholeCornersFromBackground();
  }

  const style = normalizedShape === 'square' ? 'straight' : 'rounded';
  const direction = 'outward';
  whole.corners.style = style;
  whole.corners.direction = direction;
  whole.corners.radius = normalizedShape === 'square' ? 0 : appliedRadius;

  for (const key of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']) {
    if (!isObject(whole.corners[key])) whole.corners[key] = {};
    whole.corners[key].style = style;
    whole.corners[key].direction = direction;
    whole.corners[key].radius = normalizedShape === 'square' ? 0 : appliedRadius;
  }
}

function inferWholeShape(corners = null) {
  if (!isObject(corners)) return 'rounded';
  const radius = Math.max(0, numberOr(corners?.radius, 0));
  const style = String(corners?.style ?? 'rounded').trim().toLowerCase();
  const direction = String(corners?.direction ?? 'outward').trim().toLowerCase();

  if (style === 'straight' || radius <= 0) return 'square';
  if (style === 'rounded' && direction !== 'inward' && radius >= 999) return 'pill';
  return 'rounded';
}

function syncWholeLegacyFields(whole) {
  whole.border = createWholeBorderFromBackground(whole.border);
  const cornerBaseStyle = whole.shape === 'pill' ? 'radio' : 'tab';
  if (isObject(whole.corners)) {
    whole.corners = createWholeCornersFromBackground(whole.corners, cornerBaseStyle);
  } else {
    whole.corners = createWholeCornersFromBackground(null, cornerBaseStyle);
    applyWholeShape(whole, whole.shape ?? 'rounded', whole.radius ?? defaultWholeRadius(cornerBaseStyle));
  }
  whole.borderColour = whole.border?.colour ?? '66FFFFFF';
  whole.borderWidth = whole.border?.enabled === false ? 0 : Math.max(0, numberOr(whole.border?.thickness, 0));
  whole.shape = inferWholeShape(whole.corners);
  whole.radius = Math.max(0, numberOr(whole.corners?.radius, 0));
}

function applyWholeLegacyPatch(whole, patchPart = {}) {
  if (patchPart.borderColour != null) {
    whole.borderColour = patchPart.borderColour;
    whole.border.colour = patchPart.borderColour;
  }

  if (patchPart.borderWidth != null) {
    const nextThickness = Math.max(0, numberOr(patchPart.borderWidth, whole.border?.thickness ?? 0));
    whole.borderWidth = nextThickness;
    whole.border.thickness = nextThickness;
    whole.border.enabled = nextThickness > 0;
  }

  if (patchPart.shape != null || patchPart.radius != null) {
    applyWholeShape(whole, patchPart.shape ?? whole.shape, patchPart.radius ?? whole.radius);
  }
}

function normalizeTextTransform(caseMode) {
  switch (String(caseMode ?? '').trim().toLowerCase()) {
    case 'uppercase': return 'uppercase';
    case 'lowercase': return 'lowercase';
    case 'capitalize': return 'capitalize';
    default: return 'none';
  }
}

function defaultLabelWeight(textFont) {
  if (textFont?.weightValue != null) return textFont.weightValue;
  if (textFont?.weight != null && String(textFont.weight).trim()) return textFont.weight;
  return 600;
}

function findCheckedStateNode(statesSection) {
  const children = statesSection?._children ?? {};
  return children.Selected
    ?? Object.values(children).find((state) => state?.when?.checked === true)
    ?? null;
}

function isRowScopedCheckedState(stateName, state) {
  return normalizeKey(stateName) === 'selected'
    || normalizeKey(stateName) === 'checked'
    || state?.when?.checked === true;
}

function createBaseResolvedStyle({
  behavior = null,
  background = null,
  text = null,
} = {}) {
  const visualStyle = normalizeVisualStyle(behavior);
  const border = background?._children?.Border ?? null;
  const corners = background?._children?.Corners ?? null;
  const fill = background?._children?.Fill ?? null;
  const textFill = text?._children?.Fill ?? null;
  const textFont = text?._children?.Font ?? null;
  const wholeBorder = createWholeBorderFromBackground(border);
  const wholeCorners = createWholeCornersFromBackground(corners, visualStyle);

  const style = {
    whole: {
      fillColour: fill?.colour ?? 'FF3A3A3A',
      borderColour: wholeBorder?.colour ?? '66FFFFFF',
      borderWidth: wholeBorder?.enabled === false ? 0 : Math.max(0, numberOr(wholeBorder?.thickness, 1)),
      shape: defaultWholeShape(visualStyle),
      radius: defaultWholeRadius(visualStyle),
      paddingX: 12,
      paddingY: visualStyle === 'tab' ? 8 : 7,
      indicatorGap: 8,
      border: wholeBorder,
      corners: wholeCorners,
    },
    indicatorOuter: {
      visible: visualStyle === 'radio',
      shape: 'circle',
      width: 12,
      height: 12,
      radius: 999,
      borderWidth: 1,
      fillColour: null,
      borderColour: null,
    },
    indicatorInner: {
      visible: visualStyle === 'radio',
      selectedOnly: true,
      shape: 'circle',
      width: 6,
      height: 6,
      radius: 999,
      borderWidth: 0,
      fillColour: null,
      borderColour: null,
    },
    label: {
      colour: textFill?.colour ?? 'FFFFFFFF',
      fontFamily: textFont?.family ?? '',
      fontSize: Math.max(1, numberOr(textFont?.size, 11)),
      fontWeight: defaultLabelWeight(textFont),
      fontStyle: String(textFont?.style ?? 'Normal').trim() || 'Normal',
      letterSpacing: numberOr(textFont?.letterSpacing, 0),
      textTransform: normalizeTextTransform(textFont?.caseMode),
    },
  };

  syncWholeLegacyFields(style.whole);
  return style;
}

function applyDefinedPartValues(targetPart, patchPart = {}, partId = '') {
  if (!isObject(targetPart) || !isObject(patchPart)) return;

  if (partId === 'whole') {
    applyWholeLegacyPatch(targetPart, patchPart);
  }

  for (const [key, value] of Object.entries(patchPart)) {
    if (value === undefined || value === null) continue;
    if (partId === 'whole' && LEGACY_WHOLE_KEYS.has(key)) continue;
    if (isObject(value) && isObject(targetPart[key])) {
      mergeDefinedValues(targetPart[key], value);
      continue;
    }
    targetPart[key] = deepClone(value);
  }

  if (partId === 'whole') {
    syncWholeLegacyFields(targetPart);
  }
}

function applySegmentPatch(target, patch = {}) {
  if (!isObject(target) || !isObject(patch)) return;
  for (const part of RADIO_SEGMENT_PART_OPTIONS) {
    applyDefinedPartValues(target[part.id], patch?.[part.id], part.id);
  }
}

function buildLegacyRowBasePatch(row = {}) {
  const overrides = row?.visualOverrides ?? {};
  return {
    whole: {
      fillColour: overrides.backgroundColour,
      borderColour: overrides.borderColour,
    },
    label: {
      colour: overrides.textColour,
    },
  };
}

function buildLegacyRowSelectedPatch(row = {}, selectedStateNode = null) {
  const overrides = row?.visualOverrides ?? {};
  return {
    whole: {
      fillColour: overrides.selectedBackgroundColour,
      borderColour: overrides.selectedBorderColour,
    },
    label: {
      colour: overrides.selectedTextColour,
    },
  };
}

function buildImplicitSelectedStatePatch(selectedStateNode = null) {
  const componentPatch = selectedStateNode?.patches?.component ?? {};
  return {
    whole: {
      fillColour: componentPatch['Background.Fill.colour'],
      borderColour: componentPatch['Background.Border.colour'],
    },
    label: {
      colour: componentPatch['Text.Fill.colour'],
    },
  };
}

function applyRootComponentPatch(target, componentPatch = {}) {
  if (!isObject(target) || !isObject(componentPatch)) return;

  if (componentPatch['Background.Fill.colour'] != null) {
    target.whole.fillColour = componentPatch['Background.Fill.colour'];
  }

  for (const [path, value] of Object.entries(componentPatch)) {
    if (value == null) continue;

    if (path.startsWith('Background.Border.')) {
      setObjectPath(target.whole.border, path.slice('Background.Border.'.length), deepClone(value));
      continue;
    }

    if (path.startsWith('Background.Corners.')) {
      setObjectPath(target.whole.corners, path.slice('Background.Corners.'.length), deepClone(value));
      continue;
    }

    if (path === 'Text.Fill.colour') {
      target.label.colour = value;
      continue;
    }

    if (path === 'Text.Font.size') {
      target.label.fontSize = Math.max(1, numberOr(value, target.label.fontSize));
      continue;
    }

    if (path === 'Text.Font.weightValue') {
      target.label.fontWeight = value;
      continue;
    }

    if (path === 'Text.Font.style') {
      target.label.fontStyle = value;
      continue;
    }

    if (path === 'Text.Font.letterSpacing') {
      target.label.letterSpacing = numberOr(value, target.label.letterSpacing);
    }
  }

  syncWholeLegacyFields(target.whole);
}

function finalizeResolvedStyle(style) {
  const nextStyle = {
    whole: {
      ...style.whole,
      border: createWholeBorderFromBackground(style.whole?.border),
      corners: createWholeCornersFromBackground(style.whole?.corners),
    },
    indicatorOuter: { ...style.indicatorOuter },
    indicatorInner: { ...style.indicatorInner },
    label: { ...style.label },
  };

  syncWholeLegacyFields(nextStyle.whole);

  if (!nextStyle.indicatorOuter.fillColour) {
    nextStyle.indicatorOuter.fillColour = TRANSPARENT_COLOUR;
  }
  if (!nextStyle.indicatorOuter.borderColour) {
    nextStyle.indicatorOuter.borderColour = nextStyle.label.colour;
  }
  if (!nextStyle.indicatorInner.fillColour) {
    nextStyle.indicatorInner.fillColour = nextStyle.label.colour;
  }
  if (!nextStyle.indicatorInner.borderColour) {
    nextStyle.indicatorInner.borderColour = nextStyle.indicatorInner.fillColour;
  }

  return nextStyle;
}

export function createEmptyRadioSegmentStyle() {
  return {
    shared: {},
    rows: {},
  };
}

export function resolveRadioShapeRadius(shape = '', radius = 0) {
  const normalizedShape = String(shape ?? '').trim().toLowerCase();
  if (normalizedShape === 'pill' || normalizedShape === 'circle') return '999px';
  if (normalizedShape === 'square') return '0px';
  return `${Math.max(0, numberOr(radius, 0))}px`;
}

export function buildRadioWholeBackground(wholeStyle = {}) {
  const whole = finalizeResolvedStyle({
    whole: {
      fillColour: 'FF3A3A3A',
      border: createWholeBorderFromBackground(),
      corners: createWholeCornersFromBackground(null, 'tab'),
      borderColour: '66FFFFFF',
      borderWidth: 1,
      shape: 'rounded',
      radius: 9,
      paddingX: 12,
      paddingY: 7,
      indicatorGap: 8,
      ...deepClone(wholeStyle ?? {}),
    },
    indicatorOuter: {},
    indicatorInner: {},
    label: { colour: 'FFFFFFFF' },
  }).whole;

  return {
    _type: 'Background',
    mode: 'solid',
    _children: {
      Fill: {
        _type: 'Fill',
        mode: 'solid',
        layerOrder: DEFAULT_FILL_ORDER,
        colour: whole.fillColour ?? 'FF3A3A3A',
        solidEnabled: true,
        gradientEnabled: false,
        imageEnabled: false,
        overlayEnabled: false,
      },
      Border: {
        _type: 'Border',
        ...deepClone(whole.border),
      },
      Corners: {
        _type: 'Corners',
        ...deepClone(whole.corners),
      },
    },
  };
}

export function resolveRadioSelectedKeys(valueRows = [], behavior = null, { forceSelectedRowIds = [] } = {}) {
  const rows = Array.isArray(valueRows) ? valueRows.filter((row) => row?.enabled !== false) : [];
  const forcedRowIds = new Set((Array.isArray(forceSelectedRowIds) ? forceSelectedRowIds : []).map((value) => String(value ?? '')));
  const selected = new Set();

  if (forcedRowIds.size > 0) {
    for (const row of rows) {
      if (!forcedRowIds.has(String(row?.id ?? ''))) continue;
      selected.add(String(row?.internalValue ?? row?.id ?? ''));
    }
    return selected;
  }

  const selectionMode = String(behavior?.selectionMode ?? 'single').trim().toLowerCase() === 'multi'
    ? 'multi'
    : 'single';

  for (const row of rows) {
    if (row?.selectedByDefault !== true) continue;
    selected.add(String(row?.internalValue ?? row?.id ?? ''));
    if (selectionMode !== 'multi') return selected;
  }

  const defaultValue = behavior?.defaultValue;
  if (selected.size === 0 && Array.isArray(defaultValue)) {
    for (const entry of defaultValue) {
      selected.add(String(entry ?? ''));
    }
  } else if (selected.size === 0 && defaultValue !== undefined && defaultValue !== null && defaultValue !== '') {
    selected.add(String(defaultValue));
  }

  if (selected.size === 0 && rows[0]) {
    selected.add(String(rows[0]?.internalValue ?? rows[0]?.id ?? ''));
  }

  return selected;
}

export function resolveRadioSegmentStyle({
  row = null,
  behavior = null,
  background = null,
  text = null,
  valueSection = null,
  statesSection = null,
  selected = false,
  activeStateNames = [],
  includeRowBaseOverrides = true,
  includeStateRowOverrides = true,
  excludeStateNames = [],
} = {}) {
  const rowId = String(row?.id ?? '');
  const resolved = createBaseResolvedStyle({ behavior, background, text });
  const selectedStateNode = findCheckedStateNode(statesSection);
  const baseStyle = valueSection?.segmentStyle ?? createEmptyRadioSegmentStyle();
  const excludedStates = new Set((Array.isArray(excludeStateNames) ? excludeStateNames : []).map((value) => String(value ?? '')));

  if (includeRowBaseOverrides) {
    applySegmentPatch(resolved, buildLegacyRowBasePatch(row));
  }

  if (selected) {
    applySegmentPatch(resolved, buildImplicitSelectedStatePatch(selectedStateNode));
  }

  if (selected && includeRowBaseOverrides) {
    applySegmentPatch(resolved, buildLegacyRowSelectedPatch(row, selectedStateNode));
  }

  applySegmentPatch(resolved, baseStyle?.shared);
  if (includeRowBaseOverrides) {
    applySegmentPatch(resolved, baseStyle?.rows?.[rowId]);
  }

  for (const stateName of Array.isArray(activeStateNames) ? activeStateNames : []) {
    if (!stateName || excludedStates.has(String(stateName))) continue;
    const state = statesSection?._children?.[stateName] ?? null;
    if (!state) continue;

    if (isRowScopedCheckedState(stateName, state) && !selected) {
      continue;
    }

    applyRootComponentPatch(resolved, state?.patches?.component);

    const segmentPatch = state?.patches?.segments;
    applySegmentPatch(resolved, segmentPatch?.shared);
    if (includeStateRowOverrides) {
      applySegmentPatch(resolved, segmentPatch?.rows?.[rowId]);
    }
  }

  return finalizeResolvedStyle(resolved);
}
