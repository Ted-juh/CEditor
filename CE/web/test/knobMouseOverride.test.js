import test from 'node:test';
import assert from 'node:assert/strict';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getCircularSliderDragMode, createCircularSliderScrub } from '../src/CE_Application/utils/scrubRuntime.js';
import { sliderControlValueFromPoint } from '../src/CE_Application/utils/sliderControlPart.js';
const behavior={geometry:'circular',direction:'cw',min:0,max:1,step:0.01,circularDragMode:'absolute'};
test('untouched circular drag remains absolute, explicit Mouse modes select a scrub',()=>{
 assert.equal(getCircularSliderDragMode(behavior), 'absolute');
 for(const dragMode of ['vertical','horizontal','both','free','relative']) assert.equal(getCircularSliderDragMode(behavior,{dragMode}),'knob');
 assert.equal(getCircularSliderDragMode(behavior,{dragMode:'circular'}),'rotary');
 assert.equal(getCircularSliderDragMode({...behavior,circularDragMode:'rotary'},{dragMode:'auto'}),'rotary');
});
test('vertical override starts without jump and honors sensitivity and inversion',()=>{
 const drag=(mouse)=>{const s=createCircularSliderScrub(behavior,.5,mouse);s.begin({x:100,y:100},{bounds:{left:0,top:0,width:200,height:200}});assert.equal(s.value,.5);return s.move({x:100,y:50});};
 assert.ok(Math.abs(drag({dragMode:'vertical'})-.7)<1e-8);
 assert.ok(Math.abs(drag({dragMode:'vertical',dragSensitivity:.5})-.6)<1e-8);
 assert.ok(Math.abs(drag({dragMode:'vertical',invertY:true})-.3)<1e-8);
});
test('a Knob carried in a component honors the same vertical override',()=>{
 const c=createControl('Knob');Object.assign(c._children.Behavior,behavior);c._children.Mouse.dragMode='vertical';
 const v=sliderControlValueFromPoint(c,{left:0,top:0,width:200,height:200},{clientX:100,clientY:50},{clientX:100,clientY:100,value:.5},{});
 assert.ok(Math.abs(v-.7)<1e-8);
});
