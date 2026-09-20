import test from 'node:test';
import assert from 'node:assert/strict';
import { anatomyValue, anatomyForm, setAnatomy } from '../src/CE_Application/models/controlAnatomy.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { shrinkControl, expandControl } from '../src/CE_Application/stores/documentShape.js';

test('form overrides survive copy/save and do not replace behavior or MIDI',()=>{
  const control=createControl('Knob',{Core:{controlSetId:'tolex',controlForm:'pointer',formSize:82,formDivisions:17},Behavior:{min:-20,max:80,defaultCurrentValue:30}});
  const restored=expandControl(shrinkControl(control));
  const resolved=resolveControlForSet(restored,getControlSet('machined'));
  assert.equal(resolved._children.Core.controlForm,'pointer');
  assert.equal(resolved._children.Core.formDivisions,17);
  assert.equal(resolved._children.Core.formSize,82);
  for (const key of ['min','max','step','defaultValue','defaultCurrentValue','dragEnabled','wheelEnabled','keyboardEnabled','valueFlow','returnMode']) {
    assert.equal(resolved._children.Behavior[key],control._children.Behavior[key],key);
  }
  assert.deepEqual(resolved._children.MIDI,control._children.MIDI);
  restored._children.Core.controlForm='original';
  assert.equal(anatomyForm('Knob',resolveControlForSet(restored,getControlSet('tolex'))._children.Core.controlForm),'');
});
test('rotary form reads authored range in editor and current live normalized value in preview',()=>{
  const control=createControl('Knob',{Behavior:{min:-20,max:80,defaultCurrentValue:30}});
  assert.deepEqual(anatomyValue(control),{raw:30,normalized:.5});
  assert.deepEqual(anatomyValue(control,{currentValueRaw:65,currentValueNormalized:.85}),{raw:65,normalized:.85});
  control._children.Behavior.max=-20;
  assert.equal(anatomyValue(control).normalized,0);
  assert.equal(anatomyValue(control,{currentValueNormalized:Infinity}).normalized,0);
});
test('unsupported forms use the original renderer, and alternate button types share action forms',()=>{
  assert.equal(anatomyForm('Slider','tuning'),'');
  assert.equal(anatomyForm('Knob','future-form'),'');
  assert.equal(setAnatomy('MomentaryButton','console'),'piano');
  assert.equal(setAnatomy('ProgressBar','tolex'),'radio');
  assert.equal(resolveControlForSet(createControl('Knob'),getControlSet('graphite'))._children.Core.controlForm,'');
});
