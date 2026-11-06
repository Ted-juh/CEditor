// pictureRecolour.test.js — a picture's colour changed, its light kept (utils/pictureRecolour.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  colourRgb, drawnColour, recolourPixels, pictureColour, pictureColourSettings, withRecolouredPicture,
  withColourFollows, pictureLayerKind, litLayerOf, rgbColour,
} from '../src/CE_Application/utils/pictureRecolour.js';

/** RGBA pixels from [r, g, b, a] tuples. */
const pixels = (...tuples) => Uint8ClampedArray.from(tuples.flat());
const at = (data, i) => [...data.slice(i * 4, i * 4 + 4)];

test('a colour is read as AARRGGBB, RRGGBB or a role; a clear one is no colour', () => {
  assert.deepEqual(colourRgb('FFB22222'), [178, 34, 34]);
  assert.deepEqual(colourRgb('#285aaa'), [40, 90, 170]);
  assert.equal(colourRgb('00FFFFFF'), null);
  assert.equal(colourRgb(''), null);
  assert.equal(colourRgb('{no.such.role}'), null);
  const role = colourRgb('{control.body}');
  assert.equal(role?.length, 3, 'a role of the base set resolves');
  assert.equal(rgbColour([178, 34, 34]), 'FFB22222');
});

test('the drawn colour is the median of the pixels the picture covers most', () => {
  // A pale part: three inside, one at its edge half covered, one clear.
  const picture = pixels([193, 193, 188, 255], [195, 192, 190, 255], [190, 194, 186, 254], [120, 120, 118, 128], [0, 0, 0, 0]);
  assert.equal(drawnColour(picture), 'FFC1C1BC');
  assert.equal(drawnColour(pixels([0, 0, 0, 0])), '');
  // A thin part that covers no pixel whole: its most covered pixels.
  assert.equal(drawnColour(pixels([233, 149, 81, 200], [10, 10, 10, 90])), 'FFE99551');
});

test('the drawn colour becomes the new one, and every other pixel keeps its proportion to it', () => {
  const drawn = [200, 100, 50];
  const colour = [100, 150, 25];
  const picture = pixels([200, 100, 50, 255], [100, 50, 25, 255], [200, 100, 50, 77], [9, 9, 9, 0]);
  const out = recolourPixels(picture, colour, drawn);
  assert.deepEqual(at(out, 0), [100, 150, 25, 255], 'the drawn colour, exactly');
  assert.deepEqual(at(out, 1), [50, 75, 13, 255], 'half as bright, as before');
  assert.deepEqual(at(out, 2), [100, 150, 25, 77], 'its opacity untouched');
  assert.deepEqual(at(out, 3), [9, 9, 9, 0], 'a clear pixel untouched');
  // A channel the drawn colour hardly has is moved, not scaled: black taken to red.
  assert.deepEqual(at(recolourPixels(pixels([2, 2, 2, 255], [30, 30, 30, 255]), [180, 30, 30], [2, 2, 2]), 0), [180, 30, 30, 255]);
});

test('with the share the add-on writes, a lit edge is as Blender would light the new colour', () => {
  // At a part's edge its colour layer holds its look: colour × shading + highlights. The share there
  // is the shading, and the edge recoloured is the new colour × the same shading + the same highlights.
  const C = [190, 190, 185];
  const C2 = [178, 34, 34];
  const S = [0.6, 0.6, 0.6];
  const H = [40, 40, 40];
  const look = C.map((c, i) => c * S[i] + H[i]);
  const picture = pixels([...C, 255], [...look.map(Math.round), 200]);
  const share = pixels([255, 255, 255, 255], [...S.map((s) => Math.round(s * 255)), 255]);
  const out = recolourPixels(picture, C2, C, share);
  assert.deepEqual(at(out, 0), [...C2, 255]);
  const wanted = C2.map((c, i) => c * S[i] + H[i]);
  at(out, 1).slice(0, 3).forEach((value, i) => assert.ok(Math.abs(value - wanted[i]) <= 1, `${value} against ${wanted[i]}`));
  // Without the share the highlights at the edge are scaled with the rest: tinted.
  const scaled = recolourPixels(picture, C2, C);
  assert.ok(Math.abs(at(scaled, 1)[1] - wanted[1]) > 20);
});

const picturePart = (name, fill = {}, blend = 'normal') => ({
  _type: 'Part', name,
  _children: {
    Background: { _children: { Fill: { solidEnabled: false, imageEnabled: true, imageSrc: `data:image/png;base64,${name}`, ...fill } } },
    Effects: { _children: { Blend: { mode: blend } } },
  },
});
const framesPart = (name, image = {}, blend = 'normal') => ({
  _type: 'Part', name,
  _children: {
    Image: { mode: 'frames', frames: [{ source: 'data:a' }, { source: 'data:b', share: 'data:s' }], frameIndex: 0, ...image },
    Effects: { _children: { Blend: { mode: blend } } },
  },
});

test('a picture layer and a part of frames say what they need, and take what was made for them', () => {
  assert.equal(pictureColour(picturePart('skirt')), null, 'no colour: drawn as it is');
  assert.equal(pictureColour(picturePart('skirt', { imageColour: 'FFC1C1BC', imageColourDrawn: 'FFC1C1BC' })), null, 'its own colour: as it is');
  const skirt = picturePart('skirt', { imageColour: 'FFB22222', imageColourDrawn: 'FFC1C1BC', imageColourShare: 'data:share' });
  const wanted = pictureColour(skirt);
  assert.deepEqual([wanted.kind, wanted.colour, wanted.drawn, wanted.share], ['fill', [178, 34, 34], [193, 193, 188], 'data:share']);
  const drawn = withRecolouredPicture(skirt, { key: wanted.key, kind: 'fill', src: 'data:red' });
  assert.deepEqual([drawn._children.Background._children.Fill.imageSrc, drawn._children.Background._children.Fill.imageColour], ['data:red', '']);
  assert.equal(withRecolouredPicture(skirt, { key: 'stale', kind: 'fill', src: 'data:red' }), skirt, 'made for another colour: left as it is');
  assert.equal(skirt._children.Background._children.Fill.imageSrc, 'data:image/png;base64,skirt', 'the part itself is not changed');

  const pointer = framesPart('pointer', { colour: 'FFF0F0E8', colourDrawn: 'FFE99551' });
  const frames = pictureColour(pointer);
  assert.deepEqual(frames.frames, [{ src: 'data:a', share: '' }, { src: 'data:b', share: 'data:s' }]);
  const turned = withRecolouredPicture(pointer, { key: frames.key, kind: 'frames', frames: ['data:a2', 'data:b2'] });
  assert.deepEqual(turned._children.Image.frames.map((frame) => frame.source), ['data:a2', 'data:b2']);
  assert.deepEqual(turned._children.Image.frames[1].share, 'data:s');
  assert.equal(turned._children.Image.colour, '');
  assert.deepEqual(pictureColourSettings(pointer).path, 'Image.colour');
  assert.deepEqual(pictureColourSettings(skirt).path, 'Background.Fill.imageColour');
});

test('a metal\'s highlights take its colour: the part they follow gives its colour and drawn colour', () => {
  const cap = picturePart('cap', { imageColour: 'FFCDA046', imageColourDrawn: 'FFE7E7E9' });
  const shine = picturePart('cap_highlights', { imageColourFollows: 'cap' }, 'plus-lighter');
  const [, followed] = withColourFollows([['cap', cap], ['cap_highlights', shine]])[1];
  const wanted = pictureColour(followed);
  assert.deepEqual([wanted.colour, wanted.drawn, wanted.share], [[205, 160, 70], [231, 231, 233], '']);
  // A highlight recoloured with the default share is scaled by the metal's change of colour.
  const out = recolourPixels(pixels([200, 200, 200, 255]), wanted.colour, wanted.drawn);
  assert.deepEqual(at(out, 0), [177, 139, 60, 255]);
  // Following a part that is not there: as drawn.
  const alone = withColourFollows([['cap_highlights', shine]]);
  assert.equal(pictureColour(alone[0][1]), null);
});

test('the designer tells a picture, a part of frames and light apart, and which layer a light lights', () => {
  const parts = {
    skirt: picturePart('skirt'),
    skirt_shading: picturePart('skirt_shading', {}, 'multiply'),
    cap: picturePart('cap'),
    cap_highlights: picturePart('cap_highlights', {}, 'plus-lighter'),
    bounce: picturePart('bounce', {}, 'color-dodge'),
    bounce_shine: picturePart('bounce_shine', {}, 'plus-lighter'),
    shadow: picturePart('shadow'),
    pointer: framesPart('pointer'),
    pointer_shadow: framesPart('pointer_shadow'),
    pointer_reflection: framesPart('pointer_reflection', {}, 'plus-lighter'),
    pointer_shadow_pivot: picturePart('pointer_shadow_pivot'),
  };
  const kinds = Object.fromEntries(Object.entries(parts).map(([name, part]) => [name, pictureLayerKind(part, name)]));
  assert.deepEqual(kinds, {
    skirt: 'picture', skirt_shading: 'light', cap: 'picture', cap_highlights: 'light', bounce: 'light', bounce_shine: 'light',
    shadow: 'light', pointer: 'frames', pointer_shadow: 'light', pointer_reflection: 'light', pointer_shadow_pivot: 'picture',
  });
  assert.equal(pictureLayerKind({ _children: { Background: { _children: { Fill: { solidEnabled: true } } } } }, 'box'), '');
  const lights = Object.fromEntries(Object.keys(parts).map((name) => [name, litLayerOf(name, parts)]));
  assert.deepEqual(lights, {
    skirt: '', skirt_shading: 'skirt', cap: '', cap_highlights: 'cap', bounce: '', bounce_shine: '', shadow: '',
    pointer: '', pointer_shadow: 'pointer', pointer_reflection: 'pointer', pointer_shadow_pivot: '',
  });
});
