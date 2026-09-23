// sceneryNested.test.js — a container folds its own inert children.
//
// The surface folds a panel's captions and frames into one ground, but only at the top level. A
// panel built from real sections put nearly all of them inside containers, where that fold never
// looked, and the GAIA's baked ground fell from 107 controls to 1. A container now folds its own
// children into a ground drawn inside it: above its own background, below its live children.
//
// Rendered server-side, where SceneryGround draws its scenery as controls rather than baking it —
// so the structure is visible here: which children went into the ground and which stayed live.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

function section(children) {
  const container = createControl('Container', {
    Core: { id: 'lfo', name: 'tone1_lfo' },
    Transform: { x: 0, y: 0, width: 300, height: 200 },
  });
  container._children.Children = {
    _children: Object.fromEntries(children.map((c) => [c._children.Core.id, c])),
  };
  return container;
}

const caption = (id, x) => createControl('Label', {
  Core: { id, name: `${id}_label` },
  Transform: { x, y: 150, width: 40, height: 16 },
  Text: { content: id.toUpperCase() },
});
const knob = (id, x) => createControl('Knob', {
  Core: { id, name: id },
  Transform: { x, y: 40, width: 40, height: 40 },
});

/** The markup of the first `scenery-ground` element, from its opening tag to its matching close. */
function groundOf(body) {
  const at = body.indexOf('class="scenery-ground');
  if (at < 0) return '';
  const start = body.lastIndexOf('<div', at);
  const tags = /<(\/?)div\b[^>]*>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m = tags.exec(body); m; m = tags.exec(body)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return body.slice(start, tags.lastIndex);
  }
  return body.slice(start);
}

test('a container folds its captions and keeps its knobs live', () => {
  const control = section([knob('rate', 20), caption('rate_cap', 20), caption('depth_cap', 120)]);
  const { body } = render(CanvasControl, { props: { control, allControls: [control], panelControls: [control], editorInteractionEnabled: false } });

  assert.match(body, /class="scenery-ground/, 'the container drew no ground of its own');
  const ground = groundOf(body);
  assert.match(ground, /data-control-id="depth_cap"/, 'a caption nothing covers was not folded');
  assert.ok(!ground.includes('data-control-id="rate"'), 'the knob was folded into the ground');
  assert.ok(body.includes('data-control-id="rate"'), 'the knob was not drawn at all');
});

test('a container with a single child does not bother folding it', () => {
  const control = section([caption('only', 20)]);
  const { body } = render(CanvasControl, { props: { control, allControls: [control], panelControls: [control], editorInteractionEnabled: false } });
  assert.ok(!body.includes('class="scenery-ground'), 'a one-child ground costs more than the child');
});
