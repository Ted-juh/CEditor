// patternLayers.test.js — one tile, tinted and repeated, behind the content or in front of it,
// moving on its own: the Pattern engine (Animation Designer, step 3).
//
// The owner's "Wave" label was a sine wave scrolling behind the text and another in front of it,
// one single-colour image tiled and tinted on the fly. These pin the model, how a pattern is laid
// out and moved, that what reaches a style attribute is only ever numbers, a checked colour and a
// picture in the document, and that a control or part with a pattern is never folded into a still.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import {
  PATTERN_DEFAULTS,
  PATTERN_TILES,
  PATTERN_TILE_NAMES,
  addPatternPatch,
  builtinTile,
  cleanTint,
  hasPatterns,
  knownTileSize,
  nextPatternName,
  patternEntries,
  patternImageUrl,
  patternLabel,
  patternLayout,
  patternStyles,
  patternVelocity,
  patternsMove,
  readPattern,
} from '../src/CE_Application/utils/patternLayers.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { isScenery } from '../src/CE_Application/utils/sceneryModel.js';
import { movingPartNames } from '../src/CE_Application/utils/staticPartBaking.js';
import { offeredTargetsFor, targetStatus, buildTarget, CONTROL_ITSELF } from '../src/CE_Application/utils/animationModel.js';
import { targetTree, targetSteps } from '../src/CE_Application/utils/targetPaths.js';
import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';

const box = { width: 200, height: 60 };
const sine = { width: 64, height: 24 };

/** A Label with patterns, written as the editor writes them. */
function labelWith(...fields) {
  const label = createControl('Label');
  label._children.Core.id = 'wave';
  label._children.Core.name = 'Wave';
  label._children.Transform.width = 200;
  label._children.Transform.height = 60;
  label._children.Text.content = 'Wave';
  for (const extra of fields) {
    const { patch } = addPatternPatch(label._children.Background, 'Background', extra);
    for (const [path, value] of Object.entries(patch)) setNestedValue(label, path, value);
  }
  return label;
}

test('the built-in tiles are pictures in the document, and each tiles: a line leaves where the next enters', () => {
  assert.ok(PATTERN_TILE_NAMES.includes('sine') && PATTERN_TILE_NAMES.includes('square'));
  for (const name of PATTERN_TILE_NAMES) {
    const url = patternImageUrl(`builtin:${name}`);
    assert.match(url, /^data:image\/svg\+xml,%3Csvg/, name);
    assert.ok(!/["'()\\\s]/.test(url), `${name}: nothing in it can end url("…")`);
    assert.deepEqual(knownTileSize(`builtin:${name}`), { width: PATTERN_TILES[name].width, height: PATTERN_TILES[name].height });
  }
  // The sine starts and ends at the middle, so one period meets the next.
  const d = /d="([^"]+)"/.exec(PATTERN_TILES.sine.svg)[1];
  assert.match(d, /^M0 12\.00 /);
  assert.match(d, /L64 12\.00$/);
  assert.equal(builtinTile('builtin:nothing'), null);
});

test('only a picture reaches the mask: a built-in tile or an image data URL, never a path or text', () => {
  assert.equal(patternImageUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  for (const bad of ['C:/art/wave.png', 'https://example.com/w.png', 'data:text/html,<b>', 'data:image/png;base64,abc")', "data:image/png;base64,a'b", '']) {
    assert.equal(patternImageUrl(bad), null, bad);
  }
});

test('a pattern is read with every field kept to what makes sense', () => {
  const read = readPattern({ tint: '#FF8800', opacity: 400, scale: 0, repeat: 'diagonal', place: 'above', speed: -5, direction: -90, blend: 'nonsense', flipX: 'yes' });
  assert.equal(read.tint, 'FFFF8800', 'six digits are opaque');
  assert.equal(read.opacity, 100);
  assert.equal(read.scale, 0.1);
  assert.equal(read.repeat, 'both');
  assert.equal(read.place, 'behind');
  assert.equal(read.speed, 0);
  assert.equal(read.direction, 270, 'minus ninety is up');
  assert.equal(read.blend, 'normal');
  assert.equal(read.flipX, false, 'only true is true');
  assert.equal(cleanTint('red;x', 'FF000000'), 'FF000000');
  assert.deepEqual(readPattern(PATTERN_DEFAULTS).enabled, true);
});

test('a row moves only along itself and a column only down itself; everywhere, it goes any way', () => {
  const at = (repeat, direction) => patternVelocity(readPattern({ repeat, direction, speed: 100 }));
  assert.deepEqual(at('x', 0), { vx: 100, vy: 0 });
  assert.deepEqual(at('x', 90), { vx: 0, vy: 0 }, 'a row asked to go down holds still');
  assert.deepEqual(at('y', 90), { vx: 0, vy: 100 });
  const diagonal = at('both', 45);
  assert.ok(Math.abs(diagonal.vx - 70.71) < 0.01 && Math.abs(diagonal.vy - 70.71) < 0.01);
  assert.deepEqual(at('both', 180), { vx: -100, vy: 0 });
});

test('it moves a tile at a time: each mover loops in the time a tile takes to pass', () => {
  const row = patternLayout(readPattern({ repeat: 'x', speed: 32, direction: 0 }), sine, box);
  assert.deepEqual(row.moveX, { duration: 2000, reverse: false, timing: 'linear' }, '64 px at 32 px a second');
  assert.equal(row.moveY, null);
  const left = patternLayout(readPattern({ repeat: 'x', speed: 32, direction: 180 }), sine, box);
  assert.equal(left.moveX.reverse, true, 'left is the same slide played backwards');
  const diagonal = patternLayout(readPattern({ repeat: 'both', speed: 100, direction: 45 }), sine, box);
  assert.ok(diagonal.moveX && diagonal.moveY, 'a diagonal is two movers, each looping on its own axis');
  assert.equal(diagonal.moveX.duration, Math.round((64 / (100 * Math.SQRT1_2)) * 1000));
  // Reduced motion draws it still; a frame cap is the same slide in steps.
  assert.equal(patternLayout(readPattern({ speed: 100 }), sine, box, { reduced: true }).moveX, null);
  assert.equal(patternLayout(readPattern({ repeat: 'x', speed: 32 }), sine, box, { fps: 30 }).moveX.timing, 'steps(60, jump-end)');
  // Too slow to be seen moving is drawn still rather than as a ten-minute loop.
  assert.equal(patternLayout(readPattern({ repeat: 'x', speed: 0.01 }), sine, box).moveX, null);
});

test('the painted area is a tile larger than the control, so no edge ever shows as it slides', () => {
  const everywhere = patternLayout(readPattern({ repeat: 'both', scale: 2 }), sine, box);
  assert.deepEqual(everywhere.tile, { width: 128, height: 48 });
  assert.deepEqual(everywhere.area, { left: -128, top: -48, width: 456, height: 156 });
  // A tile edge falls at the offset, measured from the area's own corner.
  assert.deepEqual(everywhere.position, { x: 0, y: 0 });
  assert.deepEqual(patternLayout(readPattern({ repeat: 'both', offsetX: 10, offsetY: -5 }), sine, box).position, { x: 10, y: 19 });
  // A row sits where it is put, a tile high, and is as long as the area.
  const row = patternLayout(readPattern({ repeat: 'x', align: 'center', offsetY: 4 }), sine, box);
  assert.deepEqual(row.area, { left: -64, top: 22, width: 328, height: 24 });
  assert.equal(patternLayout(readPattern({ repeat: 'x', align: 'end' }), sine, box).area.top, 36);
  assert.equal(patternLayout(readPattern({ repeat: 'y', align: 'start' }), sine, box).area.left, 0);
});

test('its styles are numbers, a checked colour and a checked picture: the tint is the colour it paints', () => {
  const styles = patternStyles({ src: 'builtin:sine', tint: '80FF0000', repeat: 'x', speed: 32, opacity: 50, blend: 'screen' }, sine, box);
  assert.equal(styles.place, 'behind');
  assert.equal(styles.layer, 'opacity:0.5;mix-blend-mode:screen');
  assert.match(styles.paint, /background-color:#FF000080/);
  assert.match(styles.paint, /-webkit-mask-image:url\("data:image\/svg\+xml,/);
  assert.match(styles.paint, /;mask-image:url\("data:image\/svg\+xml,/);
  assert.match(styles.paint, /mask-repeat:repeat-x/);
  assert.match(styles.moveX, /^width:64px;height:24px;animation-duration:2000ms;animation-timing-function:linear;animation-direction:normal$/);
  assert.equal(styles.moveY, null);
  assert.equal(styles.moves, true);
  assert.match(patternStyles({ src: 'builtin:dots', flipX: true }, { width: 16, height: 16 }, box).paint, /scale:-1 1$/);
  // Nothing to draw: switched off, a source that is not a picture, a size not known yet.
  assert.equal(patternStyles({ enabled: false }, sine, box), null);
  assert.equal(patternStyles({ src: 'C:/wave.png' }, sine, box), null);
  assert.equal(patternStyles({ src: 'builtin:sine' }, null, box), null);
});

test('adding one writes the whole Patterns node where there is none, and the pattern alone where there is', () => {
  const label = createControl('Label');
  const first = addPatternPatch(label._children.Background);
  assert.equal(first.name, 'pattern1');
  assert.deepEqual(Object.keys(first.patch), ['Background.Patterns']);
  for (const [path, value] of Object.entries(first.patch)) setNestedValue(label, path, value);
  assert.equal(label._children.Background._children.Patterns._children.pattern1.src, 'builtin:sine');
  const second = addPatternPatch(label._children.Background, 'Background', { place: 'front' });
  assert.deepEqual(Object.keys(second.patch), ['Background.Patterns.pattern2']);
  for (const [path, value] of Object.entries(second.patch)) setNestedValue(label, path, value);
  assert.deepEqual(patternEntries(label._children.Background).map(([name]) => name), ['pattern1', 'pattern2']);
  assert.equal(nextPatternName(label._children.Background), 'pattern3');
  // A field written by path lands on the pattern (as the editor and a script's set() write it).
  setNestedValue(label, 'Background.Patterns.pattern2.tint', 'FF00FFFF');
  assert.equal(readPattern(label._children.Background._children.Patterns._children.pattern2).tint, 'FF00FFFF');
  assert.equal(patternLabel('pattern2'), 'Pattern 2');
  assert.equal(patternLabel('wave'), 'wave');
});

test('a Label with a pattern is not scenery, and a part with one is never baked into a still', () => {
  const plain = labelWith();
  assert.equal(isScenery(plain), true);
  const waved = labelWith({ speed: 30 });
  assert.equal(hasPatterns(waved._children.Background), true);
  assert.equal(patternsMove(waved._children.Background), true);
  assert.equal(isScenery(waved), false, 'the ground is a still picture; a moving wave would freeze in it');
  const switchedOff = labelWith({ enabled: false });
  assert.equal(isScenery(switchedOff), true, 'a pattern switched off draws nothing');

  const component = createControl('CustomComponent');
  component._children.Parts = { _type: 'Parts', _children: { plate: { _type: 'Part', _children: { Background: { _type: 'Background', _children: {} } } } } };
  const { patch } = addPatternPatch(component._children.Parts._children.plate._children.Background, 'Parts.plate.Background');
  for (const [path, value] of Object.entries(patch)) setNestedValue(component, path, value);
  assert.ok(movingPartNames(component).has('plate'));
});

test('each pattern\'s tint is a target, under Background in the path bar, on the colour timing', () => {
  const waved = labelWith({ speed: 30 }, { place: 'front' });
  const offered = offeredTargetsFor(waved, 'transition', { onControl: true }).filter((entry) => entry.pattern);
  assert.deepEqual(offered.map((entry) => entry.label), ['Pattern 1 tint', 'Pattern 2 tint']);
  const target = buildTarget(CONTROL_ITSELF, offered[0]);
  assert.equal(target.path, 'Background.Patterns.pattern1.tint');
  const status = targetStatus(target, []);
  assert.equal(status.works, true);
  assert.equal(status.animates, 'colour');
  assert.deepEqual(targetSteps(target), ['Background', 'Pattern 1 tint']);
  const background = targetTree(waved).find((place) => place.id === 'Background');
  assert.ok(background.properties.some((entry) => entry.label === 'Pattern 2 tint'));
  // A control with none offers none.
  assert.equal(offeredTargetsFor(labelWith(), 'transition', { onControl: true }).some((entry) => entry.pattern), false);
});

test('a Label draws its patterns: one behind the text, one in front of it, each moving', () => {
  const waved = labelWith({ speed: 32 }, { place: 'front', tint: 'FF00FFFF', repeat: 'both', direction: 45, speed: 20 });
  const { body } = render(CanvasControl, { props: { control: waved, scale: 1, editorInteractionEnabled: false } });
  const layers = [...body.matchAll(/class="pattern-layer[^"]*"[^>]*data-pattern="([^"]+)"[^>]*data-place="([^"]+)"/g)].map(([, name, place]) => `${name}:${place}`);
  assert.deepEqual(layers.sort(), ['pattern1:behind', 'pattern2:front']);
  assert.match(body, /class="pattern-move-x[^"]*"[^>]*animation-duration:2000ms/);
  assert.match(body, /class="pattern-move-y/, 'the diagonal one has its second mover');
  // In front means after the words in the markup, so it paints over them.
  assert.ok(body.indexOf('data-place="front"') > body.lastIndexOf('Wave'), 'drawn after the text');
  assert.ok(body.indexOf('data-place="behind"') < body.lastIndexOf('Wave'), 'drawn before the text');
});

test('on the design canvas they are drawn still: the canvas never moves on its own', () => {
  const waved = labelWith({ speed: 32 }, { place: 'front', repeat: 'both', direction: 45, speed: 20 });
  const { body } = render(CanvasControl, { props: { control: waved, scale: 1, editorInteractionEnabled: true } });
  assert.equal((body.match(/class="pattern-layer/g) ?? []).length, 2, 'both drawn');
  assert.ok(!/pattern-move-[xy]/.test(body), 'neither moving');
});
