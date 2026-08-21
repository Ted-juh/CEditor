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

test('a container\'s opacity reaches its children, because on the canvas it is a group opacity', () => {
  // Descendants are emitted as SIBLING rects — SVG gives no nesting to inherit through — so each one
  // used to carry only its own opacity. A group faded to 50% kept fully opaque contents, and locking
  // the layer made every child of it jump to full strength.
  const parent = createControl('Container', {
    Core: { id: 'group', name: 'group', layer: 'Scenery' },
    Transform: { x: 10, y: 20, width: 100, height: 50, opacity: 0.5 },
    Children: { padding: 0 },
  });
  parent._children.Children._children = { kid: box('kid', { Transform: { x: 5, y: 5, width: 20, height: 20 } }) };

  const svg = svgOf(compileScenery([parent], 400, 300));
  assert.match(svg, /<g opacity="0\.500">/, 'the subtree should be wrapped in a group opacity');
  // And not applied twice: the parent's own rect keeps carrying it as fill-opacity, outside the group.
  assert.equal(svg.indexOf('<g opacity') > svg.indexOf('fill-opacity="0.500"'), true,
    'the parent rect comes first, outside the group');
});

test('a container\'s rotation turns its children with it, and its clip', () => {
  const parent = createControl('Container', {
    Core: { id: 'turned', name: 'turned', layer: 'Scenery' },
    Transform: { x: 10, y: 20, width: 100, height: 50, rotation: 45 },
    Children: { padding: 0, clip: true },
  });
  parent._children.Children._children = { kid: box('kid', { Transform: { x: 5, y: 5, width: 20, height: 20 } }) };

  const svg = svgOf(compileScenery([parent], 400, 300));
  // The container is 100x50 at 10,20, so its centre is 60,45 — the same pivot boxElement uses.
  assert.match(svg, /<g transform="rotate\(45 60\.000 45\.000\)">/);
  // The clip group sits INSIDE the rotation, so the clip rect is carried round by it rather than
  // cutting the children in the unrotated frame.
  const rotateAt = svg.indexOf('<g transform="rotate(45');
  const clipAt = svg.indexOf('<g clip-path=');
  assert.ok(rotateAt >= 0 && clipAt > rotateAt, 'the clip group must be nested inside the rotation');
  assert.match(svg, /<clipPath id="clip[^"]*"><rect x="10" y="20"/, 'the clip rect itself stays unrotated');
});

test('an unrotated, fully opaque container emits no wrapper at all', () => {
  // The common case must not gain a <g> per container — that is one element per group in every
  // compiled image, for nothing.
  const parent = createControl('Container', {
    Core: { id: 'plain', name: 'plain', layer: 'Scenery' },
    Transform: { x: 10, y: 20, width: 100, height: 50 },
    Children: { padding: 0 },
  });
  parent._children.Children._children = { kid: box('kid', { Transform: { x: 5, y: 5, width: 20, height: 20 } }) };
  const svg = svgOf(compileScenery([parent], 400, 300));
  assert.ok(!svg.includes('<g '), `expected no group wrapper, got: ${svg}`);
});

test('a frame with nothing inside it draws its border and no fill', () => {
  // Border on, solid layer off — the standard chassis idiom, and one boxElement used to get exactly
  // backwards: it painted Fill.colour unconditionally, so a control that renders transparent folded
  // into an opaque rectangle sitting over the panel background.
  const control = box('frame');
  Object.assign(control._children.Background._children.Border, { enabled: true, thickness: 2, colour: 'FFFFFFFF' });
  control._children.Background._children.Fill.solidEnabled = false;

  const svg = svgOf(compileScenery([control], 400, 300));
  const drawn = rects(svg);
  assert.equal(drawn.length, 1, 'only the border rect should be emitted');
  assert.match(drawn[0], /fill="none"/);
  assert.match(drawn[0], /stroke-width="2"/);
});

test('a gradient still paints when the solid layer beneath it is off', () => {
  // The two are separate layers and the gradient sits on top, so switching the solid one off must
  // not take the gradient with it.
  const control = box('grad');
  Object.assign(control._children.Background._children.Fill, {
    solidEnabled: false,
    gradientEnabled: true,
    gradient: { type: 'linear', angle: 90, stops: [{ color: 'FF0000', position: 0 }, { color: '0000FF', position: 100 }] },
  });
  const svg = svgOf(compileScenery([control], 400, 300));
  assert.match(svg, /<linearGradient/);
  assert.match(svg, /fill="url\(#g\d+\)"/);
});

test('the legacy spelling of a switched-off fill is refused rather than guessed at', () => {
  // Before `solidEnabled` existed, Background.mode carried it. That lives on the section rather than
  // in its children, so the emitter cannot see it — and an opaque rectangle over a transparent
  // control is a worse answer than declining to fold.
  const control = box('legacy');
  delete control._children.Background._children.Fill.solidEnabled;
  control._children.Background.mode = 'gradient';
  assert.equal(whyControlNotScenery(control), 'legacy fill mode "gradient"');
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
  const withEffects = (mutate) => { const c = box('x'); mutate(c._children.Effects._children); return c; };

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
    ['image or overlay fill', () => withBackground((bg) => { bg.Fill.imageEnabled = true; })],
    ['per-side border', () => withBackground((bg) => Object.assign(bg.Border, { enabled: true, linked: false }))],
    ['border style "dashed"', () => withBackground((bg) => Object.assign(bg.Border, { enabled: true, style: 'dashed' }))],
    ['corner style "chamfer"', () => withBackground((bg) => Object.assign(bg.Corners, { radius: 4, style: 'chamfer' }))],

    // Every filter at ITS OWN extreme. The first gate asked `value !== 0 && value !== 100`, which
    // made exactly these inert: a control drained to greyscale, inverted, or blacked out folded
    // into the image with the effect dropped and nothing said.
    ['effects are enabled', () => withEffects((fx) => { fx.Filters.saturation = 0; })],
    ['effects are enabled', () => withEffects((fx) => { fx.Filters.grayscale = 100; })],
    ['effects are enabled', () => withEffects((fx) => { fx.Filters.invert = 100; })],
    ['effects are enabled', () => withEffects((fx) => { fx.Filters.sepia = 100; })],
    ['effects are enabled', () => withEffects((fx) => { fx.Filters.brightness = 0; })],
    ['effects are enabled', () => withEffects((fx) => { fx.Filters.contrast = 0; })],
    ['effects are enabled', () => withEffects((fx) => { fx.Filters.blur = 100; })],
    ['effects are enabled', () => withEffects((fx) => { fx.Filters.hueRotate = 100; })],
    // Blend was not consulted at all, so a multiplied control folded as an opaque one.
    ['effects are enabled', () => withEffects((fx) => { fx.Blend.mode = 'multiply'; })],

    // A corner border switched off is a GAP in the outline — borderSegments.js omits that corner's
    // arc and leaves the four sides detached — where boxElement draws one closed stroked rect.
    // Linked corners share one object, so switching it off opens all four.
    ['corner border off (tl, tr, br, bl)', () => withBackground((bg) => {
      bg.Border.enabled = true;
      bg.Corners.radius = 8;
      bg.Corners.borderEnabled = false;
    })],
    // Unlinked, and at radius 0 — where the old gate short-circuited before looking at anything.
    ['corner border off (tl, br)', () => withBackground((bg) => {
      bg.Border.enabled = true;
      bg.Corners.linked = false;
      bg.Corners.topLeft = { borderEnabled: false };
      bg.Corners.bottomRight = { borderEnabled: false };
    })],
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

test('a container that sizes itself from its contents is measured, not refused', () => {
  // The first cut refused this, reasoning that measuring it would be a second implementation of
  // CanvasControl's fit. Wrong conclusion from a right premise: the fit lives in containerFit.js
  // and CanvasControl calls it. Calling the same function is not a second implementation, so the
  // assertion here is that the compiled box is the SIZE THE CANVAS DRAWS.
  const parent = createControl('Container', {
    Core: { id: 'p', name: 'p', layer: 'Scenery' },
    Transform: { x: 0, y: 0, width: 999, height: 999 },
    Children: { fitWidth: 'contents', fitHeight: 'contents', padding: 10 },
  });
  parent._children.Background._children.Border.enabled = false;
  parent._children.Children._children = {
    kid: box('kid', { Transform: { x: 5, y: 5, width: 40, height: 30 } }),
  };

  assert.equal(whyControlNotScenery(parent), null);
  const svg = svgOf(compileScenery([parent], 400, 400));
  // 10 padding + 5 own x + 40 wide + 10 padding = 65 x 55, not the 999 in Transform.
  assert.match(svg, /x="0" y="0" width="65" height="55"/);
  assert.match(svg, /x="15" y="15" width="40" height="30"/, 'the child sits at the content origin');
});

test('an anchored child is placed against the fitted edge', () => {
  // The mechanism the whole section arc was for: a title anchored top-right of a box whose width is
  // derived from its contents. Absolute x/y cannot express that, so if the compiler ignored the
  // anchor the title would bake in the wrong place — visibly, and only on fitted sections.
  const parent = createControl('Container', {
    Core: { id: 'p', name: 'p', layer: 'Scenery' },
    Transform: { x: 0, y: 0, width: 200, height: 100 },
    Children: { padding: 0 },
  });
  parent._children.Background._children.Border.enabled = false;
  parent._children.Children._children = {
    badge: box('badge', { Transform: { x: 8, y: 4, width: 20, height: 10, anchor: 'topRight' } }),
  };

  assert.equal(whyControlNotScenery(parent), null);
  // 200 wide - 20 own width - 8 inset = 172.
  assert.match(svgOf(compileScenery([parent], 400, 400)), /x="172" y="4" width="20" height="10"/);
});

test('a clipping container cuts its children at its own rounded edge', () => {
  const parent = createControl('Container', {
    Core: { id: 'p', name: 'p', layer: 'Scenery' },
    Transform: { x: 0, y: 0, width: 100, height: 100 },
    Children: { clip: true, padding: 0 },
  });
  parent._children.Background._children.Border.enabled = false;
  parent._children.Background._children.Corners.radius = 8;
  parent._children.Children._children = {
    kid: box('kid', { Transform: { x: 80, y: 0, width: 60, height: 20 } }),
  };

  assert.equal(whyControlNotScenery(parent), null);
  const svg = svgOf(compileScenery([parent], 400, 400));
  assert.match(svg, /<clipPath id="clip0"><rect x="0" y="0" width="100" height="100" rx="8" ry="8"\/><\/clipPath>/);
  assert.match(svg, /<g clip-path="url\(#clip0\)">/, 'the children have to be inside the clipped group');
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

test('the digest covers the container fields too', () => {
  // These reach the emitter through containerFit rather than through the box, so they are the easy
  // ones to leave out of a key. Leaving them out means switching a section to fit-contents and
  // watching nothing happen, with no invalidation to reach for.
  clearSceneryCache();
  const container = () => {
    const parent = createControl('Container', {
      Core: { id: 'p', name: 'p', layer: 'Scenery' },
      Transform: { x: 0, y: 0, width: 200, height: 200 },
      Children: { padding: 0 },
    });
    parent._children.Background._children.Border.enabled = false;
    parent._children.Children._children = {
      kid: box('kid', { Transform: { x: 5, y: 5, width: 40, height: 30 } }),
    };
    return parent;
  };

  const mutations = [
    (p) => { p._children.Children.fitWidth = 'contents'; },
    (p) => { p._children.Children.fitHeight = 'contents'; },
    (p) => { p._children.Children.clip = true; },
    (p) => { p._children.Children.paddingTop = 24; },
    (p) => { p._children.Children._children.kid._children.Transform.anchor = 'bottomRight'; },
  ];

  const seen = new Set([compileScenery([container()], 400, 400).url]);
  for (const mutate of mutations) {
    const parent = container();
    mutate(parent);
    const url = compileScenery([parent], 400, 400).url;
    assert.ok(!seen.has(url), 'a container change produced the same image — the digest is missing a field');
    seen.add(url);
  }
});

test('the compiled image is base64, like every other data URL in the app', () => {
  // Percent-encoding leaves parentheses alone, so `url(#g0)` truncates the CSS url() and the
  // browser silently fails to decode — see partsToSvg.js.
  assert.match(compileScenery([box('a')], 400, 300).url, /^data:image\/svg\+xml;base64,/);
});

test('nested children fold in PAINT order, not document order', () => {
  // CanvasControl renders sortControlsForRender(getChildControls(control)) — Core.zIndex first. The
  // caller sorts the top level and the compiler used to recurse over the raw list, so two
  // overlapping children of a folded container swapped the instant the layer locked.
  const parent = createControl('Container', {
    Core: { id: 'p', name: 'p', layer: 'Scenery' },
    Transform: { x: 0, y: 0, width: 200, height: 200 },
    Children: { padding: 0 },
  });
  const back = box('back', { Core: { zIndex: 1 }, Transform: { x: 0, y: 0, width: 50, height: 50 } });
  const front = box('front', { Core: { zIndex: 5 }, Transform: { x: 1, y: 1, width: 50, height: 50 } });
  // Stored front-first, which is what makes document order the wrong answer.
  parent._children.Children._children = { front, back };

  const drawn = rects(svgOf(compileScenery([parent], 400, 400)));
  const backAt = drawn.findIndex((r) => r.includes('x="0" y="0" width="50"'));
  const frontAt = drawn.findIndex((r) => r.includes('x="1" y="1" width="50"'));
  assert.ok(backAt >= 0 && frontAt >= 0, `both children should be drawn: ${JSON.stringify(drawn)}`);
  assert.ok(backAt < frontAt, 'the lower zIndex must be painted first, so the higher one covers it');
});

test('an EMPTY fitted container re-compiles when its own size fields change', () => {
  // The digest folded the Children section only when there were children to walk. But the emitter
  // measures every control the same way, so an empty fitted container's size comes from minWidth /
  // minHeight and its padding alone — none of which reached the key. Editing them returned the
  // cached image and the box kept its old size until something unrelated moved.
  const make = (minWidth) => {
    const c = createControl('Container', {
      Core: { id: 'empty', name: 'empty', layer: 'Scenery' },
      Transform: { x: 0, y: 0, width: 10, height: 40 },
      Children: { padding: 0, fitWidth: 'contents', minWidth, minHeight: 40 },
    });
    c._children.Background._children.Border.enabled = false;
    return c;
  };

  clearSceneryCache();
  const first = svgOf(compileScenery([make(100)], 400, 400));
  const second = svgOf(compileScenery([make(200)], 400, 400));
  assert.notEqual(first, second, 'changing minWidth on an empty fitted section must re-compile');
  assert.match(first, /width="100"/);
  assert.match(second, /width="200"/);
});

/* --------------------------------------------- the two folds, composed (sceneryRenderPlan) */

/*
 * THE CASE THIS SECTION EXISTS FOR.
 *
 * The image compiler refuses text, because an <img> cannot see the page's fonts. On a real panel
 * text is nearly all of it — the GAIA's 409 controls are 189 Labels and 27 Backgrounds — so a
 * scenery layer that compiles folds the 27 and hands back the 189. The frozen ground takes exactly
 * what the image cannot, so the two run in sequence rather than one instead of the other.
 *
 * An earlier version gated them against each other and this is what that cost: declaring a scenery
 * layer traded a fold of 189 labels for an image of 27 boxes, and made the panel slower.
 */

function knob(id, layer, box = {}) {
  return createControl('Knob', {
    Core: { id, name: id, layer },
    Transform: { x: 0, y: 0, width: 40, height: 40, ...box },
  });
}

function label(id, layer, box = {}) {
  return createControl('Label', {
    Core: { id, name: id, layer },
    Transform: { x: 0, y: 0, width: 40, height: 10, ...box },
  });
}

const kindsOf = (items) => items.map((i) =>
  i.type === 'scenery' ? `img:${i.layer}` : i.type === 'ground' ? `ground:${i.layer}` : i.control._children.Core.id);

test('a compiled layer folds its text refusals into a ground instead of handing them back', () => {
  const panel = panelWith(
    [box('plate', { Core: { layer: 'Scenery' } }),
     label('a', 'Scenery', { y: 100 }), label('b', 'Scenery', { y: 120 })],
    [createLayer('Scenery', { kind: SCENERY_KIND, locked: true })],
  );

  assert.deepEqual(kindsOf(buildSceneryRenderPlan(panel, { fold: false }).items),
    ['img:Scenery', 'a', 'b'], 'without the fold the refusals are two live controls');
  assert.deepEqual(kindsOf(buildSceneryRenderPlan(panel, { fold: true }).items),
    ['img:Scenery', 'ground:Scenery'], 'with it they are one ground, drawn over the image');
});

test('an ordinary layer folds too — nothing has to be declared for the ground', () => {
  const panel = panelWith([label('a', 'Main'), label('b', 'Main', { y: 40 })], [createLayer('Main')]);
  assert.deepEqual(kindsOf(buildSceneryRenderPlan(panel, { fold: true }).items), ['ground:Main']);
});

test('each layer gets its own ground, in the layer order', () => {
  // Per-layer and not per-panel: a ground may only hold controls of the layer it paints at the
  // depth of, or it would jump over the live controls of every layer in between.
  const panel = panelWith(
    [label('back', 'Back'), knob('knob', 'Mid'), label('front', 'Front')],
    [createLayer('Back'), createLayer('Mid'), createLayer('Front')],
  );
  assert.deepEqual(kindsOf(buildSceneryRenderPlan(panel, { fold: true }).items),
    ['ground:Back', 'knob', 'ground:Front']);
});

test('a control a live one sits under is not folded, and the ground stays behind it', () => {
  // planSceneryFold's rule, reaching the plan: the ground paints below every live control on its
  // layer, so a label printed OVER a knob has to stay live or the knob would swallow it.
  const panel = panelWith(
    [label('under', 'Main'),
     knob('knob', 'Main', { x: 0, y: 30, width: 100, height: 50 }),
     label('over', 'Main', { y: 40 })],
    [createLayer('Main')],
  );
  assert.deepEqual(kindsOf(buildSceneryRenderPlan(panel, { fold: true }).items),
    ['ground:Main', 'knob', 'over']);
});

test('a panel carrying scripts folds nothing, however it is asked', () => {
  // A script can reach any control by id and set its text — see panelAllowsFold.
  const panel = panelWith([label('a', 'Main')], [createLayer('Main')]);
  panel.scripts = [{ id: 's', source: '' }];
  assert.deepEqual(kindsOf(buildSceneryRenderPlan(panel, { fold: true }).items), ['a']);
});

test('fold:false is byte-for-byte the list that existed before the ground did', () => {
  // The migration promise, and the reason every other test in this file still reads as it did.
  const panel = panelWith(
    [label('a', 'Main'), box('b', { Core: { id: 'b', layer: 'Main' } })], [createLayer('Main')],
  );
  assert.deepEqual(kindsOf(buildSceneryRenderPlan(panel, { fold: false }).items), ['a', 'b']);
});

test('a ground item is reused across a rebuild that changed nothing', () => {
  // The same performance contract the control wrappers carry: the plan feeds a keyed {#each}, and
  // a fresh object every rebuild is a changed value written into the signal of every item in it.
  // planSceneryFold returns a new ARRAY each run, so this has to compare contents, not identity.
  const panel = panelWith([label('a', 'Main'), label('b', 'Main', { y: 40 })], [createLayer('Main')]);
  const first = buildSceneryRenderPlan(panel, { fold: true }).items[0];
  const second = buildSceneryRenderPlan(panel, { fold: true }).items[0];
  assert.equal(first.type, 'ground');
  assert.equal(first, second, 'the ground item was minted twice for the same controls');
});
