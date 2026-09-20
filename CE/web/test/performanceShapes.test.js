import test from 'node:test';
import assert from 'node:assert/strict';
import { PERFORMANCE_FORMS, performanceContains, performancePath } from '../src/CE_Application/utils/performanceShapes.js';
import { drumGeometry, padHit, padRect } from '../src/CE_Application/utils/drumPadLayout.js';
import { cellAtPoint, cellRect, sequencerGeometry } from '../src/CE_Application/utils/stepSequencerLayout.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { ADDITIONAL_DIRECTIONS } from '../src/CE_Application/models/additionalControlSets.js';
import { createControlSetStarter } from '../src/CE_Application/models/controlSetStarter.js';
import { serializePanel, deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { resolveNumberPartZone } from '../src/CE_Application/utils/rangeBehavior.js';
import { resolvePartPixelRect } from '../src/CE_Application/utils/customComponentLayout.js';

test('shaped pads hit their visible centres, reject outside points and keep pad identity in each arrangement',()=>{
  for(const [form] of PERFORMANCE_FORMS) for(const layout of ['grid','stagger','orbit']) for(const [rows,cols] of [[2,2],[3,5],[8,8]]) {
    const geom=drumGeometry(300,260,rows,cols,8,0,5,{padForm:form,padLayout:layout});
    for(const origin of ['topLeft','bottomLeft']) for(let i=0;i<rows*cols;i++) {
      const r=padRect(geom,i,origin);
      assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=300&&r.y+r.h<=260,`${form}/${layout}/${i} fits`);
      assert.equal(padHit(geom,r.x+r.w*.5,r.y+r.h*.5,origin),i,`${form}/${layout}/${i} centre`);
      assert.ok(!/NaN|Infinity/.test(performancePath(form,r.w,r.h)));
      if(layout==='orbit') for(let j=0;j<i;j++) {
        const other=padRect(geom,j,origin);
        assert.ok(r.x+r.w<=other.x || other.x+other.w<=r.x || r.y+r.h<=other.y || other.y+other.h<=r.y,'orbital pads do not overlap');
      }
    }
    assert.equal(padHit(geom,-2,25),-1);
  }
  for(const [form] of PERFORMANCE_FORMS.filter(([f])=>f!=='rect')) assert.equal(performanceContains(form,.01,.01),false,`${form}: empty corner is not a pad`);
});
test('corner-zone pads retain the complete four-corner grid regardless of the selected design',()=>{
  const g=drumGeometry(228,214,2,2,8,0,5,{zones:true,padForm:'diamond',padLayout:'orbit'});
  const r=padRect(g,0);
  assert.equal(g.form,'rect');assert.equal(g.layout,'grid');
  assert.equal(padHit(g,r.x+1,r.y+1),0);
});
test('sequencer cell hits follow the rendered outline without moving track or step identity',()=>{
  for(const [form] of PERFORMANCE_FORMS) {
    const c=createControl('StepSequencer',{StepSequencer:{cellForm:form}}),g=sequencerGeometry(500,150,c);
    for(let t=0;t<g.tracks;t++) for(let s=0;s<g.steps;s++) {
      const r=cellRect(g,t,s);
      assert.deepEqual(cellAtPoint(g,r.x+r.w/2,r.y+r.h/2),{step:s,trackIndex:t});
      if(form!=='rect')assert.equal(cellAtPoint(g,r.x+.01,r.y+.01),null);
    }
  }
});
test('all additional starters preserve distinct pad and number geometry, rhythm, and note assignments across save/load',()=>{
  const layouts=new Set();
  for(const d of ADDITIONAL_DIRECTIONS) {
    const p=createControlSetStarter(d.id), restored=deserializePanel(serializePanel(p));
    const find=(panel,type)=>panel.controls.find(c=>c._children.Core.controlType===type);
    const pads=find(restored,'DrumPads');
    assert.equal(pads._children.DrumPads.padForm,d.padForm);assert.equal(pads._children.DrumPads.padLayout,d.padLayout);
    for(const type of ['Number','DrumPads','StepSequencer']) {
      const a=find(p,type),b=find(restored,type);
      assert.deepEqual(b._children.Behavior,a._children.Behavior);
    }
    const seq=find(restored,'StepSequencer')._children.StepSequencer;
    assert.equal(seq.running,false);assert.equal(seq.steps,8);assert.equal(Object.keys(seq.pattern).length,6);
    const parts=find(restored,'Number')._children.Parts._children;
    const number=find(restored,'Number'),t=number._children.Transform;
    for(const name of ['decrement','increment','valueField']) {
      const r=resolvePartPixelRect(parts[name]._children.Layout,t.width,t.height);
      // A zoomed canvas must hit the same control part as its unscaled renderer.
      assert.equal(resolveNumberPartZone(number,{left:17,top:29,width:t.width*2,height:t.height*2},17+(r.x+r.width/2)*2,29+(r.y+r.height/2)*2),name==='valueField'?'value':name);
    }
    layouts.add(JSON.stringify(Object.values(parts).map(p=>p._children.Layout)));
    assert.equal(parts.decrement.role,'decrement');assert.equal(parts.increment.role,'increment');
  }
  assert.equal(layouts.size,12);
});
