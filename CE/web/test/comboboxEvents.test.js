import test from 'node:test';
import assert from 'node:assert/strict';
import {get} from 'svelte/store';
import {createControl} from '../src/CE_Application/models/componentTypes.js';
import {liveValuePatch,readLiveValue} from '../src/CE_Application/scripting/liveValue.js';
import {setRuntimeHost,setLiveEnabled,scriptApiForTesting,runPreviewSessionsForTesting,resetScriptStateForTesting} from '../src/CE_Application/scripting/panelRuntime.js';
import {panelPreviewSessions,createInteractionPreviewSession} from '../src/CE_Application/stores/interactionPreview.js';
test('Combobox native selections emit after a script writes and restores its value',async()=>{
 const c=createControl('Combobox',{name:'subject'}),id=c._children.Core.id;
 c._children.Behavior.emitValueChange=true;
 panelPreviewSessions.set({[id]:createInteractionPreviewSession(c)});
 setRuntimeHost({panel:{id:'selection-events',controls:[c],scripting:{modules:['ce.core']}},scripts:[],readValue(control){return readLiveValue(get(panelPreviewSessions),control);},writeValue(control,path,value){panelPreviewSessions.update(s=>({...s,[id]:{...s[id],...liveValuePatch(value,control,s)}}));return true;}});
 setLiveEnabled(true);
 try{
  const api=scriptApiForTesting('','selection-events');
  for(const value of ['option_3','option_4','option_1']) api.set('subject.value',value);
  await runPreviewSessionsForTesting();
  const seen=[];
  api.on('subject','onValueChange',v=>seen.push(['change',v]));
  api.on('subject','onValueChanged',v=>seen.push(['commit',v]));
  for(const value of ['option_4','option_3','option_1']){
   panelPreviewSessions.update(s=>({...s,[id]:{...s[id],valueOverrideEnabled:true,valueOverride:value,checked:false,mixed:false,pressed:false}}));
   await runPreviewSessionsForTesting();
   assert.equal(api.get('subject.value'),value);
  }
  await new Promise(setImmediate);
  assert.deepEqual(seen,['option_4','option_3','option_1'].flatMap(v=>[['change',v],['commit',v]]));
  await runPreviewSessionsForTesting();
  assert.equal(seen.length,6,'unchanged selection emits no duplicate');
 }finally{resetScriptStateForTesting();setRuntimeHost(null);panelPreviewSessions.set({});}
});
