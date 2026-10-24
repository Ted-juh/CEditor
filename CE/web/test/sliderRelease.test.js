import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import SliderFamilyRenderer from '../src/CE_Application/editor/SliderFamilyRenderer.svelte';
import BehaviorEditor from '../src/CE_Application/sections/BehaviorEditor.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { resolveInteractionContext } from '../src/CE_Application/utils/interactionRuntime.js';

for (const type of ['Slider', 'Knob']) {
  test(`${type} authored handle geometry agrees with preview across defaults`, () => {
    const control=createControl(type);
    Object.assign(control._children.Behavior, { min: -10, max: 10, step: .1 });
    for (const value of [-10,-5,0,5,10]) {
      control._children.Behavior.defaultCurrentValue=value;
      const props={control,width:220,height:100};
      const editor=render(SliderFamilyRenderer,{props}).body;
      const preview=render(SliderFamilyRenderer,{props:{...props,runtime:{signals:resolveInteractionContext(control)}}}).body;
      const pointer=html=>html.match(/<[^>]+data-pointer="current"[^>]*>/)?.[0];
      assert.ok(pointer(editor));
      assert.equal(pointer(editor),pointer(preview),`${type} default ${value}`);
    }
  });
  test(`${type} inspector does not offer momentary-button options`, () => {
    const html=render(BehaviorEditor,{props:{control:createControl(type)}}).body;
    assert.doesNotMatch(html,/value="momentary"|value="action"|value="repeating"/);
    assert.match(html,/value="slider"/);
    assert.match(html,/Return to rest/i);
  });
}
test('MomentaryButton still offers its button subtypes',()=>{
  const html=render(BehaviorEditor,{props:{control:createControl('MomentaryButton')}}).body;
  assert.match(html,/value="momentary"/);
  assert.match(html,/value="repeating"/);
});
