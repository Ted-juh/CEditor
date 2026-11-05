// Knob forms become the knob's own parts (docs/design/changeable-control-sets.md, piece B; the
// owner: "the whole idea of the editor is that components are adjustable in any way").

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { familyPatchFor, readControlPath, resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { EDITOR_PATHS } from '../src/CE_Application/models/controlSetDesigns.js';
import { setAnatomy } from '../src/CE_Application/models/controlAnatomy.js';
import { BASE_KNOB_FORMS, KNOB_FORMS_AS_PARTS, knobFormFamily } from '../src/CE_Application/models/knobFormParts.js';
import { knobOutlinePath, knobOutlineReach } from '../src/CE_Application/utils/knobOutlines.js';
import { resolveCircularTrackMetrics } from '../src/CE_Application/utils/sliderGeometry.js';
import { CONTROL_FORMS } from '../src/CE_Application/models/controlAnatomy.js';
import { activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import { applyKnobFormAsParts } from '../src/CE_Application/stores/controlSets.js';

const source = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
const corners = (d) => (d.match(/[ML]/g) ?? []).length;

test('outlines: polygon, scallop, flutes and ring, turned by a rotation', () => {
  assert.equal(knobOutlinePath('circle', 50, 50, 40), '', 'a circle is the part\'s own');
  assert.equal(corners(knobOutlinePath('polygon', 50, 50, 40, { count: 6 })), 6);
  assert.equal(corners(knobOutlinePath('scallop', 50, 50, 40, { count: 8, depth: 20 })), 16, 'a point and a notch each');
  assert.ok(corners(knobOutlinePath('flutes', 50, 50, 40, { count: 18, depth: 10 })) > 100, 'flutes are smooth');
  assert.equal((knobOutlinePath('ring', 50, 50, 40, { depth: 30 }).match(/M/g) ?? []).length, 2, 'a ring has a hole');
  // A rounded square round the circle: square at 0, nearly the circle at the most.
  assert.equal(knobOutlinePath('rounded', 50, 50, 40, { depth: 0 }), 'M90 10 L90 90 L10 90 L10 10 Z');
  assert.ok(corners(knobOutlinePath('rounded', 50, 50, 40, { depth: 50 })) > 20, 'its corners are arcs');
  // How far an outline reaches across, for the fit: a square set square less than its corners.
  assert.equal(knobOutlineReach('circle'), 1);
  assert.equal(knobOutlineReach('polygon', { count: 4, rotation: 45 }), 0.71);
  assert.equal(knobOutlineReach('polygon', { count: 4 }), 1);
  // A corner at the top, until it is turned.
  assert.match(knobOutlinePath('polygon', 50, 50, 40, { count: 4 }), /^M50 10 /);
  assert.doesNotMatch(knobOutlinePath('polygon', 50, 50, 40, { count: 4, rotation: 45 }), /^M50 10 /);
});

test('every recipe writes only what a set may write, and lands on a factory knob', () => {
  for (const form of KNOB_FORMS_AS_PARTS) {
    const family = knobFormFamily(form);
    const paths = [
      ...Object.keys(family.component),
      ...Object.values(family.parts).flatMap((patch) => Object.keys(patch)),
    ];
    for (const path of paths) assert.ok(EDITOR_PATHS.some((re) => re.test(path)), `${form}: ${path}`);
    const knob = resolveControlForSet(createControl('Knob'), { ...getControlSet('graphite'), id: `test-${form}`, families: { Knob: family } });
    for (const [part, patch] of Object.entries(family.parts)) {
      for (const path of Object.keys(patch)) assert.notEqual(readControlPath(knob, `Parts.${part}.${path}`), undefined, `${form}: ${part}.${path} lands`);
    }
  }
  assert.equal(knobFormFamily('new-studio'), null, 'a direction form is still drawn by code');
});

test('the sets that drew these forms draw them with parts, and name no form', () => {
  const converted = ['blueprint', 'frost', 'obsidian', 'console', 'machined', 'phosphor', 'graphite-studio', 'pop', 'soft', 'carbon', 'tolex'];
  for (const id of converted) {
    const set = getControlSet(id);
    const knob = resolveControlForSet(createControl('Knob'), set);
    assert.equal(knob._children.Core.controlForm || '', '', `${id}: no form`);
  }
  // Console's skirt: a housing plate, a face, a long pointer line.
  const console_ = resolveControlForSet(createControl('Knob'), getControlSet('console'));
  assert.equal(console_._children.Parts._children.bodyHousing.visible, true);
  assert.equal(console_._children.Parts._children.pointerCurrent.kind, 'line');
  // Every base knob form is parts now: Tolex's tuning window, Pop's paper tab, Soft's pebble and
  // Carbon's roller were the last.
  assert.deepEqual([...BASE_KNOB_FORMS].sort(), CONTROL_FORMS.Knob.map(([id]) => id).filter((id) => !id.startsWith('new-')).sort());
  assert.deepEqual(KNOB_FORMS_AS_PARTS.filter((id) => !id.startsWith('new-')), BASE_KNOB_FORMS);
  for (const id of ['tolex', 'pop', 'soft', 'carbon']) assert.equal(familyPatchFor(getControlSet(id), 'Knob').component['Core.controlForm'], undefined, id);
  const tuning = resolveControlForSet(createControl('Knob'), getControlSet('tolex'))._children.Parts._children;
  assert.equal(tuning.bodyHousing.visible, true);
  assert.equal(tuning.pointerCurrent.kind, 'line');
  assert.equal(resolveControlForSet(createControl('Knob'), getControlSet('carbon'))._children.Parts._children.bodyHousing.outline, 'rounded');
  assert.equal(setAnatomy('Knob', 'console'), 'skirt');
});

test('the knob renderer draws the housing, the outlines, the needle, and hides what is hidden', () => {
  const renderer = source('editor/SliderFamilyRenderer.svelte');
  const housingAt = renderer.indexOf("{@render bodyPlate(bodyHousingPart, bodyHousingRadius, 'bodyHousing'");
  assert.ok(housingAt > 0 && housingAt < renderer.indexOf("maskIdFor('bodyTrackBaseCircle')"), 'the housing under the track');
  // Every plate is drawn the one way: its shadow, its fill in its outline, its border; or, when its
  // look is rendered (utils/renderedLook.js), as the rendered image in its place.
  assert.match(renderer, /\{#snippet bodyPlate\(part, r, mask, borderFallback, role = mask\)\}\s*\{@const rendered = renderedPlate\(part, r\)\}\s*\{#if rendered\}\s*<image data-rendered-look=\{role\}[\s\S]*?\{:else\}\s*\{@const shape = outlineShapeFor\(part, r\)\}/);
  assert.match(renderer, /\{@render bodyPlate\(bodyCapPart, bodyCapRadius, 'bodyCapCircle', 1, 'bodyCap'\)\}/);
  assert.match(renderer, /kind === 'needle'/);
  assert.match(renderer, /trackBasePart\?\.visible === false/);
  assert.match(renderer, /pointerKind !== 'dot' && pointerCurrentPart\?\.visible !== false/);
  assert.match(renderer, /circularFit \?\? 'auto'\) === 'tight'/);
  assert.match(source('editor/SliderShapeFill.svelte'), /shape\.kind === 'filled-path'/);
  // Every knob that exists keeps its look: the housing is off and the fit is opt-in.
  const knob = createControl('Knob');
  assert.equal(knob._children.Parts._children.bodyHousing.visible, false);
  assert.equal(knob._children.Behavior.circularFit, undefined);
});

test('choosing a converted form, or Convert to Parts, writes the parts in one step', () => {
  panels.set([{ id: 'forms', name: 'Forms', width: 400, height: 300, controlSet: { id: 'tolex' }, controlSets: [],
    controls: [createControl('Knob', { Core: { id: 'k1', controlForm: 'skirt' } })] }]);
  activePanelId.set('forms');
  try {
    let writes = 0;
    const stop = panels.subscribe(() => { writes += 1; });
    writes = 0;
    assert.equal(applyKnobFormAsParts(['k1'], 'skirt'), 1);
    stop();
    assert.equal(writes, 1);
    const knob = get(panels)[0].controls[0];
    assert.equal(knob._children.Core.controlForm, '');
    assert.equal(knob._children.Parts._children.bodyHousing.visible, true);
    // Pinned: Tolex's own knob family does not draw over values equal to the factory's.
    const drawn = resolveControlForSet(knob, getControlSet('tolex'));
    assert.equal(drawn._children.Parts._children.pointerCurrent.kind, 'line');
    assert.equal(drawn._children.Parts._children.bodyCap.visible, true);
    // A form does not keep the last one's shape: scalloped, then a disc, is a round cap again.
    applyKnobFormAsParts(['k1'], 'scallop');
    assert.equal(get(panels)[0].controls[0]._children.Parts._children.bodyCap.outline, 'scallop');
    applyKnobFormAsParts(['k1'], 'disc');
    const disc = get(panels)[0].controls[0]._children.Parts._children.bodyCap;
    assert.equal(disc.outline, undefined);
    assert.equal(disc.turns, undefined);
  } finally {
    panels.set([]);
    activePanelId.set(null);
  }
  const core = source('sections/CoreEditor.svelte');
  assert.match(core, /onchange=\{\(e\) => chooseForm\(e\.target\.value\)\}/);
  assert.match(core, /label="Convert to Parts"/);
});

test('the Knob tab has a section per part, each field naming a property a set may write', () => {
  const editor = source('sections/KnobPartsEditor.svelte');
  // In drawing order: Housing, Track and Value Arc, Cap, Pointer.
  const order = ["plate('bodyHousing', 'Housing'", 'title="Track and Value Arc"', "plate('bodyCap', 'Cap'", 'title="Pointer"']
    .map((needle) => editor.indexOf(needle));
  assert.ok(order.every((at) => at > 0), 'every section is there');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in drawing order');
  // Every field carries its path, so it has the override marks; the plate's are per part.
  const paths = [...editor.matchAll(/path=\{?[`"]([^`"]+)[`"]\}?/g)].map((m) => m[1])
    .flatMap((path) => (path.includes('${prefix}') ? ['bodyHousing', 'bodyCap'].map((name) => path.replace('${prefix}', `Parts.${name}`)) : [path]));
  assert.ok(paths.length >= 20, `${paths.length} fields`);
  for (const path of paths) {
    const key = path.replace(/^Parts\.[A-Za-z]+\./, '');
    assert.ok(path.startsWith('Parts.') && EDITOR_PATHS.some((re) => re.test(key)), `${path} is one a set may write`);
  }
  assert.equal((editor.match(/<PropertyCell /g) ?? []).length, (editor.match(/<PropertyCell [^>]*path=/g) ?? []).length, 'no field without a path');
  // Colours open the Colors dock, never a popup of their own.
  assert.match(editor, /activateInspectorColorTarget\(/);
  assert.doesNotMatch(editor, /type="color"/);

  // Only a knob gets them, and its Style section drops the two cells they replace.
  const slider = source('sections/SliderEditor.svelte');
  assert.match(slider, /\{#if isKnob\}\s*<KnobPartsEditor \{control\} \{set\} \{setPatch\} \/>/);
  assert.ok(slider.indexOf('<KnobPartsEditor') > slider.indexOf('title="Type"'), 'after Type');
  assert.match(slider, /\{#if !isKnob\}\s*<PropertyCell label="Track Size"/);
  assert.match(slider, /id: 'bodyHousing', path: 'Parts\.bodyHousing\.Background', label: 'Housing'/);
});

test('the tight fit keeps a knob above a readout under it, its housing and all', () => {
  const base = { trackThickness: 2, pointerSize: 0, majorTickLength: 5, hasTicks: true, hasReadout: true, tight: true, showsMinMax: false, labelMetrics: { readoutSize: 12 } };
  // As before without the readout below: a knob that exists keeps its size.
  const before = resolveCircularTrackMetrics(120, 128, base);
  assert.equal(before.centerY, 72);
  // Below: centred in the room above the readout, and the housing's reach fits in it.
  const below = resolveCircularTrackMetrics(120, 128, { ...base, readoutBelow: true, outerReach: 1.4 });
  const readoutTop = 128 - 14 - 12 * 0.6;
  assert.ok(below.centerY < 72);
  assert.ok(below.centerY + below.radius * 1.4 <= readoutTop, 'the housing clears the readout');
  assert.ok(below.centerY - below.radius * 1.4 >= 0, 'and the top');
  // A housing within the track does not shrink it.
  const small = resolveCircularTrackMetrics(120, 128, { ...base, readoutBelow: true, outerReach: 0.9 });
  assert.ok(small.radius > below.radius);
  // A knob draws no readout of its own now (its value is a Label beside it, utils/labelShows.js):
  // it keeps no room for one, and the tight fit fills its box, housing and all.
  const renderer = source('editor/SliderFamilyRenderer.svelte');
  assert.match(renderer, /\.\.\.textRoom,\s*tight: circularFitTight,/);
  assert.match(renderer, /outerReach: housingReach/);
});
