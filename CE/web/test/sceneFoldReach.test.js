// sceneFoldReach.test.js — a control a scene moves covers everywhere it goes (sceneFormat.js
// sceneMoveReach), so a still control it slides under is not folded into the ground beneath it
// (sceneryModel.js planSceneryFold). Found building the Film Festival: The Shining's doors slide
// behind the walls either side of the doorway, and the walls — inert Labels, after the doors in the
// document, but clear of the doors' boxes — were folded into the ground and drawn under them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { sceneMoveReach } from '../src/CE_Application/utils/sceneFormat.js';
import { planSceneryFold } from '../src/CE_Application/utils/sceneryModel.js';
import { buildSceneryRenderPlan } from '../src/CE_Application/utils/sceneryRenderPlan.js';

function label(id, x, y, w, h) {
  const control = createControl('Label', { Transform: { x, y, width: w, height: h }, Text: { content: '' } });
  control._children.Core.id = id;
  control._children.Core.name = id;
  return control;
}
const slide = (controlId, frames, extra = {}) => ({ id: `c_${controlId}`, controlId, target: 'Transform', start: 0, length: 1000, effect: { kind: 'keyframes', frames, ...extra } });

test('how far a scene moves a control: its travel each way, its largest scale, and whether it turns', () => {
  const reach = sceneMoveReach([{ id: 's', clips: [
    slide('door', [{ at: 0, x: 0 }, { at: 1, x: -154, y: 6 }]),
    slide('door', [{ at: 0, scale: 1 }, { at: 1, scale: 1.4 }]),
    slide('dial', [{ at: 0, rotate: 0 }, { at: 1, rotate: 360 }]),
    slide('tilt', [{ at: 0, rotate: -8 }, { at: 1, rotate: 8 }]),
    { id: 'words', controlId: 'sign', target: 'Text', start: 0, length: 900, effect: { kind: 'text', effect: 'roll', way: 'in' } },
    { id: 'value', controlId: 'knob', target: 'Value', start: 0, length: 900, effect: { kind: 'value', frames: [] } },
  ] }]);
  assert.deepEqual(reach.get('door'), { left: 154, right: 0, up: 0, down: 6, scale: 1.4, turns: false });
  assert.equal(reach.get('dial').turns, true, 'a full turn ends where it began, but on the way it leaves its box');
  assert.equal(reach.get('tilt').turns, true, 'a tilt too');
  assert.equal(reach.has('sign'), false, 'words move inside their own box');
  assert.equal(reach.has('knob'), false, 'what a value draws stays in its control');
});

test('a wall the door slides under stays live, over it, as the document has it', () => {
  const door = label('door', 206, 66, 154, 278);
  const wall = label('wall', 0, 0, 206, 405);
  const apart = label('apart', 600, 0, 100, 40);
  const neverFold = new Set(['door']);
  const still = planSceneryFold([door, wall, apart], neverFold);
  assert.deepEqual(still.ground.map((c) => c._children.Core.id), ['wall', 'apart'], 'clear of the door\'s box, the wall folds: under the door');
  const moves = sceneMoveReach([{ id: 's', clips: [slide('door', [{ at: 0, x: 0 }, { at: 1, x: -154 }])] }]);
  const moving = planSceneryFold([door, wall, apart], neverFold, moves);
  assert.deepEqual(moving.live.map((c) => c._children.Core.id), ['door', 'wall'], 'where the door goes, the wall is over it');
  assert.deepEqual(moving.ground.map((c) => c._children.Core.id), ['apart'], 'what it never reaches still folds');
  const grown = planSceneryFold([door, label('beside', 362, 66, 40, 40)], neverFold, sceneMoveReach([{ id: 's', clips: [slide('door', [{ at: 0, scale: 1 }, { at: 1, scale: 1.3 }])] }]));
  assert.deepEqual(grown.live.map((c) => c._children.Core.id), ['door', 'beside'], 'a door that grows reaches what is beside it');
});

test('the preview\'s paint plan keeps the wall over the door it slides under', () => {
  const door = label('door', 206, 66, 154, 278);
  const wall = label('wall', 0, 0, 206, 405);
  const panel = { width: 720, height: 405, controls: [door, wall], layers: [] };
  const neverFold = new Set(['door']);
  const kinds = (plan) => plan.items.map((item) => (item.type === 'ground' ? `ground:${item.controls.map((c) => c._children.Core.id).join('+')}` : item.control._children.Core.id));
  assert.deepEqual(kinds(buildSceneryRenderPlan(panel, { preview: true, fold: true, neverFold })), ['ground:wall', 'door']);
  const moves = sceneMoveReach([{ id: 's', clips: [slide('door', [{ at: 0, x: 0 }, { at: 1, x: -154 }])] }]);
  assert.deepEqual(kinds(buildSceneryRenderPlan(panel, { preview: true, fold: true, neverFold, moves })), ['door', 'wall']);
});
