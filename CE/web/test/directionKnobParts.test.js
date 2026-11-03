// directionKnobParts.test.js — the synth sets' knobs drawn with the knob's own parts
// (models/directionKnobParts.js; docs/design/changeable-control-sets.md, piece B): no form named,
// every shape a property, and the parts the renderer gained to draw them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { EDITOR_PATHS } from '../src/CE_Application/models/controlSetDesigns.js';
import { DIRECTION_KNOB_FORMS, directionKnobFamily } from '../src/CE_Application/models/directionKnobParts.js';
import { KNOB_FORMS_AS_PARTS, knobFormFamily } from '../src/CE_Application/models/knobFormParts.js';
import { PHYSICAL_DIRECTIONS } from '../src/CE_Application/models/physicalControlSets.js';
import { knobOutlinePath, knobOutlineReach } from '../src/CE_Application/utils/knobOutlines.js';
import { SLIDER_SEMANTIC_PARTS } from '../src/CE_Application/utils/sliderControlPart.js';
import { valueLayersRefusal } from '../src/CE_Application/utils/valueControlLayers.js';
import { resolveCircularTrackMetrics } from '../src/CE_Application/utils/sliderGeometry.js';
import { get } from 'svelte/store';
import { activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import { applyFormAsParts } from '../src/CE_Application/stores/controlSets.js';

const source = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
const knobOf = (id) => resolveControlForSet(createControl('Knob'), getControlSet(id));

test('the 24 knobs of the first two series are parts; the sculpted and the additional ones are still forms', () => {
  const series12 = PHYSICAL_DIRECTIONS.filter((d) => (d.series ?? 1) <= 2).map((d) => d.id);
  assert.equal(series12.length, 24);
  assert.deepEqual([...DIRECTION_KNOB_FORMS].sort(), series12.map((id) => `new-${id}`).sort());
  for (const form of DIRECTION_KNOB_FORMS) assert.ok(KNOB_FORMS_AS_PARTS.includes(form), form);
  for (const id of series12) {
    const knob = knobOf(id);
    assert.equal(knob._children.Core.controlForm || '', '', `${id}: no form`);
    assert.equal(knob._children.Behavior.circularFit, 'tight', id);
    assert.ok(['bar', 'dot'].includes(knob._children.Parts._children.pointerCurrent.kind), `${id}: its pointer`);
  }
  for (const d of PHYSICAL_DIRECTIONS.filter((entry) => entry.series === 3)) {
    assert.equal(knobOf(d.id)._children.Core.controlForm, `new-${d.id}`, `${d.id} is still drawn by code`);
  }
  assert.equal(knobOf('bellows')._children.Core.controlForm, 'new-bellows', 'not a turning knob: still a form');
  assert.equal(directionKnobFamily('new-valve-console'), null);
  assert.equal(directionKnobFamily('brassworks'), null, 'a set id is not a form');
});

test('every direction recipe writes only what a set may write, and lands on a factory knob', () => {
  for (const form of DIRECTION_KNOB_FORMS) {
    const family = knobFormFamily(form, { ink: 'FF202020', face: 'FF4A4D51' });
    const paths = [...Object.keys(family.component), ...Object.values(family.parts).flatMap((patch) => Object.keys(patch))];
    for (const path of paths) assert.ok(EDITOR_PATHS.some((re) => re.test(path)), `${form}: ${path}`);
  }
});

test('Vintage Mono: a shadowed skirt, a shaded cap linked to the set, a dark insert, a cream bar, 0 to 10', () => {
  const parts = knobOf('brassworks')._children.Parts._children;
  const behavior = knobOf('brassworks')._children.Behavior;
  assert.equal(parts.bodyHousing.visible, true);
  assert.ok(parts.bodyHousing.shadowOffset > 9 && parts.bodyHousing.shadowOffset < 11, 'five units under a 49-unit skirt');
  assert.equal(parts.bodyHousing._children.Background._children.Fill.gradientEnabled, true);
  assert.equal(parts.bodyCap._children.Background._children.Effects._children.Material.enabled, false, "the set's own cap finish does not show through");
  assert.equal(parts.bodyInsert.visible, true);
  assert.equal(parts.bodyInsert._children.Background._children.Fill.colour, 'FF30312E');
  assert.equal(parts.pointerCurrent.kind, 'bar');
  assert.equal(parts.pointerCurrent._children.Background._children.Fill.colour, 'FFE7DDBD');
  assert.equal(behavior.scaleNumberCount, 6);
  assert.equal(behavior.scaleNumberTo, 10);
  // The colours that were the set's face stay its face: the cap follows the set.
  const family = directionKnobFamily('new-brassworks');
  assert.equal(family.parts.bodyCap['Background.Fill.colour'], '{surface}');
  assert.equal(family.parts.bodyHousing['Background.Fill.gradient'].stops[1].color, '00000000', 'clear where the drawing was the face');
});

test('the ribbed skirts are gears that turn; the scale sits on a radius of its own where an arc runs inside it', () => {
  const poly = knobOf('bakelite')._children.Parts._children.bodyHousing;
  assert.equal(poly.outline, 'gear');
  assert.equal(poly.outlineCount, 12);
  assert.equal(poly.turns, true);
  assert.ok(knobOf('edge-light')._children.Behavior.tickRadius > 130, 'the scale outside the value arc');
  assert.equal(knobOf('edge-light')._children.Parts._children.bodyTrackFill.visible, true);
  const future = knobOf('leatherbound')._children.Parts._children.tickMajor;
  assert.equal(future.activeColour, knobOf('leatherbound')._children.Parts._children.pointerCurrent._children.Background._children.Fill.colour, 'its segments light in the accent');
  assert.equal(knobOf('pinstripe')._children.Parts._children.pointerCurrent._children.Background._children.Border.enabled, true, 'two fine lines: an edge with no fill');
});

test('a gear is square teeth: two corners on the rim, two at the root, a quarter pitch apart', () => {
  const d = knobOutlinePath('gear', 0, 0, 10, { count: 4, depth: 20 });
  const points = d.match(/-?\d+(\.\d+)?/g).map(Number);
  assert.equal(points.length, 32, '16 corners');
  assert.deepEqual(points.slice(0, 2), [0, -10], 'a tooth at the top');
  assert.deepEqual(points.slice(2, 4), [3.83, -9.24], 'the tooth runs a quarter pitch, 22.5 degrees');
  assert.deepEqual(points.slice(4, 6), [5.66, -5.66], 'then the root, at 80 % of the radius');
  assert.equal(knobOutlineReach('gear', { count: 12, depth: 8 }), 1);
});

test('the renderer draws every plate the one way, the numbers, the bar, the scale radius and lit ticks', () => {
  const renderer = source('editor/SliderFamilyRenderer.svelte');
  const at = (text) => { const i = renderer.indexOf(text); assert.ok(i > 0, text); return i; };
  // In drawing order: housing, skirt, track, ticks, numbers, cap, insert, pointer.
  const order = [
    "{@render bodyPlate(bodyHousingPart, bodyHousingRadius, 'bodyHousing', 0)}",
    "{@render bodyPlate(bodySkirtPart, bodySkirtRadius, 'bodySkirt', 0)}",
    "maskIdFor('bodyTrackBaseCircle')",
    '{#if scaleNumberCount >= 2}',
    "{@render bodyPlate(bodyCapPart, bodyCapRadius, 'bodyCapCircle', 1, 'bodyCap')}",
    "{@render bodyPlate(bodyInsertPart, bodyInsertRadius, 'bodyInsert', 1)}",
    '{:else if radial.bar}',
  ].map(at);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(renderer, /data-plate-shadow=\{role\} transform=\{`translate\(0 \$\{shadow\.dy\.toFixed\(2\)\}\)`\}/);
  assert.match(renderer, /sliderNormalizedToAngle\(behavior, i \/ \(scaleNumberCount - 1\)\)/, 'each number at its own stop, the long way round');
  assert.match(renderer, /const base = tickRadiusShare > 0 \? circularMetrics\.radius \* tickRadiusShare : circularMetrics\.radius;/);
  assert.match(renderer, /\(highlighted && tickMajorPart\?\.activeColour\) \|\| tickMajorPart/);
  // The knob draws them, so the canvas does not draw them again as parts of their own.
  for (const name of ['bodySkirt', 'bodyInsert', 'tickNumber']) assert.ok(SLIDER_SEMANTIC_PARTS.has(name), name);
  // Every knob that exists keeps its look: the new parts are off, no numbers, no scale radius.
  const knob = createControl('Knob');
  assert.equal(knob._children.Parts._children.bodySkirt.visible, false);
  assert.equal(knob._children.Parts._children.bodyInsert.visible, false);
  assert.equal(knob._children.Behavior.scaleNumberCount ?? 0, 0);
});

test('the tight fit leaves room for the numbers round the scale', () => {
  const plain = resolveCircularTrackMetrics(150, 165, { tight: true, readoutBelow: true, trackThickness: 1, pointerSize: 0, hasTicks: true, majorTickLength: 4 });
  const numbered = resolveCircularTrackMetrics(150, 165, { tight: true, readoutBelow: true, trackThickness: 1, pointerSize: 0, hasTicks: true, majorTickLength: 4, numberReach: 1.19, numberSize: 6 });
  assert.ok(numbered.radius < plain.radius);
  assert.ok(numbered.radius * 1.19 + 4.5 <= numbered.centerY, 'the top number inside the box');
});

test('as layers, a knob with a skirt, an insert, a shadow or a bar comes in as one exact part, named', () => {
  assert.match(valueLayersRefusal(knobOf('brassworks')), /an insert in its cap/);
  assert.match(valueLayersRefusal(knobOf('switchboard')), /a shadow under its housing/);
  assert.match(valueLayersRefusal(knobOf('bakelite')), /a housing that turns under a fixed light/);
  assert.match(valueLayersRefusal(knobOf('hi-fi')), /a skirt/);
  assert.match(valueLayersRefusal(knobOf('diesel')), /a bar for a pointer/);
});

test('the Knob tab edits the skirt, the insert, the shadows, the gear and the bar; the ticks their radius and numbers', () => {
  const tab = source('sections/KnobPartsEditor.svelte');
  for (const words of ["{@render plate('bodySkirt', 'Skirt', Disc, skirt, { turns: true })}", "{@render plate('bodyInsert', 'Insert', CircleDot, insert, { turns: true })}",
    "['gear', 'Gear']", "['bar', 'Bar']", 'label="Shadow %"', 'label="Softness %"', 'label="Shadow Colour"', 'label="Taper %"', 'label="Edge"']) {
    assert.ok(tab.includes(words), words);
  }
  const slider = source('sections/SliderEditor.svelte');
  for (const words of ['label="Scale Radius %"', 'label="Numbers"', 'path="Behavior.scaleNumberFrom"', 'path="Parts.tickNumber.Layout.offsetX"']) assert.ok(slider.includes(words), words);
});

test('chosen on Core › Control design, a synth knob writes its parts; another form takes them off again', () => {
  panels.set([{ id: 'dir', name: 'Dir', width: 400, height: 300, controlSet: { id: 'gemstone' }, controlSets: [],
    controls: [createControl('Knob', { Core: { id: 'k1' } })] }]);
  activePanelId.set('dir');
  try {
    assert.equal(applyFormAsParts(['k1'], 'new-hi-fi'), 1);
    let knob = get(panels)[0].controls[0];
    assert.equal(knob._children.Parts._children.bodySkirt.visible, true);
    assert.equal(knob._children.Parts._children.bodyInsert.visible, true);
    assert.equal(knob._children.Behavior.scaleNumberCount, 6);
    applyFormAsParts(['k1'], 'new-gemstone');
    knob = get(panels)[0].controls[0];
    assert.match(knob._children.Parts._children.bodySkirt._children.Background._children.Fill.colour, /^47/, "the glass is the set's face at 28 %");
    assert.equal(knob._children.Parts._children.bodyInsert.visible, false, 'Glass Signal has no insert');
    applyFormAsParts(['k1'], 'disc');
    knob = get(panels)[0].controls[0];
    assert.equal(knob._children.Parts._children.bodySkirt.visible, false);
    assert.equal(knob._children.Behavior.scaleNumberCount, 0);
    assert.equal(knob._children.Behavior.tickRadius, 0);
    assert.ok(!(Number(knob._children.Parts._children.bodyHousing.shadowOffset) > 0), "the housing's shadow back to the factory's none");
  } finally {
    panels.set([]); activePanelId.set(null);
  }
});
