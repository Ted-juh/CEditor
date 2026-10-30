import test from 'node:test';
import assert from 'node:assert/strict';
import { linkTogglePatch } from '../src/CE_Application/utils/borderLinkCascade.js';

test('unlink patches preserve each selected control\'s own linked corners', () => {
  const pill = linkTogglePatch({ linked: true, thickness: 2 }, { linked: true, radius: 20 }, false);
  const toggle = linkTogglePatch({ linked: true, thickness: 1 }, { linked: true, radius: 8 }, false);

  for (const key of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']) {
    assert.equal(pill[`Background.Corners.${key}.radius`], 20);
    assert.equal(toggle[`Background.Corners.${key}.radius`], 8);
  }
  assert.equal(pill['Background.Border.top.thickness'], 2);
  assert.equal(toggle['Background.Border.top.thickness'], 1);
  assert.equal(pill['Background.Corners.linked'], false);
  assert.equal(toggle['Background.Corners.linked'], false);
});

// Clicking a lit side of a linked border switched the border off and left the rounded corners
// drawn: each corner's arc has its own switch. The owner had to click every corner as well, on
// 22 sections. Switching the linked border from a side now switches the corners with it.
test('the corner switches that go with a linked border reach every corner, linked or not', async () => {
  const { cornerBorderSwitchProps } = await import('../src/CE_Application/utils/borderLinkCascade.js');
  const { normalizeCorner } = await import('../src/CE_Application/utils/cornerNormalization.js');
  const switchAll = (corners, on) => {
    for (const prop of cornerBorderSwitchProps()) {
      const [first, second] = prop.split('.');
      if (second) corners[first] = { ...(corners[first] ?? {}), [second]: on };
      else corners[first] = on;
    }
    return corners;
  };
  for (const corners of [{ radius: 6 }, { linked: false, topLeft: { radius: 6 }, bottomRight: { radius: 3 } }]) {
    switchAll(corners, false);
    for (const pos of ['tl', 'tr', 'bl', 'br']) assert.equal(normalizeCorner(corners, pos).borderEnabled, false, `${pos} off`);
    switchAll(corners, true);
    for (const pos of ['tl', 'tr', 'bl', 'br']) assert.equal(normalizeCorner(corners, pos).borderEnabled, true, `${pos} on`);
  }
});
