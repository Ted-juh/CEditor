// sceneryCompile.test.js — a whole layer of background shapes, drawn as one element.
//
// THE THING THAT MAKES THIS SAFE is not the compiler, it is the refusal list. A control folded into
// an image is a control that has stopped rendering itself, and if the compiler misunderstands even
// one of them the panel is quietly wrong in a way that looks like a design change nobody made. So
// most of this file is about what it declines to draw, by name.
//
// The one refusal that keeps getting re-litigated is TEXT, and it is worth being precise about why
// it is not a preference. The image is drawn through an `<img>`; an image document is isolated and
// cannot see the page's @font-face faces. A caption in a font loaded from the .cepanel therefore
// renders in a default face, silently. Declaring a layer scenery does not change that — which is
// why "declared conversion can allow text" is wrong, and why this file asserts the refusal rather
// than leaving it to a comment.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { createLayer } from '../src/CE_Application/utils/panelLayers.js';
import {
  SCENERY_KIND, classifySceneryControls, clearSceneryCache, compileScenery, isSceneryLayer,
  sceneryCacheSize, sceneryLayerIsCompiled, whyControlNotScenery,
} from '../src/CE_Application/utils/sceneryCompile.js';
import { buildSceneryRenderPlan } from '../src/CE_Application/utils/sceneryRenderPlan.js';

/**
 * A plain background box — the case the whole thing exists for.
 *
 * Border OFF, deliberately: the Background type ships with a 2px border enabled, so leaving it on
 * would put the border inset into every geometry assertion in this file and make each one about two
 * things at once. The border gets its own tests below.
 */
function box(id, overrides = {}) {
  const control = createControl('Background', {
    Core: { id, name: id, layer: 'Scenery', ...(overrides.Core ?? {}) },
    Transform: { x: 10, y: 20, width: 100, height: 50, ...(overrides.Transform ?? {}) },
  });
  control._children.Background._children.Border.enabled = false;
  return control;
}

const svgOf = (result) => Buffer.from(String(result.url).split(',')[1], 'base64').toString('utf8');
const rects = (svg) => [...svg.matchAll(/<rect [^>]*\/>/g)].map((m) => m[0]);

/* ------------------------------------------------------------------ what it draws */

test('a plain box folds, and its geometry survives', () => {
  const result = compileScenery([box('a')], 400, 300);
  assert.equal(result.folded, 1);
  assert.equal(result.live.length, 0);
  assert.match(svgOf(result), /<rect x="10" y="20" width="100" height="50"/);
});

test('the border is inset by half its thickness, because CSS draws it inside the box', () => {
  // The bug this pins: an SVG stroke straddles the path, so stroking the outline puts a pixel
  // outside the element on every side and a bordered box bakes one pixel larger than it renders.
  const control = box('b');
  Object.assign(control._children.Background._children.Border, { enabled: true, thickness: 4, colour: 'FFFFFFFF' });
  const svg = svgOf(compileScenery([control], 400, 300));
  assert.match(svg, /x="12" y="22" width="96" height="46"/, 'the stroked rect should be inset by thickness/2');
  assert.match(svg, /stroke-width="4"/);
});

test('a box with no border is not inset at all', () => {
  // The inset must not creep into the ordinary case — every scenery box would drift a pixel.
  assert.match(svgOf(compileScenery([box('c')], 400, 300)), /x="10" y="20"/);
});

test('children are drawn inside their parent, offset by the padding', () => {
  const parent = createControl('Container', {
    Core: { id: 'p', name: 'p', layer: 'Scenery' },
    Transform: { x: 100, y: 100, width: 200, height: 200 },
    Children: { padding: 8 },
  });
  const child = box('kid', { Transform: { x: 5, y: 5, width: 20, height: 20 } });
  parent._children.Children._children = { kid: child };

  const svg = svgOf(compileScenery([parent], 400, 400));
  assert.match(svg, /x="113" y="113" width="20" height="20"/, '100 + 8 padding + 5 own x');
});

test('an invisible control draws nothing but does not block the layer', () => {
  const hidden = box('h', { Core: { visible: false } });
  const result = compileScenery([hidden, box('v')], 400, 300);
  assert.equal(result.folded, 2, 'an invisible control is foldable — there is nothing to draw');
  assert.equal(rects(svgOf(result)).length, 1);
});

test('nothing foldable means nothing changes', () => {
  // The property that makes this safe to call unconditionally: a caller checks `url` and otherwise
  // renders exactly what it would have rendered.
  const knob = createControl('Range', { Core: { id: 'k', layer: 'Scenery' } });
  const result = compileScenery([knob], 400, 300);
  assert.equal(result.url, null);
  assert.equal(result.live.length, 1);
});

/* ------------------------------------------------------------------ what it refuses, by name */

test('every construct it does not fully understand is refused by name', () => {
  const withBackground = (mutate) => { const c = box('x'); mutate(c._children.Background._children); return c; };

  const cases = [
    ["carries text (an <img> cannot see the page's fonts)",
      () => createControl('Label', { Core: { id: 't', layer: 'Scenery' } })],
    ['has a Behavior section', () => {
      const c = box('b');
      c._children.Behavior = { _type: 'Behavior', family: 'range' };
      return c;
    }],
    ['effects are enabled', () => {
      const c = box('e');
      c._children.Effects._children.Bevel.enabled = true;
      return c;
    }],
    ['transform scale', () => box('s', { Transform: { scale: 1.5 } })],
    ['anchored to a parent edge', () => box('a', { Transform: { anchor: 'topRight' } })],
    ['image or overlay fill', () => withBackground((bg) => { bg.Fill.imageEnabled = true; })],
    ['per-side border', () => withBackground((bg) => Object.assign(bg.Border, { enabled: true, linked: false }))],
    ['border style "dashed"', () => withBackground((bg) => Object.assign(bg.Border, { enabled: true, style: 'dashed' }))],
    ['corner style "chamfer"', () => withBackground((bg) => Object.assign(bg.Corners, { radius: 4, style: 'chamfer' }))],
  ];

  for (const [expected, build] of cases) {
    const why = whyControlNotScenery(build());
    assert.equal(why, expected, `expected refusal "${expected}", got "${why}"`);
  }
});

test('a section nobody has written yet is refused rather than ignored', () => {
  // The allowlist is the point. A section added to the app next year must cost a render, not bake
  // a control whose behaviour this file has never heard of.
  const control = box('future');
  control._children.SomethingNew = { _type: 'SomethingNew', enabled: true };
  assert.equal(whyControlNotScenery(control), 'has a SomethingNew section');
});

test('a container is refused for what its children are', () => {
  const parent = createControl('Container', { Core: { id: 'p', name: 'p', layer: 'Scenery' } });
  parent._children.Children._children = {
    kid: createControl('Label', { Core: { id: 'kid', name: 'Title', layer: 'Scenery' } }),
  };
  assert.match(whyControlNotScenery(parent), /^child "Title": carries text/);
});

test('a container that sizes itself from its contents is refused by name', () => {
  // Measuring it would mean a second implementation of CanvasControl's fit, and two implementations
  // of the same measurement do not stay agreeing.
  const parent = createControl('Container', {
    Core: { id: 'p', layer: 'Scenery' },
    Children: { fitWidth: 'contents' },
  });
  parent._children.Children._children = { kid: box('kid') };
  assert.equal(whyControlNotScenery(parent), 'container sizes itself from its contents');
});

test('classification keeps order and reports every refusal', () => {
  const knob = createControl('Range', { Core: { id: 'k', name: 'Cutoff', layer: 'Scenery' } });
  const { foldable, live, refusals } = classifySceneryControls([box('a'), knob, box('b')]);
  assert.deepEqual(foldable.map((c) => c._children.Core.id), ['a', 'b']);
  assert.deepEqual(live.map((c) => c._children.Core.id), ['k']);
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0].name, 'Cutoff');
  assert.ok(refusals[0].why, 'a refusal with no reason is the failure this exists to prevent');
});

/* ------------------------------------------------------------------ when it compiles */

test('a scenery layer compiles when locked, and always in preview', () => {
  const plain = createLayer('Main');
  const scenery = createLayer('Scenery', { kind: SCENERY_KIND });
  const locked = createLayer('Scenery', { kind: SCENERY_KIND, locked: true });

  assert.equal(isSceneryLayer(scenery), true);
  assert.equal(isSceneryLayer(plain), false);

  assert.equal(sceneryLayerIsCompiled(scenery), false, 'an unlocked scenery layer stays editable');
  assert.equal(sceneryLayerIsCompiled(locked), true);
  assert.equal(sceneryLayerIsCompiled(scenery, { preview: true }), true, 'preview has nothing to edit');
  assert.equal(sceneryLayerIsCompiled(plain, { preview: true }), false);
});

/* ------------------------------------------------------------------ the render plan */

function panelWith(controls, layers) {
  const panel = createPanel('scenery');
  panel.controls = controls;
  panel.layers = layers;
  panel.width = 400;
  panel.height = 300;
  return panel;
}

test('the image lands at its layer\'s depth, not first and not last', () => {
  // Stacking is document order on the surface, so a scenery layer painted in the middle of the
  // stack has to APPEAR in the middle of the list. Emitting all images first would put the
  // foreground scenery behind controls that belong behind it.
  const panel = panelWith(
    [box('back', { Core: { layer: 'Back' } }),
     createControl('Range', { Core: { id: 'knob', layer: 'Main' } }),
     box('front', { Core: { layer: 'Front' } })],
    [createLayer('Back', { kind: SCENERY_KIND, locked: true }),
     createLayer('Main'),
     createLayer('Front', { kind: SCENERY_KIND, locked: true })],
  );

  const { items } = buildSceneryRenderPlan(panel);
  assert.deepEqual(
    items.map((i) => (i.type === 'scenery' ? `img:${i.layer}` : i.control._children.Core.id)),
    ['img:Back', 'knob', 'img:Front'],
  );
});

test('an unlocked scenery layer renders its controls, and preview compiles it anyway', () => {
  const panel = panelWith([box('a', { Core: { layer: 'Scenery' } })],
    [createLayer('Scenery', { kind: SCENERY_KIND })]);

  assert.deepEqual(buildSceneryRenderPlan(panel).items.map((i) => i.type), ['control']);
  assert.deepEqual(buildSceneryRenderPlan(panel, { preview: true }).items.map((i) => i.type), ['scenery']);
});

test('a refused control still renders, on top of the image it could not join', () => {
  const panel = panelWith(
    [box('a', { Core: { layer: 'Scenery' } }),
     createControl('Label', { Core: { id: 'title', layer: 'Scenery' } })],
    [createLayer('Scenery', { kind: SCENERY_KIND, locked: true })],
  );

  const { items, scenery } = buildSceneryRenderPlan(panel);
  assert.deepEqual(items.map((i) => i.type), ['scenery', 'control']);
  assert.equal(scenery.get('Scenery').folded, 1);
  assert.equal(scenery.get('Scenery').refusals.length, 1);
});

test('a hidden scenery layer paints nothing at all', () => {
  const panel = panelWith([box('a', { Core: { layer: 'Scenery' } })],
    [createLayer('Scenery', { kind: SCENERY_KIND, locked: true, visible: false })]);
  assert.deepEqual(buildSceneryRenderPlan(panel).items, []);
});

test('a panel with no scenery produces exactly the old list', () => {
  // The migration promise: nothing that exists today renders differently.
  const panel = panelWith(
    [box('a', { Core: { layer: 'Main' } }), box('b', { Core: { layer: 'Main' } })],
    [createLayer('Main')],
  );
  const { items, scenery } = buildSceneryRenderPlan(panel);
  assert.deepEqual(items.map((i) => i.control._children.Core.id), ['a', 'b']);
  assert.equal(scenery.size, 0);
});

/* ------------------------------------------------------------------ the cache */

test('the same drawing twice is compiled once, and a move misses', () => {
  clearSceneryCache();
  const first = compileScenery([box('a')], 400, 300);
  const same = compileScenery([box('a')], 400, 300);
  assert.equal(first.url, same.url);
  assert.equal(sceneryCacheSize(), 1);

  const moved = compileScenery([box('a', { Transform: { x: 40 } })], 400, 300);
  assert.notEqual(moved.url, first.url);
  assert.equal(sceneryCacheSize(), 2);
});

test('the digest covers every field the compiler reads', () => {
  // A field added to the emitter and forgotten here draws a stale picture that no invalidation can
  // reach, because the key never changed. Each mutation below must produce a different image.
  clearSceneryCache();
  const mutations = [
    (c) => { c._children.Transform.width = 111; },
    (c) => { c._children.Transform.rotation = 30; },
    (c) => { c._children.Transform.opacity = 0.5; },
    (c) => { c._children.Background._children.Fill.colour = 'FF00FF00'; },
    (c) => { Object.assign(c._children.Background._children.Border, { enabled: true, thickness: 3 }); },
    (c) => { c._children.Background._children.Corners.radius = 9; },
    (c) => { c._children.Core.visible = false; },
  ];

  const base = compileScenery([box('a')], 400, 300).url;
  const seen = new Set([base]);
  for (const mutate of mutations) {
    const control = box('a');
    mutate(control);
    const url = compileScenery([control], 400, 300).url;
    assert.ok(!seen.has(url), 'a change produced the same image — the digest is missing a field');
    seen.add(url);
  }
});

test('the compiled image is base64, like every other data URL in the app', () => {
  // Percent-encoding leaves parentheses alone, so `url(#g0)` truncates the CSS url() and the
  // browser silently fails to decode — see partsToSvg.js.
  assert.match(compileScenery([box('a')], 400, 300).url, /^data:image\/svg\+xml;base64,/);
});
