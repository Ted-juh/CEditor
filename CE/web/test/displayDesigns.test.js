// displayDesigns.test.js — the LCD, the Pixel Display and the Shape take their set's design
// (models/displayDesigns.js).
//
// The LCD took the set's four display colours and nothing else; the Pixel Display was a fixed white
// OLED in every set; a Shape was factory grey in every set, because the sets wrote only its
// Background, which a Shape keeps switched off. These pin what the sets now do to them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BUILT_IN_CONTROL_SETS, getControlSet, normalizeControlSetDefinition, resolveToken } from '../src/CE_Application/models/controlSets.js';
import { familyPatchFor, resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { contrast } from '../src/CE_Application/models/instrumentDesigns.js';
import { DISPLAY_TREATMENTS, DISPLAY_TYPES, displayTreatmentFor } from '../src/CE_Application/models/displayDesigns.js';

const others = BUILT_IN_CONTROL_SETS.filter((set) => set.id !== 'graphite');
const drawn = (type, set) => resolveControlForSet(createControl(type), set)._children;
function over(fill, base) {
  const a = parseInt(String(fill).slice(0, 2), 16) / 255;
  const ch = (hex, at) => parseInt(String(hex).slice(-6).slice(at, at + 2), 16);
  return 'FF' + [0, 2, 4].map((at) => Math.round(ch(fill, at) * a + ch(base, at) * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

test('Graphite\'s displays and shapes are what they always were', () => {
  const graphite = getControlSet('graphite');
  assert.equal(displayTreatmentFor(graphite), null);
  for (const type of DISPLAY_TYPES) assert.equal(familyPatchFor(graphite, type), null, type);
  // The forms are the factory's, untouched (only token references resolve to Graphite's colours).
  for (const [type, section] of [['LcdDisplay', 'Display'], ['PixelDisplay', 'Pixel'], ['Shape', 'Shape']]) {
    const factory = createControl(type)._children[section];
    const now = drawn(type, graphite)[section];
    for (const key of Object.keys(factory).filter((k) => !/Colour$|Tint$/.test(k))) {
      assert.deepEqual(now[key], factory[key], `${type}.${key}`);
    }
  }
  assert.equal(drawn('PixelDisplay', graphite).Pixel.litColour, 'FFF2F2F2', 'still the white OLED');
  assert.equal(drawn('Shape', graphite).Shape.fillColour, 'FF2A2A32', 'still factory grey');
});

test('a set\'s readout is read from its display window, and every kind is used', () => {
  const expected = { tolex: 'glow', valve: 'glow', neon: 'glow', rackmount: 'reflective', ceramic: 'reflective', phosphor: 'scan', obsidian: 'oled', blueprint: 'drafting', ivory: 'backlit' };
  for (const [id, treatment] of Object.entries(expected)) assert.equal(displayTreatmentFor(getControlSet(id)), treatment, id);
  assert.deepEqual([...new Set(others.map(displayTreatmentFor))].sort(), [...DISPLAY_TREATMENTS].sort());
});

test('every other set designs its LCD, its Pixel Display and its Shape, and they differ between sets', () => {
  for (const set of others) {
    for (const type of DISPLAY_TYPES) assert.ok(familyPatchFor(set, type), `${set.id} ${type}`);
  }
  const look = (id, type) => JSON.stringify(drawn(type, getControlSet(id))[type === 'LcdDisplay' ? 'Display' : type === 'PixelDisplay' ? 'Pixel' : 'Shape']);
  for (const type of DISPLAY_TYPES) {
    assert.notEqual(look('tolex', type), look('rackmount', type), `${type}: Tolex and Rackmount are the same`);
    assert.notEqual(look('neon', type), look('blueprint', type), `${type}: Neon and Blueprint are the same`);
  }
});

test('the Pixel Display shows the set\'s display, and both screens read', () => {
  for (const set of others) {
    const pixel = drawn('PixelDisplay', set).Pixel;
    for (const [key, role] of [['litColour', 'display.lit'], ['unlitColour', 'display.unlit'], ['screenColour', 'display.screen'], ['backlightColour', 'display.backlight']]) {
      assert.equal(pixel[key], resolveToken(role, set), `${set.id} Pixel.${key}`);
    }
    assert.ok(contrast(pixel.litColour, pixel.screenColour) >= 4.5, `${set.id}: lit on screen ${contrast(pixel.litColour, pixel.screenColour).toFixed(2)}:1`);
    const lcd = drawn('LcdDisplay', set).Display;
    assert.ok(contrast(lcd.litColour, lcd.screenColour) >= 4.5, `${set.id} LCD`);
    assert.equal(lcd.dotShape, pixel.dotShape, `${set.id}: one kind of cell on both screens`);
  }
});

test('a shape is drawn in the set\'s section language, and its line reads on its fill and on the bare panel', () => {
  for (const set of others) {
    const shape = drawn('Shape', set).Shape;
    assert.equal(shape.fillColour, resolveToken('section.surface', set), `${set.id} fill`);
    const panel = resolveToken('panel.surface', set);
    const fill = over(shape.fillColour.length === 8 ? shape.fillColour : `FF${shape.fillColour}`, panel);
    // A line kind has no fill: it sits on the panel, often as a divider. 3:1, as for any graphic that means something.
    assert.ok(contrast(over(shape.strokeColour, fill), fill) >= 3, `${set.id}: outline on its fill ${contrast(over(shape.strokeColour, fill), fill).toFixed(2)}:1`);
    assert.ok(contrast(over(shape.strokeColour, panel), panel) >= 3, `${set.id}: line on the panel ${contrast(over(shape.strokeColour, panel), panel).toFixed(2)}:1`);
  }
  assert.equal(drawn('Shape', getControlSet('tolex')).Shape.strokeWidth, 2, 'Tolex pipes its shapes');
  assert.equal(drawn('Shape', getControlSet('blueprint')).Shape.strokeStyle, 'dashed', 'Blueprint draws construction lines');
  assert.equal(drawn('Shape', getControlSet('machined')).Shape.cornerRadius <= 5, true, 'Machined mills tight corners');
});

test('a personal set gets them too, from its own colours', () => {
  const old = JSON.parse(readFileSync(new URL('./fixtures/tolex-before-set-designs.ceditor-controlset.json', import.meta.url), 'utf8')).set;
  const copy = normalizeControlSetDefinition({ ...old, id: 'tolex-copy', name: 'Tolex Copy' });
  assert.equal(displayTreatmentFor({ ...copy, id: copy.basedOn }), 'glow');
  for (const type of DISPLAY_TYPES) assert.ok(familyPatchFor(copy, type), type);
  const blue = normalizeControlSetDefinition({ ...copy, tokens: { ...copy.tokens, 'display.lit': 'FF6FE3FF' } });
  assert.equal(drawn('PixelDisplay', blue).Pixel.litColour, 'FF6FE3FF', 'its Pixel Display lights in its new colour');
});
