/**
 * typographyModel.js — the Typography dock tab's model, as a pure module.
 *
 * TWO THINGS THIS EXISTS TO FIX, both of which are the same shape as the Effects tab's finding: the
 * renderer already generalises and the panel does not.
 *
 * 1. THE FLOW SECTION IS MOSTLY DEAD AT ANY MOMENT. `Text.Position` carries 37 fields and
 *    `flowMode` has thirteen values. `canvasControlTextLayout.js` branches hard on the mode — it
 *    reads `amplitude`/`frequency` only under `wave` and `zigzag`, `turns` only under `spiral`,
 *    `perimeterInset` only under `perimeter`, the point arrays only under their own modes. The
 *    properties panel has exactly ONE `{#if}` in the whole section, so with Circle selected you are
 *    shown wave amplitude, spiral turns, stair unit and eight bezier numbers, every one inert and
 *    drawn identically to the two that work. `FLOW_MODE_PARAMS` below is that branching, written
 *    down once, so the tab can show a mode's own parameters and nothing else.
 *
 *    IT MUST STAY IN STEP WITH THE LAYOUT. If a mode learns a new parameter there, it needs a row
 *    here or the control will be unreachable. `typographyModel.test.js` asserts every key named
 *    here is one the layout actually accepts.
 *
 * 2. THREE IDENTICAL DECORATION BLOCKS. `Font` has 40 fields and 24 are the same eight-field shape
 *    three times over — underline, strikethrough, overline, each with Offset, Thickness, Colour,
 *    InsetLeft, InsetRight, Gap and Layer. The renderer already parameterises by kind
 *    (`lineColourFor(kind, …)`, `lineLayerFor(kind, …)`); the panel mounts one shared component
 *    three times with three sets of labels. One editor and a kind picker is all this needs.
 *
 * Pure: no Svelte, no stores, no DOM.
 */
// textEditorVocabulary.js, NOT textEditorOptions.js. The options module imports lucide icon
// components, and its own header records why the split exists: pulling it into a non-Svelte module
// "dragged the whole icon set into the scripting layer — enough to make every test that touches
// panelRuntime fail on an unresolvable icon import". This module has to run under plain node.
import {
  FLOW_MODE_OPTIONS,
  TEXT_CASE_OPTIONS,
  TEXT_SCRIPT_OPTIONS,
  TEXT_POSITION_OPTIONS,
  TEXT_READING_VALUES,
  TYPOGRAPHY_FEATURE_OPTIONS,
} from '../sections/textEditorVocabulary.js';
import { deepClone } from './deepClone.js';

export {
  FLOW_MODE_OPTIONS, TEXT_CASE_OPTIONS, TEXT_SCRIPT_OPTIONS,
  TEXT_POSITION_OPTIONS, TEXT_READING_VALUES, TYPOGRAPHY_FEATURE_OPTIONS,
};

export const FONT_ROOT = 'Text.Font';
export const POSITION_ROOT = 'Text.Position';
export const MULTILINE_ROOT = 'Text.Multiline';

const num = (key, label, opts = {}) => ({ kind: 'number', key, label, ...opts });
const pick = (key, label, options) => ({ kind: 'choice', key, label, options });
const flag = (key, label) => ({ kind: 'toggle', key, label });

// ---------------------------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------------------------

/** Parameters each mode actually reads, mirrored from canvasControlTextLayout.js's branching. */
export const FLOW_MODE_PARAMS = {
  rotate: ['flowAngle'],
  line: ['flowAngle', 'flowStepX', 'flowStepY'],
  stair: ['flowStepX', 'flowStepY', 'flowStairUnit'],
  arc: ['flowRadius', 'flowSweep', 'flowAngle'],
  circle: ['flowRadius', 'flowAngle'],
  vertical: [],
  wave: ['flowAmplitude', 'flowFrequency'],
  zigzag: ['flowAmplitude', 'flowFrequency'],
  spiral: ['flowRadius', 'flowTurns'],
  perimeter: ['flowPerimeterInset'],
  polyline: [],
  bezier: [],
  freehand: [],
};

/**
 * Read by every mode that lays glyphs along a path.
 *
 * Which ones those are is not a judgement call: `placeAlongPolyline` consumes all six, and it is
 * called by line, stair, vertical, wave, zigzag, spiral, perimeter, polyline, freehand and bezier;
 * arc and circle have their own branch that reads the same six. `rotate` is the only mode that
 * places glyphs without a path — VERTICAL IS NOT, despite reading like it should be, because it
 * builds a two-point vertical path and walks it. Getting that wrong would have hidden six live
 * controls, which is the same fault as showing dead ones, only quieter.
 */
export const SHARED_PATH_PARAMS = [
  'flowDistribution', 'flowFacing', 'flowSide', 'flowReverse', 'flowStartOffset', 'flowFixedAdvance',
];

export const PATHLESS_MODES = ['rotate'];

/** The three modes whose value is a SHAPE rather than a number — a bezier's four points, or a
 *  polyline/freehand vertex list. They get draggable points on the specimen because there is no
 *  number worth typing: nobody authors a curve as eight percentages, and "freehand" says drawing. */
export const PATH_SHAPE_MODES = ['bezier', 'polyline', 'freehand'];

export const FLOW_PARAM_FIELDS = {
  flowAngle: num('flowAngle', 'Angle', { min: -360, max: 360, step: 1, angle: true }),
  flowStepX: num('flowStepX', 'Step X', { min: -200, max: 200, step: 1 }),
  flowStepY: num('flowStepY', 'Step Y', { min: -200, max: 200, step: 1 }),
  flowStairUnit: pick('flowStairUnit', 'Unit', ['character', 'word', 'line']),
  flowRadius: num('flowRadius', 'Radius', { min: 0, max: 500, step: 1 }),
  flowSweep: num('flowSweep', 'Sweep', { min: -360, max: 360, step: 1, angle: true }),
  flowAmplitude: num('flowAmplitude', 'Amplitude', { min: -200, max: 200, step: 1 }),
  flowFrequency: num('flowFrequency', 'Frequency', { min: 0, max: 20, step: 0.1 }),
  flowTurns: num('flowTurns', 'Turns', { min: 0, max: 20, step: 0.1 }),
  flowPerimeterInset: num('flowPerimeterInset', 'Inset', { min: -100, max: 100, step: 1 }),
  flowDistribution: pick('flowDistribution', 'Distribute', ['natural', 'fit', 'fixed', 'justify']),
  flowFacing: pick('flowFacing', 'Facing', ['path', 'upright', 'inward', 'outward']),
  flowSide: pick('flowSide', 'Side', ['inside', 'center', 'outside']),
  flowReverse: flag('flowReverse', 'Reverse'),
  flowStartOffset: num('flowStartOffset', 'Start', { min: -200, max: 200, step: 1 }),
  flowFixedAdvance: num('flowFixedAdvance', 'Advance', { min: 0, max: 200, step: 1 }),
};

export function normalizeFlowMode(value) {
  const mode = String(value ?? 'rotate');
  return Object.hasOwn(FLOW_MODE_PARAMS, mode) ? mode : 'rotate';
}

/**
 * The fields a mode should show: `own` are its own, `shared` are the path settings every path mode
 * reads, and `shape` says whether it is edited by dragging points instead of typing numbers.
 */
export function flowFieldsFor(mode) {
  const normalized = normalizeFlowMode(mode);
  return {
    mode: normalized,
    own: (FLOW_MODE_PARAMS[normalized] ?? []).map((key) => FLOW_PARAM_FIELDS[key]).filter(Boolean),
    shared: PATHLESS_MODES.includes(normalized)
      ? []
      : SHARED_PATH_PARAMS.map((key) => FLOW_PARAM_FIELDS[key]).filter(Boolean),
    shape: PATH_SHAPE_MODES.includes(normalized),
  };
}

/** Every flow parameter that exists, for the count the tab shows ("2 of 30") and for tests. */
export function allFlowParamKeys() {
  const keys = new Set(SHARED_PATH_PARAMS);
  for (const list of Object.values(FLOW_MODE_PARAMS)) for (const key of list) keys.add(key);
  for (const mode of PATH_SHAPE_MODES) keys.add(mode === 'bezier' ? 'flowPath*' : `flow${mode}Points`);
  return [...keys];
}

// ---------------------------------------------------------------------------------------------
// Path points — the shape modes
// ---------------------------------------------------------------------------------------------

const BEZIER_POINTS = [
  { key: 'start', label: 'Start', x: 'flowPathStartX', y: 'flowPathStartY' },
  { key: 'c1', label: 'Control 1', x: 'flowPathC1X', y: 'flowPathC1Y' },
  { key: 'c2', label: 'Control 2', x: 'flowPathC2X', y: 'flowPathC2Y' },
  { key: 'end', label: 'End', x: 'flowPathEndX', y: 'flowPathEndY' },
];

export const POINT_ARRAY_PROP = { polyline: 'flowPolylinePoints', freehand: 'flowFreehandPoints' };

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) * 10) / 10));

/**
 * The draggable points for a shape mode, as percentages of the text box.
 *
 * Bezier's four points live in eight named fields; polyline and freehand live in an array. Both
 * come back in the same form so the editor does not care which it is holding.
 */
export function readPathPoints(position, mode) {
  const normalized = normalizeFlowMode(mode);
  if (normalized === 'bezier') {
    return BEZIER_POINTS.map((point, index) => ({
      index,
      key: point.key,
      label: point.label,
      control: point.key === 'c1' || point.key === 'c2',
      x: clampPercent(position?.[point.x] ?? 0),
      y: clampPercent(position?.[point.y] ?? 50),
    }));
  }
  const prop = POINT_ARRAY_PROP[normalized];
  if (!prop) return [];
  const list = Array.isArray(position?.[prop]) ? position[prop] : [];
  return list.map((point, index) => ({
    index,
    key: String(index),
    label: `Point ${index + 1}`,
    control: false,
    x: clampPercent(point?.x ?? 0),
    y: clampPercent(point?.y ?? 50),
  }));
}

/** Move one point, returning the property patch. Bezier writes two named fields; the array modes
 *  rewrite the array, because an index is not a property path. */
export function movePathPoint(position, mode, index, x, y) {
  const normalized = normalizeFlowMode(mode);
  const nx = clampPercent(x);
  const ny = clampPercent(y);

  if (normalized === 'bezier') {
    const point = BEZIER_POINTS[index];
    if (!point) return {};
    return { [`${POSITION_ROOT}.${point.x}`]: nx, [`${POSITION_ROOT}.${point.y}`]: ny };
  }

  const prop = POINT_ARRAY_PROP[normalized];
  if (!prop) return {};
  const list = Array.isArray(position?.[prop]) ? deepClone(position[prop]) : [];
  if (index < 0 || index >= list.length) return {};
  list[index] = { ...list[index], x: nx, y: ny };
  return { [`${POSITION_ROOT}.${prop}`]: list };
}

/** Insert a point after `index` in a polyline or freehand path, halfway to the next one. Bezier has
 *  exactly four points by definition, so it refuses. */
export function addPathPoint(position, mode, index) {
  const prop = POINT_ARRAY_PROP[normalizeFlowMode(mode)];
  if (!prop) return {};
  const list = Array.isArray(position?.[prop]) ? deepClone(position[prop]) : [];
  if (!list.length) return { [`${POSITION_ROOT}.${prop}`]: [{ x: 0, y: 50 }, { x: 100, y: 50 }] };
  const at = Math.max(0, Math.min(list.length - 1, index));
  const here = list[at];
  const next = list[at + 1] ?? { x: clampPercent((here?.x ?? 0) + 10), y: here?.y ?? 50 };
  list.splice(at + 1, 0, {
    x: clampPercent(((here?.x ?? 0) + (next?.x ?? 0)) / 2),
    y: clampPercent(((here?.y ?? 50) + (next?.y ?? 50)) / 2),
  });
  return { [`${POSITION_ROOT}.${prop}`]: list };
}

/** Remove a point. Two is the floor — a path needs somewhere to start and finish. */
export function removePathPoint(position, mode, index) {
  const prop = POINT_ARRAY_PROP[normalizeFlowMode(mode)];
  if (!prop) return {};
  const list = Array.isArray(position?.[prop]) ? deepClone(position[prop]) : [];
  if (list.length <= 2 || index < 0 || index >= list.length) return {};
  list.splice(index, 1);
  return { [`${POSITION_ROOT}.${prop}`]: list };
}

/**
 * Named curves, so the shape modes have a way in that is not eight percentages.
 *
 * Like the Effects tab's looks these are whole patches: picking one replaces the shape rather than
 * nudging it, which is what makes them destinations you can leave.
 */
export const CURVE_PRESETS = [
  { id: 'arch', label: 'Arch', modes: ['bezier'], points: [{ x: 0, y: 85 }, { x: 30, y: 5 }, { x: 70, y: 5 }, { x: 100, y: 85 }] },
  { id: 'valley', label: 'Valley', modes: ['bezier'], points: [{ x: 0, y: 15 }, { x: 30, y: 95 }, { x: 70, y: 95 }, { x: 100, y: 15 }] },
  { id: 'scurve', label: 'S-curve', modes: ['bezier'], points: [{ x: 0, y: 80 }, { x: 38, y: 0 }, { x: 62, y: 100 }, { x: 100, y: 20 }] },
  { id: 'ramp', label: 'Ramp', modes: ['bezier'], points: [{ x: 0, y: 88 }, { x: 35, y: 70 }, { x: 65, y: 30 }, { x: 100, y: 12 }] },
  { id: 'flat', label: 'Flat', modes: ['bezier'], points: [{ x: 0, y: 50 }, { x: 33, y: 50 }, { x: 66, y: 50 }, { x: 100, y: 50 }] },
  { id: 'peak', label: 'Peak', modes: ['polyline', 'freehand'], points: [{ x: 0, y: 85 }, { x: 50, y: 10 }, { x: 100, y: 85 }] },
  { id: 'zig', label: 'Zig', modes: ['polyline', 'freehand'], points: [{ x: 0, y: 70 }, { x: 25, y: 20 }, { x: 50, y: 70 }, { x: 75, y: 20 }, { x: 100, y: 70 }] },
  { id: 'stairs', label: 'Stairs', modes: ['polyline', 'freehand'], points: [{ x: 0, y: 85 }, { x: 33, y: 60 }, { x: 66, y: 35 }, { x: 100, y: 10 }] },
  { id: 'level', label: 'Level', modes: ['polyline', 'freehand'], points: [{ x: 0, y: 50 }, { x: 50, y: 50 }, { x: 100, y: 50 }] },
];

export function curvePresetsFor(mode) {
  const normalized = normalizeFlowMode(mode);
  return CURVE_PRESETS.filter((preset) => preset.modes.includes(normalized));
}

export function curvePresetPatch(mode, preset) {
  const normalized = normalizeFlowMode(mode);
  if (!preset) return {};
  if (normalized === 'bezier') {
    const patch = {};
    BEZIER_POINTS.forEach((point, index) => {
      const source = preset.points[index] ?? { x: 0, y: 50 };
      patch[`${POSITION_ROOT}.${point.x}`] = clampPercent(source.x);
      patch[`${POSITION_ROOT}.${point.y}`] = clampPercent(source.y);
    });
    return patch;
  }
  const prop = POINT_ARRAY_PROP[normalized];
  if (!prop) return {};
  return { [`${POSITION_ROOT}.${prop}`]: preset.points.map((p) => ({ x: clampPercent(p.x), y: clampPercent(p.y) })) };
}

/** Which preset the current shape matches, so the shelf can tick one. */
export function matchCurvePreset(position, mode) {
  const points = readPathPoints(position, mode);
  for (const preset of curvePresetsFor(mode)) {
    if (preset.points.length !== points.length) continue;
    if (preset.points.every((p, i) => clampPercent(p.x) === points[i].x && clampPercent(p.y) === points[i].y)) {
      return preset.id;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------------------------
// Decorations — one editor, three lines
// ---------------------------------------------------------------------------------------------

export const DECORATION_KINDS = [
  { key: 'underline', label: 'Under' },
  { key: 'strikethrough', label: 'Strike' },
  { key: 'overline', label: 'Over' },
];

/**
 * The seven fields every decoration has. The stored property is the kind followed by the suffix —
 * `underlineOffset`, `overlineGap`, `strikethroughLayer` — which is exactly how the renderer reads
 * them (`lineColourFor(kind, …)` looks up `${kind}Colour`).
 */
export const DECORATION_FIELDS = [
  { suffix: 'Colour', label: 'Colour', kind: 'colour' },
  { suffix: 'Offset', label: 'Offset', kind: 'number', min: -100, max: 100, step: 0.5 },
  { suffix: 'Thickness', label: 'Thickness', kind: 'number', min: 0, max: 40, step: 0.5 },
  { suffix: 'Gap', label: 'Gap', kind: 'number', min: -50, max: 50, step: 0.5 },
  { suffix: 'InsetLeft', label: 'Inset L', kind: 'number', min: -100, max: 100, step: 1 },
  { suffix: 'InsetRight', label: 'Inset R', kind: 'number', min: -100, max: 100, step: 1 },
  { suffix: 'Layer', label: 'Layer', kind: 'choice', options: ['back', 'front'] },
];

/** One decoration's fields, resolved to their real property names. */
export function decorationFieldsFor(kind) {
  return DECORATION_FIELDS.map((field) => ({ ...field, key: `${kind}${field.suffix}` }));
}

/** The on/off property, which is the bare kind: `underline`, `strikethrough`, `overline`. */
export function decorationEnabledKey(kind) {
  return kind;
}

// ---------------------------------------------------------------------------------------------
// Type — the settings column
// ---------------------------------------------------------------------------------------------

export const TYPE_GROUPS = [
  {
    key: 'size',
    label: 'Size',
    root: FONT_ROOT,
    fields: [
      num('size', 'Size', { min: 1, max: 400, step: 1 }),
      pick('style', 'Style', ['Normal', 'Italic']),
      pick('caseMode', 'Case', TEXT_CASE_OPTIONS.map((option) => option.value)),
      pick('scriptMode', 'Script', TEXT_SCRIPT_OPTIONS.map((option) => option.value)),
      num('baselineShift', 'Baseline', { min: -100, max: 100, step: 0.5 }),
    ],
  },
  {
    key: 'spacing',
    label: 'Spacing',
    root: FONT_ROOT,
    fields: [
      num('letterSpacing', 'Letter', { min: -50, max: 200, step: 0.1 }),
      num('wordSpacing', 'Word', { min: -50, max: 200, step: 0.5 }),
    ],
  },
  {
    key: 'lines',
    label: 'Lines',
    root: MULTILINE_ROOT,
    fields: [
      num('lineHeight', 'Line height', { min: 0.5, max: 5, step: 0.05 }),
      pick('wrapMode', 'Wrap', ['word', 'character', 'none']),
      pick('overflowMode', 'Overflow', ['clip', 'ellipsis']),
      num('maxLines', 'Max lines', { min: 0, max: 200, step: 1 }),
      pick('fitMode', 'Fit', ['none', 'shrink']),
      flag('justifyLastLine', 'Justify last'),
    ],
  },
  {
    key: 'placement',
    label: 'Placement',
    root: POSITION_ROOT,
    fields: [
      pick('justification', 'Align', TEXT_POSITION_OPTIONS.map((option) => option.value)),
      pick('readingOrientation', 'Reading', TEXT_READING_VALUES),
      pick('orientation', 'Orientation', ['horizontal', 'vertical']),
    ],
  },
];

/** Every label the tab can show, for the properties panel's search index. Relocating a group out of
 *  the panel drops it out of `propertyFilter` unless something puts it back. */
export function allTypographyFieldLabels() {
  const labels = new Set(['Family', 'Weight', 'Decoration', 'Flow']);
  for (const group of TYPE_GROUPS) {
    labels.add(group.label);
    for (const field of group.fields) labels.add(field.label);
  }
  for (const field of Object.values(FLOW_PARAM_FIELDS)) labels.add(field.label);
  for (const kind of DECORATION_KINDS) {
    for (const field of decorationFieldsFor(kind.key)) labels.add(`${kind.label} ${field.label}`);
  }
  for (const feature of TYPOGRAPHY_FEATURE_OPTIONS) labels.add(feature.label);
  for (const mode of FLOW_MODE_OPTIONS) labels.add(mode.label);
  return [...labels];
}
