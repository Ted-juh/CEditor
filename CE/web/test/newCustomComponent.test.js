// newCustomComponent.test.js — what a new Custom Component starts as, and what greets its author.
//
// A new component carried a published editable property "label" for `Parts.label`, a layer it does
// not have (the type's defaults kept it from when a new component came with a label layer). So it
// was "Not reusable yet" before anything was drawn, and stayed so after: Package Validity reported
// the property, which its author had never made.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel, serializePanel, deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { addControl } from '../src/CE_Application/stores/controls.js';
import {
  analyzeCustomComponentReadiness, editablePropertiesWithMissingTargets, validateCustomComponentPackage,
} from '../src/CE_Application/utils/customComponentPackage.js';
import { readinessAutoFix } from '../src/CE_Application/utils/customComponentReadinessFixes.js';
import { createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';
import CustomInteractEditor from '../src/CE_Application/sections/CustomInteractEditor.svelte';

const rectangle = () => createPartNode('rect1', { kind: 'rectangle' });

function inserted() {
  const panel = createPanel('T');
  panels.set([panel]);
  activePanelId.set(panel.id);
  const made = addControl('CustomComponent');
  return () => get(panels)[0].controls.find((control) => control._children.Core.id === made._children.Core.id);
}

test('the type\'s defaults still carry "label": a saved component is a difference from them', () => {
  // Removing it there would change what every older file reads back as; it is removed from a new
  // component instead, and saving records the removal.
  assert.deepEqual(editablePropertiesWithMissingTargets(createControl('CustomComponent')), ['label']);
});

test('a component inserted on a panel has no published property for a layer it does not have', () => {
  const live = inserted();
  assert.deepEqual(Object.keys(live()._children.PublishedProperties.editableProperties), ['variant']);
  assert.deepEqual(Object.keys(live()._children.ValueChannels._children), ['mainValue', 'mode'],
    'its value model is kept: a hit zone drawn in the designer drives mainValue');
});

test('drawn once, it is reusable: nothing left in the readiness bar', () => {
  const live = inserted();
  live()._children.Parts._children.rect1 = rectangle();
  assert.deepEqual(validateCustomComponentPackage(live()).issues, []);
  const open = analyzeCustomComponentReadiness(live()).steps
    .filter((step) => !step.done && ['required', 'recommended'].includes(step.severity));
  assert.deepEqual(open.map((step) => step.id), []);
});

test('saved and opened again, the property stays gone', () => {
  const live = inserted();
  live()._children.Parts._children.rect1 = rectangle();
  const saved = serializePanel(get(panels)[0]);
  const text = typeof saved === 'string' ? saved : JSON.stringify(saved);
  const reopened = deserializePanel(text, null, 'T');
  const component = (reopened.controls ?? []).find((control) => control._children?.Core?.controlType === 'CustomComponent');
  assert.ok(component, 'the component is in the reopened panel');
  assert.deepEqual(Object.keys(component._children.PublishedProperties.editableProperties), ['variant']);
  assert.deepEqual(validateCustomComponentPackage(component).issues, []);
});

test('a component that already has the property is offered a Fix that removes it, and only it', () => {
  const older = createControl('CustomComponent');
  older._children.Parts._children.rect1 = rectangle();
  assert.deepEqual(validateCustomComponentPackage(older).issues, ['Editable property "label" targets missing part "label".']);
  const fix = readinessAutoFix(older, 'validPackage');
  assert.equal(fix.label, 'Remove the published property "label": what it edits is gone');
  applyPatchObject(older, fix.patch);
  assert.deepEqual(Object.keys(older._children.PublishedProperties.editableProperties), ['variant']);
  assert.deepEqual(validateCustomComponentPackage(older).issues, []);
  assert.equal(readinessAutoFix(older, 'validPackage'), null, 'nothing more to offer');
});

test('an empty component opens on what to do first, not on why it is not reusable', () => {
  const source = readFileSync(new URL('../src/CE_Application/sections/CustomDesignSurfaceEditor.svelte', import.meta.url), 'utf8');
  assert.match(source, /let componentEmpty = \$derived\(!!readiness\?\.steps\.some\(\(step\) => step\.id === 'visuals' && !step\.done\)\);/);
  assert.match(source, /if \(!readiness \|\| componentEmpty\) return \[\];/, 'no readiness steps while nothing is drawn');
  assert.match(source, /\{#if componentEmpty\}\s*<div class="readiness-nudge empty-start" role="status"/);
  assert.match(source, /EMPTY_COMPONENT_HINT = 'Nothing drawn yet: pick a shape on the left and drag on the canvas, or start from Starters\.'/);
  // "visuals" is the step that read "0 authored/runtime layer(s)": one layer ends the empty state.
  const component = createControl('CustomComponent');
  assert.equal(analyzeCustomComponentReadiness(component).steps.find((step) => step.id === 'visuals').done, false);
  component._children.Parts._children.rect1 = rectangle();
  assert.equal(analyzeCustomComponentReadiness(component).steps.find((step) => step.id === 'visuals').done, true);
});

test('the Interact tab says what a value without a grab area lacks, and how to add one where that is so', () => {
  const body = render(CustomInteractEditor, { props: { control: createControl('CustomComponent') } }).body
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.doesNotMatch(body, /cannot receive input/);
  const notes = body.match(/No grab area yet[^.]*\.(?: A hit zone you draw[^.]*\.)?/g);
  assert.deepEqual(notes, [
    'No grab area yet, so nothing on the canvas moves this value. A hit zone you draw with the Hit Zone tool (H) drives it.',
    'No grab area yet, so nothing on the canvas moves this value.',
  ], 'mainValue: a drawn hit zone drives mainSlider; mode: it does not, so nothing is promised');
});
