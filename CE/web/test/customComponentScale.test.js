import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCustomInternalScale,
  customInternalScale,
} from '../src/CE_Application/utils/customComponentScale.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';

function makeControl({ mode = 'scaleInternals', width = 400, height = 240, designWidth = 200, designHeight = 120, parts = {}, zones = {} } = {}) {
  return {
    _children: {
      Core: { _type: 'Core', id: 'c1', controlType: 'CustomComponent' },
      Transform: { _type: 'Transform', width, height, contentScaleMode: mode },
      Designer: { _type: 'Designer', designWidth, designHeight },
      Parts: { _type: 'Parts', _children: parts },
      HitZones: { _type: 'HitZones', _children: zones },
    },
  };
}

function pxPart(overrides = {}, layout = {}) {
  return {
    _type: 'Part',
    name: 'p',
    _children: {
      Layout: {
        x: 10, y: 20, width: 40, height: 30,
        xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px',
        offsetX: 4, offsetY: 2,
        ...layout,
      },
      ...overrides,
    },
  };
}

test('customInternalScale computes sx/sy from the stamped design size', () => {
  const scale = customInternalScale(makeControl());
  assert.equal(scale.sx, 2);
  assert.equal(scale.sy, 2);
  assert.equal(customInternalScale(makeControl({ mode: 'stretch' })), null);
  assert.equal(customInternalScale(makeControl({ designWidth: 0 })), null);
  // ~1x scale is a no-op
  assert.equal(customInternalScale(makeControl({ width: 200, height: 120 })), null);
});

test('px layout, border, font, and radius scale; percent units do not', () => {
  const control = makeControl({
    parts: {
      knob: pxPart({
        Background: { _children: { Border: { thickness: 2 }, Corners: { radius: 8 } } },
        Text: { _children: { Font: { size: 10 } } },
      }),
      label: {
        _type: 'Part',
        _children: { Layout: { x: 50, y: 10, xUnit: 'percent', yUnit: 'percent', width: 60, height: 14, widthUnit: 'px', heightUnit: 'px', offsetX: 0, offsetY: 0 } },
      },
    },
  });
  assert.equal(applyCustomInternalScale(control), true);
  const knob = control._children.Parts._children.knob._children.Layout;
  assert.deepEqual([knob.x, knob.y, knob.width, knob.height, knob.offsetX, knob.offsetY], [20, 40, 80, 60, 8, 4]);
  assert.equal(control._children.Parts._children.knob._children.Background._children.Border.thickness, 4);
  assert.equal(control._children.Parts._children.knob._children.Background._children.Corners.radius, 16);
  assert.equal(control._children.Parts._children.knob._children.Text._children.Font.size, 20);
  const label = control._children.Parts._children.label._children.Layout;
  assert.equal(label.x, 50); // percent stays
  assert.equal(label.width, 120); // px scales
});

test('pinned parts keep size/font but track position', () => {
  const control = makeControl({
    parts: {
      badge: pxPart({ Text: { _children: { Font: { size: 10 } } } }, { pinned: true }),
    },
  });
  applyCustomInternalScale(control);
  const layout = control._children.Parts._children.badge._children.Layout;
  assert.equal(layout.x, 20); // position scaled
  assert.equal(layout.width, 40); // size pinned
  assert.equal(control._children.Parts._children.badge._children.Text._children.Font.size, 10);
});

test('px zone bounds and inflate scale; the fully-rounded radius sentinel does not', () => {
  const control = makeControl({
    parts: {
      pill: pxPart({ Background: { _children: { Corners: { radius: 999 } } } }),
    },
    zones: {
      grab: { bounds: { x: 10, y: 10, width: 30, height: 20, unit: 'px' }, inflate: { x: 6, y: 6, unit: 'px' }, minTouch: 44 },
      face: { bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' } },
    },
  });
  applyCustomInternalScale(control);
  assert.equal(control._children.Parts._children.pill._children.Background._children.Corners.radius, 999);
  const grab = control._children.HitZones._children.grab;
  assert.deepEqual([grab.bounds.x, grab.bounds.width], [20, 60]);
  assert.equal(grab.inflate.x, 12);
  assert.equal(grab.minTouch, 44); // finger-size floor, never scaled
  assert.equal(control._children.HitZones._children.face.bounds.width, 100);
});

test('resolveInteractiveControl applies the policy on the resolved tree', () => {
  const control = makeControl({ parts: { knob: pxPart() } });
  const resolved = resolveInteractiveControl(control, {});
  assert.equal(resolved.control._children.Parts._children.knob._children.Layout.width, 80);
  // The source control is untouched.
  assert.equal(control._children.Parts._children.knob._children.Layout.width, 40);

  const stretch = resolveInteractiveControl(makeControl({ mode: 'stretch', parts: { knob: pxPart() } }), {});
  assert.equal(stretch.control._children.Parts._children.knob._children.Layout.width, 40);
});
