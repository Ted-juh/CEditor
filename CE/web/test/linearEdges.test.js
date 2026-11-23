// linearEdges.test.js — a picture's edge mixed with what is under it as light mixes (utils/linearEdges.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { colourUnderControl, linearEdgeMix, linearEdgeNames, mixEdgesInLinearLight, withEdgeSources } from '../src/CE_Application/utils/linearEdges.js';

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

test('an edge pixel laid in sRGB with the colour and opacity worked out shows as light mixes it, in each channel', () => {
  for (const [colour, under, coverage] of [
    [[1, 1, 1], [0, 0, 0], 0.5], [[0.9, 0.85, 0.8], [0.1, 0.1, 0.12], 0.3], [[0.05, 0.05, 0.05], [0.95, 0.9, 0.9], 0.7],
    // A saturated colour over a different one: red over grey, its red pulling one way and its green and
    // blue the other, which no one opacity could give.
    [[0.75, 0.15, 0.15], [0.45, 0.45, 0.47], 0.5], [[0.15, 0.3, 0.7], [0.8, 0.8, 0.78], 0.25],
  ]) {
    const { colour: rgb, alpha } = linearEdgeMix(colour, coverage, under);
    for (let c = 0; c < 3; c += 1) {
      const shown = alpha * rgb[c] + (1 - alpha) * under[c];
      const light = toSrgb(coverage * toLinear(colour[c]) + (1 - coverage) * toLinear(under[c]));
      assert.ok(Math.abs(shown - light) < 1e-6, `${colour} over ${under} at ${coverage}, channel ${c}: ${shown} against ${light}`);
    }
    assert.ok(alpha >= coverage, 'the opacity is the coverage, or more where a channel needs it');
  }
  // A pale edge over black needs more than its coverage; over a grey alike, its coverage and colour stay.
  assert.ok(linearEdgeMix([1, 1, 1], 0.5, [0, 0, 0]).alpha > 0.7);
  const alike = linearEdgeMix([0.5, 0.5, 0.5], 0.4, [0.501, 0.5, 0.5]);
  assert.ok(Math.abs(alike.alpha - 0.4) < 0.01 && alike.colour.every((v) => Math.abs(v - 0.5) < 0.01));
});

test('what is under an edge is the panel with the layers under the part laid on it', () => {
  const solid = (w, h, rgba) => { const p = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i += 1) p.set(rgba, i * 4); return p; };
  // A pale part's one-pixel edge (half covered) over a shadow (black at half) on the panel.
  const shadow = { width: 3, height: 1, pixels: solid(3, 1, [0, 0, 0, 128]), x: 0, y: 0, blend: 'normal' };
  const part = { width: 3, height: 1, pixels: new Uint8ClampedArray([230, 230, 230, 128, 230, 230, 230, 255, 0, 0, 0, 0]), x: 0, y: 0, linear: true };
  const mixed = mixEdgesInLinearLight([shadow, part], [0.6, 0.6, 0.6]);
  const under = 0.6 * (1 - 128 / 255);
  const want = linearEdgeMix([230 / 255, 230 / 255, 230 / 255], 128 / 255, [under, under, under]);
  assert.equal(mixed.get(1)[3], Math.round(want.alpha * 255));
  assert.equal(mixed.get(1)[0], Math.round(want.colour[0] * 255));
  assert.equal(mixed.get(1)[7], 255, 'covered whole, it stays');
  // Without the shadow under it, its edge is mixed against the panel alone, and differs.
  const alone = mixEdgesInLinearLight([{ ...shadow, visible: false }, part], [0.6, 0.6, 0.6]);
  assert.notDeepEqual([...alone.get(1).slice(0, 4)], [...mixed.get(1).slice(0, 4)]);
  // Light on the panel under it (colour dodge) brightens what it is mixed against.
  const dodged = mixEdgesInLinearLight([{ ...shadow, pixels: solid(3, 1, [128, 128, 128, 255]), blend: 'color-dodge' }, part], [0.4, 0.4, 0.4]);
  const lit = [0.4 / (1 - 128 / 255), 0.4 / (1 - 128 / 255), 0.4 / (1 - 128 / 255)].map((v) => Math.min(1, v));
  assert.equal(dodged.get(1)[3], Math.round(linearEdgeMix([230 / 255, 230 / 255, 230 / 255], 128 / 255, lit).alpha * 255));
  // A layer not marked is left as it is.
  assert.equal(mixEdgesInLinearLight([shadow, { ...part, linear: false }], [0.6, 0.6, 0.6]).size, 0);
});

test('the colour under a control: the panel\'s, with a filled control under it laid over it', () => {
  const box = (id, x, y, w, h, colour) => ({ _children: { Core: { id }, Transform: { x, y, width: w, height: h }, Background: { _children: { Fill: { solidEnabled: true, colour } } } } });
  const knob = box('knob', 100, 100, 50, 50, '00000000');
  const plate = box('plate', 80, 80, 120, 120, 'FFC04010');
  const elsewhere = box('elsewhere', 0, 0, 40, 40, 'FFFFFFFF');
  const panel = { bgColour: '102030', controls: [elsewhere, plate, knob] };
  const close = (got, want) => got.every((v, i) => Math.abs(v - want[i]) < 1e-6);
  assert.ok(close(colourUnderControl(panel, knob), [0xC0 / 255, 0x40 / 255, 0x10 / 255]), 'on the plate');
  assert.ok(close(colourUnderControl({ ...panel, controls: [knob, plate] }, knob), [0x10 / 255, 0x20 / 255, 0x30 / 255]), 'a plate drawn over it is not under it');
  const half = box('half', 80, 80, 120, 120, '80FFFFFF');
  const got = colourUnderControl({ bgColour: '000000', controls: [half, knob] }, knob);
  assert.ok(Math.abs(got[0] - 128 / 255) < 1e-6, 'a see-through plate, laid over the panel');
});

test('the file names the layers; a part of a control draws its mixed picture', () => {
  const xmp = '<x:xmpmeta><rdf:RDF><rdf:Description xmlns:ceditor="https://github.com/Ted-juh/CEditor/ns/layers/1.0/">'
    + '<ceditor:linearEdges><rdf:Bag><rdf:li>skirt</rdf:li><rdf:li>lens &amp; ring</rdf:li></rdf:Bag></ceditor:linearEdges></rdf:Description></rdf:RDF></x:xmpmeta>';
  assert.deepEqual([...linearEdgeNames(xmp)], ['skirt', 'lens & ring']);
  assert.deepEqual([...linearEdgeNames('')], []);
  const part = { name: 'skirt', _children: { Background: { _children: { Fill: { imageSrc: 'a', imageEnabled: true } } }, Layout: {} } };
  const entries = [['skirt', part], ['cap', { name: 'cap' }]];
  const drawn = withEdgeSources(entries, new Map([['skirt', 'b']]));
  assert.equal(drawn[0][1]._children.Background._children.Fill.imageSrc, 'b');
  assert.equal(part._children.Background._children.Fill.imageSrc, 'a', 'the document is left as it is');
  assert.equal(drawn[1][1], entries[1][1]);
  assert.equal(withEdgeSources(entries, null), entries);
});
