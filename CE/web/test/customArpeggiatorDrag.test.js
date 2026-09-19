import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeArpeggiatorEdit as edit } from '../src/CE_Application/utils/customComponentArpeggiator.js';

const original = { id: 'note', step: 3, note: 65, length: 4, velocity: 80 };
const pattern = { enabled: true, stepCount: 16, viewNote: 60, blocks: [original] };
const control = { _children: { Transform: { width: 640, height: 272 }, Designer: { arpeggiator: pattern } } };
const startValues = { __arpeggiator: pattern };
const rect = { left: 30, top: 40, width: 640, height: 272 };
const stepWidth = (640 - 52) / 16;
function drag(action, dx = 0, dy = 0, values = startValues, scale = 1, fine = false) {
  return edit(control, values, { action: `arpeggiator${action}`, payload: { blockId: 'note' } }, {
    rect: { ...rect, width: rect.width * scale, height: rect.height * scale },
    startClientX: 230, startClientY: 180,
    clientX: 230 + dx * scale, clientY: 180 + dy * scale, startValues, fine,
  });
}

test('all three note gestures select without changing anything on pointer down', () => {
  for (const action of ['Move', 'Velocity', 'Resize']) {
    const result = drag(action);
    assert.equal(result.selectedBlock, 'note');
    assert.deepEqual(result.blocks[0], original);
  }
});
test('middle third adjusts velocity only, even across other notes and columns', () => {
  assert.deepEqual(drag('Velocity', 300, -60).blocks[0], { ...original, velocity: 110 });
  assert.equal(drag('Velocity', 0, -800).blocks[0].velocity, 127);
  assert.equal(drag('Velocity', 0, 800).blocks[0].velocity, 1);
  assert.equal(drag('Velocity', 0, -24, startValues, 1, true).blocks[0].velocity, 83);
});
test('right third resizes from original length, preserving pitch, start and velocity', () => {
  assert.deepEqual(drag('Resize', stepWidth * 2, 150).blocks[0], { ...original, length: 6 });
  assert.equal(drag('Resize', -2000).blocks[0].length, 1);
  assert.equal(drag('Resize', 2000).blocks[0].length, 13);
});
test('left third moves without changing velocity or truncating duration at the edge', () => {
  assert.deepEqual(drag('Move', stepWidth * 2, -40).blocks[0], { ...original, step: 5, note: 67 });
  assert.deepEqual(drag('Move', 2000).blocks[0], { ...original, step: 12 });
  assert.equal(drag('Move', -2000).blocks[0].step, 0);
});
test('drag updates do not accumulate and respect display scaling', () => {
  for (const action of ['Move', 'Velocity', 'Resize']) {
    const first = drag(action, stepWidth, -20);
    const repeated = drag(action, stepWidth, -20, { __arpeggiator: first });
    assert.deepEqual(repeated, first);
    assert.deepEqual(drag(action, stepWidth, -20, startValues, 0.5), first);
    assert.deepEqual(drag(action, 0, 0, { __arpeggiator: first }).blocks[0], original);
  }
});
