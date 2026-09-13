// typographyModel.test.js — the Typography tab's model.
//
// The tab's central claim is that it shows a flow mode's own parameters AND NOTHING ELSE. That
// claim has a dangerous failure mode in the other direction: a parameter left out of every mode's
// list becomes unreachable, which is worse than the wall of dead fields it replaces. So the
// headline test here is a completeness check against the real Text.Position defaults — every flow
// property must be reachable from some mode, and every named property must exist.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FLOW_MODE_PARAMS,
  FLOW_PARAM_FIELDS,
  SHARED_PATH_PARAMS,
  PATHLESS_MODES,
  PATH_SHAPE_MODES,
  POINT_ARRAY_PROP,
  FLOW_MODE_OPTIONS,
  TYPE_GROUPS,
  DECORATION_KINDS,
  DECORATION_FIELDS,
  decorationFieldsFor,
  decorationEnabledKey,
  normalizeFlowMode,
  flowFieldsFor,
  readPathPoints,
  movePathPoint,
  addPathPoint,
  removePathPoint,
  curvePresetsFor,
  curvePresetPatch,
  matchCurvePreset,
  allTypographyFieldLabels,
} from '../src/CE_Application/utils/typographyModel.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const position = () => clone(SECTION_DEFAULTS.Text._children.Position);
const font = () => clone(SECTION_DEFAULTS.Text._children.Font);

/** Properties whose editor is the draggable path, not a field. */
const SHAPE_PROPS = new Set([
  'flowPathStartX', 'flowPathStartY', 'flowPathC1X', 'flowPathC1Y',
  'flowPathC2X', 'flowPathC2Y', 'flowPathEndX', 'flowPathEndY',
  'flowPolylinePoints', 'flowFreehandPoints',
]);

// --- completeness -------------------------------------------------------------------------------

test('every parameter the model names is a real Text.Position property', () => {
  const real = position();
  const named = new Set([...Object.values(FLOW_MODE_PARAMS).flat(), ...SHARED_PATH_PARAMS]);
  const missing = [...named].filter((key) => !(key in real));
  assert.deepEqual(missing, [], `named but not stored: ${missing.join(', ')}`);
});

test('no flow property is unreachable — every one belongs to a mode, the shared set, or the path editor', () => {
  const real = position();
  const reachable = new Set([...Object.values(FLOW_MODE_PARAMS).flat(), ...SHARED_PATH_PARAMS]);
  const orphans = Object.keys(real)
    .filter((key) => key.startsWith('flow') && key !== 'flowMode')
    .filter((key) => !reachable.has(key) && !SHAPE_PROPS.has(key));
  assert.deepEqual(orphans, [],
    `these would have no control anywhere in the tab: ${orphans.join(', ')}`);
});

test('every mode in the vocabulary has a parameter list, and vice versa', () => {
  const vocabulary = FLOW_MODE_OPTIONS.map((option) => option.value).sort();
  assert.deepEqual(Object.keys(FLOW_MODE_PARAMS).sort(), vocabulary);
});

test('every parameter key has a field descriptor', () => {
  const named = new Set([...Object.values(FLOW_MODE_PARAMS).flat(), ...SHARED_PATH_PARAMS]);
  for (const key of named) {
    assert.ok(FLOW_PARAM_FIELDS[key], `${key} has no descriptor`);
    assert.equal(FLOW_PARAM_FIELDS[key].key, key);
  }
});

// --- the point of the tab -------------------------------------------------------------------------

test('a mode shows only its own parameters', () => {
  const circle = flowFieldsFor('circle');
  assert.deepEqual(circle.own.map((field) => field.key), ['flowRadius', 'flowAngle']);
  assert.ok(!circle.own.some((field) => field.key === 'flowAmplitude'), 'no wave amplitude in circle');
  assert.ok(!circle.own.some((field) => field.key === 'flowTurns'), 'no spiral turns in circle');

  const wave = flowFieldsFor('wave');
  assert.deepEqual(wave.own.map((field) => field.key), ['flowAmplitude', 'flowFrequency']);
});

test('most of what the panel renders is hidden for a typical mode', () => {
  // The denominator matters and it is easy to overstate. There are 16 flow FIELDS (10 belonging to
  // individual modes, 6 shared), and the panel additionally renders the 10 shape properties — eight
  // bezier numbers and two point arrays — at all times. So a mode is measured against 26 controls
  // on screen, not 16, and the honest claim is about what is drawn rather than about the fields.
  const fields = new Set([...Object.values(FLOW_MODE_PARAMS).flat(), ...SHARED_PATH_PARAMS]).size;
  assert.equal(fields, 16);
  const onScreenToday = fields + SHAPE_PROPS.size;
  assert.equal(onScreenToday, 26);

  const shown = flowFieldsFor('circle');
  const visible = shown.own.length + shown.shared.length;
  assert.equal(visible, 8, 'circle reads two of its own plus the six shared');
  assert.ok(visible / onScreenToday < 0.35, `circle uses ${visible} of the ${onScreenToday} drawn`);
});

test('vertical is a path mode, despite the name', () => {
  // It calls placeAlongPolyline with a two-point vertical path, so it reads all six shared
  // settings. Treating it as pathless would hide six live controls.
  assert.deepEqual(PATHLESS_MODES, ['rotate']);
  assert.equal(flowFieldsFor('vertical').shared.length, SHARED_PATH_PARAMS.length);
  assert.equal(flowFieldsFor('rotate').shared.length, 0);
});

test('modes with no path do not offer path settings', () => {
  for (const mode of PATHLESS_MODES) {
    assert.deepEqual(flowFieldsFor(mode).shared, [], `${mode} has no path to offset along`);
  }
  assert.ok(flowFieldsFor('arc').shared.length > 0, 'arc does');
});

test('an unknown mode falls back rather than showing nothing', () => {
  assert.equal(normalizeFlowMode('nonsense'), 'rotate');
  assert.equal(normalizeFlowMode(undefined), 'rotate');
  assert.equal(flowFieldsFor('nonsense').mode, 'rotate');
});

test('only the three shape modes are edited by dragging', () => {
  for (const mode of FLOW_MODE_OPTIONS.map((option) => option.value)) {
    assert.equal(flowFieldsFor(mode).shape, PATH_SHAPE_MODES.includes(mode), mode);
  }
});

// --- path points ------------------------------------------------------------------------------

test('bezier reads four points, two of them controls', () => {
  const points = readPathPoints(position(), 'bezier');
  assert.equal(points.length, 4);
  assert.deepEqual(points.map((point) => point.key), ['start', 'c1', 'c2', 'end']);
  assert.deepEqual(points.filter((point) => point.control).map((point) => point.key), ['c1', 'c2']);
});

test('polyline and freehand read their arrays', () => {
  const pos = position();
  assert.equal(readPathPoints(pos, 'polyline').length, pos.flowPolylinePoints.length);
  assert.equal(readPathPoints(pos, 'freehand').length, pos.flowFreehandPoints.length);
});

test('moving a bezier point writes its two named fields and nothing else', () => {
  const patch = movePathPoint(position(), 'bezier', 1, 40, 10);
  assert.deepEqual(patch, { 'Text.Position.flowPathC1X': 40, 'Text.Position.flowPathC1Y': 10 });
});

test('moving an array point rewrites the array, because an index is not a property path', () => {
  const pos = position();
  const patch = movePathPoint(pos, 'polyline', 1, 44, 12);
  const list = patch['Text.Position.flowPolylinePoints'];
  assert.equal(list.length, pos.flowPolylinePoints.length);
  assert.deepEqual(list[1], { x: 44, y: 12 });
  assert.deepEqual(list[0], pos.flowPolylinePoints[0], 'the others are untouched');
  assert.deepEqual(pos.flowPolylinePoints[1], SECTION_DEFAULTS.Text._children.Position.flowPolylinePoints[1],
    'and the source is not mutated');
});

test('a drag is clamped to the box', () => {
  const patch = movePathPoint(position(), 'bezier', 0, -40, 900);
  assert.equal(patch['Text.Position.flowPathStartX'], 0);
  assert.equal(patch['Text.Position.flowPathStartY'], 100);
});

test('points can be added and removed, but never below two', () => {
  const pos = position();
  const added = addPathPoint(pos, 'polyline', 0)['Text.Position.flowPolylinePoints'];
  assert.equal(added.length, pos.flowPolylinePoints.length + 1);
  assert.deepEqual(added[1], { x: 16.5, y: 35 }, 'the new point lands halfway to the next');

  const two = { flowPolylinePoints: [{ x: 0, y: 50 }, { x: 100, y: 50 }] };
  assert.deepEqual(removePathPoint(two, 'polyline', 0), {}, 'a path needs a start and an end');
  const three = { flowPolylinePoints: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }] };
  assert.equal(removePathPoint(three, 'polyline', 1)['Text.Position.flowPolylinePoints'].length, 2);
});

test('bezier has exactly four points and refuses to grow', () => {
  assert.deepEqual(addPathPoint(position(), 'bezier', 0), {});
  assert.deepEqual(removePathPoint(position(), 'bezier', 0), {});
  assert.equal(POINT_ARRAY_PROP.bezier, undefined);
});

// --- curve presets ------------------------------------------------------------------------------

test('each shape mode offers presets, and none are offered to other modes', () => {
  assert.ok(curvePresetsFor('bezier').length >= 4);
  assert.ok(curvePresetsFor('polyline').length >= 3);
  assert.deepEqual(curvePresetsFor('circle'), []);
});

test('applying a preset and reading it back matches it', () => {
  for (const mode of PATH_SHAPE_MODES) {
    for (const preset of curvePresetsFor(mode)) {
      const patch = curvePresetPatch(mode, preset);
      const pos = position();
      for (const [path, value] of Object.entries(patch)) {
        pos[path.split('.').at(-1)] = value;
      }
      assert.equal(matchCurvePreset(pos, mode), preset.id, `${mode}/${preset.id} did not round trip`);
    }
  }
});

test('a shape that matches no preset reports none rather than the nearest', () => {
  const pos = position();
  pos.flowPathC1X = 7.3;
  pos.flowPathC1Y = 91.1;
  assert.equal(matchCurvePreset(pos, 'bezier'), '');
});

// --- decorations ---------------------------------------------------------------------------------

test('one descriptor covers all three lines, and the property names are the ones the renderer reads', () => {
  const stored = font();
  for (const kind of DECORATION_KINDS) {
    assert.ok(kind.key in stored, `${kind.key} is the on/off property`);
    assert.equal(decorationEnabledKey(kind.key), kind.key);
    for (const field of decorationFieldsFor(kind.key)) {
      assert.ok(field.key in stored, `${field.key} is stored on Font`);
    }
  }
});

test('the three blocks really are the same shape', () => {
  const shapes = DECORATION_KINDS.map((kind) =>
    decorationFieldsFor(kind.key).map((field) => field.key.slice(kind.key.length)).join(','));
  assert.equal(new Set(shapes).size, 1, 'all three carry identical suffixes');
  assert.equal(DECORATION_FIELDS.length, 7);
  // 3 kinds x 7 fields + 3 on/off flags = 24 of Font's 40 properties.
  assert.equal(DECORATION_KINDS.length * DECORATION_FIELDS.length + DECORATION_KINDS.length, 24);
});

// --- type groups ----------------------------------------------------------------------------------

test('every type field is a real property on the section it names', () => {
  const roots = {
    'Text.Font': font(),
    'Text.Multiline': clone(SECTION_DEFAULTS.Text._children.Multiline),
    'Text.Position': position(),
  };
  for (const group of TYPE_GROUPS) {
    const node = roots[group.root];
    assert.ok(node, `${group.root} exists`);
    for (const field of group.fields) {
      assert.ok(field.key in node, `${group.root}.${field.key} is stored`);
    }
  }
});

test('every shipped default sits inside the range or option set the tab offers', () => {
  const roots = {
    'Text.Font': font(),
    'Text.Multiline': clone(SECTION_DEFAULTS.Text._children.Multiline),
    'Text.Position': position(),
  };
  const check = (field, value, where) => {
    if (value == null) return;
    if (field.kind === 'number' && Number.isFinite(value)) {
      assert.ok(value >= field.min && value <= field.max, `${where} default ${value} is outside [${field.min}, ${field.max}]`);
    }
    if (field.kind === 'choice') {
      assert.ok(field.options.includes(String(value)), `${where} default ${value} is not in ${field.options.join('|')}`);
    }
  };
  for (const group of TYPE_GROUPS) {
    for (const field of group.fields) check(field, roots[group.root][field.key], `${group.root}.${field.key}`);
  }
  const pos = position();
  for (const [key, field] of Object.entries(FLOW_PARAM_FIELDS)) check(field, pos[key], key);
});

test('every label is available for the panel search index', () => {
  const labels = allTypographyFieldLabels();
  for (const needle of ['Size', 'Letter', 'Line height', 'Amplitude', 'Turns', 'Under Colour', 'Ligatures', 'Spiral']) {
    assert.ok(labels.includes(needle), `${needle} should be searchable`);
  }
});
