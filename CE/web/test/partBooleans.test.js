// partBooleans.test.js — Unite / Subtract / Intersect / Exclude and Smooth for component parts, with
// Paper.js as the geometry engine. browser-checks/partBooleans.mjs drives the same in the designer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import { createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';
import {
  applyPartPatch, loadPaper, partOutline, partsAfterBoolean, planPartBoolean, planPathSmooth, whyNotCombinable,
} from '../src/CE_Application/utils/partBooleans.js';
import { hasCompoundPath } from '../src/CE_Application/utils/penPath.js';
import InteractivePartRenderer from '../src/CE_Application/editor/InteractivePartRenderer.svelte';

const px = (x, y, width, height, extra = {}) => ({
  x, y, width, height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', ...extra,
});
const part = (name, kind, zIndex, layout, extra = {}) => createPartNode(name, { kind, zIndex, layout, ...extra });
const ARTBOARD = { artboardWidth: 400, artboardHeight: 400 };

function scene(extraParts = {}, extraSections = {}) {
  const box = part('box', 'rectangle', 1, px(0, 0, 100, 100));
  const dot = part('dot', 'circle', 2, px(30, 30, 40, 40));
  const control = { _children: { Parts: { _children: { box, dot, ...extraParts } }, ...extraSections } };
  return { control, box, dot };
}
const entries = (...parts) => parts.map((p) => [p.name, p, p]);
const areaOf = async (patch) => {
  const scope = await loadPaper();
  const item = new scope.CompoundPath({ pathData: patch['meta.pathData'], insert: false });
  return Math.abs(item.area) * patch['Layout.width'] * patch['Layout.height'];
};

test('each operation makes the shape it names', async () => {
  const { control, box, dot } = scene();
  const circle = Math.PI * 20 * 20;
  const expected = { unite: 10000, subtract: 10000 - circle, intersect: circle, exclude: 10000 - circle };
  for (const [operation, area] of Object.entries(expected)) {
    const plan = await planPartBoolean(control, entries(box, dot), operation, ARTBOARD);
    assert.equal(plan.ok, true, operation);
    assert.ok(Math.abs(await areaOf(plan.patch) - area) < 5, `${operation}: ${await areaOf(plan.patch)} against ${area}`);
  }
});

test('the result keeps the front shape — or for subtract the back one — and removes the rest', async () => {
  const { control, box, dot } = scene();
  const subtract = await planPartBoolean(control, entries(dot, box), 'subtract', ARTBOARD);
  assert.deepEqual([subtract.keep, subtract.remove], ['box', ['dot']], 'cut from the back one, whatever the selection order');
  const unite = await planPartBoolean(control, entries(box, dot), 'unite', ARTBOARD);
  assert.deepEqual([unite.keep, unite.remove], ['dot', ['box']]);
  const patch = subtract.patch;
  assert.deepEqual([patch.kind, patch['Layout.x'], patch['Layout.y'], patch['Layout.width'], patch['Layout.height'], patch['meta.closed']], ['path', 0, 0, 100, 100, true]);
  assert.equal((patch['meta.pathData'].match(/M/g) ?? []).length, 2, 'an outline and a hole');

  const next = partsAfterBoolean(control._children.Parts._children, subtract);
  assert.deepEqual(Object.keys(next), ['box']);
  assert.ok(hasCompoundPath(next.box));
  assert.equal(next.box.meta.vectorPoints, undefined);
  assert.equal(next.box._children.Background, control._children.Parts._children.box._children.Background, 'its own style, untouched');
});

test('a turned and scaled part combines as it is drawn', async () => {
  const scope = await loadPaper();
  const turned = part('turned', 'rectangle', 1, px(0, 0, 100, 20, { rotation: 90, scale: 1 }));
  const bounds = partOutline(scope, turned, 400, 400).bounds;
  assert.deepEqual([bounds.x, bounds.y, bounds.width, bounds.height].map(Math.round), [40, -40, 20, 100]);
  const grown = part('grown', 'circle', 1, px(0, 0, 40, 40, { scale: 2 }));
  assert.ok(Math.abs(Math.abs(partOutline(scope, grown, 400, 400).area) - Math.PI * 40 * 40) < 5);
  const stadium = part('pill', 'capsule', 1, px(0, 0, 100, 40));
  assert.ok(Math.abs(Math.abs(partOutline(scope, stadium, 400, 400).area) - (60 * 40 + Math.PI * 400)) < 5, 'a capsule is the stadium the renderer draws');
});

test('what has no outline, or whose style the result could not draw, is refused by name', async () => {
  const { control, box, dot } = scene();
  const text = part('label', 'rectangle', 3, px(0, 0, 50, 20), { sections: { Text: { _type: 'Text', content: 'X' } } });
  const arc = part('arc', 'arcTrack', 3, px(0, 0, 50, 50));
  const open = part('line', 'path', 3, px(0, 0, 50, 50), { meta: { vectorPoints: [[0, 0], [1, 1]], closed: false } });
  assert.match(whyNotCombinable(text), /text/);
  assert.match(whyNotCombinable(arc), /no outline/);
  assert.match(whyNotCombinable(open), /open path/);
  const gradient = part('shade', 'rectangle', 9, px(0, 0, 50, 50), { sections: { Background: { _type: 'Background', _children: { Fill: { gradientEnabled: true } } } } });
  assert.equal(whyNotCombinable(gradient), '', 'as an operand it only lends its outline');
  assert.match(whyNotCombinable(gradient, { styled: true }), /gradient/, 'as the result it would lose its gradient');
  const plan = await planPartBoolean(control, entries(box, dot, gradient), 'unite', ARTBOARD);
  assert.deepEqual(plan.refused.map((entry) => entry.name), ['shade']);
  const empty = await planPartBoolean(control, entries(box, part('far', 'rectangle', 3, px(200, 200, 10, 10))), 'intersect', ARTBOARD);
  assert.match(empty.refused[0].reason, /do not overlap/);
});

test('a part something else refers to is not removed', async () => {
  const { control, box, dot } = scene({}, {
    HitZones: { _children: { knob: { source: 'part:dot' } } },
    Bindings: { _children: { spin: { target: 'Parts.dot.Layout.rotation' } } },
  });
  const plan = await planPartBoolean(control, entries(box, dot), 'subtract', ARTBOARD);
  assert.equal(plan.ok, false);
  assert.match(plan.refused[0].reason, /hit zone knob, binding spin/);
  // The kept part may be referred to: it keeps its name.
  assert.equal((await planPartBoolean(control, entries(box, dot), 'unite', ARTBOARD)).ok, true);
});

test('Smooth turns a Pen path into a curve through the same points', async () => {
  const pen = part('pen', 'path', 1, px(0, 0, 100, 50), { meta: { vectorPoints: [[0, 1], [0.5, 0], [1, 1]], closed: true } });
  const plan = await planPathSmooth(pen, ARTBOARD);
  assert.equal(plan.ok, true);
  assert.match(plan.patch['meta.pathData'], /c/);
  const smoothed = applyPartPatch(pen, plan.patch);
  assert.ok(hasCompoundPath(smoothed));
  assert.equal(smoothed.meta.vectorPoints, undefined);
  assert.equal((await planPathSmooth(part('box', 'rectangle', 1, px(0, 0, 10, 10)), ARTBOARD)).ok, false);
});

test('the renderer draws the compound form as one even-odd path, scaled into the box', () => {
  const shape = part('ring', 'path', 1, px(0, 0, 100, 100), {
    meta: { pathData: 'M0,0h1v1h-1zM0.25,0.25h0.5v0.5h-0.5z', closed: true },
    sections: { Background: { _type: 'Background', _children: { Fill: { solidEnabled: true, colour: 'FFE0443A' }, Border: { enabled: false } } } },
  });
  const html = render(InteractivePartRenderer, { props: { part: shape, partName: 'ring', parentWidth: 100, parentHeight: 100 } }).body;
  assert.match(html, /<path d="M0,0h1v1h-1zM0\.25,0\.25h0\.5v0\.5h-0\.5z"/);
  assert.match(html, /fill-rule="evenodd"/);
  assert.match(html, /transform="translate\(0 0\) scale\(100 100\)"/);
});
