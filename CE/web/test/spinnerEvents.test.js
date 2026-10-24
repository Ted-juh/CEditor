import test from 'node:test';
import assert from 'node:assert/strict';
import { setRuntimeHost, setLiveEnabled, scriptApiForTesting, runPreviewSessionsForTesting, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { panelPreviewSessions, createInteractionPreviewSession } from '../src/CE_Application/stores/interactionPreview.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { liveValuePatch } from '../src/CE_Application/scripting/liveValue.js';
for (const dragging of [false, true]) test('Spinner events follow user input after a script write: dragging='+dragging, async()=>{
 const c=createControl('Number',{name:'spinner'});Object.assign(c._children.Behavior,{min:-10,max:10,valueType:'float',step:0.25});const id=c._children.Core.id;
 setRuntimeHost({panel:{id:'spinner-events',controls:[c],scripting:{modules:['ce.core']}},scripts:[]});setLiveEnabled(true);
 try {
  const base={...createInteractionPreviewSession(c),...liveValuePatch(2,c)};
  panelPreviewSessions.set({[id]:base});await runPreviewSessionsForTesting();
  const seen=[];const api=scriptApiForTesting('','spinner-events');
  api.on('spinner','onValueChange',v=>seen.push(['move',v]));api.on('spinner','onValueChanged',v=>seen.push(['commit',v]));
  panelPreviewSessions.set({[id]:{...base,valueOverride:2.25,dragging}});await runPreviewSessionsForTesting();
  if(dragging){panelPreviewSessions.update(s=>({...s,[id]:{...s[id],dragging:false}}));await runPreviewSessionsForTesting();}
  await new Promise(setImmediate);
  assert.deepEqual(seen,[['move',2.25],['commit',2.25]]);
 }finally{resetScriptStateForTesting();setRuntimeHost(null);panelPreviewSessions.set({});}
});
