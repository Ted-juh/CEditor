// componentContactSheet.test.js — every state at several sizes, and what broke at each.
//
// The sheet is only worth looking at if its cells are what the panel would draw and its warnings
// are about changes, not about how the component was designed. Both are pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildContactSheet, contactSheetScale, contactSheetSizes, controlAtSize, layoutIssues,
} from '../src/CE_Application/utils/componentContactSheet.js';

const part = (layout, extra = {}) => ({
  _type: 'Part',
  ...extra,
  _children: {
    Layout: {
      xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', offsetX: 0, offsetY: 0,
      ...layout,
    },
  },
});

function component({ width = 100, height = 60, parts = {}, states = {}, transform = {}, designer = {} } = {}) {
  return {
    _children: {
      Core: { _type: 'Core', id: 'cc', controlType: 'CustomComponent' },
      Transform: { _type: 'Transform', width, height, ...transform },
      Designer: { _type: 'Designer', ...designer },
      Parts: { _type: 'Parts', _children: parts },
      States: { _type: 'States', _children: states },
    },
  };
}

const cell = (sheet, state, key) => sheet.rows.find((row) => row.state === state).cells.find((c) => c.size.key === key);
const frameOf = (c, name) => c.parts.find(([n]) => n === name)[1]._children.Layout;

test('five sizes: current, half, double, and stretched each way', () => {
  assert.deepEqual(contactSheetSizes(100, 60).map((s) => [s.key, s.width, s.height]), [
    ['current', 100, 60], ['half', 50, 30], ['double', 200, 120], ['wide', 200, 60], ['tall', 100, 120],
  ]);
  assert.deepEqual(contactSheetSizes(1, 1)[1], { key: 'half', label: 'Half', width: 1, height: 1 }, 'never zero');
});

test('resizing for a cell never touches the control itself', () => {
  const control = component();
  const sized = controlAtSize(control, 300, 10);
  assert.equal(sized._children.Transform.width, 300);
  assert.equal(control._children.Transform.width, 100);
});

test('a row per state, base first, each with every size', () => {
  const sheet = buildContactSheet(component({
    parts: { plate: part({ x: 0, y: 0, width: 100, height: 60 }) },
    states: { hover: { _type: 'State', patches: { parts: { plate: { opacity: 0.5 } } } } },
  }), ['hover']);
  assert.deepEqual(sheet.rows.map((row) => row.state), ['base', 'hover']);
  assert.equal(sheet.rows[0].cells.length, 5);
  assert.equal(cell(sheet, 'hover', 'half').parts[0][1].opacity, 0.5, 'the state\'s patches are applied in every cell');
  assert.equal(cell(sheet, 'base', 'half').parts[0][1].opacity, undefined);
});

test('a pixel-sized part that fits now and hangs out at half size is reported', () => {
  const sheet = buildContactSheet(component({
    parts: {
      fill: part({ x: 0, y: 0, width: 100, height: 100, widthUnit: 'percent', heightUnit: 'percent' }),
      badge: part({ x: 60, y: 10, width: 30, height: 20 }),
    },
  }));
  assert.deepEqual(cell(sheet, 'base', 'current').issues, []);
  assert.deepEqual(cell(sheet, 'base', 'half').issues.map((i) => [i.kind, i.parts]), [['spills', ['badge']]]);
  assert.deepEqual(cell(sheet, 'base', 'double').issues, [], 'at double size it still fits');
  assert.equal(sheet.issueCount, 1, 'wide and tall keep it inside too');
});

test('two parts anchored to opposite edges collide when the component narrows', () => {
  const sheet = buildContactSheet(component({
    width: 120,
    parts: {
      pointer: part({ x: 0, y: 20, width: 50, height: 20 }),
      legend: part({ x: 100, y: 20, width: 50, height: 20, xUnit: 'percent', anchorX: 'right' }),
    },
  }));
  assert.deepEqual(cell(sheet, 'base', 'current').issues, []);
  const half = cell(sheet, 'base', 'half').issues;
  assert.ok(half.some((i) => i.kind === 'collides' && i.message === 'pointer now overlaps legend'), JSON.stringify(half));
  assert.deepEqual(cell(sheet, 'base', 'wide').issues, [], 'wider, they are further apart');
});

test('what was already so at the current size is not reported', () => {
  const sheet = buildContactSheet(component({
    parts: {
      shadow: part({ x: -4, y: -4, width: 108, height: 68 }),       // hangs out on purpose
      a: part({ x: 10, y: 10, width: 40, height: 40 }),
      b: part({ x: 30, y: 10, width: 40, height: 40 }),             // overlaps a on purpose
    },
  }));
  for (const row of sheet.rows) {
    for (const c of row.cells) {
      assert.ok(!c.issues.some((i) => i.parts.includes('shadow') && i.kind === 'spills'), `${c.key}: ${JSON.stringify(c.issues)}`);
      assert.ok(!c.issues.some((i) => i.kind === 'collides' && i.parts.includes('a') && i.parts.includes('b')), c.key);
    }
  }
});

test('a state that moves a part on purpose is judged against itself, not against base', () => {
  const sheet = buildContactSheet(component({
    parts: { dot: part({ x: 10, y: 10, width: 10, height: 10 }) },
    states: { pressed: { _type: 'State', patches: { parts: { dot: { 'Layout.x': 120 } } } } },
  }), ['pressed']);
  assert.deepEqual(cell(sheet, 'pressed', 'current').issues, []);
  assert.deepEqual(cell(sheet, 'pressed', 'double').issues, [], 'it was already outside in this state');
});

test('a rotated or scaled part is left out of the checks rather than judged wrongly', () => {
  const issues = layoutIssues(
    [['r', part({ x: 0, y: 0, width: 50, height: 50, rotation: 45 })]], { width: 100, height: 100 },
    [['r', part({ x: 0, y: 0, width: 50, height: 50, rotation: 45 })]], { width: 20, height: 20 },
  );
  assert.deepEqual(issues, []);
});

test('a scaleInternals component is drawn scaled, as the canvas draws it, and so does not spill', () => {
  const control = component({
    transform: { contentScaleMode: 'scaleInternals' },
    designer: { designWidth: 100, designHeight: 60 },
    parts: { badge: part({ x: 60, y: 10, width: 30, height: 20 }) },
  });
  const sheet = buildContactSheet(control);
  const half = cell(sheet, 'base', 'half');
  assert.equal(frameOf(half, 'badge').width, 15, 'px internals follow the size');
  assert.deepEqual(half.issues, []);
});

test('one scale for the whole sheet keeps the cells in true proportion to each other', () => {
  const sizes = contactSheetSizes(100, 60);
  assert.equal(contactSheetScale(sizes, 180, 130), 0.9);
  assert.equal(contactSheetScale(contactSheetSizes(20, 10)), 1, 'never enlarged');
});
