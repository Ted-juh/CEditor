// mouseBehavior.test.js — the Mouse section, which for most of its life was
// nine fields nothing read and a properties tab that rendered
// "Component: Mouse" and nothing else.
//
// The thing worth pinning here is not that the resolvers return values — it is
// that an untouched control is bit-for-bit unaffected. Every panel authored
// before the Mouse tab worked carries no Mouse block at all, or one straight
// from the defaults, and those must produce exactly the drag options and
// exactly the DOM the surfaces produced before. The override tests come
// second; the no-op tests are the contract.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CURSOR_OPTIONS,
  HIT_TEST_SHAPES,
  DRAG_MODE_OPTIONS,
  getCursor,
  getDragMode,
  getDragSensitivity,
  getHitTestShape,
  getMouseSection,
  acceptsPointer,
  childrenAcceptPointer,
  hasDragOverrides,
  isFocusable,
  mouseScrubOverrides,
  raisesOnClick,
  resolveCursorCss,
  resolveHitTestClipPath,
  resolveTabIndex,
  showsFocusOutline,
} from '../src/CE_Application/utils/mouseBehavior.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import {
  createRangeScrub,
  createSliderTrackScrub,
  createCircularSliderScrub,
} from '../src/CE_Application/utils/scrubRuntime.js';

const DEFAULT_MOUSE = SECTION_DEFAULTS.Mouse;

// --- The no-op contract ---------------------------------------------------

test('a control with no Mouse section contributes no scrub overrides', () => {
  assert.deepEqual(mouseScrubOverrides(null), {});
  assert.deepEqual(mouseScrubOverrides(undefined), {});
  assert.equal(hasDragOverrides(null), false);
});

test('the shipped defaults contribute no scrub overrides', () => {
  assert.deepEqual(mouseScrubOverrides(DEFAULT_MOUSE, { sensitivity: 0.005 }), {});
  assert.equal(hasDragOverrides(DEFAULT_MOUSE), false);
});

test('an untouched Mouse section leaves a range drag identical', () => {
  const behavior = { family: 'range', min: 0, max: 100, step: 1 };
  const withoutMouse = createRangeScrub(behavior, 50);
  const withDefaults = createRangeScrub(behavior, 50, DEFAULT_MOUSE);

  withoutMouse.begin({ x: 0, y: 0 });
  withDefaults.begin({ x: 0, y: 0 });
  assert.equal(withoutMouse.move({ x: 18, y: 0 }), withDefaults.move({ x: 18, y: 0 }));
  assert.deepEqual(withoutMouse.options, withDefaults.options);
});

test('an untouched Mouse section leaves a slider track drag identical', () => {
  const behavior = { geometry: 'linear', orientation: 'horizontal', direction: 'ltr' };
  assert.deepEqual(
    createSliderTrackScrub(behavior).options,
    createSliderTrackScrub(behavior, DEFAULT_MOUSE).options,
  );
});

test('the pointer and focus resolvers all match the old hard-coded behaviour', () => {
  // What the surfaces did before any of this was readable.
  assert.equal(resolveCursorCss(DEFAULT_MOUSE), '');
  assert.equal(resolveHitTestClipPath(DEFAULT_MOUSE), '');
  assert.equal(acceptsPointer(DEFAULT_MOUSE), true);
  assert.equal(childrenAcceptPointer(DEFAULT_MOUSE), false);
  assert.equal(isFocusable(DEFAULT_MOUSE), false);
  assert.equal(showsFocusOutline(DEFAULT_MOUSE), false);
  assert.equal(raisesOnClick(DEFAULT_MOUSE), false);
  assert.equal(resolveTabIndex(DEFAULT_MOUSE), -1);
});

// --- Pointer -------------------------------------------------------------

test('getCursor falls back to default for anything unrecognised', () => {
  assert.equal(getCursor({ cursor: 'grab' }), 'grab');
  assert.equal(getCursor({ cursor: 'javascript:alert(1)' }), 'default');
  assert.equal(getCursor({ cursor: '' }), 'default');
  assert.equal(getCursor(null), 'default');
  for (const option of CURSOR_OPTIONS) assert.equal(getCursor({ cursor: option }), option);
});

test('a non-default cursor emits css, default emits none', () => {
  // 'default' has to emit nothing rather than `cursor:default` — writing it
  // would override the surface's own move/resize cursors.
  assert.equal(resolveCursorCss({ cursor: 'default' }), '');
  assert.equal(resolveCursorCss({ cursor: 'crosshair' }), 'cursor:crosshair;');
});

test('an ellipse hit shape clips, a rectangle does not', () => {
  assert.equal(resolveHitTestClipPath({ hitTestShape: 'ellipse' }), 'clip-path:ellipse(50% 50%);');
  assert.equal(resolveHitTestClipPath({ hitTestShape: 'rectangle' }), '');
  assert.equal(resolveHitTestClipPath({ hitTestShape: 'triangle' }), '');
  for (const shape of HIT_TEST_SHAPES) assert.equal(getHitTestShape({ hitTestShape: shape }), shape);
});

test('interceptClicks false is the only thing that stops taking the pointer', () => {
  assert.equal(acceptsPointer({ interceptClicks: false }), false);
  assert.equal(acceptsPointer({ interceptClicks: true }), true);
  // Absent means the historical default, which was "yes".
  assert.equal(acceptsPointer({}), true);
});

// --- Focus ---------------------------------------------------------------

test('tab index follows focusable unless the author set one', () => {
  assert.equal(resolveTabIndex({ focusable: true }), 0);
  assert.equal(resolveTabIndex({ focusable: false }), -1);
  // An explicit index survives toggling focusable off and on again.
  assert.equal(resolveTabIndex({ focusable: false, tabIndex: 3 }), 3);
  assert.equal(resolveTabIndex({ focusable: true, tabIndex: 3 }), 3);
  assert.equal(resolveTabIndex({ focusable: true, tabIndex: 2.7 }), 2);
  assert.equal(resolveTabIndex({ focusable: true, tabIndex: 'nonsense' }), 0);
});

// --- Drag ----------------------------------------------------------------

test('drag mode maps onto the core axis vocabulary', () => {
  assert.deepEqual(mouseScrubOverrides({ dragMode: 'vertical' }), { axis: 'y' });
  assert.deepEqual(mouseScrubOverrides({ dragMode: 'horizontal' }), { axis: 'x' });
  assert.deepEqual(mouseScrubOverrides({ dragMode: 'both' }), { axis: 'both' });
  assert.deepEqual(
    mouseScrubOverrides({ dragMode: 'circular' }),
    { axis: 'rotary', tracking: 'relative' },
  );
  assert.deepEqual(
    mouseScrubOverrides({ dragMode: 'free' }),
    { axis: 'both', tracking: 'relative', combine: 'magnitude' },
  );
  // 'relative' changes tracking only, leaving the resolved axis alone.
  assert.deepEqual(mouseScrubOverrides({ dragMode: 'relative' }), { tracking: 'relative' });
  assert.equal(getDragMode({ dragMode: 'sideways' }), 'auto');
  for (const mode of DRAG_MODE_OPTIONS) assert.equal(getDragMode({ dragMode: mode }), mode);
});

test('sensitivity multiplies the resolved rate rather than replacing it', () => {
  const resolved = { sensitivity: 0.004 };
  assert.deepEqual(mouseScrubOverrides({ dragSensitivity: 2 }, resolved), { sensitivity: 0.008 });
  assert.deepEqual(mouseScrubOverrides({ dragSensitivity: 0.5 }, resolved), { sensitivity: 0.002 });
  // Out of range values are clamped, not rejected outright.
  assert.equal(getDragSensitivity({ dragSensitivity: 0 }), 0.01);
  assert.equal(getDragSensitivity({ dragSensitivity: 99 }), 10);
  assert.equal(getDragSensitivity({ dragSensitivity: 'x' }), 1);
});

test('sensitivity is skipped when the resolved options have no rate to scale', () => {
  // Absolute track mapping has no sensitivity to multiply; emitting one would
  // invent a number the core then honours.
  assert.deepEqual(mouseScrubOverrides({ dragSensitivity: 3 }, {}), {});
});

test('invert flips what the control already does rather than forcing a direction', () => {
  // The point of XOR: on a right-to-left slider, which already resolves
  // invertX true, ticking Invert X must return it to left-to-right.
  assert.deepEqual(mouseScrubOverrides({ invertX: true }, { invertX: false }), { invertX: true });
  assert.deepEqual(mouseScrubOverrides({ invertX: true }, { invertX: true }), { invertX: false });
  assert.deepEqual(mouseScrubOverrides({ invertY: true }, { invertY: true }), { invertY: false });
  // Not ticked contributes nothing at all, either way.
  assert.deepEqual(mouseScrubOverrides({ invertX: false }, { invertX: true }), {});
});

test('hasDragOverrides spots every setting that changes a drag, and nothing else', () => {
  assert.equal(hasDragOverrides({ dragMode: 'vertical' }), true);
  assert.equal(hasDragOverrides({ dragSensitivity: 2 }), true);
  assert.equal(hasDragOverrides({ invertX: true }), true);
  assert.equal(hasDragOverrides({ invertY: true }), true);
  // Pointer and focus settings are not drag settings.
  assert.equal(hasDragOverrides({ cursor: 'grab', focusable: true, interceptClicks: false }), false);
});

// --- End to end through the scrub factories -------------------------------

test('sensitivity 2 doubles the value a range drag produces', () => {
  const behavior = { family: 'range', min: 0, max: 100, step: 1 };
  const plain = createRangeScrub(behavior, 50);
  const doubled = createRangeScrub(behavior, 50, { dragSensitivity: 2 });

  plain.begin({ x: 0, y: 0 });
  doubled.begin({ x: 0, y: 0 });
  // 36 px right: 2 steps at the stock rate, 4 at double.
  assert.equal(plain.move({ x: 36, y: 0 }), 52);
  assert.equal(doubled.move({ x: 36, y: 0 }), 54);
});

test('invert X reverses a range drag through the factory', () => {
  const behavior = { family: 'range', min: 0, max: 100, step: 1 };
  const inverted = createRangeScrub(behavior, 50, { invertX: true });
  inverted.begin({ x: 0, y: 0 });
  assert.equal(inverted.move({ x: 36, y: 0 }), 48);
});

test('the Mouse section reaches a circular slider scrub too', () => {
  const behavior = { geometry: 'circular', circularDragMode: 'knob', direction: 'cw' };
  const plain = createCircularSliderScrub(behavior, 0.5);
  const sensitive = createCircularSliderScrub(behavior, 0.5, { dragSensitivity: 4 });
  assert.equal(sensitive.options.sensitivity, plain.options.sensitivity * 4);
});

test('getMouseSection reads the section off a control, and tolerates a bare one', () => {
  const control = { _children: { Mouse: { _type: 'Mouse', cursor: 'grab' } } };
  assert.equal(getMouseSection(control)?.cursor, 'grab');
  assert.equal(getMouseSection({}), null);
  assert.equal(getMouseSection(null), null);
});
