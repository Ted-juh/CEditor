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

test('the 36 synth sets\' knobs are parts; the twelve additional designs stay forms, a classic category', () => {
  const synth = PHYSICAL_DIRECTIONS.map((d) => d.id);
  assert.equal(synth.length, 36);
  assert.deepEqual([...DIRECTION_KNOB_FORMS].sort(), synth.map((id) => `new-${id}`).sort());
  for (const form of DIRECTION_KNOB_FORMS) assert.ok(KNOB_FORMS_AS_PARTS.includes(form), form);
  for (const id of synth) {
    const knob = knobOf(id);
    assert.equal(knob._children.Core.controlForm || '', '', `${id}: no form`);
    assert.equal(knob._children.Behavior.circularFit, 'tight', id);
    assert.ok(['bar', 'dot'].includes(knob._children.Parts._children.pointerCurrent.kind), `${id}: its pointer`);
  }
  for (const id of ['atlas', 'kiln', 'arcade', 'spool', 'tessera', 'bellows', 'helix', 'iris', 'balance', 'satellite', 'fan', 'crown']) {
    assert.equal(knobOf(id)._children.Core.controlForm, `new-${id}`, `${id}: not a turning knob, still a form`);
    assert.equal(directionKnobFamily(`new-${id}`), null, id);
  }
  assert.equal(directionKnobFamily('brassworks'), null, 'a set id is not a form');
});

test('the sculpted series in perspective: ovals moved up and down, a chicken-head cap, turning gimbal rings, a brushed lever', () => {
  const valve = knobOf('valve-console')._children.Parts._children;
  assert.ok(valve.bodyHousing.aspect > 80 && valve.bodyHousing.aspect < 90, 'the wall an oval');
  assert.ok(valve.bodyHousing.shiftY > 0, 'the wall below');
  assert.ok(valve.bodyCap.shiftY < 0, 'the cap lifted above it');
  assert.ok(valve.bodyCap.shadowBlur > 0, "the drawing's drop shadow, soft");
  const chicken = knobOf('chicken-head')._children.Parts._children.bodyCap;
  assert.equal(chicken.outline, 'chicken');
  assert.equal(chicken.turns, true);
  const gimbal = knobOf('gimbal-ring')._children.Parts._children;
  assert.equal(gimbal.bodySkirt.outline, 'ring');
  assert.equal(gimbal.bodySkirt.turns, true);
  assert.ok(gimbal.bodySkirt.aspect < 100 && gimbal.bodyInsert.aspect > 100, 'one ring wide, one tall');
  const lever = knobOf('lever-dial')._children.Parts._children.pointerCurrent;
  assert.equal(lever.kind, 'bar');
  assert.equal(lever._children.Background._children.Fill.gradientEnabled, true, 'the lever brushed metal');
  assert.equal(knobOf('hex-drive')._children.Parts._children.bodyHousing.outline, 'polygon');
  assert.equal(knobOf('floating-halo')._children.Parts._children.bodyHousing.shadowOffset, 0, 'a glow: a shadow with no drop');
  assert.ok(knobOf('floating-halo')._children.Parts._children.bodyHousing.shadowBlur > 0);
});

test('a chicken-head outline runs to a point at the radius and turns about the centre', () => {
  const up = knobOutlinePath('chicken', 0, 0, 10, { rotation: 0 });
  assert.match(up, /^M0 -10 L/);
  const right = knobOutlinePath('chicken', 0, 0, 10, { rotation: 90 });
  assert.match(right, /^M10 0 L/);
  assert.equal(knobOutlineReach('chicken'), 1);
});

test('the renderer draws a plate in perspective by a transform of its outline, and a shaded bar through its fill', () => {
  const renderer = source('editor/SliderFamilyRenderer.svelte');
  assert.match(renderer, /rotate\(\$\{turnDegrees\.toFixed\(2\)\} \$\{cx\.toFixed\(2\)\} \$\{cy\.toFixed\(2\)\}\) `\s*\+ `translate\(\$\{cx\.toFixed\(2\)\} \$\{cy\.toFixed\(2\)\}\) scale\(1 \$\{aspect\.toFixed\(4\)\}\)/, 'squashed, then turned, then moved');
  assert.match(renderer, /shaded: pointerCurrentPart\?\._children\?\.Background\?\._children\?\.Fill\?\.gradientEnabled === true/);
  assert.match(source('editor/SliderShapeFill.svelte'), /fill-rule="evenodd" transform=\{shape\.transform\}/);
  // Every knob that exists keeps its look: no part is an oval or moved unless it says so.
  const knob = createControl('Knob');
  for (const name of ['bodyHousing', 'bodySkirt', 'bodyCap', 'bodyInsert']) {
    assert.equal(knob._children.Parts._children[name].aspect ?? 100, 100, name);
    assert.equal(knob._children.Parts._children[name].shiftY ?? 0, 0, name);
  }
  const tab = source('sections/KnobPartsEditor.svelte');
  for (const words of ['label="Height %"', 'label="Offset Y %"', "['chicken', 'Chicken-head']"]) assert.ok(tab.includes(words), words);
  assert.match(valueLayersRefusal(knobOf('turret-stack')), /a skirt|perspective/);
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

test('Dual Scale draws its second scale and its dark bar, Precision its knurling, as parts', () => {
  // Left out when the 36 knobs became parts; drawn now (editor/SliderFamilyRenderer.svelte).
  const dual = directionKnobFamily('new-dual-scale', { ink: 'FF20282C' });
  assert.equal(dual.component['Behavior.secondScaleRadius'], 64.71, 'its collar\'s ring of ticks, 44 of 68 units out');
  assert.equal(dual.component['Behavior.secondScaleCount'], 10);
  const pointer = dual.parts.pointerCurrent;
  assert.deepEqual([pointer.markFrom, pointer.markTo, pointer.markWidth, pointer.markColour], [25, 96.88, 12.5, 'FF20282C'], 'the dark bar on its cap, in the ink');
  const precision = directionKnobFamily('new-chronograph', {});
  assert.deepEqual([precision.parts.bodyHousing.grooves, precision.parts.bodyHousing.grooveLength, precision.parts.bodyHousing.grooveColour], [48, 16, 'BF253136']);
  // Each path is the editor's to write, and a knob with them names them when it is made into layers.
  for (const path of ['Behavior.secondScaleRadius', 'Behavior.secondScaleCount', 'grooves', 'grooveLength', 'grooveWidth', 'markFrom', 'markTo', 'markWidth', 'markColour']) {
    assert.ok(EDITOR_PATHS.some((pattern) => pattern.test(path)), path);
  }
  const renderer = readFileSync(new URL('../src/CE_Application/editor/SliderFamilyRenderer.svelte', import.meta.url), 'utf8');
  assert.match(renderer, /\{#each plateGrooves\(part, r\) as groove, i \(i\)\}/);
  assert.match(renderer, /\{#each secondScale as tick, i \(i\)\}/);
  assert.match(renderer, /<polygon data-pointer-mark points=\{pointerMark\.points\}/);
  // Another form takes them off again (stores/controlSets.js applyFormAsParts).
  const store = readFileSync(new URL('../src/CE_Application/stores/controlSets.js', import.meta.url), 'utf8');
  assert.match(store, /\['Behavior\.secondScaleRadius', 0\], \['Behavior\.secondScaleCount', 0\]/);
  assert.match(store, /'grooves', 'grooveLength', 'grooveWidth', 'grooveColour', 'markFrom', 'markTo', 'markWidth', 'markColour',/);
});

test('the Knob tab edits the second scale, a plate\'s grooves and the pointer\'s second bar', () => {
  const plates = readFileSync(new URL('../src/CE_Application/sections/KnobPartsEditor.svelte', import.meta.url), 'utf8');
  for (const path of ['`${prefix}.grooves`', '`${prefix}.grooveLength`', '`${prefix}.grooveColour`']) assert.ok(plates.includes(`path={${path}}`), path);
  for (const key of ['markFrom', 'markTo', 'markWidth', 'markColour']) assert.match(plates, new RegExp(`path="Parts\\.pointerCurrent\\.${key}"`));
  const ticks = readFileSync(new URL('../src/CE_Application/sections/SliderEditor.svelte', import.meta.url), 'utf8');
  assert.match(ticks, /path="Behavior\.secondScaleRadius"/);
  assert.match(ticks, /path="Behavior\.secondScaleCount"/);
});
