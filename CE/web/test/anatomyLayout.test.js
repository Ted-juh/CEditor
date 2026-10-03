// anatomyLayout.test.js — a button's or switch's anatomy form reads at the sizes people give it
// (utils/anatomyLayout.js). The browser check anatomyForms.mjs measures the drawing; these pin
// the arithmetic.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buttonAnatomyLayout } from '../src/CE_Application/utils/anatomyLayout.js';

const scaleOf = (layout) => Number(layout.device.match(/scale\(([\d.]+)\)/)[1]);
const offsetOf = (layout) => layout.device.match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);

test('a box the frame reads in keeps the frame, exactly as it was drawn', () => {
  for (const [w, h] of [[160, 100], [170, 106], [124, 84], [320, 200]]) {
    assert.equal(buttonAnatomyLayout(w, h, 'TRIGGER'), null, `${w}x${h}`);
  }
  assert.equal(buttonAnatomyLayout(0, 40, 'X'), null, 'no box, no layout');
});

test('the usual button sets its caption beside the device, at a size that reads, inside the box', () => {
  const layout = buttonAnatomyLayout(132, 40, 'TRIGGER');
  assert.equal(layout.caption.anchor, 'start');
  assert.equal(layout.caption.size, 12, 'the frame had it at 4.4px');
  assert.ok(scaleOf(layout) >= 0.4, 'and the device is no smaller than the frame drew it');
  const [x, y] = offsetOf(layout);
  assert.ok(x >= 0 && y >= 0);
  assert.ok(x + 160 * scaleOf(layout) <= layout.caption.x, 'the caption is after the device');
  assert.ok(layout.caption.x + 7 * 0.68 * 12 <= 132, 'and ends inside the box');
});

test('a narrow box sets its caption under the device, centred', () => {
  const layout = buttonAnatomyLayout(64, 64, 'LEGATO');
  assert.equal(layout.caption.anchor, 'middle');
  assert.equal(layout.caption.x, 32);
  assert.ok(layout.caption.size >= 8);
  const [, y] = offsetOf(layout);
  assert.ok(y + 80 * scaleOf(layout) <= layout.caption.y - layout.caption.size * 0.8, 'the device is above the caption');
  assert.ok(layout.caption.y <= 64);
});

test('a caption too long for the room is set smaller, then cut; an empty one leaves the device the box', () => {
  const long = buttonAnatomyLayout(132, 40, 'A CAPTION FAR TOO LONG FOR A BUTTON');
  assert.ok(long.caption.size >= 8);
  assert.ok(long.caption.text.endsWith('…'));
  assert.ok(scaleOf(long) > 0, 'the device is still drawn');
  const bare = buttonAnatomyLayout(132, 40, '  ');
  assert.equal(bare.caption, null);
  assert.equal(scaleOf(bare), 0.5, 'the device fills the box\'s height');
});

test('letter spacing counts against the room', () => {
  const plain = buttonAnatomyLayout(100, 36, 'RESONANCE');
  const spaced = buttonAnatomyLayout(100, 36, 'RESONANCE', { letterSpacing: 2 });
  assert.ok(spaced.caption.size < plain.caption.size || spaced.caption.text !== plain.caption.text);
});
