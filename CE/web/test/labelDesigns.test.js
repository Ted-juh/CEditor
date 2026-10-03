// labelDesigns.test.js — every set but Graphite gives its labels a design, and each design is
// what its name says (models/labelDesigns.js).
//
// A Label used to be the one ready-made control a set had no design for: the same white 2px box in
// all seventy-eight. These pin the five treatments, the sets they go to, and the two rules every
// design obeys: Graphite is untouched, and an author's own choice on a label survives.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILT_IN_CONTROL_SETS, getControlSet, resolveToken } from '../src/CE_Application/models/controlSets.js';
import { LABEL_TREATMENTS, labelTreatmentFor } from '../src/CE_Application/models/labelDesigns.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const labelUnder = (setId, overrides) => resolveControlForSet(createControl('Label', overrides), getControlSet(setId))._children;
const luminance = (hex) => {
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(String(hex).slice(-6).slice(at, at + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('Graphite has no label design: its labels are what they always were', () => {
  assert.equal(labelTreatmentFor(getControlSet('graphite')), null);
  const label = labelUnder('graphite');
  assert.equal(label.Background._children.Fill.colour, 'FF3A3A3A');
  assert.equal(label.Background._children.Border.enabled, true);
  assert.equal(label.Background._children.Border.colour, 'FFFFFFFF');
  assert.equal(label.Text._children.Effects.shadowEnabled, false);
  assert.equal(label.Text._children.Effects.glowEnabled, false);
});

test('every other set gives its labels one of the five treatments, and every treatment is used', () => {
  const used = new Set();
  for (const set of BUILT_IN_CONTROL_SETS.filter((s) => s.id !== 'graphite')) {
    const treatment = labelTreatmentFor(set);
    assert.ok(LABEL_TREATMENTS.includes(treatment), `${set.id}: ${treatment}`);
    used.add(treatment);
  }
  assert.deepEqual([...used].sort(), [...LABEL_TREATMENTS].sort());
});

test('silkscreen: the lettering sits on the panel, with no plate and no box', () => {
  for (const id of ['tolex', 'ember', 'pop', 'chicken-head']) {
    assert.equal(labelTreatmentFor(getControlSet(id)), 'silkscreen', id);
    const label = labelUnder(id);
    assert.ok(label.Background._children.Fill.colour.startsWith('00'), `${id} draws no plate`);
    assert.equal(label.Background._children.Border.enabled, false, `${id} draws no box`);
  }
});

test('engraved: only metal panels, with the lip on the side the light catches', () => {
  const engraved = BUILT_IN_CONTROL_SETS.filter((s) => labelTreatmentFor(s) === 'engraved');
  assert.ok(engraved.length >= 10, `${engraved.length} engraved sets`);
  for (const set of engraved) {
    assert.ok(['blast', 'brushed', 'hammer'].includes(set.panel?.material?.kind), `${set.id} is metal`);
    const effects = labelUnder(set.id).Text._children.Effects;
    assert.equal(effects.shadowEnabled, true, set.id);
    assert.equal(effects.shadowBlur, 0, `${set.id}: a lip, not a blur`);
    const lightLettering = luminance(resolveToken('text.primary', set)) > luminance(resolveToken('panel.surface', set));
    assert.equal(effects.shadowOffsetY, lightLettering ? -1 : 1, set.id);
  }
});

test('backlit: the lettering glows in its own colour', () => {
  for (const id of ['neon', 'backlit', 'obsidian', 'phosphor']) {
    const label = labelUnder(id);
    assert.equal(label.Text._children.Effects.glowEnabled, true, id);
    assert.equal(label.Text._children.Effects.glowColour.slice(2), label.Text._children.Fill.colour.slice(2), `${id} glows in the ink`);
    assert.equal(label.Background._children.Border.enabled, false, id);
  }
});

test('plate: a brass plate with a rim, and dark lettering that reads on it', () => {
  for (const id of ['walnut', 'valve', 'saddle', 'valve-console', 'brassworks']) {
    const label = labelUnder(id);
    const plate = label.Background._children.Fill.colour;
    assert.ok(plate.startsWith('FF'), `${id} draws a plate`);
    assert.equal(label.Background._children.Border.enabled, true, id);
    assert.equal(label.Background._children.Border.thickness, 1, id);
    assert.ok(contrast(plate, label.Text._children.Fill.colour) >= 4.5, `${id}: lettering on the plate`);
  }
});

test('frame: a hairline in the ink colour around the lettering', () => {
  const label = labelUnder('blueprint');
  assert.ok(label.Background._children.Fill.colour.startsWith('00'));
  assert.equal(label.Background._children.Border.enabled, true);
  assert.equal(label.Background._children.Border.thickness, 1);
  assert.equal(label.Background._children.Border.colour, resolveToken('text.primary', getControlSet('blueprint')));
});

test('a label an author coloured keeps its colours under every design', () => {
  const authored = {
    Background: { _children: { Fill: { colour: 'FF123456' } } },
    Text: { _children: { Fill: { colour: 'FFFFEE00' } } },
  };
  for (const id of ['tolex', 'machined', 'neon', 'walnut', 'blueprint']) {
    const label = labelUnder(id, authored);
    assert.equal(label.Background._children.Fill.colour, 'FF123456', `${id} plate`);
    assert.equal(label.Text._children.Fill.colour, 'FFFFEE00', `${id} lettering`);
  }
});
