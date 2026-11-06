// pictureRecolour.test.js — a picture's colour changed, its light kept (utils/pictureRecolour.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  colourRgb, drawnColour, recolourPixels, pictureColour, pictureColourSettings, withRecolouredPicture,
  withColourFollows, pictureLayerKind, litLayerOf, rgbColour, recolourGroupPixels, decodeLight,
  lightMapOf, lightRoleOf, colourOfNames, metalNames,
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

// The add-on's own split of a look (ceditor_layers.py part_look, add_part, light_code), in sRGB 0 to 1.
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const beyond = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.max(0, x) ** (1 / 2.4) - 0.055);
const srgb = (x) => Math.min(1, beyond(x));
const code = (x) => (x >= 2 ** -8 ? Math.min(255, Math.max(1, Math.round((Math.log2(x) + 8) * 255 / 16))) : 0);
const clamp = (v) => Math.max(0, Math.min(1, v));

/**
 * A row of pixels of one part, as the add-on writes them: each `{ c, X, G, depth, alpha }` (the
 * colour in linear light, the light on it, its gloss, how far inside, how much of the pixel it covers),
 * the same in each channel. Its colour, shading and highlights layers, and the light and gloss beside it.
 */
function written(pixels, { metal = false } = {}) {
  const n = pixels.length;
  const make = () => new Uint8ClampedArray(n * 4);
  const layer = make(); const shading = make(); const highlights = make(); const lighting = make(); const gloss = make();
  pixels.forEach(({ c, X, G, depth, alpha = 1 }, i) => {
    const e = srgb(c);
    const lit = c * X;
    const shade = clamp(srgb(lit) / e);
    const added = clamp((metal ? beyond(lit + G) : srgb(lit + G)) - e * shade);
    const whole = srgb(lit + G);
    const colour = depth >= 1 ? e : clamp((whole - depth * added) / (1 - depth + depth * shade));
    for (let k = 0; k < 3; k += 1) {
      layer[i * 4 + k] = Math.round(colour * 255);
      shading[i * 4 + k] = Math.round(shade * 255);
      highlights[i * 4 + k] = Math.round(added * 255);
      lighting[i * 4 + k] = code(X);
      gloss[i * 4 + k] = code(G);
    }
    layer[i * 4 + 3] = Math.round(alpha * 255);
    shading[i * 4 + 3] = Math.round(depth * 255);
    highlights[i * 4 + 3] = Math.round(depth * 255);
    lighting[i * 4 + 3] = 255;
    gloss[i * 4 + 3] = 255;
  });
  const box = { x: 0, y: 0, width: n, height: 1 };
  return { layer: { pixels: layer, box }, shading: { pixels: shading, box }, highlights: { pixels: highlights, box }, lighting, gloss };
}

/** What the browser shows of pixel `i`: the colour layer, multiplied by the shading and the highlights added, as they cover it. */
function shown(result, i, k = 0) {
  const v = result.colour[i * 4 + k] / 255;
  const sA = result.shading ? result.shading[i * 4 + 3] / 255 : 0;
  const s = result.shading ? result.shading[i * 4 + k] / 255 : 1;
  const hA = result.highlights ? result.highlights[i * 4 + 3] / 255 : 0;
  const h = result.highlights ? result.highlights[i * 4 + k] / 255 : 0;
  return Math.min(1, v * (1 - sA + sA * s) + hA * h);
}

test('a part with the light on it written is worked out again in a new colour, lit as before', () => {
  // A pale grey part: inside lit and with a sheen, half way in, at its edge, in shadow, and a glint.
  const part = [
    { c: 0.55, X: 0.9, G: 0.04, depth: 1 },
    { c: 0.55, X: 1.3, G: 0.12, depth: 1 / 3 },
    { c: 0.55, X: 1.1, G: 0.02, depth: 0, alpha: 0.5 },
    { c: 0.55, X: 0.2, G: 0.01, depth: 1 },
    { c: 0.55, X: 3, G: 2.5, depth: 1 },
  ];
  const file = written(part);
  const drawn = [Math.round(srgb(0.55) * 255), Math.round(srgb(0.55) * 255), Math.round(srgb(0.55) * 255)];
  // In the colour it was drawn in: as written.
  const same = recolourGroupPixels({ colour: drawn, drawn, ...file });
  part.forEach((_, i) => assert.ok(Math.abs(shown(same, i) * 255 - Math.min(1, srgb(0.55 * part[i].X + part[i].G)) * 255) <= 2.5, `pixel ${i} as drawn: ${shown(same, i) * 255}`));
  // In red: each channel the new colour times the same light, plus the same gloss, as Blender adds them.
  const red = [178, 34, 34];
  const result = recolourGroupPixels({ colour: red, drawn, ...file });
  part.forEach(({ X, G }, i) => red.forEach((value, k) => {
    const wanted = srgb(lin(value / 255) * decodeLight(code(X)) + decodeLight(code(G))) * 255;
    assert.ok(Math.abs(shown(result, i, k) * 255 - wanted) <= 2, `pixel ${i}, channel ${k}: ${(shown(result, i, k) * 255).toFixed(1)} against ${wanted.toFixed(1)}`);
  }));
  // Changed in proportion instead, the sheen on a dark channel comes out short, as it did.
  const proportion = recolourPixels(file.layer.pixels, red, drawn);
  const sheen = 1;
  const wantedGreen = srgb(lin(34 / 255) * 1.3 + 0.12) * 255;
  const inProportion = (proportion[sheen * 4 + 1] / 255 * (1 - 1 / 3 + (1 / 3) * file.shading.pixels[sheen * 4 + 1] / 255) + (1 / 3) * file.highlights.pixels[sheen * 4 + 1] / 255) * 255;
  assert.ok(Math.abs(inProportion - wantedGreen) > 4, `in proportion: ${inProportion.toFixed(1)} against ${wantedGreen.toFixed(1)}`);
  assert.equal(decodeLight(0), 0);
  for (const light of [0.01, 1, 10, 200]) assert.ok(Math.abs(decodeLight(code(light)) / light - 1) < 0.023, `${light} within half a step`);
});

test('a metal\'s glint, light many times white, keeps the new colour as Blender shows it', () => {
  // Silver taken to brass: at the glint the blue of brass is far from white, the red and green white.
  const part = [{ c: 0.8, X: 12, G: 0, depth: 1 }, { c: 0.8, X: 0.7, G: 0, depth: 1 }];
  const file = written(part, { metal: true });
  const drawn = Array(3).fill(Math.round(srgb(0.8) * 255));
  const brass = [205, 160, 70];
  const result = recolourGroupPixels({ colour: brass, drawn, metal: true, ...file });
  part.forEach(({ X }, i) => brass.forEach((value, k) => {
    const wanted = srgb(lin(value / 255) * decodeLight(code(X))) * 255;
    assert.ok(Math.abs(shown(result, i, k) * 255 - wanted) <= 2, `pixel ${i}, channel ${k}: ${(shown(result, i, k) * 255).toFixed(1)} against ${wanted.toFixed(1)}`);
  }));
  assert.ok(shown(result, 0, 2) * 255 < 230 && shown(result, 0, 2) * 255 > 150, 'the glint\'s blue is brass, not white and not dark');
});

test('a file says which layers go with which, and which are metal', () => {
  assert.deepEqual(lightMapOf('skirt lighting'), { of: 'skirt', kind: 'lighting' });
  assert.deepEqual(lightMapOf('pointer gloss at -27'), { of: 'pointer at -27', kind: 'gloss' });
  assert.equal(lightMapOf('skirt highlights'), null);
  assert.deepEqual(['skirt shading', 'cap highlights', 'pointer reflection'].map(lightRoleOf), ['shading', 'highlights', '']);
  const xmp = '<ceditor:colourOf><rdf:Bag><rdf:li>skirt shading=skirt</rdf:li><rdf:li>cap highlights=cap</rdf:li></rdf:Bag></ceditor:colourOf><ceditor:metal><rdf:Bag><rdf:li>cap</rdf:li></rdf:Bag></ceditor:metal>';
  assert.deepEqual([...colourOfNames(xmp)], [['skirt shading', 'skirt'], ['cap highlights', 'cap']]);
  assert.deepEqual([...metalNames(xmp)], ['cap']);
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
  const skirt = picturePart('skirt', { imageColour: 'FFB22222', imageColourDrawn: 'FFC1C1BC' });
  const wanted = pictureColour(skirt);
  assert.deepEqual([wanted.kind, wanted.colour, wanted.drawn], ['fill', [178, 34, 34], [193, 193, 188]]);
  const drawn = withRecolouredPicture(skirt, { key: wanted.key, kind: 'fill', src: 'data:red' });
  assert.deepEqual([drawn._children.Background._children.Fill.imageSrc, drawn._children.Background._children.Fill.imageColour], ['data:red', '']);
  assert.equal(withRecolouredPicture(skirt, { key: 'stale', kind: 'fill', src: 'data:red' }), skirt, 'made for another colour: left as it is');
  assert.equal(skirt._children.Background._children.Fill.imageSrc, 'data:image/png;base64,skirt', 'the part itself is not changed');

  const pointer = framesPart('pointer', { colour: 'FFF0F0E8', colourDrawn: 'FFE99551' });
  const frames = pictureColour(pointer);
  assert.deepEqual(frames.frames, [{ src: 'data:a' }, { src: 'data:b' }]);
  const turned = withRecolouredPicture(pointer, { key: frames.key, kind: 'frames', frames: ['data:a2', 'data:b2'] });
  assert.deepEqual(turned._children.Image.frames.map((frame) => frame.source), ['data:a2', 'data:b2']);
  assert.equal(turned._children.Image.colour, '');
  assert.deepEqual(pictureColourSettings(pointer).path, 'Image.colour');
  assert.deepEqual(pictureColourSettings(skirt).path, 'Background.Fill.imageColour');
});

test('a colour layer, its shading and its highlights go together; a reflection only follows', () => {
  const lit = { imageColourLighting: 'data:lighting', imageColourGloss: 'data:gloss' };
  const cap = picturePart('cap', { imageColour: 'FFCDA046', imageColourDrawn: 'FFE7E7E9', imageColourMetal: true, ...lit });
  const shading = picturePart('cap_shading', { imageColourFollows: 'cap', imageColourRole: 'shading' }, 'multiply');
  const shine = picturePart('cap_highlights', { imageColourFollows: 'cap', imageColourRole: 'highlights' }, 'plus-lighter');
  const reflection = framesPart('pointer_reflection', { colourFollows: 'cap' }, 'plus-lighter');
  const parts = withColourFollows([['cap', cap], ['cap_shading', shading], ['cap_highlights', shine], ['pointer_reflection', reflection]]);
  const [, leader] = parts[0];
  assert.equal(leader._colourGroup.role, 'colour');
  assert.equal(leader._colourGroup.metal, true);
  assert.deepEqual(parts.slice(1, 3).map(([, part]) => part._colourGroup.role), ['shading', 'highlights']);
  assert.equal(new Set(parts.slice(0, 3).map(([, part]) => part._colourGroup.key)).size, 1, 'one group, worked out once');
  assert.deepEqual(parts.slice(0, 3).map(([, part]) => pictureColour(part).kind), ['group', 'group', 'group']);
  assert.deepEqual(pictureColour(parts[2][1]).colour, [205, 160, 70], 'the highlights take the cap\'s colour');
  // The reflection only follows: changed in proportion, by the cap's change of colour.
  assert.equal(parts[3][1]._colourGroup, undefined);
  const wanted = pictureColour(parts[3][1]);
  assert.deepEqual([wanted.kind, wanted.colour, wanted.drawn], ['frames', [205, 160, 70], [231, 231, 233]]);
  // Following a part that is not there: as drawn.
  assert.equal(pictureColour(withColourFollows([['cap_highlights', shine]])[0][1]), null);
  // Made for it, its picture is replaced and its colour cleared: nothing recolours it again.
  const made = { key: pictureColour(parts[0][1]).key, kind: 'fill', src: 'data:brass' };
  const drawnNow = withRecolouredPicture(parts[0][1], made);
  assert.deepEqual([drawnNow._children.Background._children.Fill.imageSrc, drawnNow._colourGroup, pictureColour(drawnNow)], ['data:brass', undefined, null]);
  assert.deepEqual(pictureColourSettings(cap).lit, true);
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
