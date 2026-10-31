// authorWords.test.js — the words the editor shows an author where the model names things as
// identifiers (utils/authorWords.js), and the places that show them.
//
// The 2026-10 designer review found a converted knob badged "SLIDERC…", its Interact card reading
// "float · slidercontrol" with a Geometry of "linear", its binding's target as
// `Parts.cutoff.meta.sliderControl.value`, its states as `hoveredCustomHitZone: cutoffZone`, its
// contract as "cutoff > cutoff (float)", and the Core tab's "A11y" and "CustomComponent". These
// convert a real knob and render the tabs that showed them. Nothing stored changes, and the tests
// say that too.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { planComponentFromSelection } from '../src/CE_Application/utils/customComponentFromControls.js';
import { layerKindLabel } from '../src/CE_Application/utils/customDesignSurfaceHelpers.js';
import {
  behaviorTypeWord, channelTypeWord, controlTypeLabel, propertyPathWords, stateConditionWords, targetPathWords,
} from '../src/CE_Application/utils/authorWords.js';
import CustomInteractEditor from '../src/CE_Application/sections/CustomInteractEditor.svelte';
import BindingsEditor from '../src/CE_Application/sections/BindingsEditor.svelte';
import CustomTestBenchEditor from '../src/CE_Application/sections/CustomTestBenchEditor.svelte';
import CustomPublishedPropertiesEditor from '../src/CE_Application/sections/CustomPublishedPropertiesEditor.svelte';
import CoreEditor from '../src/CE_Application/sections/CoreEditor.svelte';

const at = (type, id, x, y, width, height) => createControl(type, {
  Core: { id, name: id },
  Transform: { x, y, width, height },
});

/** Two panel knobs made into a component, as Create Component from Selection makes it. */
function filter() {
  const panel = {
    id: 'p1', name: 'Voice', width: 400, height: 200, scripts: [],
    controls: [at('Knob', 'cutoff', 40, 40, 80, 80), at('Knob', 'reso', 140, 40, 80, 80)],
  };
  const plan = planComponentFromSelection(panel, ['cutoff', 'reso'], { name: 'Filter' });
  assert.equal(plan.ok, true, JSON.stringify(plan.refused));
  return plan.component;
}

const text = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&gt;/g, '>').replace(/\s+/g, ' ');

test('the words', () => {
  assert.equal(channelTypeWord('float'), 'number');
  assert.equal(channelTypeWord('enum'), 'choice');
  assert.equal(behaviorTypeWord({ type: 'xy-pad' }), 'XY pad');
  assert.equal(propertyPathWords('meta.sliderControl.hover'), 'hover');
  assert.equal(propertyPathWords('Background.Border.colour'), 'border colour');
  assert.equal(targetPathWords('Parts.valueText.Text.content'), 'valueText › text');
  assert.equal(stateConditionWords({ hoveredCustomHitZone: 'cutoffZone' }), 'pointer over cutoffZone');
  assert.equal(stateConditionWords({ activeCustomHitZone: 'cutoffZone', dragging: true }), 'cutoffZone pressed, dragging',
    'a name is the author\'s, letter for letter: never capitalised');
  assert.equal(stateConditionWords({ domFocusCustomHitZone: 'cutoffZone' }), 'cutoffZone has the keyboard focus');
  assert.equal(propertyPathWords('meta.sliderControl.domFocus'), 'keyboard focus');
  assert.equal(stateConditionWords({}), 'manual', 'a state with no condition is applied by hand');
  assert.equal(stateConditionWords({ hover: false }), 'not hovered');
  assert.equal(controlTypeLabel('CustomComponent'), 'Custom Component');
  assert.equal(controlTypeLabel('Harmoniser'), 'Harmoniser', 'the Insert menu\'s description is not the name');
  assert.equal(controlTypeLabel('SomethingNew'), 'Something New', 'a type the catalogue does not list is still words');
});

test('a converted knob is badged and described as the knob it was', () => {
  const component = filter();
  const parts = component._children.Parts._children;
  assert.equal(parts.cutoff.kind, 'slidercontrol', 'what is stored is unchanged');
  assert.equal(layerKindLabel(parts.cutoff), 'Knob');
  assert.equal(behaviorTypeWord(component._children.Behaviors._children.cutoff, parts), 'panel knob');
  assert.equal(layerKindLabel({ kind: 'someNewKind' }), 'Some new kind', 'an unlabelled kind is words, not the identifier');
});

test('the Interact card says number and panel knob, and offers no Geometry or Drag for a knob that ignores them', () => {
  const body = text(render(CustomInteractEditor, { props: { control: filter() } }).body);
  assert.match(body, /cutoff number · panel knob · 1 grab area/);
  assert.match(body, /Type Panel knob/);
  assert.match(body, /Drag as the knob did on the panel/);
  const cards = body.slice(body.indexOf('cutoff number'));
  assert.doesNotMatch(cards.slice(0, cards.indexOf('Grab areas')), /slidercontrol|float|Geometry/);
});

test('the React tab says what a binding\'s target reaches, over the path that edits it', () => {
  const html = render(BindingsEditor, { props: { control: filter() } }).body;
  assert.match(html, /data-testid="binding-target-words"[^>]*>cutoff › value</);
  assert.match(html, /value="Parts\.cutoff\.meta\.sliderControl\.value"/, 'the path is still there to edit');
});

test('the Test Bench words its states: pointer over a zone, a zone pressed, and what each changes', () => {
  const body = text(render(CustomTestBenchEditor, { props: { control: filter() } }).body);
  assert.match(body, /pointer over cutoffZone/);
  assert.match(body, /cutoffZone pressed, dragging/);
  assert.match(body, /cutoffZone has the keyboard focus/);
  assert.match(body, /cutoff · hover/);
  assert.match(body, /cutoff · keyboard focus/);
  assert.doesNotMatch(body, /hoveredCustomHitZone|activeCustomHitZone|meta\.sliderControl|dom focus/);
});

test('the contract reads "cutoff · number", not "cutoff > cutoff (float)"', () => {
  const body = text(render(CustomPublishedPropertiesEditor, { props: { control: filter() } }).body);
  const contract = body.slice(body.indexOf('Inputs'), body.indexOf('Properties', body.indexOf('Inputs')));
  assert.match(contract, /Inputs cutoff · number reso · number/);
  assert.match(contract, /Outputs cutoff · number reso · number/);
  assert.doesNotMatch(contract, /\(float\)|cutoff > cutoff/);
});

test('the Core tab names the type as the Insert menu does, and the screen-reader field in words', () => {
  const body = text(render(CoreEditor, { props: { control: filter() } }).body);
  assert.match(body, /Type Custom Component/);
  assert.doesNotMatch(body, /CustomComponent|A11y/);
  assert.match(body, /Screen reader/);
  assert.match(readFileSync(new URL('../src/CE_Application/sections/CoreEditor.svelte', import.meta.url), 'utf8'),
    /set\('screenReaderText', v\)/, 'it edits the same field');
});
