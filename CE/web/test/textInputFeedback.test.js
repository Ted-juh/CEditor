import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import PanelPreviewSurface from '../src/CE_Application/editor/PanelPreviewSurface.svelte';
import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { panelPreviewSessions, createInteractionPreviewSession } from '../src/CE_Application/stores/interactionPreview.js';
import { syncDeviceParameterToPanelPreview } from '../src/CE_Application/utils/deviceBindingSync.js';
for (const flow of ['twoWay', 'input', 'display']) {
  test('TextInput renders device feedback with '+flow+' flow, including empty text', () => {
    const control = {_children:{Core:{id:'text',name:'text',controlType:'TextInput'},Transform:{x:0,y:0,width:200,height:40},Behavior:{family:'text',defaultValue:'Original',valueFlow:flow},Text:{content:'Placeholder'},DeviceBindings:{bindings:[{kind:'deviceParameter',port:'text',deviceRole:'synth',parameterId:'name'}]}}};
    const panel={id:'feedback',width:300,height:100,controls:[control],layers:[]};
    panels.set([panel]);activePanelId.set(panel.id);activeEditorTab.set({type:'panel',id:panel.id});
    panelPreviewSessions.set({text:createInteractionPreviewSession(control)});
    for (const reply of ['ALPHA','']) {
      syncDeviceParameterToPanelPreview('synth','name',reply);
      const body=render(PanelPreviewSurface,{props:{panel,scale:1,bgLayers:{},gridStyle:''}}).body;
      const input=body.match(/<input[^>]*class="[^"]*canvas-text-input[^"]*"[^>]*>/)?.[0];
      assert.ok(input);
      assert.ok(input.includes('value="'+(flow==='input'?'Original':reply)+'"'),input);
    }
  });
}
