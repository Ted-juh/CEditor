import test from 'node:test';
import assert from 'node:assert/strict';
import { setRuntimeHost, setLiveEnabled, scriptApiForTesting, runPreviewSessionsForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { panelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
for (const mode of ['range','band']) for (const handle of (mode==='range'?['start','end']:['start','current','end'])) {
 test(mode+' '+handle+' emits numeric movement and commit',async()=>{
 const c=createControl('Slider',{name:'slider'});
 Object.assign(c._children.Behavior,{valueMode:mode,min:-10,max:10,allowHandleCross:true,emitValueChange:true,emitValueCommit:true});
 const id=c._children.Core.id;
 setRuntimeHost({panel:{id:'p-'+mode+handle,controls:[c],scripting:{modules:['ce.core']}},scripts:[]}); setLiveEnabled(true);
 try {
 const base={checked:false,activeHandle:handle};
 panelPreviewSessions.set({[id]:base}); await runPreviewSessionsForTesting();
 const seen=[];const api=scriptApiForTesting('','slider-test');
 api.on('slider','onValueChange',v=>seen.push(['move',v]));
 api.on('slider','onValueChanged',v=>seen.push(['commit',v]));
 panelPreviewSessions.set({[id]:{...base,dragging:true,[handle+'ValueOverrideEnabled']:true,[handle+'ValueOverride']:7.5}}); await runPreviewSessionsForTesting();
 panelPreviewSessions.set({[id]:{...base,dragging:false,[handle+'ValueOverrideEnabled']:true,[handle+'ValueOverride']:7.5}}); await runPreviewSessionsForTesting();
 await new Promise(setImmediate);
 assert.deepEqual(seen,[['move',7.5],['commit',7.5]]);
 } finally {setRuntimeHost(null);panelPreviewSessions.set({});}
 });
}
