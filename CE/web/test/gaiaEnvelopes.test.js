import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';
import { applyEditableEnvelopes } from '../../../tools/scripts/gaia-panel/editable-envelopes.mjs';
import { applyEnvelopeViews } from '../../../tools/scripts/gaia-panel/envelope-views.mjs';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import { linkedEnvelopeStages, linkedEnvelopePoints, linkedEnvelopeDragValue, resolveLinkedEnvelope } from '../src/CE_Application/utils/linkedEnvelope.js';
const panel=buildGaiaPanel(), controls=flatControls(panel.controls);
const graphs=controls.filter(c=>c._children.Envelope?.stageSources);
test('envelope views reuse the full height inside unchanged tone sections and keep source IDs',()=>{
  const views=controls.filter(c=>/^tone\d\.(osc\.pitchEnv|filter\.env|amp\.env)\.view$/.test(c._children.Core.name));
  assert.equal(views.length,9);
  for(const view of views){
    const cfg=view._children.TabContainer,children=Object.values(view._children.Children._children);
    assert.deepEqual(cfg.pages.map(p=>p.label),['Fader','Graph']);
    assert.equal(cfg.pageIndex,0);
    assert.equal(view._children.Transform.height,229);
    const graph=children.find(c=>c._children.Envelope?.stageSources);
    assert.equal(graph._children.Core.tabPageId,'graph');
    assert.equal(graph._children.Transform.height,135);
    for(const link of Object.values(graph._children.Envelope.stageSources)){
      const fader=children.find(c=>c._children.Core.id===link.controlId);
      assert.equal(fader._children.Core.tabPageId,'fader');
      assert.equal(fader._children.Transform.height,114);
      assert.equal(fader._children.Transform.y,graph._children.Transform.y);
    }
  }
  const before=JSON.stringify(panel);applyEnvelopeViews(panel);assert.equal(JSON.stringify(panel),before);
});
test('nine native graphs link only their own tone faders, without duplicate MIDI bindings',()=>{
  assert.equal(graphs.length,9);
  for(const graph of graphs){
    assert.equal(graph._children.Core.controlType,'Envelope');
    assert.equal(graph._children.DeviceBindings.bindings.length,0);
    const tone=graph._children.Core.name.match(/^tone\d/)[0];
    const stages=linkedEnvelopeStages(graph);
    assert.equal(stages.length,graph._children.Core.name.includes('pitchEnv')?2:4);
    for(const stage of stages){
      const link=graph._children.Envelope.stageSources[stage];
      const source=controls.find(c=>c._children.Core.id===link.controlId);
      assert.ok(source._children.Core.name.startsWith(tone+'.'));
      assert.equal(source._children.DeviceBindings.bindings.length,1);
      assert.equal(link.min,0);assert.equal(link.max,127);
    }
  }
  const before=JSON.stringify(panel);applyEditableEnvelopes(panel);assert.equal(JSON.stringify(panel),before);
});
test('stage mapping spans every parameter independently, including all-zero/all-maximum envelopes',()=>{
  for(const graph of graphs)for(const v of [0,1,63,126,127]){
    const stages=linkedEnvelopeStages(graph), values=Object.fromEntries(stages.map(s=>[s,v]));
    const points=linkedEnvelopePoints(graph,values);
    assert.equal(points.length,stages.length+1);
    points.forEach((p,i)=>{assert.ok(p.x>=0 && p.x<=1+1e-12);assert.ok(p.y>=0&&p.y<=1);if(i)assert.ok(p.x>points[i-1].x,'even zero values remain selectable');});
    const cfg=graph._children.Envelope.stageSources;
    assert.equal(points[1].y,1,'peak is fixed');
    assert.equal(points.at(-1).y,0,'end is fixed');
    if(cfg.sustain)assert.equal(points[2].y,points[3].y,'decay and sustain share the same level');
    for(const stage of stages){
      const geom={w:180,h:46};const span=cfg.sustain?.175:.35;
      assert.equal(linkedEnvelopeDragValue(graph,stage,0,stage==='sustain'?0:geom.w*span,stage==='sustain'?-geom.h:0,geom),127);
      assert.equal(linkedEnvelopeDragValue(graph,stage,127,stage==='sustain'?0:-geom.w*span,stage==='sustain'?geom.h:0,geom),0);
      const fine=linkedEnvelopeDragValue(graph,stage,0,geom.w*span,-geom.h,geom,true);
      assert.equal(fine,13);
    }
  }
});
test('design-canvas resolution follows current faders, not cached link defaults, and preview follows sessions',()=>{
  const p=structuredClone(panel), cs=flatControls(p.controls), graph=cs.find(c=>c._children.Envelope?.stageSources?.sustain);
  const links=graph._children.Envelope.stageSources;
  const control=stage=>cs.find(c=>c._children.Core.id===links[stage].controlId);
  for(const stage of ['attack','decay','sustain','release'])control(stage)._children.ValueChannels._children.value.currentValue=0;
  const before=resolveLinkedEnvelope(graph,p.controls)._children.Envelope;
  control('attack')._children.ValueChannels._children.value.currentValue=127;
  control('sustain')._children.ValueChannels._children.value.currentValue=93;
  const after=resolveLinkedEnvelope(graph,p.controls)._children.Envelope;
  assert.ok(after.points[1].x>before.points[1].x);
  assert.equal(after.points[2].y,93/127);assert.equal(after.points[3].y,93/127);
  const live=resolveLinkedEnvelope(graph,p.controls,{[links.sustain.controlId]:{customValues:{value:36}}})._children.Envelope;
  assert.equal(live.points[2].y,36/127);assert.equal(live.points[3].y,36/127);
  const hold=resolveLinkedEnvelope(graph,p.controls,{},.25)._children.Envelope;
  assert.ok(hold.points[3].x>after.points[3].x);assert.equal(hold.points[3].y,after.points[3].y);
  assert.deepEqual(hold.__stageValues,after.__stageValues,'hold changes no MIDI stage value');
});
test('moving attack shifts later geometry but never steals another stage time',()=>{
  const graph=graphs.find(g=>g._children.Envelope.stageSources.sustain);
  const a=linkedEnvelopePoints(graph,{attack:0,decay:75,sustain:88,release:116});
  const b=linkedEnvelopePoints(graph,{attack:127,decay:75,sustain:88,release:116});
  assert.ok(b[1].x>a[1].x);
  assert.ok(Math.abs((a[2].x-a[1].x)-(b[2].x-b[1].x))<1e-12);
  assert.ok(Math.abs((a[4].x-a[3].x)-(b[4].x-b[3].x))<1e-12);
  assert.equal(a[3].y,b[3].y);
});
