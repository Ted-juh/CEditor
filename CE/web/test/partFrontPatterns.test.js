// partFrontPatterns.test.js — a part's patterns placed in front of its content (step 3 left them
// out: behind worked, through the part's BackgroundRenderer; in front drew nothing).

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import { createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';
import { addPatternPatch } from '../src/CE_Application/utils/patternLayers.js';
import InteractivePartRenderer from '../src/CE_Application/editor/InteractivePartRenderer.svelte';

function partWithPattern(place) {
  const part = createPartNode('label', 'Title');
  part._children.Text = { ...(part._children.Text ?? {}), _type: 'Text', content: 'Cutoff' };
  const background = part._children.Background ?? { _type: 'Background', _children: {} };
  const { patch } = addPatternPatch(background, 'Background', { place, src: 'builtin:sine', speed: 0 });
  background._children = { ...(background._children ?? {}), Patterns: patch['Background.Patterns'] };
  part._children.Background = background;
  return part;
}
const draw = (part) => render(InteractivePartRenderer, { props: { part, partName: 'title', parentWidth: 200, parentHeight: 80 } }).body;

test('a part\'s pattern in front is drawn after its content, clipped to the part\'s shape', () => {
  const square = draw(partWithPattern('front'));
  const front = square.indexOf('data-place="front"');
  assert.ok(front > 0, 'drawn');
  assert.ok(front > square.indexOf('Cutoff'), 'after its words, so over them');
  assert.doesNotMatch(square, /data-place="behind"/, 'and not behind as well');
  // Square, the layer's own box is the part's (it hides what spills); rounded, it is rounded too.
  const rounded = partWithPattern('front');
  rounded._children.Background._children.Corners = { _type: 'Corners', linked: true, radius: 12, style: 'rounded' };
  const html = draw(rounded);
  const at = html.indexOf('data-place="front"');
  assert.match(html.slice(at, at + 200), /style="[^"]*border-radius: 12px 12px 12px 12px/, 'its corners');
});

test('a part\'s pattern behind is still drawn behind, and nothing in front', () => {
  const html = draw(partWithPattern('behind'));
  assert.ok(html.indexOf('data-place="behind"') > 0);
  assert.ok(html.indexOf('data-place="behind"') < html.indexOf('Cutoff'), 'before its words');
  assert.doesNotMatch(html, /data-place="front"/);
});
