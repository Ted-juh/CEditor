// staticPartBaking.test.js — folding unchanging parts into one SVG, and refusing to when unsure.
//
// A GAIA fader is 26 parts and 22 of them are printed scale marks that never move. Across that
// panel, 2,821 of 3,295 parts can never change, and every one is a DOM element the browser has to
// create, style, lay out and paint. Compiling them to a single SVG takes the surface from 12,025
// nodes to 5,584, load script from 2,295 ms to 1,800 ms and heap from 333 MB to 150 MB.
//
// The risk is not that the SVG looks slightly wrong. It is that a part which CAN move gets baked
// and freezes — a knob whose pointer never turns, which reads as a broken binding and is nowhere
// near the binding code. So almost everything here is about REFUSING, and each refusal is asserted
// by name rather than in bulk: a test that only checks "some things are refused" passes just as
// happily when the reason changes underneath it.
//
// The other half is the creator. Baking is a canvas concern; authoring must always see real,
// separate layers. That holds today because the design surface renders parts directly instead of
// through CanvasControl — true by construction, load-bearing, and therefore pinned below.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import { createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';
import { isBakeable, partsToSvg, svgToDataUrl, whyNotBakeable } from '../src/CE_Application/utils/partsToSvg.js';
import {
  BAKED_PART_NAME, bakeStaticPartEntries, classifyParts, clearBakeCache, bakeCacheSize,
  movingPartNames, whyControlNotBakeable,
} from '../src/CE_Application/utils/staticPartBaking.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/CE_Application');
const clone = (value) => JSON.parse(JSON.stringify(value));

/** A plain filled rectangle part — the case the whole optimisation exists for. */
function plainPart(name, overrides = {}) {
  const part = createPartNode(name, {
    layout: { x: 1, y: 2, width: 10, height: 20, xUnit: 'px', yUnit: 'px', anchorX: 'left', anchorY: 'top' },
    sections: { Background: clone(SECTION_DEFAULTS.Background) },
  });
  part._children.Background._children.Fill.colour = 'FF102030';
  part._children.Background._children.Border.enabled = false;
  Object.assign(part, overrides);
  return part;
}

function componentWith(parts, extra = {}) {
  const control = createControl('CustomComponent', { Core: { id: 'cc' }, Transform: { width: 40, height: 40 } });
  control._children.Parts = { _type: 'Parts', _children: parts };
  Object.assign(control._children, extra);
  return control;
}

const entriesOf = (control) => Object.entries(control._children.Parts._children);

/* ------------------------------------------------------------------ what it will draw */

test('a plain rectangle bakes, and its geometry survives', () => {
  const svg = partsToSvg([['a', plainPart('a')]], 40, 40);
  assert.match(svg, /<rect x="1" y="2" width="10" height="20"/);
  assert.match(svg, /fill="#102030"/);
  assert.match(svg, /viewBox="0 0 40 40"/);
});

test('a rotated part turns about its pivot, not its own middle', () => {
  // The knob pointer, in SVG form. It sits in the top half and must swing about the KNOB's centre,
  // which is below its own box — so pivotY is over 100%. Getting this wrong in CSS made every
  // pointer aim up-and-left instead of down-and-left; there is no reason the SVG path should be
  // allowed to reintroduce it.
  const part = plainPart('pointer');
  Object.assign(part._children.Layout, { x: 10, y: 4, width: 4, height: 12, rotation: -135, pivotX: 50, pivotY: 200 });
  const svg = partsToSvg([['pointer', part], ['b', plainPart('b')]], 40, 40);
  // centre = x + width*0.5 = 12, y + height*2 = 28
  assert.match(svg, /rotate\(-135 12\.000 28\.000\)/);
});

test('a linear gradient keeps its angle and every stop', () => {
  const part = plainPart('rim');
  Object.assign(part._children.Background._children.Fill, {
    gradientEnabled: true,
    gradient: { type: 'linear', angle: 180, centerX: 50, centerY: 50, radiusX: 50, radiusY: 50, stops: [{ color: '8A949E', position: 0 }, { color: '171B1F', position: 100 }] },
  });
  const svg = partsToSvg([['rim', part], ['b', plainPart('b')]], 40, 40);
  assert.match(svg, /<linearGradient id="g0" x1="50\.00%" y1="0\.00%" x2="50\.00%" y2="100\.00%">/, '180deg should run top to bottom');
  assert.match(svg, /stop-color="#8A949E"/);
  assert.match(svg, /stop-color="#171B1F"/);
  assert.match(svg, /fill="url\(#g0\)"/);
});

test('the data URL is base64, not percent-encoded', () => {
  // Not a style choice. The document references its own gradients as url(#g0), and
  // encodeURIComponent leaves parentheses alone — so the inner ")" closes the CSS url(...) early
  // and the browser silently fails to decode. It cost a screenshot with every knob body missing.
  const part = plainPart('rim');
  Object.assign(part._children.Background._children.Fill, {
    gradientEnabled: true,
    gradient: { type: 'linear', angle: 0, stops: [{ color: 'FFFFFF', position: 0 }] },
  });
  const url = svgToDataUrl(partsToSvg([['rim', part], ['b', plainPart('b')]], 40, 40));
  assert.match(url, /^data:image\/svg\+xml;base64,/);
  assert.ok(!url.includes(')'), 'a bare ")" in a data URL truncates it inside CSS url(...)');
});

/* ------------------------------------------------------------------ what it refuses, by name */

test('every construct the serializer does not fully understand is refused by name', () => {
  const cases = [
    ["text part (an <img> cannot see the page's fonts)", () => createPartNode('t', { sections: { Text: clone(SECTION_DEFAULTS.Text) } })],
    ['part kind "circle"', () => plainPart('c', { kind: 'circle' })],
    ['effects section', () => { const p = plainPart('e'); p._children.Effects = clone(SECTION_DEFAULTS.Effects); return p; }],
    ['arc meta', () => plainPart('a', { meta: { valueArc: { colour: 'FF0000FF' } } })],
    ['clips children', () => plainPart('v', { clipChildren: true })],
    ['image or overlay fill', () => { const p = plainPart('i'); p._children.Background._children.Fill.imageEnabled = true; return p; }],
    ['solid blend mode "multiply"', () => { const p = plainPart('b'); p._children.Background._children.Fill.solidBlend = 'multiply'; return p; }],
    ['per-side border', () => { const p = plainPart('s'); Object.assign(p._children.Background._children.Border, { enabled: true, linked: false }); return p; }],
    ['border style "dashed"', () => { const p = plainPart('d'); Object.assign(p._children.Background._children.Border, { enabled: true, linked: true, style: 'dashed' }); return p; }],
    ['per-corner radii', () => { const p = plainPart('r'); Object.assign(p._children.Background._children.Corners, { radius: 4, linked: false }); return p; }],
    ['corner style "chamfer"', () => { const p = plainPart('ch'); Object.assign(p._children.Background._children.Corners, { radius: 4, style: 'chamfer' }); return p; }],
    ['widthUnit is "percent"', () => { const p = plainPart('p'); p._children.Layout.widthUnit = 'percent'; return p; }],
    ['layout mode "fill"', () => { const p = plainPart('f'); p._children.Layout.mode = 'fill'; return p; }],
    ['non top-left anchor', () => { const p = plainPart('an'); p._children.Layout.anchorX = 'center'; return p; }],
  ];

  for (const [expected, build] of cases) {
    const why = whyNotBakeable(build());
    assert.equal(why, expected, `expected refusal "${expected}", got "${why}"`);
  }
});

test('a bakeable part is genuinely bakeable', () => {
  assert.equal(whyNotBakeable(plainPart('ok')), null);
  assert.ok(isBakeable(plainPart('ok')));
});

/* ------------------------------------------------------------------ what can move */

test('a part any binding targets is never baked', () => {
  const control = componentWith({ slot: plainPart('slot'), cap: plainPart('cap'), tick0: plainPart('tick0'), tick1: plainPart('tick1') });
  control._children.Bindings = { _type: 'Bindings', _children: {
    capY: { name: 'capY', enabled: true, source: 'channel.value.normalized', target: 'Parts.cap.Layout.y' },
  } };

  assert.deepEqual([...movingPartNames(control)], ['cap']);
  const { bakeable, live } = classifyParts(control);
  assert.ok(!bakeable.includes('cap'), 'the part a binding moves was baked — it would be frozen');
  assert.deepEqual(live, ['cap']);
});

test('a control that can move its parts by any other route keeps all of them', () => {
  // Blunt on purpose. States, animations, generators and scripts are each a way for a part to
  // change, and a control with any of them is left entirely alone rather than reasoned about.
  // Narrowing this is allowed; narrowing it without a test that proves the narrowing is not.
  const parts = () => ({ a: plainPart('a'), b: plainPart('b'), c: plainPart('c'), d: plainPart('d') });
  const cases = [
    ['has states', { States: { _type: 'States', _children: { hover: { patches: {} } } } }],
    ['has animations', { Animations: { _type: 'Animations', _children: { spin: { target: 'Parts.a' } } } }],
    ['has generators', { Generators: { _type: 'Generators', _children: { ring: { count: 8 } } } }],
    ['a script addresses parts by name', { Scripts: { _type: 'Scripts', source: 'set("Parts.a.Layout.x", 4); // plenty long enough' } }],
    ['arpeggiator surface materializes its own parts', { Designer: { arpeggiator: { enabled: true } } }],
  ];
  for (const [expected, extra] of cases) {
    const control = componentWith(parts(), extra);
    assert.equal(whyControlNotBakeable(control), expected);
    assert.deepEqual(classifyParts(control).bakeable, [], `${expected}: parts were baked anyway`);
  }
});

test('a native control is never touched', () => {
  const knob = createControl('Knob', { Core: { id: 'k' } });
  assert.equal(whyControlNotBakeable(knob), 'not a custom component');
  const entries = Object.entries(knob._children.Parts?._children ?? {});
  if (entries.length) assert.equal(bakeStaticPartEntries(knob, entries, 60, 60), entries);
});

/* ------------------------------------------------------------------ the fold itself */

test('the static parts become one entry and the live ones stay', () => {
  const control = componentWith({
    tick0: plainPart('tick0'), tick1: plainPart('tick1'), tick2: plainPart('tick2'),
    body: plainPart('body'), cap: plainPart('cap'),
  });
  control._children.Bindings = { _type: 'Bindings', _children: {
    capY: { name: 'capY', enabled: true, target: 'Parts.cap.Layout.y' },
  } };

  const before = entriesOf(control);
  const after = bakeStaticPartEntries(control, before, 40, 40);
  assert.equal(after.length, 2, 'expected one baked entry plus the live cap');
  assert.equal(after[0][0], BAKED_PART_NAME);
  assert.equal(after[1][0], 'cap');
  assert.match(after[0][1]._children.Background._children.Fill.imageSrc, /^data:image\/svg\+xml;base64,/);
});

test('the baked part never goes behind the control', () => {
  // zIndex -1 puts it behind the content wrapper and it vanishes — found by screenshot, twice,
  // and invisible to every test that only checks the markup was produced.
  const control = componentWith({ a: plainPart('a'), b: plainPart('b'), c: plainPart('c'), d: plainPart('d') });
  const baked = bakeStaticPartEntries(control, entriesOf(control), 40, 40)[0][1];
  assert.ok(baked.zIndex >= 0, `baked part sits at z-index ${baked.zIndex} and would not be visible`);
});

test('when it cannot help, the entries come back untouched', () => {
  // What makes this safe to call unconditionally: no caller has to know the rules.
  const tiny = componentWith({ a: plainPart('a'), b: plainPart('b') });
  const entries = entriesOf(tiny);
  assert.equal(bakeStaticPartEntries(tiny, entries, 40, 40), entries, 'too few parts to be worth folding');

  const textOnly = componentWith(Object.fromEntries(['a', 'b', 'c', 'd'].map((n) => [n, createPartNode(n, { sections: { Text: clone(SECTION_DEFAULTS.Text) } })])));
  const textEntries = entriesOf(textOnly);
  assert.equal(bakeStaticPartEntries(textOnly, textEntries, 40, 40), textEntries, 'nothing bakeable, so nothing should change');
});

test('the cache folds identical looks onto one image', () => {
  // The 69 faders. They are 69 distinct objects holding the same drawing; without content-keying
  // the browser would decode 69 identical images.
  clearBakeCache();
  const make = () => componentWith({ a: plainPart('a'), b: plainPart('b'), c: plainPart('c'), d: plainPart('d') });
  const first = bakeStaticPartEntries(make(), entriesOf(make()), 40, 40)[0][1];
  const second = bakeStaticPartEntries(make(), entriesOf(make()), 40, 40)[0][1];
  assert.equal(bakeCacheSize(), 1, 'two identical looks produced two cache entries');
  assert.equal(first._children.Background._children.Fill.imageSrc, second._children.Background._children.Fill.imageSrc);
});

test('a changed part misses the cache', () => {
  // The invalidation story, and the reason the image is derived rather than stored: there is
  // nothing to invalidate, because the content IS the key.
  clearBakeCache();
  const control = componentWith({ a: plainPart('a'), b: plainPart('b'), c: plainPart('c'), d: plainPart('d') });
  const before = bakeStaticPartEntries(control, entriesOf(control), 40, 40)[0][1]._children.Background._children.Fill.imageSrc;

  const changed = componentWith({ a: plainPart('a'), b: plainPart('b'), c: plainPart('c'), d: plainPart('d') });
  changed._children.Parts._children.a._children.Background._children.Fill.colour = 'FFAA0000';
  const after = bakeStaticPartEntries(changed, entriesOf(changed), 40, 40)[0][1]._children.Background._children.Fill.imageSrc;

  assert.notEqual(after, before, 'a changed fill colour reused the old image');
  assert.equal(bakeCacheSize(), 2);
});

test('the digest covers every field the serializer reads', () => {
  // A collision draws the WRONG picture, silently. Each field the serializer consults is varied on
  // its own and must produce a different image; a field added to partsToSvg and forgotten in
  // digestOf fails right here.
  clearBakeCache();
  // Distinguishable, and overlapping: four identical rects at one position draw the same picture
  // whatever order they are in, so a z-index change would legitimately produce the same image and
  // the test would be measuring nothing.
  const base = () => {
    const parts = { a: plainPart('a'), b: plainPart('b'), c: plainPart('c'), d: plainPart('d') };
    ['FF112233', 'FF445566', 'FF778899', 'FFAABBCC'].forEach((colour, i) => {
      const part = parts[['a', 'b', 'c', 'd'][i]];
      part._children.Background._children.Fill.colour = colour;
      part.zIndex = i;
    });
    return parts;
  };
  const seen = new Set();
  const urlFor = (mutate) => {
    const parts = base();
    mutate(parts.a);
    const control = componentWith(parts);
    return bakeStaticPartEntries(control, entriesOf(control), 40, 40)[0][1]._children.Background._children.Fill.imageSrc;
  };

  const mutations = [
    ['baseline', () => {}],
    ['x', (p) => { p._children.Layout.x = 7; }],
    ['y', (p) => { p._children.Layout.y = 7; }],
    ['width', (p) => { p._children.Layout.width = 7; }],
    ['height', (p) => { p._children.Layout.height = 7; }],
    ['rotation', (p) => { p._children.Layout.rotation = 30; }],
    ['pivotX', (p) => { p._children.Layout.rotation = 30; p._children.Layout.pivotX = 10; }],
    ['pivotY', (p) => { p._children.Layout.rotation = 30; p._children.Layout.pivotY = 10; }],
    ['fill colour', (p) => { p._children.Background._children.Fill.colour = 'FF00FF00'; }],
    ['corner radius', (p) => { p._children.Background._children.Corners.radius = 3; }],
    ['border on', (p) => { Object.assign(p._children.Background._children.Border, { enabled: true, thickness: 1, colour: 'FF00FFFF' }); }],
    ['opacity', (p) => { p.opacity = 0.4; }],
    ['zIndex', (p) => { p.zIndex = 9; }],   // moves it to the top of the stack, over the others
  ];

  for (const [label, mutate] of mutations) {
    const url = urlFor(mutate);
    assert.ok(!seen.has(url), `"${label}" produced the same image as an earlier variant — the digest misses that field`);
    seen.add(url);
  }
});

/* ------------------------------------------------------------------ the creator is untouched */

test('authoring always sees real parts, never a baked one', () => {
  // Baking is a canvas concern. The component design surface renders parts through
  // InteractivePartRenderer directly rather than through CanvasControl, which is what keeps every
  // layer individually selectable, movable and paintable while authoring. That separation is true
  // by construction rather than by a flag, so it is exactly the kind of thing that gets broken by
  // a well-meaning refactor and noticed by nobody.
  const designer = readFileSync(path.join(SRC, 'sections/CustomDesignSurfaceEditor.svelte'), 'utf8');
  assert.match(designer, /import InteractivePartRenderer from '\.\.\/editor\/InteractivePartRenderer\.svelte'/,
    'the design surface should render parts directly');
  assert.ok(!/staticPartBaking/.test(designer), 'the design surface must never bake — authoring needs separate layers');

  const partRenderer = readFileSync(path.join(SRC, 'editor/InteractivePartRenderer.svelte'), 'utf8');
  assert.ok(!/staticPartBaking/.test(partRenderer),
    'baking belongs above the part renderer, or the creator inherits it');
});
