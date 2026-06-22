import test from 'node:test';
import assert from 'node:assert/strict';

import {
  customHitZoneRect,
  resolveCustomHitZoneAtPoint,
} from '../src/CE_Application/utils/customComponentInteraction.js';
import { createHitZone } from '../src/CE_Application/utils/customComponentFactory.js';

const RECT = { left: 0, top: 0, width: 200, height: 100 };

function partWith(layout) {
  return { _children: { Layout: { mode: 'absolute', anchorX: 'center', anchorY: 'center', ...layout } } };
}

// A 20x20 px handle centered at 50%,50% of a 200x100 control => box (90,40,20,20).
const HANDLE_PARTS = {
  handle: partWith({
    x: 50, y: 50, xUnit: 'percent', yUnit: 'percent',
    width: 20, height: 20, widthUnit: 'px', heightUnit: 'px',
  }),
};

test('createHitZone defaults are backward compatible (independent)', () => {
  const zone = createHitZone('z');
  assert.equal(zone.source, 'independent');
  assert.deepEqual(zone.inflate, { x: 0, y: 0, unit: 'px' });
  assert.equal(zone.minTouch, 0);
  // Independent zones still resolve from authored bounds.
  const rect = customHitZoneRect(zone, RECT);
  assert.deepEqual(rect, { x: 0, y: 0, width: 200, height: 100 });
});

test('source:face tracks the whole control rect', () => {
  const rect = customHitZoneRect({ source: 'face' }, RECT);
  assert.deepEqual(rect, { x: 0, y: 0, width: 200, height: 100 });
});

test('source:part follows the part layout', () => {
  const rect = customHitZoneRect({ source: 'part:handle' }, RECT, HANDLE_PARTS);
  assert.deepEqual(rect, { x: 90, y: 40, width: 20, height: 20 });
});

test('inflate grows the grab area symmetrically (px)', () => {
  const rect = customHitZoneRect(
    { source: 'part:handle', inflate: { x: 10, y: 10, unit: 'px' } },
    RECT,
    HANDLE_PARTS
  );
  assert.deepEqual(rect, { x: 80, y: 30, width: 40, height: 40 });
});

test('minTouch enforces a finger-friendly minimum, centered', () => {
  const rect = customHitZoneRect({ source: 'part:handle', minTouch: 44 }, RECT, HANDLE_PARTS);
  assert.deepEqual(rect, { x: 78, y: 28, width: 44, height: 44 });
});

test('unresolvable part source falls back to authored bounds', () => {
  const zone = { source: 'part:missing', bounds: { x: 0, y: 0, width: 50, height: 50, unit: 'percent' } };
  const rect = customHitZoneRect(zone, RECT, HANDLE_PARTS);
  assert.deepEqual(rect, { x: 0, y: 0, width: 100, height: 50 });
});

test('face zone is hit anywhere on the control; tiny handle would miss', () => {
  const control = {
    _children: {
      Parts: { _children: HANDLE_PARTS },
      HitZones: {
        _children: {
          face: { name: 'face', enabled: true, source: 'face', action: 'dragValue' },
        },
      },
    },
  };
  // A corner point far from the 20px handle still hits the face zone.
  const hit = resolveCustomHitZoneAtPoint(control, RECT, 5, 5);
  assert.ok(hit, 'expected a hit on the face zone');
  assert.equal(hit.name, 'face');
});

test('priority + follow-mode: smaller handle zone wins over face overlap', () => {
  const control = {
    _children: {
      Parts: { _children: HANDLE_PARTS },
      HitZones: {
        _children: {
          face: { name: 'face', enabled: true, source: 'face', priority: 0, action: 'dragValue' },
          handle: { name: 'handle', enabled: true, source: 'part:handle', minTouch: 44, priority: 10, action: 'dragValue' },
        },
      },
    },
  };
  // Point inside the handle's resolved 44px grab area (centered at 100,50).
  const hit = resolveCustomHitZoneAtPoint(control, RECT, 100, 50);
  assert.equal(hit.name, 'handle');
});
